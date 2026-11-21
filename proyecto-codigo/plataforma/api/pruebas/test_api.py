"""La API de punta a punta con datos simulados: Postgres real, paquete firmado de verdad y un SMTP de prueba.

Entorno ``demo`` (como Railway): cookies seguras, solo paquetes simulados y una cohorte simulada sembrada al arrancar.
"""
from __future__ import annotations

import io
import json
import re
import tarfile
import time
from dataclasses import replace
from datetime import date
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

pytestmark = [pytest.mark.integracion, pytest.mark.timeout(1800)]

CLAVE_PAQUETE = 'clave-de-paquete-de-prueba'
ADMIN = ('admin@maia.prueba', 'clave-admin-de-prueba')


ENTRENAMIENTO_PAQUETE = 1_777_001


@pytest.fixture(scope='module')
def paquetes(tmp_path_factory):
    """Un paquete simulado válido (modelos pequeños), uno de "kmc" y uno alterado."""
    from anomalias import modelo as MA
    from archivos import carpetas as CA
    from archivos.carpetas import Carpetas
    from maia_comun import paquete as PQ
    from maia_comun import simulados
    from maia_entrenamiento import datos as D
    from maia_entrenamiento import entrenar as EN

    tmp = tmp_path_factory.mktemp('paquetes')
    mp = pytest.MonkeyPatch()
    mp.setattr(CA, 'PROYECTO', Carpetas(tmp / 'raiz'))
    try:
        sev = simulados.simular(2500, semilla=5)
        cfg_a = MA.Config(dispositivo='cpu', rondas=40)
        a = EN.entrenar_anomalias(sev, 'simulado', cfg_a, validar=False, registrar=False)
        cfg_c = replace(D.config_clinica('simulado'), dispositivo='cpu')
        c = EN.entrenar_clinico(sev, 'simulado', cfg_c, validar=True, registrar=False)
        base = EN._sevarti_base(sev, tmp / 'sevarti_base')
        modelos = {'anomalias': {'registro': 'maia-anomalias-demo', 'version': '1'},
                   'clinico': {'registro': 'maia-clinico-demo', 'version': '1'}}
        # la analítica viaja con el paquete: la web pública no tiene la base del equipo donde se entrenó
        analitica = [{'entrenamiento_id': ENTRENAMIENTO_PAQUETE, 'modelo': 'clinico', 'desenlace': None, 'tipo': 'meta',
                      'datos': {'fuente': 'simulado', 'registro': 'maia-clinico-demo', 'version_registro': '1',
                                'corte': '2026-06-30', 'desenlaces': [{'clave': 'readm_3m', 'nombre': 'readmisión',
                                                                       'momento': '40 sem', 'etiqueta': 'En uso'}],
                                'submodulos': {'rendimiento': 'ok'}}},
                     {'entrenamiento_id': ENTRENAMIENTO_PAQUETE, 'modelo': 'clinico', 'desenlace': 'readm_3m',
                      'tipo': 'rendimiento', 'datos': {'auc_desenlace': {'auc': 0.77}}}]
        valido = PQ.armar(tmp / 'valido' / PQ.NOMBRE, a.carpeta, c.carpeta, base, 'simulado', CLAVE_PAQUETE,
                          modelos, metricas=c.metricas, analitica=analitica)
        kmc = PQ.armar(tmp / 'kmc' / PQ.NOMBRE, a.carpeta, c.carpeta, base, 'kmc', CLAVE_PAQUETE, modelos)
        alterado = tmp / 'alterado' / PQ.NOMBRE
        alterado.parent.mkdir()
        with tarfile.open(valido) as t_in, tarfile.open(alterado, 'w:gz') as t_out:
            for m in t_in.getmembers():
                datos = t_in.extractfile(m).read() if m.isfile() else None
                if m.name == 'sevarti_base/corte.json':
                    datos = b'{"corte": "1999-01-01"}'
                    m.size = len(datos)
                t_out.addfile(m, io.BytesIO(datos) if datos is not None else None)
    finally:
        mp.undo()
    return {'valido': valido, 'kmc': kmc, 'alterado': alterado}


@pytest.fixture(scope='module')
def cliente(url_db_propia, tmp_path_factory):
    from maia_api import estado as E
    from maia_api import seguridad as SG
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('api')
    mp = pytest.MonkeyPatch()
    for k, v in {'DATABASE_URL': url_db_propia, 'MAIA_ENTORNO': 'demo', 'MAIA_SOLO_SIMULADO': 'true',
                 'MAIA_PAQUETE_CLAVE': CLAVE_PAQUETE, 'MAIA_JWT_SECRETO': 'secreto-jwt-de-prueba-con-mas-de-32-caracteres',
                 'MAIA_ADMIN_EMAIL': ADMIN[0], 'MAIA_ADMIN_CLAVE': ADMIN[1], 'MAIA_DIR_PAQUETES': str(tmp / 'paquetes'),
                 'MAIA_DEMO_SUJETOS': '600', 'MAIA_URL_PUBLICA': 'https://maia.prueba',
                 'MAIA_CIFRADO_CLAVE': 'clave-de-cifrado-de-prueba-de-40-caracteres'}.items():
        mp.setenv(k, v)
    mp.chdir(tmp)
    config.obtener.cache_clear()
    db.motor.cache_clear()
    E.limpiar()
    SG.limite_login.limpiar()
    from maia_api.main import crear_app
    with TestClient(crear_app(), base_url='https://testserver') as c:
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


# ------------------------------------------------------------------ auth y roles

def test_salud_y_semillas(cliente):
    r = cliente.get('/api/salud')
    assert r.status_code == 200
    assert r.json() == {'db': True, 'paquete': None, 'entorno': 'demo'}


def test_login_refresco_y_reuso(cliente):
    from maia_api import seguridad as SG
    SG.limite_login.limpiar()
    assert cliente.post('/api/auth/login', json={'email': ADMIN[0], 'clave': 'otra'}).status_code == 401
    assert cliente.get('/api/auth/yo').status_code == 401
    cab = _login(cliente, *ADMIN)
    assert cliente.get('/api/auth/yo', headers=cab).json()['rol'] == 'admin'
    viejo = cliente.cookies.get(SG.COOKIE_REFRESCO)
    assert viejo
    r = cliente.post('/api/auth/refrescar')
    assert r.status_code == 200 and r.json()['acceso']
    nuevo = cliente.cookies.get(SG.COOKIE_REFRESCO)
    assert nuevo and nuevo != viejo
    # reusar el token ya rotado cierra todas las sesiones, también la nueva
    cliente.cookies.clear()
    cliente.cookies.set(SG.COOKIE_REFRESCO, viejo, path=SG.RUTA_COOKIE)
    assert cliente.post('/api/auth/refrescar').status_code == 401
    cliente.cookies.clear()
    cliente.cookies.set(SG.COOKIE_REFRESCO, nuevo, path=SG.RUTA_COOKIE)
    assert cliente.post('/api/auth/refrescar').status_code == 401
    cliente.cookies.clear()


def test_limite_de_intentos(cliente):
    from maia_api import seguridad as SG
    SG.limite_login.limpiar()
    codigos = [cliente.post('/api/auth/login', json={'email': ADMIN[0], 'clave': 'mala'}).status_code
               for _ in range(SG.limite_login.maximo + 1)]
    assert codigos[-1] == 429
    SG.limite_login.limpiar()


def test_usuarios_y_roles(cliente, admin):
    for email, rol in (('experta@maia.prueba', 'experto'), ('visor@maia.prueba', 'visualizador')):
        r = cliente.post('/api/usuarios', headers=admin,
                         json={'email': email, 'nombre': rol.title(), 'rol': rol, 'clave': 'clave-larga-123'})
        assert r.status_code == 201, r.text
    visor = _login(cliente, 'visor@maia.prueba', 'clave-larga-123')
    experta = _login(cliente, 'experta@maia.prueba', 'clave-larga-123')
    assert cliente.get('/api/usuarios', headers=visor).status_code == 403
    assert cliente.get('/api/corridas', headers=visor).status_code == 403
    assert cliente.get('/api/revision/datos', headers=visor).status_code == 403
    assert cliente.get('/api/corridas', headers=experta).status_code == 403
    assert cliente.get('/api/modelos/activo', headers=visor).status_code == 200
    r = cliente.post('/api/usuarios', headers=admin,
                     json={'email': 'experta@maia.prueba', 'nombre': 'Otra', 'rol': 'experto', 'clave': 'clave-larga-123'})
    assert r.status_code == 409


# ------------------------------------------------------------------ paquetes, corrida y resultados

def _subir(c: TestClient, cab: dict, ruta: Path):
    with open(ruta, 'rb') as f:
        return c.post('/api/modelos/paquetes', headers=cab, files={'archivo': (ruta.name, f, 'application/gzip')})


def test_paquetes(cliente, admin, paquetes):
    r = _subir(cliente, admin, paquetes['kmc'])
    assert r.status_code == 422 and 'simulados' in r.json()['detail']
    r = _subir(cliente, admin, paquetes['alterado'])
    assert r.status_code == 422 and 'no coinciden' in r.json()['detail']
    r = _subir(cliente, admin, paquetes['valido'])
    assert r.status_code == 200, r.text
    version = r.json()['version']
    assert _subir(cliente, admin, paquetes['valido']).status_code == 409
    r = cliente.post(f'/api/modelos/paquetes/{version}/activar', headers=admin)
    assert r.status_code == 200 and r.json()['activo']
    assert cliente.get('/api/salud').json()['paquete'] == version
    assert cliente.get('/api/modelos/activo', headers=admin).json()['version'] == version
    # al activarlo, su analítica queda en la base y se puede mirar en Analítica
    ctx = cliente.get('/api/analitica/contexto', params={'entrenamiento': ENTRENAMIENTO_PAQUETE}, headers=admin).json()
    assert ctx['estado'] == 'ok' and [d['clave'] for d in ctx['desenlaces']] == ['readm_3m']
    r = cliente.get(f'/api/analitica/{ENTRENAMIENTO_PAQUETE}/rendimiento', params={'desenlace': 'readm_3m'}, headers=admin)
    assert r.json()['desenlaces']['readm_3m']['auc_desenlace']['auc'] == 0.77
    r = cliente.post(f'/api/modelos/paquetes/{version}/activar', headers=admin)   # activar dos veces no duplica
    assert r.status_code == 200
    ctx = cliente.get('/api/analitica/entrenamientos', headers=admin).json()['entrenamientos']
    assert sum(1 for e in ctx if e['entrenamiento'] == ENTRENAMIENTO_PAQUETE) == 1


@pytest.fixture(scope='module')
def corrida(cliente, admin, paquetes, smtp):
    # el servidor de correo y una notificación activa (con el paquete ya activo) para que la corrida envíe correos
    puerto, _ = smtp
    r = cliente.put('/api/notificaciones/servidor', headers=admin,
                    json={'host': '127.0.0.1', 'puerto': puerto, 'usuario': None, 'remitente': 'alertas@maia.prueba',
                          'tls': False})
    assert r.status_code == 200, r.text
    claves = [d['clave'] for d in cliente.get('/api/notificaciones/alertas/desenlaces', headers=admin).json()]
    assert claves, 'el paquete activo debe tener desenlaces: sin ellos esta prueba no comprobaría los correos'
    r = cliente.post('/api/notificaciones/alertas', headers=admin,
                     json={'nombre': 'Corrida demo', 'percentil_minimo': 0, 'destinatarios': ['clinica@maia.prueba'],
                           'alertas': claves, 'activo': True})
    assert r.status_code == 201, r.text
    r = cliente.post('/api/corridas', headers=admin, json={'tipo': 'demo'})
    assert r.status_code == 202, r.text
    cid = r.json()['id']
    assert cliente.post('/api/corridas', headers=admin, json={'tipo': 'demo'}).status_code == 409
    fin = time.time() + 900
    while time.time() < fin:
        c = cliente.get(f'/api/corridas/{cid}', headers=admin).json()
        if c['estado'] != 'en_curso':
            break
        time.sleep(1)
    assert c['estado'] == 'ok', c
    return c


def test_corrida_y_tablero(cliente, admin, corrida, smtp):
    _, buzon = smtp
    assert corrida['resumen']['ninos'] == 600
    r = cliente.get('/api/tablero/resumen', headers=admin).json()
    assert r['corrida']['id'] == corrida['id'] and r['ninos'] == 600
    assert r['crecimiento_por_etapa']
    # riesgo alto: niños distintos, igual que la lista que se abre al hacer clic
    altos = cliente.get('/api/ninos', headers=admin, params={'percentil_min': r['percentil_alto'], 'tamano': 1}).json()
    assert r['ninos_riesgo_alto'] == altos['total'] <= r['riesgos_altos']
    assert r['riesgos_altos'] == sum(d['altos'] for d in r['riesgos_por_desenlace'])
    # la validación técnica (y la regla simple) no sale por la API
    assert cliente.get('/api/tablero/desempeno', headers=admin).status_code == 404
    activo = cliente.get('/api/modelos/activo', headers=admin).json()
    assert activo['metricas'] and not any('regla' in k for k in activo['metricas'])
    alarmas = cliente.get('/api/tablero/alarmas-grupo', headers=admin).json()
    assert isinstance(alarmas, list) and len(alarmas) <= 100   # lo que la web lista; el total está en el resumen
    assert len(alarmas) == min(r['alarmas_grupo'], 100)
    # la serie por trimestre cuenta todas las alarmas de la corrida, no solo las 100 que se listan
    trimestres = cliente.get('/api/tablero/alarmas-por-trimestre', headers=admin).json()
    assert sum(t['alarmas'] for t in trimestres) == r['alarmas_grupo']
    assert all(set(t) == {'periodo', 'senal', 'alarmas'} and t['alarmas'] > 0 for t in trimestres)
    assert [t['periodo'] for t in trimestres] == sorted(t['periodo'] for t in trimestres)
    envio = corrida['resumen']['notificaciones']
    assert envio['correos'] >= 1 and envio['errores'] == 0 and not envio['sin_servidor'], envio
    assert len(buzon.mensajes) >= 1
    # «Avisos enviados»: un solo registro para la notificación de la corrida, con su correo y sus niños
    h = cliente.get('/api/notificaciones/historial', headers=admin).json()
    assert h['total'] >= 1 and h['items'][0]['estado'] == 'enviado' and h['items'][0]['notificacion'] == 'Corrida demo'
    assert sum(i['notificacion'] == 'Corrida demo' for i in h['items']) == 1
    assert h['items'][0]['corrida_id'] == corrida['id'] and 1 <= h['items'][0]['ninos'] <= envio['ninos']
    assert h['items'][0]['destinatarios'] == [{'correo': 'clinica@maia.prueba', 'estado': 'enviado', 'error': None}]


def test_ninos_y_linea_temporal(cliente, admin, corrida):
    r = cliente.get('/api/ninos', headers=admin, params={'tamano': 5}).json()
    assert r['total'] == 600 and len(r['items']) == 5
    sujeto = r['items'][0]['sujeto']
    lt = cliente.get(f'/api/ninos/{sujeto}/linea-temporal', headers=admin)
    assert lt.status_code == 200, lt.text
    lt = lt.json()
    assert lt['sujeto'] == sujeto and lt['visitas']
    # la versión del modelo clínico con que se calcularon sus riesgos (la de la corrida)
    assert lt['modelo_clinico'] and lt['modelo_clinico'] == corrida['modelo_clinico']
    assert all(lt['visitas'][i]['orden'] <= lt['visitas'][i + 1]['orden'] for i in range(len(lt['visitas']) - 1))
    # el encabezado de la ficha: el sexo en palabras y el peso al nacer con la unidad en que se registró
    assert lt['sexo'] in ('Femenino', 'Masculino')
    assert float(lt['peso_nacer']['valor']) > 0 and lt['peso_nacer']['unidad'] == 'g'
    assert cliente.get('/api/ninos/no-existe/linea-temporal', headers=admin).status_code == 404
    if r['items'][0]['percentil_max'] is not None:
        filtrado = cliente.get('/api/ninos', headers=admin, params={'percentil_min': 90}).json()
        assert all(i['percentil_max'] >= 90 for i in filtrado['items'])
    # orden por columna, en los dos sentidos, sobre todos los niños (no solo la página)
    asc = cliente.get('/api/ninos', headers=admin, params={'orden': 'eg_semanas', 'dir': 'asc', 'tamano': 50}).json()
    eg = [i['eg_semanas'] for i in asc['items'] if i['eg_semanas'] is not None]
    assert eg == sorted(eg)
    desc = cliente.get('/api/ninos', headers=admin, params={'orden': 'sujeto', 'dir': 'desc', 'tamano': 50}).json()
    codigos = [i['sujeto'] for i in desc['items']]
    assert codigos == sorted(codigos, reverse=True)
    assert cliente.get('/api/ninos', headers=admin, params={'orden': 'columna_inexistente'}).status_code == 422
    # el último control es la última visita con algún dato, la misma que cierra la ficha; ordena por visita
    ultimo = cliente.get('/api/ninos', headers=admin, params={'orden': 'ultimo_control', 'dir': 'desc', 'tamano': 50}).json()
    for i in ultimo['items']:
        assert i['n_crecimiento'] >= i['n_bajo_2de']
    con = [i for i in ultimo['items'] if i['ultima_visita'] is not None]
    assert con
    for i in con[:3]:
        ficha = cliente.get(f'/api/ninos/{i["sujeto"]}/linea-temporal', headers=admin).json()
        final = ficha['visitas'][-1]
        assert i['ultima_visita'] == final['nombre'] and i['ultima_edad_corregida'] == final['edad_corregida']
    rango = list(ficha['nombre_etapa'].values())
    posiciones = [rango.index(i['ultima_visita']) for i in con]
    assert posiciones == sorted(posiciones, reverse=True)


def test_ficha_riesgo_medio_historia_y_perfil(cliente, admin, corrida):
    r = cliente.get('/api/ninos', headers=admin, params={'orden': 'percentil_max', 'tamano': 1}).json()
    sujeto = r['items'][0]['sujeto']
    assert r['items'][0]['percentil_max'] is not None
    lt = cliente.get(f'/api/ninos/{sujeto}/linea-temporal', headers=admin).json()
    guardados = [x for v in lt['visitas'] for x in v['riesgos']]
    # el riesgo promedio de cada desenlace es el mismo del tablero
    medio = {d['clave']: d['riesgo_medio'] for d in cliente.get('/api/tablero/resumen', headers=admin).json()['riesgos_por_desenlace']}
    assert guardados and all(x['riesgo_medio'] == pytest.approx(medio[x['clave']]) for x in guardados)
    # cada medida de crecimiento lleva la unidad en que se registró (el valor no se convierte)
    puntos = [p for ps in lt['crecimiento'].values() for p in ps]
    assert puntos and all(p['unidad'] for p in puntos)

    h = cliente.get(f'/api/ninos/{sujeto}/historia-riesgo', headers=admin)
    assert h.status_code == 200, h.text
    h = h.json()
    assert h['paquete'] == h['paquete_corrida'] and h['puntos']
    assert [p['orden'] for p in h['puntos']] == sorted(p['orden'] for p in h['puntos'])
    assert all(0 <= p['riesgo'] <= 1 and 0 <= p['percentil'] <= 100 and 'motivos' not in p for p in h['puntos'])
    # la última visita, calculada de nuevo con el mismo paquete, da lo mismo que guardó la corrida
    for x in guardados:
        mismo = [p for p in h['puntos'] if p['clave'] == x['clave'] and p['momento'] == x['momento']]
        assert len(mismo) == 1 and mismo[0]['riesgo'] == pytest.approx(x['riesgo'], abs=1e-6), x['clave']
    assert cliente.get('/api/ninos/no-existe/historia-riesgo', headers=admin).status_code == 404

    pf = cliente.get(f'/api/ninos/{sujeto}/perfil', headers=admin)
    assert pf.status_code == 200, pf.text
    filas = pf.json()['variables']
    assert filas[0]['variable'] == 'eg_semanas' and filas[0]['unidad'] == 'semanas'
    assert any(f['variable'] != 'eg_semanas' for f in filas)   # el peso al nacer del simulado tiene concepto
    for f in filas:
        q = f['cuantiles']
        assert q['p5'] <= q['p25'] <= q['p50'] <= q['p75'] <= q['p95'] and f['ninos'] >= 20
        assert f['posicion'] is None or 0 <= f['posicion'] <= 100
        # de la cohorte solo salen agregados
        assert set(f) == {'variable', 'etiqueta', 'unidad', 'ninos', 'cuantiles', 'valor', 'posicion'}
    assert cliente.get('/api/ninos/no-existe/perfil', headers=admin).status_code == 404


def test_perfil_un_valor_por_nino_y_sin_codigos_de_no_se_hizo(cliente, admin, corrida, url_db_propia):
    """Medidas repetidas de un niño no cuentan como más niños ni llenan los cuantiles (con 20 repeticiones de uno solo
    los cuantiles dirían su valor), y un código de «no se hizo» del diccionario no es una medida."""
    from sqlalchemy import create_engine, text

    from maia_api.rutas import ninos as N
    sujeto = cliente.get('/api/ninos', headers=admin, params={'tamano': 1}).json()['items'][0]['sujeto']

    def perfil():
        N._COHORTE.clear()
        return {f['variable']: f for f in cliente.get(f'/api/ninos/{sujeto}/perfil', headers=admin).json()['variables']}

    antes = perfil()
    variable, fila = next((v, f) for v, f in antes.items() if v != 'eg_semanas' and f['valor'] is not None)
    motor = create_engine(url_db_propia)
    with motor.begin() as cx:
        corte = cx.execute(text('SELECT corte_id FROM sevarti.sujetos WHERE sujeto = :s'), {'s': sujeto}).scalar_one()
        datos_antes = cx.execute(text('SELECT datos FROM sevarti.esquema WHERE corte_id = :c AND variable = :v'),
                                 {'c': corte, 'v': variable}).scalar_one()
        desde = cx.execute(text('SELECT max(id) FROM sevarti.mediciones WHERE corte_id = :c'), {'c': corte}).scalar_one() + 1
        cx.execute(text('INSERT INTO sevarti.mediciones (corte_id, id, sujeto, variable, valor) VALUES (:c, :i, :s, :v, :x)'),
                   [{'c': corte, 'i': desde + i, 's': sujeto, 'v': variable, 'x': '1234.5'} for i in range(40)])
    try:
        repetido = perfil()[variable]
        assert repetido['ninos'] == fila['ninos'] and repetido['cuantiles'] == fila['cuantiles']
        assert repetido['valor'] == fila['valor']   # su primer valor, no el repetido
        # su valor pasa a ser un código de «no se hizo»: no cuenta como medida y se toma su siguiente valor válido (el niño
        # sigue contando una sola vez)
        with motor.begin() as cx:
            cx.execute(text("UPDATE sevarti.esquema SET datos = jsonb_set(datos, '{codigos_especiales}', to_jsonb(CAST(:cod AS text))) "
                            'WHERE corte_id = :c AND variable = :v'), {'c': corte, 'v': variable, 'cod': f'{fila["valor"]:g}'})
        con_codigo = perfil()[variable]
        # the code applies to everyone: another child whose only value was that same number has no measure left
        with motor.begin() as cx:
            sin_medida = cx.execute(text(
                r"SELECT count(*) FROM (SELECT sujeto FROM sevarti.mediciones WHERE corte_id = :c AND variable = :v "
                r"AND sujeto <> :s AND valor ~ '^-?[0-9]+(\.[0-9]+)?$' GROUP BY sujeto HAVING bool_and(valor::float = :x)) t"),
                {'c': corte, 'v': variable, 's': sujeto, 'x': fila['valor']}).scalar_one()
        assert con_codigo['valor'] == 1234.5 and con_codigo['ninos'] == fila['ninos'] - sin_medida
    finally:
        with motor.begin() as cx:
            cx.execute(text('DELETE FROM sevarti.mediciones WHERE corte_id = :c AND id >= :d'), {'c': corte, 'd': desde})
            cx.execute(text('UPDATE sevarti.esquema SET datos = CAST(:d AS jsonb) WHERE corte_id = :c AND variable = :v'),
                       {'c': corte, 'v': variable, 'd': json.dumps(datos_antes)})
        N._COHORTE.clear()
        motor.dispose()


def test_revision(cliente, admin, corrida):
    experta = _login(cliente, 'experta@maia.prueba', 'clave-larga-123')
    assert cliente.get('/api/revision/datos', headers=experta).status_code == 200   # la calidad de datos también es de los expertos
    cola = cliente.get('/api/revision/datos', headers=admin).json()
    if cola['items']:
        a = cola['items'][0]
        assert cliente.post(f'/api/revision/datos/{a["id"]}', headers=admin, json={'es_error': 'si'}).status_code == 204
        assert cliente.post(f'/api/revision/datos/{a["id"]}', headers=admin,
                            json={'es_error': 'no', 'comentario': 'Lo confirmé'}).status_code == 204
        revisados = cliente.get('/api/revision/datos', headers=admin, params={'estado': 'revisado'}).json()
        assert revisados['total'] == 1 and revisados['items'][0]['es_error'] == 'no'
        assert cola['total'] - 1 == cliente.get('/api/revision/datos', headers=admin).json()['total']
    assert cliente.post('/api/revision/datos/999999999', headers=admin, json={'es_error': 'si'}).status_code == 404
    muestra = cliente.get('/api/revision/riesgos', headers=experta).json()['items']
    assert len(muestra) <= 40
    # lo que ve el médico: sin ".0" y con la etiqueta de cada categoría, no su código
    lineas = [x for m in muestra for x in m['resumen']]
    assert lineas and not [x for x in lineas if re.search(r'\d\.0', x)], lineas
    oxigeno = [x for x in lineas if x.startswith('Oxígeno')]
    assert oxigeno and all(x.rsplit(': ', 1)[1] in ('displasia broncopulmonar', 'sin diagnóstico') for x in oxigeno), oxigeno
    assert all('riesgo' not in m and 'percentil' not in m for m in muestra), 'la revisión es ciega'
    assert all(isinstance(m['crecimiento'], dict) for m in muestra), 'el crecimiento del niño viene en cada caso'
    if muestra:
        assert cliente.post(f'/api/revision/riesgos/{muestra[0]["id"]}', headers=experta,
                            json={'preocupa': 'si'}).status_code == 204
    res = cliente.get('/api/revision/resumen', headers=experta).json()
    assert res['corrida_id'] == corrida['id']
    if muestra:
        assert sum(g['respuestas'] for g in res['riesgos_por_grupo']) == 1


def test_revision_datos_trae_la_serie_del_concepto(cliente, admin, corrida):
    """Cada dato por revisar trae las medidas del mismo niño y el mismo concepto (p. ej. su peso en cada visita), en orden
    de visita, con el dato marcado; un dato sin concepto en el diccionario no trae serie."""
    items = cliente.get('/api/revision/datos', headers=admin, params={'estado': 'todos', 'tamano': 200}).json()['items']
    assert [d for d in items if len(d['serie']) >= 2], 'algún dato de crecimiento trae su serie'
    for d in items:
        ordenes = [p['orden'] for p in d['serie']]
        assert ordenes == sorted(ordenes)
        assert all(set(p) == {'variable', 'etapa_nombre', 'orden', 'valor', 'es_este'} for p in d['serie'])
        propios = [p for p in d['serie'] if p['es_este']]
        assert len(propios) <= 1
        if propios:
            assert propios[0]['variable'] == d['variable'] and propios[0]['valor'] == pytest.approx(float(d['valor']))
        assert not d['serie'] or len({p['variable'] for p in d['serie']}) == len(d['serie'])



def test_serie_de_revision_en_la_unidad_del_dato_y_sin_codigos(cliente, admin, corrida, url_db_propia):
    """El punto marcado es el valor de la alerta (no otro registro de la misma variable); las demás visitas se pasan a
    la unidad del dato revisado, una unidad que no se sabe convertir no se dibuja, y un código de «no se hizo» no es
    una medida."""
    from sqlalchemy import create_engine, text


    def items():
        return cliente.get('/api/revision/datos', headers=admin, params={'estado': 'todos', 'tamano': 200}).json()['items']

    d = next(d for d in items() if len(d['serie']) >= 2 and any(p['es_este'] for p in d['serie']))
    otro = next(p for p in d['serie'] if not p['es_este'])

    def serie():
        return {p['variable']: p for p in next(x for x in items() if x['id'] == d['id'])['serie']}

    motor = create_engine(url_db_propia)
    with motor.begin() as cx:
        corte = cx.execute(text('SELECT corte_id FROM sevarti.sujetos WHERE sujeto = :s'), {'s': d['sujeto']}).scalar_one()
        antes = {v: cx.execute(text('SELECT datos FROM sevarti.esquema WHERE corte_id = :c AND variable = :v'),
                               {'c': corte, 'v': v}).scalar_one() for v in (d['variable'], otro['variable'])}
        valor_antes = cx.execute(text('SELECT valor FROM resultados.alertas_dato WHERE id = :i'), {'i': d['id']}).scalar_one()

    def cambiar(variable: str, clave: str, valor: str):
        with motor.begin() as cx:
            cx.execute(text('UPDATE sevarti.esquema SET datos = jsonb_set(datos, CAST(:k AS text[]), to_jsonb(CAST(:x AS text))) '
                            'WHERE corte_id = :c AND variable = :v'), {'c': corte, 'v': variable, 'k': [clave], 'x': valor})
    try:
        with motor.begin() as cx:
            cx.execute(text("UPDATE resultados.alertas_dato SET valor = '7777' WHERE id = :i"), {'i': d['id']})
        assert serie()[d['variable']]['valor'] == 7777
        # el dato en cm y la otra visita en mm: se divide entre 10; en g no se sabe pasar a cm y no se dibuja
        cambiar(d['variable'], 'unidad', 'cm')
        cambiar(otro['variable'], 'unidad', 'mm')
        assert serie()[otro['variable']]['valor'] == pytest.approx(otro['valor'] / 10)
        cambiar(otro['variable'], 'unidad', 'g')
        assert otro['variable'] not in serie()
        # el valor de la alerta es un código de «no se hizo»: no hay punto para él
        cambiar(d['variable'], 'codigos_especiales', '7777')
        assert d['variable'] not in serie()
    finally:
        with motor.begin() as cx:
            for v, datos in antes.items():
                cx.execute(text('UPDATE sevarti.esquema SET datos = CAST(:d AS jsonb) WHERE corte_id = :c AND variable = :v'),
                           {'c': corte, 'v': v, 'd': json.dumps(datos)})
            cx.execute(text('UPDATE resultados.alertas_dato SET valor = :x WHERE id = :i'), {'i': d['id'], 'x': valor_antes})
        motor.dispose()

def test_inferencia(cliente, admin, corrida):
    ej = cliente.get('/api/inferencia/ejemplo', headers=admin)
    assert ej.status_code == 200, ej.text
    peticion = ej.json()
    peticion.pop('nota')
    r = cliente.post('/api/inferencia', headers=admin, json=peticion)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out['crecimiento'] and isinstance(out['riesgos'], list)
    assert isinstance(out['modelo_clinico'], str) and out['modelo_clinico']
    assert all(isinstance(x['motivos'], list) for x in out['riesgos'])
    malo = dict(peticion, mediciones=[dict(peticion['mediciones'][0], sujeto='otro')])
    assert cliente.post('/api/inferencia', headers=admin, json=malo).status_code == 422
    visor = _login(cliente, 'visor@maia.prueba', 'clave-larga-123')
    assert cliente.post('/api/inferencia', headers=visor, json=peticion).status_code == 403


def test_formulario_de_calculo(cliente, admin, corrida):
    r = cliente.get('/api/inferencia/formulario', headers=admin)
    assert r.status_code == 200, r.text
    f = r.json()
    ordenes = [v['orden'] for v in f['visitas']]
    assert ordenes == sorted(ordenes) and len(ordenes) >= 3
    campos = [c for v in f['visitas'] for c in v['campos']] + f['generales']
    assert all(c['tipo'] in ('numero', 'lista', 'si_no', 'fecha', 'texto') for c in campos)
    assert any(c['principal'] and not c['crecimiento'] for c in campos), 'las variables que más pesan van primero'
    assert all(c['principal'] for c in campos if c['crecimiento']), 'las medidas de crecimiento siempre se ven'
    assert any(c['opciones'] for c in campos if c['tipo'] == 'lista')
    assert sum(len(v['desenlaces']) for v in f['visitas']) >= 1
    for v in f['visitas']:   # en cada visita, primero los principales y luego por peso
        principales = [c['principal'] for c in v['campos']]
        assert principales == sorted(principales, reverse=True)
    # la web arma la petición con estos campos: el niño de ejemplo, solo con variables del formulario, calcula
    conocidas = {c['variable'] for c in campos}
    peticion = cliente.get('/api/inferencia/ejemplo', headers=admin).json()
    peticion.pop('nota')
    peticion['mediciones'] = [m for m in peticion['mediciones'] if m['variable'] in conocidas]
    out = cliente.post('/api/inferencia', headers=admin, json=peticion).json()
    assert out['variables_ignoradas'] == [] and out['crecimiento']
    visor = _login(cliente, 'visor@maia.prueba', 'clave-larga-123')
    assert cliente.get('/api/inferencia/formulario', headers=visor).status_code == 403


def test_el_nino_de_ejemplo_llena_las_variables_principales_del_paquete(cliente, admin, corrida, monkeypatch):
    """Con el paquete de la Fundación el niño simulado no tenía ninguna variable del paquete (producción: 0 datos).
    El ejemplo sale del diccionario del paquete activo: un valor habitual en cada campo principal de cada visita."""
    from maia_comun import simulados
    simular = simulados.simular

    def con_otros_nombres(*a, **k):   # como el paquete de la Fundación: sus variables no son las del simulador
        sev = simular(*a, **k)
        sev.mediciones['variable'] = 'otra_' + sev.mediciones['variable']
        return sev
    monkeypatch.setattr(simulados, 'simular', con_otros_nombres)
    f = cliente.get('/api/inferencia/formulario', headers=admin).json()
    ej = cliente.get('/api/inferencia/ejemplo', headers=admin).json()
    llenas = {m['variable'] for m in ej['mediciones']}
    # cada visita va completa (un valor en cada campo principal) o vacía, y las llenas son las primeras; un campo se
    # puede llenar si es una medida de crecimiento (mediana OMS), una lista, un sí/no o un número con rango
    principales = [{c['variable'] for c in v['campos'] if c['principal'] and (
        c['crecimiento'] or c['opciones'] or c['tipo'] == 'si_no'
        or (c['minimo'] is not None and c['maximo'] is not None))}
        for v in f['visitas']]
    principales = [p for p in principales if p]
    llena = [p <= llenas for p in principales]
    assert any(llena) and all(lista or not (p & llenas) for lista, p in zip(llena, principales))
    assert llena == sorted(llena, reverse=True)
    nacimiento = date.fromisoformat(ej['sujetos'][0]['fecha_nacimiento'])
    assert all(date.fromisoformat(m['fecha']) >= nacimiento for m in ej['mediciones'])
    assert ej['sujetos'][0]['eg_semanas'] is not None


def test_el_nino_de_ejemplo_muestra_un_riesgo_sin_datos_raros(cliente, admin, corrida):
    """El ejemplo es para ver cómo se ve un resultado: tiene que dar al menos un riesgo (no puede llenar hasta la última
    visita, que ya no deja nada por predecir) y ningún dato raro (ni un peso al nacer de bebé a término con 32 semanas,
    ni una salida del hospital después de las 40 semanas)."""
    ej = cliente.get('/api/inferencia/ejemplo', headers=admin).json()
    ej.pop('nota')
    r = cliente.post('/api/inferencia', headers=admin, json=ej)
    assert r.status_code == 200, r.text
    assert r.json()['riesgos']
    assert r.json()['alertas_dato'] == []


def test_inferencia_que_falla_no_muestra_el_error_de_python(cliente, admin, corrida, monkeypatch):
    from maia_api.rutas import inferencia as RI
    peticion = cliente.get('/api/inferencia/ejemplo', headers=admin).json()
    peticion.pop('nota')

    def falla(*_):
        raise ValueError("cannot convert float NaN to integer 'detalle_interno'")
    monkeypatch.setattr(RI.PU, 'inferir', falla)
    r = cliente.post('/api/inferencia', headers=admin, json=peticion)
    assert r.status_code == 422
    assert r.json()['detail'] == 'No se pudo calcular el riesgo con estos datos. Revise los valores que escribió e intente de nuevo.'
    assert 'detalle_interno' not in r.text and 'NaN' not in r.text


def test_entrenamientos_sin_la_comparacion_con_la_regla_simple(cliente, admin, monkeypatch):
    """Igual que Modelos: la validación interna (``*_regla*``) queda en MLflow."""
    from maia_api.rutas import entrenamientos as RE
    from maia_comun import mlflow_rest as ML

    def mlflow(peticion: httpx.Request) -> httpx.Response:
        ruta = peticion.url.path
        if ruta.endswith('/experiments/get-by-name'):
            return httpx.Response(200, json={'experiment': {'experiment_id': '1'}})
        if ruta.endswith('/runs/search'):
            return httpx.Response(200, json={'runs': [{
                'info': {'run_id': 'run1', 'status': 'FINISHED', 'start_time': 1793000000000, 'end_time': 1793000600000},
                'data': {'params': [], 'tags': [],
                         'metrics': [{'key': 'auc__muerte', 'value': 0.81}, {'key': 'auc_regla__muerte', 'value': 0.7},
                                     {'key': 'top10__muerte', 'value': 0.4}]}}]})
        return httpx.Response(200, json={})
    Lector = ML.Lector
    monkeypatch.setattr(RE.ML, 'Lector', lambda uri, *_: Lector(uri, cliente=httpx.Client(transport=httpx.MockTransport(mlflow))))
    r = cliente.get('/api/entrenamientos', headers=admin)
    assert r.status_code == 200, r.text
    for e in r.json()['clinico'] + r.json()['anomalias']:
        assert e['metricas'] == {'auc__muerte': 0.81, 'top10__muerte': 0.4}


def test_ficha_lleva_perfil_sin_numeros(cliente, admin, corrida):
    sujeto = cliente.get('/api/ninos', headers=admin, params={'tamano': 1}).json()['items'][0]['sujeto']
    lt = cliente.get(f'/api/ninos/{sujeto}/linea-temporal', headers=admin).json()
    p = lt['perfil']
    assert set(p) == {'eg', 'eg_etiqueta', 'lubchenco', 'lubchenco_etiqueta', 'visita', 'etiqueta_corta'}
    assert p['etiqueta_corta'] and not any(ch.isdigit() for ch in p['etiqueta_corta'])


def test_primera_alerta_es_la_primera_visita_en_riesgo_alto(cliente, admin, corrida):
    sujeto = cliente.get('/api/ninos', headers=admin, params={'orden': 'percentil_max', 'tamano': 1}).json()['items'][0]['sujeto']
    h = cliente.get(f'/api/ninos/{sujeto}/historia-riesgo', headers=admin).json()
    claves = {p['clave'] for p in h['puntos']}
    assert set(h['primera_alerta']) == claves
    for clave, primera in h['primera_alerta'].items():
        altos = [p for p in h['puntos'] if p['clave'] == clave and p['percentil'] >= 90]
        if altos:
            assert primera['orden'] == min(p['orden'] for p in altos)
            assert primera['momento'] in {p['momento'] for p in altos}
        else:
            assert primera is None


def test_riesgo_por_visita_marca_la_primera_alerta_y_solo_lo_ve_el_experto(cliente, admin, corrida):
    claves = [x['clave'] for x in cliente.get('/api/tablero/resumen', headers=admin).json()['riesgos_por_desenlace']]
    desenlace = claves[0]
    sin_pedir = cliente.get('/api/analitica/riesgo-por-visita', headers=admin, params={'desenlace': desenlace, 'n': 2})
    assert sin_pedir.status_code == 200, sin_pedir.text
    cuerpo = sin_pedir.json()
    assert cuerpo['elegidos_por'] == 'mayor_riesgo' and cuerpo['umbral_percentil'] == 90 and 1 <= len(cuerpo['ninos']) <= 2
    nino = cuerpo['ninos'][0]
    # una familia de anticipación junta la fila base y sus filas «_desde_» (encendida por defecto, D68)
    assert nino['puntos'] and all(p['clave'] == desenlace or p['clave'].startswith(f'{desenlace}_desde_')
                                  for p in nino['puntos'])
    ordenes = [p['orden'] for p in nino['puntos']]
    assert ordenes == sorted(ordenes)
    altos = [p for p in nino['puntos'] if p['percentil'] >= 90]
    assert (nino['primera_alerta'] is None) == (not altos)
    if altos:
        assert nino['primera_alerta']['orden'] == min(p['orden'] for p in altos)
    pedido = cliente.get('/api/analitica/riesgo-por-visita', headers=admin,
                         params={'desenlace': desenlace, 'sujetos': f'{nino["sujeto"]},no-existe'}).json()
    assert pedido['elegidos_por'] == 'pedido' and pedido['ninos'][0]['puntos'] == nino['puntos']
    assert 'error' in pedido['ninos'][1]
    visor = _login(cliente, 'visor@maia.prueba', 'clave-larga-123')
    assert cliente.get('/api/analitica/riesgo-por-visita', headers=visor, params={'desenlace': desenlace}).status_code == 403
    assert cliente.get('/api/analitica/riesgo-por-visita', params={'desenlace': desenlace}).status_code == 401
