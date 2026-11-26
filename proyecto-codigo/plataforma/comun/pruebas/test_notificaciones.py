"""El correo de alerta es un resumen por alerta (sin niños ni valores clínicos); el detalle va en el Excel.
La comparación usa la misma escala que la web: «N de cada 10» niños."""
import re
from io import BytesIO
from types import SimpleNamespace

import pytest
from openpyxl import load_workbook

from maia_comun.notificaciones import COLUMNAS_EXCEL, _cuerpo, _resumen_por_alerta, asunto, cuantos_menos, libro_excel


@pytest.mark.parametrize('percentil, de_diez', [(0, 0), (9.9, 0), (87, 8), (95, 9), (97.4, 9), (100, 9)])
def test_cuantos_menos_es_la_escala_de_la_web(percentil, de_diez):
    assert cuantos_menos(percentil) == de_diez


def _fila(sujeto, clave, desenlace, percentil):
    return SimpleNamespace(sujeto=sujeto, clave=clave, desenlace=desenlace, percentil=percentil, momento='6 meses')


def _filas():
    # «Muy alto» desde PERCENTIL_MUY_ALTO (95); con mínimo 90 también entran niños en «Alto»
    return [_fila('KMC-001', 'readm', 'readmisión a los 3 meses', 99.0), _fila('KMC-002', 'readm', 'readmisión a los 3 meses', 92.0),
            _fila('KMC-003', 'crec', 'crecimiento bajo', 91.5), _fila('KMC-004', 'mort', 'mortalidad', 98.0)]


def test_el_correo_es_un_resumen_sin_detalle_de_ninos():
    texto, html = _cuerpo('Alertas del servicio', _filas(), 'https://maia.prueba', 90)
    for cuerpo in (texto, html):
        assert not re.search(r'KMC-\d+', cuerpo), 'ningún código de niño en el cuerpo'
        assert 'posición' not in cuerpo.lower() and 'de cada 100' not in cuerpo
        assert 'Muy prematuro' not in cuerpo and 'visita 6 meses' not in cuerpo
        assert 'de cada 10' in cuerpo and 'kmcpred-riesgo-alto.xlsx' in cuerpo and 'El equipo clínico toma la decisión.' in cuerpo
        assert '4 niños con riesgo alto' in cuerpo and 'Alertas del servicio' in cuerpo
        assert 'más riesgo que 9 de cada 10' in cuerpo.replace('&aacute;', 'á').replace('&ntilde;', 'ñ')
        assert 'readmisión a los 3 meses' in cuerpo and 'crecimiento bajo' in cuerpo and 'mortalidad' in cuerpo
    assert 'Total: 4 niños en 3 alertas.' in texto
    assert '- readmisión a los 3 meses: 2 niños (1 Muy alto, 1 Alto)' in texto
    assert '- crecimiento bajo: 1 niño (0 Muy alto, 1 Alto)' in texto
    assert 'https://maia.prueba/ninos?desenlace=readm&percentil_min=90' in texto


def test_el_resumen_cuenta_por_alerta_y_nivel_de_mas_a_menos():
    resumen = _resumen_por_alerta(_filas())
    assert [(g['alerta'], g['ninos'], g['muy_alto'], g['alto']) for g in resumen] == [
        ('readmisión a los 3 meses', 2, 1, 1), ('crecimiento bajo', 1, 0, 1), ('mortalidad', 1, 1, 0)]


def test_una_sola_alerta_enlaza_la_lista_filtrada_y_varias_enlazan_la_lista_general():
    una = [f for f in _filas() if f.clave == 'readm']
    texto, html = _cuerpo('N', una, 'https://maia.prueba', 90)
    assert 'Ver niños en la plataforma: https://maia.prueba/ninos?desenlace=readm&percentil_min=90' in texto
    assert 'href="https://maia.prueba/ninos?desenlace=readm&amp;percentil_min=90"' in html
    texto, html = _cuerpo('N', _filas(), 'https://maia.prueba', 90)
    assert 'Ver niños en la plataforma: https://maia.prueba/ninos\n' in texto + '\n'
    assert 'href="https://maia.prueba/ninos"' in html


def test_el_html_escapa_y_no_trae_nada_externo():
    maligno = SimpleNamespace(sujeto='KMC-9', clave='x', desenlace='<b>alerta</b>', percentil=99)
    texto, html = _cuerpo('<script>alert(1)</script>', [maligno], 'https://maia.prueba', 90)
    assert '<script' not in html and '&lt;script&gt;' in html and '&lt;b&gt;alerta&lt;/b&gt;' in html
    assert '<img' not in html and 'url(' not in html and '<link' not in html
    assert set(re.findall(r'(?:src|href)="(https?://[^"/]+)', html)) == {'https://maia.prueba'}
    assert 'http://' not in html
    for color in ('#1f4e52', '#f6f8f8', '#fbeae5', '#a8472a', '#f7eed9', '#7a5712', '#14262a'):
        assert color in html
    assert 'KMCPred' in html and 'Observatorio Canguro' not in html and 'viewport' in html and 'max-width:600px' in html


def test_el_asunto_lleva_el_nombre_de_la_plataforma():
    assert asunto(4, 'Alertas del servicio') == '[KMCPred] 4 niños con riesgo alto: Alertas del servicio'
    assert asunto(1, 'N') == '[KMCPred] 1 niño con riesgo alto: N'


def test_el_excel_lista_a_todos_sin_valores_clinicos():
    filas = [SimpleNamespace(sujeto='p1', percentil=97.4, momento='6 meses', desenlace='readmisión'),
             SimpleNamespace(sujeto='p2', percentil=91.0, momento='3 meses', desenlace='crecimiento')]
    perfiles = {'p1': {'etiqueta_corta': 'Muy prematuro · Peso adecuado'}}
    hoja = load_workbook(BytesIO(libro_excel(filas, perfiles, 'https://maia.prueba'))).active
    valores = [[c.value for c in fila] for fila in hoja.iter_rows()]
    assert valores[0] == COLUMNAS_EXCEL
    assert valores[1] == ['p1', 'Muy prematuro · Peso adecuado', '6 meses', 'readmisión', 9, 'Muy alto',
                          'https://maia.prueba/ninos/p1']
    assert valores[2][1] == 'Sin clasificar' and valores[2][5] == 'Alto' and len(valores) == 3
