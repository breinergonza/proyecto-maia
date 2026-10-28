"""Niños: lista filtrable con su riesgo más alto, y la línea temporal de un niño (visitas, mediciones, puntajes z
de la OMS, alertas de dato y riesgos). Los códigos son los seudonimizados de la base; nunca hay nombres."""
from __future__ import annotations

from collections import defaultdict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from maia_api.consultas import corrida_de, esquema, etapas, nombre_etapa, sujeto_existe
from maia_api.dependencias import CUALQUIERA, sesion
from maia_comun.modelos_db import Usuario

ruta = APIRouter(prefix='/ninos', tags=['niños'])

# Columnas por las que se puede ordenar la lista (lista cerrada: el nombre nunca llega al SQL sin pasar por aquí).
ORDENES = {
    'sujeto': 's.sujeto',
    'eg_semanas': 's.eg_semanas',
    'desenlace_max': 'r.desenlace_max',
    'percentil_max': 'r.percentil_max',
    'n_alertas': 'coalesce(a.n_alertas, 0)',
    'crecimiento': 'coalesce(g.n_bajo, 0) + coalesce(g.n_caida, 0)',
}


@ruta.get('')
def listar(buscar: str | None = None, desenlace: str | None = None,
           percentil_min: float | None = Query(None, ge=0, le=100), pagina: int = Query(1, ge=1),
           tamano: int = Query(25, ge=1, le=200), corrida_id: int | None = None,
           orden: Literal['sujeto', 'eg_semanas', 'desenlace_max', 'percentil_max', 'n_alertas', 'crecimiento'] | None = None,
           dir: Literal['asc', 'desc'] = 'desc',
           s: Session = Depends(sesion), _: Usuario = Depends(CUALQUIERA)) -> dict:
    c = corrida_de(s, corrida_id)
    if c.corte_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'Los datos de esa corrida ya no están cargados.')
    filtros_r = ['corrida_id = :c', 'NOT silencio']
    if desenlace:
        filtros_r.append('clave = :d')
    donde_r = ' AND '.join(filtros_r)
    con_riesgo = desenlace is not None or percentil_min is not None
    filtros = ['s.corte_id = :corte']
    if buscar:
        filtros.append('s.sujeto ILIKE :b')
    if percentil_min is not None:
        filtros.append('r.percentil_max >= :p')
    if con_riesgo:
        filtros.append('r.percentil_max IS NOT NULL')
    base = f"""
        FROM sevarti.sujetos s
        LEFT JOIN (
            SELECT DISTINCT ON (sujeto) sujeto, percentil AS percentil_max, riesgo AS riesgo_max,
                   desenlace AS desenlace_max, clave AS clave_max, count(*) OVER (PARTITION BY sujeto) AS n_riesgos
            FROM resultados.riesgos WHERE {donde_r}
            ORDER BY sujeto, percentil DESC
        ) r ON r.sujeto = s.sujeto
        LEFT JOIN (SELECT sujeto, count(*) AS n_alertas FROM resultados.alertas_dato WHERE corrida_id = :c GROUP BY sujeto)
            a ON a.sujeto = s.sujeto
        LEFT JOIN (SELECT sujeto, count(*) FILTER (WHERE bajo_2de) AS n_bajo, count(*) FILTER (WHERE caida_1de) AS n_caida
                   FROM resultados.crecimiento WHERE corrida_id = :c GROUP BY sujeto) g ON g.sujeto = s.sujeto
        WHERE {' AND '.join(filtros)}"""
    p = {'c': c.id, 'corte': c.corte_id, 'd': desenlace, 'b': f'%{buscar}%' if buscar else None, 'p': percentil_min}
    total = s.execute(text(f'SELECT count(*) {base}'), p).scalar_one()
    orden_sql = f'{ORDENES[orden]} {dir.upper()} NULLS LAST, ' if orden else ''
    filas = s.execute(text(f"""
        SELECT s.sujeto, s.eg_semanas, s.grupo, r.percentil_max, r.riesgo_max, r.desenlace_max, r.clave_max,
               coalesce(r.n_riesgos, 0) AS n_riesgos, coalesce(a.n_alertas, 0) AS n_alertas,
               coalesce(g.n_bajo, 0) AS n_bajo_2de, coalesce(g.n_caida, 0) AS n_caida_1de
        {base}
        ORDER BY {orden_sql}r.percentil_max DESC NULLS LAST, a.n_alertas DESC NULLS LAST, s.sujeto
        LIMIT :lim OFFSET :off"""), {**p, 'lim': tamano, 'off': (pagina - 1) * tamano})
    return {'total': total, 'pagina': pagina, 'tamano': tamano, 'items': [dict(f._mapping) for f in filas]}


def _texto_motivos(m) -> list[str]:
    return list(m) if isinstance(m, list) else []


@ruta.get('/{sujeto}/linea-temporal')
def linea_temporal(sujeto: str, corrida_id: int | None = None, s: Session = Depends(sesion),
                   _: Usuario = Depends(CUALQUIERA)) -> dict:
    c = corrida_de(s, corrida_id)
    if not sujeto_existe(s, c.corte_id, sujeto):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No hay un niño {sujeto} en el corte de la corrida.')
    mapa = etapas(s, c.corte_id)
    esq = esquema(s, c.corte_id)
    datos_nino = s.execute(text('SELECT sujeto, grupo, eg_semanas, fecha_nacimiento, anio_nacimiento FROM sevarti.sujetos '
                                'WHERE corte_id = :c AND sujeto = :s'), {'c': c.corte_id, 's': sujeto}).one()._mapping
    meds = s.execute(text('SELECT variable, valor, fecha, edad_dias FROM sevarti.mediciones '
                          'WHERE corte_id = :c AND sujeto = :s ORDER BY fecha NULLS FIRST, id'),
                     {'c': c.corte_id, 's': sujeto})
    alertas = s.execute(text('SELECT id, variable, etiqueta, etapa, valor, esperado, rango_bajo, rango_alto, capas, motivo, '
                             'prioridad FROM resultados.alertas_dato WHERE corrida_id = :c AND sujeto = :s ORDER BY prioridad'),
                        {'c': c.id, 's': sujeto})
    riesgos = s.execute(text('SELECT id, clave, desenlace, momento, riesgo, percentil, motivos, fecha_visita '
                             'FROM resultados.riesgos WHERE corrida_id = :c AND sujeto = :s AND NOT silencio '
                             'ORDER BY percentil DESC'), {'c': c.id, 's': sujeto})
    crec = s.execute(text('SELECT etapa, indicador, fecha, edad_corregida, valor, z, bajo_2de, caida_1de, improbable '
                          'FROM resultados.crecimiento WHERE corrida_id = :c AND sujeto = :s ORDER BY edad_corregida'),
                     {'c': c.id, 's': sujeto})

    visitas: dict[str, dict] = {}
    sin_visita: list[dict] = []

    def visita(etapa: str) -> dict:
        if etapa not in visitas:
            info = mapa.get(etapa, {})
            visitas[etapa] = {'etapa': etapa, 'nombre': info.get('nombre', etapa), 'orden': info.get('orden', 99),
                              'fecha': None, 'edad_corregida': None, 'mediciones': [], 'z': {}, 'alertas_dato': [],
                              'riesgos': []}
        return visitas[etapa]

    for m in meds:
        d = esq.get(m.variable, {})
        item = {'variable': m.variable, 'etiqueta': d.get('etiqueta') or m.variable, 'valor': m.valor,
                'unidad': d.get('unidad'), 'fecha': m.fecha, 'tema': d.get('tema')}
        etapa = d.get('etapa')
        if etapa:
            v = visita(etapa)
            v['mediciones'].append(item)
            if m.fecha and (v['fecha'] is None or m.fecha > v['fecha']):
                v['fecha'] = m.fecha
        else:
            sin_visita.append(item)
    for a in alertas:
        d = dict(a._mapping)
        d['capas'] = list(d['capas'] or [])
        if a.etapa:
            visita(a.etapa)['alertas_dato'].append(d)
        else:
            sin_visita.append({'variable': a.variable, 'etiqueta': a.etiqueta, 'valor': a.valor, 'alerta': d})
    for r in riesgos:
        d = dict(r._mapping)
        d['motivos'] = _texto_motivos(d['motivos'])
        visita(r.momento)['riesgos'].append(d)
    serie = defaultdict(list)
    for g in crec:
        d = dict(g._mapping)
        serie[g.indicador].append(d)
        if g.etapa:
            v = visita(g.etapa)
            v['z'][g.indicador] = g.z
            if g.edad_corregida is not None:
                v['edad_corregida'] = g.edad_corregida
    return {
        'sujeto': sujeto, 'grupo': datos_nino['grupo'], 'eg_semanas': datos_nino['eg_semanas'],
        'anio_nacimiento': datos_nino['anio_nacimiento'] or (datos_nino['fecha_nacimiento'].year
                                                              if datos_nino['fecha_nacimiento'] else None),
        'corte': str(c.fecha_corte) if c.fecha_corte else None, 'corrida_id': c.id,
        'visitas': sorted(visitas.values(), key=lambda v: v['orden']),
        'contexto': sin_visita,
        'crecimiento': {k: v for k, v in serie.items()},
        'nombre_etapa': {k: nombre_etapa(mapa, k) for k in mapa},
    }
