"""Comparar con réplicas bootstrap, de forma acotada.

* **Entrenamientos (A frente a B).** No se guardan predicciones por niño (D7), así que no se puede remuestrear a los
  mismos niños. Cada medida se remuestrea por separado a partir de lo que sí se guardó (la proporción y el tamaño de
  cada lado, o el AUC y sus casos) con ``REPLICAS`` réplicas independientes; el intervalo de la diferencia es por eso
  aproximado y lo dice.
* **Grupos de niños.** Aquí sí hay un valor por niño en memoria (se descarta al responder): se remuestrea cada grupo con
  ``REPLICAS_GRUPOS`` réplicas, sobre a lo sumo ``MAX_FILAS`` niños por lado.

Un conteo de 1 a 4 niños se da con su cifra; intervalos y comparaciones piden 20 niños o más por lado (D52) y el
intervalo de un AUC pide 5 niños de cada clase (``MIN_CASOS_IC``, un límite estadístico).
"""
from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

import numpy as np

from maia_comun.analitica import MIN_CASOS_IC, MIN_DISTRIBUCION, _r, limpio

REPLICAS = 500           # réplicas por medida al comparar entrenamientos
REPLICAS_GRUPOS = 300    # réplicas al comparar grupos de niños
MAX_FILAS = 20_000       # niños por lado que se remuestrean
SEMILLA = 20260
AVISO_APROXIMADO = ('Como no se guardan predicciones por niño, el intervalo de la diferencia es aproximado: se '
                    'remuestrea cada entrenamiento por separado.')


def _intervalo(dif: np.ndarray) -> tuple[float | None, float | None, bool | None]:
    dif = dif[np.isfinite(dif)]
    if len(dif) < 20:
        return None, None, None
    bajo, alto = float(np.percentile(dif, 2.5)), float(np.percentile(dif, 97.5))
    return _r(bajo), _r(alto), bool(bajo > 0 or alto < 0)


def _fila(id_: str, texto: str, a: float | None, b: float | None, rep_a: np.ndarray | None, rep_b: np.ndarray | None,
          n_a: int | None, n_b: int | None, unidad: str) -> dict:
    fila = {'id': id_, 'texto': texto, 'unidad': unidad, 'a': a, 'b': b, 'diferencia': None, 'ic_bajo': None,
            'ic_alto': None, 'clara': None, 'n_a': n_a, 'n_b': n_b}
    if a is None or b is None:
        return fila
    fila['diferencia'] = _r(b - a, 4)
    if rep_a is not None and rep_b is not None:
        fila['ic_bajo'], fila['ic_alto'], fila['clara'] = _intervalo(rep_b - rep_a)
    return fila


# ------------------------------------------------------------------------------------------------ medidas

def _se_auc(auc: float, casos: int, n: int) -> float | None:
    """Error estándar del AUC de Hanley y McNeil, desde el AUC y los tamaños (no hace falta nada por niño)."""
    n1, n0 = int(casos), int(n) - int(casos)
    if n1 < 1 or n0 < 1 or not 0 < auc < 1:
        return None
    q1, q2 = auc / (2 - auc), 2 * auc * auc / (1 + auc)
    var = (auc * (1 - auc) + (n1 - 1) * (q1 - auc * auc) + (n0 - 1) * (q2 - auc * auc)) / (n1 * n0)
    return math.sqrt(var) if var > 0 else None


def _replicas_auc(rng: np.random.Generator, d: Mapping) -> np.ndarray | None:
    a = d.get('auc')
    n, casos = d.get('n'), d.get('casos')
    if a is None or n is None or casos is None or n < MIN_DISTRIBUCION or casos < MIN_CASOS_IC or n - casos < MIN_CASOS_IC:
        return None
    se = _se_auc(float(a), int(casos), int(n))
    if se is None:
        return None
    return np.clip(rng.normal(float(a), se, REPLICAS), 0.0, 1.0)


def _replicas_prop(rng: np.random.Generator, p_pct: float | None, n: int | None) -> np.ndarray | None:
    """Réplicas de una proporción (en puntos porcentuales) con ``n`` niños o alertas detrás."""
    if p_pct is None or n is None or n < MIN_DISTRIBUCION:
        return None
    p = min(max(float(p_pct) / 100, 0.0), 1.0)
    return 100 * rng.binomial(int(n), p, REPLICAS) / int(n)


def _top(d: Mapping, t: int) -> Mapping:
    return next((f for f in d.get('metricas_por_top') or [] if f.get('top_pct') == t), {})


def comparar_entrenamientos(a: Mapping, b: Mapping, semilla: int = SEMILLA, tops: Sequence[int] = (10, 20)) -> dict:
    """``a`` y ``b`` son los artefactos de rendimiento de un desenlace (``auc_desenlace``, ``metricas_por_top``,
    ``pr_auc``). Devuelve una fila por medida con la diferencia de B frente a A, su intervalo del 95 % por réplicas y
    los niños (o casos) detrás de cada lado."""
    rng = np.random.default_rng(semilla)
    ua, ub = a.get('auc_desenlace') or {}, b.get('auc_desenlace') or {}
    filas = [_fila('auc', 'Qué tan bien ordena a los niños (AUC)', ua.get('auc'), ub.get('auc'),
                   _replicas_auc(rng, ua), _replicas_auc(rng, ub), ua.get('n'), ub.get('n'), 'abs'),
             _fila('pr', 'Alertas acertadas en promedio (PR-AUC)', a.get('pr_auc'), b.get('pr_auc'),
                   None, None, ua.get('n'), ub.get('n'), 'abs')]
    for t in tops:
        fa, fb = _top(a, t), _top(b, t)
        casos_a, casos_b = ua.get('casos'), ub.get('casos')
        filas.append(_fila(f'det{t}', f'Casos detectados si se alerta al {t} %', fa.get('casos_detectados_pct'),
                           fb.get('casos_detectados_pct'), _replicas_prop(rng, fa.get('casos_detectados_pct'), casos_a),
                           _replicas_prop(rng, fb.get('casos_detectados_pct'), casos_b), casos_a, casos_b, 'pp'))
        filas.append(_fila(f'ac{t}', f'Alertas acertadas si se alerta al {t} %', fa.get('alertas_acertadas_pct'),
                           fb.get('alertas_acertadas_pct'), _replicas_prop(rng, fa.get('alertas_acertadas_pct'), fa.get('alertas')),
                           _replicas_prop(rng, fb.get('alertas_acertadas_pct'), fb.get('alertas')),
                           fa.get('alertas'), fb.get('alertas'), 'pp'))
    fa, fb = _top(a, 10), _top(b, 10)
    filas.append(_fila('mil', 'Alertas por 1.000 niños si se alerta al 10 %', fa.get('alertas_por_1000'),
                       fb.get('alertas_por_1000'), None, None, ua.get('n'), ub.get('n'), 'abs'))
    return limpio({'replicas': REPLICAS, 'aviso': AVISO_APROXIMADO, 'metricas': filas})


def comparar_subgrupos(a: Mapping[str, Sequence[Mapping]], b: Mapping[str, Sequence[Mapping]],
                       semilla: int = SEMILLA) -> list[dict]:
    """Cuánto cambia el AUC de B frente a A en cada subgrupo (``equidad.subgrupos``) con el mismo grupo en ambos.
    Un grupo con menos de 20 niños en un lado no trae AUC (ya viene omitido)."""
    rng = np.random.default_rng(semilla)
    sal = []
    for variable in sorted(set(a) & set(b)):
        por_grupo_b = {str(f.get('grupo')): f for f in b[variable]}
        for fa in a[variable]:
            fb = por_grupo_b.get(str(fa.get('grupo')))
            if fb is None:
                continue
            fila = _fila('auc', str(fa.get('grupo')), fa.get('auc'), fb.get('auc'), _replicas_auc(rng, fa),
                         _replicas_auc(rng, fb), fa.get('n'), fb.get('n'), 'abs')
            sal.append({'variable': variable, 'grupo': str(fa.get('grupo')),
                        **{k: fila[k] for k in ('a', 'b', 'diferencia', 'ic_bajo', 'ic_alto', 'clara', 'n_a', 'n_b')}})
    return limpio(sal)


# ------------------------------------------------------------------------------------------------ grupos de niños

def _acotar(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    return x if len(x) <= MAX_FILAS else x[rng.choice(len(x), MAX_FILAS, replace=False)]


def _medias_bootstrap(x: np.ndarray, rng: np.random.Generator, replicas: int) -> np.ndarray:
    n = len(x)
    return np.fromiter((x[rng.integers(0, n, n)].mean() for _ in range(replicas)), dtype=float, count=replicas)


def comparar_valores(a: np.ndarray, b: np.ndarray, *, escala: float = 1.0, semilla: int = SEMILLA,
                     replicas: int = REPLICAS_GRUPOS, unidad: str = 'pp') -> dict:
    """Media (o proporción, si los valores son 0 y 1) de un valor por niño en dos grupos, con la diferencia de B frente
    a A y su intervalo por réplicas. ``escala`` multiplica los valores (100 para pasar una proporción a %). Cada lado
    pide 20 niños o más; con menos no se da ninguna cifra, solo el conteo."""
    rng = np.random.default_rng(semilla)
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    a, b = a[np.isfinite(a)], b[np.isfinite(b)]
    sal = {'unidad': unidad, 'n_a': int(len(a)), 'n_b': int(len(b)), 'a': None, 'b': None, 'ic_a': None, 'ic_b': None,
           'diferencia': None, 'ic_bajo': None, 'ic_alto': None, 'clara': None}
    if len(a) < MIN_DISTRIBUCION or len(b) < MIN_DISTRIBUCION:
        return sal
    a, b = _acotar(a, rng), _acotar(b, rng)
    ra, rb = escala * _medias_bootstrap(a, rng, replicas), escala * _medias_bootstrap(b, rng, replicas)
    sal['a'], sal['b'] = _r(escala * float(a.mean()), 3), _r(escala * float(b.mean()), 3)
    sal['ic_a'] = [_r(float(np.percentile(ra, 2.5)), 3), _r(float(np.percentile(ra, 97.5)), 3)]
    sal['ic_b'] = [_r(float(np.percentile(rb, 2.5)), 3), _r(float(np.percentile(rb, 97.5)), 3)]
    sal['diferencia'] = _r(sal['b'] - sal['a'], 3)
    sal['ic_bajo'], sal['ic_alto'], sal['clara'] = _intervalo(rb - ra)
    return limpio(sal)
