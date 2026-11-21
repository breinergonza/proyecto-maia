"""Analítica agregada: AUC conocido, calibración perfecta, celdas pequeñas con su cifra y JSON serializable."""
import json

import numpy as np
import pandas as pd

from maia_comun import analitica as AN


def _datos(n=2000, semilla=1, fuerza=2.0):
    rng = np.random.default_rng(semilla)
    puntaje = rng.normal(size=n)
    r = 1 / (1 + np.exp(-(puntaje - 2)))
    y = rng.random(n) < r
    return r, y, puntaje


def test_auc_conocido():
    y = np.array([0, 0, 1, 1])
    assert AN.auc(y, np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert AN.auc(y, np.array([0.9, 0.8, 0.2, 0.1])) == 0.0
    assert AN.auc(y, np.array([0.5, 0.5, 0.5, 0.5])) == 0.5
    assert np.isnan(AN.auc(np.zeros(4), np.arange(4)))


def test_auc_con_ic_contiene_el_auc_y_no_se_calcula_con_pocos_casos():
    r, y, _ = _datos()
    d = AN.auc_con_ic(y, r)
    assert d['ic_bajo'] <= d['auc'] <= d['ic_alto']
    pocos = AN.auc_con_ic(np.array([1, 0, 0, 1] * 3, dtype=bool), np.arange(12.0))
    assert pocos['ic_bajo'] is None


def test_el_intervalo_del_auc_pide_5_casos_de_cada_clase_por_estadistica_no_por_privacidad():
    """Con 3 casos el AUC se da (es una cifra) pero no su intervalo: el bootstrap no es estable. Es un límite
    estadístico propio (``MIN_CASOS_IC``), no la regla de privacidad que se abandonó (D4)."""
    r = np.linspace(0, 1, 100)
    tres = np.zeros(100, dtype=bool)
    tres[[80, 90, 99]] = True
    d = AN.auc_con_ic(tres, r)
    assert d['auc'] is not None and d['casos'] == 3 and d['n'] == 100
    assert d['ic_bajo'] is None and d['ic_alto'] is None
    cinco = np.zeros(100, dtype=bool)
    cinco[[60, 70, 80, 90, 99]] = True
    assert AN.auc_con_ic(cinco, r)['ic_bajo'] is not None
    assert AN.MIN_CASOS_IC == 5 and not hasattr(AN, 'MIN_CELDA')


def test_calibracion_perfecta():
    r, y, _ = _datos(n=20000, semilla=3)
    c = AN.calibracion(y, r)
    assert abs(c['razon_riesgo_observado'] - 1) < 0.1
    assert len(c['bins']) == 10 and c['ece'] < 0.05
    assert all(b['n'] > 0 for b in c['bins'])


def test_calibracion_con_pocos_ninos_por_grupo_da_cada_grupo_con_su_n():
    r, y, _ = _datos(n=25, semilla=5)         # 10 grupos de 2 o 3 niños
    c = AN.calibracion(y, r)
    assert len(c['bins']) == 10 and sum(b['n'] for b in c['bins']) == 25 and min(b['n'] for b in c['bins']) < 5
    assert all(h['n'] is not None for h in c['histograma']) and sum(h['n'] for h in c['histograma']) == 25


def test_metricas_por_top_y_confusion():
    r, y, _ = _datos()
    a = AN.analizar(r, y)
    rend = a['rendimiento']
    assert [t['top_pct'] for t in rend['metricas_por_top']] == list(AN.TOPS)
    assert len(rend['metricas_por_percentil']) == 100
    d20, d40 = rend['metricas_por_top'][2], rend['metricas_por_top'][4]
    assert d20['alertas'] == 400 and d40['casos_detectados_pct'] >= d20['casos_detectados_pct']
    assert abs(d20['alertas_por_1000'] - 200) < 1e-6
    assert len(rend['roc']['puntos']) <= AN.MAX_PUNTOS and len(rend['pr']['puntos']) <= AN.MAX_PUNTOS
    assert rend['roc']['puntos'][0] == [0.0, 0.0] and rend['roc']['puntos'][-1] == [1.0, 1.0]
    c = rend['confusion_por_top'][2]
    assert c['tp'] + c['fp'] == 400 and c['tp'] + c['fn'] == int(y.sum())


def test_celdas_de_1_a_4_ninos_dan_su_cifra():
    r, y, _ = _datos(n=400)
    sexo = np.where(np.arange(400) < 3, 'raro', np.where(np.arange(400) % 2 == 0, 'femenino', 'masculino'))
    a = AN.analizar(r, y, grupos={'sexo': pd.Series(sexo)})
    por_grupo = {f['grupo']: f for f in a['equidad']['subgrupos']['sexo']}
    assert set(por_grupo) == {'femenino', 'masculino', 'raro'}        # el grupo de 3 niños sale, con su n
    assert por_grupo['raro']['n'] == 3 and por_grupo['raro']['auc'] is None   # el AUC pide 20 niños (D52)
    c5 = a['rendimiento']['metricas_por_top'][0]                      # 5 % de 400 = 20 alertas
    assert c5['alertas'] == 20
    pequeno = AN.metricas_top(y[:60], np.argsort(-r[:60]))[0][0]      # 5 % de 60 = 3 alertas: con porcentajes
    assert pequeno['alertas'] == 3 and pequeno['casos_detectados_pct'] is not None
    assert pequeno['alertas_acertadas_pct'] is not None and pequeno['sin_falsa_alarma_pct'] is not None
    conf = AN.metricas_top(y, np.argsort(-r))[2]
    assert all(isinstance(v, int) for fila in conf for k, v in fila.items() if k != 'top_pct')


def test_un_caso_en_el_top_se_dice_con_su_cifra():
    y = np.zeros(200, dtype=bool)
    y[[0, 150, 151]] = True
    orden = np.arange(200)                                            # el riesgo baja con el índice
    tops, _, conf = AN.metricas_top(y, orden)
    assert conf[0]['tp'] == 1 and conf[0]['fn'] == 2 and conf[0]['fp'] == 9    # 5 % de 200 = 10 alertas, 1 caso
    assert tops[0]['alertas_acertadas_pct'] == 10.0


def test_deciles_y_lift_con_pocos_ninos_dan_su_tasa():
    y = np.zeros(30, dtype=bool)
    y[[0, 1]] = True
    d = AN.lift(y, np.arange(30))
    assert [f['niños'] for f in d['deciles']] == [3] * 10 and d['deciles'][0]['tasa'] is not None
    assert d['deciles'][0]['lift'] is not None and all(f['lift'] is not None for f in d['acumulado'])


def test_subgrupos_con_menos_de_20_no_dan_auc():
    r, y, _ = _datos(n=300)
    g = np.where(np.arange(300) < 12, 'a', 'b')
    f = {x['grupo']: x for x in AN.subgrupos(y, r, {'g': pd.Series(g)})['g']}
    assert f['a']['auc'] is None and f['b']['auc'] is not None


def test_insuficiente():
    a = AN.analizar(np.linspace(0, 1, 10), np.array([1, 0] * 5, dtype=bool))
    assert a['rendimiento']['estado'] == 'insuficiente'


def test_trimestres_psi_y_chequeos_json():
    n = 3000
    r, y, puntaje = _datos(n=n, semilla=7)
    tri = pd.Series(np.where(np.arange(n) % 3 == 0, '2025-T1', np.where(np.arange(n) % 3 == 1, '2025-T2', '2025-T3')))
    X = pd.DataFrame({'estable': puntaje, 'deriva': puntaje + (tri == '2025-T3').to_numpy() * 3.0})
    a = AN.analizar(r, y, trimestre=tri, variables=X, importancias={'estable': 3.0, 'deriva': 1.0},
                    grupos={'sexo': pd.Series(np.where(np.arange(n) % 2 == 0, 'femenino', 'masculino'))},
                    embudo=[{'paso': 'niños', 'n': n}, {'paso': 'con desenlace', 'n': n - 10}])
    psi = a['estabilidad']['psi']['variables']
    assert psi['estable']['2025-T3'] < 0.1 < psi['deriva']['2025-T3']
    assert [m['trimestre'] for m in a['estabilidad']['metricas_trimestre']] == ['2025-T1', '2025-T2', '2025-T3']
    sem = {s['id']: s for s in a['chequeos']['semaforos']}
    assert sem['auc']['estado'] in ('verde', 'ambar') and sem['estabilidad']['estado'] == 'rojo'
    assert sem['calibracion']['estado'] == 'verde' and 'umbral' in sem['auc']
    assert a['interpretabilidad']['importancia'][0]['variable'] == 'estable'
    assert a['poblacion']['nulos'] == [] or a['poblacion']['nulos'][0]['nulos_pct'] == 0
    json.dumps(a, allow_nan=False)                                    # sin NaN y serializable


def test_decision_modelo_supera_a_todos_con_umbral_alto():
    r, y, _ = _datos(n=5000, semilla=2)
    d = AN.decision(y, r)
    ultimo = d['puntos'][-1]
    assert ultimo['modelo'] > ultimo['todos'] and len(d['puntos']) == 50
