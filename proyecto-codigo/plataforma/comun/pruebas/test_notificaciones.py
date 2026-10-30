"""El correo de alerta habla como el equipo clínico: sin «posición» ni valores clínicos, solo código, comparación y enlace."""
from types import SimpleNamespace

from maia_comun.notificaciones import _cuerpo


def test_el_correo_dice_la_comparacion_y_no_la_posicion():
    filas = [SimpleNamespace(sujeto='p1', percentil=97.4), SimpleNamespace(sujeto='p2', percentil=91.0)]
    texto, html = _cuerpo('readmisión a los 3 meses', filas, 'https://maia.prueba', 95)
    assert 'más riesgo que 95 de cada 100 niños' in texto
    assert '- p1: más riesgo que 97 de cada 100 niños · https://maia.prueba/ninos/p1' in texto
    assert 'posición' not in texto.lower() and 'posición' not in html.lower()
    assert '97 de cada 100' in html and 'https://maia.prueba/ninos/p2' in html
    assert 'no diagnóstico' in texto
