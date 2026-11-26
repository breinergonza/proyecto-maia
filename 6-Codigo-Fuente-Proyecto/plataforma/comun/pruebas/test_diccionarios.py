"""El diccionario con versiones contra Postgres real: semilla, archivo inválido, diferencias, activar y clasificar.
Las variables nuevas son inventadas (``var_simulada_*``): ningún dato de niños."""
from __future__ import annotations

import zipfile
from dataclasses import replace
from datetime import date
from io import BytesIO

import pandas as pd
import pytest
from openpyxl import load_workbook
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from archivos import libros as LB
from maia_comun import diccionarios as DIC
from maia_comun.modelos_db import VersionDiccionario
from sevarti import diccionario as D

pytestmark = pytest.mark.integracion


def con_nuevas(*variables: tuple[str, str | None]) -> bytes:
    """El diccionario del núcleo con variables nuevas «Por clasificar» (nombre, rol), como las agrega una corrida."""
    dic = D.leer(DIC.SEMILLA)
    sugeridas = pd.DataFrame([{'variable': v, 'etiqueta': f'Variable simulada {v[-1]}', 'tipo': 'numeric', 'rol': rol,
                               'etapa': '3 m EC', 'tema': 'simulado'} for v, rol in variables],
                             columns=list(D.COLUMNAS['variables']))
    nuevo, _, _ = D.conciliar(dic, sugeridas, date(2026, 10, 30))
    return DIC.escribir(nuevo)


@pytest.fixture
def motor(url_db):
    m = create_engine(url_db)
    yield m
    with Session(m) as s:
        s.execute(delete(VersionDiccionario))
        s.commit()


def test_semilla_solo_si_no_hay_ninguna(motor, tmp_path):
    with Session(motor) as s:
        assert not DIC.sembrar(s, tmp_path / 'no-existe.xlsx')
        assert DIC.sembrar(s)
        assert not DIC.sembrar(s)
        s.commit()
        v = DIC.vigente(s)
        assert v.origen == 'semilla' and v.version == 1 and v.sha256 == DIC.huella(DIC.SEMILLA.read_bytes())


def test_archivo_invalido_dice_hoja_y_fila_sin_traza():
    with pytest.raises(DIC.DiccionarioInvalido, match='no es un Excel') as e:
        DIC.leer(b'esto no es un excel', 'mio.xlsx')
    assert 'Traceback' not in str(e.value)
    libro = load_workbook(DIC.SEMILLA)
    libro['Variables']['B3'] = 'Quizás'   # estado no válido en la fila 3
    salida = BytesIO()
    libro.save(salida)
    with pytest.raises(DIC.DiccionarioInvalido) as e:
        DIC.leer(salida.getvalue(), 'diccionario_editado.xlsx')
    texto = str(e.value)
    assert 'hoja "Variables", fila 3' in texto and 'Quizás' in texto and 'diccionario_editado.xlsx' in texto
    del libro['Desenlaces']
    salida = BytesIO()
    libro.save(salida)
    with pytest.raises(DIC.DiccionarioInvalido, match='Desenlaces'):
        DIC.leer(salida.getvalue())


def test_el_formulario_rechaza_un_numero_en_otra_escala_nombrando_la_fila_por_su_codigo(tmp_path):
    """Lo que hace ``_editado`` sin base de datos: aplicar el cambio, escribir el .xlsx y leerlo con el núcleo."""
    tablas = {n: t.copy() for n, t in D.mostradas(DIC.leer(DIC.SEMILLA.read_bytes())).items()}
    DIC._aplicar(tablas, {'hoja': 'Desenlaces', 'accion': 'editar', 'clave': 'desarrollo_6m',
                          'valores': {'percentil': '0.05'}})
    ruta = tmp_path / 'diccionario.xlsx'
    LB.escribir(D.LIBRO, ruta, tablas)
    with pytest.raises(DIC.DiccionarioInvalido) as e:
        DIC.leer(ruta.read_bytes())
    texto = DIC._por_fila(str(e.value), tablas)
    assert 'Desenlaces · desarrollo_6m: Porcentaje más bajo' in texto and 'entre 1 y 50' in texto
    assert 'fila' not in texto


def test_la_semilla_se_lee_con_las_escalas_validadas():
    assert len(DIC.leer(DIC.SEMILLA.read_bytes()).desenlaces)


def test_la_semilla_usa_solo_los_desenlaces_a_12_meses():
    """El asesor pidió uno o dos desenlaces (D68): desarrollo psicomotor 12 m «En uso» y talla baja 12 m «En prueba»
    (sin alertas hasta validarla). Los demás siguen en el archivo como «No usar» para que un experto los reactive."""
    des = D.leer(DIC.SEMILLA).desenlaces
    por_estado = {e: set(des.clave[des.estado == e]) for e in (D.EN_USO, D.EN_PRUEBA, D.APAGADO)}
    assert por_estado[D.EN_USO] == {'desarrollo_12m'}
    assert por_estado[D.EN_PRUEBA] == {f'talla_baja_12m_desde_{v}' for v in ('40', '3', '6', '9')}
    assert len(des) == 52 and len(por_estado[D.APAGADO]) == 47


def test_la_talla_baja_se_compara_con_la_talla_que_el_nino_ya_tiene():
    """La regla de referencia de la talla baja a 12 meses es «solo el puntaje z de talla» de la visita del cálculo: lo
    que ya se sabe del niño sin ningún modelo. El desarrollo psicomotor sigue comparándose con la edad gestacional y
    los pesos al nacer. El simulador entrena con la misma regla."""
    from maia_comun import simulados as SI
    des = D.leer(DIC.SEMILLA).desenlaces.set_index('clave')
    assert {des.comparar[f'talla_baja_12m_desde_{v}'] for v in ('40', '3', '6', '9')} == {'z_talla'}
    assert des.comparar['desarrollo_12m'] == 'eg_semanas;ern_peso;v196a'
    assert all(d.comparar == ('z_talla',) for d in SI.EN_PRUEBA_DEMO)


def test_diferencias_entre_versiones():
    base = D.leer(DIC.SEMILLA)
    nuevo = DIC.leer(con_nuevas(('var_simulada_a', 'medicion')))
    variables = nuevo.variables.copy()
    quitada = str(base.variables.variable.iloc[0])
    cambiada = str(base.variables.variable.iloc[1])
    variables = variables[variables.variable != quitada]
    variables.loc[variables.variable == cambiada, 'estado'] = D.NO_USAR
    desenlaces = nuevo.desenlaces.copy()
    apagado = str(desenlaces.clave[desenlaces.estado == D.EN_USO].iloc[0])
    activado = str(desenlaces.clave[desenlaces.estado == D.EN_PRUEBA].iloc[0])
    desenlaces.loc[desenlaces.clave == apagado, 'estado'] = D.APAGADO
    desenlaces.loc[desenlaces.clave == activado, 'estado'] = D.EN_USO
    d = DIC.diferencias(base, replace(nuevo, variables=variables, desenlaces=desenlaces))
    assert [n['variable'] for n in d['nuevas']] == ['var_simulada_a']
    assert d['nuevas'][0]['estado'] == D.POR_CLASIFICAR and d['nuevas'][0]['visita'] == '3 meses (edad corregida)'
    assert [q['variable'] for q in d['quitadas']] == [quitada]
    assert [(x['variable'], x['antes'], x['despues']) for x in d['estados']] == [(cambiada, D.LISTA, D.NO_USAR)]
    assert [x['clave'] for x in d['desenlaces_activados']] == [activado]
    assert d['desenlaces_activados'][0]['antes'] == 'En prueba' and d['desenlaces_activados'][0]['despues'] == 'En uso'
    assert [x['clave'] for x in d['desenlaces_apagados']] == [apagado] and not d['sin_cambios']
    assert DIC.diferencias(base, base)['sin_cambios']


def test_activar_y_volver_a_una_anterior(motor):
    with Session(motor) as s:
        DIC.sembrar(s)
        v2 = DIC.guardar(s, con_nuevas(('var_simulada_b', 'medicion')), 'subido', estado='vigente')
        s.commit()
        assert [v.estado for v in s.scalars(select(VersionDiccionario).order_by(VersionDiccionario.version))] == [
            'archivado', 'vigente']
        v1 = s.scalars(select(VersionDiccionario).where(VersionDiccionario.version == 1)).one()
        DIC.activar(s, v1.id)
        s.commit()
        assert DIC.vigente(s).version == 1 and s.get(VersionDiccionario, v2.id).estado == 'archivado'
        with pytest.raises(LookupError):
            DIC.activar(s, 999_999)


def test_clasificar_genera_una_version_vigente(motor):
    with Session(motor) as s:
        DIC.guardar(s, con_nuevas(('var_simulada_c', 'medicion'), ('var_simulada_d', None)), 'subido', estado='vigente')
        s.commit()
        assert [v['variable'] for v in DIC.por_clasificar(DIC.leer(DIC.vigente(s).archivo))] == [
            'var_simulada_c', 'var_simulada_d']
        v = DIC.clasificar(s, 'var_simulada_c', D.LISTA)
        s.commit()
        assert v.estado == 'vigente' and v.version == 2 and 'var_simulada_c' in v.nota
        assert [x['variable'] for x in DIC.por_clasificar(DIC.leer(v.archivo))] == ['var_simulada_d']
        # sin rol no puede quedar «Lista»: lo dice en español y no crea versión
        with pytest.raises(DIC.DiccionarioInvalido, match='Rol'):
            DIC.clasificar(s, 'var_simulada_d', D.LISTA)
        s.rollback()
        v = DIC.clasificar(s, 'var_simulada_d', D.NO_USAR)
        s.commit()
        assert v.version == 3 and DIC.por_clasificar(DIC.leer(v.archivo)) == []
        with pytest.raises(LookupError):
            DIC.clasificar(s, 'no_existe', D.NO_USAR)


def test_borrador_de_corrida_se_suma_a_la_vigente(motor, tmp_path):
    ruta = tmp_path / 'entradas' / 'diccionario.xlsx'
    with Session(motor, expire_on_commit=False) as s:
        DIC.sembrar(s)
        s.commit()
        base = DIC.bajar_vigente(s, ruta)
        assert ruta.read_bytes() == base.archivo
        assert DIC.guardar_de_corrida(s, base, ruta) == (None, [])   # no cambió
        ruta.write_bytes(con_nuevas(('var_simulada_e', 'medicion')))
        b, nuevas = DIC.guardar_de_corrida(s, base, ruta, 41)
        s.commit()
        assert nuevas == ['var_simulada_e'] and b.estado == 'borrador' and b.origen == 'corrida'
        assert b.nota == 'Actualización con 1 variable nueva de la base (ejecución 41).'
        assert DIC.borrador_pendiente(s).id == b.id
        # mientras tanto un experto cambia la vigente: activar el borrador no deshace ese cambio
        variable = str(D.leer(DIC.SEMILLA).variables.variable.iloc[0])
        dic = DIC.leer(base.archivo)
        variables = dic.variables.copy()
        variables.loc[variables.variable == variable, 'estado'] = D.NO_USAR
        DIC.guardar(s, DIC.escribir(replace(dic, variables=variables)), 'subido', estado='vigente')
        s.commit()
        v = DIC.activar(s, b.id)
        s.commit()
        final = DIC.leer(v.archivo).variables.set_index('variable').estado
        assert final[variable] == D.NO_USAR and final['var_simulada_e'] == D.POR_CLASIFICAR
        assert s.get(VersionDiccionario, b.id).estado == 'archivado' and DIC.borrador_pendiente(s) is None


# ------------------------------------------------------------------ editar con formularios

def _primera(dic: D.Diccionario, tabla: str, columna: str) -> str:
    return str(getattr(dic, tabla)[columna].iloc[0])


def test_vista_trae_lo_que_necesita_cada_formulario():
    hojas = {h['nombre']: h for h in DIC.vista(D.leer(DIC.SEMILLA))}
    columnas = {c['clave']: c for c in hojas['Variables']['columnas']}
    assert columnas['tipo']['opciones'] == ['Número', 'Categoría', 'Sí/No'] and columnas['tipo']['obligatoria']
    assert columnas['etapa']['lista'] == 'Visitas' and columnas['etiqueta']['explica']
    assert columnas['tolerancia']['tipo'] == 'numero' and columnas['nota']['largo']
    assert {c['clave']: c['tipo'] for c in hojas['Quiebres']['columnas']}['fecha'] == 'fecha'
    assert hojas['Variables']['clave'] == 'variable' and hojas['Desenlaces']['clave'] == 'clave'
    # las variables las trae la base y la curva es una sola fila: no se agregan ni se borran
    assert [h['nombre'] for h in hojas.values() if h['agregar']] == ['Visitas', 'Episodios', 'Quiebres', 'Desenlaces',
                                                                     'Crecimiento']


def test_editar_crea_una_version_vigente(motor):
    with Session(motor) as s:
        DIC.sembrar(s)
        s.commit()
        base = DIC.vigente(s)
        dic = DIC.leer(base.archivo)
        variable, visita = _primera(dic, 'variables', 'variable'), _primera(dic, 'visitas', 'etapa')
        cambios = [{'hoja': 'Variables', 'accion': 'editar', 'clave': variable, 'valores': {'etiqueta': 'Nombre corregido'}},
                   {'hoja': 'Visitas', 'accion': 'editar', 'clave': visita, 'valores': {'edad_min': '30,5'}},
                   {'hoja': 'Quiebres', 'accion': 'agregar', 'clave': None,
                    'valores': {'quiebre': 'Cambio simulado', 'fecha': '2024-01-01'}}]
        assert DIC.revisar(s, base.id, cambios)['vigente'] == base.version
        v = DIC.editar(s, base.id, cambios, usuario_id=None)
        s.commit()
        assert v.estado == 'vigente' and v.origen == 'subido' and v.version == 2
        assert v.nota == 'Editado en la web: 3 cambios en Variables, Visitas y Quiebres.'
        nuevo = DIC.leer(v.archivo)
        assert nuevo.variables.set_index('variable').etiqueta[variable] == 'Nombre corregido'
        assert nuevo.visitas.set_index('etapa').edad_min[visita] == 30.5
        assert 'Cambio simulado' in set(nuevo.quiebres.quiebre)
        assert len(nuevo.variables) == len(dic.variables)
        # quitar lo que se agregó
        v3 = DIC.editar(s, v.id, [{'hoja': 'Quiebres', 'accion': 'borrar', 'clave': 'Cambio simulado', 'valores': {}}],
                        nota='Sin el quiebre de prueba.')
        s.commit()
        assert 'Cambio simulado' not in set(DIC.leer(v3.archivo).quiebres.quiebre) and v3.nota == 'Sin el quiebre de prueba.'
        # editar sobre una versión que ya no es la vigente no pisa lo de otro
        with pytest.raises(DIC.Desactualizado, match='versión 3'):
            DIC.editar(s, base.id, cambios)


def test_editar_rechaza_lo_que_no_vale_sin_guardar(motor):
    with Session(motor) as s:
        DIC.guardar(s, con_nuevas(('var_simulada_f', None)), 'subido', estado='vigente')
        s.commit()
        base = DIC.vigente(s)
        variable = _primera(DIC.leer(base.archivo), 'variables', 'variable')

        def editar(*cambios):
            return DIC.editar(s, base.id, list(cambios))

        # el error nombra la fila por su código, no por la fila del Excel
        with pytest.raises(DIC.DiccionarioInvalido, match=r'Variables · var_simulada_f: falta Rol') as e:
            editar({'hoja': 'Variables', 'accion': 'editar', 'clave': 'var_simulada_f', 'valores': {'estado': D.LISTA}})
        assert 'diccionario.xlsx' not in str(e.value) and 'fila' not in str(e.value)
        with pytest.raises(DIC.DiccionarioInvalido, match='no es un número'):
            editar({'hoja': 'Variables', 'accion': 'editar', 'clave': variable, 'valores': {'tolerancia': 'mucho'}})
        with pytest.raises(DIC.DiccionarioInvalido, match='No usar'):
            editar({'hoja': 'Variables', 'accion': 'borrar', 'clave': variable, 'valores': {}})
        with pytest.raises(DIC.DiccionarioInvalido, match='no se cambia'):
            editar({'hoja': 'Variables', 'accion': 'editar', 'clave': variable, 'valores': {'variable': 'otra'}})
        with pytest.raises(DIC.DiccionarioInvalido, match='columna'):
            editar({'hoja': 'Variables', 'accion': 'editar', 'clave': variable, 'valores': {'no_existe': '1'}})
        with pytest.raises(DIC.DiccionarioInvalido, match='hoja'):
            editar({'hoja': 'Otra', 'accion': 'editar', 'clave': variable, 'valores': {}})
        with pytest.raises(LookupError):
            editar({'hoja': 'Variables', 'accion': 'editar', 'clave': 'no_existe', 'valores': {'nota': 'x'}})
        with pytest.raises(DIC.SinCambios):
            editar({'hoja': 'Variables', 'accion': 'editar', 'clave': variable,
                    'valores': {'etiqueta': _primera(DIC.leer(base.archivo), 'variables', 'etiqueta')}})
        s.rollback()
        assert s.scalar(select(VersionDiccionario.version).order_by(VersionDiccionario.version.desc())) == 1


# ------------------------------------------------------------------ un .xlsx subido no se guarda ni se sirve tal cual

def _con_formula_y_hoja_extra() -> bytes:
    libro = load_workbook(DIC.SEMILLA)
    libro['Variables']['Z60'] = '=HYPERLINK("http://ejemplo.invalid","clic")'   # fuera de la tabla: el núcleo no la lee
    libro.create_sheet('Extra')['A1'] = '=1+1'
    salida = BytesIO()
    libro.save(salida)
    return salida.getvalue()


def _bomba(miembros: int = 1, tamano: int = 60 * 1024 * 1024) -> bytes:
    """Un zip pequeño cuyos miembros declaran mucho más de lo que pesa el archivo."""
    salida = BytesIO()
    with zipfile.ZipFile(salida, 'w', zipfile.ZIP_DEFLATED) as z:
        for i in range(miembros):
            z.writestr(f'relleno{i}.bin', b'\0' * tamano)
    return salida.getvalue()


def test_normalizar_guarda_solo_las_tablas_sin_formulas_ni_hojas_extra():
    original = _con_formula_y_hoja_extra()
    assert 'Extra' in load_workbook(BytesIO(original)).sheetnames   # el archivo subido sí las trae
    contenido = DIC.normalizar(original, 'mio.xlsx')
    libro = load_workbook(BytesIO(contenido))
    regenerado = load_workbook(BytesIO(DIC.escribir(DIC.leer(DIC.SEMILLA.read_bytes())))).sheetnames
    assert libro.sheetnames == regenerado and 'Extra' not in libro.sheetnames
    assert libro['Variables']['Z60'].value is None
    assert not [c for hoja in libro for fila in hoja.iter_rows() for c in fila if c.data_type == 'f']
    assert DIC.iguales(DIC.leer(contenido), DIC.leer(DIC.SEMILLA.read_bytes()))   # y las tablas quedan intactas


def test_la_semilla_se_normaliza_y_se_sigue_leyendo_igual():
    semilla = DIC.SEMILLA.read_bytes()
    contenido = DIC.normalizar(semilla)
    assert DIC.iguales(DIC.leer(contenido), DIC.leer(semilla)) and DIC.normalizar(contenido) != b''
    assert not DIC.iguales(DIC.leer(con_nuevas(('var_simulada_a', 'medicion'))), DIC.leer(semilla))


def test_un_zip_que_se_expande_demasiado_se_rechaza_antes_de_leerlo(monkeypatch):
    def no_debe_leerse(*_a, **_k):
        raise AssertionError('se leyó el archivo')
    monkeypatch.setattr(D, 'leer', no_debe_leerse)
    bomba = _bomba()
    assert len(bomba) < DIC.MAX_BYTES
    with pytest.raises(DIC.DiccionarioInvalido, match=r'descomprimido.*50 MB') as e:
        DIC.leer(bomba, 'bomba.xlsx')
    assert 'Traceback' not in str(e.value)
    with pytest.raises(DIC.DiccionarioInvalido, match='demasiados archivos'):
        DIC.leer(_bomba(miembros=DIC.MAX_MIEMBROS + 1, tamano=10), 'muchos.xlsx')


def test_guardar_lo_subido_guarda_el_libro_regenerado(motor):
    original = _con_formula_y_hoja_extra()
    with Session(motor) as s:
        v = DIC.guardar(s, original, 'subido', estado='vigente')
        s.commit()
        libro = load_workbook(BytesIO(v.archivo))
        assert 'Extra' not in libro.sheetnames and libro['Variables']['Z60'].value is None and v.archivo != original
        assert v.sha256 == DIC.huella(v.archivo)   # la huella es la del archivo que se sirve
