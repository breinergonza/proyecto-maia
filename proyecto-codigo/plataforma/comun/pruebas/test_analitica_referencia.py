"""La regla de referencia (AUC base) viaja con el rendimiento de cada desenlace."""
import numpy as np

from maia_comun import analitica as AN


def _datos(n: int = 600, semilla: int = 3):
    rng = np.random.default_rng(semilla)
    y = rng.random(n) < 0.15
    r = np.clip(0.1 + 0.5 * y + rng.normal(0, 0.2, n), 0, 1)          # el modelo separa bien
    base = np.clip(0.1 + 0.1 * y + rng.normal(0, 0.2, n), 0, 1)       # la regla separa poco
    return y, r, base


def test_rendimiento_trae_la_referencia_si_se_da():
    y, r, base = _datos()
    rend = AN.rendimiento(y, r, r_base=base)
    ref = rend['referencia']
    assert 0.5 <= ref['auc_desenlace']['auc'] < rend['auc_desenlace']['auc']
    assert 0 <= ref['casos_top10_pct'] <= 100


def test_sin_referencia_no_hay_campo():
    y, r, _ = _datos()
    assert 'referencia' not in AN.rendimiento(y, r)


def test_analizar_pasa_la_referencia_al_rendimiento():
    y, r, base = _datos()
    out = AN.analizar(r, y, r_base=base)
    assert out['rendimiento']['referencia']['auc_desenlace']['auc'] < out['rendimiento']['auc_desenlace']['auc']
