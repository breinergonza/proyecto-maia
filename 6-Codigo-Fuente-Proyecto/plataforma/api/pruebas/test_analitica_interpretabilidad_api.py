"""Interpretabilidad en la API: devuelve los artefactos agregados, con la cifra de lo pequeño, y da estado vacío a lo antiguo."""
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
    tmp = tmp_path_factory.mktemp('api_interpretabilidad')
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
    """Un entrenamiento con interpretabilidad completa y otro (antiguo) que solo trae la importancia."""
    from types import SimpleNamespace

    import lightgbm as lgb

    from maia_comun import analitica as AN
    from maia_entrenamiento import analitica_clinica as AL
    from maia_entrenamiento import analitica_interpretabilidad as EI
    rng = np.random.default_rng(4)
    n = 800
    X = pd.DataFrame({'peso': rng.normal(1500, 400, n), 'eg': rng.normal(32, 3, n), 'ruido': rng.normal(size=n)})
    y = rng.random(n) < 1 / (1 + np.exp((X.peso - 1300) / 200))
    b = lgb.train({'objective': 'binary', 'verbose': -1, 'num_leaves': 8, 'min_data_in_leaf': 10}, lgb.Dataset(X, y.astype(int)), 30)
    m = SimpleNamespace(columnas=list(X.columns), modelo=b, riesgo=lambda T: b.predict(T[list(X.columns)]))
    r = m.riesgo(X)
    res = AN.analizar(r, y, variables=X, importancias={'peso': 2.0, 'eg': 1.0})
    EI.agregar({'readm_3m': res}, SimpleNamespace(etiquetas={'peso': 'Peso al nacer (ern_peso)'}, modelos={'readm_3m': m}),
               {'readm_3m': {'variables': X, 'r': r}})
    meta = {'fuente': 'simulado', 'registro': 'maia-clinico-demo', 'version_registro': '3', 'version_modelo': 'abc',
            'corte': '2026-06-30'}
    desc = [{'clave': 'readm_3m', 'nombre': 'readmisión', 'momento': '40 sem', 'etiqueta': 'En uso'}]
    nuevo = AL.guardar({'readm_3m': res}, desc, meta)
    antiguo_res = AN.analizar(r, y, variables=X, importancias={'peso': 2.0})
    antiguo = AL.guardar({'readm_3m': antiguo_res}, desc, meta)
    return nuevo, antiguo


def test_devuelve_los_cuatro_artefactos(cliente, tokens, entrenamiento):
    nuevo, _ = entrenamiento
    for rol in ('admin', 'experto', 'visualizador'):
        r = cliente.get(f'/api/analitica/{nuevo}/interpretabilidad', headers=tokens[rol]).json()
        assert r['estado'] == 'ok'
        d = r['desenlaces']['readm_3m']
        assert d['importancia'][0]['variable'] == 'peso'
        assert d['shap_global']['variables'][0]['etiqueta'] == 'Peso al nacer'
        assert d['pdp']['variables'] and d['motivos_frecuentes']['motivos'] and d['interaccion']['pares']
        assert all(isinstance(c['n'], int) for p in d['interaccion']['pares'] for c in p['celdas'])
        assert all(isinstance(m['n'], int) for m in d['motivos_frecuentes']['motivos'])


def test_entrenamiento_antiguo_no_trae_los_artefactos(cliente, tokens, entrenamiento):
    _, antiguo = entrenamiento
    r = cliente.get(f'/api/analitica/{antiguo}/interpretabilidad', headers=tokens['visualizador']).json()
    d = r['desenlaces']['readm_3m']
    assert r['estado'] == 'ok' and d['importancia'] and 'shap_global' not in d and 'pdp' not in d


def test_sin_artefactos_de_analitica(cliente, tokens):
    r = cliente.get('/api/analitica/987654/interpretabilidad', headers=tokens['visualizador']).json()
    assert r['estado'] == 'sin_artefactos'
