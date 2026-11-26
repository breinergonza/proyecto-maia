"""La unidad de un dato de crecimiento sale de su variable de origen; sin ella, del indicador y la etapa."""
from __future__ import annotations

from maia_api.consultas import unidades_crecimiento
from maia_api.rutas.ninos import unidad_crecimiento

ESQ = {
    'peso_kg': {'concepto': 'peso', 'etapa': 'e1', 'unidad': 'kg'},
    'talla_cm': {'concepto': 'talla', 'etapa': 'e1', 'unidad': 'cm'},
    'peso_g': {'concepto': 'peso_g', 'etapa': 'e2', 'unidad': ' g '},
    'sin_unidad': {'concepto': 'x', 'etapa': 'e1', 'unidad': None},
}


def test_peso_para_talla_toma_la_unidad_de_la_variable_de_peso():
    u = unidades_crecimiento(ESQ)
    assert u.get(('peso_para_talla', 'e1')) is None     # ningún concepto se llama así
    assert unidad_crecimiento(ESQ, u, 'peso_kg', 'peso_para_talla', 'e1') == 'kg'
    assert unidad_crecimiento(ESQ, u, 'peso_g', 'peso_para_talla', 'e2') == 'g'
    assert unidad_crecimiento(ESQ, u, 'sin_unidad', 'peso_para_talla', 'e1') is None


def test_corrida_vieja_sin_variable_usa_indicador_y_etapa():
    u = unidades_crecimiento(ESQ)
    assert unidad_crecimiento(ESQ, u, None, 'talla', 'e1') == 'cm'
    assert unidad_crecimiento(ESQ, u, 'variable_que_ya_no_existe', 'peso', 'e1') == 'kg'
