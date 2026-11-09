"""Niños: lista filtrable con su riesgo más alto, y la línea temporal de un niño (visitas, mediciones, puntajes z
de la OMS, alertas de dato y riesgos). Los códigos son los seudonimizados de la base; nunca hay nombres."""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from maia_api.consultas import (
    corrida_de,
    esquema,
    etapas,
    motivo_legible,
    nombre_etapa,
    sujeto_existe,
    unidad_mostrada,
    valor_legible,
)
from maia_api import estado as E
from maia_api.dependencias import CUALQUIERA, sesion
from maia_comun import puntuacion as PU
from maia_comun.modelos_db import Usuario

ruta = APIRouter(prefix='/ninos', tags=['niños'])
registro = logging.getLogger(__name__)
MINIMO_COHORTE = 20   # con menos niños, los cuantiles dirían más de cada uno que del grupo

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


def _tabla(s: Session, sql: str, p: dict) -> pd.DataFrame:
    r = s.execute(text(sql), p)
    return pd.DataFrame(r.fetchall(), columns=list(r.keys()))


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
    # con el riesgo promedio de su desenlace en la corrida: un 3 % solo se entiende al lado de lo habitual
    riesgos = s.execute(text("""
        SELECT r.id, r.clave, r.desenlace, r.momento, r.riesgo, r.percentil, r.motivos, r.fecha_visita, m.riesgo_medio
        FROM resultados.riesgos r
        JOIN (SELECT clave, avg(riesgo) AS riesgo_medio FROM resultados.riesgos
              WHERE corrida_id = :c AND NOT silencio GROUP BY clave) m ON m.clave = r.clave
        WHERE r.corrida_id = :c AND r.sujeto = :s AND NOT r.silencio
        ORDER BY r.percentil DESC"""), {'c': c.id, 's': sujeto})
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
        # como lo diría el médico: «Sí», «1.500 g», no «1.0 SI/NO» ni «1500.0 GRAMOS» (igual que en la revisión)
        item = {'variable': m.variable, 'etiqueta': d.get('etiqueta') or m.variable,
                'valor': None if m.valor is None else valor_legible(d, m.valor),
                'unidad': unidad_mostrada(d), 'fecha': m.fecha, 'tema': d.get('tema')}
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
        d['motivos'] = [motivo_legible(x, esq) for x in _texto_motivos(d['motivos'])]
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


@ruta.get('/{sujeto}/historia-riesgo')
def historia_riesgo(sujeto: str, corrida_id: int | None = None, s: Session = Depends(sesion),
                    _: Usuario = Depends(CUALQUIERA)) -> dict:
    """El riesgo de cada desenlace en cada visita del niño, calculado ahora con el paquete activo: cada punto usa solo lo
    medido hasta su visita. La corrida guarda solo la última visita, así que esto no sale de ``resultados.riesgos``."""
    c = corrida_de(s, corrida_id)
    if not sujeto_existe(s, c.corte_id, sujeto):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No hay un niño {sujeto} en el corte de la corrida.')
    activo = E.activo()
    if activo is None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'No hay un paquete de modelos activo para calcular la historia.')
    modelos, manifest, carpeta = activo
    base = carpeta / 'sevarti_base'
    variables = list(pd.read_parquet(base / 'esquema.parquet', columns=['variable']).variable)
    p = {'c': c.corte_id, 's': sujeto}
    parcial = {
        'sujetos': _tabla(s, 'SELECT sujeto, grupo, fecha_nacimiento, eg_semanas, anio_nacimiento FROM sevarti.sujetos '
                             'WHERE corte_id = :c AND sujeto = :s', p),
        'mediciones': _tabla(s, 'SELECT sujeto, variable, valor, fecha, edad_dias FROM sevarti.mediciones '
                                'WHERE corte_id = :c AND sujeto = :s AND variable = ANY(:v)', {**p, 'v': variables}),
        'episodios': _tabla(s, 'SELECT sujeto, tipo, edad_inicio, edad_fin FROM sevarti.episodios '
                               'WHERE corte_id = :c AND sujeto = :s', p),
    }
    corte = pd.Timestamp(c.fecha_corte) if c.fecha_corte else None
    try:
        tabla = PU.historia_riesgo(PU.completar(parcial, base, corte), modelos)
    except (ValueError, KeyError) as e:
        registro.warning('No se pudo calcular la historia de riesgo de %s: %s: %s', sujeto, type(e).__name__, e,
                         exc_info=True)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            'No se pudo calcular el riesgo en las visitas anteriores de este niño.') from e
    mapa = etapas(s, c.corte_id)
    puntos = [{
        'clave': f.clave, 'desenlace': f.desenlace, 'momento': f.momento,
        'momento_nombre': nombre_etapa(mapa, f.momento), 'orden': mapa.get(f.momento, {}).get('orden', 99),
        'riesgo': float(f.riesgo), 'percentil': float(f.percentil),
        'fecha_visita': None if pd.isna(f.fecha_visita) else str(f.fecha_visita)[:10],
    } for f in tabla.itertuples()]
    puntos.sort(key=lambda x: (x['orden'], x['desenlace']))
    return {'paquete': manifest['version'], 'paquete_corrida': c.paquete, 'puntos': puntos}


# Valores de cada variable del perfil, por corte y ordenados. Los datos de un corte no cambian: se leen una vez.
_COHORTE: dict[tuple[int, str], np.ndarray] = {}
_NUMERO_SQL = "valor ~ '^-?[0-9]+([.][0-9]+)?$'"


def _valores_cohorte(s: Session, corte_id: int, variables: list[str]) -> dict[str, np.ndarray]:
    faltan = [v for v in variables if (corte_id, v) not in _COHORTE]
    if faltan:
        leidos: dict[str, list[float]] = {v: [] for v in faltan}
        if 'eg_semanas' in leidos:
            leidos['eg_semanas'] = [r[0] for r in s.execute(text(
                'SELECT eg_semanas FROM sevarti.sujetos WHERE corte_id = :c AND eg_semanas IS NOT NULL'),
                {'c': corte_id})]
        otras = [v for v in faltan if v != 'eg_semanas']
        if otras:
            for variable, valor in s.execute(text(
                    f'SELECT variable, valor FROM sevarti.mediciones WHERE corte_id = :c AND variable = ANY(:v) '
                    f'AND {_NUMERO_SQL}'), {'c': corte_id, 'v': otras}):
                leidos[variable].append(float(valor))
        for v, valores in leidos.items():
            _COHORTE[(corte_id, v)] = np.sort(np.asarray(valores, dtype=float))
    return {v: _COHORTE[(corte_id, v)] for v in variables}


def _variables_perfil(esq: dict) -> list[str]:
    """Edad gestacional y las medidas al nacer: los datos basales numéricos que el diccionario une a un concepto de
    crecimiento (peso, talla, perímetro). Lo decide el diccionario, no el código."""
    al_nacer = sorted(v for v, d in esq.items()
                      if d.get('rol') == 'basal' and d.get('tipo') == 'numeric' and isinstance(d.get('concepto'), str)
                      and d['concepto'])
    return ['eg_semanas', *al_nacer]


@ruta.get('/{sujeto}/perfil')
def perfil(sujeto: str, corrida_id: int | None = None, s: Session = Depends(sesion),
           _: Usuario = Depends(CUALQUIERA)) -> dict:
    """Dónde queda el niño frente a los demás niños del corte en su edad gestacional y sus medidas al nacer. De la
    cohorte solo salen agregados (cuantiles y cuántos niños), nunca valores de otro niño."""
    c = corrida_de(s, corrida_id)
    if not sujeto_existe(s, c.corte_id, sujeto):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No hay un niño {sujeto} en el corte de la corrida.')
    esq = esquema(s, c.corte_id)
    variables = _variables_perfil(esq)
    cohorte = _valores_cohorte(s, c.corte_id, variables)
    propios: dict[str, float] = {}
    eg = s.execute(text('SELECT eg_semanas FROM sevarti.sujetos WHERE corte_id = :c AND sujeto = :s'),
                   {'c': c.corte_id, 's': sujeto}).scalar()
    if eg is not None:
        propios['eg_semanas'] = float(eg)
    for variable, valor in s.execute(text(
            f'SELECT variable, valor FROM sevarti.mediciones WHERE corte_id = :c AND sujeto = :s AND variable = ANY(:v) '
            f'AND {_NUMERO_SQL} ORDER BY id'), {'c': c.corte_id, 's': sujeto, 'v': variables[1:]}):
        propios.setdefault(variable, float(valor))
    filas = []
    for v in variables:
        valores = cohorte[v]
        if len(valores) < MINIMO_COHORTE:
            continue
        x = propios.get(v)
        d = esq.get(v, {})
        filas.append({
            'variable': v,
            'etiqueta': 'Edad gestacional' if v == 'eg_semanas' else d.get('etiqueta') or v,
            'unidad': 'semanas' if v == 'eg_semanas' else unidad_mostrada(d),
            'ninos': int(len(valores)),
            'cuantiles': dict(zip(('p5', 'p25', 'p50', 'p75', 'p95'),
                                  (float(q) for q in np.quantile(valores, [0.05, 0.25, 0.5, 0.75, 0.95])))),
            'valor': x,
            # porcentaje de niños con un valor menor; los empates cuentan la mitad
            'posicion': None if x is None else float(
                100 * (np.searchsorted(valores, x, 'left') + np.searchsorted(valores, x, 'right')) / (2 * len(valores))),
        })
    return {'variables': filas}
