"""Interpretabilidad agregada: shap_global, pdp, motivos_frecuentes e interaccion; solo agregados y n mínimo."""
from __future__ import annotations

import json
from types import SimpleNamespace

import lightgbm as lgb
import numpy as np
import pandas as pd

from maia_comun import analitica_interpretabilidad as AI
from maia_entrenamiento import analitica_clinica as AL
from maia_entrenamiento import analitica_interpretabilidad as EI


def _modelo(n=600, semilla=0):
    rng = np.random.default_rng(semilla)
    X = pd.DataFrame({'peso': rng.normal(1500, 400, n), 'eg': rng.normal(32, 3, n), 'ruido': rng.normal(size=n),
                      'sexo': rng.integers(1, 3, n).astype(float)}, index=[f'N{i}' for i in range(n)])
    y = (rng.random(n) < 1 / (1 + np.exp((X.peso - 1300) / 200))).astype(int)
    booster = lgb.train({'objective': 'binary', 'verbose': -1, 'num_leaves': 8, 'min_data_in_leaf': 10},
                        lgb.Dataset(X, y), num_boost_round=30)
    m = SimpleNamespace(columnas=list(X.columns), modelo=booster,
                        riesgo=lambda T: booster.predict(T.reindex(columns=list(X.columns))))
    modelo = SimpleNamespace(etiquetas={'peso': 'Peso al nacer (ern_peso)', 'eg': 'Edad gestacional'}, modelos={'x': m})
    return modelo, m, X


def test_artefactos_completos_y_agregados():
    modelo, m, X = _modelo()
    a = EI.artefactos(modelo, m, X, m.riesgo(X))
    assert set(a) == {'shap_global', 'pdp', 'motivos_frecuentes', 'interaccion'}
    sg = a['shap_global']
    assert sg['variables'][0]['variable'] == 'peso' and sg['variables'][0]['etiqueta'] == 'Peso al nacer'
    assert abs(sum(v['importancia_pct'] for v in sg['variables']) - 100) < 0.5 and sg['n'] == 600
    pdp = {v['variable']: v for v in a['pdp']['variables']}
    puntos = pdp['peso']['puntos']
    assert puntos[0][1] > puntos[-1][1], 'a menor peso, más riesgo'
    assert pdp['sexo']['categorica'] is True
    mot = a['motivos_frecuentes']
    assert mot['n_alertas'] == 60 and mot['motivos'][0]['variable'] == 'peso'
    ix = a['interaccion']['pares'][0]
    assert ix['a'] == 'peso' and ix['etiqueta_a'] == 'Peso al nacer'
    assert all(isinstance(c['n'], int) for p in a['interaccion']['pares'] for c in p['celdas'])
    texto = json.dumps(a)
    assert 'N1' not in texto and '"N' not in texto, 'sin códigos de niño'


def test_submuestra_acotada(monkeypatch):
    monkeypatch.setenv('MAIA_INTERPRETABILIDAD_FILAS', '300')
    modelo, m, X = _modelo()
    a = EI.artefactos(modelo, m, X, m.riesgo(X))
    assert a['shap_global']['n'] == 300 and a['motivos_frecuentes']['n_alertas'] == 30


def test_pocos_ninos_no_calcula():
    modelo, m, X = _modelo(n=600)
    assert EI.artefactos(modelo, m, X.iloc[:10], m.riesgo(X)[:10]) is None


def test_agregar_respeta_la_bandera(monkeypatch):
    modelo, m, X = _modelo()
    preds = {'x': {'variables': X, 'r': m.riesgo(X)}}
    res = {'x': {'interpretabilidad': {'importancia': [], 'shap': None, 'avisos': []}}}
    monkeypatch.setenv('MAIA_INTERPRETABILIDAD', '0')
    EI.agregar(res, modelo, preds)
    assert 'shap_global' not in res['x']['interpretabilidad'] and res['x']['interpretabilidad']['avisos']
    monkeypatch.setenv('MAIA_INTERPRETABILIDAD', '1')
    res['x']['interpretabilidad']['avisos'] = []
    EI.agregar(res, modelo, preds)
    assert res['x']['interpretabilidad']['shap_global']['variables']


def test_agregar_no_rompe_si_falla():
    modelo, m, X = _modelo()
    res = {'x': {'interpretabilidad': {'importancia': [], 'shap': None, 'avisos': []}}}
    modelo.modelos['x'] = SimpleNamespace(columnas=m.columnas, modelo=None, riesgo=m.riesgo)   # sin booster: falla
    EI.agregar(res, modelo, {'x': {'variables': X, 'r': m.riesgo(X)}})
    assert 'No se pudo calcular' in res['x']['interpretabilidad']['avisos'][0]
    assert 'shap_global' not in res['x']['interpretabilidad']


def test_motivos_dan_la_cifra_aunque_sean_pocos_ninos():
    contrib = np.zeros((40, 3))
    contrib[:, 0] = 1.0          # todos: variable a
    contrib[:3, 1] = 2.0         # solo 3 niños: variable b (sale con su cifra)
    mot = AI.motivos_frecuentes(contrib, ['a', 'b', 'c'], np.ones(40, dtype=bool), por_nino=2)
    por = {m['variable']: m for m in mot['motivos']}
    assert por['a']['n'] == 40 and por['b']['n'] == 3 and por['b']['pct'] == 7.5


def test_alertas_insuficientes():
    assert AI.motivos_frecuentes(np.ones((50, 2)), ['a', 'b'], np.arange(50) < 10) is None


def test_interaccion_da_la_cifra_de_las_celdas_pequenas():
    rng = np.random.default_rng(1)
    X = pd.DataFrame({'a': rng.normal(size=60), 'b': rng.normal(size=60)})
    ix = AI.interaccion(X, rng.random(60), [('a', 'b')], cajas=8)
    celdas = ix['pares'][0]['celdas']
    assert any(0 < c['n'] < 5 and c['riesgo_medio'] is not None for c in celdas)
    assert all(c['n'] is not None for c in celdas) and sum(c['n'] for c in celdas) == 60


def test_sanear_deja_pasar_las_celdas_pequenas_y_descarta_lo_que_no_llega_a_20():
    assert AI.sanear({'importancia': [1]}) == {'importancia': [1]}
    sucio = {'shap_global': {'n': 100, 'deciles': {'a': [{'tramo': 1, 'n': 3, 'valor_medio': 1, 'shap_medio': 1}]}},
             'motivos_frecuentes': {'n_alertas': 100, 'motivos': [{'variable': 'a', 'n': 2, 'pct': 2}]},
             'interaccion': {'pares': [{'celdas': [{'i': 0, 'j': 0, 'n': 4, 'riesgo_medio': 0.3}]}]},
             'pdp': {'n': 5, 'variables': []}}
    limpio = AI.sanear(sucio)
    assert limpio['shap_global']['deciles']['a'][0]['shap_medio'] == 1
    assert limpio['motivos_frecuentes']['motivos'][0]['pct'] == 2
    assert limpio['interaccion']['pares'][0]['celdas'][0]['riesgo_medio'] == 0.3
    assert limpio['pdp'] is None, 'con menos de 20 niños no hay dependencia parcial (D52)'
    assert AI.sanear({'shap_global': {'n': 10}, 'motivos_frecuentes': {'n_alertas': 10}}) == {
        'shap_global': None, 'motivos_frecuentes': None}


def test_calcular_engancha_la_interpretabilidad(monkeypatch):
    modelo, m, X = _modelo()
    des = SimpleNamespace(nombre='x', momento='40 sem', etapa='3 m EC')
    pred = {'r': m.riesgo(X), 'y': np.random.default_rng(0).random(len(X)) < 0.2,
            'grupos': {}, 'trimestre': np.array([None] * len(X)), 'variables': X, 'importancias': {'peso': 3.0, 'eg': 1.0},
            'embudo': [], 'desenlace': des}
    monkeypatch.setattr(AL, 'predicciones', lambda mo, p: {'x': pred})
    p = SimpleNamespace(sev=SimpleNamespace(etapas=pd.DataFrame({'etapa': ['3 m EC'], 'orden': [1]})))
    res, _ = AL.calcular(modelo, p)
    inter = res['x']['interpretabilidad']
    assert inter['importancia'] and inter['shap_global']['variables'] and inter['pdp'] and inter['motivos_frecuentes']
