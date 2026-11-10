"""Dos artefactos agregados de la analítica que se calculan junto a los demás, con las mismas reglas de privacidad:

* ``hist_riesgo``: cómo se reparte el riesgo entre los niños con el desenlace y los que no (Calibración y decisión).
* ``distribuciones_muestra_universo``: si los niños con los que se evaluó el modelo (la muestra) se parecen a todos los
  niños del corte de validación (el universo) en sexo, edad gestacional, sede, trimestre y edad gestacional en semanas
  (Población), para ver sesgos de selección.

Solo agregados (D7). Un conteo con menos de ``MIN_CELDA`` niños queda ``None`` (D4) y un porcentaje, una mediana o un
cuantil exigen ``MIN_DISTRIBUCION`` niños o más (D52).
"""
from __future__ import annotations

from collections.abc import Mapping

import numpy as np
import pandas as pd

from maia_comun.analitica import MIN_CELDA, MIN_DISTRIBUCION, _r, limpio

TRAMOS = 20
CUANTILES = (('p5', 5), ('p25', 25), ('p50', 50), ('p75', 75), ('p95', 95))
MAX_CATEGORIAS = 12      # una variable con más categorías es texto libre, no un reparto que se pueda leer


def _cuenta(c: int) -> int | None:
    return int(c) if c >= MIN_CELDA else None


def hist_riesgo(y: np.ndarray, r: np.ndarray, tramos: int = TRAMOS) -> dict:
    """Histograma del riesgo en tramos iguales, aparte para los niños con el desenlace (``con``) y sin él (``sin``).
    Un tramo con menos de 5 niños queda ``None``. Con menos de 20 niños no hay gráfica."""
    y = np.asarray(y, dtype=bool)
    r = np.asarray(r, dtype=float)
    ok = np.isfinite(r)
    y, r = y[ok], r[ok]
    n, casos = int(len(y)), int(y.sum())
    base = {'n': n, 'casos': _cuenta(casos), 'tramos': [], 'riesgo_medio_con': None, 'riesgo_medio_sin': None,
            'mediana_con': None, 'mediana_sin': None}
    if n < MIN_DISTRIBUCION:
        return {**base, 'estado': 'insuficiente'}
    bajo = float(r.min())
    alto = float(r.max()) if r.max() > r.min() else bajo + 1
    bordes = np.linspace(bajo, alto, tramos + 1)
    con = np.histogram(r[y], bordes)[0]
    sin = np.histogram(r[~y], bordes)[0]
    for i in range(tramos):
        base['tramos'].append({'desde': _r(bordes[i]), 'hasta': _r(bordes[i + 1]),
                               'con': _cuenta(con[i]), 'sin': _cuenta(sin[i])})
    for clave, m in (('con', y), ('sin', ~y)):
        v = r[m]
        if len(v) >= MIN_DISTRIBUCION:      # D52: promedio y mediana solo con una cohorte de 20 o más
            base[f'riesgo_medio_{clave}'] = _r(float(v.mean()))
            base[f'mediana_{clave}'] = _r(float(np.median(v)))
    return limpio({**base, 'estado': 'ok'})


def _reparto(universo: pd.Series, muestra: pd.Series) -> dict | None:
    u, m = universo.dropna(), muestra.dropna()
    if len(u) < MIN_DISTRIBUCION or len(m) < MIN_DISTRIBUCION:
        return None
    cats = sorted(u.astype(str).unique(), key=lambda c: (len(c), c))
    if len(cats) < 2 or len(cats) > MAX_CATEGORIAS:
        return None
    u, m = u.astype(str), m.astype(str)
    filas, brecha = [], []
    for c in cats:
        cu, cm = int((u == c).sum()), int((m == c).sum())
        fila = {'categoria': c, 'n_universo': _cuenta(cu), 'n_muestra': _cuenta(cm),
                'pct_universo': _r(100 * cu / len(u), 1) if cu >= MIN_CELDA else None,
                'pct_muestra': _r(100 * cm / len(m), 1) if cm >= MIN_CELDA else None, 'diferencia_pp': None}
        if fila['pct_universo'] is not None and fila['pct_muestra'] is not None:
            fila['diferencia_pp'] = _r(fila['pct_muestra'] - fila['pct_universo'], 1)
            brecha.append(abs(fila['diferencia_pp']))
        filas.append(fila)
    return {'n_universo': int(len(u)), 'n_muestra': int(len(m)), 'categorias': filas,
            'diferencia_maxima_pp': _r(max(brecha), 1) if brecha else None}


def _cuantiles(universo: pd.Series, muestra: pd.Series) -> dict | None:
    u = pd.to_numeric(universo, errors='coerce').dropna().to_numpy(dtype=float)
    m = pd.to_numeric(muestra, errors='coerce').dropna().to_numpy(dtype=float)
    if len(u) < MIN_DISTRIBUCION or len(m) < MIN_DISTRIBUCION:
        return None
    return {'n_universo': int(len(u)), 'n_muestra': int(len(m)),
            'universo': {k: _r(float(np.percentile(u, q)), 2) for k, q in CUANTILES},
            'muestra': {k: _r(float(np.percentile(m, q)), 2) for k, q in CUANTILES}}


def distribuciones_muestra_universo(muestra_ids, universo_categorias: Mapping[str, pd.Series],
                                    universo_numericas: Mapping[str, pd.Series] | None = None) -> dict:
    """Reparto (en %) de cada variable en la muestra frente al universo. ``universo_*`` son series indexadas por niño
    para todo el universo; ``muestra_ids`` son los niños de la muestra. Una variable sin 20 niños en alguno de los dos
    lados, o con una sola categoría, no se devuelve."""
    ids = pd.Index(muestra_ids)
    categoricas, numericas = {}, {}
    for nombre, serie in universo_categorias.items():
        serie = pd.Series(serie)
        r = _reparto(serie, serie.reindex(ids.intersection(serie.index)))
        if r:
            categoricas[str(nombre)] = r
    for nombre, serie in (universo_numericas or {}).items():
        serie = pd.Series(serie)
        q = _cuantiles(serie, serie.reindex(ids.intersection(serie.index)))
        if q:
            numericas[str(nombre)] = q
    return limpio({
        'estado': 'ok' if categoricas or numericas else 'insuficiente',
        'universo': 'niños del corte de validación', 'muestra': 'niños con el desenlace conocido',
        'minimo_ninos': MIN_DISTRIBUCION, 'categoricas': categoricas, 'numericas': numericas})


def artefactos_extra(y: np.ndarray, r: np.ndarray, muestra_ids, universo: Mapping | None) -> dict[str, dict]:
    """Los dos artefactos de un desenlace, listos para guardar como filas ``hist_riesgo`` y
    ``distribuciones_muestra_universo``. Sin universo, solo el histograma."""
    sal = {'hist_riesgo': hist_riesgo(y, r)}
    if universo:
        sal['distribuciones_muestra_universo'] = distribuciones_muestra_universo(
            muestra_ids, universo.get('categorias', {}), universo.get('numericas'))
    return sal
