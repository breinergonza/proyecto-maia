"""«Mis modelos»: cola FIFO de entrenamientos, cuotas por persona, rol, hiperparámetros solo para administración,
cancelar, descartar y el banco compartido. Entorno ``local`` contra Postgres real."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

pytestmark = pytest.mark.integracion

ADMIN = ('admin@maia.prueba', 'clave-admin-de-prueba')
EXPERTOS = {'a': ('experta.a@maia.prueba', 'clave-experta-a-de-prueba'),
            'b': ('experta.b@maia.prueba', 'clave-experta-b-de-prueba')}
VISUAL = ('visual@maia.prueba', 'clave-visual-de-prueba')
CUERPO = {'fuente': 'simulado', 'modelos': ['clinico']}


@pytest.fixture(scope='module')
def cliente(url_db_propia, tmp_path_factory):
    from maia_api import estado as E
    from maia_api import seguridad as SG
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('api_cola')
    mp = pytest.MonkeyPatch()
    for k, v in {'DATABASE_URL': url_db_propia, 'MAIA_ENTORNO': 'local', 'MAIA_SOLO_SIMULADO': 'false',
                 'MAIA_CIFRADO_CLAVE': 'llave-de-cifrado-de-prueba-con-32-caracteres',
                 'MAIA_JWT_SECRETO': 'secreto-jwt-de-prueba-con-mas-de-32-caracteres', 'MAIA_PAQUETE_CLAVE': 'p' * 20,
                 'MAIA_ADMIN_EMAIL': ADMIN[0], 'MAIA_ADMIN_CLAVE': ADMIN[1], 'MAIA_DIR_PAQUETES': str(tmp / 'paquetes'),
                 'MAIA_DEMO_SUJETOS': '300', 'MLFLOW_TRACKING_URI': 'http://mlflow.prueba:5000', 'KMC_PW': '',
                 'MAIA_CUOTA_COLA': '1', 'MAIA_CUOTA_MODELOS': '3'}.items():
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
def personas(cliente, admin):
    for rol, (email, clave) in [('experto', EXPERTOS['a']), ('experto', EXPERTOS['b']), ('visualizador', VISUAL)]:
        r = cliente.post('/api/usuarios', headers=admin, json={'email': email, 'nombre': email.split('@')[0],
                                                               'rol': rol, 'clave': clave})
        assert r.status_code == 201, r.text
    return {'a': _login(cliente, *EXPERTOS['a']), 'b': _login(cliente, *EXPERTOS['b']), 'v': _login(cliente, *VISUAL)}


@pytest.fixture(autouse=True)
def limpiar(cliente):
    """Cada prueba parte con la tabla de ejecuciones vacía."""
    from maia_comun import db
    from maia_comun.modelos_db import Ejecucion
    with db.fabrica()() as s:
        s.query(Ejecucion).delete()
        s.commit()
    yield


def _entrenar(c, h, **extra):
    return c.post('/api/entrenamientos/entrenar', headers=h, json={**CUERPO, **extra})


def test_visualizador_sin_acceso(cliente, personas):
    v = personas['v']
    assert _entrenar(cliente, v).status_code == 403
    assert cliente.get('/api/entrenamientos/cola', headers=v).status_code == 403
    assert cliente.get('/api/entrenamientos/banco', headers=v).status_code == 403
    assert cliente.post('/api/entrenamientos/1/cancelar', headers=v).status_code == 403


def test_experto_personal_con_cuota_de_cola(cliente, personas):
    r = _entrenar(cliente, personas['a'], nombre='Mi prueba')
    assert r.status_code == 202, r.text
    p = r.json()['parametros']
    assert p['visibilidad'] == 'personal' and p['nombre'] == 'Mi prueba' and p['extraer'] is False
    assert r.json()['solicitada_por']
    assert _entrenar(cliente, personas['a']).status_code == 409                  # 1 en cola por persona
    assert _entrenar(cliente, personas['b']).status_code == 202                  # otra persona sí
    assert _entrenar(cliente, personas['a'], visibilidad='oficial').status_code == 403


def test_experto_no_cambia_hiperparametros(cliente, personas):
    hp = {'clinico': {'rondas': 800}}
    r = _entrenar(cliente, personas['a'], hiperparametros=hp)
    assert r.status_code == 422 and 'hiperpar' in r.text
    assert _entrenar(cliente, personas['a'], guardar=True).status_code == 422


def test_validar_parametros_rechaza_hiperparametros_de_experto():
    from maia_comun import ejecuciones as EJ
    with pytest.raises(ValueError, match='hiperpar'):
        EJ.validar_parametros('simulado', {}, rol='experto', hiperparametros={'clinico': {'rondas': 800}})
    with pytest.raises(ValueError, match='hiperpar'):
        EJ.validar_parametros('simulado', {'rondas': 5}, rol='experto')
    assert EJ.validar_parametros('simulado', {}, rol='experto', hiperparametros={'clinico': {}}) == {}
    assert EJ.validar_parametros('kmc', {'anio_desde': 2020}, rol='admin') == {'anio_desde': 2020}


def test_admin_sin_cuota_y_cola_fifo(cliente, admin, personas):
    ids = [_entrenar(cliente, admin).json()['id'] for _ in range(3)]
    assert _entrenar(cliente, personas['a']).status_code == 202
    from maia_comun import db
    from maia_comun import ejecuciones as EJ
    with db.fabrica()() as s:
        primera = EJ.tomar(s)
        assert primera.id == ids[0] and primera.estado == 'en_curso'
        assert EJ.tomar(s) is None                      # una sola en curso a la vez
        s.commit()
        EJ.terminar(s, primera.id, True)
        s.commit()
        segunda = EJ.tomar(s)
        assert segunda.id == ids[1]
        s.commit()
    cola = cliente.get('/api/entrenamientos/cola', headers=admin).json()
    assert [(i['posicion'], i['estado']) for i in cola['items']] == [(0, 'en_curso'), (1, 'pendiente'), (2, 'pendiente')]
    assert cola['limites']['sin_limite'] is True
    assert cola['items'][0]['estimado_min'] is not None or cola['promedio_min'] is None


def test_estimado_promedia_los_terminados(cliente, admin):
    from maia_comun import db
    from maia_comun import ejecuciones as EJ
    from maia_comun.modelos_db import Ejecucion
    assert EJ.promedio_minutos(db.fabrica()()) is None
    ahora = datetime.now(UTC)
    with db.fabrica()() as s:
        for minutos in (10, 20):
            s.add(Ejecucion(tipo='entrenamiento', origen='manual', estado='ok', fuente='simulado', parametros={},
                            iniciada=ahora - timedelta(minutes=minutos), terminada=ahora))
        s.commit()
    pend = _entrenar(cliente, admin).json()
    cola = cliente.get('/api/entrenamientos/cola', headers=admin).json()
    assert cola['promedio_min'] == 15.0
    item = next(i for i in cola['items'] if i['id'] == pend['id'])
    assert item['posicion'] == 1 and item['estimado_min'] == 15.0


def test_cancelar(cliente, admin, personas):
    mio = _entrenar(cliente, personas['a']).json()['id']
    assert cliente.post(f'/api/entrenamientos/{mio}/cancelar', headers=personas['b']).status_code == 403
    r = cliente.post(f'/api/entrenamientos/{mio}/cancelar', headers=personas['a'])
    assert r.status_code == 200 and r.json()['estado'] == 'error' and 'Cancelada' in r.json()['mensaje']
    assert cliente.post(f'/api/entrenamientos/{mio}/cancelar', headers=personas['a']).status_code == 409
    assert _entrenar(cliente, personas['a']).status_code == 202               # liberó su lugar en la cola
    ajeno = _entrenar(cliente, personas['b']).json()['id']
    assert cliente.post(f'/api/entrenamientos/{ajeno}/cancelar', headers=admin).status_code == 200
    assert cliente.post('/api/entrenamientos/99999/cancelar', headers=admin).status_code == 404


def test_cuota_de_modelos_guardados_y_descartar(cliente, personas):
    from maia_comun import db
    from maia_comun import ejecuciones as EJ
    ids = []
    for _ in range(3):
        eid = _entrenar(cliente, personas['a']).json()['id']
        with db.fabrica()() as s:
            EJ.terminar(s, eid, True, resultado={'corte': '2026-01-01'})
            s.commit()
        ids.append(eid)
    r = _entrenar(cliente, personas['a'])
    assert r.status_code == 409 and 'personales' in r.text
    assert cliente.get('/api/entrenamientos/cola', headers=personas['a']).json()['limites']['modelos_usados'] == 3
    assert cliente.post(f'/api/entrenamientos/{ids[0]}/descartar', headers=personas['b']).status_code == 403
    assert cliente.post(f'/api/entrenamientos/{ids[0]}/descartar', headers=personas['a']).status_code == 200
    assert _entrenar(cliente, personas['a']).status_code == 202


def test_muestra_inexistente(cliente, personas):
    assert _entrenar(cliente, personas['a'], muestra_id=987654).status_code == 422


def _muestra(email: str | None, corte: str = 'vigente', titulo: str = 'Prematuros') -> int:
    """Una muestra guardada de ``email`` (o sin dueño) sobre el corte vigente o sobre uno viejo."""
    from sqlalchemy import select

    from maia_comun import db
    from maia_comun.modelos_db import Corte, Usuario
    from maia_comun.modelos_muestras import Muestra
    with db.fabrica()() as s:
        dueno = s.scalars(select(Usuario.id).where(Usuario.email == email)).first() if email else None
        vigente = s.scalars(select(Corte.id).where(Corte.fuente == 'simulado', Corte.vigente.is_(True))).first()
        if vigente is None:
            actual = Corte(fuente='simulado', fecha_corte=date(2026, 6, 30), filas={}, vigente=True)
            s.add(actual)
            s.flush()
            vigente = actual.id
        if corte == 'viejo':
            viejo = Corte(fuente='simulado', fecha_corte=date(2020, 1, 1), filas={}, vigente=False)
            s.add(viejo)
            s.flush()
            vigente = viejo.id
        m = Muestra(titulo=titulo, fuente='simulado', definicion={}, n_ninos=10, n_base=100, huella='x',
                    corte_id=vigente, propietario_id=dueno)
        s.add(m)
        s.commit()
        return m.id


def test_muestra_propia_y_vigente_se_guarda(cliente, personas):
    mid = _muestra(EXPERTOS['a'][0])
    r = _entrenar(cliente, personas['a'], muestra_id=mid)
    assert r.status_code == 202 and r.json()['parametros']['muestra_id'] == mid


def test_muestra_de_otra_persona_solo_la_usa_su_dueno_o_administracion(cliente, admin, personas):
    mid = _muestra(EXPERTOS['a'][0])
    r = _entrenar(cliente, personas['b'], muestra_id=mid)
    assert r.status_code == 422 and 'otra persona' in r.json()['detail']
    assert _entrenar(cliente, admin, muestra_id=mid).status_code == 202            # administración sí


def test_muestra_de_otro_corte_se_rechaza(cliente, personas):
    mid = _muestra(EXPERTOS['a'][0], corte='viejo', titulo='De antes')
    r = _entrenar(cliente, personas['a'], muestra_id=mid)
    assert r.status_code == 422 and 'ya no es el vigente' in r.json()['detail']


def test_muestra_no_se_combina_con_extraer(cliente, admin):
    mid = _muestra(None)
    r = _entrenar(cliente, admin, muestra_id=mid, extraer=True)
    assert r.status_code == 422 and 'extraer' in r.json()['detail']


def test_sin_muestra_todo_igual(cliente, personas):
    r = _entrenar(cliente, personas['a'])
    assert r.status_code == 202 and 'muestra_id' not in r.json()['parametros']


def test_banco_con_corte_anterior(cliente, admin, personas):
    from maia_comun import db
    from maia_comun import ejecuciones as EJ
    from maia_comun.modelos_db import Corte
    with db.fabrica()() as s:
        s.execute(update(Corte).where(Corte.fuente == 'simulado').values(vigente=False))
        s.add(Corte(fuente='simulado', fecha_corte=date(2026, 3, 1), filas={}, vigente=True))
        s.commit()
    viejo = _entrenar(cliente, personas['a'], nombre='Viejo').json()['id']
    nuevo = _entrenar(cliente, admin, nombre='Nuevo').json()['id']
    with db.fabrica()() as s:
        EJ.terminar(s, viejo, True, resultado={'corte': '2026-01-01', 'auc': 0.81})
        EJ.terminar(s, nuevo, True, resultado={'corte': '2026-03-01'})
        s.commit()
    assert cliente.get('/api/entrenamientos/banco', headers=personas['v']).status_code == 403
    banco = {b['id']: b for b in cliente.get('/api/entrenamientos/banco', headers=personas['b']).json()}
    assert banco[viejo]['visibilidad'] == 'personal' and banco[viejo]['propietario'] == 'experta.a'
    assert banco[viejo]['corte_anterior'] is True and banco[viejo]['auc'] == 0.81 and banco[viejo]['propia'] is False
    assert banco[nuevo]['visibilidad'] == 'oficial' and banco[nuevo]['corte_anterior'] is False
    assert banco[nuevo]['auc'] is None


# ------------------------------------------------------------------ cuotas administrables, banco y aprobación

def _terminar(eid: int, **resultado):
    from maia_comun import db
    from maia_comun import ejecuciones as EJ
    with db.fabrica()() as s:
        EJ.terminar(s, eid, True, resultado=resultado)
        s.commit()


@pytest.fixture
def cuotas_de_fabrica(cliente):
    yield
    from maia_comun import db
    from maia_comun.cuotas import CuotaConfig
    with db.fabrica()() as s:
        s.query(CuotaConfig).delete()
        s.commit()


def test_cuotas_valen_los_de_fabrica_y_el_admin_las_cambia(cliente, admin, personas, cuotas_de_fabrica):
    assert cliente.get('/api/entrenamientos/cuotas', headers=personas['v']).status_code == 403
    r = cliente.get('/api/entrenamientos/cuotas', headers=personas['a'])
    assert r.json() == {'cola_max': 1, 'modelos_max': 3, 'dias_sin_uso': 90, 'dias_aviso': 14}
    assert cliente.put('/api/entrenamientos/cuotas', headers=personas['a'], json={'cola_max': 5}).status_code == 403
    assert cliente.put('/api/entrenamientos/cuotas', headers=admin, json={'cola_max': -1}).status_code == 422
    assert cliente.put('/api/entrenamientos/cuotas', headers=admin, json={'dias_sin_uso': 0}).status_code == 422
    r = cliente.put('/api/entrenamientos/cuotas', headers=admin, json={'cola_max': 2, 'dias_sin_uso': 60})
    assert r.status_code == 200 and r.json() == {'cola_max': 2, 'modelos_max': 3, 'dias_sin_uso': 60, 'dias_aviso': 14}
    # la cuota nueva rige: dos en cola para la misma persona, la tercera no
    assert _entrenar(cliente, personas['a']).status_code == 202
    assert _entrenar(cliente, personas['a']).status_code == 202
    assert _entrenar(cliente, personas['a']).status_code == 409
    lim = cliente.get('/api/entrenamientos/cola', headers=personas['a']).json()['limites']
    assert lim['cola_max'] == 2 and lim['dias_sin_uso'] == 60


def test_cuota_de_modelos_cambiada_por_el_admin(cliente, admin, personas, cuotas_de_fabrica):
    cliente.put('/api/entrenamientos/cuotas', headers=admin, json={'modelos_max': 1})
    primero = _entrenar(cliente, personas['a']).json()['id']
    _terminar(primero, corte='2026-06-30')
    r = _entrenar(cliente, personas['a'])
    assert r.status_code == 409 and '1 modelos personales' in r.json()['detail']


def test_banco_con_auc_metricas_y_filtros_por_dueno(cliente, admin, personas):
    a = _entrenar(cliente, personas['a'], nombre='De A').json()['id']
    b = _entrenar(cliente, personas['b'], nombre='De B').json()['id']
    o = _entrenar(cliente, admin, nombre='Oficial').json()['id']
    _terminar(a, corte='2026-06-30', metricas={'clinico': {'auc': 0.83, 'pr_auc': 0.4}}, auc=0.83)
    _terminar(b, corte='2026-06-30', metricas={'clinico': {'auc': 0.77}})
    _terminar(o, corte='2026-06-30')
    h = personas['b']
    todos = {x['id']: x for x in cliente.get('/api/entrenamientos/banco', headers=h).json()}
    assert todos[a]['auc'] == 0.83 and todos[a]['metricas']['clinico']['pr_auc'] == 0.4
    assert todos[b]['auc'] == 0.77            # sin `auc` suelto, sale de las métricas principales del clínico
    assert todos[o]['auc'] is None and todos[o]['metricas'] == {}
    assert {x['id'] for x in cliente.get('/api/entrenamientos/banco?mios=true', headers=h).json()} == {b}
    assert {x['id'] for x in cliente.get('/api/entrenamientos/banco?visibilidad=oficial', headers=h).json()} == {o}
    assert {x['id'] for x in cliente.get('/api/entrenamientos/banco?visibilidad=personal', headers=h).json()} == {a, b}
    dueno_a = todos[a]['propietario_id']
    assert dueno_a and {x['id'] for x in cliente.get(f'/api/entrenamientos/banco?propietario_id={dueno_a}',
                                                     headers=h).json()} == {a}


def test_banco_avisa_cuando_se_acerca_el_borrado(cliente, personas):
    from maia_comun import db
    from maia_comun import ejecuciones as EJ
    from maia_comun.modelos_db import Ejecucion
    viejo = _entrenar(cliente, personas['a']).json()['id']
    _terminar(viejo, corte='2026-06-30')
    with db.fabrica()() as s:
        s.execute(update(Ejecucion).where(Ejecucion.id == viejo).values(terminada=EJ.ahora() - timedelta(days=85)))
        s.commit()
    item = next(x for x in cliente.get('/api/entrenamientos/banco', headers=personas['a']).json() if x['id'] == viejo)
    assert item['vence_en_dias'] == 5


def _con_modelo(cliente, h, tipo: str, version: str, visibilidad: str = 'personal'):
    from maia_comun import db
    from maia_comun.modelos_db import Ejecucion
    eid = _entrenar(cliente, h, nombre='Con versión').json()['id']
    with db.fabrica()() as s:
        e = s.get(Ejecucion, eid)
        e.parametros = {**e.parametros, 'visibilidad': visibilidad}
        s.commit()
    _terminar(eid, corte='2026-06-30', modelos={tipo: {'registro': f'maia-{tipo}-demo', 'version': version}})
    return eid


def test_aprobar_rechaza_versiones_personales(cliente, admin, personas):
    _con_modelo(cliente, personas['a'], 'clinico', '41')
    r = cliente.post('/api/entrenamientos/aprobar', headers=admin,
                     json={'fuente': 'simulado', 'anomalias': '40', 'clinico': '41'})
    assert r.status_code == 409 and 'modelo personal' in r.json()['detail'] and 'clínico' in r.json()['detail']
    assert cliente.post('/api/entrenamientos/aprobar', headers=personas['a'],
                        json={'fuente': 'simulado', 'anomalias': '40', 'clinico': '41'}).status_code == 403
    # una versión oficial sí se aprueba
    _con_modelo(cliente, admin, 'clinico', '42', visibilidad='oficial')
    r = cliente.post('/api/entrenamientos/aprobar', headers=admin,
                     json={'fuente': 'simulado', 'anomalias': '40', 'clinico': '42'})
    assert r.status_code == 202, r.text


def test_aprobar_rechaza_alias_personal_de_mlflow(cliente, admin, monkeypatch):
    from maia_api.rutas import entrenamientos as RE

    class Lector:
        def __init__(self, *a, **k): ...

        def version(self, registro, numero):
            return {'alias': ['personal'] if numero == '51' else ['candidato'], 'etiquetas': {}}

    monkeypatch.setattr(RE.ML, 'Lector', Lector)
    assert cliente.post('/api/entrenamientos/aprobar', headers=admin,
                        json={'fuente': 'simulado', 'anomalias': '50', 'clinico': '51'}).status_code == 409
    assert cliente.post('/api/entrenamientos/aprobar', headers=admin,
                        json={'fuente': 'simulado', 'anomalias': '50', 'clinico': '52'}).status_code == 202


def test_listar_de_mlflow_filtra_por_dueno_y_visibilidad(cliente, admin, monkeypatch):
    from maia_api.rutas import entrenamientos as RE
    vistos = []

    class Lector:
        def __init__(self, *a, **k): ...

        def entrenamientos(self, tipo, fuente=None, limite=50, propietario=None, visibilidad=None):
            vistos.append((tipo, propietario, visibilidad))
            return []

    monkeypatch.setattr(RE.ML, 'Lector', Lector)
    uid = '00000000-0000-0000-0000-000000000001'
    assert cliente.get(f'/api/entrenamientos?propietario={uid}&visibilidad=personal', headers=admin).status_code == 200
    assert ('clinico', uid, 'personal') in vistos
    assert cliente.get('/api/entrenamientos?propietario=x', headers=admin).status_code == 422
