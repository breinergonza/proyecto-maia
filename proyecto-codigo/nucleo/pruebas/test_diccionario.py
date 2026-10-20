"""The variable dictionary the experts own: the draft, the Excel round trip, new and missing variables."""
from datetime import date
from pathlib import Path

import pandas as pd
import pytest
from openpyxl import load_workbook

from sevarti import __main__ as CLI
from sevarti import cargar_datos
from sevarti import contrato as SV
from sevarti import diccionario as D
from sevarti import kmc as K

CARPETA = Path(__file__).resolve().parent
HOY = date(2026, 10, 19)


def _editar(ruta: Path, hoja: str, clave: str, **cambios: object) -> int:
    """What a person does: open the Excel, find the row by its first column and type over cells.
    ``cambios`` maps a column header (with ``_`` for spaces) to the new value. Returns the Excel row."""
    wb = load_workbook(ruta)
    ws = wb[hoja]
    fila = next(c.row for c in ws['A'] if c.value == clave)
    titulos = {c.value: c.column for c in ws[1]}
    for titulo, valor in cambios.items():
        ws.cell(fila, titulos[titulo.replace('_', ' ')], valor)
    wb.save(ruta)
    return fila


def _borrar_fila(ruta: Path, variable: str) -> None:
    wb = load_workbook(ruta)
    ws = wb['Variables']
    ws.delete_rows(next(c.row for c in ws['A'] if c.value == variable))
    wb.save(ruta)


@pytest.fixture
def borrador(meta):
    return K.borrador(meta)


@pytest.fixture
def archivo(borrador, tmp_path):
    ruta = tmp_path / 'entradas' / 'diccionario.xlsx'
    D.escribir(borrador, ruta)
    return ruta


# ---------------------------------------------------------------- the draft

def test_el_borrador_reproduce_el_esquema_de_las_reglas(meta, borrador):
    pd.testing.assert_frame_equal(D.esquema(borrador), SV.normalizar_esquema(K.esquema_sevarti(meta)))
    assert (borrador.variables.estado == D.LISTA).all()


def _igual_a_lo_de_antes(sev: SV.Sevarti, tmp_path: Path) -> None:
    """``esperado_kmc/`` holds the six tables the rules produced before the dictionary existed,
    on the same simulated base."""
    nuevo, esperado = SV.leer(SV.guardar(sev, tmp_path / 'nuevo')), SV.leer(CARPETA / 'esperado_kmc')
    for tabla in SV.COLUMNAS:
        pd.testing.assert_frame_equal(getattr(nuevo, tabla), getattr(esperado, tabla), obj=tabla)
    assert nuevo.corte == esperado.corte


def test_el_borrador_entrega_las_mismas_tablas_que_antes(wide, borrador, tmp_path):
    _igual_a_lo_de_antes(K.to_sevarti(borrador, wide), tmp_path)


# ---------------------------------------------------------------- the Excel

def test_el_libro_abre_con_instrucciones_y_una_hoja_por_tabla(archivo):
    wb = load_workbook(archivo)
    assert wb.sheetnames == ['Instrucciones', 'Variables', 'Visitas', 'Episodios', 'Quiebres', 'Desenlaces',
                             'Crecimiento', 'Curva OMS']
    titulos = [c.value for c in wb['Variables'][1]]
    assert titulos[:4] == ['Variable', 'Estado', 'Nombre', 'Tema'] and 'Qué mide' in titulos
    assert wb['Variables'].freeze_panes and wb['Variables'].auto_filter.ref
    assert wb['Variables'].data_validations.dataValidation      # the closed answers are dropdowns


def test_lo_que_editan_los_expertos_llega_al_esquema_y_a_las_tablas(archivo, wide, meta):
    _editar(archivo, 'Variables', 'v261', Visita='6 m EC', Qué_mide='peso a los 6 meses')
    _editar(archivo, 'Variables', 'v262', Estado='No usar')
    dic = D.leer(archivo)
    e = D.esquema(dic).set_index('variable')
    assert e.loc['v261', 'etapa'] == '6 m EC' and e.loc['v261', 'concepto'] == 'peso a los 6 meses'
    assert 'v262' not in e.index
    sev = K.to_sevarti(dic, wide)
    assert 'v262' not in set(sev.mediciones.variable)
    antes = K.to_sevarti(K.borrador(meta), wide).mediciones
    v261 = lambda m: m[m.variable == 'v261'].set_index('sujeto').fecha  # noqa: E731
    assert (v261(sev.mediciones) != v261(antes)).any()      # it now sits at the 6 month visit
    sin_editar = D.esquema(K.borrador(meta)).set_index('variable').drop(index=['v261', 'v262'])
    pd.testing.assert_frame_equal(e.drop(index=['v261']), sin_editar)


def test_ida_y_vuelta_no_cambia_las_tablas(wide, archivo, tmp_path):
    _igual_a_lo_de_antes(K.to_sevarti(D.leer(archivo), wide), tmp_path)


def test_ida_y_vuelta_no_cambia_nada(borrador, archivo):
    otra = D.leer(archivo)
    pd.testing.assert_frame_equal(D.esquema(otra), D.esquema(borrador))
    pd.testing.assert_frame_equal(D.etapas(otra), D.etapas(borrador))
    assert D.quiebres(otra).quiebre.tolist() == D.quiebres(borrador).quiebre.tolist()
    assert (D.quiebres(otra).fecha == D.quiebres(borrador).fecha).all()
    assert otra.episodios.to_dict('list') == borrador.episodios.to_dict('list')
    for columna in ('fecha_variables', 'edad_variable'):
        assert otra.visitas[columna].fillna('').tolist() == borrador.visitas[columna].fillna('').tolist()
    assert otra.visitas.edad_fija.fillna(-1).tolist() == borrador.visitas.edad_fija.fillna(-1).tolist()


# ---------------------------------------------------------------- new and missing variables

def test_una_variable_nueva_no_se_usa_queda_por_clasificar_y_se_avisa(borrador, wide):
    sin = D.Diccionario(borrador.variables[borrador.variables.variable != 'v236g'], borrador.visitas,
                        borrador.episodios, borrador.quiebres)
    dic, nuevas, ausentes = D.conciliar(sin, borrador.variables, HOY)
    assert nuevas == ['v236g'] and ausentes == []
    fila = dic.variables.set_index('variable').loc['v236g']
    sugerida = borrador.variables.set_index('variable').loc['v236g']
    assert fila.estado == D.POR_CLASIFICAR and fila.etapa == sugerida.etapa and fila.rol == sugerida.rol
    assert '2026-10-19' in fila.nota and 'Lista' in fila.nota
    assert 'v236g' not in set(D.esquema(dic).variable)
    assert 'v236g' not in set(K.to_sevarti(dic, wide).mediciones.variable)
    pd.testing.assert_frame_equal(dic.variables.iloc[:len(sin.variables)], sin.variables)     # existing rows untouched


def test_una_variable_lista_que_la_base_ya_no_trae_se_reporta(borrador):
    de_mas = borrador.variables.iloc[[0]].assign(variable='v999', estado=D.LISTA)
    sin_uso = borrador.variables.iloc[[1]].assign(variable='v998', estado=D.NO_USAR)
    dic = D.Diccionario(pd.concat([borrador.variables, de_mas, sin_uso], ignore_index=True), borrador.visitas,
                        borrador.episodios, borrador.quiebres)
    _, nuevas, ausentes = D.conciliar(dic, borrador.variables, HOY)
    assert nuevas == [] and ausentes == ['v999']      # only the ones marked "Lista" are expected from the base


def test_la_visita_sugerida_que_no_existe_queda_vacia_y_se_dice(borrador):
    sin_visita = D.Diccionario(borrador.variables[borrador.variables.variable != 'v261'],
                               borrador.visitas[borrador.visitas.etapa != '3 m EC'], borrador.episodios,
                               borrador.quiebres)
    dic, nuevas, _ = D.conciliar(sin_visita, borrador.variables, HOY)
    fila = dic.variables.set_index('variable').loc['v261']
    assert 'v261' in nuevas and pd.isna(fila.etapa) and '3 m EC' in fila.nota


def test_agregar_las_nuevas_al_archivo_las_deja_por_clasificar(borrador, archivo, capsys):
    _borrar_fila(archivo, 'v236g')
    dic = D.sincronizar(archivo, borrador, HOY)
    assert 'v236g' not in set(D.esquema(dic).variable)
    assert D.leer(archivo).variables.set_index('variable').loc['v236g', 'estado'] == D.POR_CLASIFICAR
    salida = capsys.readouterr().out
    assert 'v236g' in salida and 'Por clasificar' in salida and '1 variable' in salida


def test_variable_ausente_se_avisa_en_pantalla(borrador, archivo, capsys):
    _editar(archivo, 'Variables', 'v261', Variable='v999')
    D.sincronizar(archivo, borrador, HOY)
    salida = capsys.readouterr().out
    assert 'v999' in salida and 'ya no trae' in salida


def test_archivo_abierto_no_rompe_la_corrida(borrador, archivo, capsys, monkeypatch):
    _borrar_fila(archivo, 'v236g')
    antes = archivo.read_bytes()

    def abierto(origen, destino):
        raise PermissionError(13, 'El archivo está en uso')

    monkeypatch.setattr(D.os, 'replace', abierto)
    dic = D.sincronizar(archivo, borrador, HOY)
    salida = capsys.readouterr().out
    assert 'abierto' in salida and 'v236g' in salida
    assert archivo.read_bytes() == antes and len(list(archivo.parent.iterdir())) == 1
    assert 'v236g' not in set(D.esquema(dic).variable)


def test_sin_novedades_no_se_reescribe_el_archivo(borrador, archivo):
    antes = archivo.read_bytes()
    D.sincronizar(archivo, borrador, HOY)
    assert archivo.read_bytes() == antes


# ---------------------------------------------------------------- validation

@pytest.mark.parametrize('hoja, clave, cambio, valor', [
    ('Variables', 'v261', {'Estado': 'Quizás'}, 'Quizás'),
    ('Variables', 'v261', {'Tipo': 'Texto libre'}, 'Texto libre'),
    ('Variables', 'v261', {'Rol': 'Jefe'}, 'Jefe'),
    ('Variables', 'v261', {'Se_mide_en_su_visita': 'Tal vez'}, 'Tal vez'),
    ('Variables', 'v261', {'No_puede_bajar': 'Casi'}, 'Casi'),
    ('Variables', 'v261', {'Visita': 'Visita fantasma'}, 'Visita fantasma'),
    ('Variables', 'v261', {'Cuánto_puede_bajar': 'mucho'}, 'mucho'),
    ('Variables', 'v262', {'Variable': 'v261'}, 'v261'),              # repeated
    ('Visitas', '3 m EC', {'Edad_contada_desde': 'Ayer'}, 'Ayer'),
    ('Visitas', '3 m EC', {'Edad_desde_(días)': 'pronto'}, 'pronto'),
    ('Quiebres', 'cambio de sistema 2022', {'Fecha': 'algún día'}, 'algún día'),
    ('Desenlaces', 'readm_3m', {'Estado': 'Quizás'}, 'Quizás'),
    ('Desenlaces', 'readm_3m', {'Cómo_se_lee': 'A ojo'}, 'A ojo'),
    ('Desenlaces', 'desarrollo_6m', {'Porcentaje_más_bajo': 'pocos'}, 'pocos'),
    ('Desenlaces', 'readm_6m', {'Clave': 'readm_3m'}, 'readm_3m'),            # repeated
    ('Crecimiento', 'Peso para la edad', {'Unidad': 'libras'}, 'libras'),
])
def test_cada_error_dice_la_hoja_la_fila_y_el_valor(archivo, hoja, clave, cambio, valor):
    fila = _editar(archivo, hoja, clave, **cambio)
    with pytest.raises(ValueError) as error:
        D.leer(archivo)
    texto = str(error.value)
    assert f'hoja "{hoja}"' in texto and f'fila {fila}' in texto and valor in texto


@pytest.mark.parametrize('que_falta', ['Estado', 'Tipo', 'Rol', 'Variable'])
def test_una_celda_obligatoria_vacia_se_nombra(archivo, que_falta):
    wb = load_workbook(archivo)
    ws = wb['Variables']
    fila = next(c.row for c in ws['A'] if c.value == 'v261')
    ws.cell(fila, {c.value: c.column for c in ws[1]}[que_falta]).value = None
    wb.save(archivo)
    with pytest.raises(ValueError, match=rf'hoja "Variables", fila {fila}.*{que_falta}'):
        D.leer(archivo)


def test_el_rol_solo_es_obligatorio_si_la_variable_esta_lista(archivo):
    fila = _editar(archivo, 'Variables', 'v261', Estado='Por clasificar')
    wb = load_workbook(archivo)
    ws = wb['Variables']
    ws.cell(fila, {c.value: c.column for c in ws[1]}['Rol']).value = None
    wb.save(archivo)
    assert D.leer(archivo).variables.set_index('variable').loc['v261', 'estado'] == D.POR_CLASIFICAR


def test_varios_errores_se_dicen_juntos(archivo):
    _editar(archivo, 'Variables', 'v261', Estado='Quizás')
    _editar(archivo, 'Variables', 'v262', Tipo='Texto libre')
    with pytest.raises(ValueError) as error:
        D.leer(archivo)
    assert 'Quizás' in str(error.value) and 'Texto libre' in str(error.value)


def _texto(t: pd.DataFrame) -> list[dict]:
    return t.astype(object).where(t.notna(), '').astype(str).to_dict('records')


def test_ida_y_vuelta_conserva_la_configuracion_clinica(borrador, archivo):
    otra = D.leer(archivo)
    for tabla in ('desenlaces', 'crecimiento', 'curva'):
        assert _texto(getattr(otra, tabla)) == _texto(getattr(borrador, tabla)), tabla


def test_un_desenlace_nuevo_es_una_fila_nueva(archivo):
    """What an expert does to add an outcome: a new row in "Desenlaces", in test first."""
    wb = load_workbook(archivo)
    ws = wb['Desenlaces']
    titulos = {c.value: c.column for c in ws[1]}
    fila = ws.max_row + 1
    for titulo, valor in {'Clave': 'convulsiones_3m', 'Alerta': 'convulsiones antes de los 3 meses',
                          'Estado': 'En prueba', 'Cómo se lee': 'Códigos', 'Se predice en': '40 sem',
                          'Variable': 'v261', 'Códigos de sí': '1', 'Códigos de no': '2'}.items():
        ws.cell(fila, titulos[titulo], valor)
    wb.save(archivo)
    nueva = D.leer(archivo).desenlaces.set_index('clave').loc['convulsiones_3m']
    assert (nueva.estado, nueva.regla, nueva.momento, nueva.variable, nueva.codigos, nueva.negativos) == \
        (D.EN_PRUEBA, 'en_codigos', '40 sem', 'v261', '1', '2')


def _sin_hojas_clinicas(ruta: Path) -> None:
    wb = load_workbook(ruta)
    for hoja in D.COMPLETABLES:
        wb.remove(wb[hoja])
    wb.save(ruta)


def test_un_diccionario_anterior_a_las_hojas_clinicas_las_recibe_sin_perder_lo_editado(borrador, archivo, capsys):
    _editar(archivo, 'Variables', 'v261', Qué_mide='peso a los 6 meses')
    _sin_hojas_clinicas(archivo)
    with pytest.raises(ValueError, match='python -m sevarti diccionario'):
        D.leer(archivo)
    dic = D.sincronizar(archivo, borrador, HOY)
    assert 'no tenía las hojas "Desenlaces", "Crecimiento", "Curva OMS"' in capsys.readouterr().out
    otra = D.leer(archivo)
    assert otra.variables.set_index('variable').loc['v261', 'concepto'] == 'peso a los 6 meses'
    assert _texto(otra.desenlaces) == _texto(borrador.desenlaces) == _texto(dic.desenlaces)


def test_un_diccionario_anterior_abierto_usa_la_configuracion_del_sistema(borrador, archivo, capsys, monkeypatch):
    _sin_hojas_clinicas(archivo)
    monkeypatch.setattr(D, 'escribir', lambda *a, **k: (_ for _ in ()).throw(PermissionError()))
    dic = D.sincronizar(archivo, borrador, HOY)
    assert 'está abierto' in capsys.readouterr().out
    assert _texto(dic.desenlaces) == _texto(borrador.desenlaces)


def test_un_archivo_ajeno_se_explica(tmp_path):
    ruta = tmp_path / 'otro.xlsx'
    pd.DataFrame({'a': [1]}).to_excel(ruta, index=False, sheet_name='Datos')
    with pytest.raises(ValueError, match='Variables'):
        D.leer(ruta)


# ---------------------------------------------------------------- the loader and the command

@pytest.fixture
def base_falsa(monkeypatch, meta, wide):
    """The KMC database replaced by the simulated base: nothing connects to the real one."""
    class Conexion:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(K, 'connect', Conexion)
    monkeypatch.setattr(K, 'load_metadata', lambda conn: meta)
    monkeypatch.setattr(K, 'load_restricted', lambda conn: set())
    monkeypatch.setattr(K, 'load_wide', lambda conn: wide)


def test_cargar_sevarti_crea_el_borrador_si_no_hay_diccionario(base_falsa, tmp_path, capsys):
    ruta = tmp_path / 'entradas' / 'diccionario.xlsx'
    sev = K.cargar_sevarti(ruta)
    assert ruta.exists() and 'se creó' in capsys.readouterr().out
    pd.testing.assert_frame_equal(sev.esquema, SV.leer(CARPETA / 'esperado_kmc').esquema)
    assert (D.leer(ruta).variables.estado == D.LISTA).all()


def test_cargar_sevarti_lee_el_diccionario_y_deja_las_nuevas_por_clasificar(base_falsa, archivo, capsys):
    _editar(archivo, 'Variables', 'v262', Estado='No usar')
    _borrar_fila(archivo, 'v236g')
    sev = K.cargar_sevarti(archivo)
    assert not {'v262', 'v236g'} & set(sev.esquema.variable) and not {'v262', 'v236g'} & set(sev.mediciones.variable)
    assert D.leer(archivo).variables.set_index('variable').loc['v236g', 'estado'] == D.POR_CLASIFICAR
    assert 'v236g' in capsys.readouterr().out


def test_el_cargador_comun_usa_el_diccionario_del_proyecto(base_falsa, proyecto):
    sev = cargar_datos(None)
    assert proyecto.diccionario.exists() and len(sev.esquema) == 316


def test_las_tablas_en_parquet_no_necesitan_diccionario(proyecto, wide, meta, tmp_path):
    carpeta = SV.guardar(K.to_sevarti(K.borrador(meta), wide), tmp_path / 'tablas')
    assert len(cargar_datos(str(carpeta)).esquema) == 316
    assert not proyecto.diccionario.exists()


def test_el_comando_diccionario_crea_y_actualiza_sin_entrenar(base_falsa, proyecto, capsys):
    CLI.main(['diccionario'])
    assert proyecto.diccionario.exists()
    _borrar_fila(proyecto.diccionario, 'v236g')
    CLI.main(['diccionario'])
    assert D.leer(proyecto.diccionario).variables.set_index('variable').loc['v236g', 'estado'] == D.POR_CLASIFICAR
    assert 'v236g' in capsys.readouterr().out
