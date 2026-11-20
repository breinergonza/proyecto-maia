"""Réplicas bootstrap al comparar: intervalos que cubren la diferencia verdadera, n y reglas de privacidad."""
import json

import numpy as np

from maia_comun import analitica as AN
from maia_comun import analitica_comparar as CM


def _rend(r, y, semilla=0):
    return AN.rendimiento(y, r, semilla)


def _par(n=3000, mejora=0.0, semilla=1):
    rng = np.random.default_rng(semilla)
    puntaje = rng.normal(size=n)
    y = rng.random(n) < 1 / (1 + np.exp(-(puntaje - 2)))
    ruido = rng.normal(size=n)
    return y, 1 / (1 + np.exp(-(puntaje - 2))), 1 / (1 + np.exp(-(puntaje * (1 - mejora) + ruido * mejora * 3 - 2)))


def test_entrenamientos_iguales_no_dan_diferencia_clara():
    y, r, _ = _par()
    a = _rend(r, y)
    res = CM.comparar_entrenamientos(a, a)
    m = {f['id']: f for f in res['metricas']}
    assert m['auc']['diferencia'] == 0 and m['auc']['clara'] is False
    assert m['auc']['ic_bajo'] < 0 < m['auc']['ic_alto']
    assert res['replicas'] == CM.REPLICAS and 'aproximado' in res['aviso']
    json.dumps(res)


def test_entrenamiento_claramente_peor_se_marca_con_n_y_casos():
    y, r, peor = _par(mejora=0.9)
    a, b = _rend(r, y), _rend(peor, y)
    m = {f['id']: f for f in CM.comparar_entrenamientos(a, b)['metricas']}
    assert m['auc']['diferencia'] < -0.05 and m['auc']['clara'] is True and m['auc']['ic_alto'] < 0
    assert m['auc']['n_a'] == len(y) and m['det10']['n_a'] == int(y.sum())
    assert m['det10']['ic_bajo'] <= m['det10']['diferencia'] <= m['det10']['ic_alto']


def test_comparacion_es_reproducible_y_acotada():
    y, r, otro = _par(mejora=0.3)
    a, b = _rend(r, y), _rend(otro, y)
    assert CM.comparar_entrenamientos(a, b) == CM.comparar_entrenamientos(a, b)


def test_con_pocos_casos_no_hay_intervalo():
    y, r, _ = _par(n=300, semilla=7)
    y = np.zeros(300, dtype=bool)
    y[:3] = True
    a = _rend(r, y)
    m = {f['id']: f for f in CM.comparar_entrenamientos(a, a)['metricas']}
    assert m['auc']['ic_bajo'] is None and m['det10']['ic_bajo'] is None


def test_subgrupos_comparados_por_grupo():
    y, r, otro = _par(mejora=0.9)
    sexo = np.where(np.arange(len(y)) % 2 == 0, 'femenino', 'masculino')
    import pandas as pd
    ga = AN.subgrupos(y, r, {'sexo': pd.Series(sexo)})
    gb = AN.subgrupos(y, otro, {'sexo': pd.Series(sexo)})
    filas = CM.comparar_subgrupos(ga, gb)
    assert {f['grupo'] for f in filas} == {'femenino', 'masculino'}
    assert all(f['diferencia'] < 0 and f['clara'] for f in filas) and all(f['n_a'] >= AN.MIN_DISTRIBUCION for f in filas)


def test_comparar_valores_de_dos_grupos():
    rng = np.random.default_rng(3)
    a = (rng.random(400) < 0.10).astype(float)
    b = (rng.random(400) < 0.25).astype(float)
    r = CM.comparar_valores(a, b, escala=100)
    assert r['n_a'] == 400 and 5 < r['a'] < 16 and 18 < r['b'] < 32
    assert r['clara'] is True and r['ic_bajo'] > 0 and r['ic_a'][0] < r['a'] < r['ic_a'][1]
    igual = CM.comparar_valores(a, a, escala=100)
    assert igual['diferencia'] == 0 and igual['clara'] is False


def test_comparar_valores_con_pocos_ninos_da_el_conteo_y_no_la_cifra():
    chico = CM.comparar_valores(np.ones(10), np.zeros(300))
    assert chico['a'] is None and chico['diferencia'] is None and chico['n_a'] == 10 and chico['n_b'] == 300
    muy_chico = CM.comparar_valores(np.ones(3), np.zeros(300))
    assert muy_chico['n_a'] == 3 and muy_chico['a'] is None   # la cifra pide 20 niños (D52); el conteo se dice


def test_comparar_valores_acota_las_filas():
    rng = np.random.default_rng(5)
    grande = (rng.random(CM.MAX_FILAS * 2) < 0.2).astype(float)
    r = CM.comparar_valores(grande, grande, escala=100, replicas=20)
    assert r['n_a'] == CM.MAX_FILAS * 2 and abs(r['a'] - 20) < 1.5
