"""Analítica › Comparar: qué entrenamiento o qué grupo de niños es distinto, con intervalos por réplicas bootstrap.

* ``GET /analitica/comparar?a=&b=&desenlace=``: dos entrenamientos. Solo lee los artefactos agregados (D7); la
  diferencia lleva un intervalo aproximado (réplicas independientes de cada lado) y los niños o casos detrás de cada cifra.
* ``POST /analitica/comparar/grupos``: dos grupos de niños (cada lado, un filtro guardado o una combinación de
  facetas) sobre una corrida: tamaño, riesgo alto por desenlace, crecimiento y composición. Con menos de 20 niños en
  un lado no se da ninguna cifra (D52); los conteos de 1 a 4 niños se dan con su cifra.
* ``POST /analitica/comparar/grupos/clinico``: los mismos dos grupos vistos como los ve el equipo clínico (Comparar
  grupos): qué les pasó a los 12 meses (lo observado, con la diferencia de B frente a A), la talla para la edad por
  visita y los datos que faltan en cada una, y el riesgo estimado por corte (aparte, porque no es lo observado). Las
  cifras de cada lado salen de las mismas funciones que la Vista clínica (``rutas.clinica``) y con sus reglas de
  privacidad: 20 niños por lado; las cifras son exactas para todos los perfiles (D64).

Aprobar B no vive aquí: la pantalla llama a ``POST /entrenamientos/aprobar`` (solo administración, con auditoría).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from maia_api import poblacion as P
from maia_api.consultas import corrida_de, esquema, etapas, motivo_legible
from maia_api.dependencias import CUALQUIERA, auditar, sesion
from maia_api.rutas import clinica as CLI
from maia_api.rutas.clinica import Dic
from maia_comun import analitica as AN
from maia_comun import analitica_comparar as CM
from maia_comun import muestra as M
from maia_comun.modelos_analitica import Analitica
from maia_comun.modelos_db import PERCENTIL_ALTO, Corrida, Usuario
from maia_comun.modelos_muestras import Muestra

ruta = APIRouter(prefix='/comparar', tags=['analitica'])

MAX_DESENLACES = 12
INDICADOR = 'peso'
MAX_FILAS = 8


def _filas(s: Session, entrenamiento: int, desenlace: str, tipos: tuple[str, ...]) -> dict[str, dict]:
    q = select(Analitica).where(Analitica.entrenamiento_id == entrenamiento, Analitica.tipo.in_(tipos),
                                Analitica.desenlace == desenlace).order_by(Analitica.id)
    return {a.tipo: a.datos or {} for a in s.scalars(q)}


def _meta(s: Session, entrenamiento: int) -> Analitica | None:
    return s.scalars(select(Analitica).where(Analitica.entrenamiento_id == entrenamiento, Analitica.tipo == 'meta')
                     .order_by(Analitica.id.desc())).first()


def _lado(entrenamiento: int, meta: Analitica, rend: dict) -> dict:
    d, auc = meta.datos or {}, rend.get('auc_desenlace') or {}
    return {'entrenamiento': entrenamiento, 'fuente': d.get('fuente'), 'corte': d.get('corte'),
            'registro': d.get('registro'), 'version_registro': d.get('version_registro'),
            'version_modelo': d.get('version_modelo'), 'creada': meta.creada,
            'n': auc.get('n'), 'casos': auc.get('casos')}


@ruta.get('')
def entrenamientos(a: int = Query(..., ge=1), b: int = Query(..., ge=1), desenlace: str = Query(..., min_length=1),
                   s: Session = Depends(sesion), _: Usuario = Depends(CUALQUIERA)) -> dict:
    """Las medidas de A y B para un desenlace, con la diferencia de B frente a A y su intervalo del 95 % por réplicas;
    el rendimiento por subgrupo (sexo, edad gestacional, sede) con su diferencia; y las diferencias de la muestra."""
    if a == b:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, 'Elija dos entrenamientos distintos.')
    ma, mb = _meta(s, a), _meta(s, b)
    if ma is None or mb is None:
        return {'estado': 'sin_artefactos', 'a': a, 'b': b, 'desenlace': desenlace}
    ra = _filas(s, a, desenlace, ('rendimiento', 'equidad', 'calibracion'))
    rb = _filas(s, b, desenlace, ('rendimiento', 'equidad', 'calibracion'))
    if 'auc_desenlace' not in ra.get('rendimiento', {}) or 'auc_desenlace' not in rb.get('rendimiento', {}):
        return {'estado': 'insuficiente', 'a': _lado(a, ma, ra.get('rendimiento', {})),
                'b': _lado(b, mb, rb.get('rendimiento', {})), 'desenlace': desenlace,
                'mensaje': 'Este desenlace no tiene datos suficientes en alguno de los dos entrenamientos.'}
    r = CM.comparar_entrenamientos(ra['rendimiento'], rb['rendimiento'])
    # calibración: diferencias sin intervalo (no hay con qué remuestrear), con el tamaño de cada lado
    cal = []
    for id_, texto, clave in (('brier', 'Error del porcentaje de riesgo (Brier)', 'brier'),
                              ('razon', 'Riesgo dicho entre riesgo real', 'razon_riesgo_observado')):
        va, vb = ra.get('calibracion', {}).get(clave), rb.get('calibracion', {}).get(clave)
        cal.append({'id': id_, 'texto': texto, 'a': va, 'b': vb,
                    'diferencia': None if va is None or vb is None else AN._r(vb - va, 4)})
    return AN.limpio({
        'estado': 'ok', 'desenlace': desenlace, 'a': _lado(a, ma, ra['rendimiento']), 'b': _lado(b, mb, rb['rendimiento']),
        **r, 'calibracion': cal,
        'por_grupo': CM.comparar_subgrupos((ra.get('equidad') or {}).get('subgrupos') or {},
                                           (rb.get('equidad') or {}).get('subgrupos') or {}),
        'minimo_ninos': AN.MIN_DISTRIBUCION})


# ------------------------------------------------------------------------------------------------ grupos de niños

class LadoGrupo(BaseModel):
    """Un grupo de niños: un filtro guardado (``muestra_id``) o una combinación de facetas (``muestra``)."""
    muestra: dict | None = None
    muestra_id: int | None = None
    nombre: str | None = None


class DosGrupos(BaseModel):
    a: LadoGrupo
    b: LadoGrupo
    corrida_id: int | None = None


class ComparaGrupos(DosGrupos):
    desenlace: str | None = None


def _ids(s: Session, corte: int, lado: LadoGrupo) -> list[str]:
    if lado.muestra_id is not None:
        fila = s.get(Muestra, lado.muestra_id)
        if fila is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f'No existe la muestra {lado.muestra_id}.')
        defn = fila.definicion
    else:
        defn = lado.muestra or {'version': M.VERSION}
    return P.ids_de(s, corte, defn, muestreo=False)


def _abrir(s: Session, u: Usuario, c: DosGrupos) -> tuple[Corrida, list[str], list[str]]:
    """La corrida y los niños de cada lado; la consulta queda en la auditoría (con la huella de cada grupo, sin códigos)."""
    corrida = corrida_de(s, c.corrida_id)
    if corrida.corte_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Los datos de esa corrida ya no están en la base.')
    ids_a, ids_b = _ids(s, corrida.corte_id, c.a), _ids(s, corrida.corte_id, c.b)
    auditar(s, u, 'analitica.comparar_grupos', f'corrida:{corrida.id}',
            {'huella_a': M.huella(ids_a), 'huella_b': M.huella(ids_b), 'n_a': len(ids_a), 'n_b': len(ids_b)})
    s.commit()
    return corrida, ids_a, ids_b


def _lado_grupo(nombre: str | None, ids: list[str], defecto: str) -> dict:
    n = len(ids)
    return {'nombre': nombre or defecto, 'n': int(n)}


def _faltan_ninos(ids_a: list[str], ids_b: list[str]) -> dict | None:
    """El aviso cuando un lado no llega al mínimo de niños (D52): sin él, ninguna cifra de ninguno de los dos."""
    if min(len(ids_a), len(ids_b)) >= AN.MIN_DISTRIBUCION:
        return None
    return {'estado': 'insuficiente', 'mensaje': f'Cada grupo necesita al menos {AN.MIN_DISTRIBUCION} niños para compararse.'}


def _composicion(cat: pd.DataFrame, ids_a: list[str], ids_b: list[str]) -> dict:
    """Reparto en % de sexo, edad gestacional, Lubchenco y sede en cada grupo. Una variable con menos de 20 niños con
    dato en un lado no se muestra."""
    salida: dict[str, dict] = {}
    for col, titulo in P._TITULOS.items():
        ga, gb = cat.loc[cat.index.isin(ids_a), col].dropna(), cat.loc[cat.index.isin(ids_b), col].dropna()
        todos = cat[col].dropna()
        if len(ga) < AN.MIN_DISTRIBUCION or len(gb) < AN.MIN_DISTRIBUCION or todos.nunique() < 2:
            continue
        orden, nombres = P._ORDEN.get(col, (sorted(todos.unique(), key=lambda x: (len(x), x)), {}))
        filas = []
        for c in orden:
            na, nb = int((ga == c).sum()), int((gb == c).sum())
            filas.append({'categoria': c, 'etiqueta': nombres.get(c, c),
                          'n_a': int(na), 'n_b': int(nb),
                          'pct_a': round(100 * na / len(ga), 1), 'pct_b': round(100 * nb / len(gb), 1)})
        salida[col] = {'etiqueta': titulo, 'categorias': filas}
    return salida


def _motivos_por_grupo(s: Session, corrida_id: int, desenlace: str | None, esq: dict,
                       ids_a: list[str], ids_b: list[str]) -> list[dict]:
    """Qué razones se repiten entre los niños con riesgo alto de cada grupo (los motivos que dejó la corrida). Un lado
    con menos de 20 niños de riesgo alto no da cifras."""
    filas = s.execute(text(
        'SELECT sujeto, motivos FROM resultados.riesgos WHERE corrida_id = :c AND NOT silencio AND percentil >= :p '
        + ('AND clave = :d ' if desenlace else '') + 'AND sujeto = ANY(:ids)'),
        {'c': corrida_id, 'p': PERCENTIL_ALTO, 'ids': list({*ids_a, *ids_b}), **({'d': desenlace} if desenlace else {})})
    por_nino: dict[str, set[str]] = {}
    for f in filas:
        por_nino.setdefault(f.sujeto, set()).update(motivo_legible(m, esq) for m in (f.motivos or []) if isinstance(m, str))
    lados = []
    for ids in (ids_a, ids_b):
        altos = [x for x in set(ids) if x in por_nino]
        cuenta: dict[str, int] = {}
        for x in altos:
            for m in por_nino[x]:
                cuenta[m] = cuenta.get(m, 0) + 1
        lados.append((len(altos), cuenta))
    if min(lados[0][0], lados[1][0]) < AN.MIN_DISTRIBUCION:
        return []

    def celda(n: int, total: int) -> dict:
        return {'n': int(n), 'pct': round(100 * n / total, 1)}
    todos = {*lados[0][1], *lados[1][1]}
    filas_m = [{'motivo': m, 'a': celda(lados[0][1].get(m, 0), lados[0][0]), 'b': celda(lados[1][1].get(m, 0), lados[1][0])}
               for m in todos]
    filas_m.sort(key=lambda f: -max(f['a']['pct'], f['b']['pct']))
    return [{**f, 'altos_a': int(lados[0][0]), 'altos_b': int(lados[1][0])} for f in filas_m[:MAX_FILAS]]


def _faltantes_por_grupo(s: Session, corte: int, esq: dict, ids_a: list[str], ids_b: list[str]) -> list[dict]:
    """Porcentaje de niños de cada grupo sin el dato, para los datos que más se distancian entre los dos grupos."""
    def con_dato(ids: list[str]) -> dict[str, int]:
        r = s.execute(text('SELECT variable, count(DISTINCT sujeto) AS n FROM sevarti.mediciones WHERE corte_id = :c '
                           'AND valor IS NOT NULL AND sujeto = ANY(:ids) GROUP BY variable'), {'c': corte, 'ids': ids})
        return {f.variable: int(f.n) for f in r}
    ca, cb = con_dato(ids_a), con_dato(ids_b)

    def celda(n: int, total: int) -> dict:
        faltan = total - n
        return {'faltan': int(faltan), 'pct': round(100 * faltan / total, 1)}
    filas = []
    for v in {*ca, *cb}:
        a, b = celda(ca.get(v, 0), len(ids_a)), celda(cb.get(v, 0), len(ids_b))
        if a['pct'] == 0 and b['pct'] == 0:
            continue
        filas.append({'variable': v, 'etiqueta': str((esq.get(v) or {}).get('etiqueta') or v), 'a': a, 'b': b,
                      'dif': abs(a['pct'] - b['pct'])})
    filas.sort(key=lambda f: -f['dif'])
    return [{k: x for k, x in f.items() if k != 'dif'} for f in filas[:MAX_FILAS]]


@ruta.post('/grupos')
def grupos(c: ComparaGrupos, s: Session = Depends(sesion), u: Usuario = Depends(CUALQUIERA)) -> dict:
    corrida, ids_a, ids_b = _abrir(s, u, c)
    base = {'corrida_id': corrida.id, 'minimo_ninos': AN.MIN_DISTRIBUCION, 'replicas': CM.REPLICAS_GRUPOS,
            'a': _lado_grupo(c.a.nombre, ids_a, 'Grupo A'), 'b': _lado_grupo(c.b.nombre, ids_b, 'Grupo B')}
    if faltan := _faltan_ninos(ids_a, ids_b):
        return {**base, **faltan}

    riesgos = pd.DataFrame(s.execute(text(
        'SELECT sujeto, clave, desenlace, max(percentil) AS p FROM resultados.riesgos WHERE corrida_id = :c AND NOT silencio '
        + ('AND clave = :d ' if c.desenlace else '') + 'AND sujeto = ANY(:ids) GROUP BY sujeto, clave, desenlace'),
        {'c': corrida.id, 'ids': list({*ids_a, *ids_b}), **({'d': c.desenlace} if c.desenlace else {})}).fetchall(),
        columns=['sujeto', 'clave', 'desenlace', 'p'])
    por_desenlace = []
    for clave, g in list(riesgos.groupby('clave'))[:MAX_DESENLACES]:
        p = g.set_index('sujeto').p.astype(float)
        va = (p.reindex([x for x in ids_a if x in p.index]) >= PERCENTIL_ALTO).astype(float).to_numpy()
        vb = (p.reindex([x for x in ids_b if x in p.index]) >= PERCENTIL_ALTO).astype(float).to_numpy()
        por_desenlace.append({'clave': clave, 'desenlace': str(g.desenlace.iloc[0]),
                              **CM.comparar_valores(va, vb, escala=100, unidad='pp')})

    z = pd.DataFrame(s.execute(text(
        'SELECT sujeto, avg(z) AS z FROM resultados.crecimiento WHERE corrida_id = :c AND indicador = :i AND z IS NOT NULL '
        'AND NOT improbable AND sujeto = ANY(:ids) GROUP BY sujeto'),
        {'c': corrida.id, 'i': INDICADOR, 'ids': list({*ids_a, *ids_b})}).fetchall(), columns=['sujeto', 'z'])
    zz = z.set_index('sujeto').z.astype(float)
    crecimiento = CM.comparar_valores(zz.reindex([x for x in ids_a if x in zz.index]).to_numpy(),
                                     zz.reindex([x for x in ids_b if x in zz.index]).to_numpy(), unidad='z')
    cat = P.categorias_por_nino(s, corrida.corte_id)
    esq = esquema(s, corrida.corte_id)
    return {**base, 'estado': 'ok', 'percentil_alto': PERCENTIL_ALTO, 'riesgo': por_desenlace,
            'motivos': _motivos_por_grupo(s, corrida.id, c.desenlace, esq, ids_a, ids_b),
            'faltantes': _faltantes_por_grupo(s, corrida.corte_id, esq, ids_a, ids_b),
            'crecimiento': {'indicador': INDICADOR, 'etiqueta': 'Peso para la edad (puntaje z frente a la OMS)',
                            **crecimiento},
            'composicion': _composicion(cat, ids_a, ids_b),
            'aviso': 'Las diferencias son asociaciones entre grupos, no causas. Un asterisco marca una diferencia clara: '
                     'su intervalo del 95 % no incluye cero.'}


# ---------------------------------------------------------------------------------- comparar grupos, por pregunta

INDICADOR_TALLA = 'talla'


def _valores_observados(s: Session, corrida: int, familia: str, ids_a: list[str], ids_b: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """Lo que pasó (1) o no (0) a los 12 meses, de los niños de cada lado que tienen dato."""
    filas = s.execute(text('SELECT sujeto, valor FROM resultados.desenlaces_observados WHERE corrida_id = :c '
                           'AND familia = :f AND sujeto = ANY(:ids)'),
                      {'c': corrida, 'f': familia, 'ids': list({*ids_a, *ids_b})})
    por_nino = {f.sujeto: float(f.valor) for f in filas}
    va, vb = ([por_nino[x] for x in set(ids) if x in por_nino] for ids in (ids_a, ids_b))
    return np.array(va), np.array(vb)


def _riesgo_por_corte(s: Session, corrida: Corrida, familia: str, ids_a: list[str], ids_b: list[str], dic: Dic) -> list[dict]:
    """Por corte de la familia, cuántos niños de cada lado tienen riesgo calculado y cuántos están en alerta. Es el
    riesgo estimado por el modelo, no lo observado: la pantalla lo rotula así."""
    cortes = [{f['clave']: f for f in CLI.riesgo_de(s, corrida.id, corrida.corte_id, familia, ids, dic)}
              for ids in (ids_a, ids_b)]
    mapa = etapas(s, corrida.corte_id)
    filas = []
    for clave in {*cortes[0], *cortes[1]}:
        propio = cortes[0].get(clave) or cortes[1][clave]
        filas.append({k: propio[k] for k in ('momento', 'momento_nombre', 'clave', 'estado')}
                     | {lado: {k: c[clave][k] for k in ('calculados', 'en_alerta', 'pct_en_alerta')} if clave in c else None
                        for lado, c in zip(('a', 'b'), cortes, strict=True)})
    return sorted(filas, key=lambda f: (mapa.get(f['momento'], {}).get('orden', 99), f['clave']))


def _desenlace(s: Session, corrida: Corrida, familia: dict, ids_a: list[str], ids_b: list[str], dic: Dic) -> dict:
    """Lo observado a los 12 meses en cada lado, con la diferencia de B frente a A y su intervalo por réplicas (cada
    lado pide 20 niños con dato), y el riesgo estimado por corte."""
    clave = familia['clave']
    va, vb = _valores_observados(s, corrida.id, clave, ids_a, ids_b)
    comparacion = CM.comparar_valores(va, vb, escala=100, unidad='pp')
    desde = dic.visita_base(clave, etapas(s, corrida.corte_id))   # entre quiénes se cuenta lo observado

    def observado(ids: list[str], pct: float | None) -> dict | None:
        o = CLI.observado_de(s, corrida.id, clave, ids, len(ids), desde)
        return None if o is None else {**o, 'pct': pct}
    return {**familia, 'desde': desde, 'a': observado(ids_a, comparacion['a']), 'b': observado(ids_b, comparacion['b']),
            'dif': {'valor': comparacion['diferencia'], 'ic_bajo': comparacion['ic_bajo'], 'ic_alto': comparacion['ic_alto'],
                    'clara': comparacion['clara']},
            'riesgo': _riesgo_por_corte(s, corrida, clave, ids_a, ids_b, dic),
            'riesgo_con_modelo': CLI.riesgo_con_modelo(s, corrida.id, clave)}


def _talla_por_visita(s: Session, corrida: Corrida, ids_a: list[str], ids_b: list[str], dic: Dic) -> dict:
    """La mediana del puntaje z de talla en cada visita, de cada lado, con los niños que tienen dato y los que no (el
    porcentaje que falta es sobre todos los niños del lado)."""
    por_lado = [CLI.trayectoria_de(s, corrida.id, corrida.corte_id, INDICADOR_TALLA, ids, dic) for ids in (ids_a, ids_b)]

    def celda(e: dict, total: int) -> dict | None:
        g = e['grupo']
        if g is None:
            return None
        sin = max(total - g['n'], 0)
        return {'n': int(g['n']), 'mediana': g['mediana'], 'sin_dato': int(sin),
                'pct_sin_dato': round(100 * sin / total, 1)}
    visitas = [{'etapa': ea['etapa'], 'etapa_nombre': ea['etapa_nombre'], 'a': celda(ea, len(ids_a)), 'b': celda(eb, len(ids_b))}
               for ea, eb in zip(por_lado[0]['etapas'], por_lado[1]['etapas'], strict=True)]
    return {**{k: por_lado[0][k] for k in ('indicador', 'nombre', 'unidad', 'referencia', 'umbral')}, 'etapas': visitas}


@ruta.post('/grupos/clinico')
def grupos_clinico(c: DosGrupos, s: Session = Depends(sesion), u: Usuario = Depends(CUALQUIERA)) -> dict:
    corrida, ids_a, ids_b = _abrir(s, u, c)
    base = {'corrida_id': corrida.id, 'minimo_ninos': AN.MIN_DISTRIBUCION,
            'a': _lado_grupo(c.a.nombre, ids_a, 'Grupo A'), 'b': _lado_grupo(c.b.nombre, ids_b, 'Grupo B')}
    if faltan := _faltan_ninos(ids_a, ids_b):
        return {**base, **faltan}
    total = int(P.n_base(s, corrida.corte_id))
    dic = CLI.diccionario_clinico(s)
    return {**base, 'estado': 'ok', 'alerta_percentil': PERCENTIL_ALTO,
            'a': {**base['a'], 'n_total': total}, 'b': {**base['b'], 'n_total': total},
            'desenlaces': [_desenlace(s, corrida, f, ids_a, ids_b, dic) for f in CLI.familias_de(s, corrida.id, dic)],
            'trayectoria': _talla_por_visita(s, corrida, ids_a, ids_b, dic)}
