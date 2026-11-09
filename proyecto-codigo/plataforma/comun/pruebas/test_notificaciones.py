"""El correo de alerta habla como el equipo clínico: sin «posición» ni valores clínicos, solo código, comparación y enlace.
La comparación usa la misma escala que la web: «N de cada 10» niños."""
import re
from types import SimpleNamespace

import pytest

from maia_comun.notificaciones import _cuerpo, cuantos_menos


@pytest.mark.parametrize('percentil, de_diez', [(0, 0), (9.9, 0), (87, 8), (95, 9), (97.4, 9), (100, 9)])
def test_cuantos_menos_es_la_escala_de_la_web(percentil, de_diez):
    assert cuantos_menos(percentil) == de_diez


def test_el_correo_dice_la_comparacion_y_no_la_posicion():
    filas = [SimpleNamespace(sujeto='p1', percentil=97.4), SimpleNamespace(sujeto='p2', percentil=91.0)]
    texto, html = _cuerpo('readmisión a los 3 meses', filas, 'https://maia.prueba', 95)
    assert 'más riesgo que 9 de cada 10 niños' in texto
    assert '- p1: más riesgo que 9 de cada 10 niños · https://maia.prueba/ninos/p1' in texto
    assert 'de cada 100' not in texto and 'de cada 100' not in html
    assert 'posición' not in texto.lower() and 'posición' not in html.lower()
    assert '9 de cada 10' in html and 'https://maia.prueba/ninos/p2' in html
    assert 'no diagnóstico' in texto


def test_el_correo_lleva_perfil_y_visita_sin_valores_clinicos():
    from maia_comun.perfiles import perfil_provisional
    filas = [SimpleNamespace(sujeto='p1', percentil=97.4, momento='6 meses')]
    perfiles = {'p1': perfil_provisional(30.5, 1)}   # eg 30.5 semanas, Lubchenco 1 (peso adecuado)
    texto, html = _cuerpo('readmisión', filas, 'https://maia.prueba', 95, perfiles)
    for cuerpo in (texto, html):
        assert 'Muy prematuro' in cuerpo and 'Peso adecuado' in cuerpo and 'visita 6 meses' in cuerpo
        assert '30.5' not in cuerpo and '30,5' not in cuerpo
        assert not re.search(r'\d[\d.,]*\s*(g|gr|kg|cm|semanas)\b', cuerpo)
    # sin perfil conocido, el niño sale como «Sin clasificar», sin inventar nada
    texto, _ = _cuerpo('readmisión', filas, 'https://maia.prueba', 95, {'p1': perfil_provisional(None, None)})
    assert 'Sin clasificar' in texto
