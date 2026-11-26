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
from maia_comun import diccionarios as DIC
from maia_comun import simulados
from maia_entrenamiento import analitica_clinica as AL
from maia_entrenamiento import anticipacion as AA
from maia_entrenamiento import datos as D

FAMILIAS = ('desarrollo_12m', 'talla_baja_12m')


@pytest.fixture(scope='module')
def resultados():
    sev = simulados.simular(2500, 3)
    cfg = replace(D.config_clinica('simulado'), rondas=40, min_casos=20, hilos=2)
    tr, _, te, _ = MA.dividir_por_tiempo(sev, (0.85, 0.0, 0.15))
    modelo = AC.ModeloClinico(cfg).ajustar(tr, progreso=False, tardias=[])
    _, _, preparado = AC.evaluar(modelo, te)
    return AL.calcular(modelo, preparado)


def test_el_simulador_entrena_por_defecto_los_dos_desenlaces_a_12_meses(monkeypatch):
    """D68: desarrollo psicomotor 12 m (con sus filas «_desde_») y talla baja 12 m, sin pedir la anticipación."""
    monkeypatch.delenv(ANT.VARIABLE_ENTORNO, raising=False)
    assert {d.clave for d in D.config_clinica('simulado').desenlaces} == {
        'desarrollo_12m', 'desarrollo_12m_desde_pmc', 'desarrollo_12m_desde_40', 'desarrollo_12m_desde_3',
        'talla_baja_12m_desde_40', 'talla_baja_12m_desde_3', 'talla_baja_12m_desde_6'}
    assert D.config_clinica('simulado', anticipacion=True) == D.config_clinica('simulado')
    # se puede apagar: queda solo lo «En uso»
    monkeypatch.setenv(ANT.VARIABLE_ENTORNO, '0')
    assert D.config_clinica('simulado') is simulados.CONFIG_CLINICA_DEMO
    assert [d.clave for d in simulados.CONFIG_CLINICA_DEMO.desenlaces] == ['desarrollo_12m']


def test_la_base_real_entrena_por_defecto_lo_que_el_diccionario_semilla_deja_activo(monkeypatch):
    """Con el Diccionario semilla, la base real entrena desarrollo psicomotor 12 m y la talla baja 12 m «En prueba»
    desde cada visita, sin pedir la anticipación; los otros 47 desenlaces están «No usar»."""
    monkeypatch.delenv(ANT.VARIABLE_ENTORNO, raising=False)
    semilla = DIC.leer(DIC.SEMILLA.read_bytes())
    monkeypatch.setattr(D.CF, 'cargar', lambda prueba=False: D.CF.leer(semilla, prueba))
    assert [d.clave for d in D.config_clinica('kmc').desenlaces] == [
        'desarrollo_12m', 'talla_baja_12m_desde_40', 'talla_baja_12m_desde_3', 'talla_baja_12m_desde_6',
        'talla_baja_12m_desde_9']
    monkeypatch.setenv(ANT.VARIABLE_ENTORNO, 'no')
    assert [d.clave for d in D.config_clinica('kmc').desenlaces] == ['desarrollo_12m']


def test_cada_variante_se_predice_antes_y_copia_la_regla():
    base = {d.clave: d for d in simulados.CONFIG_CLINICA_DEMO.desenlaces}
    orden = {v: i for i, v in enumerate(ANT.VISITAS_SIMULADO)}
    for d in ANT.variantes(simulados.CONFIG_CLINICA_DEMO, ANT.EVENTOS_SIMULADO, ANT.VISITAS_SIMULADO):
        raiz = base[d.clave.split('_desde_')[0]]
        assert d.regla == raiz.regla and d.variable == raiz.variable
        assert orden[d.momento] < orden[ANT.EVENTOS_SIMULADO[raiz.clave]] and d.momento != raiz.momento


def test_las_dos_familias_dejan_los_tres_artefactos(resultados):
    res, descripcion = resultados
    for familia in FAMILIAS:
        assert {'anticipacion', 'metricas_por_visita', 'primera_alerta'} <= set(res[familia]), familia
    # la fila base conserva sus artefactos de siempre; la talla baja no tiene fila base, solo filas «_desde_»
    assert {'rendimiento', 'calibracion'} <= set(res['desarrollo_12m'])
    assert 'metricas_por_visita' not in res['talla_baja_12m_desde_40']
    etiquetas = {d['clave']: d['etiqueta'] for d in descripcion}
    assert etiquetas['desarrollo_12m'] == 'En uso' and etiquetas['desarrollo_12m_desde_pmc'] == 'En prueba'
    assert etiquetas['talla_baja_12m_desde_40'] == 'En prueba'


def test_anticipacion_cuenta_la_ventaja_en_visitas_y_los_avisados_antes(resultados):
    res, _ = resultados
    a = res['desarrollo_12m']['anticipacion']
    assert a['etiqueta'] == 'En uso' and a['top_pct'] == 10
    assert [v['desde'] for v in a['visitas']] == ['hospitalización', '40 sem', '3 m EC', '6 m EC']
    assert [v['ventaja_visitas'] for v in a['visitas']] == [4, 3, 2, 1]
    assert all(v['alertas'] >= 5 for v in a['visitas'])
    av = a['avisados_antes']
    if av['avisados'] is not None:   # la unión de los avisados no baja de los de ninguna visita con ventaja
        mejor = max(round(v['casos'] * v['casos_detectados_pct'] / 100) for v in a['visitas']
                    if v['ventaja_visitas'] >= 1 and v['casos'] is not None and v['casos_detectados_pct'] is not None)
        assert av['avisados'] >= mejor and 0 <= av['pct'] <= 100
    assert 'D12' in av['meta']


def test_metricas_por_visita_trae_los_cinco_porcentajes_y_el_auc(resultados):
    res, _ = resultados
    m = res['desarrollo_12m']['metricas_por_visita']
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


def test_las_celdas_de_1_a_4_ninos_dan_su_cifra():
    rng = np.random.default_rng(1)

    def pred(momento):
        r = rng.random(60)
        y = np.zeros(60, dtype=bool)
        y[:3] = True
        return {'r': r, 'y': y, 'variables': pd.DataFrame({'a': r}, index=[f'N{i}' for i in range(60)]),
                'desenlace': SimpleNamespace(nombre='x', momento=momento, etapa='12 m EC', variable=None)}
    sal = AA.artefactos({'x_12m_desde_3': pred('3 m EC'), 'x_12m_desde_6': pred('6 m EC')},
                        {'3 m EC': 1, '6 m EC': 2, '12 m EC': 4})['x_12m']
    av = sal['anticipacion']['avisados_antes']
    assert av['casos'] == 3 and av['pct'] is not None and sal['primera_alerta']['casos'] == 3
    assert all(isinstance(d['casos'], int) for d in sal['primera_alerta']['distribucion'])
    assert sal['primera_alerta']['sin_alerta']['casos'] is not None
    assert sal['primera_alerta']['ventaja_visitas']['media'] is None, 'la media de la ventaja pide 20 casos (D52)'
    assert all(v['casos'] == 3 and v['n'] == 60 and v['auc'] is not None for v in sal['metricas_por_visita']['visitas'])


def test_la_talla_baja_se_mide_contra_la_talla_que_el_nino_ya_tiene(resultados):
    """La regla de referencia de la talla baja es «solo el puntaje z de talla» de la visita del cálculo; el rendimiento
    dice con qué dato se calcula la regla y cuánto le gana el modelo completo, con su intervalo."""
    res, _ = resultados
    for visita, etiqueta in (('40', '40 semanas'), ('3', '3 meses')):
        ref = res[f'talla_baja_12m_desde_{visita}']['rendimiento']['referencia']
        assert len(ref['entradas']) == 1 and ref['entradas'][0].startswith('talla, puntaje z') and etiqueta in ref['entradas'][0]
        assert set(ref['diferencia']) == {'valor', 'ic_bajo', 'ic_alto'} and ref['diferencia']['valor'] is not None
    # el desarrollo psicomotor sigue comparándose con la edad gestacional y el peso al nacer
    assert len(res['desarrollo_12m']['rendimiento']['referencia']['entradas']) == 2


def test_la_validacion_deja_con_quienes_se_entreno_y_con_quienes_se_probo():
    """Para «Cómo se entrenó»: cuántos niños y nacidos entre qué años tuvo el entrenamiento y cuántos la prueba (los más
    recientes, que el modelo no vio)."""
    from maia_entrenamiento import entrenar as E
    sev = simulados.simular(2500, 3)
    cfg = replace(D.config_clinica('simulado', anticipacion=False), rondas=40, min_casos=20, hilos=2)
    retenido: dict = {}
    E.validar_clinico(sev, cfg, [], retenido)
    c = retenido['cohortes']
    assert set(c) == {'entrenamiento', 'prueba'}
    assert 0 < c['prueba']['ninos'] < c['entrenamiento']['ninos'] and c['entrenamiento']['ninos'] + c['prueba']['ninos'] <= 2500
    for parte in c.values():
        assert parte['nacidos_desde'] <= parte['nacidos_hasta']


def test_la_version_del_diccionario_llega_del_programador_o_no_se_inventa(monkeypatch):
    from maia_entrenamiento import entrenar as E
    monkeypatch.setenv('MAIA_DICCIONARIO_VERSION', '14')
    assert E.version_del_diccionario() == 14
    monkeypatch.setenv('MAIA_DICCIONARIO_VERSION', 'no es un número')
    assert E.version_del_diccionario() is None
    monkeypatch.delenv('MAIA_DICCIONARIO_VERSION')
    assert E.version_del_diccionario() is None
