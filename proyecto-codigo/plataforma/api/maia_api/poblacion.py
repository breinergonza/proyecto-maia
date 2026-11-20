"""Lo que comparten /muestras y /exploracion: el corte con el que se trabaja, los niños de una muestra, las facetas
(conteos por opción) y el mínimo de 20 niños y el redondeo del visualizador (D46). Todo se calcula en Postgres sobre
``sevarti.atributos_sujeto``; no se leen las mediciones."""
from __future__ import annotations

import time
from collections.abc import Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from maia_api.consultas import etapas
from maia_comun import muestra as M
from maia_comun import perfiles as PF
from maia_comun.filtros_sql import Fragmento, entrada_en_sql, esquema_de_db, fragmento, ids_muestra, lecturas
from maia_comun.modelos_db import Corte
from maia_comun.sevarti_db import corte_vigente
from sevarti import contrato as SV

#: Variables que se ofrecen como filtro rápido además de las de rol basal. Si el Diccionario marca alguna variable con
#: «Usar como filtro» (parche 11 del núcleo), decide ella y esta constante solo aporta las del niño (sede, edad
#: gestacional); sin marcas, vale tal cual.
FACETAS_POR_DEFECTO = ('sede', 'ern_sexo', 'eg_categoria', 'eg_semanas', 'ern_lubchencofenton')
VARIABLES_SEXO = ('ern_sexo', 'sexo')
MIN_NINOS = 20          # D46: con menos niños no se muestran cifras ni se guarda un filtro
MAX_OPCIONES = 30       # una variable con más opciones distintas es texto libre, no una faceta
TOPE_REDONDEO = 100     # D46: para el rol visualizador, los conteos menores se redondean a múltiplos de 5
TIPOS_FILTRABLES = {'categorical': 'lista', 'boolean': 'si_no', 'numeric': 'numero'}
# categorías por semanas de gestación: (categoría, desde incluido, hasta excluido); cada una es una opción por sí sola
CATEGORIAS_EG = M.CATEGORIAS_EG
REGLAS = ('primera', 'ultima', 'alguna')   # D1; además ``etapa:<nombre>``
ETIQUETAS_REGLA = {'primera': 'Primera medición', 'ultima': 'Última medición', 'alguna': 'En alguna visita'}


def corte_actual(s: Session) -> Corte:
    c = corte_vigente(s)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Todavía no hay datos cargados para filtrar.')
    return c


def n_base(s: Session, corte_id: int) -> int:
    return s.execute(text('SELECT count(*) FROM sevarti.sujetos WHERE corte_id = :c'), {'c': corte_id}).scalar_one()


def ids_de(s: Session, corte_id: int, muestra: dict | None, muestreo: bool = True) -> list[str]:
    """Los niños de la muestra; una muestra mal armada es un 422 con todos sus problemas."""
    try:
        return ids_muestra(s, corte_id, muestra or {'version': M.VERSION}, muestreo=muestreo)
    except M.MuestraInvalida as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, ' '.join(e.errores)) from None


def sin_filtros(muestra: dict | None) -> bool:
    m = M.normalizar(muestra)
    return not m['y'] and not m['tiempo']


def proteger(n: int, redondear: bool = False) -> int:
    """D46: un conteo menor de 100 se redondea a múltiplos de 5 para quien solo consulta. Con niños (1 a 4) nunca
    baja a 0: sube a 5, porque un cero diría que no hay ninguno. Solo un cero verdadero queda en 0."""
    if not redondear or n >= TOPE_REDONDEO:
        return int(n)
    return max(5, int(n / 5 + 0.5) * 5) if n > 0 else 0


def cifra(n: int, redondear: bool = False) -> dict:
    """Un conteo de opción o de tramo: ``n``, con el redondeo del visualizador (D46)."""
    return {'n': proteger(n, redondear)}


# ---------------------------------------------------------------- qué variables se ofrecen

def sedes(s: Session, corte_id: int) -> list[str]:
    filas = s.execute(text('SELECT DISTINCT grupo FROM sevarti.sujetos WHERE corte_id = :c AND grupo IS NOT NULL'),
                      {'c': corte_id}).all()
    return sorted((M.canonico(g) for (g,) in filas), key=lambda x: (len(x), x))


def _marcada(fila: dict) -> bool:
    """La marca «Usar como filtro» del Diccionario (D35), si el corte ya trae esa columna."""
    v = fila.get('usar_como_filtro')
    return str(v).strip().lower() in ('1', '1.0', 'true', 'si', 'sí', 'x', 'verdadero') if v is not None else False


def _filtrable(filas: dict, v: str) -> bool:
    return v in M.VIRTUALES or (v in filas and filas[v]['tipo'] in TIPOS_FILTRABLES)


def elegir_facetas(esquema: pd.DataFrame, hay_sedes: bool, extra: Sequence[str] = ()) -> list[str]:
    """Las variables que se ofrecen con sus conteos: las de ``FACETAS_POR_DEFECTO`` que existan, las de rol basal y
    las marcadas «usar como filtro» en el Diccionario (D35, también las de medición) que se puedan filtrar, y las
    ``extra`` que se pidieron (las que ya están en el filtro o que se agregaron). ``sede`` solo si hay más de un grupo."""
    filas = {str(r['variable']): r for r in esquema.to_dict('records')}
    marcadas = [v for v, f in filas.items() if f['tipo'] in TIPOS_FILTRABLES and _marcada(f)]
    if marcadas:   # el Diccionario decide las variables (D35); la sede y la edad gestacional son del niño y siempre van
        elegidas = [v for v in FACETAS_POR_DEFECTO if v in M.VIRTUALES and (v != 'sede' or hay_sedes)]
        elegidas += [v for v in marcadas if v not in elegidas]
    else:           # ninguna marcada (un corte anterior a la columna): las de siempre
        elegidas = [v for v in FACETAS_POR_DEFECTO if (v != 'sede' or hay_sedes) and _filtrable(filas, v)]
        elegidas += [v for v, f in filas.items() if v not in elegidas and f['tipo'] in TIPOS_FILTRABLES
                     and (f['rol'] == 'basal' or _marcada(f))]
    elegidas += [v for v in dict.fromkeys(extra) if v not in elegidas and (v != 'sede' or hay_sedes) and _filtrable(filas, v)]
    return elegidas


def etiqueta_de(filas: dict, v: str) -> str:
    if v in M.VIRTUALES:
        return M.VIRTUALES[v][1]
    if v == PF.VARIABLE_LUBCHENCO:
        return PF.ETIQUETA_VARIABLE_LUBCHENCO
    e = filas[v].get('etiqueta')
    return e if isinstance(e, str) and e.strip() else v.replace('_', ' ')


def etiquetas_de(esq: pd.DataFrame) -> dict[str, dict[float, str]]:
    """Las etiquetas de cada código del Diccionario; las de Lubchenco se muestran con su texto completo."""
    etiquetas = SV.etiquetas_categoria(esq)
    if PF.VARIABLE_LUBCHENCO in etiquetas:
        etiquetas[PF.VARIABLE_LUBCHENCO] = {k: PF.lubchenco_completo(e) for k, e in etiquetas[PF.VARIABLE_LUBCHENCO].items()}
    return etiquetas


def tipo_de(filas: dict, v: str) -> str:
    return 'lista' if v == 'sede' else M.VIRTUALES[v][0] if v in M.VIRTUALES else TIPOS_FILTRABLES[filas[v]['tipo']]


def regla_por_defecto(filas: dict, v: str) -> str | None:
    """La regla de lectura con que se estrena una variable (D1): ninguna para las de la ficha del niño, ``primera``
    para las basales y ``alguna`` para las que se miden en cada visita (el niño «tuvo» oxígeno en alguna)."""
    if v in M.VIRTUALES:
        return None
    return 'alguna' if filas[v].get('rol') == 'medicion' else 'primera'


def reglas_de(filas: dict, v: str) -> list[str]:
    """Las reglas de lectura que tiene sentido ofrecer: solo las variables que se miden en cada visita las eligen."""
    return [] if v in M.VIRTUALES or filas[v].get('rol') != 'medicion' else list(REGLAS)


def _opciones_de(s: Session, corte_id: int, filas: dict, etiquetas: dict, v: str, tipo: str) -> list[dict]:
    if v == 'sede':
        return [{'valor': g, 'etiqueta': g} for g in sedes(s, corte_id)]
    if v == 'eg_categoria':
        return [{'valor': c, 'etiqueta': PF.ETIQUETAS_EG[c], 'rango': [lo, hi]} for c, lo, hi in CATEGORIAS_EG]
    if tipo == 'si_no':
        return [{'valor': True, 'etiqueta': 'Sí'}, {'valor': False, 'etiqueta': 'No'}]
    if v in etiquetas:
        return [{'valor': int(k) if float(k).is_integer() else k, 'etiqueta': e} for k, e in etiquetas[v].items()]
    return []


def variables_ofrecidas(s: Session, corte_id: int) -> list[dict]:
    """Para el selector «+ Agregar variable»: tipo, opciones del diccionario y la regla ``cuando`` sugerida (con las
    ``reglas`` que se pueden elegir)."""
    esq = esquema_de_db(s, corte_id)
    filas = {str(r['variable']): r for r in esq.to_dict('records')}
    etiquetas = etiquetas_de(esq)
    salida = []
    for v in elegir_facetas(esq, len(sedes(s, corte_id)) > 1):
        tipo = tipo_de(filas, v)
        salida.append({'variable': v, 'etiqueta': etiqueta_de(filas, v), 'tipo': tipo,
                       'cuando': regla_por_defecto(filas, v), 'reglas': reglas_de(filas, v),
                       'opciones': _opciones_de(s, corte_id, filas, etiquetas, v, tipo)})
    return salida


def disponibles(esquema: pd.DataFrame, ofrecidas: Sequence[str]) -> list[dict]:
    """Las demás variables que se pueden agregar como filtro (sin conteos hasta que se agregan)."""
    filas = {str(r['variable']): r for r in esquema.to_dict('records')}
    return [{'variable': v, 'etiqueta': etiqueta_de(filas, v), 'tipo': tipo_de(filas, v),
             'cuando': regla_por_defecto(filas, v), 'reglas': reglas_de(filas, v)}
            for v in sorted(filas, key=lambda x: etiqueta_de(filas, x).lower())
            if v not in ofrecidas and filas[v]['tipo'] in TIPOS_FILTRABLES]


# ---------------------------------------------------------------- facetas

_FASES: ContextVar[dict | None] = ContextVar('fases_facetas', default=None)


@contextmanager
def _medir(fase: str):
    """Suma lo que tarda una consulta en ``tiempos`` (la misma cabecera ``Server-Timing`` de ``facetas``)."""
    t0 = time.perf_counter()
    try:
        yield
    finally:
        d = _FASES.get()
        if d is not None:
            d[fase] = round(d.get(fase, 0) + (time.perf_counter() - t0) * 1000, 1)


class _Reloj:
    """Cuánto tarda cada fase de ``facetas`` (se informa en la cabecera ``Server-Timing`` de la respuesta)."""
    def __init__(self, destino: dict[str, float] | None):
        self.destino, self.t = destino, time.perf_counter()

    def __call__(self, fase: str) -> None:
        ahora = time.perf_counter()
        if self.destino is not None:
            self.destino[fase] = round((ahora - self.t) * 1000, 1)
        self.t = ahora


@dataclass
class _Grupo:
    """Los niños que cumplen una muestra. Si todos sus filtros se resuelven en SQL se usa como subconsulta
    (``sujeto IN (...)``) y no se descargan ni se vuelven a enviar decenas de miles de ids a Postgres en cada faceta;
    si no (``alguna``/``etapa``), se cae a la lista de ids."""
    s: Session
    corte_id: int
    muestra: dict
    frag: Fragmento | None = None
    _ids: list[str] | None = field(default=None, repr=False)

    def __post_init__(self):
        if all(entrada_en_sql(e) for e in self.muestra['y']):
            self.frag = fragmento({**self.muestra, 'muestreo': {}}, self.corte_id, prefijo='g')

    def ids(self) -> list[str]:
        if self._ids is None:
            self._ids = ids_de(self.s, self.corte_id, self.muestra, muestreo=False)
        return self._ids

    def cond(self, col: str = 'sujeto') -> tuple[str, dict]:
        if self.frag is not None:
            return f'{col} IN ({self.frag.sql})', dict(self.frag.params)
        return f'{col} = ANY(:i)', {'i': self.ids()}

    def union(self, col: str) -> tuple[str, dict]:
        """``JOIN`` con el grupo: Postgres lo resuelve como un semi-join con hash. ``col IN (subconsulta)`` dentro de un
        ``FILTER`` se evalúa fila por fila y, con decenas de miles de niños, tarda segundos."""
        if self.frag is not None:
            return f'JOIN ({self.frag.sql}) g ON g.sujeto = {col}', dict(self.frag.params)
        return f'JOIN unnest(CAST(:i AS text[])) AS g(sujeto) ON g.sujeto = {col}', {'i': self.ids()}

    def n(self) -> int:
        if self.frag is not None:
            return self.s.execute(text(f'SELECT count(*) FROM ({self.frag.sql}) q'), self.frag.params).scalar_one()
        return len(self.ids())

def _lista_sede(s: Session, c: int, g: _Grupo) -> dict:
    union, p = g.union('u.sujeto')
    cuentan = dict(s.execute(text(f'SELECT u.grupo, count(*) FROM sevarti.sujetos u {union} '
                                  'WHERE u.corte_id = :c AND u.grupo IS NOT NULL GROUP BY u.grupo'), {'c': c, **p}).all())
    todas = [x for (x,) in s.execute(text('SELECT DISTINCT grupo FROM sevarti.sujetos WHERE corte_id = :c AND grupo IS NOT NULL'),
                                     {'c': c})]
    return {'opciones': sorted(({'valor': M.canonico(x), 'etiqueta': M.canonico(x), 'n': cuentan.get(x, 0)} for x in todas),
                               key=lambda o: (len(o['valor']), o['valor']))}


def _semanas(s: Session, c: int, g: _Grupo) -> list[float]:
    cond, p = g.cond('sujeto')
    return [float(eg) for (eg,) in s.execute(text('SELECT eg_semanas FROM sevarti.sujetos WHERE corte_id = :c '
                                                  f'AND {cond} AND eg_semanas IS NOT NULL'), {'c': c, **p})]


def _lista_eg(s: Session, c: int, g: _Grupo) -> dict:
    cuenta: dict[str, int] = {}
    for eg in _semanas(s, c, g):
        cat = M.categoria_eg(eg)
        cuenta[cat] = cuenta.get(cat, 0) + 1
    return {'opciones': [{'valor': cat, 'etiqueta': PF.ETIQUETAS_EG[cat], 'rango': [lo, hi], 'n': cuenta.get(cat, 0)}
                         for cat, lo, hi in CATEGORIAS_EG]}


def _conteos_en_lote(s: Session, c: int, g: _Grupo, nombres: Sequence[str]) -> dict[str, list[tuple]]:
    """Conteos por opción de las variables de lista de un mismo grupo, con dos lecturas de ``atributos_sujeto``:
    ``{nombre: [(valor, valor_num, n)]}``. Las opciones salen de todo el corte (una sin niños queda con ``n`` 0) y los
    conteos de un ``JOIN`` con el grupo. Las de texto libre (muchos valores distintos, que no son facetas) y las que no
    tienen datos no aparecen en el resultado."""
    if not nombres:
        return {}
    with _medir('cat_opciones'):
      opciones = s.execute(text(
        'SELECT variable, valor, valor_num FROM sevarti.atributos_sujeto WHERE corte_id = :c AND variable = ANY(:vs) '
        'AND variable IN (SELECT variable FROM sevarti.atributos_sujeto WHERE corte_id = :c AND variable = ANY(:vs) '
        '                 GROUP BY variable HAVING count(DISTINCT valor) <= :tope) '
        'GROUP BY variable, valor, valor_num'), {'c': c, 'vs': list(nombres), 'tope': 4 * MAX_OPCIONES}).all()
    validas = sorted({v for v, _, _ in opciones})
    union, p = g.union('a.sujeto')
    with _medir('cat_conteo'):
      cuentan = {(v, va, nu): n for v, va, nu, n in s.execute(text(
        f'SELECT a.variable, a.valor, a.valor_num, count(*) FROM sevarti.atributos_sujeto a {union} '
        'WHERE a.corte_id = :c AND a.variable = ANY(:vs) GROUP BY a.variable, a.valor, a.valor_num'),
        {'c': c, 'vs': validas, **p})} if validas else {}
    salida: dict[str, list[tuple]] = {}
    for v, va, nu in opciones:
        salida.setdefault(v, []).append((va, nu, cuentan.get((v, va, nu), 0)))
    return salida


def _numericas_en_lote(s: Session, c: int, g: _Grupo, nombres: Sequence[str]) -> dict[str, dict]:
    """Resumen (mínimo, máximo y histograma de ``MAX_BINS`` tramos) de cada variable numérica del grupo, calculado en
    Postgres: no se traen las decenas de miles de valores por variable. Mismos tramos que ``muestra._numerica``."""
    if not nombres:
        return {}
    cond, p = g.cond('a.sujeto')
    base = {'c': c, 'vs': list(nombres), **p}
    with _medir('num_limites'):
      lim = {v: (lo, hi, n) for v, lo, hi, n in s.execute(text(
        'SELECT a.variable, min(a.valor_num), max(a.valor_num), count(a.valor_num) FROM sevarti.atributos_sujeto a '
        f'WHERE a.corte_id = :c AND a.variable = ANY(:vs) AND a.valor_num IS NOT NULL AND {cond} GROUP BY a.variable'), base)}
    anchas = [v for v, (lo, hi, _) in lim.items() if lo != hi]
    bordes = {v: np.linspace(float(lim[v][0]), float(lim[v][1]), M.MAX_BINS + 1) for v in anchas}
    cuentas: dict[str, dict[int, int]] = {v: {} for v in anchas}
    if anchas:
        # los mismos bordes que ``np.histogram`` (tramos [a, b), el último cerrado): ``width_bucket`` con la lista de
        # bordes interiores da el tramo 0..N-1 y no se parte distinto un valor que cae justo en un borde
        params: dict = {**base, 'bv': anchas}
        casos = []
        for i, v in enumerate(anchas):
            params[f'v{i}'], params[f't{i}'] = v, [float(x) for x in bordes[v][1:-1]]
            casos.append(f'WHEN :v{i} THEN width_bucket(a.valor_num, CAST(:t{i} AS float8[]))')
        with _medir('num_histograma'):
          filas_h = list(s.execute(text(
                f'SELECT a.variable, CASE a.variable {" ".join(casos)} END AS cub, count(*) '
                'FROM sevarti.atributos_sujeto a '
                f'WHERE a.corte_id = :c AND a.variable = ANY(:bv) AND a.valor_num IS NOT NULL AND {cond} GROUP BY 1, 2'),
                params))
        for v, cub, n in filas_h:
            cuentas[v][int(cub) + 1] = n
    salida = {}
    for v in nombres:
        if v not in lim:
            salida[v] = {'n': 0, 'min': None, 'max': None, 'bins': []}
            continue
        lo, hi, n = float(lim[v][0]), float(lim[v][1]), int(lim[v][2])
        if lo == hi:
            salida[v] = {'n': n, 'min': lo, 'max': hi, 'bins': [{'desde': lo, 'hasta': hi, 'n': n}]}
            continue
        salida[v] = {'n': n, 'min': lo, 'max': hi, 'bins': [
            {'desde': float(a), 'hasta': float(b), 'n': cuentas[v].get(i + 1, 0)}
            for i, (a, b) in enumerate(zip(bordes[v][:-1], bordes[v][1:]))]}
    return salida


def _lista_atributo(s: Session, c: int, v: str, nombre: str, g: _Grupo, tipo: str, etiquetas: dict,
                    lect: pd.DataFrame | None = None, pre: list[tuple] | None = None) -> dict | None:
    """Conteos por opción. Con ``lect`` (las lecturas de ``alguna`` o de una etapa) se cuenta cada niño una vez por
    opción; sin ella, se cuenta en Postgres sobre ``atributos_sujeto`` (primera o última medición)."""
    if lect is None and pre is not None:
        filas = pre
    elif lect is None:
        filas = _conteos_en_lote(s, c, g, [nombre]).get(nombre, [])
    else:
        g = lect.drop_duplicates(['sujeto', 'txt']).groupby(['txt', 'num'], dropna=False).size()
        filas = [(txt, None if pd.isna(num) else float(num), int(n)) for (txt, num), n in g.items()]
    if tipo == 'si_no':
        si_no = {True: 0, False: 0}
        for valor, num, n in filas:
            r = M.respuesta_si_no([num if num is not None else valor])
            if r is not None:
                si_no[r] += n
        return {'opciones': [{'valor': True, 'etiqueta': 'Sí', 'n': si_no[True]},
                             {'valor': False, 'etiqueta': 'No', 'n': si_no[False]}]}
    cuenta: dict[str, int] = {}
    for valor, num, n in filas:
        k = M.canonico(valor, num)
        cuenta[k] = cuenta.get(k, 0) + n
    if len(cuenta) > MAX_OPCIONES:
        return None
    opciones = []
    for k in sorted(cuenta, key=lambda x: (len(x), x)):
        num = M.texto_numerico(k)
        entero = num is not None and num.is_integer()
        opciones.append({'valor': int(num) if entero else (num if num is not None else k),
                         'etiqueta': etiquetas.get(v, {}).get(num, k) if num is not None else k, 'n': cuenta[k]})
    return {'opciones': opciones}


def _resumen_de(r: dict, ninos: int, redondear: bool) -> dict:
    return {'cifra': cifra(ninos, redondear), 'min': r['min'], 'max': r['max'],
            'bins': [{'desde': b['desde'], 'hasta': b['hasta'], **cifra(b['n'], redondear)} for b in r['bins']]}


def _resumen_numerico(valores: list[float], ninos: int, redondear: bool) -> dict:
    return _resumen_de(M._numerica(pd.Series(valores, dtype=float)), ninos, redondear)


def _numerica(s: Session, c: int, nombre: str, g: _Grupo, redondear: bool, lect: pd.DataFrame | None = None,
              pre: dict | None = None) -> dict:
    if lect is not None:
        v = lect.dropna(subset=['num'])
        return _resumen_numerico(list(v.num.astype(float)), int(v.sujeto.nunique()), redondear)
    if pre is not None:
        return _resumen_de(pre, pre['n'], redondear)
    cond, p = g.cond('sujeto')
    valores = [x for (x,) in s.execute(text('SELECT valor_num FROM sevarti.atributos_sujeto WHERE corte_id = :c '
                                            f'AND variable = :v AND valor_num IS NOT NULL AND {cond}'),
                                       {'c': c, 'v': nombre, **p})]
    return _resumen_numerico(valores, len(valores), redondear)


def _regla_de(filas: dict, v: str, entrada: dict | None, pedidas: dict[str, str]) -> str | None:
    """La regla de lectura con que se cuenta ``v``: la del filtro puesto, la pedida al agregarla o la de siempre."""
    if v in M.VIRTUALES:
        return None
    return (entrada or {}).get('cuando') or pedidas.get(v) or regla_por_defecto(filas, v)


def facetas(s: Session, corte_id: int, muestra: dict | None, redondear: bool = False,
            extra: Sequence[dict] | None = None, tiempos: dict[str, float] | None = None) -> dict:
    """Conteos por opción de cada faceta aplicando los demás filtros pero no el propio (D35). Una opción con 1 a 4
    niños sale con su cifra; con ``redondear`` (visualizador) los conteos menores de 100 van de 5 en 5 (D46). Una
    opción sin niños sale con ``n`` 0: es un cero real. ``extra``: variables que se pidieron
    además de las de siempre, ``[{"variable", "cuando"}]``; las que ya están en el filtro se agregan solas."""
    marca = _Reloj(tiempos)
    _FASES.set(tiempos)
    esq = esquema_de_db(s, corte_id)
    marca('esquema')
    filas = {str(r['variable']): r for r in esq.to_dict('records')}
    etiquetas = etiquetas_de(esq)
    m = M.exigir(muestra or {'version': M.VERSION}, esq)
    por_variable = {e['variable']: e for e in m['y']}
    pedidas = {str(e['variable']): e['cuando'] for e in (extra or []) if e.get('variable') and e.get('cuando')}
    # edad gestacional en categorías y en semanas son la misma dimensión: elegir una no quita las opciones de la otra
    misma = {'eg_semanas': 'eg_categoria', 'eg_categoria': 'eg_semanas'}
    cache: dict[str | None, _Grupo] = {}

    def cumplen(excluidas: tuple[str, ...]) -> _Grupo:
        clave = excluidas or None
        if clave not in cache:
            y = [e for e in m['y'] if e['variable'] not in excluidas]
            cache[clave] = _Grupo(s, corte_id, {**m, 'y': y})
        return cache[clave]

    salida: dict[str, dict] = {}
    pedir = list(dict.fromkeys([*por_variable, *(str(e['variable']) for e in (extra or []) if e.get('variable'))]))
    marca('validar')
    elegidas = elegir_facetas(esq, len(sedes(s, corte_id)) > 1, pedir)
    marca('elegir')

    def excluidas_de(v: str) -> tuple[str, ...]:
        return ((v, misma[v]) if v in misma and (v in por_variable or misma[v] in por_variable) else
                (v,) if v in por_variable else ())

    # las variables que se leen de ``atributos_sujeto`` y comparten grupo de niños se cuentan en una sola consulta
    lote: dict[tuple[str, ...], list[str]] = {}
    lote_num: dict[tuple[str, ...], list[str]] = {}
    for v in elegidas:
        if v in M.VIRTUALES:
            continue
        cuando = _regla_de(filas, v, por_variable.get(v), pedidas)
        if cuando in (None, 'primera', 'ultima'):
            nombre = v + (M.SUFIJO_ULTIMA if cuando == 'ultima' else '')
            (lote_num if tipo_de(filas, v) == 'numero' else lote).setdefault(excluidas_de(v), []).append(nombre)
    precargado = {k: _conteos_en_lote(s, corte_id, cumplen(k), nombres) for k, nombres in lote.items()}
    precargado_num = {k: _numericas_en_lote(s, corte_id, cumplen(k), nombres) for k, nombres in lote_num.items()}
    marca('lote')
    for v in elegidas:
        ids = cumplen(excluidas_de(v))
        tipo = tipo_de(filas, v)
        cuando = _regla_de(filas, v, por_variable.get(v), pedidas)
        nombre = v + (M.SUFIJO_ULTIMA if cuando == 'ultima' else '')
        lect = None
        if cuando not in (None, 'primera', 'ultima'):   # alguna / etapa:<x>: no están en atributos_sujeto
            if v not in por_variable and v not in pedidas:
                # Leer las mediciones de cada variable «alguna» (millones de filas por 60.000 niños) dentro de esta misma
                # petición la deja pendiente minutos. Quedan en ``disponibles``: se cuentan al agregarlas al filtro.
                continue
            try:
                lect = lecturas(s, corte_id, v, cuando, ids.ids())
            except M.MuestraInvalida as e:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, ' '.join(e.errores)) from None
        if v == 'sede':
            r = _lista_sede(s, corte_id, ids)
        elif v == 'eg_categoria':
            r = _lista_eg(s, corte_id, ids)
        elif v == 'eg_semanas':
            sem = _semanas(s, corte_id, ids)
            r = _resumen_numerico(sem, len(sem), redondear)
        elif tipo == 'numero':
            r = _numerica(s, corte_id, nombre, ids, redondear, lect, precargado_num.get(excluidas_de(v), {}).get(nombre))
        else:
            pre = precargado.get(excluidas_de(v), {}).get(nombre) if lect is None else None
            if lect is None and pre is None:   # texto libre o sin datos: no es una faceta
                continue
            r = _lista_atributo(s, corte_id, v, nombre, ids, tipo, etiquetas, lect, pre)
            if r is None:
                continue
        for o in r.get('opciones', []):
            o.update(cifra(o['n'], redondear))
        salida[v] = {'etiqueta': etiqueta_de(filas, v), 'tipo': tipo, 'cuando': cuando, 'reglas': reglas_de(filas, v),
                     'destacada': v in FACETAS_POR_DEFECTO or (v in filas and _marcada(filas[v])), **r}
    marca('variables')
    n = cumplen(()).n()
    marca('n')
    resto = meta(s, corte_id, esq, filas, list(salida))
    marca('meta')
    return {'n': n, 'facetas': salida, **resto}


def meta(s: Session, corte_id: int, esq: pd.DataFrame, filas: dict, mostradas: list[str]) -> dict:
    """Lo que la pantalla necesita para el tiempo, el muestreo y la regla de lectura (D1, D34): qué fechas trae el
    corte, por qué categorías se puede estratificar, las visitas y las demás variables que se pueden agregar."""
    f = s.execute(text('SELECT count(fecha_nacimiento), min(fecha_nacimiento), max(fecha_nacimiento), '
                       'min(anio_nacimiento), max(anio_nacimiento) FROM sevarti.sujetos WHERE corte_id = :c'),
                  {'c': corte_id}).one()
    corte = s.get(Corte, corte_id)
    con_fecha = f[0] > 0
    campos = ([{'valor': 'fecha_nacimiento', 'etiqueta': 'Fecha de nacimiento'}] if con_fecha else []) \
        + [{'valor': 'anio_nacimiento', 'etiqueta': 'Año de nacimiento'}, {'valor': 'fecha_visita', 'etiqueta': 'Fecha de visita'}]
    anios = [x for x in (f[3], f[4], f[1].year if f[1] else None, f[2].year if f[2] else None) if x is not None]
    por = [{'valor': v, 'etiqueta': etiqueta_de(filas, v)} for v in mostradas
           if v not in ('eg_semanas',) and tipo_de(filas, v) == 'lista']
    return {
        'tiempo': {'campos': campos, 'defecto': campos[0]['valor'], 'hay_fecha_nacimiento': con_fecha,
                   'desde': min(anios) if anios else None, 'hasta': max(anios) if anios else None,
                   'corte': str(corte.fecha_corte) if corte else None},
        'muestreo': {'por': por},
        'etapas': [{'etapa': k, 'nombre': e['nombre']} for k, e in sorted(
            etapas(s, corte_id).items(), key=lambda kv: kv[1]['orden'])],
        'disponibles': disponibles(esq, mostradas),
    }


# ---------------------------------------------------------------- quiénes son (sexo, edad gestacional, Lubchenco, sede)

def categorias_por_nino(s: Session, corte_id: int) -> pd.DataFrame:
    """Una fila por niño del corte con su categoría de sexo, edad gestacional, Lubchenco y sede (nulo si falta)."""
    esq = esquema_de_db(s, corte_id)
    nombres = set(esq.variable.astype(str))
    base = pd.DataFrame(s.execute(text('SELECT sujeto, grupo, eg_semanas FROM sevarti.sujetos WHERE corte_id = :c'),
                                  {'c': corte_id}).all(), columns=['sujeto', 'grupo', 'eg_semanas']).set_index('sujeto')
    sexo_v = next((v for v in VARIABLES_SEXO if v in nombres), None)

    def primera(v: str | None) -> pd.DataFrame:
        if v is None:
            return pd.DataFrame(columns=['valor', 'valor_num'])
        f = s.execute(text('SELECT sujeto, valor, valor_num FROM sevarti.atributos_sujeto '
                           'WHERE corte_id = :c AND variable = :v'), {'c': corte_id, 'v': v}).all()
        return pd.DataFrame(f, columns=['sujeto', 'valor', 'valor_num']).set_index('sujeto')

    sexo = primera(sexo_v)
    etiquetas = etiquetas_de(esq).get(sexo_v or '', {})
    lub = primera(PF.VARIABLE_LUBCHENCO if PF.VARIABLE_LUBCHENCO in nombres else None)
    out = pd.DataFrame(index=base.index)
    # sin fila de atributo, reindex deja NaN (no None): ese niño no tiene el dato, no la opción «nan»
    out['sexo'] = [None if pd.isna(n) and (v is None or pd.isna(v)) else etiquetas.get(n, M.canonico(v, n))
                   for v, n in zip(sexo.valor.reindex(base.index), sexo.valor_num.reindex(base.index))]
    out['eg'] = base.eg_semanas.map(PF.categoria_eg)
    out['lubchenco'] = lub.valor.reindex(base.index).map(PF.categoria_lubchenco)
    out['sede'] = base.grupo.map(lambda g: None if g is None else M.canonico(g))
    return out


_ORDEN = {'eg': (list(PF.ETIQUETAS_EG), PF.ETIQUETAS_EG), 'lubchenco': (list(PF.ETIQUETAS_LUBCHENCO), PF.ETIQUETAS_LUBCHENCO)}
_TITULOS = {'sexo': 'Sexo', 'eg': 'Edad gestacional', 'lubchenco': 'Peso para la edad gestacional', 'sede': 'Sede'}


def distribuciones(cat: pd.DataFrame, ids: list[str]) -> dict:
    """Reparto en % del grupo frente a todos los niños; los que no tienen el dato no cuentan en el porcentaje."""
    grupo = cat[cat.index.isin(ids)]
    salida: dict[str, dict] = {}
    for col, titulo in _TITULOS.items():
        todos_c, grupo_c = cat[col].dropna(), grupo[col].dropna()
        if col == 'sede' and todos_c.nunique() < 2:
            continue
        if todos_c.empty:
            continue
        orden, nombres = _ORDEN.get(col, (sorted(todos_c.unique(), key=lambda x: (len(x), x)), {}))
        filas = []
        for c in orden:
            filas.append({'categoria': c, 'etiqueta': nombres.get(c, c),
                          'grupo': round(100.0 * (grupo_c == c).sum() / len(grupo_c), 1) if len(grupo_c) else None,
                          'todos': round(100.0 * (todos_c == c).sum() / len(todos_c), 1)})
        salida[col] = {'etiqueta': titulo, 'categorias': filas}
    return salida


def resumen_poblacion(cat: pd.DataFrame, ids: list[str]) -> dict:
    """Cuántos niños de la muestra hay en cada categoría, para guardar con ella."""
    grupo = cat[cat.index.isin(ids)]
    salida: dict[str, dict] = {}
    for col in _TITULOS:
        cuenta = grupo[col].dropna().value_counts()
        if cuenta.empty or (col == 'sede' and cat[col].dropna().nunique() < 2):
            continue
        salida[col] = {str(k): int(n) for k, n in cuenta.items()}
    return salida
