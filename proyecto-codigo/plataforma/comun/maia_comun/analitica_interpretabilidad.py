"""Interpretabilidad agregada de un desenlace: ``shap_global``, ``pdp``, ``motivos_frecuentes`` e ``interaccion``.

Funciones puras (sin LightGBM): reciben las contribuciones por variable (valores SHAP en el espacio del modelo) o una
función que predice el riesgo, y devuelven solo agregados (D7). Una celda con menos de ``MIN_CELDA`` niños queda en
``None`` (D4) y las distribuciones piden ``MIN_DISTRIBUCION`` niños o más (D52). Nada de lo que sale contiene un dato
por niño. Es asociación del modelo, no causa.
"""
from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence

import numpy as np
import pandas as pd

from maia_comun.analitica import MIN_CELDA, MIN_DISTRIBUCION, _r, limpio

METODO_SHAP = 'TreeSHAP (contribuciones exactas de LightGBM)'
TOP_VARIABLES = 15
PUNTOS_PDP = 20
MAX_VARIABLES_PDP = 6
CAJAS_INTERACCION = 5
MAX_PARES = 3
MAX_MOTIVOS = 15
ADVERTENCIA = 'Asociación del modelo, no causa: un dato que pesa mucho no prueba que provoque el desenlace.'


def _etiqueta(etiquetas: Mapping[str, str] | None, v: str) -> str:
    return str((etiquetas or {}).get(v) or v)


def _numerica(x: pd.Series) -> pd.Series:
    return pd.to_numeric(x, errors='coerce')


def shap_global(contrib: np.ndarray, columnas: Sequence[str], variables: pd.DataFrame,
                etiquetas: Mapping[str, str] | None = None, top: int = TOP_VARIABLES) -> dict | None:
    """Importancia media absoluta de cada variable y, para las principales, el SHAP medio por decil del valor de la
    variable (nunca un punto por niño). ``contrib`` es (niños x variables), sin la columna base."""
    contrib = np.asarray(contrib, dtype=float)
    n = int(contrib.shape[0])
    if n < MIN_DISTRIBUCION or contrib.shape[1] != len(columnas):
        return None
    media = np.nanmean(np.abs(contrib), axis=0)
    total = float(media.sum()) or 1.0
    orden = [j for j in np.argsort(-media) if media[j] > 0][:top]
    filas = [{'variable': columnas[j], 'etiqueta': _etiqueta(etiquetas, columnas[j]), 'importancia': _r(float(media[j]), 5),
              'importancia_pct': _r(100 * float(media[j]) / total, 2), 'n': n} for j in orden]
    deciles = {}
    for j in orden[:MAX_VARIABLES_PDP]:
        col = columnas[j]
        if col not in variables:
            continue
        x = _numerica(variables[col]).to_numpy()
        ok = np.isfinite(x)
        if ok.sum() < MIN_DISTRIBUCION or np.unique(x[ok]).size < 3:
            continue
        cortes = np.unique(np.quantile(x[ok], np.linspace(0, 1, 11)[1:-1]))
        caja = np.searchsorted(cortes, x[ok], side='right')
        s, v = contrib[ok, j], x[ok]
        tramos = []
        for c in range(len(cortes) + 1):
            m = caja == c
            ni = int(m.sum())
            tramos.append({'tramo': c + 1, 'n': ni if ni >= MIN_CELDA else None,
                           'valor_medio': _r(float(v[m].mean()), 4) if ni >= MIN_CELDA else None,
                           'shap_medio': _r(float(s[m].mean()), 5) if ni >= MIN_CELDA else None})
        deciles[col] = tramos
    return limpio({'n': n, 'metodo': METODO_SHAP, 'advertencia': ADVERTENCIA, 'variables': filas, 'deciles': deciles})


def pdp(predecir: Callable[[pd.DataFrame], np.ndarray], variables: pd.DataFrame, principales: Sequence[str],
        etiquetas: Mapping[str, str] | None = None, puntos: int = PUNTOS_PDP, maximo: int = MAX_VARIABLES_PDP) -> dict | None:
    """Dependencia parcial de las variables principales: el riesgo medio del grupo si todos los niños tuvieran cada
    valor de la rejilla (cuantiles 5 a 95 de la variable). ``predecir`` recibe la tabla y devuelve el riesgo."""
    n = int(len(variables))
    if n < MIN_DISTRIBUCION:
        return None
    base = float(np.mean(predecir(variables)))
    salida = []
    for col in principales:
        if col not in variables or len(salida) >= maximo:
            continue
        v = _numerica(variables[col]).dropna().to_numpy()
        if v.size < MIN_DISTRIBUCION or np.unique(v).size < 2:
            continue
        distintos = np.unique(v)
        rejilla = distintos if distintos.size <= puntos else np.unique(np.quantile(v, np.linspace(0.05, 0.95, puntos)))
        medios = []
        for g in rejilla:
            t = variables.copy()
            t[col] = g
            medios.append([_r(float(g), 4), _r(float(np.mean(predecir(t))), 5)])
        salida.append({'variable': col, 'etiqueta': _etiqueta(etiquetas, col), 'n': int(v.size),
                       'categorica': bool(distintos.size <= 8), 'puntos': medios})
    if not salida:
        return None
    return limpio({'n': n, 'riesgo_medio': _r(base, 5), 'advertencia': ADVERTENCIA, 'variables': salida})


def motivos_frecuentes(contrib: np.ndarray, columnas: Sequence[str], alerta: np.ndarray,
                       etiquetas: Mapping[str, str] | None = None, por_nino: int = 3, top: int = MAX_MOTIVOS) -> dict | None:
    """Qué variables aparecen entre los motivos que más suben el riesgo (los ``por_nino`` mayores de cada niño) de los
    niños con alerta. Solo cuántos niños con alerta los tienen; un motivo con menos de 5 niños se oculta."""
    contrib = np.asarray(contrib, dtype=float)
    alerta = np.asarray(alerta, dtype=bool)
    n_alerta = int(alerta.sum())
    if n_alerta < MIN_DISTRIBUCION or contrib.shape[1] != len(columnas):
        return None
    cuenta = np.zeros(len(columnas), dtype=int)
    for fila in contrib[alerta]:
        for j in np.argsort(-fila)[:por_nino]:
            if fila[j] > 0:
                cuenta[j] += 1
    orden = [j for j in np.argsort(-cuenta) if cuenta[j] > 0][:top]
    filas = [{'variable': columnas[j], 'etiqueta': _etiqueta(etiquetas, columnas[j]),
              'n': int(cuenta[j]) if cuenta[j] >= MIN_CELDA else None,
              'pct': _r(100 * cuenta[j] / n_alerta, 2) if cuenta[j] >= MIN_CELDA else None} for j in orden]
    return limpio({'n_alertas': n_alerta, 'por_nino': por_nino, 'advertencia': ADVERTENCIA, 'motivos': filas})


def _cajas(x: np.ndarray, cajas: int) -> tuple[np.ndarray, list[float]]:
    """Caja de cada valor (-1 si falta) y los cortes entre cajas (cuantiles)."""
    ok = np.isfinite(x)
    cortes = np.unique(np.quantile(x[ok], np.linspace(0, 1, cajas + 1)[1:-1])) if ok.any() else np.array([])
    idx = np.full(len(x), -1)
    idx[ok] = np.searchsorted(cortes, x[ok], side='right')
    return idx, [float(c) for c in cortes]


def interaccion(variables: pd.DataFrame, riesgo: np.ndarray, pares: Sequence[tuple[str, str]],
                etiquetas: Mapping[str, str] | None = None, cajas: int = CAJAS_INTERACCION) -> dict | None:
    """Riesgo medio del modelo por celdas de dos variables (cada una en cajas de igual tamaño). Una celda con menos
    de 5 niños queda con ``n`` y ``riesgo_medio`` nulos."""
    riesgo = np.asarray(riesgo, dtype=float)
    if len(variables) < MIN_DISTRIBUCION:
        return None
    salida = []
    for a, b in pares[:MAX_PARES]:
        if a not in variables or b not in variables:
            continue
        ia, ca = _cajas(_numerica(variables[a]).to_numpy(), cajas)
        ib, cb = _cajas(_numerica(variables[b]).to_numpy(), cajas)
        if not ca or not cb:
            continue
        celdas = []
        for i in range(len(ca) + 1):
            for j in range(len(cb) + 1):
                m = (ia == i) & (ib == j)
                ni = int(m.sum())
                celdas.append({'i': i, 'j': j, 'n': ni if ni >= MIN_CELDA else None,
                               'riesgo_medio': _r(float(np.nanmean(riesgo[m])), 5) if ni >= MIN_CELDA else None})
        salida.append({'a': a, 'b': b, 'etiqueta_a': _etiqueta(etiquetas, a), 'etiqueta_b': _etiqueta(etiquetas, b),
                       'cortes_a': [_r(c, 4) for c in ca], 'cortes_b': [_r(c, 4) for c in cb], 'celdas': celdas})
    if not salida:
        return None
    return limpio({'n': int(len(variables)), 'advertencia': ADVERTENCIA, 'pares': salida})


def sanear(datos: Mapping | None) -> dict:
    """Última defensa al servir un desenlace de interpretabilidad (D4, D52): oculta cualquier celda de menos de 5 niños
    y descarta lo que no cumpla el mínimo. Los entrenamientos antiguos (sin los cuatro artefactos) pasan sin cambios."""
    d = dict(datos or {})
    sg = d.get('shap_global')
    if isinstance(sg, dict):
        if (sg.get('n') or 0) < MIN_DISTRIBUCION:
            d['shap_global'] = None
        else:
            for tramos in (sg.get('deciles') or {}).values():
                for t in tramos:
                    if t.get('n') is None or t['n'] < MIN_CELDA:
                        t.update(n=None, valor_medio=None, shap_medio=None)
    mf = d.get('motivos_frecuentes')
    if isinstance(mf, dict):
        if (mf.get('n_alertas') or 0) < MIN_DISTRIBUCION:
            d['motivos_frecuentes'] = None
        else:
            for m in mf.get('motivos') or []:
                if m.get('n') is None or m['n'] < MIN_CELDA:
                    m.update(n=None, pct=None)
    ix = d.get('interaccion')
    if isinstance(ix, dict):
        for p in ix.get('pares') or []:
            for c in p.get('celdas') or []:
                if c.get('n') is None or c['n'] < MIN_CELDA:
                    c.update(n=None, riesgo_medio=None)
    pp = d.get('pdp')
    if isinstance(pp, dict) and (pp.get('n') or 0) < MIN_DISTRIBUCION:
        d['pdp'] = None
    return d
