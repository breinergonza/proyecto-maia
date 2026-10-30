"""El diccionario con versiones contra Postgres real: semilla, archivo inválido, diferencias, activar y clasificar.
Las variables nuevas son inventadas (``var_simulada_*``): ningún dato de niños."""
from __future__ import annotations

from dataclasses import replace
from datetime import date
from io import BytesIO

import pandas as pd
import pytest
from openpyxl import load_workbook
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

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
