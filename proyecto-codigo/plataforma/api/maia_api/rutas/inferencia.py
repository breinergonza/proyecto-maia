"""Inferencia de unos pocos niños con el paquete activo, sin guardar nada (sección 4.10 del plan).

La petición trae sujetos, mediciones y episodios; el esquema, las etapas y los quiebres salen del corte con que se
entrenaron los modelos (``sevarti_base`` del paquete). No hay capa 4 (necesita la historia de todo el programa).
"""
from __future__ import annotations

import json
import math
from datetime import date, datetime

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from maia_api import estado as E
from maia_api.dependencias import EXPERTO, auditar, sesion
from maia_api.esquemas import PeticionInferencia
from maia_comun import puntuacion as PU
from maia_comun.modelos_db import Usuario

ruta = APIRouter(prefix='/inferencia', tags=['inferencia'])


def _limpio(v):
    if v is None or v is pd.NA or v is pd.NaT:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (pd.Timestamp, datetime, date)):
        return v.isoformat()[:10]
    if hasattr(v, 'item'):            # escalares de numpy
        return v.item()
    return v


def _registros(df: pd.DataFrame) -> list[dict]:
    return [{k: _limpio(v) for k, v in fila.items()} for fila in df.to_dict('records')]


def _activo():
    with E.estado.lock:
        modelos, manifest, carpeta = E.estado.modelos, E.estado.manifest, E.estado.carpeta
    if modelos is None or carpeta is None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'No hay un paquete de modelos activo.')
    return modelos, manifest, carpeta


@ruta.post('')
def inferir(p: PeticionInferencia, s: Session = Depends(sesion), u: Usuario = Depends(EXPERTO)) -> dict:
    modelos, manifest, carpeta = _activo()
    base = carpeta / 'sevarti_base'
    variables = set(pd.read_parquet(base / 'esquema.parquet', columns=['variable']).variable)

    sujetos = {x.sujeto for x in p.sujetos}
    if len(sujetos) != len(p.sujetos):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, 'Hay códigos de niño repetidos en "sujetos".')
    ajenos = sorted({m.sujeto for m in p.mediciones} - sujetos)
    if ajenos:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f'Hay mediciones de niños que no están en "sujetos": {", ".join(ajenos[:5])}')
    ignoradas = sorted({m.variable for m in p.mediciones} - variables)
    mediciones = [m.model_dump() for m in p.mediciones if m.variable in variables]
    if not mediciones:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            'Ninguna variable de las mediciones está en el esquema del modelo.')

    parcial = {
        'sujetos': pd.DataFrame([x.model_dump(exclude={'anio_nacimiento'}) for x in p.sujetos]),
        'mediciones': pd.DataFrame(mediciones),
        'episodios': pd.DataFrame([x.model_dump() for x in p.episodios]),
    }
    corte = pd.Timestamp(p.corte) if p.corte else None
    try:
        sev = PU.completar(parcial, base, corte)
        salida = PU.inferir(sev, modelos)
    except (ValueError, KeyError) as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f'No se pudo calcular: {e}') from e

    alertas = _registros(salida['alertas_dato'])
    for a in alertas:
        a['capas'] = [c for c in str(a.get('capas') or '').strip('{}').split(',') if c]
    riesgos = _registros(salida['riesgos'])
    for r in riesgos:
        r['motivos'] = json.loads(r['motivos']) if r.get('motivos') else []
    auditar(s, u, 'inferencia', manifest['version'], {'sujetos': len(sujetos), 'mediciones': len(mediciones)})
    s.commit()
    return {'paquete': manifest['version'], 'fuente': manifest['fuente'], 'variables_ignoradas': ignoradas,
            'alertas_dato': alertas, 'riesgos': riesgos, 'crecimiento': _registros(salida['crecimiento'])}


@ruta.get('/ejemplo')
def ejemplo(_: Usuario = Depends(EXPERTO)) -> dict:
    """Una petición lista para probar: un niño simulado (nunca uno real), con las variables del modelo activo."""
    _, manifest, carpeta = _activo()
    from maia_comun import simulados
    sev = simulados.simular(4, semilla=11)
    variables = set(pd.read_parquet(carpeta / 'sevarti_base' / 'esquema.parquet', columns=['variable']).variable)
    sujeto = sev.mediciones.sujeto.value_counts().index[0]
    suj = sev.sujetos[sev.sujetos.sujeto == sujeto].iloc[0]
    med = sev.mediciones[(sev.mediciones.sujeto == sujeto) & sev.mediciones.variable.isin(variables)]
    epi = sev.episodios[sev.episodios.sujeto == sujeto]
    return {
        'corte': str(pd.Timestamp(sev.corte).date()) if sev.corte is not None else None,
        'sujetos': [{'sujeto': 'ejemplo-1', 'grupo': None if pd.isna(suj.grupo) else str(suj.grupo),
                     'fecha_nacimiento': _limpio(suj.fecha_nacimiento), 'eg_semanas': _limpio(suj.eg_semanas)}],
        'mediciones': [{'sujeto': 'ejemplo-1', 'variable': m.variable, 'valor': _limpio(m.valor),
                        'fecha': _limpio(m.fecha), 'edad_dias': _limpio(m.edad_dias)} for m in med.itertuples()],
        'episodios': [{'sujeto': 'ejemplo-1', 'tipo': e.tipo, 'edad_inicio': _limpio(e.edad_inicio),
                       'edad_fin': _limpio(e.edad_fin)} for e in epi.itertuples()],
        'nota': f'Niño simulado con las variables del paquete {manifest["version"]}.',
    }
