"""El diccionario de variables por la API: semilla al arrancar, permisos (la consulta no entra), subir con
diferencias antes de confirmar, archivo inválido en español, descargar, volver a una versión, clasificar y el borrador
de una actualización. Variables inventadas (``var_simulada_*``); entorno ``local`` contra Postgres real."""
from __future__ import annotations

import zipfile
from datetime import date
from io import BytesIO

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import select

pytestmark = pytest.mark.integracion

ADMIN = ('admin@maia.prueba', 'clave-admin-de-prueba')
EXPERTO = ('experto@maia.prueba', 'clave-experto-de-prueba')
CONSULTA = ('consulta@maia.prueba', 'clave-consulta-de-prueba')
CLINICO = ('clinico@maia.prueba', 'clave-clinico-de-prueba')
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


@pytest.fixture(scope='module')
def cliente(url_db_propia, tmp_path_factory):
    from maia_api import estado as E
    from maia_api import seguridad as SG
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('api_diccionario')
    mp = pytest.MonkeyPatch()
    for k, v in {'DATABASE_URL': url_db_propia, 'MAIA_ENTORNO': 'local', 'MAIA_SOLO_SIMULADO': 'true',
                 'MAIA_CIFRADO_CLAVE': 'llave-de-cifrado-de-prueba-con-32-caracteres',
                 'MAIA_JWT_SECRETO': 'secreto-jwt-de-prueba-con-mas-de-32-caracteres', 'MAIA_PAQUETE_CLAVE': 'p' * 20,
                 'MAIA_ADMIN_EMAIL': ADMIN[0], 'MAIA_ADMIN_CLAVE': ADMIN[1], 'MAIA_DIR_PAQUETES': str(tmp / 'paquetes'),
                 'KMC_PW': ''}.items():
        mp.setenv(k, v)
    mp.chdir(tmp)
    config.obtener.cache_clear()
    db.motor.cache_clear()
    E.limpiar()
    SG.limite_login.limpiar()
    from maia_api.main import crear_app
    with TestClient(crear_app()) as c:
        yield c
    E.limpiar()
    mp.undo()
    config.obtener.cache_clear()
    db.motor.cache_clear()


def _login(c: TestClient, email: str, clave: str) -> dict:
    from maia_api import seguridad as SG
    SG.limite_login.limpiar()
    r = c.post('/api/auth/login', json={'email': email, 'clave': clave})
    assert r.status_code == 200, r.text
    return {'Authorization': f'Bearer {r.json()["acceso"]}'}


@pytest.fixture(scope='module')
def admin(cliente):
    return _login(cliente, *ADMIN)


def _usuario(cliente, admin, datos, rol, nombre):
    r = cliente.post('/api/usuarios', headers=admin, json={'email': datos[0], 'nombre': nombre, 'rol': rol, 'clave': datos[1]})
    assert r.status_code == 201, r.text
    return _login(cliente, *datos)


@pytest.fixture(scope='module')
def experto(cliente, admin):
    return _usuario(cliente, admin, EXPERTO, 'datos', 'Experta')


@pytest.fixture(scope='module')
def clinico(cliente, admin):
    return _usuario(cliente, admin, CLINICO, 'experto', 'Clínico')


@pytest.fixture(scope='module')
def consulta(cliente, admin):
    return _usuario(cliente, admin, CONSULTA, 'visualizador', 'Consulta')


def _con_nuevas(*variables: tuple[str, str | None]) -> bytes:
    from maia_comun import diccionarios as DIC
    from sevarti import diccionario as D
    sugeridas = pd.DataFrame([{'variable': v, 'etiqueta': f'Variable simulada {v[-1]}', 'tipo': 'numeric', 'rol': rol,
                               'etapa': '6 m EC'} for v, rol in variables], columns=list(D.COLUMNAS['variables']))
    nuevo, _, _ = D.conciliar(D.leer(DIC.SEMILLA), sugeridas, date(2026, 10, 30))
    return DIC.escribir(nuevo)


def _archivo(contenido: bytes, nombre: str = 'diccionario.xlsx') -> dict:
    return {'archivo': (nombre, BytesIO(contenido), XLSX)}


def test_semilla_y_permisos(cliente, admin, experto, consulta, clinico):
    versiones = cliente.get('/api/diccionario/versiones', headers=experto).json()
    assert [(v['version'], v['estado'], v['origen']) for v in versiones] == [(1, 'vigente', 'semilla')]
    assert versiones[0]['tamano'] > 0 and versiones[0]['creado_por'] is None
    for metodo, ruta in (('get', '/api/diccionario/versiones'), ('get', '/api/diccionario/por-clasificar'),
                         ('get', '/api/diccionario/vigente/archivo'), ('post', '/api/diccionario/clasificar'),
                         ('post', '/api/diccionario/versiones/1/activar')):
        for quien in (consulta, clinico):
            assert getattr(cliente, metodo)(ruta, headers=quien).status_code == 403, ruta
    assert cliente.get('/api/diccionario/versiones').status_code == 401
    assert cliente.get('/api/diccionario/versiones', headers=admin).status_code == 200


def test_descargar_la_vigente(cliente, experto):
    from maia_comun import diccionarios as DIC
    r = cliente.get('/api/diccionario/vigente/archivo', headers=experto)
    assert r.status_code == 200 and r.headers['content-type'] == XLSX
    assert 'diccionario_v1.xlsx' in r.headers['content-disposition'] and r.content == DIC.SEMILLA.read_bytes()   # la semilla es del repositorio
    assert cliente.get('/api/diccionario/versiones/999/archivo', headers=experto).status_code == 404


def test_previsualizar_una_version(cliente, experto, consulta):
    r = cliente.get('/api/diccionario/versiones/1/vista', headers=experto)
    assert r.status_code == 200
    vista = r.json()
    assert vista['version']['version'] == 1
    hojas = {h['nombre']: h for h in vista['hojas']}
    assert list(hojas)[:2] == ['Variables', 'Visitas'] and hojas['Variables']['filas']
    variables = hojas['Variables']
    assert len(variables['columnas']) == len(variables['filas'][0])
    estado = [c['clave'] for c in variables['columnas']].index('estado')
    assert {f[estado] for f in variables['filas']} <= {'Lista', 'Por clasificar', 'No usar'}   # como en el Excel
    assert cliente.get('/api/diccionario/versiones/999/vista', headers=experto).status_code == 404
    assert cliente.get('/api/diccionario/versiones/1/vista', headers=consulta).status_code == 403


def test_archivo_invalido_en_espanol(cliente, experto):
    from maia_comun import diccionarios as DIC
    r = cliente.post('/api/diccionario/comparar', headers=experto, files=_archivo(b'no es excel', 'notas.xlsx'))
    assert r.status_code == 422 and 'no es un Excel' in r.json()['detail']
    libro = load_workbook(DIC.SEMILLA)
    libro['Variables']['E4'] = 'Texto libre'   # tipo no válido en la fila 4
    salida = BytesIO()
    libro.save(salida)
    r = cliente.post('/api/diccionario/versiones', headers=experto, files=_archivo(salida.getvalue(), 'mio.xlsx'))
    detalle = r.json()['detail']
    assert r.status_code == 422 and 'hoja "Variables", fila 4' in detalle and 'Traceback' not in detalle
    assert len(cliente.get('/api/diccionario/versiones', headers=experto).json()) == 1


def test_subir_con_diferencias_antes_de_confirmar(cliente, experto):
    nuevo = _con_nuevas(('var_simulada_a', 'medicion'), ('var_simulada_b', None))
    r = cliente.post('/api/diccionario/comparar', headers=experto, files=_archivo(nuevo))
    assert r.status_code == 200, r.text
    d = r.json()
    assert [n['variable'] for n in d['nuevas']] == ['var_simulada_a', 'var_simulada_b'] and d['vigente'] == 1
    assert d['nuevas'][0]['visita'] == '6 meses (edad corregida)' and not d['sin_cambios']
    assert len(cliente.get('/api/diccionario/versiones', headers=experto).json()) == 1   # comparar no guarda
    r = cliente.post('/api/diccionario/versiones', headers=experto, files=_archivo(nuevo), data={'nota': 'Dos nuevas'})
    assert r.status_code == 201, r.text
    v = r.json()
    assert v['version'] == 2 and v['estado'] == 'vigente' and v['creado_por'] == 'Experta' and v['nota'] == 'Dos nuevas'
    r = cliente.post('/api/diccionario/versiones', headers=experto, files=_archivo(nuevo))
    assert r.status_code == 409 and 'igual' in r.json()['detail']


def test_clasificar_y_volver_a_una_version(cliente, experto):
    p = cliente.get('/api/diccionario/por-clasificar', headers=experto).json()
    assert [v['variable'] for v in p['variables']] == ['var_simulada_a', 'var_simulada_b'] and p['total'] == 2
    r = cliente.post('/api/diccionario/clasificar', headers=experto, json={'variable': 'var_simulada_a', 'estado': 'Lista'})
    assert r.status_code == 200 and r.json()['version'] == 3
    r = cliente.post('/api/diccionario/clasificar', headers=experto, json={'variable': 'var_simulada_b', 'estado': 'Lista'})
    assert r.status_code == 422 and 'Rol' in r.json()['detail']
    r = cliente.post('/api/diccionario/clasificar', headers=experto, json={'variable': 'var_simulada_b', 'estado': 'No usar'})
    assert r.status_code == 200 and cliente.get('/api/diccionario/por-clasificar', headers=experto).json()['total'] == 0
    assert cliente.post('/api/diccionario/clasificar', headers=experto,
                        json={'variable': 'var_simulada_b', 'estado': 'Por clasificar'}).status_code == 422
    assert cliente.post('/api/diccionario/clasificar', headers=experto,
                        json={'variable': 'no_existe', 'estado': 'Lista'}).status_code == 404
    v1 = next(v for v in cliente.get('/api/diccionario/versiones', headers=experto).json() if v['version'] == 1)
    r = cliente.post(f'/api/diccionario/versiones/{v1["id"]}/activar', headers=experto)
    assert r.status_code == 200 and r.json()['estado'] == 'vigente'
    estados = {v['version']: v['estado'] for v in cliente.get('/api/diccionario/versiones', headers=experto).json()}
    assert estados == {1: 'vigente', 2: 'archivado', 3: 'archivado', 4: 'archivado'}
    from maia_comun import db
    from maia_comun.modelos_db import Auditoria
    with db.fabrica()() as s:
        acciones = list(s.scalars(select(Auditoria.accion).where(Auditoria.recurso.like('diccionario%'))))
    assert acciones.count('subir_diccionario') == 1 and acciones.count('clasificar_variable') == 2
    assert acciones.count('activar_diccionario') == 1


def test_borrador_de_una_actualizacion(cliente, experto):
    from maia_comun import db
    from maia_comun import diccionarios as DIC
    with db.fabrica()() as s:
        b = DIC.guardar(s, _con_nuevas(('var_simulada_c', 'medicion')), 'corrida',
                        nota='Actualización con 1 variable nueva de la base.')
        s.commit()
        bid = b.id
    p = cliente.get('/api/diccionario/por-clasificar', headers=experto).json()
    assert p['variables'] == [] and p['total'] == 1
    assert p['borrador']['version']['id'] == bid and [n['variable'] for n in p['borrador']['nuevas']] == ['var_simulada_c']
    d = cliente.get(f'/api/diccionario/versiones/{bid}/diferencias', headers=experto).json()
    assert [n['variable'] for n in d['nuevas']] == ['var_simulada_c']
    r = cliente.post(f'/api/diccionario/versiones/{bid}/activar', headers=experto)
    assert r.status_code == 200 and r.json()['origen'] == 'corrida' and r.json()['estado'] == 'vigente'
    p = cliente.get('/api/diccionario/por-clasificar', headers=experto).json()
    assert p['borrador'] is None and [v['variable'] for v in p['variables']] == ['var_simulada_c']


def test_editar_con_formularios(cliente, experto, consulta):
    versiones = cliente.get('/api/diccionario/versiones', headers=experto).json()
    base = next(v for v in versiones if v['estado'] == 'vigente')
    hojas = {h['nombre']: h for h in cliente.get(f'/api/diccionario/versiones/{base["id"]}/vista', headers=experto).json()['hojas']}
    tipo = next(c for c in hojas['Variables']['columnas'] if c['clave'] == 'tipo')
    assert tipo['opciones'] == ['Número', 'Categoría', 'Sí/No'] and tipo['obligatoria'] and tipo['explica']
    assert hojas['Desenlaces']['agregar'] and not hojas['Variables']['agregar'] and hojas['Variables']['clave'] == 'variable'
    lista = {'base': base['id'], 'cambios': [{'hoja': 'Variables', 'accion': 'editar', 'clave': 'var_simulada_c',
                                              'valores': {'estado': 'Lista', 'etiqueta': 'Variable simulada corregida'}}]}
    for ruta in ('/api/diccionario/editar/revisar', '/api/diccionario/editar'):
        assert cliente.post(ruta, headers=consulta, json=lista).status_code == 403
    r = cliente.post('/api/diccionario/editar/revisar', headers=experto, json=lista)
    assert r.status_code == 200, r.text
    assert [(e['variable'], e['antes'], e['despues']) for e in r.json()['estados']] == [
        ('var_simulada_c', 'Por clasificar', 'Lista')]
    assert len(cliente.get('/api/diccionario/versiones', headers=experto).json()) == len(versiones)   # revisar no guarda
    r = cliente.post('/api/diccionario/editar', headers=experto, json=lista)
    assert r.status_code == 201, r.text
    v = r.json()
    assert v['estado'] == 'vigente' and v['creado_por'] == 'Experta' and v['nota'] == 'Editado en la web: 1 cambio en Variables.'
    # otra vez sobre la base anterior: alguien ya guardó, no se pisa
    r = cliente.post('/api/diccionario/editar', headers=experto, json=lista)
    assert r.status_code == 409 and f'versión {v["version"]}' in r.json()['detail']
    mal = {'base': v['id'], 'cambios': [{'hoja': 'Variables', 'accion': 'editar', 'clave': 'var_simulada_c',
                                         'valores': {'tipo': 'Texto libre'}}]}
    r = cliente.post('/api/diccionario/editar', headers=experto, json=mal)
    assert r.status_code == 422 and 'Variables · var_simulada_c: Tipo "Texto libre" no es válido' in r.json()['detail']
    mal['cambios'][0]['accion'] = 'renombrar'
    assert cliente.post('/api/diccionario/editar', headers=experto, json=mal).status_code == 422
    r = cliente.post('/api/diccionario/editar', headers=experto, json={'base': v['id'], 'cambios': [
        {'hoja': 'Variables', 'accion': 'editar', 'clave': 'no_existe', 'valores': {'nota': 'x'}}]})
    assert r.status_code == 404
    from maia_comun import db
    from maia_comun.modelos_db import Auditoria
    with db.fabrica()() as s:
        assert list(s.scalars(select(Auditoria.accion).where(Auditoria.accion == 'editar_diccionario'))) == ['editar_diccionario']


def test_lo_subido_se_sirve_regenerado_y_el_zip_bomba_se_rechaza(cliente, experto):
    from maia_comun import diccionarios as DIC
    libro = load_workbook(BytesIO(_con_nuevas(('var_simulada_x', 'medicion'))))
    libro['Variables']['Z60'] = '=HYPERLINK("http://ejemplo.invalid","clic")'
    libro.create_sheet('Extra')['A1'] = '=1+1'
    salida = BytesIO()
    libro.save(salida)
    r = cliente.post('/api/diccionario/versiones', headers=experto, files=_archivo(salida.getvalue()))
    assert r.status_code == 201, r.text
    v = r.json()
    r = cliente.get(f'/api/diccionario/versiones/{v["id"]}/archivo', headers=experto)
    servido = load_workbook(BytesIO(r.content))
    assert 'Extra' not in servido.sheetnames and servido['Variables']['Z60'].value is None
    assert v['sha256'] == DIC.huella(r.content) and r.content != salida.getvalue()
    bomba = BytesIO()
    with zipfile.ZipFile(bomba, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('relleno.bin', b'\0' * (60 * 1024 * 1024))
    r = cliente.post('/api/diccionario/versiones', headers=experto, files=_archivo(bomba.getvalue(), 'bomba.xlsx'))
    assert r.status_code == 422 and 'descomprimido' in r.json()['detail']
    # el mismo contenido subido otra vez no es un cambio: se compara lo que dice el libro, no sus bytes
    r = cliente.post('/api/diccionario/versiones', headers=experto, files=_archivo(salida.getvalue()))
    assert r.status_code == 409 and 'igual' in r.json()['detail']
