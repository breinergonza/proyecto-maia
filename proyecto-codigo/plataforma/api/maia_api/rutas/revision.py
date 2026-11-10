"""Revisión: la cola de datos por revisar (¿es un error?, solo administración: Calidad de datos) y la revisión ciega
de riesgos (¿le preocupa?, expertos).

La revisión de riesgos es ciega: mezcla niños de riesgo alto (posición 90 o más) con el resto, en un orden fijo por
corrida, y no muestra ni el riesgo ni la posición. ``/revision/resumen`` mide después qué tanto acierta cada capa y si
los niños de riesgo alto preocuparon más que el resto.
"""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from clinico import crecimiento as CR
from maia_api.consultas import (
    corrida_de,
    esquema,
    etapas,
    medidas_numericas,
    nombre_etapa,
    unidad_mostrada,
    unidades_crecimiento,
    valor_legible,
)
from maia_api.dependencias import ADMIN, EXPERTO, auditar, sesion
from maia_api.esquemas import RevisionDatoEntrada, RevisionRiesgoEntrada
from maia_api.rutas.ninos import unidad_crecimiento
from maia_comun.modelos_db import PERCENTIL_ALTO, AlertaDato, RevisionDato, RevisionRiesgo, Riesgo, Usuario
from sevarti import contrato as SV

ruta = APIRouter(prefix='/revision', tags=['revisión'])
MUESTRA_POR_GRUPO = 20


@ruta.get('/datos')
def datos(estado: str = Query('pendiente', pattern='^(pendiente|revisado|todos)$'), capa: str | None = None,
          variable: str | None = None, pagina: int = Query(1, ge=1), tamano: int = Query(25, ge=1, le=200),
          corrida_id: int | None = None, s: Session = Depends(sesion), u: Usuario = Depends(ADMIN)) -> dict:
    c = corrida_de(s, corrida_id)
    mapa = etapas(s, c.corte_id)
    filtros = ['a.corrida_id = :c']
    if capa:
        filtros.append(':capa = ANY(a.capas)')
    if variable:
        filtros.append('a.variable = :v')
    if estado == 'pendiente':
        filtros.append('r.alerta_id IS NULL')
    elif estado == 'revisado':
        filtros.append('r.alerta_id IS NOT NULL')
    base = f"""FROM resultados.alertas_dato a
               LEFT JOIN resultados.revision_datos r ON r.alerta_id = a.id AND r.usuario_id = :u
               WHERE {' AND '.join(filtros)}"""
    p = {'c': c.id, 'u': u.id, 'capa': capa, 'v': variable}
    total = s.execute(text(f'SELECT count(*) {base}'), p).scalar_one()
    filas = s.execute(text(f"""SELECT a.id, a.prioridad, a.sujeto, a.variable, a.etiqueta, a.unidad, a.etapa, a.fecha,
                                      a.valor, a.esperado, a.rango_bajo, a.rango_alto, a.capas, a.motivo, a.fuerza,
                                      r.es_error, r.comentario
                               {base} ORDER BY a.prioridad LIMIT :lim OFFSET :off"""),
                      {**p, 'lim': tamano, 'off': (pagina - 1) * tamano})
    items = []
    for f in filas:
        d = dict(f._mapping)
        d['capas'] = list(d['capas'] or [])
        d['etapa_nombre'] = nombre_etapa(mapa, d['etapa'])
        items.append(d)
    for d, serie in zip(items, _series(s, c.corte_id, items, esquema(s, c.corte_id), mapa), strict=True):
        d['serie'] = serie
    return {'total': total, 'pagina': pagina, 'tamano': tamano, 'items': items}


PUNTOS_ACIERTOS = (50, 100, 200, 300, 400, 500)
MINIMO_CELDA = 5   # D46/D4: una celda con menos alertas que esto no se muestra sola


def _cortes_aciertos(maximo: int) -> list[int]:
    ks = [k for k in PUNTOS_ACIERTOS if k < maximo]
    k = PUNTOS_ACIERTOS[-1]
    while k < maximo and len(ks) < 24:
        k += 100
        if k < maximo:
            ks.append(k)
    return [*ks, maximo] if maximo else []


@ruta.get('/datos/aciertos')
def aciertos(corrida_id: int | None = None, s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> dict:
    """Qué tanto acierta la cola: de las k primeras alertas (por prioridad) que ya tienen respuesta, qué porcentaje se
    marcó «error». Una alerta cuenta como error si alguna respuesta dijo «sí». Las respuestas «no sé» cuentan como
    respondidas pero no como error."""
    c = corrida_de(s, corrida_id)
    maximo = s.execute(text('SELECT coalesce(max(prioridad), 0) FROM resultados.alertas_dato WHERE corrida_id = :c'),
                       {'c': c.id}).scalar_one()
    filas = s.execute(text("""SELECT a.prioridad, bool_or(r.es_error = 'si') AS error
                              FROM resultados.alertas_dato a JOIN resultados.revision_datos r ON r.alerta_id = a.id
                              WHERE a.corrida_id = :c GROUP BY a.id, a.prioridad"""), {'c': c.id}).all()
    serie = []
    for k in _cortes_aciertos(maximo):
        dentro = [f for f in filas if f.prioridad <= k]
        errores = sum(1 for f in dentro if f.error)
        serie.append({'k': k, 'respondidas': len(dentro),
                      'precision': round(100 * errores / len(dentro), 1) if dentro else None})
    errores = sum(1 for f in filas if f.error)
    return {'corrida_id': c.id, 'serie': serie, 'respondidas': len(filas),
            'confirmadas_error_pct': round(100 * errores / len(filas), 1) if filas else None}


@ruta.get('/datos/concentracion')
def concentracion(corrida_id: int | None = None, s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> dict:
    """Dónde se acumulan las alertas: por variable y, si el corte trae más de un grupo o sede, por grupo y variable.
    Lo que tenga menos de ``MINIMO_CELDA`` alertas no se muestra solo: se suma en «otras»."""
    c = corrida_de(s, corrida_id)
    por_celda = s.execute(text("""SELECT su.grupo, a.variable, max(a.etiqueta) AS etiqueta, count(*) AS alertas
                                  FROM resultados.alertas_dato a
                                  LEFT JOIN sevarti.sujetos su ON su.corte_id = :k AND su.sujeto = a.sujeto
                                  WHERE a.corrida_id = :c GROUP BY su.grupo, a.variable"""),
                          {'c': c.id, 'k': c.corte_id}).all()
    hay_sede = len({f.grupo for f in por_celda if f.grupo}) >= 2
    variables: dict[str, dict] = {}
    for f in por_celda:
        v = variables.setdefault(f.variable, {'variable': f.variable, 'etiqueta': f.etiqueta, 'alertas': 0})
        v['alertas'] += f.alertas
    por_variable = sorted((v for v in variables.values() if v['alertas'] >= MINIMO_CELDA),
                          key=lambda v: (-v['alertas'], v['variable']))
    otras_variables = sum(v['alertas'] for v in variables.values() if v['alertas'] < MINIMO_CELDA)
    celdas, otras_celdas = [], 0
    if hay_sede:
        for f in sorted(por_celda, key=lambda f: (-f.alertas, str(f.grupo), f.variable)):
            if f.alertas >= MINIMO_CELDA:
                celdas.append({'grupo': f.grupo or 'sin grupo', 'variable': f.variable, 'etiqueta': f.etiqueta,
                               'alertas': f.alertas})
            else:
                otras_celdas += f.alertas
    return {'corrida_id': c.id, 'hay_sede': hay_sede, 'minimo_celda': MINIMO_CELDA, 'por_variable': por_variable,
            'otras_variables': otras_variables, 'celdas': celdas, 'otras_celdas': otras_celdas}


def _factor(unidad: object) -> tuple[str, float] | None:
    """(magnitud, factor a la unidad de referencia) de una unidad de crecimiento conocida (g, kg, cm, mm)."""
    return CR.UNIDADES.get(_unidad(unidad))


def _unidad(unidad: object) -> str:
    return str(unidad or '').strip().lower()


def _series(s: Session, corte_id: int, items: list[dict], esq: dict, mapa: dict) -> list[list[dict]]:
    """Para cada dato de la página, las medidas del mismo niño y el mismo concepto del diccionario (p. ej. el peso en
    cada visita), en orden de visita y en la unidad del dato revisado (un peso al nacer en gramos y uno a los 3 meses en
    kilos no se mezclan). El punto del dato revisado es ese valor, no otro registro de la misma variable; los códigos
    de «no se hizo» no son medidas. Una sola consulta para toda la página; sin concepto, no hay serie."""
    def concepto(v: str) -> str | None:
        c = esq.get(v, {}).get('concepto')
        return c if isinstance(c, str) and c else None

    por_concepto: dict[str, list[str]] = defaultdict(list)
    for v, d in esq.items():
        if concepto(v) and d.get('tipo') == 'numeric' and d.get('etapa') in mapa:
            por_concepto[concepto(v)].append(v)
    con_serie = [d for d in items if concepto(d['variable'])]
    if not con_serie:
        return [[] for _ in items]
    variables = sorted({v for d in con_serie for v in por_concepto[concepto(d['variable'])]})
    valores = {(suj, v): x for suj, v, x in
               medidas_numericas(s, corte_id, variables, esq, sorted({d['sujeto'] for d in con_serie}))}

    def serie(d: dict) -> list[dict]:
        if not concepto(d['variable']):
            return []
        propia = esq.get(d['variable'], {})
        destino = _factor(propia.get('unidad'))
        codigos = SV.codigos_declarados(propia.get('codigos_especiales'))
        try:
            este = float(d['valor'])
        except (TypeError, ValueError):
            este = None
        puntos = []
        for v in por_concepto[concepto(d['variable'])]:
            if v == d['variable']:
                x, factor = (None if este is None or este in codigos else este), 1.0
            else:
                x = valores.get((d['sujeto'], v))
                origen = _factor(esq[v].get('unidad'))
                if origen and destino and origen[0] == destino[0]:
                    factor = origen[1] / destino[1]
                elif _unidad(esq[v].get('unidad')) == _unidad(propia.get('unidad')):
                    factor = 1.0
                else:
                    continue   # otra unidad que no se sabe convertir: mejor no dibujarla que dibujarla mal
            if x is None:
                continue
            etapa = esq[v]['etapa']
            puntos.append({'variable': v, 'etapa_nombre': nombre_etapa(mapa, etapa), 'orden': mapa[etapa]['orden'],
                           'valor': x * factor, 'es_este': v == d['variable']})
        return sorted(puntos, key=lambda p: p['orden'])

    return [serie(d) for d in items]


@ruta.post('/datos/{alerta_id}', status_code=status.HTTP_204_NO_CONTENT)
def responder_dato(alerta_id: int, datos: RevisionDatoEntrada, s: Session = Depends(sesion),
                   u: Usuario = Depends(ADMIN)) -> None:
    if s.get(AlertaDato, alerta_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'No existe ese dato en la cola.')
    q = pg_insert(RevisionDato).values(alerta_id=alerta_id, usuario_id=u.id, es_error=datos.es_error,
                                       comentario=datos.comentario)
    s.execute(q.on_conflict_do_update(index_elements=['alerta_id', 'usuario_id'],
                                      set_={'es_error': q.excluded.es_error, 'comentario': q.excluded.comentario}))
    auditar(s, u, 'revisar_dato', str(alerta_id), {'es_error': datos.es_error})
    s.commit()


def _resumen_nino(s: Session, corte_id: int, sujeto: str, momento: str, esq: dict, mapa: dict) -> list[str]:
    """Lo que vería el médico: edad gestacional, datos al nacer y lo medido en la visita del cálculo."""
    eg = s.execute(text('SELECT eg_semanas FROM sevarti.sujetos WHERE corte_id = :c AND sujeto = :s'),
                   {'c': corte_id, 's': sujeto}).scalar()
    lineas = [f'Edad gestacional: {eg:g} semanas'] if eg is not None else []
    meds = s.execute(text('SELECT variable, valor FROM sevarti.mediciones WHERE corte_id = :c AND sujeto = :s ORDER BY id'),
                     {'c': corte_id, 's': sujeto})
    for m in meds:
        d = esq.get(m.variable, {})
        etiqueta = str(d.get('etiqueta') or m.variable)
        # el texto libre puede traer nombres o datos que no hacen falta para la revisión
        if m.valor is None or d.get('tipo') in ('text', 'texto') or 'texto' in etiqueta.lower() or len(str(m.valor)) > 40:
            continue
        if d.get('rol') == 'basal' or d.get('etapa') == momento:
            valor = valor_legible(d, m.valor)
            unidad = f' {u}' if (u := unidad_mostrada(d)) else ''
            donde = '' if d.get('rol') == 'basal' else f' ({nombre_etapa(mapa, momento)})'
            lineas.append(f'{etiqueta}{donde}: {valor}{unidad}')
    return lineas[:14]


def _crecimiento_hasta(s: Session, corrida_id: int, sujeto: str, momento: str, esq: dict, mapa: dict) -> dict[str, list[dict]]:
    """El crecimiento del niño frente a la OMS hasta la visita del riesgo (lo posterior no se muestra: el experto
    juzga con lo que se sabía entonces). Misma forma que ``crecimiento`` de la ficha."""
    tope = mapa.get(momento, {}).get('orden')
    unidades = unidades_crecimiento(esq)
    filas = s.execute(text('SELECT etapa, indicador, variable, fecha, edad_corregida, valor, z, bajo_2de, caida_1de, improbable '
                           'FROM resultados.crecimiento WHERE corrida_id = :c AND sujeto = :s ORDER BY edad_corregida'),
                      {'c': corrida_id, 's': sujeto})
    serie: dict[str, list[dict]] = defaultdict(list)
    for g in filas:
        orden = mapa.get(g.etapa, {}).get('orden') if g.etapa else None
        if tope is not None and orden is not None and orden > tope:
            continue
        d = dict(g._mapping)
        d['unidad'] = unidad_crecimiento(esq, unidades, g.variable, g.indicador, g.etapa)
        serie[g.indicador].append(d)
    return dict(serie)


@ruta.get('/riesgos')
def riesgos(corrida_id: int | None = None, s: Session = Depends(sesion), u: Usuario = Depends(EXPERTO)) -> dict:
    c = corrida_de(s, corrida_id)
    mapa, esq = etapas(s, c.corte_id), esquema(s, c.corte_id)
    filas = s.execute(text("""
        WITH base AS (
            SELECT id, sujeto, clave, desenlace, momento, fecha_visita,
                   percentil >= :alto AS alto,
                   row_number() OVER (PARTITION BY percentil >= :alto ORDER BY md5(id::text || ':' || corrida_id::text)) AS n
            FROM resultados.riesgos WHERE corrida_id = :c AND NOT silencio)
        SELECT b.id, b.sujeto, b.clave, b.desenlace, b.momento, b.fecha_visita, r.preocupa, r.comentario
        FROM base b LEFT JOIN resultados.revision_riesgos r ON r.riesgo_id = b.id AND r.usuario_id = :u
        WHERE b.n <= :k ORDER BY md5(b.id::text || 'orden')"""),
        {'c': c.id, 'u': u.id, 'alto': PERCENTIL_ALTO, 'k': MUESTRA_POR_GRUPO})
    items = []
    for f in filas:
        d = dict(f._mapping)
        d['momento_nombre'] = nombre_etapa(mapa, d['momento'])
        d['resumen'] = _resumen_nino(s, c.corte_id, f.sujeto, f.momento, esq, mapa) if c.corte_id else []
        d['crecimiento'] = _crecimiento_hasta(s, c.id, f.sujeto, f.momento, esq, mapa)
        items.append(d)
    return {'corrida_id': c.id, 'items': items}


@ruta.post('/riesgos/{riesgo_id}', status_code=status.HTTP_204_NO_CONTENT)
def responder_riesgo(riesgo_id: int, datos: RevisionRiesgoEntrada, s: Session = Depends(sesion),
                     u: Usuario = Depends(EXPERTO)) -> None:
    if s.get(Riesgo, riesgo_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'No existe ese riesgo.')
    q = pg_insert(RevisionRiesgo).values(riesgo_id=riesgo_id, usuario_id=u.id, preocupa=datos.preocupa,
                                         comentario=datos.comentario)
    s.execute(q.on_conflict_do_update(index_elements=['riesgo_id', 'usuario_id'],
                                      set_={'preocupa': q.excluded.preocupa, 'comentario': q.excluded.comentario}))
    auditar(s, u, 'revisar_riesgo', str(riesgo_id), {'preocupa': datos.preocupa})
    s.commit()


@ruta.get('/resumen')
def resumen(corrida_id: int | None = None, s: Session = Depends(sesion), _: Usuario = Depends(EXPERTO)) -> dict:
    """Agregados de las respuestas: precisión por capa (qué parte de lo marcado era un error) y, en la revisión ciega,
    qué parte de los niños de riesgo alto y del resto preocupó."""
    c = corrida_de(s, corrida_id)
    por_capa: dict[str, dict] = defaultdict(lambda: {'respuestas': 0, 'si': 0, 'no': 0, 'no_se': 0})
    for f in s.execute(text("""SELECT unnest(a.capas) AS capa, r.es_error, count(*) AS n
                               FROM resultados.revision_datos r JOIN resultados.alertas_dato a ON a.id = r.alerta_id
                               WHERE a.corrida_id = :c GROUP BY 1, 2"""), {'c': c.id}):
        por_capa[f.capa]['respuestas'] += f.n
        por_capa[f.capa][f.es_error] += f.n
    datos = [{'capa': k, **v, 'precision_pct': round(100 * v['si'] / max(v['si'] + v['no'], 1), 1)}
             for k, v in sorted(por_capa.items())]
    grupos = []
    for f in s.execute(text("""SELECT x.percentil >= :alto AS alto,
                                      count(*) AS respuestas,
                                      count(*) FILTER (WHERE r.preocupa = 'si') AS si,
                                      count(*) FILTER (WHERE r.preocupa = 'no') AS no
                               FROM resultados.revision_riesgos r JOIN resultados.riesgos x ON x.id = r.riesgo_id
                               WHERE x.corrida_id = :c GROUP BY 1 ORDER BY 1 DESC"""),
                       {'c': c.id, 'alto': PERCENTIL_ALTO}):
        grupos.append({'grupo': 'riesgo alto' if f.alto else 'resto', 'respuestas': f.respuestas, 'si': f.si,
                       'no': f.no, 'preocupa_pct': round(100 * f.si / max(f.si + f.no, 1), 1)})
    return {'corrida_id': c.id, 'datos_por_capa': datos, 'riesgos_por_grupo': grupos}
