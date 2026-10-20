"""The workbooks the Fundación receives read as a deliverable, not as a database dump."""
from datetime import date

import pandas as pd
import pytest
from openpyxl import load_workbook

from archivos import libros as LB
from sevarti import contrato as SV

INTERNOS = {'id', 'sujeto', 'variable', 'etapa', 'es_error', 'le_preocupa', 'misma_medida_en_el_tiempo',
            'datos_del_nino', 'n_capas', 'riesgo', 'percentil', 'ec_dias', 'z', 'z_previo'}


def _expertos(n: int = 3) -> pd.DataFrame:
    return pd.DataFrame({
        'id': range(1, n + 1), 'sujeto': [101, 102, 103][:n], 'variable': 'v234', 'etiqueta': 'Peso (g)',
        'unidad': 'g', 'etapa': ['3 m EC', '40 sem', 'entrada PMC'][:n], 'fecha': date(2024, 5, 1),
        'edad_dias': 120, 'eg_semanas': 32.0, 'valor': 4100, 'misma_medida_en_el_tiempo': '3 meses: 4100',
        'es_error': '', 'comentario': '',
    })


def _llenar(ruta, hoja: str, titulo: str, respuestas: list[str]) -> None:
    """What a person does: open the file in Excel and type in the yellow column."""
    wb = load_workbook(ruta)
    ws = wb[hoja]
    col = next(c.column for c in ws[1] if c.value == titulo)
    for fila, r in enumerate(respuestas, start=2):
        ws.cell(fila, col, r)
    wb.save(ruta)


def test_abre_con_instrucciones_que_explican_cada_columna(tmp_path):
    ruta = LB.escribir(LB.EXPERTOS, tmp_path / 'm.xlsx', {'Datos': _expertos()}, notas=('Modelo abc.',))
    wb = load_workbook(ruta)
    assert wb.sheetnames == [LB.HOJA_INSTRUCCIONES, 'Datos']
    texto = [c.value for fila in wb[LB.HOJA_INSTRUCCIONES].iter_rows() for c in fila if c.value]
    assert texto[0] == LB.EXPERTOS.titulo and 'Modelo abc.' in texto
    for c in LB.EXPERTOS.hoja('Datos').columnas:
        assert c.titulo in texto
    assert any('3 filas' in t for t in texto)


def test_encabezados_para_personas_y_columna_de_respuesta_marcada(tmp_path):
    ruta = LB.escribir(LB.EXPERTOS, tmp_path / 'm.xlsx', {'Datos': _expertos()})
    ws = load_workbook(ruta)['Datos']
    encabezados = [c.value for c in ws[1]]
    assert not INTERNOS & set(encabezados)
    assert ws.freeze_panes == 'B2' and ws.auto_filter.ref
    col = encabezados.index('¿Es un error?') + 1
    validacion = next(iter(ws.data_validations.dataValidation))
    assert validacion.formula1 == '"Sí,No,No sé"' and validacion.showErrorMessage
    assert f'{ws.cell(1, col).column_letter}2' in str(validacion.sqref)
    assert ws.cell(2, col).fill.fgColor.rgb != ws.cell(2, 1).fill.fgColor.rgb    # the column to fill stands out


def test_las_respuestas_escritas_en_excel_vuelven_con_los_nombres_internos(tmp_path):
    ruta = LB.escribir(LB.EXPERTOS, tmp_path / 'm.xlsx', {'Datos': _expertos()})
    _llenar(ruta, 'Datos', '¿Es un error?', ['Sí', 'No', 'No sé'])
    hoja = LB.leer(LB.EXPERTOS, ruta, 'Datos')
    assert list(hoja.id) == [1, 2, 3] and list(hoja.es_error) == ['Sí', 'No', 'No sé']


def test_si_cambian_el_encabezado_de_la_respuesta_lo_dice(tmp_path):
    ruta = LB.escribir(LB.EXPERTOS, tmp_path / 'm.xlsx', {'Datos': _expertos()})
    _llenar(ruta, 'Datos', '¿Es un error?', ['Sí'])
    wb = load_workbook(ruta)
    next(c for c in wb['Datos'][1] if c.value == '¿Es un error?').value = 'error'
    wb.save(ruta)
    with pytest.raises(ValueError, match='encabezados'):
        LB.leer(LB.EXPERTOS, ruta, 'Datos')


def test_archivo_que_no_genero_el_sistema_lo_dice(tmp_path):
    ruta = tmp_path / 'otro.xlsx'
    _expertos().to_excel(ruta, sheet_name='Sheet1', index=False)
    with pytest.raises(ValueError, match='generarlo de nuevo'):
        LB.leer(LB.EXPERTOS, ruta, 'Datos')


def test_valores_como_los_lee_una_persona():
    sin_diagnostico = {9.0: 'sin diagnóstico'}
    assert LB.valor_legible(3500000.0) == '3.500.000'
    assert LB.valor_legible(57.0) == '57' and LB.valor_legible(41.62) == '41,6' and LB.valor_legible(None) == 'sin dato'
    assert LB.valor_legible('9.0', sin_diagnostico) == 'sin diagnóstico'     # a code, as its label
    assert LB.valor_legible('4.0', sin_diagnostico) == '4'                   # a code without a label
    assert LB.valor_legible('ambulatorio') == 'ambulatorio'


def test_las_visitas_se_nombran_como_las_nombra_la_fuente():
    etapas = pd.DataFrame({'etapa': ['3 m EC', 'nacimiento'], 'nombre': ['3 meses (edad corregida)', None]})
    assert SV.nombres_etapa(etapas) == {'3 m EC': '3 meses (edad corregida)', 'nacimiento': 'nacimiento'}
    assert SV.nombres_etapa(etapas.drop(columns='nombre')) == {'3 m EC': '3 m EC', 'nacimiento': 'nacimiento'}


def test_columna_que_no_varia_no_se_muestra_y_libro_vacio_se_escribe(tmp_path):
    datos = pd.DataFrame({c.clave: [] for c in LB.REVISION.hoja('Datos').columnas})
    grupos = pd.DataFrame({c.clave: [] for c in LB.REVISION.hoja('Grupos').columnas})
    no_usados = pd.DataFrame({c.clave: [] for c in LB.REVISION.hoja('No usados').columnas})
    ruta = LB.escribir(LB.REVISION, tmp_path / 'r.xlsx', {'Datos': datos, 'Grupos': grupos, 'No usados': no_usados})
    wb = load_workbook(ruta)
    assert 'Grupo' not in [c.value for c in wb['Datos'][1]]
    assert [c.value for c in wb['Datos'][2]][0] == LB.VACIA     # an empty sheet says so


def test_falta_una_columna_en_la_tabla(tmp_path):
    with pytest.raises(KeyError, match='Datos'):
        LB.escribir(LB.EXPERTOS, tmp_path / 'm.xlsx', {'Datos': _expertos().drop(columns='unidad')})
