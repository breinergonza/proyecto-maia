"""Agregados de trayectorias por riesgo y de perfiles con los niños de validación (``analitica_clinica``)."""
from types import SimpleNamespace

import numpy as np
import pandas as pd

from maia_entrenamiento import analitica_clinica as AL

N = 60   # niños de validación; los 6 primeros con más riesgo (10 %)


def _preds():
    ids = pd.Index([f'S{i:03d}' for i in range(N)])
    r = np.linspace(0.9, 0.1, N)
    y = np.zeros(N, dtype=bool)
    y[:4] = True
    y[30:33] = True
    return {'r': r, 'y': y, 'variables': pd.DataFrame({'x': r}, index=ids)}


def _crecimiento():
    rng = np.random.default_rng(0)
    filas = []
    for i in range(N):
        for etapa, dias in (('40 sem', 0), ('3 m EC', 91)):
            filas.append({'sujeto': f'S{i:03d}', 'etapa': etapa, 'indicador': 'peso', 'variable': 'peso_' + etapa,
                          'x': dias / AL.AN.DIAS_POR_MES, 'z': float(rng.normal(-1.2 if i < 6 else 0.1, 0.3)), 'valor': 3.0})
    return pd.DataFrame(filas)


def test_riesgo_alto_es_el_diez_por_ciento():
    assert AL._riesgo_alto(_preds()['r']).sum() == 6
    empates = np.array([0.9] * 3 + [0.5] * 40 + [0.1] * 57)   # muchos empates en el corte, como con LightGBM
    alto = AL._riesgo_alto(empates)
    assert alto.sum() == 10 and alto[:3].all(), 'el grupo no crece por los empates y empieza por los de más riesgo'


def test_trayectorias_por_riesgo_solo_agregados():
    t = AL.trayectorias_riesgo(_preds(), _crecimiento(), {'40 sem': 0, '3 m EC': 1}, {'40 sem': '40 semanas'}, {})
    por = {g['grupo']: g for g in t['peso']['grupos']}
    assert set(por) == {'Riesgo alto', 'Resto'}
    alto = {e['etapa']: e for e in por['Riesgo alto']['etapas']}
    assert alto['40 sem']['n'] == 6 and alto['40 sem']['diferencia_oms'] < 0
    assert alto['40 sem']['z_desvio'] is None, 'el desvío pide 20 o más (D52)'
    assert 'talla' not in t, 'sin datos de talla no hay indicador'
    assert 'S000' not in repr(t), 'ningún código de niño en el artefacto (D7)'


def test_perfiles_con_tasa_observada_y_riesgo_alto():
    eg = [26] * 10 + [30] * 30 + [34] * 18 + [38] * 2     # el grupo a término queda con 2 niños
    sev = SimpleNamespace(sujetos=pd.DataFrame({'sujeto': [f'S{i:03d}' for i in range(N)], 'eg_semanas': eg}),
                          mediciones=pd.DataFrame(columns=['sujeto', 'variable', 'valor']))
    p = AL.perfiles_desenlace(_preds(), sev)
    filas = {f['categoria']: f for f in p['eg']}
    assert p['ninos'] == N and p['casos'] == 7
    extremo = filas['extremo']
    assert extremo['n'] == 10 and extremo['tasa_observada'] == 0.4 and extremo['tasa_riesgo_alto'] == 0.6
    assert filas['a_termino']['n'] == 2 and 'oculto' not in filas['a_termino']
    assert filas['a_termino']['tasa_observada'] is not None and filas['a_termino']['tasa_riesgo_alto'] is not None
    assert 'tasa' not in extremo, 'la tasa se nombra según lo que mide'
