"""Revisión experta: la cola de datos por revisar (¿es un error?) y la revisión ciega de riesgos (¿le preocupa?).

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

from maia_api.consultas import corrida_de, esquema, etapas, nombre_etapa
from maia_api.dependencias import EXPERTO, auditar, sesion
from maia_api.esquemas import RevisionDatoEntrada, RevisionRiesgoEntrada
from maia_comun.modelos_db import PERCENTIL_ALTO, AlertaDato, RevisionDato, RevisionRiesgo, Riesgo, Usuario

ruta = APIRouter(prefix='/revision', tags=['revisión'])
MUESTRA_POR_GRUPO = 20


@ruta.get('/datos')
def datos(estado: str = Query('pendiente', pattern='^(pendiente|revisado|todos)$'), capa: str | None = None,
          variable: str | None = None, pagina: int = Query(1, ge=1), tamano: int = Query(25, ge=1, le=200),
          corrida_id: int | None = None, s: Session = Depends(sesion), u: Usuario = Depends(EXPERTO)) -> dict:
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
    return {'total': total, 'pagina': pagina, 'tamano': tamano, 'items': items}


@ruta.post('/datos/{alerta_id}', status_code=status.HTTP_204_NO_CONTENT)
def responder_dato(alerta_id: int, datos: RevisionDatoEntrada, s: Session = Depends(sesion),
                   u: Usuario = Depends(EXPERTO)) -> None:
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
            unidad = f' {d["unidad"]}' if d.get('unidad') else ''
            donde = '' if d.get('rol') == 'basal' else f' ({nombre_etapa(mapa, momento)})'
            lineas.append(f'{etiqueta}{donde}: {m.valor}{unidad}')
    return lineas[:14]


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
