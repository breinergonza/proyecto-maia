"""Los valores de la revisión de riesgos se leen como los diría el médico: etiqueta de la categoría, sin ".0"."""
from __future__ import annotations

import pytest

from maia_api.consultas import motivo_legible, opciones, unidad_mostrada, valor_legible

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


@pytest.mark.parametrize('d, esperado', [
    ({'tipo': 'numeric', 'unidad': 'g', 'etiqueta': 'Peso al nacer'}, 'g'),
    ({'tipo': 'numeric', 'unidad': 'controles', 'etiqueta': 'Numero de controles hechos por ARO'}, None),   # no «1 controles»
    ({'tipo': 'numeric', 'unidad': 'embarazos', 'etiqueta': 'Número de embarazos (con este)'}, None),
    ({'tipo': 'numeric', 'unidad': 'años', 'etiqueta': 'Edad materna (anos)'}, None),                   # sin tildes en la etiqueta
    ({'tipo': 'numeric', 'unidad': 'DIAS', 'etiqueta': 'Dias en UCI'}, None),
    ({'tipo': 'numeric', 'unidad': 'DIAS', 'etiqueta': 'Estancia hospitalaria'}, 'DIAS'),
    ({'tipo': 'categorical', 'unidad': 'NO/SI', 'etiqueta': 'Ecografía'}, None),                       # la categoría ya lo dice
    ({'tipo': 'boolean', 'unidad': 'SI/NO', 'etiqueta': 'Sarampión'}, None),
    ({'tipo': 'numeric', 'unidad': None, 'etiqueta': 'Talla'}, None),
])
def test_la_unidad_no_repite_lo_que_dice_la_etiqueta(d, esperado):
    assert unidad_mostrada(d) == esperado


def test_lo_que_mas_peso_dice_el_valor_como_el_medico():
    esq = {'v_sar': {'tipo': 'boolean', 'etiqueta': '6mEC Sarampión'},
           'peso_nacer': {'tipo': 'numeric', 'unidad': 'g', 'etiqueta': 'Peso al nacer'},
           'hematocrito': {'tipo': 'numeric', 'unidad': '%', 'etiqueta': 'Hematocrito'},
           'escolaridad': ESCOLARIDAD}
    assert motivo_legible('6mEC Sarampión (v_sar) = 0', esq) == '6mEC Sarampión (v_sar) = No'
    # el núcleo ya escribe los números como se leen en Colombia (sevarti archivos.libros.valor_legible): se dejan igual
    assert motivo_legible('Peso al nacer (peso_nacer) = 1.372', esq) == 'Peso al nacer (peso_nacer) = 1.372 g'
    assert motivo_legible('Peso al nacer (peso_nacer) = 950', esq) == 'Peso al nacer (peso_nacer) = 950 g'
    assert motivo_legible('Hematocrito (hematocrito) = 44,4', esq) == 'Hematocrito (hematocrito) = 44,4 %'
    assert motivo_legible('Escolaridad (escolaridad) = 2', esq) == 'Escolaridad (escolaridad) = primaria completa'
    # una categoría que el núcleo ya dijo con su etiqueta queda igual
    assert motivo_legible('Escolaridad (escolaridad) = primaria completa', esq) == 'Escolaridad (escolaridad) = primaria completa'
    # lo que no viene de una variable del diccionario queda igual
    assert motivo_legible('quiebre_cambio_de_sistema_2022 = 1', esq) == 'quiebre_cambio_de_sistema_2022 = 1'
    assert motivo_legible('Otra (desconocida) = 3', esq) == 'Otra (desconocida) = 3'
