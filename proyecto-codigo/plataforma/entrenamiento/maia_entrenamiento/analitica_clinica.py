"""Analítica del modelo clínico al terminar el entrenamiento: con las predicciones de validación (niños que el modelo no
vio) calcula los artefactos agregados de ``maia_comun.analitica`` y los guarda en ``resultados.analitica``.

* Solo agregados (D7): el riesgo por niño vive en memoria y se descarta.
* Un fallo aquí nunca rompe el entrenamiento: se captura y queda un aviso.
* ``MAIA_ANALITICA=0`` la apaga. SHAP, dependencia parcial, motivos e interacción: ``analitica_interpretabilidad``.
"""
from __future__ import annotations

import os
import sys
from datetime import UTC, datetime

import numpy as np
import pandas as pd
from sqlalchemy import func, select

from maia_comun import analitica as AN
from maia_comun import analitica_distribuciones as AD
from maia_comun import db
from maia_comun.modelos_analitica import Analitica
from maia_entrenamiento import analitica_interpretabilidad as AI
from maia_entrenamiento import anticipacion as AA
from sevarti.contrato import nacimiento_referencia

MAX_FILAS = 200_000          # submuestra para lo pesado (bootstrap, PSI): predicciones de más se submuestrean
PRIMER_ID_PROPIO = 1_000_000  # entrenamientos sin ejecución (CLI a mano): numeración aparte de las ejecuciones
SUBMODULOS_CALCULADOS = ('resumen', 'rendimiento', 'calibracion', 'poblacion', 'equidad', 'estabilidad',
                         'interpretabilidad')
# trayectorias y perfiles se calculan al pedirlos (de resultados.crecimiento y los perfiles al nacer); además, aquí se
# guardan sus agregados por riesgo con los niños de validación (``trayectorias_riesgo`` y ``perfiles``), porque la
# corrida solo calcula el riesgo de los niños en seguimiento. La anticipación solo existe si el entrenamiento incluyó
# desenlaces «_desde_N»
SUBMODULOS_PENDIENTES = ('anticipacion',)
BANDAS_EG = ((28, 'menos de 28 semanas'), (32, '28 a 31 semanas'), (37, '32 a 36 semanas'))
ROTULO_SEXO = {1: 'masculino', 2: 'femenino'}
TOP_RIESGO_ALTO = 10          # % de los niños de validación con más riesgo que forman el grupo «Riesgo alto» (D19)
INDICADORES_TRAYECTORIA = ('peso', 'talla', 'perimetro_cefalico')


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
            'r_base': m.riesgo(Xo, base=True) if m.base is not None else None,   # la regla de referencia
            # con qué datos se calcula esa regla, dichos como los dice el modelo («talla, puntaje z a 3 m EC»)
            'base_entradas': [modelo.etiquetas.get(c, c) for c in m.columnas_base] if m.base is not None else None,
            'grupos': {k: g.reindex(Xo.index).to_numpy() for k, g in grupos_base.items()},
            'trimestre': trimestres.reindex(Xo.index).to_numpy(),
            'variables': Xo, 'importancias': dict(zip(m.columnas, m.modelo.feature_importance('gain'))),
            'embudo': [{'paso': 'niños del corte de validación', 'n': int(len(suj))},
                       {'paso': f'asistieron a «{des.momento}»', 'n': int(len(X))},
                       {'paso': 'con desenlace conocido', 'n': int(ok.sum())},
                       {'paso': 'con el evento', 'n': int(y[ok].sum())}],
            'desenlace': des,
            'universo': {'categorias': grupos_base,      # todos los niños de la validación, para muestra frente a universo
                         'numericas': {'edad gestacional (semanas)': pd.to_numeric(suj.eg_semanas, errors='coerce')}},
        }
    return sal


def _submuestra(d: dict, semilla: int = 0) -> dict:
    n = len(d['r'])
    if n <= MAX_FILAS:
        return d
    idx = np.sort(np.random.default_rng(semilla).choice(n, MAX_FILAS, replace=False))
    return {**d, 'r': d['r'][idx], 'y': d['y'][idx], 'r_base': None if d.get('r_base') is None else d['r_base'][idx],
            'grupos': {k: v[idx] for k, v in d['grupos'].items()},
            'trimestre': d['trimestre'][idx], 'variables': d['variables'].iloc[idx]}


def _avisos_shap() -> list[str]:
    return []   # SHAP, dependencia parcial, motivos e interacción: ``analitica_interpretabilidad`` (contribuciones de LightGBM)


def _riesgo_alto(r: np.ndarray) -> np.ndarray:
    """Verdadero para los k = 10 % niños de validación con más riesgo, contados igual que en Rendimiento
    (``AN.metricas_top``: el mismo orden con empates al azar con semilla y k = round(n · 10 / 100)). Los empates en
    el corte no agrandan el grupo (con LightGBM son frecuentes y lo llevaban al 20 %)."""
    r = np.asarray(r, dtype=float)
    k = max(1, int(round(len(r) * TOP_RIESGO_ALTO / 100)))
    alto = np.zeros(len(r), dtype=bool)
    alto[AN._orden(r)[:k]] = True
    return alto


def crecimiento_largo(modelo, p) -> pd.DataFrame:
    """Los puntajes z de crecimiento de la validación en largo: ``sujeto``, ``etapa``, ``indicador``, ``variable``,
    ``x`` (edad corregida en meses), ``z`` y ``valor``; sin los datos improbables."""
    c = modelo.crecimiento(p)
    if c is None or not len(c):
        return pd.DataFrame(columns=['sujeto', 'etapa', 'indicador', 'variable', 'x', 'z', 'valor'])
    c = c[~c.improbable.fillna(False).astype(bool) & c.z.notna()]
    return pd.DataFrame({
        'sujeto': c.sujeto.astype(str).to_numpy(), 'etapa': c.etapa.to_numpy(), 'indicador': c.concepto.astype(str).to_numpy(),
        'variable': c.variable.to_numpy(), 'x': (pd.to_numeric(c.ec_dias, errors='coerce') / AN.DIAS_POR_MES).to_numpy(),
        'z': pd.to_numeric(c.z, errors='coerce').to_numpy(),
        'valor': pd.to_numeric(p.x.reindex(c.index), errors='coerce').to_numpy()})


def trayectorias_riesgo(d: dict, crec: pd.DataFrame, orden: dict, nombres: dict, unidades: dict) -> dict:
    """Por indicador, el puntaje z por visita de los niños de validación en «Riesgo alto» (10 % con más riesgo) y en
    el «Resto». Solo agregados (D7): ``AN.trayectorias`` da cada celda con su cifra, aunque tenga un solo niño (D63)."""
    grupo = pd.Series(np.where(_riesgo_alto(d['r']), 'Riesgo alto', 'Resto'), index=d['variables'].index.astype(str))
    sal = {}
    for indicador in INDICADORES_TRAYECTORIA:
        df = crec[(crec.indicador == indicador) & crec.sujeto.isin(grupo.index)].copy()
        if df.empty:
            continue
        df['grupo'] = df.sujeto.map(grupo)
        r = AN.trayectorias(df, orden, nombres, lambda variable, etapa: unidades.get(variable))
        if r['grupos']:
            sal[indicador] = r
    return sal


def perfiles_desenlace(d: dict, sev) -> dict:
    """Perfiles provisionales de los niños de validación con la **tasa observada** del desenlace y la proporción en
    riesgo alto. Cada categoría da su cifra, también con 1 a 4 niños."""
    from types import SimpleNamespace
    ids = pd.Index(d['variables'].index.astype(str))
    suj = sev.sujetos.assign(sujeto=sev.sujetos.sujeto.astype(str)).drop_duplicates('sujeto')
    sub = SimpleNamespace(sujetos=suj[suj.sujeto.isin(ids)][['sujeto', 'eg_semanas']],
                          mediciones=sev.mediciones.assign(sujeto=sev.mediciones.sujeto.astype(str)))
    observada = AN.resumen_perfiles_ampliado(sub, pd.DataFrame({'sujeto': ids, 'evento': d['y'].astype(int)}))
    alto = AN.resumen_perfiles_ampliado(sub, pd.DataFrame({'sujeto': ids, 'evento': _riesgo_alto(d['r']).astype(int)}))
    for clave in ('eg', 'lubchenco'):
        tasas_alto = {f['categoria']: f['tasa'] for f in alto[clave]}
        for f in observada[clave]:
            f['tasa_observada'] = f.pop('tasa')
            f['tasa_riesgo_alto'] = tasas_alto.get(f['categoria'])
    return AN.limpio({**observada, 'ninos': int(len(ids)), 'casos': int(d['y'].sum()), 'top_riesgo_alto': TOP_RIESGO_ALTO})


def agregar_vivos(resultados: dict, modelo, p, preds: dict) -> None:
    """Agrega a cada desenlace ``trayectorias_riesgo`` y ``perfiles`` (de los niños de validación). Un fallo deja aviso."""
    try:
        crec = crecimiento_largo(modelo, p)
    except Exception as e:  # noqa: BLE001  (sin crecimiento no hay trayectorias; los perfiles siguen)
        _aviso(f'no se pudo leer el crecimiento de la validación ({type(e).__name__}: {e}).')
        crec = pd.DataFrame(columns=['sujeto', 'etapa', 'indicador', 'variable', 'x', 'z', 'valor'])
    try:
        et, esq = p.sev.etapas, p.sev.esquema
        orden = dict(zip(et.etapa, et.orden))
        nombres = dict(zip(et.etapa, et.nombre)) if 'nombre' in et else {}
        unidades = {v: (str(u).strip() or None) for v, u in zip(esq.variable, esq.unidad) if isinstance(u, str)}
    except Exception as e:  # noqa: BLE001  (sin etapas ni esquema no hay trayectorias ni perfiles; el resto sigue)
        _aviso(f'no se pudieron leer las etapas o el esquema de la validación ({type(e).__name__}: {e}).')
        return
    for clave, d in preds.items():
        if clave not in resultados:
            continue
        try:
            t = trayectorias_riesgo(d, crec, orden, nombres, unidades)
            if t:
                resultados[clave]['trayectorias_riesgo'] = AN.limpio(t)
            resultados[clave]['perfiles'] = perfiles_desenlace(d, p.sev)
        except Exception as e:  # noqa: BLE001  (un desenlace que falla no frena a los demás)
            _aviso(f'no se pudieron calcular trayectorias o perfiles de {clave} ({type(e).__name__}: {e}).')


def anticipacion_artefactos(preds: dict[str, dict], orden: dict[str, int], top_pct: int = 10,
                            etapa_de_variable: dict[str, str] | None = None) -> dict[str, dict]:
    """El artefacto ``anticipacion`` de cada familia de desenlaces con modelos desde varias visitas (D20, D50); el
    detalle (y ``metricas_por_visita`` y ``primera_alerta``) está en ``maia_entrenamiento.anticipacion``."""
    completos = AA.artefactos(preds, orden, top_pct, etapa_de_variable)
    return {familia: por_tipo['anticipacion'] for familia, por_tipo in completos.items()}


def calcular(modelo, p) -> tuple[dict[str, dict[str, dict]], list[dict]]:
    """``({clave: {submodulo: artefactos}}, descripcion_de_desenlaces)``. Las familias «_desde_N» agregan además
    ``{familia: {'anticipacion', 'metricas_por_visita', 'primera_alerta'}}``."""
    avisos = _avisos_shap()
    resultados, descripcion = {}, []
    preds = predicciones(modelo, p)
    for clave, d in preds.items():
        d = _submuestra(d)
        hay_trimestres = len({t for t in d['trimestre'] if isinstance(t, str)}) > 1
        resultados[clave] = AN.analizar(
            d['r'], d['y'], grupos={k: pd.Series(v) for k, v in d['grupos'].items()},
            trimestre=pd.Series(d['trimestre']) if hay_trimestres else None,
            variables=d['variables'], embudo=d['embudo'], importancias=d['importancias'], avisos=avisos,
            r_base=d.get('r_base'), base_entradas=d.get('base_entradas'))
        if 'calibracion' in resultados[clave]:      # histograma por desenlace y muestra frente a universo
            resultados[clave].update(AD.artefactos_extra(d['y'], d['r'], d['variables'].index, d.get('universo')))
        des = d['desenlace']
        descripcion.append({'clave': clave, 'nombre': des.nombre, 'momento': des.momento,
                            'etiqueta': 'En prueba' if AN.familia_desde(clave) else 'En uso'})
    agregar_vivos(resultados, modelo, p, preds)
    try:
        AI.agregar(resultados, modelo, preds)
    except Exception as e:  # noqa: BLE001  (la interpretabilidad no rompe el resto de la analítica)
        _aviso(f'no se pudo calcular la interpretabilidad ({type(e).__name__}: {e}).')
    try:
        et, esq = p.sev.etapas, p.sev.esquema
        etapa_de_variable = {v: e for v, e in zip(esq.variable, esq.etapa) if isinstance(e, str) and e}
        for familia, por_tipo in AA.artefactos(preds, dict(zip(et.etapa, et.orden)),
                                               etapa_de_variable=etapa_de_variable).items():
            resultados.setdefault(familia, {}).update(por_tipo)   # la fila base de la familia ya trae sus artefactos
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
