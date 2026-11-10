"""hist_riesgo y distribuciones_muestra_universo: celdas de menos de 5 niños ocultas, cohortes de 20 o más (D52)."""
import json

import numpy as np
import pandas as pd

from maia_comun import analitica as AN
from maia_comun import analitica_distribuciones as AD


def _datos(n=1500, semilla=2):
    rng = np.random.default_rng(semilla)
    r = 1 / (1 + np.exp(-(rng.normal(size=n) - 2)))
    return r, rng.random(n) < r


def test_hist_riesgo_separa_con_y_sin_y_oculta_tramos_pequenos():
    r, y = _datos()
    h = AD.hist_riesgo(y, r)
    assert h['estado'] == 'ok' and len(h['tramos']) == AD.TRAMOS and h['n'] == len(y)
    assert all(t['con'] is None or t['con'] >= AN.MIN_CELDA for t in h['tramos'])
    assert all(t['sin'] is None or t['sin'] >= AN.MIN_CELDA for t in h['tramos'])
    # la cola de riesgo alto tiene pocos niños sin el desenlace: hay tramos ocultos, no ceros inventados
    assert any(t['con'] is None for t in h['tramos'])
    assert h['mediana_con'] > h['mediana_sin']
    json.dumps(h)


def test_hist_riesgo_con_pocos_ninos_no_da_cifras():
    r, y = _datos(n=15)
    h = AD.hist_riesgo(y, r)
    assert h['estado'] == 'insuficiente' and h['tramos'] == [] and h['mediana_sin'] is None


def test_hist_riesgo_cuantiles_solo_con_20_casos():
    n = 400
    r = np.linspace(0.01, 0.9, n)
    y = np.zeros(n, dtype=bool)
    y[-12:] = True
    h = AD.hist_riesgo(y, r)
    assert h['mediana_con'] is None and h['riesgo_medio_con'] is None and h['mediana_sin'] is not None


def _universo(n=600, sesgo=False):
    idx = [f'N{i:04d}' for i in range(n)]
    sexo = pd.Series(np.where(np.arange(n) % 2 == 0, 'femenino', 'masculino'), index=idx)
    banda = pd.Series(np.where(np.arange(n) < n - 3, 'a termino', 'extremo'), index=idx)   # 3 niños: <5
    eg = pd.Series(np.linspace(26, 41, n), index=idx)
    muestra = idx[: n // 2] if sesgo else idx[::2][: n // 3]
    return idx, {'sexo': sexo, 'edad gestacional': banda}, {'edad gestacional (semanas)': eg}, muestra


def test_distribuciones_muestra_universo_porcentajes_y_celdas_pequenas():
    _, cats, nums, muestra = _universo()
    d = AD.distribuciones_muestra_universo(muestra, cats, nums)
    assert d['estado'] == 'ok'
    sexo = d['categoricas']['sexo']
    assert sexo['n_universo'] == 600 and sexo['n_muestra'] == len(muestra)
    assert abs(sum(c['pct_universo'] for c in sexo['categorias']) - 100) < 0.2
    eg = d['categoricas']['edad gestacional']
    extremo = next(c for c in eg['categorias'] if c['categoria'] == 'extremo')
    assert extremo['n_universo'] is None and extremo['pct_universo'] is None and extremo['diferencia_pp'] is None
    q = d['numericas']['edad gestacional (semanas)']
    assert q['universo']['p50'] > q['universo']['p5'] and q['n_muestra'] == len(muestra)
    json.dumps(d)


def test_distribuciones_detecta_el_sesgo_de_seleccion():
    _, cats, nums, muestra = _universo(sesgo=True)     # la muestra son los primeros niños: más prematuros
    q = AD.distribuciones_muestra_universo(muestra, cats, nums)['numericas']['edad gestacional (semanas)']
    assert q['muestra']['p50'] < q['universo']['p50'] - 2


def test_distribuciones_exige_20_ninos_en_la_muestra():
    idx, cats, nums, _ = _universo()
    d = AD.distribuciones_muestra_universo(idx[:15], cats, nums)
    assert d['estado'] == 'insuficiente' and d['categoricas'] == {} and d['numericas'] == {}


def test_artefactos_extra_sin_universo_solo_trae_el_histograma():
    r, y = _datos()
    assert set(AD.artefactos_extra(y, r, range(len(y)), None)) == {'hist_riesgo'}
