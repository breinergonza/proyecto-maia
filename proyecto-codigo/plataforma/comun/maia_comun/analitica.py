"""Artefactos agregados de la analítica de un modelo, a partir de las predicciones de evaluación (niños que el modelo
no vio): riesgo ``r`` y evento ``y`` por niño, y opcionalmente grupos (sexo, edad gestacional, sede) y trimestre.

Todo lo que sale es JSON serializable y *agregado* (D7): las predicciones por niño no se guardan. Una celda con menos de
``MIN_CELDA`` niños se omite (queda ``None``, D4) y las distribuciones y cuantiles piden ``MIN_DISTRIBUCION`` o más
(D52). Los umbrales de los semáforos de ``chequeos`` son visibles en cada resultado.

``analizar`` devuelve un diccionario por submódulo (``rendimiento``, ``calibracion``, ``poblacion``, ``equidad``,
``estabilidad``, ``interpretabilidad``, ``chequeos``) con los artefactos de un desenlace.
"""
from __future__ import annotations

import math
import re
from collections.abc import Mapping

import numpy as np
import pandas as pd

MIN_CELDA = 5            # D4: una celda con menos niños se omite
MIN_DISTRIBUCION = 20    # D52: distribuciones, cuantiles e intervalos
TOPS = (5, 10, 20, 30, 40)
MAX_PUNTOS = 100
REMUESTRAS = 200
MAX_FILAS_BOOTSTRAP = 20_000

UMBRALES = {
    'auc': {'verde': 0.7, 'ambar': 0.6, 'texto': 'AUC >= 0,7 verde; entre 0,6 y 0,7 ámbar; menos de 0,6 rojo'},
    'calibracion': {'verde': (0.8, 1.25), 'ambar': (0.67, 1.5),
                    'texto': 'riesgo medio / casos observados entre 0,8 y 1,25 verde; entre 0,67 y 1,5 ámbar; fuera, rojo'},
    'equidad': {'verde': 0.05, 'ambar': 0.10,
                'texto': 'diferencia de AUC entre el peor subgrupo y el total: hasta 0,05 verde; hasta 0,10 ámbar; más, rojo'},
    'estabilidad': {'verde': 0.10, 'ambar': 0.25,
                    'texto': 'PSI máximo de las variables entre trimestres: menos de 0,10 verde; menos de 0,25 ámbar; más, rojo'},
    'poblacion': {'verde': 100, 'ambar': 30,
                  'texto': 'casos con el evento en la validación: 100 o más verde; 30 a 99 ámbar; menos de 30 rojo'},
}


# ------------------------------------------------------------------------------------------------ utilidades

def limpio(x):
    """Convierte a tipos de Python que JSON acepta: NaN e infinitos pasan a ``None``."""
    if isinstance(x, Mapping):
        return {str(k): limpio(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [limpio(v) for v in x]
    if isinstance(x, np.ndarray):
        return [limpio(v) for v in x.tolist()]
    if isinstance(x, (np.bool_, bool)):
        return bool(x)
    if isinstance(x, (np.integer, int)):
        return int(x)
    if isinstance(x, (np.floating, float)):
        f = float(x)
        return f if math.isfinite(f) else None
    return x


def _r(v: float | None, d: int = 4) -> float | None:
    return None if v is None or not math.isfinite(v) else round(float(v), d)


def auc(y: np.ndarray, r: np.ndarray) -> float:
    """AUC por rangos (Mann-Whitney); NaN si falta una de las dos clases."""
    y = np.asarray(y, dtype=bool)
    n1, n0 = int(y.sum()), int((~y).sum())
    if not n1 or not n0:
        return float('nan')
    rangos = pd.Series(np.asarray(r, dtype=float)).rank().to_numpy()
    return float((rangos[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def auc_con_ic(y: np.ndarray, r: np.ndarray, semilla: int = 0, remuestras: int = REMUESTRAS) -> dict:
    """AUC con intervalo del 95 % por bootstrap (sobre una submuestra acotada si hay muchos niños)."""
    y = np.asarray(y, dtype=bool)
    r = np.asarray(r, dtype=float)
    a = auc(y, r)
    n1 = int(y.sum())
    sal = {'auc': _r(a), 'ic_bajo': None, 'ic_alto': None, 'n': int(len(y)), 'casos': n1}
    if len(y) < MIN_DISTRIBUCION or n1 < MIN_CELDA or len(y) - n1 < MIN_CELDA:
        return sal
    rng = np.random.default_rng(semilla)
    if len(y) > MAX_FILAS_BOOTSTRAP:
        idx = rng.choice(len(y), MAX_FILAS_BOOTSTRAP, replace=False)
        y, r = y[idx], r[idx]
    vals = []
    for _ in range(remuestras):
        i = rng.integers(0, len(y), len(y))
        v = auc(y[i], r[i])
        if math.isfinite(v):
            vals.append(v)
    if len(vals) >= 20:
        sal['ic_bajo'], sal['ic_alto'] = _r(np.percentile(vals, 2.5)), _r(np.percentile(vals, 97.5))
    return sal


def _orden(r: np.ndarray, semilla: int = 0) -> np.ndarray:
    """De mayor a menor riesgo; los empates se ordenan al azar (siempre igual con la misma semilla)."""
    azar = np.random.default_rng(semilla).random(len(r))
    return np.lexsort((azar, -np.asarray(r, dtype=float)))


def _adelgazar(xs: np.ndarray, ys: np.ndarray, n: int = MAX_PUNTOS) -> list[list[float | None]]:
    if len(xs) > n:
        idx = np.unique(np.linspace(0, len(xs) - 1, n).round().astype(int))
        xs, ys = xs[idx], ys[idx]
    return [[_r(a), _r(b)] for a, b in zip(xs, ys)]


# ------------------------------------------------------------------------------------------------ rendimiento

def curvas(y: np.ndarray, orden: np.ndarray) -> tuple[dict, dict]:
    """ROC y precisión-sensibilidad (hasta 100 puntos cada una)."""
    ys = np.asarray(y, dtype=bool)[orden]
    p, n = int(ys.sum()), int((~ys).sum())
    tp, fp = np.cumsum(ys), np.cumsum(~ys)
    ceros = np.array([0.0])
    roc = {'puntos': _adelgazar(np.concatenate([ceros, fp / max(n, 1)]), np.concatenate([ceros, tp / max(p, 1)])),
           'ejes': ['falsas alarmas (fracción de niños sin el evento)', 'casos detectados (fracción)']}
    sens, prec = tp / max(p, 1), tp / np.arange(1, len(ys) + 1)
    pr = {'puntos': _adelgazar(np.concatenate([ceros, sens]), np.concatenate([[1.0], prec])),
          'prevalencia': _r(p / len(ys)), 'ejes': ['casos detectados (fracción)', 'alertas acertadas (fracción)']}
    return roc, pr


def _fila_top(ys: np.ndarray, k: int, p: int, n_sin: int) -> dict:
    n = len(ys)
    tp = int(ys[:k].sum())
    fp = k - tp
    fila = {'k': int(k), 'alertas': int(k), 'casos_detectados_pct': None, 'alertas_acertadas_pct': None,
            'sin_falsa_alarma_pct': None, 'alertas_por_1000': _r(1000 * k / n, 2)}
    if k >= MIN_CELDA:
        fila['casos_detectados_pct'] = _r(100 * tp / max(p, 1), 2)
        fila['alertas_acertadas_pct'] = _r(100 * tp / k, 2)
        fila['sin_falsa_alarma_pct'] = _r(100 * (n_sin - fp) / max(n_sin, 1), 2)
    return fila


def metricas_top(y: np.ndarray, orden: np.ndarray) -> tuple[list[dict], list[dict], list[dict]]:
    """Para alertar a los 5, 10, 20, 30 y 40 % de mayor riesgo y para cada uno de 100 percentiles: casos detectados,
    alertas acertadas, niños sin falsa alarma y alertas por 1.000; la matriz de confusión (celdas < 5 omitidas)."""
    ys = np.asarray(y, dtype=bool)[orden]
    n, p = len(ys), int(ys.sum())
    n_sin = n - p
    tops, confusion = [], []
    for t in TOPS:
        k = max(1, int(round(n * t / 100)))
        tops.append({'top_pct': t, **_fila_top(ys, k, p, n_sin)})
        tp = int(ys[:k].sum())
        celdas = {'tp': tp, 'fp': k - tp, 'fn': p - tp, 'tn': n_sin - (k - tp)}
        confusion.append({'top_pct': t, **{c: (v if v >= MIN_CELDA else None) for c, v in celdas.items()}})
    percentiles = [{'percentil': q, **_fila_top(ys, max(1, int(round(n * q / 100))), p, n_sin)}
                   for q in range(1, 101)]
    return tops, percentiles, confusion


def lift(y: np.ndarray, orden: np.ndarray) -> dict:
    """Por decil de riesgo (del más alto al más bajo): tasa del decil y cuántas veces la tasa general."""
    ys = np.asarray(y, dtype=bool)[orden]
    n, base = len(ys), float(np.mean(ys))
    deciles = []
    for i, trozo in enumerate(np.array_split(ys, 10), start=1):
        fila = {'decil': i, 'niños': int(len(trozo)), 'tasa': None, 'lift': None}
        if len(trozo) >= MIN_CELDA and base > 0:
            fila['tasa'] = _r(float(trozo.mean()))
            fila['lift'] = _r(float(trozo.mean()) / base, 3)
        deciles.append(fila)
    acumulado = []
    for t in TOPS:
        k = max(1, int(round(n * t / 100)))
        acumulado.append({'top_pct': t, 'lift': _r(float(ys[:k].mean()) / base, 3) if base > 0 and k >= MIN_CELDA else None})
    return {'tasa_general': _r(base), 'deciles': deciles, 'acumulado': acumulado}


def top_k(y: np.ndarray, orden: np.ndarray, ks: tuple[int, ...] = (10, 25, 50, 100, 250, 500, 1000)) -> list[dict]:
    """Al alertar a los k niños de mayor riesgo: cuántos eran casos y qué parte de todos los casos."""
    ys = np.asarray(y, dtype=bool)[orden]
    p = int(ys.sum())
    sal = []
    for k in ks:
        if k > len(ys) or k < MIN_CELDA:
            continue
        tp = int(ys[:k].sum())
        sal.append({'k': k, 'casos': tp if tp >= MIN_CELDA else None,
                    'acertadas_pct': _r(100 * tp / k, 2), 'detectados_pct': _r(100 * tp / max(p, 1), 2)})
    return sal


def _precision_promedio(ys_ordenado: np.ndarray) -> float:
    if not ys_ordenado.any():
        return float('nan')
    aciertos = np.cumsum(ys_ordenado)
    return float(np.mean((aciertos / np.arange(1, len(ys_ordenado) + 1))[ys_ordenado]))


def referencia(y: np.ndarray, r_base: np.ndarray, semilla: int = 0) -> dict:
    """La regla de referencia (modelo reducido con edad gestacional y pesos basales): su AUC con intervalo y los casos
    que reúne el 10 % de mayor riesgo, para ponerlos junto a los del modelo completo."""
    y = np.asarray(y, dtype=bool)
    ys = y[_orden(r_base, semilla)]
    k = max(1, int(np.ceil(0.10 * len(ys))))
    return {'auc_desenlace': auc_con_ic(y, r_base, semilla),
            'casos_top10_pct': _r(100 * ys[:k].sum() / max(int(y.sum()), 1), 1)}


def rendimiento(y: np.ndarray, r: np.ndarray, semilla: int = 0, r_base: np.ndarray | None = None) -> dict:
    orden = _orden(r, semilla)
    roc, pr = curvas(y, orden)
    tops, percentiles, confusion = metricas_top(y, orden)
    out = {'auc_desenlace': auc_con_ic(y, r, semilla), 'roc': roc, 'pr': pr,
           'pr_auc': _r(_precision_promedio(np.asarray(y, dtype=bool)[orden])),
           'metricas_por_top': tops, 'metricas_por_percentil': percentiles, 'confusion_por_top': confusion,
           'lift': lift(y, orden), 'top_k': top_k(y, orden)}
    if r_base is not None:
        out['referencia'] = referencia(y, r_base, semilla)
    return out


# ------------------------------------------------------------------------------------------------ calibración

def calibracion(y: np.ndarray, r: np.ndarray) -> dict:
    """10 grupos de igual tamaño por riesgo (riesgo medio frente a lo observado), histograma del riesgo, Brier,
    razón riesgo medio / observado y error de calibración esperado."""
    y = np.asarray(y, dtype=float)
    r = np.asarray(r, dtype=float)
    n = len(y)
    out: dict = {'n': int(n), 'bins': [], 'histograma': [], 'brier': _r(float(np.mean((r - y) ** 2))),
                 'riesgo_medio': _r(float(r.mean())), 'observado': _r(float(y.mean()))}
    out['razon_riesgo_observado'] = _r(float(r.mean()) / float(y.mean())) if y.mean() > 0 else None
    if n < MIN_DISTRIBUCION:
        return out
    rangos = pd.Series(r).rank(method='first').to_numpy()
    bins = np.minimum((10 * (rangos - 1) / n).astype(int), 9)
    ece = 0.0
    for b in range(10):
        m = bins == b
        if m.sum() < MIN_CELDA:
            continue
        rm, ob = float(r[m].mean()), float(y[m].mean())
        ece += m.sum() / n * abs(rm - ob)
        out['bins'].append({'bin': b + 1, 'n': int(m.sum()), 'riesgo_medio': _r(rm), 'observado': _r(ob)})
    out['ece'] = _r(ece)
    alto = float(r.max()) if r.max() > r.min() else float(r.min()) + 1
    cuentas, bordes = np.histogram(r, bins=20, range=(float(r.min()), alto))
    out['histograma'] = [{'desde': _r(bordes[i]), 'hasta': _r(bordes[i + 1]),
                          'n': int(c) if c >= MIN_CELDA else None} for i, c in enumerate(cuentas)]
    return out


def decision(y: np.ndarray, r: np.ndarray, maximo: float = 0.5, pasos: int = 50) -> dict:
    """Beneficio neto de alertar según el riesgo frente a alertar a todos o a ninguno, por umbral de riesgo."""
    y = np.asarray(y, dtype=bool)
    r = np.asarray(r, dtype=float)
    n, prev = len(y), float(y.mean())
    puntos = []
    for pt in np.linspace(0.01, maximo, pasos):
        alerta = r >= pt
        tp, fp = int((alerta & y).sum()), int((alerta & ~y).sum())
        w = pt / (1 - pt)
        puntos.append({'umbral': _r(pt), 'modelo': _r(tp / n - fp / n * w), 'todos': _r(prev - (1 - prev) * w),
                       'ninguno': 0.0, 'alertas_pct': _r(100 * alerta.mean(), 2)})
    return {'prevalencia': _r(prev), 'puntos': puntos,
            'lectura': 'Beneficio neto = casos detectados menos falsas alarmas ponderadas por el umbral de riesgo, '
                       'por niño evaluado. Útil donde el modelo supera a "alertar a todos" y a "no alertar a nadie".'}


# ------------------------------------------------------------------------------------------------ subgrupos y tiempo

def subgrupos(y: np.ndarray, r: np.ndarray, grupos: Mapping[str, pd.Series], semilla: int = 0) -> dict:
    """AUC (con IC), n, casos, riesgo medio y qué parte de los casos cae en el 10 % de más riesgo global, por sexo,
    categoría de edad gestacional, sede, etc. Un grupo con menos de 5 niños se omite."""
    y = np.asarray(y, dtype=bool)
    r = np.asarray(r, dtype=float)
    k10 = max(1, int(round(0.10 * len(r))))
    alto = np.zeros(len(r), dtype=bool)
    alto[_orden(r, semilla)[:k10]] = True
    out = {}
    for nombre, g in grupos.items():
        g = pd.Series(np.asarray(g, dtype=object))
        filas = []
        for nivel in sorted(g.dropna().unique(), key=str):
            m = (g == nivel).to_numpy()
            if m.sum() < MIN_CELDA:
                continue
            grande = m.sum() >= MIN_DISTRIBUCION
            fila = {'grupo': str(nivel), **auc_con_ic(y[m], r[m], semilla), 'riesgo_medio': _r(float(r[m].mean())),
                    'observado': _r(float(y[m].mean())),
                    'tasa_alerta_top10': _r(float(alto[m].mean())) if grande else None,
                    'sensibilidad_top10': (_r(float((alto & y)[m].sum() / y[m].sum()))
                                           if grande and y[m].sum() >= MIN_CELDA else None)}
            if not grande:
                fila['auc'] = fila['ic_bajo'] = fila['ic_alto'] = None
            filas.append(fila)
        if filas:
            out[nombre] = filas
    return out


def por_trimestre(y: np.ndarray, r: np.ndarray, trimestre: pd.Series, semilla: int = 0) -> dict:
    """AUC por trimestre y alertas por trimestre con un mismo umbral (el del 10 % de más riesgo de todo el periodo)."""
    y = np.asarray(y, dtype=bool)
    r = np.asarray(r, dtype=float)
    t = np.asarray(trimestre, dtype=object)
    k10 = max(1, int(round(0.10 * len(r))))
    umbral = float(r[_orden(r, semilla)[k10 - 1]])
    metricas, alertas = [], []
    for q in sorted({v for v in t if isinstance(v, str)}):
        m = t == q
        if m.sum() < MIN_CELDA:
            continue
        fila = {'trimestre': q, **auc_con_ic(y[m], r[m], semilla, remuestras=100)}
        if m.sum() < MIN_DISTRIBUCION:
            fila['auc'] = fila['ic_bajo'] = fila['ic_alto'] = None
        metricas.append(fila)
        a = int((r[m] >= umbral).sum())
        alertas.append({'trimestre': q, 'n': int(m.sum()), 'alertas': a if a >= MIN_CELDA else None,
                        'alertas_por_1000': _r(1000 * a / m.sum(), 2) if m.sum() >= MIN_DISTRIBUCION else None,
                        'casos': int(y[m].sum()) if y[m].sum() >= MIN_CELDA else None})
    return {'umbral_riesgo': _r(umbral), 'metricas_trimestre': metricas, 'alertas_trimestre': alertas}


def psi(referencia: np.ndarray, actual: np.ndarray, cortes: int = 10) -> float | None:
    """Índice de estabilidad de la población: cortes por deciles de la referencia."""
    ref = pd.Series(referencia).dropna().to_numpy(dtype=float)
    act = pd.Series(actual).dropna().to_numpy(dtype=float)
    if len(ref) < MIN_DISTRIBUCION or len(act) < MIN_DISTRIBUCION:
        return None
    bordes = np.unique(np.quantile(ref, np.linspace(0, 1, cortes + 1)))
    if len(bordes) < 3:
        return 0.0
    bordes[0], bordes[-1] = -np.inf, np.inf
    a = np.histogram(ref, bordes)[0] / len(ref)
    b = np.histogram(act, bordes)[0] / len(act)
    a, b = np.clip(a, 1e-4, None), np.clip(b, 1e-4, None)
    return float(np.sum((b - a) * np.log(b / a)))


def estabilidad_variables(variables: pd.DataFrame, trimestre: pd.Series, orden: list[str] | None = None,
                          max_variables: int = 15) -> dict:
    """PSI de cada variable numérica en cada trimestre frente al primero con 20 o más niños."""
    t = pd.Series(np.asarray(trimestre, dtype=object), index=variables.index)
    cuenta = t.value_counts()
    trimestres = sorted(q for q, n in cuenta.items() if isinstance(q, str) and n >= MIN_DISTRIBUCION)
    if len(trimestres) < 2:
        return {}
    num = [c for c in (orden or list(variables.columns)) if c in variables and pd.api.types.is_numeric_dtype(variables[c])]
    ref = variables[t == trimestres[0]]
    out: dict[str, dict] = {}
    for c in num[:max_variables]:
        fila = {q: _r(psi(ref[c].to_numpy(), variables.loc[t == q, c].to_numpy())) for q in trimestres[1:]}
        if any(v is not None for v in fila.values()):
            out[str(c)] = fila
    return {'referencia': trimestres[0], 'trimestres': trimestres[1:], 'variables': out}


# ------------------------------------------------------------------------------------------------ población e interpretabilidad

def poblacion(y: np.ndarray, variables: pd.DataFrame | None = None, embudo: list[dict] | None = None,
              max_variables: int = 20) -> dict:
    """Embudo (cuántos niños quedan en cada paso), eventos y porcentaje de datos faltantes por variable."""
    y = np.asarray(y, dtype=bool)
    out = {'embudo': [{**e, 'n': e['n'] if e['n'] >= MIN_CELDA else None} for e in (embudo or [])],
           'eventos': {'niños': int(len(y)), 'casos': int(y.sum()) if y.sum() >= MIN_CELDA else None,
                       'tasa': _r(float(y.mean()))},
           'nulos': []}
    if variables is not None and len(variables) >= MIN_DISTRIBUCION:
        pct = (100 * variables.isna().mean()).sort_values(ascending=False)
        out['nulos'] = [{'variable': str(c), 'nulos_pct': _r(float(v), 2)} for c, v in pct.head(max_variables).items()]
    return out


def interpretabilidad(importancias: Mapping[str, float] | None, avisos: list[str] | None = None) -> dict:
    """Importancia de cada variable (ganancia del modelo, en porcentaje). SHAP, dependencia parcial e interacciones
    solo si ``shap`` está instalado: si no, queda el aviso."""
    imp = []
    if importancias:
        total = float(sum(importancias.values())) or 1.0
        imp = [{'variable': k, 'importancia_pct': _r(100 * v / total, 2)}
               for k, v in sorted(importancias.items(), key=lambda kv: -kv[1])[:25]]
    return {'importancia': imp, 'shap': None, 'avisos': avisos or []}


# ------------------------------------------------------------------------------------------------ semáforos

def _semaforo(id_: str, nombre: str, estado: str, valor, detalle: str) -> dict:
    return {'id': id_, 'nombre': nombre, 'estado': estado, 'valor': valor, 'detalle': detalle,
            'umbral': UMBRALES[id_]['texto']}


def chequeos(rend: dict, cal: dict, equi: dict, est_t: dict | None, est_v: dict | None, pob: dict) -> list[dict]:
    """Semáforos por reglas con umbrales visibles. ``gris`` = no hay datos para decidir."""
    lista = []
    a = rend['auc_desenlace']['auc']
    u = UMBRALES['auc']
    lista.append(_semaforo('auc', 'Discriminación', 'gris' if a is None else
                           'verde' if a >= u['verde'] else 'ambar' if a >= u['ambar'] else 'rojo', a,
                           'Qué tan bien el riesgo separa a quienes tendrán el evento de quienes no.'))
    razon = cal.get('razon_riesgo_observado')
    u = UMBRALES['calibracion']
    lista.append(_semaforo('calibracion', 'Calibración', 'gris' if razon is None else
                           'verde' if u['verde'][0] <= razon <= u['verde'][1] else
                           'ambar' if u['ambar'][0] <= razon <= u['ambar'][1] else 'rojo', razon,
                           'Si el riesgo que da el modelo coincide con la frecuencia real del evento.'))
    brechas = [a - f['auc'] for filas in equi.values() for f in filas if f.get('auc') is not None and a is not None]
    u = UMBRALES['equidad']
    b = max(brechas) if brechas else None
    lista.append(_semaforo('equidad', 'Equidad entre subgrupos', 'gris' if b is None else
                           'verde' if b <= u['verde'] else 'ambar' if b <= u['ambar'] else 'rojo',
                           _r(b) if b is not None else None,
                           'Cuánto baja el AUC en el subgrupo con peor resultado respecto al total.'))
    psis = [v for fila in ((est_v or {}).get('variables') or {}).values() for v in fila.values() if v is not None]
    u = UMBRALES['estabilidad']
    m = max(psis) if psis else None
    lista.append(_semaforo('estabilidad', 'Estabilidad entre trimestres', 'gris' if m is None else
                           'verde' if m < u['verde'] else 'ambar' if m < u['ambar'] else 'rojo',
                           _r(m) if m is not None else None,
                           'Si las variables de entrada cambian de un trimestre a otro.'))
    casos = pob['eventos'].get('casos')
    u = UMBRALES['poblacion']
    lista.append(_semaforo('poblacion', 'Población de validación', 'gris' if casos is None else
                           'verde' if casos >= u['verde'] else 'ambar' if casos >= u['ambar'] else 'rojo', casos,
                           'Cuántos casos hay para validar el modelo.'))
    return lista


# ------------------------------------------------------------------------------------------------ todo junto

def analizar(r: np.ndarray, y: np.ndarray, *, grupos: Mapping[str, pd.Series] | None = None,
             trimestre: pd.Series | None = None, variables: pd.DataFrame | None = None,
             embudo: list[dict] | None = None, importancias: Mapping[str, float] | None = None,
             avisos: list[str] | None = None, semilla: int = 0, r_base: np.ndarray | None = None) -> dict[str, dict]:
    """Todos los artefactos agregados de un desenlace. Con menos de 20 niños o sin las dos clases queda solo el
    estado ``insuficiente``. Cada valor es JSON serializable. ``r_base``: el riesgo de la regla de referencia."""
    r = np.asarray(r, dtype=float)
    y = np.asarray(y, dtype=bool)
    ok = np.isfinite(r)
    if r_base is not None:
        r_base = np.asarray(r_base, dtype=float)
        ok &= np.isfinite(r_base)
    r, y = r[ok], y[ok]
    if r_base is not None:
        r_base = r_base[ok]
    if grupos:
        grupos = {k: pd.Series(np.asarray(v, dtype=object)[ok]) for k, v in grupos.items()}
    if trimestre is not None:
        trimestre = pd.Series(np.asarray(trimestre, dtype=object)[ok])
    if variables is not None:
        variables = variables.loc[ok]
    if len(y) < MIN_DISTRIBUCION or y.sum() == 0 or y.all():
        insuficiente = {'estado': 'insuficiente', 'n': int(len(y))}
        return limpio({'poblacion': poblacion(y, None, embudo), 'chequeos': insuficiente, 'rendimiento': insuficiente})
    rend = rendimiento(y, r, semilla, r_base)
    cal = {**calibracion(y, r), 'decision': decision(y, r)}
    equi = subgrupos(y, r, grupos or {}, semilla)
    est_t = por_trimestre(y, r, trimestre, semilla) if trimestre is not None else None
    est_v = (estabilidad_variables(variables.reset_index(drop=True), trimestre, list(importancias or []))
             if trimestre is not None and variables is not None else None)
    pob = poblacion(y, variables, embudo)
    return limpio({
        'rendimiento': rend, 'calibracion': cal, 'poblacion': pob, 'equidad': {'subgrupos': equi},
        'estabilidad': {**(est_t or {}), 'psi': est_v or {}},
        'interpretabilidad': interpretabilidad(importancias, avisos),
        'chequeos': {'umbrales': {k: v['texto'] for k, v in UMBRALES.items()},
                     'semaforos': chequeos(rend, cal, equi, est_t, est_v, pob)},
    })


# ------------------------------------------------------------------------------------------------ trayectorias de crecimiento

MAX_INDIVIDUALES = 30        # niños individuales que ve un experto o un administrador (nunca un visualizador)
DIAS_POR_MES = 30.4375


def _modo(s: pd.Series):
    s = s.dropna()
    return None if s.empty else s.value_counts().idxmax()


def trayectorias(df: pd.DataFrame, orden: Mapping[str, int], nombres: Mapping[str, str] | None = None,
                 unidad_de=None) -> dict:
    """Puntaje z (y valor) por grupo y visita. ``df``: ``sujeto``, ``grupo``, ``etapa``, ``z``, ``valor``, ``variable``
    y ``x`` (edad en meses del eje elegido, o NaN). Cada celda cuenta niños distintos; con menos de 5 se omite (D4) y el
    desvío exige 20 o más (D52). Un grupo con menos de 5 niños no se devuelve. La diferencia frente a la OMS es el z medio
    (la OMS es z = 0). ``unidad_de(variable, etapa)`` da la unidad del valor, desde el esquema."""
    nombres = nombres or {}
    sal: dict = {'grupos': [], 'grupos_omitidos': 0, 'celdas_omitidas': 0}
    if df is None or df.empty:
        return sal
    df = df[df.z.notna()].sort_values(['sujeto', 'etapa', 'x']).drop_duplicates(['grupo', 'sujeto', 'etapa'])
    for grupo, g in df.groupby('grupo', sort=True):
        if g.sujeto.nunique() < MIN_CELDA:
            sal['grupos_omitidos'] += 1
            continue
        etapas = []
        for etapa, c in sorted(g.groupby('etapa'), key=lambda kv: (orden.get(kv[0], 99), str(kv[0]))):
            n = int(c.sujeto.nunique())
            if n < MIN_CELDA:
                sal['celdas_omitidas'] += 1
                continue
            z = c.z.to_numpy(dtype=float)
            valores = pd.to_numeric(c.valor, errors='coerce').dropna().to_numpy(dtype=float)
            grande = n >= MIN_DISTRIBUCION
            variable = _modo(c.variable)
            etapas.append({
                'etapa': etapa, 'nombre': nombres.get(etapa, etapa), 'orden': int(orden.get(etapa, 99)), 'n': n,
                'edad_media_meses': _r(float(c.x.mean()), 2) if c.x.notna().any() else None,
                'z_media': _r(float(z.mean())), 'z_desvio': _r(float(z.std(ddof=1))) if grande else None,
                'diferencia_oms': _r(float(z.mean())),
                'valor_medio': _r(float(valores.mean()), 2) if len(valores) >= MIN_CELDA else None,
                'valor_desvio': _r(float(valores.std(ddof=1)), 2) if len(valores) >= MIN_DISTRIBUCION else None,
                'unidad': unidad_de(variable, etapa) if unidad_de and variable else None})
        if etapas:
            sal['grupos'].append({'grupo': str(grupo), 'ninos': int(g.sujeto.nunique()), 'etapas': etapas})
    return limpio(sal)


def trayectorias_individuales(df: pd.DataFrame, orden: Mapping[str, int], nombres: Mapping[str, str] | None = None,
                              maximo: int = MAX_INDIVIDUALES) -> list[dict]:
    """Hasta ``maximo`` niños con su serie de z (código seudonimizado). Solo de grupos con 5 o más niños. El llamador
    decide quién puede verlos: solo experto y administrador."""
    nombres = nombres or {}
    if df is None or df.empty:
        return []
    df = df[df.z.notna()]
    grandes = df.groupby('grupo').sujeto.nunique()
    df = df[df.grupo.isin(grandes[grandes >= MIN_CELDA].index)]
    puntos = df.groupby('sujeto').size().sort_values(ascending=False, kind='stable')
    elegidos = sorted(puntos.index, key=lambda s: (-puntos[s], str(s)))[:maximo]
    sal = []
    for suj in elegidos:
        c = df[df.sujeto == suj].sort_values(['x', 'etapa'])
        sal.append({'codigo': str(suj), 'grupo': str(c.grupo.iloc[0]),
                    'serie': [{'etapa': r.etapa, 'nombre': nombres.get(r.etapa, r.etapa),
                               'orden': int(orden.get(r.etapa, 99)), 'edad_meses': _r(r.x), 'z': _r(r.z)}
                              for r in c.itertuples()]})
    return limpio(sal)


# ------------------------------------------------------------------------------------------------ perfiles provisionales

def resumen_perfiles_ampliado(sev, riesgos: pd.DataFrame | None, medidas: Mapping[str, float] | None = None) -> dict:
    """Perfiles provisionales (edad gestacional y Lubchenco) con n por categoría (oculta si < 5), la tasa del evento y
    qué los distingue: edad gestacional media y, si se pasan ``medidas`` {sujeto: peso al nacer}, el peso medio. Las
    medias se dan con 5 niños o más."""
    from maia_comun import perfiles as PF
    base = PF.resumen_perfiles(sev, riesgos)
    por_nino = PF.perfiles_por_ninos(sev)
    eg = pd.Series(dict(zip(sev.sujetos.sujeto, pd.to_numeric(sev.sujetos.eg_semanas, errors='coerce'))))
    peso = pd.Series(dict(medidas or {}), dtype=float)
    for clave in ('eg', 'lubchenco'):
        for fila in base[clave]:
            fila['eg_media'] = fila['peso_medio'] = None
            if fila['oculto']:
                continue
            ids = [s for s, p in por_nino.items() if p[clave] == fila['categoria']]
            e = eg.reindex(ids).dropna()
            w = peso.reindex(ids).dropna()
            fila['eg_media'] = _r(float(e.mean()), 1) if len(e) >= MIN_CELDA else None
            fila['peso_medio'] = _r(float(w.mean()), 1) if len(w) >= MIN_CELDA else None
    return limpio(base)


# ------------------------------------------------------------------------------------------------ anticipación

_DESDE = re.compile(r'^(?P<familia>.+)_desde_(?P<n>[0-9a-z]+)$')   # «3», «12m», «pmc» (la entrada al programa)


def familia_desde(clave: str) -> tuple[str, str] | None:
    """``talla_baja_12m_desde_3`` -> (``talla_baja_12m``, ``3``); ``readm_6m_desde_pmc`` -> (``readm_6m``, ``pmc``);
    None si la clave no es de una familia."""
    m = _DESDE.match(clave)
    return (m['familia'], m['n']) if m else None


def anticipacion_visita(y: np.ndarray, r: np.ndarray, top_pct: int = 10, semilla: int = 0) -> dict:
    """Casos detectados y alertas acertadas al alertar al ``top_pct`` % de mayor riesgo de una visita de partida."""
    y = np.asarray(y, dtype=bool)
    r = np.asarray(r, dtype=float)
    n, casos = int(len(y)), int(y.sum())
    k = max(1, int(round(n * top_pct / 100)))
    tp = int(y[_orden(r, semilla)[:k]].sum())
    return {'n': n if n >= MIN_CELDA else None, 'casos': casos if casos >= MIN_CELDA else None, 'alertas': k,
            'casos_detectados_pct': _r(100 * tp / casos, 2) if casos >= MIN_CELDA and k >= MIN_CELDA else None,
            'alertas_acertadas_pct': _r(100 * tp / k, 2) if k >= MIN_CELDA and tp >= MIN_CELDA else None}
