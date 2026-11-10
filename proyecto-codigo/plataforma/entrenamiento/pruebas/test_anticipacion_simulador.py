"""Anticipación (D20, D50) de punta a punta sobre el simulador: se entrena la configuración con las filas «_desde_» y
la analítica deja ``anticipacion``, ``metricas_por_visita`` y ``primera_alerta``. Ningún dato es de pacientes."""
from __future__ import annotations

import json
from dataclasses import replace
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from anomalias import modelo as MA
from clinico import modelo as AC
from maia_comun import anticipacion as ANT
from maia_comun import simulados
from maia_entrenamiento import analitica_clinica as AL
from maia_entrenamiento import anticipacion as AA
from maia_entrenamiento import datos as D

FAMILIAS = ('readm_3m', 'oxigeno_3m', 'desarrollo_6m')


@pytest.fixture(scope='module')
def resultados():
    sev = simulados.simular(2500, 3)
    cfg = replace(D.config_clinica('simulado', anticipacion=True), rondas=40, min_casos=20, hilos=2)
    tr, _, te, _ = MA.dividir_por_tiempo(sev, (0.85, 0.0, 0.15))
    modelo = AC.ModeloClinico(cfg).ajustar(tr, progreso=False, tardias=[])
    _, _, preparado = AC.evaluar(modelo, te)
    return AL.calcular(modelo, preparado)


def test_la_configuracion_suma_las_filas_desde_solo_si_se_pide(monkeypatch):
    monkeypatch.delenv(ANT.VARIABLE_ENTORNO, raising=False)
    assert D.config_clinica('simulado') is simulados.CONFIG_CLINICA_DEMO
    claves = {d.clave for d in D.config_clinica('simulado', anticipacion=True).desenlaces}
    assert {'readm_3m_desde_pmc', 'oxigeno_3m_desde_pmc', 'desarrollo_6m_desde_pmc', 'desarrollo_6m_desde_40'} <= claves
    assert not any(c.startswith('no_vuelve_3m_desde') for c in claves), 'no vuelve a la visita queda fuera (D20)'
    monkeypatch.setenv(ANT.VARIABLE_ENTORNO, '1')
    assert len(D.config_clinica('simulado').desenlaces) == len(claves)


def test_cada_variante_se_predice_antes_y_copia_la_regla():
    base = {d.clave: d for d in simulados.CONFIG_CLINICA_DEMO.desenlaces}
    orden = {v: i for i, v in enumerate(ANT.VISITAS_SIMULADO)}
    for d in ANT.variantes(simulados.CONFIG_CLINICA_DEMO, ANT.EVENTOS_SIMULADO, ANT.VISITAS_SIMULADO):
        raiz = base[d.clave.split('_desde_')[0]]
        assert d.regla == raiz.regla and d.variable == raiz.variable
        assert orden[d.momento] < orden[ANT.EVENTOS_SIMULADO[raiz.clave]] and d.momento != raiz.momento


def test_las_tres_familias_dejan_los_tres_artefactos(resultados):
    res, descripcion = resultados
    for familia in FAMILIAS:
        assert {'anticipacion', 'metricas_por_visita', 'primera_alerta'} <= set(res[familia]), familia
        # la fila base conserva sus artefactos de siempre
        assert {'rendimiento', 'calibracion'} <= set(res[familia])
    assert 'metricas_por_visita' not in res['no_vuelve_3m']
    etiquetas = {d['clave']: d['etiqueta'] for d in descripcion}
    assert etiquetas['readm_3m'] == 'En uso' and etiquetas['readm_3m_desde_pmc'] == 'En prueba'


def test_anticipacion_cuenta_la_ventaja_en_visitas_y_los_avisados_antes(resultados):
    res, _ = resultados
    a = res['desarrollo_6m']['anticipacion']
    assert a['etiqueta'] == 'En uso' and a['top_pct'] == 10
    assert [v['desde'] for v in a['visitas']] == ['hospitalización', '40 sem', '3 m EC']
    assert [v['ventaja_visitas'] for v in a['visitas']] == [3, 2, 1]
    assert all(v['alertas'] >= 5 for v in a['visitas'])
    av = a['avisados_antes']
    if av['avisados'] is not None:   # la unión de los avisados no baja de los de ninguna visita con ventaja
        mejor = max(round(v['casos'] * v['casos_detectados_pct'] / 100) for v in a['visitas']
                    if v['ventaja_visitas'] >= 1 and v['casos'] is not None and v['casos_detectados_pct'] is not None)
        assert av['avisados'] >= mejor and 0 <= av['pct'] <= 100
    assert 'D12' in av['meta']


def test_metricas_por_visita_trae_los_cinco_porcentajes_y_el_auc(resultados):
    res, _ = resultados
    m = res['readm_3m']['metricas_por_visita']
    assert m['tops'] == [5, 10, 20, 30, 40]
    for v in m['visitas']:
        assert [t['top_pct'] for t in v['por_top']] == [5, 10, 20, 30, 40]
        assert v['auc'] is None or 0 <= v['auc'] <= 1
        detectados = [t['casos_detectados_pct'] for t in v['por_top'] if t['casos_detectados_pct'] is not None]
        assert detectados == sorted(detectados), 'alertar a más niños nunca detecta menos casos'


def test_primera_alerta_reparte_los_casos_y_no_expone_ninos(resultados):
    res, _ = resultados
    for familia in FAMILIAS:
        p = res[familia]['primera_alerta']
        assert [d['desde'] for d in p['distribucion']] == [v['desde'] for v in res[familia]['anticipacion']['visitas']]
        if p['casos'] is not None:
            contados = sum(d['casos'] or 0 for d in p['distribucion']) + (p['sin_alerta']['casos'] or 0)
            assert contados <= p['casos']
        texto = json.dumps(res[familia], ensure_ascii=False)
        assert 'sujeto' not in texto and '"N-' not in texto, 'solo agregados (D7)'


def test_las_celdas_pequenas_se_omiten():
    rng = np.random.default_rng(1)

    def pred(momento):
        r = rng.random(60)
        y = np.zeros(60, dtype=bool)
        y[:3] = True
        return {'r': r, 'y': y, 'variables': pd.DataFrame({'a': r}, index=[f'N{i}' for i in range(60)]),
                'desenlace': SimpleNamespace(nombre='x', momento=momento, etapa='12 m EC', variable=None)}
    sal = AA.artefactos({'x_12m_desde_3': pred('3 m EC'), 'x_12m_desde_6': pred('6 m EC')},
                        {'3 m EC': 1, '6 m EC': 2, '12 m EC': 4})['x_12m']
    assert sal['anticipacion']['avisados_antes']['pct'] is None and sal['primera_alerta']['casos'] is None
    assert all(d['casos'] is None for d in sal['primera_alerta']['distribucion'])
    assert all(v['auc'] is None and v['casos'] is None for v in sal['metricas_por_visita']['visitas'])
