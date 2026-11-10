"""Anticipación: la API entrega ``anticipacion``, ``metricas_por_visita`` y ``primera_alerta`` guardados por el
entrenamiento, por familia, a cualquier perfil. Datos sintéticos."""
from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integracion

ADMIN = ('admin@maia.prueba', 'clave-admin-de-prueba')
VISOR = ('visor@maia.prueba', 'clave-visor-de-prueba')
ORDEN = {'entrada PMC': 0, '40 sem': 1, '3 m EC': 2, '6 m EC': 3}


@pytest.fixture(scope='module')
def cliente(url_db_propia, tmp_path_factory):
    from maia_api import estado as E
    from maia_api import seguridad as SG
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('api_anticipacion')
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
def entrenamiento(cliente):
    from maia_entrenamiento import analitica_clinica as AL
    from maia_entrenamiento import anticipacion as AA
    rng = np.random.default_rng(5)

    def pred(momento):
        n = 400
        r = rng.random(n)
        y = rng.random(n) < r * 0.3
        return {'r': r, 'y': y, 'variables': pd.DataFrame({'a': r}, index=[f'N{i}' for i in range(n)]),
                'desenlace': SimpleNamespace(nombre='readmisión entre los 3 y los 6 meses', momento=momento,
                                             etapa=None, variable='v318')}
    preds = {'readm_6m': pred('3 m EC'), 'readm_6m_desde_pmc': pred('entrada PMC'),
             'readm_6m_desde_40': pred('40 sem')}
    por_tipo = AA.artefactos(preds, ORDEN, etapa_de_variable={'v318': '6 m EC'})['readm_6m']
    return AL.guardar({'readm_6m': por_tipo}, [{'clave': 'readm_6m', 'nombre': 'readmisión', 'momento': '3 m EC',
                                               'etiqueta': 'En uso'}],
                      {'fuente': 'simulado', 'registro': 'maia-clinico-demo', 'version_registro': '1',
                       'version_modelo': 'abc', 'corte': '2026-06-30'})


def test_la_familia_llega_con_los_tres_artefactos_a_cualquier_perfil(cliente, entrenamiento):
    r = cliente.post('/api/usuarios', headers=_login(cliente, *ADMIN),
                     json={'email': VISOR[0], 'nombre': 'visor', 'rol': 'visualizador', 'clave': VISOR[1]})
    assert r.status_code == 201, r.text
    e = next(x for x in cliente.get('/api/analitica/entrenamientos', headers=_login(cliente, *VISOR)).json()['entrenamientos']
             if x['entrenamiento'] == entrenamiento)
    assert {s['id']: s['estado'] for s in e['submodulos']}['anticipacion'] == 'ok'
    h = _login(cliente, *VISOR)
    cuerpo = cliente.get(f'/api/analitica/{entrenamiento}/anticipacion', headers=h).json()
    assert cuerpo['estado'] == 'ok'
    f = cuerpo['desenlaces']['readm_6m']
    assert {'visitas', 'avisados_antes', 'metricas_por_visita', 'primera_alerta'} <= set(f)
    assert [v['desde'] for v in f['visitas']] == ['entrada PMC', '40 sem', '3 m EC']
    assert [v['ventaja_visitas'] for v in f['visitas']] == [3, 2, 1]
    assert f['metricas_por_visita']['tops'] == [5, 10, 20, 30, 40]
    assert len(f['metricas_por_visita']['visitas']) == 3 and f['primera_alerta']['familia'] == 'readm_6m'
    solo = cliente.get(f'/api/analitica/{entrenamiento}/anticipacion', headers=h, params={'desenlace': 'readm_6m'}).json()
    assert set(solo['desenlaces']) == {'readm_6m'}
