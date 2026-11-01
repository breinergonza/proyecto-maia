"""Los valores de la revisión de riesgos se leen como los diría el médico: etiqueta de la categoría, sin ".0"."""
from __future__ import annotations

import pytest

from maia_api.consultas import opciones, valor_legible

ECOGRAFIA = {'tipo': 'categorical', 'categorias': '1=Sí;0=No'}
ESCOLARIDAD = {'tipo': 'categorical', 'categorias': '1=primaria incompleta;2=primaria completa;9=sin dato'}


@pytest.mark.parametrize('d, valor, esperado', [
    (ECOGRAFIA, '1.0', 'Sí'),                              # el código llega como decimal de la base
    (ECOGRAFIA, '0', 'No'),
    (ESCOLARIDAD, '1', 'primaria incompleta'),
    (ESCOLARIDAD, '2.0', 'primaria completa'),
    (ESCOLARIDAD, '7.0', '7'),                             # un código sin etiqueta se dice sin el ".0"
    ({'tipo': 'boolean'}, '1.0', 'Sí'),
    ({'tipo': 'boolean'}, '0.0', 'No'),
    ({'tipo': 'boolean', 'categorias': '1=con ecografía;0=sin ecografía'}, '1.0', 'con ecografía'),
    ({'tipo': 'numeric'}, '5.0', '5'),
    ({'tipo': 'numeric'}, '0.0', '0'),
    ({'tipo': 'numeric'}, '12644.800000000001', '12644,8'),
    ({'tipo': 'numeric'}, '3.125', '3,125'),
    ({'tipo': 'numeric'}, '-2.0', '-2'),
    ({'tipo': 'numeric'}, 'positivo', 'positivo'),
    ({}, '4.0', '4'),
])
def test_valor_legible(d, valor, esperado):
    assert valor_legible(d, valor) == esperado


def test_opciones_lee_las_etiquetas_del_diccionario():
    assert opciones('1=displasia;9=sin diagnóstico') == [
        {'valor': '1', 'etiqueta': 'displasia'}, {'valor': '9', 'etiqueta': 'sin diagnóstico'}]
    assert opciones(None) == [] and opciones('  ') == []
