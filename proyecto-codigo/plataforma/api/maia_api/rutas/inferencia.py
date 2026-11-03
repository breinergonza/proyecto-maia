"""Inferencia de unos pocos niños con el paquete activo, sin guardar nada (sección 4.10 del plan).

La petición trae sujetos, mediciones y episodios; el esquema, las etapas y los quiebres salen del corte con que se
entrenaron los modelos (``sevarti_base`` del paquete). No hay capa 4 (necesita la historia de todo el programa).

``GET /inferencia/formulario`` describe, con ese mismo esquema, el formulario de la web: los datos generales del niño y
cada visita en orden, con sus campos (los que más pesan en el riesgo, primero) y los desenlaces que se calculan con lo
medido hasta esa visita. La web arma con él la misma petición que antes se pegaba como JSON.
"""
from __future__ import annotations

import json
import logging
import math
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from anomalias import modelo as MA
from clinico import crecimiento as CR
from maia_api import estado as E
from maia_api.consultas import opciones
from maia_api.dependencias import EXPERTO, auditar, sesion
from maia_api.esquemas import PeticionInferencia
from maia_comun import puntuacion as PU
from maia_comun.modelos_db import Usuario
from sevarti import contrato as SV

ruta = APIRouter(prefix='/inferencia', tags=['inferencia'])
registro = logging.getLogger(__name__)
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


def _calcular(p: PeticionInferencia, mediciones: list[dict], base: Path, modelos) -> dict[str, pd.DataFrame]:
    """Los dos modelos sobre los niños de la petición, sin guardar nada."""
    parcial = {
        'sujetos': pd.DataFrame([x.model_dump(exclude={'anio_nacimiento'}) for x in p.sujetos]),
        'mediciones': pd.DataFrame(mediciones),
        'episodios': pd.DataFrame([x.model_dump() for x in p.episodios]),
    }
    return PU.inferir(PU.completar(parcial, base, pd.Timestamp(p.corte) if p.corte else None), modelos)


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

    try:
        salida = _calcular(p, mediciones, base, modelos)
    except (ValueError, KeyError) as e:
        # el detalle es de Python y no le sirve a quien llena el formulario: queda en el registro del servidor
        registro.warning('No se pudo calcular el riesgo: %s: %s', type(e).__name__, e, exc_info=True)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            'No se pudo calcular el riesgo con estos datos. Revise los valores que escribió e intente de nuevo.') from e

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
        lista = opciones(getattr(f, 'categorias', None))
        tipo = TIPOS_CAMPO.get(str(f.tipo), 'texto')
        if tipo == 'lista' and not lista:
            tipo = 'texto'   # categoría sin etiquetas en el diccionario: se escribe el código
        return {'variable': f.variable, 'etiqueta': _limpio(f.etiqueta) or f.variable, 'tipo': tipo,
                'unidad': _limpio(f.unidad), 'tema': _limpio(f.tema), 'opciones': lista,
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


EG_EJEMPLO = 32.0   # semanas de gestación del niño de ejemplo: un prematuro típico del programa
RONDAS_EJEMPLO = 3  # veces que el ejemplo se corrige con lo que espera el detector de anomalías


def _valor_habitual(c: dict, crecimiento: dict[str, tuple[str, float]], ref: pd.DataFrame, corregida: float):
    """Un valor que no llama la atención para un campo del formulario: la mediana OMS de su edad en una medida de
    crecimiento, el punto medio del rango habitual del diccionario en un número, la primera opción de una lista o «No».
    Sin nada de eso (un número sin rango, un texto, una fecha), ninguno."""
    if c['variable'] in crecimiento:
        concepto, factor = crecimiento[c['variable']]
        r = ref[(ref.indicador == concepto) & (ref.sexo == 1)].sort_values('edad_dias')
        mediana = float(np.interp(max(corregida, 0.0), r.edad_dias, r.M)) / factor
        return round(mediana) if mediana >= 100 else round(mediana, 1)
    if c['tipo'] == 'numero' and c['minimo'] is not None and c['maximo'] is not None:
        medio = (float(c['minimo']) + float(c['maximo'])) / 2
        return round(medio) if abs(medio) >= 10 else round(medio, 1)
    if c['tipo'] == 'lista' and c['opciones']:
        return c['opciones'][0]['valor']
    if c['tipo'] == 'si_no':
        return 0
    return None


@ruta.get('/ejemplo')
def ejemplo(u: Usuario = Depends(EXPERTO)) -> dict:
    """Una petición lista para probar: un niño inventado (nunca uno real) con un valor habitual en cada campo principal
    de sus visitas, según el paquete activo. Sale del diccionario del paquete y de la referencia OMS, no del simulador:
    el simulador tiene sus propios nombres de variables, que no son los de la base de la Fundación.

    Es para ver cómo se ve un resultado, así que tiene que dar un riesgo y ningún dato raro: las visitas van en orden
    (cada una a la mitad de su ventana, pero antes de que abra la siguiente), se llenan las primeras hasta donde
    todavía queda un desenlace por predecir (con todas llenas no hay riesgo que mostrar) y lo que el detector de
    anomalías del paquete encuentre raro (p. ej. la mediana OMS al nacer, que es la de un bebé a término) se cambia
    por lo que él espera."""
    modelos, manifest, carpeta = _activo()
    form = formulario(u)
    base = carpeta / 'sevarti_base'
    esq = pd.read_parquet(base / 'esquema.parquet', columns=['variable', 'concepto', 'unidad'])
    etapas = pd.read_parquet(base / 'etapas.parquet').set_index('etapa')
    crecimiento = {f.variable: (f.concepto, CR.UNIDADES[f.unidad][1]) for f in esq.itertuples()
                   if f.concepto in ('peso', 'talla', 'perimetro_cefalico') and f.unidad in CR.UNIDADES}
    ref = CR.leer_referencia()
    hasta_40 = (40 - EG_EJEMPLO) * 7          # días de vida al cumplir 40 semanas: ahí empieza la edad corregida

    ventanas: list[tuple[str, float | None, float | None]] = []   # etapa, días de vida en que abre y en que cierra
    for v in form['visitas']:
        e = etapas.loc[v['etapa']]
        corrimiento = hasta_40 if e.base == 'corregida' else 0.0
        lo, hi = _limpio(e.edad_min), _limpio(e.edad_max)
        ventanas.append((v['etapa'], None if lo is None else lo + corrimiento, None if hi is None else hi + corrimiento))
    vidas: dict[str, float] = {}
    for i, (etapa, lo, hi) in enumerate(ventanas):
        vida = (lo + hi) / 2 if lo is not None and hi is not None else 0.0
        siguiente = next((x for _, x, _ in ventanas[i + 1:] if x is not None), None)
        if siguiente is not None and vida >= siguiente:   # p. ej. la salida del hospital, antes de las 40 semanas
            vida = max(siguiente - 1, lo or 0.0)
        vidas[etapa] = max(vida, 0.0)

    def valores(campos: list[dict], vida: float) -> dict[str, tuple[float, object]]:
        return {c['variable']: (vida, valor) for c in campos
                if c['principal'] and (valor := _valor_habitual(c, crecimiento, ref, vida - hasta_40)) is not None}

    generales = valores(form['generales'], 0.0)
    # el sexo, con el código que la referencia OMS lee como niño: sin él no hay curvas de crecimiento
    cfg = modelos.clinico.cfg
    nino = next((codigo for codigo, oms in cfg.codigos_sexo if oms == 1), None)
    if nino is not None:
        generales.setdefault(cfg.sexo, (0.0, nino))
    por_visita = [valores(v['campos'], vidas[v['etapa']]) for v in form['visitas']]
    corregidos: dict[str, object] = {}

    def peticion(n: int) -> dict:
        """El niño con sus n primeras visitas, nacido un mes antes de la última."""
        datos = generales | {k: x for visita in por_visita[:n] for k, x in visita.items()}
        nacimiento = date.today() - timedelta(days=round(max((vida for vida, _ in datos.values()), default=0.0)) + 30)
        return {
            'corte': None,
            'sujetos': [{'sujeto': 'ejemplo-1', 'grupo': None, 'fecha_nacimiento': nacimiento.isoformat(),
                         'eg_semanas': EG_EJEMPLO}],
            'mediciones': [{'sujeto': 'ejemplo-1', 'variable': k, 'valor': corregidos.get(k, valor),
                            'fecha': (nacimiento + timedelta(days=round(vida))).isoformat(), 'edad_dias': round(vida)}
                           for k, (vida, valor) in datos.items()],
            'episodios': [],
        }

    def calcular(n: int) -> dict[str, pd.DataFrame]:
        q = peticion(n)
        return _calcular(PeticionInferencia.model_validate(q), q['mediciones'], base, modelos)

    n = len(por_visita)
    try:
        while n > 1 and calcular(n)['riesgos'].empty:
            n -= 1
        for _ in range(RONDAS_EJEMPLO):
            alertas = calcular(n)['alertas_dato']
            esperados = {a.variable: a.esperado for a in alertas.itertuples() if pd.notna(a.esperado)}
            if not esperados:
                break
            corregidos |= {k: round(x) if abs(x) >= 10 else round(x, 1) for k, x in esperados.items()}
    except (ValueError, KeyError):
        # sin esos ajustes el ejemplo igual sirve para llenar el formulario
        registro.warning('No se pudo ajustar el niño de ejemplo', exc_info=True)
    return peticion(n) | {'nota': f'Niño inventado con valores habituales del paquete {manifest["version"]}.'}
