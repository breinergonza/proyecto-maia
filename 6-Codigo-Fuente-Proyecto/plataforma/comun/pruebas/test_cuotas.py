"""Límites de Mis modelos: valores de fábrica, validación y métricas principales del banco (sin base de datos)."""
import pytest

from maia_comun import cuotas as CU
from maia_comun.metricas import principales


def test_valores_de_fabrica_son_los_de_siempre(monkeypatch):
    monkeypatch.delenv('MAIA_CUOTA_COLA', raising=False)
    monkeypatch.delenv('MAIA_CUOTA_MODELOS', raising=False)
    assert CU.valores() == {'cola_max': 1, 'modelos_max': 3, 'dias_sin_uso': 90, 'dias_aviso': 14}
    assert CU.cuota_cola() == 1 and CU.cuota_modelos() == 3 and CU.dias_sin_uso() == 90


def test_el_entorno_sigue_cambiando_el_valor_de_fabrica(monkeypatch):
    monkeypatch.setenv('MAIA_CUOTA_COLA', '4')
    monkeypatch.setenv('MAIA_CUOTA_MODELOS', 'abc')
    assert CU.cuota_cola() == 4 and CU.cuota_modelos() == 3


@pytest.mark.parametrize('cambio', [{'otra': 1}, {'cola_max': -1}, {'cola_max': 1.5}, {'dias_sin_uso': 0},
                                    {'modelos_max': True}, {'dias_aviso': 400}])
def test_validar_rechaza_lo_raro(cambio):
    with pytest.raises(ValueError):
        CU.validar(cambio)


def test_validar_acepta_enteros_en_rango():
    assert CU.validar({'cola_max': 0, 'dias_sin_uso': 30}) == {'cola_max': 0, 'dias_sin_uso': 30}


def test_principales_promedia_por_desenlace_y_nunca_incluye_la_regla():
    m = {'auc__a': 0.8, 'auc__b': 0.6, 'auc_regla__a': 0.1, 'pr_auc__a': 0.3, 'calibracion__a': 0.9}
    assert principales('clinico', m) == {'auc': 0.7, 'pr_auc': 0.3}
    assert principales('anomalias', {'detectados_pct__x__y': 80.0, 'falsas_por_1000__y': 12.0}) == \
        {'detectados_pct': 80.0, 'falsas_por_1000': 12.0}
    assert principales('clinico', {}) == {}
