"""Analítica: lectura de los artefactos agregados por cualquier perfil, y estado vacío para entrenamientos sin ellos."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integracion

ADMIN = ('admin@maia.prueba', 'clave-admin-de-prueba')
EXPERTO = ('experto@maia.prueba', 'clave-experto-de-prueba')
VISOR = ('visor@maia.prueba', 'clave-visor-de-prueba')


@pytest.fixture(scope='module')
def cliente(url_db_propia, tmp_path_factory):
    from maia_api import estado as E
    from maia_api import seguridad as SG
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('api_analitica')
    mp = pytest.MonkeyPatch()
    for k, v in {'DATABASE_URL': url_db_propia, 'MAIA_ENTORNO': 'local', 'MAIA_SOLO_SIMULADO': 'false',
                 'MAIA_CIFRADO_CLAVE': 'llave-de-cifrado-de-prueba-con-32-caracteres',
                 'MAIA_JWT_SECRETO': 'secreto-jwt-de-prueba-con-mas-de-32-caracteres', 'MAIA_PAQUETE_CLAVE': 'p' * 20,
                 'MAIA_ADMIN_EMAIL': ADMIN[0], 'MAIA_ADMIN_CLAVE': ADMIN[1], 'MAIA_DIR_PAQUETES': str(tmp / 'paquetes'),
                 'MAIA_DEMO_SUJETOS': '300', 'KMC_PW': ''}.items():
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
def entrenamiento(cliente):
    """Un entrenamiento con analítica de un desenlace sintético, guardado como lo hace el entrenamiento."""
    from maia_comun import analitica as AN
    from maia_entrenamiento import analitica_clinica as AL
    rng = np.random.default_rng(4)
    n = 1500
    puntaje = rng.normal(size=n)
    r = 1 / (1 + np.exp(-(puntaje - 2)))
    y = rng.random(n) < r
    tri = pd.Series(np.where(np.arange(n) % 2 == 0, '2025-T1', '2025-T2'))
    res = AN.analizar(r, y, trimestre=tri, variables=pd.DataFrame({'x': puntaje}), importancias={'x': 1.0},
                      grupos={'sexo': pd.Series(np.where(np.arange(n) % 2 == 0, 'femenino', 'masculino'))})
    return AL.guardar({'readm_3m': res}, [{'clave': 'readm_3m', 'nombre': 'readmisión', 'momento': '40 sem',
                                         'etiqueta': 'En uso'}],
                      {'fuente': 'simulado', 'registro': 'maia-clinico-demo', 'version_registro': '3',
                       'version_modelo': 'abc', 'corte': '2026-06-30'})


def test_sin_sesion_no_entra(cliente):
    assert cliente.get('/api/analitica/entrenamientos').status_code == 401


@pytest.mark.parametrize('rol', ['admin', 'experto', 'visualizador'])
def test_todos_los_perfiles_leen(cliente, tokens, entrenamiento, rol):
    h = tokens[rol]
    lista = cliente.get('/api/analitica/entrenamientos', headers=h).json()['entrenamientos']
    e = next(x for x in lista if x['entrenamiento'] == entrenamiento)
    assert e['desenlaces'][0]['clave'] == 'readm_3m' and e['version_registro'] == '3'
    estados = {s['id']: s['estado'] for s in e['submodulos']}
    assert estados['rendimiento'] == 'ok' and estados['perfiles'] == 'ok' and estados['anticipacion'] == 'pendiente'
    c = cliente.get('/api/analitica/contexto', params={'entrenamiento': entrenamiento}, headers=h).json()
    assert c['estado'] == 'ok' and c['desenlaces'][0]['etiqueta'] == 'En uso' and c['modelos'][0]['modelo'] == 'clinico'
    assert cliente.get(f'/api/analitica/{entrenamiento}/rendimiento', headers=h).status_code == 200


def test_formas_por_submodulo(cliente, tokens, entrenamiento):
    h = tokens['visualizador']
    g = lambda sub: cliente.get(f'/api/analitica/{entrenamiento}/{sub}', headers=h).json()  # noqa: E731
    rend = g('rendimiento')
    assert rend['estado'] == 'ok'
    d = rend['desenlaces']['readm_3m']
    assert {'roc', 'pr', 'metricas_por_top', 'confusion_por_top', 'auc_desenlace', 'lift', 'top_k'} <= set(d)
    assert {'bins', 'histograma', 'decision'} <= set(g('calibracion')['desenlaces']['readm_3m'])
    assert 'subgrupos' in g('equidad')['desenlaces']['readm_3m']
    est = g('estabilidad')['desenlaces']['readm_3m']
    assert {'metricas_trimestre', 'alertas_trimestre', 'psi'} <= set(est)
    assert {'embudo', 'eventos', 'nulos'} <= set(g('poblacion')['desenlaces']['readm_3m'])
    assert g('interpretabilidad')['desenlaces']['readm_3m']['importancia'][0]['variable'] == 'x'
    res = g('resumen')['desenlaces']['readm_3m']
    assert res['auc'] > 0.5 and {s['id'] for s in res['semaforos']} >= {'auc', 'calibracion', 'equidad'}
    assert g('anticipacion')['estado'] == 'pendiente'
    assert cliente.get(f'/api/analitica/{entrenamiento}/inexistente', headers=h).status_code == 404


def test_entrenamiento_viejo_da_estado_vacio(cliente, tokens):
    r = cliente.get('/api/analitica/987654/rendimiento', headers=tokens['visualizador'])
    assert r.status_code == 200 and r.json()['estado'] == 'sin_artefactos'
    c = cliente.get('/api/analitica/contexto', params={'entrenamiento': 987654}, headers=tokens['admin']).json()
    assert c['estado'] == 'sin_artefactos'
