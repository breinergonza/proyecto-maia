"""Anticipación: familias «_desde_N» entrenadas desde varias visitas; solo agregados."""
from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pandas as pd

from maia_entrenamiento import analitica_clinica as AL

ORDEN = {'40 sem': 0, '3 m EC': 1, '6 m EC': 2, '12 m EC': 4}


def _pred(momento, n=200, semilla=0, nombres=None):
    rng = np.random.default_rng(semilla)
    r = rng.random(n)
    y = rng.random(n) < r * 0.4
    return {'r': r, 'y': y, 'variables': pd.DataFrame({'a': r}, index=[f'N{i}' for i in range(n)]),
            'desenlace': SimpleNamespace(nombre='talla baja a los 12 meses (riesgo calculado a algo)', momento=momento,
                                         etapa='12 m EC')}


def test_familia_con_varias_visitas():
    preds = {'talla_baja_12m_desde_6': _pred('6 m EC', semilla=1), 'talla_baja_12m_desde_3': _pred('3 m EC'),
             'readm_3m': _pred('40 sem')}
    a = AL.anticipacion_artefactos(preds, ORDEN)
    assert set(a) == {'talla_baja_12m'}
    f = a['talla_baja_12m']
    assert [v['desde'] for v in f['visitas']] == ['3 m EC', '6 m EC']
    assert [v['ventaja_visitas'] for v in f['visitas']] == [3, 2]
    assert f['nombre'] == 'talla baja a los 12 meses' and f['top_pct'] == 10
    assert all(v['alertas'] == 20 and 0 <= v['casos_detectados_pct'] <= 100 for v in f['visitas'])
    av = f['avisados_antes']
    assert av['pct'] >= max(v['casos_detectados_pct'] for v in f['visitas']) - 0.01, 'la unión no baja de ninguna visita'
    assert 'niño' not in str(f).lower() and 'N1' not in str(f), 'no hay datos por niño'


def test_una_sola_visita_o_sin_familias_no_genera_nada():
    assert AL.anticipacion_artefactos({'talla_baja_12m_desde_3': _pred('3 m EC')}, ORDEN) == {}
    assert AL.anticipacion_artefactos({'readm_3m': _pred('40 sem')}, ORDEN) == {}
    assert AL.anticipacion_artefactos({}, ORDEN) == {}


def test_pocos_casos_se_omiten():
    p = _pred('3 m EC', n=30)
    p['y'] = np.zeros(30, dtype=bool)
    p['y'][:2] = True
    a = AL.anticipacion_artefactos({'x_12m_desde_3': p, 'x_12m_desde_6': {**p, 'desenlace': SimpleNamespace(
        nombre='x', momento='6 m EC', etapa='12 m EC')}}, ORDEN)['x_12m']
    assert a['visitas'][0]['casos'] is None and a['visitas'][0]['casos_detectados_pct'] is None
    assert a['avisados_antes']['pct'] is None
