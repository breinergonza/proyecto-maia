"""The "Usar como filtro" column of the Variables sheet: the experts mark the variables a sample can be filtered by."""
import pytest
from openpyxl import load_workbook

from sevarti import diccionario as D
from sevarti import kmc as K


@pytest.fixture
def borrador(meta):
    return K.borrador(meta)


def _marcadas(dic):
    return set(dic.variables.variable[dic.variables.usar_como_filtro])


def test_el_borrador_marca_las_variables_acordadas_que_la_base_trae(borrador):
    marcadas = _marcadas(borrador)
    assert marcadas == set(K.FILTROS_POR_DEFECTO) == {'ern_sexo', 'ern_lubchencofenton'}
    assert borrador.variables.usar_como_filtro.dtype == bool


def test_ida_y_vuelta_por_el_excel_conserva_la_marca(borrador, tmp_path):
    ruta = D.escribir(borrador, tmp_path / 'diccionario.xlsx')
    titulos = [c.value for c in load_workbook(ruta)['Variables'][1]]
    assert 'Usar como filtro' in titulos
    assert _marcadas(D.leer(ruta)) == _marcadas(borrador)


def test_un_diccionario_anterior_sin_la_columna_se_lee_sin_marcas(borrador, tmp_path):
    ruta = D.escribir(borrador, tmp_path / 'diccionario.xlsx')
    wb = load_workbook(ruta)
    ws = wb['Variables']
    columna = next(c.column for c in ws[1] if c.value == 'Usar como filtro')
    ws.delete_cols(columna)
    wb.save(ruta)
    assert _marcadas(D.leer(ruta)) == set()


def test_un_valor_que_no_es_si_o_no_se_dice_en_espanol(borrador, tmp_path):
    ruta = D.escribir(borrador, tmp_path / 'diccionario.xlsx')
    wb = load_workbook(ruta)
    ws = wb['Variables']
    columna = next(c.column for c in ws[1] if c.value == 'Usar como filtro')
    ws.cell(2, columna, 'Quizás')
    wb.save(ruta)
    with pytest.raises(ValueError, match='Quizás'):
        D.leer(ruta)
