"""Trayectorias, perfiles y anticipación (funciones puras): solo agregados, celdas < 5 omitidas, desvío con 20 o más."""
from __future__ import annotations

import numpy as np
import pandas as pd

from maia_comun import analitica as AN

ORDEN = {'40 sem': 0, '3 m EC': 1}


def _df(n_alto=8, n_resto=30, solo_alto_3m=3):
    filas = []
    rng = np.random.default_rng(0)
    for i in range(n_alto + n_resto):
        grupo = 'alto' if i < n_alto else 'resto'
        for etapa, x in (('40 sem', 0.0), ('3 m EC', 3.0)):
            if etapa == '3 m EC' and grupo == 'alto' and i >= solo_alto_3m:
                continue
            filas.append({'sujeto': f'S{i}', 'grupo': grupo, 'etapa': etapa, 'z': rng.normal(-1 if grupo == 'alto' else 0),
                          'valor': 3000 + rng.normal(0, 100), 'variable': 'peso', 'x': x})
    return pd.DataFrame(filas)


def test_celdas_y_desvio():
    r = AN.trayectorias(_df(), ORDEN, {'40 sem': '40 semanas'}, lambda v, e: 'g')
    por = {g['grupo']: {e['etapa']: e for e in g['etapas']} for g in r['grupos']}
    assert por['alto']['40 sem']['n'] == 8 and por['alto']['40 sem']['z_desvio'] is None
    assert '3 m EC' not in por['alto'], '3 niños: celda omitida'
    assert r['celdas_omitidas'] == 1
    assert por['resto']['40 sem']['z_desvio'] is not None and por['resto']['40 sem']['unidad'] == 'g'
    assert por['alto']['40 sem']['nombre'] == '40 semanas'
    assert por['alto']['40 sem']['diferencia_oms'] == por['alto']['40 sem']['z_media']


def test_grupo_pequeno_no_sale_y_vacio():
    r = AN.trayectorias(_df(n_alto=4), ORDEN)
    assert [g['grupo'] for g in r['grupos']] == ['resto'] and r['grupos_omitidos'] == 1
    assert AN.trayectorias(pd.DataFrame(), ORDEN)['grupos'] == []


def test_individuales_maximo_30_y_sin_grupos_pequenos():
    df = _df(n_alto=4, n_resto=60)
    ind = AN.trayectorias_individuales(df, ORDEN)
    assert len(ind) == 30 and all(i['grupo'] == 'resto' for i in ind)
    assert {'codigo', 'serie'} <= set(ind[0])
    assert AN.trayectorias_individuales(pd.DataFrame(), ORDEN) == []


def test_familia_desde():
    assert AN.familia_desde('talla_baja_12m_desde_3') == ('talla_baja_12m', '3')
    assert AN.familia_desde('talla_baja_12m_desde_40') == ('talla_baja_12m', '40')
    assert AN.familia_desde('readm_3m') is None


def test_anticipacion_visita():
    rng = np.random.default_rng(3)
    r = rng.random(300)
    y = rng.random(300) < r * 0.5
    a = AN.anticipacion_visita(y, r)
    assert a['alertas'] == 30 and a['n'] == 300 and a['casos_detectados_pct'] > 10
    chico = AN.anticipacion_visita(y[:40], r[:40])
    assert chico['alertas'] == 4 and chico['alertas_acertadas_pct'] is None, 'menos de 5 alertas: se omite'
