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


def test_la_referencia_trae_la_diferencia_con_su_intervalo():
    """La ventaja del modelo completo sobre la regla, con un intervalo del 95 % de la diferencia (las mismas remuestras
    para los dos, porque se miden con los mismos niños): si no incluye el 0, la ventaja no es casualidad."""
    y, r, base = _datos()
    rend = AN.rendimiento(y, r, r_base=base)
    d = rend['referencia']['diferencia']
    esperado = rend['auc_desenlace']['auc'] - rend['referencia']['auc_desenlace']['auc']
    assert abs(d['valor'] - esperado) < 0.011          # cada AUC va redondeado a dos decimales
    assert 0 < d['ic_bajo'] < d['valor'] < d['ic_alto']


def test_dos_modelos_iguales_no_tienen_ventaja():
    y, r, _ = _datos()
    d = AN.rendimiento(y, r, r_base=r)['referencia']['diferencia']
    assert d == {'valor': 0.0, 'ic_bajo': 0.0, 'ic_alto': 0.0}


def test_con_pocos_casos_la_diferencia_no_trae_intervalo():
    rng = np.random.default_rng(1)
    y = np.zeros(30, dtype=bool)
    y[:3] = True                                   # 3 casos: menos de los 5 que pide un intervalo
    r, base = rng.random(30) + y, rng.random(30)
    d = AN.rendimiento(y, r, r_base=base)['referencia']['diferencia']
    assert d['valor'] is not None and d['ic_bajo'] is None and d['ic_alto'] is None


def test_la_referencia_dice_con_que_datos_se_calcula():
    """Para rotular la comparación: «solo talla para la edad a los 3 meses», no un texto fijo."""
    y, r, base = _datos()
    out = AN.analizar(r, y, r_base=base, base_entradas=['talla, puntaje z a 3 meses'])
    assert out['rendimiento']['referencia']['entradas'] == ['talla, puntaje z a 3 meses']
    assert 'entradas' not in AN.analizar(r, y, r_base=base)['rendimiento']['referencia']
