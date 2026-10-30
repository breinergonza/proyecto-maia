"""Inferencia de unos pocos niños con el paquete activo, sin guardar nada (sección 4.10 del plan).

La petición trae sujetos, mediciones y episodios; el esquema, las etapas y los quiebres salen del corte con que se
entrenaron los modelos (``sevarti_base`` del paquete). No hay capa 4 (necesita la historia de todo el programa).

``GET /inferencia/formulario`` describe, con ese mismo esquema, el formulario de la web: los datos generales del niño y
cada visita en orden, con sus campos (los que más pesan en el riesgo, primero) y los desenlaces que se calculan con lo
medido hasta esa visita. La web arma con él la misma petición que antes se pegaba como JSON.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import date, datetime

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from anomalias import modelo as MA
from maia_api import estado as E
from maia_api.dependencias import EXPERTO, auditar, sesion
from maia_api.esquemas import PeticionInferencia
from maia_comun import puntuacion as PU
from maia_comun.modelos_db import Usuario
from sevarti import contrato as SV

ruta = APIRouter(prefix='/inferencia', tags=['inferencia'])
TIPOS_CAMPO = {'numeric': 'numero', 'categorical': 'lista', 'boolean': 'si_no', 'date': 'fecha', 'text': 'texto'}
PRINCIPALES_POR_VISITA = 6   # además de las medidas de crecimiento


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


def _opciones(texto: object) -> list[dict]:
    """``'1=displasia;9=sin diagnóstico'`` → ``[{'valor': '1', 'etiqueta': 'displasia'}, ...]``."""
    if not isinstance(texto, str) or not texto.strip():
        return []
    salida = []
    for parte in texto.split(';'):
        codigo, _, etiqueta = parte.partition('=')
        if codigo.strip():
            salida.append({'valor': codigo.strip(), 'etiqueta': (etiqueta or codigo).strip()})
    return salida


def _pesos(modelos, esquema: pd.DataFrame) -> dict[str, float]:
    """Cuánto pesa cada variable en el riesgo: la ganancia de LightGBM de cada modelo de desenlace, normalizada por
    modelo y sumada. Las columnas ``z_<medida>_<visita>`` cuentan para las medidas de esa visita."""
    por_columna = {MA._nombre(v): v for v in esquema.variable}
    medidas: dict[str, list[str]] = defaultdict(list)
    for v, c, e in zip(esquema.variable, esquema.concepto, esquema.etapa):
        if isinstance(c, str) and isinstance(e, str):
            medidas[MA._nombre(f'z_{c}_{e}')].append(v)
    pesos: dict[str, float] = defaultdict(float)
    for m in modelos.clinico.modelos.values():
        ganancia = m.modelo.feature_importance(importance_type='gain')
        total = float(ganancia.sum()) or 1.0
        for col, g in zip(m.modelo.feature_name(), ganancia):
            for v in [por_columna[col]] if col in por_columna else medidas.get(col, []):
                pesos[v] += float(g) / total
    return pesos


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


@ruta.get('/formulario')
def formulario(_: Usuario = Depends(EXPERTO)) -> dict:
    """Los campos del formulario de cálculo, por visita, a partir del esquema del paquete activo."""
    modelos, manifest, carpeta = _activo()
    base = carpeta / 'sevarti_base'
    esquema = pd.read_parquet(base / 'esquema.parquet')
    etapas = pd.read_parquet(base / 'etapas.parquet').sort_values('orden')
    pesos = _pesos(modelos, esquema)
    maximo = max(pesos.values(), default=0.0) or 1.0

    def campo(f) -> dict:
        opciones = _opciones(getattr(f, 'categorias', None))
        tipo = TIPOS_CAMPO.get(str(f.tipo), 'texto')
        if tipo == 'lista' and not opciones:
            tipo = 'texto'   # categoría sin etiquetas en el diccionario: se escribe el código
        return {'variable': f.variable, 'etiqueta': _limpio(f.etiqueta) or f.variable, 'tipo': tipo,
                'unidad': _limpio(f.unidad), 'tema': _limpio(f.tema), 'opciones': opciones,
                'minimo': _limpio(f.rango_min), 'maximo': _limpio(f.rango_max),
                'crecimiento': isinstance(f.concepto, str), 'peso': round(pesos.get(f.variable, 0.0) / maximo, 3)}

    def ordenar(campos: list[dict]) -> list[dict]:
        mas_pesan = {c['variable'] for c in sorted(campos, key=lambda c: -c['peso'])[:PRINCIPALES_POR_VISITA] if c['peso'] > 0}
        for c in campos:
            c['principal'] = c['crecimiento'] or c['variable'] in mas_pesan
        return sorted(campos, key=lambda c: (not c['principal'], -c['peso'], c['etiqueta']))

    por_etapa: dict[str, list[dict]] = defaultdict(list)
    generales: list[dict] = []
    for f in esquema.itertuples():
        (por_etapa[f.etapa] if isinstance(f.etapa, str) else generales).append(campo(f))
    desenlaces: dict[str, list[str]] = defaultdict(list)
    for m in modelos.clinico.modelos.values():
        desenlaces[m.desenlace.momento].append(m.desenlace.nombre)
    nombres = SV.nombres_etapa(etapas)
    visitas = [{'etapa': e.etapa, 'nombre': nombres.get(e.etapa, e.etapa), 'orden': int(e.orden), 'base': _limpio(e.base),
                'edad_min': _limpio(e.edad_min), 'edad_max': _limpio(e.edad_max),
                'desenlaces': sorted(desenlaces.get(e.etapa, [])), 'campos': ordenar(por_etapa.get(e.etapa, []))}
               for e in etapas.itertuples() if por_etapa.get(e.etapa) or desenlaces.get(e.etapa)]
    return {'paquete': manifest['version'], 'fuente': manifest['fuente'], 'generales': ordenar(generales),
            'visitas': visitas}


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
