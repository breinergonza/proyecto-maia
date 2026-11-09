"""Analítica del modelo clínico al terminar el entrenamiento: con las predicciones de validación (niños que el modelo no
vio) calcula los artefactos agregados de ``maia_comun.analitica`` y los guarda en ``resultados.analitica``.

* Solo agregados (D7): el riesgo por niño vive en memoria y se descarta.
* Un fallo aquí nunca rompe el entrenamiento: se captura y queda un aviso.
* ``MAIA_ANALITICA=0`` la apaga. SHAP, dependencia parcial e interacciones solo si ``shap`` está instalado.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from datetime import UTC, datetime

import numpy as np
import pandas as pd
from sqlalchemy import func, select

from maia_comun import analitica as AN
from maia_comun import db
from maia_comun.modelos_analitica import Analitica
from sevarti.contrato import nacimiento_referencia

MAX_FILAS = 200_000          # submuestra para lo pesado (bootstrap, PSI): predicciones de más se submuestrean
PRIMER_ID_PROPIO = 1_000_000  # entrenamientos sin ejecución (CLI a mano): numeración aparte de las ejecuciones
SUBMODULOS_CALCULADOS = ('resumen', 'rendimiento', 'calibracion', 'poblacion', 'equidad', 'estabilidad',
                         'interpretabilidad')
# trayectorias y perfiles se calculan al pedirlos (de resultados.crecimiento y los perfiles al nacer); la anticipación
# solo existe si el entrenamiento incluyó desenlaces «_desde_N»
SUBMODULOS_PENDIENTES = ('anticipacion',)
BANDAS_EG = ((28, 'menos de 28 semanas'), (32, '28 a 31 semanas'), (37, '32 a 36 semanas'))
ROTULO_SEXO = {1: 'masculino', 2: 'femenino'}


def activa() -> bool:
    return os.environ.get('MAIA_ANALITICA', '1').strip().lower() not in ('0', 'false', 'no', 'off', '')


def _aviso(texto: str) -> None:
    print(f'Aviso de analítica: {texto}', file=sys.stderr, flush=True)


def _banda_eg(eg: pd.Series) -> pd.Series:
    def una(v):
        if not np.isfinite(v):
            return None
        for tope, nombre in BANDAS_EG:
            if v < tope:
                return nombre
        return '37 semanas o más'
    return eg.astype(float).map(una)


def _trimestre(fecha: pd.Series) -> pd.Series:
    f = pd.to_datetime(fecha, errors='coerce')
    return (f.dt.year.astype('Int64').astype(str) + '-T' + f.dt.quarter.astype('Int64').astype(str)).where(f.notna())


def predicciones(modelo, p) -> dict[str, dict]:
    """Por desenlace con modelo, el riesgo y el evento de los niños de validación (como ``clinico.modelo.evaluar``),
    más sus grupos, trimestre de nacimiento y variables. Vive en memoria; no se guarda. ``p`` es el ``Preparado``
    de la validación."""
    suj = p.sev.sujetos.drop_duplicates('sujeto').set_index('sujeto')
    grupos_base = {'sexo': p.sexo.map(ROTULO_SEXO), 'edad gestacional': _banda_eg(suj.eg_semanas)}
    if 'grupo' in suj and suj.grupo.nunique() > 1:
        grupos_base['sede'] = suj.grupo.astype(str)
    trimestres = _trimestre(nacimiento_referencia(suj))
    matrices: dict[str, pd.DataFrame] = {}
    sal: dict[str, dict] = {}
    for clave, m in modelo.modelos.items():
        des = m.desenlace
        if des.momento not in matrices:
            matrices[des.momento] = modelo.matriz(p, des.momento)
        X = matrices[des.momento]
        y = modelo.etiqueta(p, des, m.corte_variable).reindex(X.index)
        ok = y.notna().to_numpy()
        if not ok.any() or y[ok].sum() == 0:
            continue
        Xo = X[ok]
        sal[clave] = {
            'r': m.riesgo(Xo), 'y': y[ok].to_numpy().astype(bool),
            'grupos': {k: g.reindex(Xo.index).to_numpy() for k, g in grupos_base.items()},
            'trimestre': trimestres.reindex(Xo.index).to_numpy(),
            'variables': Xo, 'importancias': dict(zip(m.columnas, m.modelo.feature_importance('gain'))),
            'embudo': [{'paso': 'niños del corte de validación', 'n': int(len(suj))},
                       {'paso': f'asistieron a «{des.momento}»', 'n': int(len(X))},
                       {'paso': 'con desenlace conocido', 'n': int(ok.sum())},
                       {'paso': 'con el evento', 'n': int(y[ok].sum())}],
            'desenlace': des,
        }
    return sal


def _submuestra(d: dict, semilla: int = 0) -> dict:
    n = len(d['r'])
    if n <= MAX_FILAS:
        return d
    idx = np.sort(np.random.default_rng(semilla).choice(n, MAX_FILAS, replace=False))
    return {**d, 'r': d['r'][idx], 'y': d['y'][idx], 'grupos': {k: v[idx] for k, v in d['grupos'].items()},
            'trimestre': d['trimestre'][idx], 'variables': d['variables'].iloc[idx]}


def _avisos_shap() -> list[str]:
    if importlib.util.find_spec('shap') is None:
        return ['SHAP, dependencia parcial e interacciones omitidos: el paquete shap no está instalado.']
    return ['shap está instalado, pero SHAP, dependencia parcial e interacciones aún no se calculan en esta versión.']


def anticipacion_artefactos(preds: dict[str, dict], orden: dict[str, int], top_pct: int = 10) -> dict[str, dict]:
    """Por familia de desenlaces «_desde_N» con modelos desde varias visitas (D50): por visita de partida los casos
    detectados y las alertas acertadas con el ``top_pct`` % de mayor riesgo, la ventaja en visitas (visita del
    desenlace menos visita de partida) y qué parte de los casos se avisó con al menos una visita de antelación. Solo
    agregados (D7): las predicciones por niño no se guardan. ``preds`` es lo de ``predicciones``; ``orden``, el orden de
    las visitas."""
    familias: dict[str, list[tuple[str, dict]]] = {}
    for clave, d in preds.items():
        f = AN.familia_desde(clave)
        if f is not None:
            familias.setdefault(f[0], []).append((clave, d))
    sal = {}
    for familia, partes in familias.items():
        if len(partes) < 2:      # una sola visita de partida no es una anticipación
            continue
        visitas, casos, avisados = [], set(), set()
        for clave, d in sorted(partes, key=lambda kv: orden.get(kv[1]['desenlace'].momento, 99)):
            des = d['desenlace']
            ventaja = orden.get(des.etapa, 0) - orden.get(des.momento, 0)
            y, r = np.asarray(d['y'], dtype=bool), np.asarray(d['r'], dtype=float)
            ninos = np.asarray(d['variables'].index)
            k = max(1, int(round(len(y) * top_pct / 100)))
            alerta = np.zeros(len(y), dtype=bool)
            alerta[AN._orden(r)[:k]] = True
            casos |= set(ninos[y])
            if ventaja >= 1:
                avisados |= set(ninos[y & alerta])
            visitas.append({'clave': clave, 'desde': des.momento, 'etapa': des.etapa, 'ventaja_visitas': int(ventaja),
                            **AN.anticipacion_visita(y, r, top_pct)})
        n_casos, n_av = len(casos), len(avisados)
        sal[familia] = {
            'familia': familia, 'nombre': partes[0][1]['desenlace'].nombre.split(' (riesgo')[0], 'top_pct': top_pct,
            'etiqueta': 'En prueba', 'visitas': visitas,
            'avisados_antes': {'casos': n_casos if n_casos >= AN.MIN_CELDA else None,
                               'avisados': n_av if n_av >= AN.MIN_CELDA else None,
                               'pct': AN._r(100 * n_av / n_casos, 2) if n_casos >= AN.MIN_CELDA else None,
                               'meta': 'D12: avisar al menos una visita antes del desenlace'}}
    return AN.limpio(sal)


def calcular(modelo, p) -> tuple[dict[str, dict[str, dict]], list[dict]]:
    """``({clave: {submodulo: artefactos}}, descripcion_de_desenlaces)``. Las familias «_desde_N» agregan además
    ``{familia: {'anticipacion': ...}}``."""
    avisos = _avisos_shap()
    resultados, descripcion = {}, []
    preds = predicciones(modelo, p)
    for clave, d in preds.items():
        d = _submuestra(d)
        hay_trimestres = len({t for t in d['trimestre'] if isinstance(t, str)}) > 1
        resultados[clave] = AN.analizar(
            d['r'], d['y'], grupos={k: pd.Series(v) for k, v in d['grupos'].items()},
            trimestre=pd.Series(d['trimestre']) if hay_trimestres else None,
            variables=d['variables'], embudo=d['embudo'], importancias=d['importancias'], avisos=avisos)
        des = d['desenlace']
        descripcion.append({'clave': clave, 'nombre': des.nombre, 'momento': des.momento,
                            'etiqueta': 'En prueba' if AN.familia_desde(clave) else 'En uso'})
    try:
        et = p.sev.etapas
        for familia, datos in anticipacion_artefactos(preds, dict(zip(et.etapa, et.orden))).items():
            resultados[familia] = {'anticipacion': datos}
    except Exception as e:  # noqa: BLE001  (la anticipación no rompe el resto de la analítica)
        _aviso(f'no se pudo calcular la anticipación ({type(e).__name__}: {e}).')
    return resultados, descripcion


def siguiente_id(s) -> int:
    ultimo = s.scalar(select(func.max(Analitica.entrenamiento_id)).where(Analitica.entrenamiento_id >= PRIMER_ID_PROPIO))
    return (ultimo or PRIMER_ID_PROPIO - 1) + 1


def guardar(resultados: dict[str, dict[str, dict]], descripcion: list[dict], meta: dict) -> int:
    """Una fila ``meta`` y una por desenlace y submódulo; devuelve el id del entrenamiento."""
    ejecucion = os.environ.get('MAIA_EJECUCION_ID')
    ejecucion_id = int(ejecucion) if ejecucion and ejecucion.isdigit() else None
    with db.sesion() as s:
        entrenamiento = ejecucion_id if ejecucion_id is not None else siguiente_id(s)
        s.query(Analitica).filter(Analitica.entrenamiento_id == entrenamiento).delete()
        base = dict(entrenamiento_id=entrenamiento, ejecucion_id=ejecucion_id, modelo='clinico')
        listos = list(SUBMODULOS_CALCULADOS)
        if any('anticipacion' in por_submodulo for por_submodulo in resultados.values()):
            listos.append('anticipacion')
        s.add(Analitica(**base, desenlace=None, tipo='meta', datos=AN.limpio({
            **meta, 'desenlaces': descripcion, 'submodulos': {m: 'ok' for m in listos},
            'pendientes': [m for m in SUBMODULOS_PENDIENTES if m not in listos],
            'generada': datetime.now(UTC).isoformat()})))
        for clave, por_submodulo in resultados.items():
            for tipo, datos in por_submodulo.items():
                s.add(Analitica(**base, desenlace=clave, tipo=tipo, datos=datos))
    return entrenamiento


def analizar_y_guardar(modelo, p, meta: dict) -> int | None:
    """Calcula y guarda; ante cualquier fallo deja un aviso y devuelve ``None``."""
    if not activa():
        return None
    try:
        resultados, descripcion = calcular(modelo, p)
        if not resultados:
            _aviso('ningún desenlace tuvo casos en la validación; no se guardó nada.')
            return None
        return guardar(resultados, descripcion, meta)
    except Exception as e:  # noqa: BLE001  (la analítica nunca rompe el entrenamiento)
        _aviso(f'no se pudo calcular o guardar ({type(e).__name__}: {e}). El entrenamiento sigue.')
        return None
