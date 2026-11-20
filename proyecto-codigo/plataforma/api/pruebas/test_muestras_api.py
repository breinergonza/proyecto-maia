"""Muestras: roles, facetas con las reglas de privacidad, guardar (inmutable, huella reproducible) y duplicar."""
from __future__ import annotations

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

pytestmark = pytest.mark.integracion

ADMIN = ('admin@maia.prueba', 'clave-admin-de-prueba')
EXPERTO = ('experto@maia.prueba', 'clave-experto-de-prueba')
VISOR = ('visor@maia.prueba', 'clave-visor-de-prueba')
SUJETOS = 400


@pytest.fixture(scope='module')
def cliente(url_db_propia, tmp_path_factory):
    from maia_api import estado as E
    from maia_api import seguridad as SG
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('api_muestras')
    mp = pytest.MonkeyPatch()
    for k, v in {'DATABASE_URL': url_db_propia, 'MAIA_ENTORNO': 'local', 'MAIA_SOLO_SIMULADO': 'false',
                 'MAIA_CIFRADO_CLAVE': 'llave-de-cifrado-de-prueba-con-32-caracteres',
                 'MAIA_JWT_SECRETO': 'secreto-jwt-de-prueba-con-mas-de-32-caracteres', 'MAIA_PAQUETE_CLAVE': 'p' * 20,
                 'MAIA_ADMIN_EMAIL': ADMIN[0], 'MAIA_ADMIN_CLAVE': ADMIN[1], 'MAIA_DIR_PAQUETES': str(tmp / 'paquetes'),
                 'KMC_PW': ''}.items():
        mp.setenv(k, v)
    mp.delenv('MAIA_EJECUCION_ID', raising=False)
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
def tokens(cliente):
    admin = _login(cliente, *ADMIN)
    for (email, clave), rol in ((EXPERTO, 'experto'), (VISOR, 'visualizador')):
        r = cliente.post('/api/usuarios', headers=admin, json={'email': email, 'nombre': rol, 'rol': rol, 'clave': clave})
        assert r.status_code == 201, r.text
    return {'admin': admin, 'experto': _login(cliente, *EXPERTO), 'visualizador': _login(cliente, *VISOR)}


@pytest.fixture(scope='module')
def sev():
    from maia_comun import simulados
    return simulados.simular(SUJETOS, semilla=3)


@pytest.fixture(scope='module')
def corte(cliente, sev):
    from maia_comun import db
    from maia_comun import sevarti_db as SDB
    return SDB.guardar_en_db(db.motor(), sev, 'simulado')


def _y(variable, tipo, valores, cuando=None):
    e = {'variable': variable, 'tipo': tipo, 'op': {'lista': 'en', 'si_no': 'es', 'numero': 'entre'}[tipo], 'valores': valores}
    return {**e, 'cuando': cuando} if cuando else e


def _muestra(*y):
    return {'version': 2, 'y': list(y)}


def test_visualizador_y_sin_sesion_no_entran(cliente, tokens, corte):
    m = {'muestra': _muestra()}
    for metodo, ruta, cuerpo in (('get', '/api/muestras/variables', None), ('post', '/api/muestras/facetas', m),
                                 ('post', '/api/muestras/contar', m), ('get', '/api/muestras', None),
                                 ('post', '/api/muestras', {'titulo': 'x', 'muestra': _muestra()}),
                                 ('get', '/api/muestras/1', None), ('post', '/api/muestras/1/duplicar', {})):
        assert cliente.request(metodo, ruta, json=cuerpo).status_code == 401
        assert cliente.request(metodo, ruta, json=cuerpo, headers=tokens['visualizador']).status_code == 403
    assert cliente.get('/api/muestras', headers=tokens['experto']).status_code == 200
    assert cliente.get('/api/muestras', headers=tokens['admin']).status_code == 200


def test_variables_ofrecidas(cliente, tokens, corte):
    r = cliente.get('/api/muestras/variables', headers=tokens['experto']).json()
    por_nombre = {v['variable']: v for v in r['variables']}
    assert {'sede', 'eg_semanas', 'sexo', 'peso_nacer'} <= set(por_nombre)
    assert por_nombre['sede']['tipo'] == 'lista' and por_nombre['sede']['cuando'] is None
    assert por_nombre['peso_nacer']['tipo'] == 'numero' and por_nombre['peso_nacer']['cuando'] == 'primera'
    assert [o['valor'] for o in por_nombre['eg_categoria']['opciones']] == ['extremo', 'muy_prematuro', 'moderado_tardio', 'a_termino']
    assert por_nombre['eg_semanas']['tipo'] == 'numero' and por_nombre['eg_semanas']['opciones'] == []
    assert 'hematocrito' not in por_nombre   # se mide en cada visita: no es un filtro rápido


def test_facetas_aplican_los_demas_filtros_pero_no_el_propio(cliente, tokens, corte, sev):
    from maia_comun import muestra as M
    f0 = cliente.post('/api/muestras/facetas', headers=tokens['experto'], json={'muestra': _muestra()}).json()
    assert f0['n'] == SUJETOS == f0['n_base']
    sexo0 = {o['valor']: o['n'] for o in f0['facetas']['sexo']['opciones']}
    assert sum(sexo0.values()) == SUJETOS
    con_sexo = _muestra(_y('sexo', 'lista', ['M']))
    f1 = cliente.post('/api/muestras/facetas', headers=tokens['experto'], json={'muestra': con_sexo}).json()
    assert f1['n'] == M.contar(sev, con_sexo)
    # el filtro de sexo no cambia los conteos de sexo, pero sí los de sede
    assert {o['valor']: o['n'] for o in f1['facetas']['sexo']['opciones']} == sexo0
    assert sum(o['n'] for o in f1['facetas']['sede']['opciones']) == f1['n']
    # la muestra suelta (sin la llave "muestra") también se entiende
    assert cliente.post('/api/muestras/facetas', headers=tokens['experto'], json=con_sexo).json()['n'] == f1['n']


def test_cifra_de_1_a_4_ninos_dice_cuantos_son():
    from maia_api import poblacion as P
    assert P.cifra(3) == {'n': 3} and P.cifra(1) == {'n': 1} and P.cifra(0) == {'n': 0} and P.cifra(5) == {'n': 5}


def test_opciones_de_1_a_4_ninos_salen_con_su_cifra(cliente, tokens, corte, sev):
    pocos = _muestra(_y('peso_nacer', 'numero', [None, 1200]))
    f = cliente.post('/api/muestras/facetas', headers=tokens['experto'], json={'muestra': pocos}).json()
    opciones = [o for fa in f['facetas'].values() for o in fa.get('opciones', [])]
    assert opciones
    assert all(isinstance(o['n'], int) and 'texto' not in o for o in opciones)
    assert any(1 <= o['n'] <= 4 for o in opciones), 'el corte de prueba no tiene una opción de 1 a 4 niños'


def test_contar_igual_al_motor_en_memoria(cliente, tokens, corte, sev):
    from maia_comun import muestra as M
    m = _muestra(_y('sexo', 'lista', ['F']), _y('eg_semanas', 'numero', [28, 34]))
    r = cliente.post('/api/muestras/contar', headers=tokens['experto'], json={'muestra': m}).json()
    assert r['n'] == M.contar(sev, m) and r['n_base'] == SUJETOS and r['huella'] == M.huella(M.ids(sev, m))
    mala = cliente.post('/api/muestras/contar', headers=tokens['experto'],
                        json={'muestra': _muestra(_y('no_existe', 'lista', ['x']))})
    assert mala.status_code == 422 and 'no_existe' in mala.json()['detail']


def test_guardar_es_inmutable_y_con_huella_reproducible(cliente, tokens, corte, sev):
    from maia_comun import db
    from maia_comun import muestra as M
    from maia_comun.modelos_db import Auditoria
    m = _muestra(_y('sexo', 'lista', ['M']), _y('peso_nacer', 'numero', [None, 2500]))
    r = cliente.post('/api/muestras', headers=tokens['experto'],
                     json={'titulo': 'Varones de bajo peso', 'descripcion': 'a', 'muestra': m})
    assert r.status_code == 201, r.text
    g = r.json()
    ids = M.ids(sev, m)
    assert g['n_ninos'] == len(ids) and g['n_base'] == SUJETOS and g['huella'] == M.huella(ids)
    assert g['inmutable'] is True and g['propietario'] == 'experto' and g['fuente'] == 'simulado'
    assert g['resumen']['sexo'] and set(g['resumen']) <= {'sexo', 'eg', 'lubchenco', 'sede'}
    assert cliente.get(f'/api/muestras/{g["id"]}', headers=tokens['admin']).json()['huella'] == g['huella']
    assert g['id'] in [x['id'] for x in cliente.get('/api/muestras', headers=tokens['admin']).json()]
    assert cliente.put(f'/api/muestras/{g["id"]}', headers=tokens['experto'], json={'titulo': 'otro'}).status_code == 405
    # la misma definición vuelve a dar los mismos niños: misma huella, otra muestra
    d = cliente.post(f'/api/muestras/{g["id"]}/duplicar', headers=tokens['admin'], json={})
    assert d.status_code == 201, d.text
    assert d.json()['id'] != g['id'] and d.json()['huella'] == g['huella']
    assert d.json()['titulo'] == 'Copia de Varones de bajo peso'
    # duplicar con otra definición cambia la huella
    d2 = cliente.post(f'/api/muestras/{g["id"]}/duplicar', headers=tokens['experto'],
                      json={'titulo': 'Mujeres', 'muestra': _muestra(_y('sexo', 'lista', ['F']))}).json()
    assert d2['huella'] != g['huella'] and d2['titulo'] == 'Mujeres'
    assert cliente.post('/api/muestras/99999/duplicar', headers=tokens['experto'], json={}).status_code == 404
    with db.fabrica()() as s:
        a = s.scalars(select(Auditoria).where(Auditoria.accion == 'muestras.guardar',
                                              Auditoria.recurso == str(g['id']))).one()
    assert a.detalle == {'huella': g['huella'], 'n': len(ids)}


def test_n_minimo_para_guardar(cliente, tokens, corte):
    pocos = _muestra(_y('eg_semanas', 'numero', [None, 24]), _y('sexo', 'lista', ['F']))
    r = cliente.post('/api/muestras', headers=tokens['experto'], json={'titulo': 'Muy pocos', 'muestra': pocos})
    assert r.status_code == 422 and 'menos de 20' in r.json()['detail']
    assert cliente.post('/api/muestras', headers=tokens['experto'],
                        json={'titulo': '', 'muestra': _muestra()}).status_code == 422


def test_sin_sede_no_se_ofrece_la_faceta(cliente, tokens, corte, sev):
    """Un corte donde ningún niño trae sede no ofrece «sede»; ni en facetas ni en el resumen guardado."""
    from maia_comun import db
    from maia_comun import sevarti_db as SDB
    from maia_comun.modelos_db import Corte
    sub = sev.subconjunto(list(sev.sujetos.sujeto[:60]))
    sin = replace(sub, sujetos=sub.sujetos.assign(grupo=None))
    cid = SDB.guardar_en_db(db.motor(), sin, 'kmc')
    try:
        v = cliente.get('/api/muestras/variables', headers=tokens['experto']).json()
        assert 'sede' not in {x['variable'] for x in v['variables']}
        f = cliente.post('/api/muestras/facetas', headers=tokens['experto'], json={'muestra': _muestra()}).json()
        assert 'sede' not in f['facetas'] and f['n'] == 60
        g = cliente.post('/api/muestras', headers=tokens['experto'], json={'titulo': 'Sin sede', 'muestra': _muestra()}).json()
        assert 'sede' not in g['resumen'] and g['n_ninos'] == 60
    finally:
        with db.fabrica()() as s:
            s.delete(s.get(Corte, cid))
            s.commit()
    nombres = {x['variable'] for x in cliente.get('/api/muestras/variables', headers=tokens['experto']).json()['variables']}
    assert 'sede' in nombres
