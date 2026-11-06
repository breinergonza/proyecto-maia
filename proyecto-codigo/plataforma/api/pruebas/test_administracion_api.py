"""Administración de las ejecuciones por la API: solo el perfil admin, la clave cifrada que nunca vuelve, la prueba de
conexión, hiperparámetros, programaciones, la cola, MLflow (simulado con httpx) y la importación de un paquete
aprobado. Entorno ``local`` contra Postgres real."""
from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.engine import make_url

pytestmark = pytest.mark.integracion

ADMIN = ('admin@maia.prueba', 'clave-admin-de-prueba')
EXPERTO = ('experto@maia.prueba', 'clave-experto-de-prueba')


@pytest.fixture(scope='module')
def cliente(url_db_propia, tmp_path_factory):
    from maia_api import estado as E
    from maia_api import seguridad as SG
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('api_admin')
    mp = pytest.MonkeyPatch()
    for k, v in {'DATABASE_URL': url_db_propia, 'MAIA_ENTORNO': 'local', 'MAIA_SOLO_SIMULADO': 'false',
                 'MAIA_CIFRADO_CLAVE': 'llave-de-cifrado-de-prueba-con-32-caracteres',
                 'MAIA_JWT_SECRETO': 'secreto-jwt-de-prueba-con-mas-de-32-caracteres', 'MAIA_PAQUETE_CLAVE': 'p' * 20,
                 'MAIA_ADMIN_EMAIL': ADMIN[0], 'MAIA_ADMIN_CLAVE': ADMIN[1], 'MAIA_DIR_PAQUETES': str(tmp / 'paquetes'),
                 'MAIA_DEMO_SUJETOS': '300', 'MLFLOW_TRACKING_URI': 'http://mlflow.prueba:5000',
                 'MLFLOW_URL_PUBLICA': 'http://localhost:5000', 'KMC_PW': ''}.items():
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


@pytest.fixture(scope='module')
def experto(cliente, admin):
    r = cliente.post('/api/usuarios', headers=admin,
                     json={'email': EXPERTO[0], 'nombre': 'Experta', 'rol': 'experto', 'clave': EXPERTO[1]})
    assert r.status_code == 201, r.text
    return _login(cliente, *EXPERTO)


def test_solo_administracion(cliente, experto):
    for metodo, ruta in (('get', '/api/administracion/resumen'), ('get', '/api/administracion/conexion'),
                         ('put', '/api/administracion/hiperparametros/clinico'),
                         ('get', '/api/administracion/programaciones'), ('post', '/api/administracion/ejecuciones'),
                         ('get', '/api/entrenamientos'), ('post', '/api/entrenamientos/aprobar')):
        r = getattr(cliente, metodo)(ruta, headers=experto, **({'json': {}} if metodo in ('put', 'post') else {}))
        assert r.status_code == 403, (ruta, r.status_code)
    assert cliente.get('/api/administracion/resumen').status_code == 401


def test_resumen_inicial(cliente, admin):
    r = cliente.get('/api/administracion/resumen', headers=admin).json()
    assert r['cifrado_disponible'] and not r['conexion_guardada'] and not r['clave_disponible']
    assert r['programaciones_activas'] == 0 and r['zona_horaria'] == 'America/Bogota'
    assert r['mlflow_url'] == 'http://localhost:5000'


def test_conexion_con_clave_cifrada_que_nunca_vuelve(cliente, admin, servidor_pg):
    u = make_url(servidor_pg)
    inicial = cliente.get('/api/administracion/conexion', headers=admin).json()
    assert not inicial['guardada'] and inicial['origen_clave'] == 'ninguna'
    datos = {'host': u.host, 'puerto': u.port or 5432, 'base': 'postgres', 'usuario': u.username,
             'esquema': 'information_schema', 'sslmode': 'disable', 'timeout': 5}
    # probar sin guardar, con la clave equivocada y con la buena
    r = cliente.post('/api/administracion/conexion/probar', headers=admin, json={**datos, 'clave': 'equivocada'})
    assert r.status_code == 200 and not r.json()['ok'] and 'equivocada' not in r.text
    r = cliente.post('/api/administracion/conexion/probar', headers=admin, json={**datos, 'clave': u.password})
    assert r.json()['ok'] and 'tables' in r.json()['tablas']
    r = cliente.put('/api/administracion/conexion', headers=admin, json={**datos, 'clave': u.password})
    assert r.status_code == 200, r.text
    assert r.json()['origen_clave'] == 'guardada' and u.password not in r.text and 'clave' not in r.json()
    # cambiar otro dato sin escribir la clave la conserva; probar sin cuerpo usa lo guardado
    r = cliente.put('/api/administracion/conexion', headers=admin, json={**datos, 'timeout': 8})
    assert r.json()['timeout'] == 8 and r.json()['origen_clave'] == 'guardada'
    assert cliente.post('/api/administracion/conexion/probar', headers=admin).json()['ok']
    from maia_comun import db
    from maia_comun.modelos_db import Auditoria, ConexionOrigen
    with db.fabrica()() as s:
        assert u.password not in s.get(ConexionOrigen, 'kmc').clave_cifrada
        detalles = [a.detalle for a in s.scalars(select(Auditoria).where(Auditoria.accion.like('%conexion%')))]
    assert detalles and all(u.password not in str(d) for d in detalles)
    assert cliente.get('/api/administracion/resumen', headers=admin).json()['clave_disponible']
    r = cliente.put('/api/administracion/conexion', headers=admin, json={**datos, 'sslmode': 'nada'})
    assert r.status_code == 422


def test_hiperparametros(cliente, admin):
    hp = {h['modelo']: h for h in cliente.get('/api/administracion/hiperparametros', headers=admin).json()}
    rondas = next(c for c in hp['anomalias']['campos'] if c['nombre'] == 'rondas')
    assert rondas['defecto'] == 300 and rondas['valor'] is None and rondas['tipo'] == 'int'
    r = cliente.put('/api/administracion/hiperparametros/anomalias', headers=admin,
                    json={'valores': {'rondas': 500, 'tasa': 0.05, 'hojas': None}})
    assert r.status_code == 200, r.text
    valores = {c['nombre']: c['valor'] for c in r.json()['campos']}
    assert valores['rondas'] == 500 and valores['tasa'] == 0.05 and valores['hojas'] is None
    assert cliente.put('/api/administracion/hiperparametros/anomalias', headers=admin,
                       json={'valores': {'rondas': 1}}).status_code == 422
    assert cliente.put('/api/administracion/hiperparametros/otro', headers=admin,
                       json={'valores': {}}).status_code == 404
    from anomalias import modelo as MA
    from maia_comun import db
    from maia_comun import hiperparametros as HP
    cfg, ajustes = HP.leer_y_aplicar(MA.Config(dispositivo='cpu'), 'anomalias', db.motor())
    assert cfg.rondas == 500 and ajustes == {'rondas': 500, 'tasa': 0.05}


def test_calendario_y_programaciones(cliente, admin):
    r = cliente.get('/api/administracion/calendario', headers=admin, params={'cron': '0 2 1 1,7 *'})
    assert r.status_code == 200 and r.json()['descripcion'].startswith('El día 1 de enero y julio')
    assert len(r.json()['proximas']) == 5
    assert cliente.get('/api/administracion/calendario', headers=admin,
                       params={'cron': '0 99 * * *'}).status_code == 422
    nueva = {'nombre': 'Semestral', 'fuente': 'kmc', 'cron': '0 2 1 1,7 *', 'solo_si_nuevo': True,
             'parametros': {'anio_desde': 2015, 'ventana_meses': 36}}
    r = cliente.post('/api/administracion/programaciones', headers=admin, json=nueva)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p['proxima'] and p['zona'] == 'America/Bogota' and p['parametros'] == {'anio_desde': 2015, 'ventana_meses': 36}
    r = cliente.put(f'/api/administracion/programaciones/{p["id"]}', headers=admin, json={**nueva, 'activo': False})
    assert r.json()['proxima'] is None and not r.json()['activo']
    assert cliente.post('/api/administracion/programaciones', headers=admin,
                        json={**nueva, 'cron': 'cada lunes y jueves'}).status_code == 422
    assert cliente.post('/api/administracion/programaciones', headers=admin,
                        json={**nueva, 'fuente': 'simulado'}).status_code == 422      # filtros solo para kmc
    # ejecutar ya: una sola pendiente por programación
    r = cliente.post(f'/api/administracion/programaciones/{p["id"]}/ejecutar', headers=admin)
    assert r.status_code == 202 and r.json()['estado'] == 'pendiente' and r.json()['origen'] == 'manual'
    assert r.json()['parametros'] == {'anio_desde': 2015, 'ventana_meses': 36, 'silencio': False, 'solo_si_nuevo': True}
    assert cliente.post(f'/api/administracion/programaciones/{p["id"]}/ejecutar', headers=admin).status_code == 409
    lista = cliente.get('/api/administracion/ejecuciones', headers=admin).json()
    assert lista[0]['programacion_id'] == p['id']
    assert cliente.get(f'/api/administracion/ejecuciones/{lista[0]["id"]}', headers=admin).status_code == 200
    assert cliente.delete(f'/api/administracion/programaciones/{p["id"]}', headers=admin).status_code == 204
    assert cliente.get(f'/api/administracion/ejecuciones/{lista[0]["id"]}', headers=admin).json()['programacion_id'] is None


def test_corrida_manual(cliente, admin):
    r = cliente.post('/api/administracion/ejecuciones', headers=admin, json={'fuente': 'simulado', 'silencio': True})
    assert r.status_code == 202 and r.json()['parametros'] == {'silencio': True, 'solo_si_nuevo': False}
    assert cliente.post('/api/administracion/ejecuciones', headers=admin,
                        json={'fuente': 'kmc', 'parametros': {'anio_desde': 1800}}).status_code == 422


def _mlflow_falso(peticion: httpx.Request) -> httpx.Response:
    ruta = peticion.url.path
    if ruta.endswith('/experiments/get-by-name'):
        nombre = peticion.url.params['experiment_name']
        return httpx.Response(200, json={'experiment': {'experiment_id': '1' if nombre == 'maia-anomalias' else '2'}})
    if ruta.endswith('/runs/search'):
        eid = json.loads(peticion.content)['experiment_ids'][0]
        return httpx.Response(200, json={'runs': [{
            'info': {'run_id': f'run{eid}', 'status': 'FINISHED', 'start_time': 1793000000000, 'end_time': 1793000600000},
            'data': {'params': [{'key': 'cfg.rondas', 'value': '500'}, {'key': 'cfg.desenlaces', 'value': '[...]'},
                                {'key': 'extraccion.anio_desde', 'value': '2015'}],
                     'metrics': [{'key': 'auc__muerte', 'value': 0.81}],
                     'tags': [{'key': 'fuente', 'value': 'kmc'}, {'key': 'mlflow.runName', 'value': 'clinico kmc'},
                              {'key': 'hiperparametros', 'value': '{"rondas": 500}'}, {'key': 'host', 'value': 'x'}]}}]})
    if ruta.endswith('/registered-models/get'):
        return httpx.Response(200, json={'registered_model': {'aliases': [{'alias': 'candidato', 'version': '3'}]}})
    if ruta.endswith('/model-versions/search'):
        return httpx.Response(200, json={'model_versions': [{'run_id': 'run1', 'version': '3'},
                                                            {'run_id': 'run2', 'version': '3'}]})
    return httpx.Response(404)


def test_entrenamientos_de_mlflow(cliente, admin, monkeypatch):
    from maia_api.rutas import entrenamientos as RE
    from maia_comun import mlflow_rest as ML
    Lector = ML.Lector
    monkeypatch.setattr(RE.ML, 'Lector',
                        lambda uri, *_: Lector(uri, cliente=httpx.Client(transport=httpx.MockTransport(_mlflow_falso))))
    r = cliente.get('/api/entrenamientos', headers=admin, params={'fuente': 'kmc'})
    assert r.status_code == 200, r.text
    e = r.json()['clinico'][0]
    assert e['hiperparametros'] == {'rondas': '500'} and e['extraccion'] == {'anio_desde': '2015'}
    assert e['metricas'] == {'auc__muerte': 0.81}
    assert e['modelo'] == {'registro': 'maia-clinico', 'version': '3', 'alias': ['candidato']}
    assert e['etiquetas'] == {'fuente': 'kmc', 'mlflow.runName': 'clinico kmc', 'hiperparametros': '{"rondas": 500}'}
    assert e['enlace'] == 'http://localhost:5000/#/experiments/2/runs/run2'
    # MLflow caído
    monkeypatch.setattr(RE.ML, 'Lector', lambda uri, *_: Lector('http://127.0.0.1:9', timeout=0.5))
    assert cliente.get('/api/entrenamientos', headers=admin).status_code == 503


def test_aprobar_e_importar_el_paquete(cliente, admin, monkeypatch):
    r = cliente.post('/api/entrenamientos/aprobar', headers=admin,
                     json={'fuente': 'kmc', 'anomalias': '3', 'clinico': '3'})
    assert r.status_code == 202 and r.json()['tipo'] == 'aprobacion'
    assert cliente.post('/api/entrenamientos/aprobar', headers=admin,
                        json={'fuente': 'kmc', 'anomalias': '3', 'clinico': '3'}).status_code == 409
    # el programador terminó: la API baja el paquete de MinIO, lo registra y lo activa (verificar y activar de verdad
    # se prueba en test_api; aquí son falsos)
    from maia_api import trabajos as T
    from maia_api.rutas import modelos as RM
    from maia_comun import almacen as AL
    from maia_comun import config, db
    from maia_comun import ejecuciones as EJ
    from maia_comun.modelos_db import Ejecucion, Paquete
    llamadas = []

    class AlmacenFalso:
        def bajar_archivo(self, bucket, clave, destino):
            llamadas.append(('bajar', bucket, clave))
            return destino

    def registrar(s, cfg, ruta, uid):
        llamadas.append(('registrar', ruta.name))
        s.add(Paquete(version='v-aprobada', fuente='kmc', manifest={}, ruta=str(ruta)))

    monkeypatch.setattr(AL.Almacen, 'desde_config', classmethod(lambda cls, cfg=None: AlmacenFalso()))
    monkeypatch.setattr(RM, 'registrar_paquete', registrar)
    monkeypatch.setattr(T.E, 'activar', lambda s, cfg, v: llamadas.append(('activar', v)))
    with db.fabrica()() as s:
        EJ.terminar(s, r.json()['id'], True, 'listo', {'paquete': 'v-aprobada'})
        s.commit()
        assert T.importar_aprobados(s, config.obtener()) == ['v-aprobada']
        assert T.importar_aprobados(s, config.obtener()) == []           # una sola vez
        assert s.get(Ejecucion, r.json()['id']).resultado['activado'] is True
    assert [x[0] for x in llamadas] == ['bajar', 'registrar', 'activar']
    assert llamadas[0][2] == 'kmc/v-aprobada/paquete.tar.gz'


def test_entrenar_ahora(cliente, admin, experto):
    cuerpo = {'fuente': 'simulado', 'modelos': ['clinico'], 'extraer': True, 'sujetos': 2000,
              'hiperparametros': {'clinico': {'rondas': 800, 'tasa': 0.03, 'hojas': None}}, 'guardar': True}
    assert cliente.post('/api/entrenamientos/entrenar', headers=experto, json=cuerpo).status_code == 403
    malo = {**cuerpo, 'hiperparametros': {'clinico': {'rondas': 1}}}
    assert cliente.post('/api/entrenamientos/entrenar', headers=admin, json=malo).status_code == 422
    r = cliente.post('/api/entrenamientos/entrenar', headers=admin, json=cuerpo)
    assert r.status_code == 202, r.text
    e = r.json()
    assert e['tipo'] == 'entrenamiento' and e['estado'] == 'pendiente'
    assert e['parametros'] == {'modelos': ['clinico'], 'extraer': True, 'filtros': {}, 'sujetos': 2000,
                               'hiperparametros': {'clinico': {'rondas': 800, 'tasa': 0.03}}}
    assert cliente.post('/api/entrenamientos/entrenar', headers=admin, json=cuerpo).status_code == 409
    lista = cliente.get('/api/entrenamientos/ejecuciones', headers=admin).json()
    assert [x['id'] for x in lista] == [e['id']]
    hp = {h['modelo']: h for h in cliente.get('/api/administracion/hiperparametros', headers=admin).json()}
    assert {c['nombre']: c['valor'] for c in hp['clinico']['campos']}['rondas'] == 800   # guardar=True


def test_lector_mlflow_envia_credenciales_y_avisa_si_las_rechaza():
    from maia_comun import mlflow_rest as ML

    vistos = []

    def _mlflow(req: httpx.Request) -> httpx.Response:
        vistos.append(req.headers.get('authorization'))
        return httpx.Response(401, text='Unauthorized')

    lector = ML.Lector('http://mlflow:5000', 'admin', 'clave')
    lector.h = httpx.Client(auth=lector.h.auth, transport=httpx.MockTransport(_mlflow))
    with pytest.raises(ML.MlflowNoDisponible, match='credenciales'):
        lector.experimento('maia-anomalias')
    assert vistos == ['Basic YWRtaW46Y2xhdmU=']
    assert ML.Lector('http://mlflow:5000').h.auth is None
