"""La muestra (JSON de ``muestra.py``) como SQL sobre ``sevarti.atributos_sujeto``: los niños que cumplen, sin leer
las mediciones. Todo valor del usuario va como parámetro enlazado; solo se pegan nombres de parámetros generados aquí.

* ``fragmento``: una subconsulta ``SELECT sujeto ...`` con sus parámetros, para usar como ``WHERE sujeto IN (...)``
  o ``WITH muestra AS (...)``. Entiende los filtros con ``cuando`` ``primera`` o ``ultima`` y el bloque ``tiempo``.
* ``ids_muestra``: la lista final de niños. Lo que el SQL no sabe (``alguna``, ``etapa:<x>``) lo resuelve el motor en
  memoria sobre los niños que ya pasaron el SQL, y el muestreo estratificado se aplica al final, igual que
  ``muestra.aplicar``: el resultado es el mismo en los dos caminos.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

import pandas as pd
from sqlalchemy import Connection, Engine, text
from sqlalchemy.orm import Session

from maia_comun import muestra as M
from maia_comun.sevarti_db import leer_de_db
from sevarti import contrato as SV

_ARR_NUM = 'CAST(:{} AS float8[])'
_ARR_TXT = 'CAST(:{} AS text[])'


@dataclass(frozen=True)
class Fragmento:
    sql: str
    params: dict = field(default_factory=dict)


def entrada_en_sql(e: dict) -> bool:
    """Si el filtro se resuelve solo con ``atributos_sujeto`` (``primera``/``ultima``) o con la tabla de niños."""
    return e['variable'] in M.VIRTUALES or (e.get('cuando') or 'primera') in ('primera', 'ultima')


def _cond_valor(e: dict, a: str, col_num: str, p: str, params: dict) -> str:
    """Condición sobre ``valor``/``valor_num`` del alias ``a`` (``col_num``: la columna numérica a comparar)."""
    tipo, valores = e['tipo'], e['valores']
    if tipo == 'numero':
        partes = []
        for nombre, v, op in (('lo', valores[0], '>='), ('hi', valores[1], '<=')):
            if v is not None:
                params[f'{p}_{nombre}'] = float(v)
                partes.append(f'{col_num} {op} :{p}_{nombre}')
        return ' AND '.join(partes)
    if tipo == 'si_no':
        nums, strs = M.SI if M.respuesta_si_no(valores) else M.NO
        nums, strs, bajo = sorted(nums), sorted(strs), True
    else:
        nums, strs = M.partir_valores(valores)
        bajo = False
    params[f'{p}_n'], params[f'{p}_s'] = nums, strs
    texto = f'lower({a}.valor)' if bajo else f'{a}.valor'
    return f'({col_num} = ANY({_ARR_NUM.format(p + "_n")}) OR {texto} = ANY({_ARR_TXT.format(p + "_s")}))'


def _cond_filtro(e: dict, i: int, p: str, params: dict) -> str:
    v = e['variable']
    q = f'{p}_y{i}'
    if v == 'sede':
        textos = [M.canonico(x) if M.es_numero(x) else str(x) for x in e['valores']]
        params[f'{q}_s'] = list(dict.fromkeys(textos + [str(x) for x in e['valores']]))
        return f's.grupo = ANY({_ARR_TXT.format(q + "_s")})'
    if v == 'eg_semanas':
        return _cond_valor(e, 's', 's.eg_semanas', q, params)
    nombre = v + (M.SUFIJO_ULTIMA if e.get('cuando') == 'ultima' else '')
    params[f'{q}_v'] = nombre
    return (f'EXISTS (SELECT 1 FROM sevarti.atributos_sujeto a WHERE a.corte_id = s.corte_id AND a.sujeto = s.sujeto '
            f'AND a.variable = :{q}_v AND {_cond_valor(e, "a", "a.valor_num", q, params)})')


def _cond_tiempo(t: dict, p: str, params: dict) -> str:
    """Rango de fechas del bloque ``tiempo``; la fecha del corte sale de ``sevarti.cortes``."""
    q = f'{p}_t'
    if t['modo'] == 'ultimos_meses':
        params[f'{q}_m'] = int(t.get('meses', t.get('desde')))
        corte = f'(SELECT fecha_corte FROM sevarti.cortes WHERE id = :{p}_corte)'
        d = f'CAST({corte} - make_interval(months => :{q}_m) AS date)'
        h = corte
        d_y, h_y = f'EXTRACT(YEAR FROM {d})', f'EXTRACT(YEAR FROM {h})'
    else:
        desde, hasta = M.parse_fecha(t.get('desde')), M.parse_fecha(t.get('hasta'), fin=True)
        d = h = d_y = h_y = None
        if desde is not None:
            params[f'{q}_d'], params[f'{q}_dy'] = desde.date(), desde.year
            d, d_y = f':{q}_d', f':{q}_dy'
        if hasta is not None:
            params[f'{q}_h'], params[f'{q}_hy'] = hasta.date(), hasta.year
            h, h_y = f':{q}_h', f':{q}_hy'

    def rango(col: str, lo: str | None, hi: str | None) -> str:
        return ' AND '.join(([f'{col} >= {lo}'] if lo else []) + ([f'{col} <= {hi}'] if hi else []))

    campo = t['fecha']
    if campo == 'fecha_visita':
        return ('EXISTS (SELECT 1 FROM sevarti.mediciones m WHERE m.corte_id = s.corte_id AND m.sujeto = s.sujeto '
                f'AND {rango("m.fecha", d, h)})')
    if campo == 'anio_nacimiento':
        return rango('COALESCE(s.anio_nacimiento, EXTRACT(YEAR FROM s.fecha_nacimiento))', d_y, h_y)
    return (f'((s.fecha_nacimiento IS NOT NULL AND {rango("s.fecha_nacimiento", d, h)}) '
            f'OR (s.fecha_nacimiento IS NULL AND {rango("s.anio_nacimiento", d_y, h_y)}))')


def fragmento(muestra: dict, corte_id: int, prefijo: str = 'mu', parcial: bool = False) -> Fragmento:
    """``SELECT s.sujeto FROM sevarti.sujetos s WHERE ...`` con los filtros ``y`` y ``tiempo`` de la muestra.

    El muestreo no entra (necesita elegir al azar entre los que cumplen: ver ``ids_muestra``). Con ``parcial`` se
    omiten los filtros que el SQL no resuelve (``alguna``, ``etapa:<x>``); sin ``parcial`` son un error. Los
    parámetros llevan ``prefijo`` para poder juntar varios fragmentos en una misma consulta."""
    m = M.normalizar(muestra)
    params: dict = {f'{prefijo}_corte': corte_id}
    condiciones = [f's.corte_id = :{prefijo}_corte']
    for i, e in enumerate(m['y']):
        if not entrada_en_sql(e):
            if parcial:
                continue
            raise ValueError(f'El filtro de "{e["variable"]}" con cuando={e.get("cuando")!r} no se resuelve en SQL: '
                             'use ids_muestra, que lo completa con el motor en memoria')
        condiciones.append(_cond_filtro(e, i, prefijo, params))
    if m['tiempo']:
        condiciones.append(_cond_tiempo(m['tiempo'], prefijo, params))
    return Fragmento('SELECT s.sujeto FROM sevarti.sujetos s WHERE ' + ' AND '.join(f'({c})' for c in condiciones),
                     params)


def esquema_de_db(s: Session | Connection, corte_id: int) -> pd.DataFrame:
    """El esquema del corte como lo lee el contrato SEVARTI."""
    filas = s.execute(text('SELECT variable, datos FROM sevarti.esquema WHERE corte_id = :c ORDER BY variable'),
                      {'c': corte_id}).all()
    df = pd.DataFrame([{'variable': v, **(d if isinstance(d, dict) else json.loads(d))} for v, d in filas])
    for c in ('rango_min', 'rango_max', 'tolerancia'):
        if c in df:
            df[c] = pd.to_numeric(df[c], errors='coerce')
    return SV.normalizar_esquema(df)


def _motor_de(s: Session | Connection) -> Engine:
    b = s.get_bind() if isinstance(s, Session) else s
    return b.engine if isinstance(b, Connection) else b


def ids_muestra(s: Session | Connection, corte_id: int, muestra: dict, muestreo: bool = True) -> list[str]:
    """Los niños de la muestra en el corte, ordenados; el mismo resultado que ``muestra.ids`` sobre el corte entero.
    Lanza ``MuestraInvalida`` si la muestra no cumple la gramática."""
    m = M.exigir(muestra, esquema_de_db(s, corte_id))
    f = fragmento(m, corte_id, parcial=True)
    ids = sorted(r[0] for r in s.execute(text(f.sql), f.params))
    pendientes = [e for e in m['y'] if not entrada_en_sql(e)]
    if pendientes and ids:   # alguna / etapa:<x>: se lee solo a esos niños y se resuelve en memoria
        sev = leer_de_db(_motor_de(s), corte_id, ids)
        ids = M.ids(sev, {'version': M.VERSION, 'y': pendientes}, muestreo=False)
    mu = m['muestreo']
    if muestreo and mu.get('modo') == 'estratificado' and ids:
        cat = _categorias(s, corte_id, mu['por'], ids)
        ids = M.muestrear(cat, mu['maximo_por_categoria'], mu.get('semilla', 0))
    return sorted(ids)


def _categorias(s: Session | Connection, corte_id: int, por: str, ids: list[str]) -> pd.Series:
    if por == 'sede':
        filas = s.execute(text('SELECT sujeto, grupo FROM sevarti.sujetos WHERE corte_id = :c '
                               'AND sujeto = ANY(:i)'), {'c': corte_id, 'i': ids}).all()
        cats = {suj: M.canonico(g) for suj, g in filas if g is not None}
    else:
        filas = s.execute(text('SELECT sujeto, valor, valor_num FROM sevarti.atributos_sujeto WHERE corte_id = :c '
                               'AND variable = :v AND sujeto = ANY(:i)'), {'c': corte_id, 'v': por, 'i': ids}).all()
        cats = {suj: M.canonico(valor, num) for suj, valor, num in filas}
    return pd.Series({suj: cats.get(suj, M.SIN_DATO) for suj in sorted(ids)}, dtype=object)
