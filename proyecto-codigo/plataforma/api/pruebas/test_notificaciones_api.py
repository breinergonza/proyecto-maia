# ruff: noqa: F811
"""Notificaciones por correo: servidor SMTP, notificaciones con varias alertas y envío manual.

Reutiliza el paquete simulado y la API de ``test_api`` (la fixture ``smtp`` viene de ``conftest.py``)."""
from __future__ import annotations

import pytest
from test_api import _login, _subir, admin, cliente, paquetes  # noqa: F401

from maia_comun import db
from maia_comun.modelos_db import ConfigSmtp

pytestmark = [pytest.mark.integracion, pytest.mark.timeout(1800)]


@pytest.fixture(scope='module', autouse=True)
def listo(cliente, admin, paquetes):
    """Paquete activo: de él salen los desenlaces que se pueden elegir como alertas."""
    r = _subir(cliente, admin, paquetes['valido'])
    assert r.status_code == 200, r.text
    assert cliente.post(f'/api/modelos/paquetes/{r.json()["version"]}/activar', headers=admin).status_code == 200


def _servidor(cliente, admin, puerto, **extra):
    cuerpo = {'host': '127.0.0.1', 'puerto': puerto, 'usuario': None, 'remitente': 'alertas@maia.prueba', 'tls': False} | extra
    return cliente.put('/api/notificaciones/servidor', headers=admin, json=cuerpo)


def test_servidor_no_devuelve_la_clave(cliente, admin, smtp):
    puerto, _ = smtp
    r = _servidor(cliente, admin, puerto, usuario='u', clave='secreta')
    assert r.status_code == 200 and r.json()['clave_guardada'] is True and 'secreta' not in r.text
    assert 'clave' not in cliente.get('/api/notificaciones/servidor', headers=admin).json()
    assert _servidor(cliente, admin, puerto, usuario='u').json()['clave_guardada'] is True   # sin clave: se conserva


def test_servidor_valida(cliente, admin):
    assert _servidor(cliente, admin, 0).status_code == 422
    assert _servidor(cliente, admin, 25, remitente='no-es-correo').status_code == 422
    assert _servidor(cliente, admin, 25, host='  ').status_code == 422


def test_prueba_de_correo(cliente, admin, smtp):
    puerto, buzon = smtp
    _servidor(cliente, admin, puerto)
    antes = len(buzon.mensajes)
    assert cliente.post('/api/notificaciones/servidor/prueba', headers=admin,
                        json={'destinatario': 'clinica@maia.prueba'}).status_code == 204
    assert len(buzon.mensajes) == antes + 1


def test_crud_de_notificaciones_con_varias_alertas(cliente, admin, paquetes):
    cat = cliente.get('/api/notificaciones/alertas/desenlaces', headers=admin).json()
    assert len(cat) >= 2 and {'clave', 'nombre'} <= set(cat[0])
    a, b = cat[0]['clave'], cat[1]['clave']
    base = {'nombre': 'Neonatología', 'percentil_minimo': 90, 'destinatarios': ['Neo@Maia.Prueba', 'neo@maia.prueba'],
            'alertas': [a, b], 'activo': True}
    r = cliente.post('/api/notificaciones/alertas', headers=admin, json=base)
    assert r.status_code == 201, r.text
    n = r.json()
    assert n['destinatarios'] == ['neo@maia.prueba'] and sorted(n['alertas']) == sorted([a, b])
    assert cliente.post('/api/notificaciones/alertas', headers=admin, json=base).status_code == 409   # nombre repetido
    r2 = cliente.post('/api/notificaciones/alertas', headers=admin,
                      json=base | {'nombre': 'Jefatura', 'alertas': [b], 'destinatarios': ['jefe@maia.prueba']})
    assert r2.status_code == 201
    lista = cliente.get('/api/notificaciones/alertas', headers=admin).json()
    assert {x['nombre'] for x in lista} >= {'Neonatología', 'Jefatura'}
    r3 = cliente.put(f"/api/notificaciones/alertas/{n['id']}", headers=admin, json=base | {'alertas': [a]})
    assert r3.status_code == 200 and r3.json()['alertas'] == [a]
    assert cliente.delete(f"/api/notificaciones/alertas/{n['id']}", headers=admin).status_code == 204
    assert cliente.delete(f"/api/notificaciones/alertas/{n['id']}", headers=admin).status_code == 404


def test_validaciones_de_notificacion(cliente, admin, paquetes):
    a = cliente.get('/api/notificaciones/alertas/desenlaces', headers=admin).json()[0]['clave']
    ok = {'nombre': 'Validar', 'percentil_minimo': 95, 'destinatarios': ['x@maia.prueba'], 'alertas': [a], 'activo': True}

    def post(**cambios):
        return cliente.post('/api/notificaciones/alertas', headers=admin, json=ok | cambios).status_code

    assert post(alertas=[]) == 422                      # al menos una alerta
    assert post(destinatarios=[]) == 422                # para activar, un correo
    assert post(destinatarios=['malo']) == 422          # máscara de correo
    assert post(alertas=['no-existe']) == 422           # fuera del paquete activo
    assert post(nombre='  ') == 422
    assert post(destinatarios=[f'u{i}@maia.prueba' for i in range(51)]) == 422


@pytest.fixture
def sin_servidor():
    """Sin configuración SMTP durante la prueba; al terminar tampoco queda ninguna."""
    def borrar():
        with db.fabrica()() as s:
            s.query(ConfigSmtp).delete()
            s.commit()
    borrar()
    yield
    borrar()


def _crear(cliente, admin, nombre, **extra):
    a = cliente.get('/api/notificaciones/alertas/desenlaces', headers=admin).json()[0]['clave']
    cuerpo = {'nombre': nombre, 'percentil_minimo': 95, 'destinatarios': ['x@maia.prueba'], 'alertas': [a],
              'activo': True} | extra
    r = cliente.post('/api/notificaciones/alertas', headers=admin, json=cuerpo)
    assert r.status_code == 201, r.text
    return r.json()


def test_enviar_ahora_y_prueba_sin_servidor_son_422(cliente, admin, paquetes, sin_servidor):
    n = _crear(cliente, admin, 'SinSmtp')
    r = cliente.post(f"/api/notificaciones/alertas/{n['id']}/enviar", headers=admin)
    assert r.status_code == 422 and 'Configure el servidor de correo' in r.text
    r = cliente.post('/api/notificaciones/servidor/prueba', headers=admin, json={'destinatario': 'a@maia.prueba'})
    assert r.status_code == 422 and 'Configure el servidor de correo' in r.text


def test_nombre_se_normaliza(cliente, admin, paquetes):
    n = _crear(cliente, admin, '  Con\nsalto   raro ')
    assert n['nombre'] == 'Con salto raro'


def test_solo_el_admin_configura(cliente, admin, paquetes):
    cliente.post('/api/usuarios', headers=admin, json={'email': 'exp-notif@maia.prueba', 'nombre': 'Exp', 'rol': 'experto',
                                                       'clave': 'clave-larga-123'})
    exp = _login(cliente, 'exp-notif@maia.prueba', 'clave-larga-123')
    assert cliente.get('/api/notificaciones/servidor', headers=exp).status_code == 403
    assert cliente.get('/api/notificaciones/alertas', headers=exp).status_code == 403
    assert cliente.post('/api/notificaciones/alertas', headers=exp, json={}).status_code == 403


def test_notificacion_inexistente_es_404(cliente, admin, paquetes, smtp):
    a = cliente.get('/api/notificaciones/alertas/desenlaces', headers=admin).json()[0]['clave']
    cuerpo = {'nombre': 'Nada', 'percentil_minimo': 95, 'destinatarios': ['x@maia.prueba'], 'alertas': [a], 'activo': True}
    assert cliente.put('/api/notificaciones/alertas/999999', headers=admin, json=cuerpo).status_code == 404
    _servidor(cliente, admin, smtp[0])
    assert cliente.post('/api/notificaciones/alertas/999999/enviar', headers=admin).status_code == 404


def test_guardar_clave_sin_llave_de_cifrado_es_422(cliente, admin, smtp, monkeypatch):
    from maia_comun import config
    monkeypatch.delenv('MAIA_CIFRADO_CLAVE')
    config.obtener.cache_clear()
    try:
        r = _servidor(cliente, admin, smtp[0], usuario='u', clave='secreta')
        assert r.status_code == 422 and 'MAIA_CIFRADO_CLAVE' in r.text
        assert cliente.get('/api/notificaciones/servidor', headers=admin).json()['puede_guardar_clave'] is False
    finally:
        monkeypatch.undo()
        config.obtener.cache_clear()


def test_clave_ilegible_es_422_en_enviar_y_prueba(cliente, admin, paquetes, smtp, monkeypatch):
    from maia_comun import config
    assert _servidor(cliente, admin, smtp[0], usuario='u', clave='secreta').status_code == 200
    n = _crear(cliente, admin, 'ClaveIlegible')
    monkeypatch.setenv('MAIA_CIFRADO_CLAVE', 'otra-clave-distinta-de-cuarenta-caracteres-1')
    config.obtener.cache_clear()
    try:
        r = cliente.post(f"/api/notificaciones/alertas/{n['id']}/enviar", headers=admin)
        assert r.status_code == 422 and 'MAIA_CIFRADO_CLAVE' in r.text
        r = cliente.post('/api/notificaciones/servidor/prueba', headers=admin, json={'destinatario': 'a@maia.prueba'})
        assert r.status_code == 422 and 'MAIA_CIFRADO_CLAVE' in r.text
    finally:
        monkeypatch.undo()
        config.obtener.cache_clear()
        _servidor(cliente, admin, smtp[0], usuario=None, clave='')   # quita la clave guardada


def test_enviar_ahora_por_api_y_auditoria(cliente, admin, paquetes, smtp):
    from sqlalchemy import text

    from maia_comun.modelos_db import Corrida, Riesgo
    puerto, buzon = smtp
    _servidor(cliente, admin, puerto)
    n = _crear(cliente, admin, 'Envio directo', percentil_minimo=90)
    with db.fabrica()() as s:
        c = Corrida(tipo='demo', estado='ok', silencio=False)
        s.add(c)
        s.flush()
        for i in range(2):
            s.add(Riesgo(corrida_id=c.id, sujeto=f'api{i}', clave=n['alertas'][0], desenlace='alerta', momento='6 meses',
                         riesgo=0.5, percentil=98, motivos=[], silencio=False))
        s.commit()
    antes = len(buzon.mensajes)
    r = cliente.post(f"/api/notificaciones/alertas/{n['id']}/enviar", headers=admin)
    assert r.status_code == 200 and r.json()['correos'] == 1 and r.json()['ninos'] == 2
    assert len(buzon.mensajes) == antes + 1
    # un solo registro para ese envío: dos niños a un correo, no una fila por niño
    mios = [i for i in _avisos(cliente, admin)['items'] if i['notificacion'] == 'Envio directo']
    assert len(mios) == 1 and (mios[0]['ninos'], mios[0]['estado']) == (2, 'enviado')
    assert mios[0]['destinatarios'] == [{'correo': 'x@maia.prueba', 'estado': 'enviado', 'error': None}]
    with db.fabrica()() as s:
        acciones = set(s.execute(text('SELECT accion FROM app.auditoria')).scalars())
    assert {'crear_notificacion', 'enviar_notificacion'} <= acciones


def test_reestablecer_servidor(cliente, admin, paquetes, smtp):
    from sqlalchemy import text
    puerto, _ = smtp
    _servidor(cliente, admin, puerto, usuario='u', clave='secreta')
    n = _crear(cliente, admin, 'Tras reestablecer')
    assert cliente.get('/api/notificaciones/servidor', headers=admin).json()['configurado'] is True
    assert cliente.delete('/api/notificaciones/servidor', headers=admin).status_code == 204
    r = cliente.get('/api/notificaciones/servidor', headers=admin).json()
    assert r['configurado'] is False and r['clave_guardada'] is False and r['host'] == ''
    with db.fabrica()() as s:
        assert s.get(ConfigSmtp, 1) is None
        filas = s.execute(text("SELECT detalle FROM app.auditoria WHERE accion = 'reestablecer_servidor_correo'")).scalars().all()
    assert filas and filas[-1] == {'host': '127.0.0.1'} and 'secreta' not in str(filas)
    # idempotente: sin servidor guardado vuelve a responder 204 y no audita de nuevo
    assert cliente.delete('/api/notificaciones/servidor', headers=admin).status_code == 204
    with db.fabrica()() as s:
        assert len(s.execute(text("SELECT 1 FROM app.auditoria WHERE accion = 'reestablecer_servidor_correo'")).all()) == len(filas)
    # sin servidor, el envío vuelve a pedir configurarlo
    r = cliente.post(f"/api/notificaciones/alertas/{n['id']}/enviar", headers=admin)
    assert r.status_code == 422 and 'Configure el servidor de correo' in r.text


def test_solo_el_admin_reestablece_el_servidor(cliente, admin, paquetes, smtp):
    _servidor(cliente, admin, smtp[0])
    cliente.post('/api/usuarios', headers=admin, json={'email': 'exp-rest@maia.prueba', 'nombre': 'Exp', 'rol': 'experto',
                                                       'clave': 'clave-larga-123'})
    exp = _login(cliente, 'exp-rest@maia.prueba', 'clave-larga-123')
    assert cliente.delete('/api/notificaciones/servidor', headers=exp).status_code == 403
    assert cliente.get('/api/notificaciones/servidor', headers=admin).json()['configurado'] is True


# ------------------------------------------------------------------ avisos enviados: un registro por notificación

def _corrida_con_avisos(notificacion_id, riesgos, envios, cuando):
    """Siembra una corrida terminada con ``riesgos`` [(sujeto, clave, desenlace, percentil)] y las filas que dejaría
    avisar de todos ellos a cada correo de ``envios`` {correo: (estado, error)}. Devuelve el id de la corrida."""
    from maia_comun.modelos_db import Corrida, Notificacion, Riesgo
    with db.fabrica()() as s:
        c = Corrida(tipo='demo', estado='ok', silencio=False)
        s.add(c)
        s.flush()
        filas = [Riesgo(corrida_id=c.id, sujeto=sujeto, clave=clave, desenlace=desenlace, momento='6 meses', riesgo=0.5,
                        percentil=percentil, motivos=[], silencio=False) for sujeto, clave, desenlace, percentil in riesgos]
        s.add_all(filas)
        s.flush()
        s.add_all([Notificacion(riesgo_id=r.id, destinatario=correo, notificacion_config_id=notificacion_id, estado=estado,
                                error=error, enviado_en=cuando)
                   for r in filas for correo, (estado, error) in envios.items()])
        s.commit()
        return c.id


def _avisos(cliente, admin, **params):
    return cliente.get('/api/notificaciones/historial', headers=admin, params={'tamano': 200} | params).json()


def test_avisos_enviados_trae_un_registro_por_notificacion_y_actualizacion(cliente, admin, paquetes):
    """«Avisos enviados» no repite una fila por niño y por correo: cada notificación sale una vez por actualización de
    resultados, con todos sus destinatarios, cuántos niños fueron, cuántos de cada nivel de riesgo y su estado."""
    from datetime import UTC, datetime
    catalogo = cliente.get('/api/notificaciones/alertas/desenlaces', headers=admin).json()
    a, b = catalogo[0]['clave'], catalogo[1]['clave']
    n = _crear(cliente, admin, 'Avisos agrupados', percentil_minimo=85, alertas=[a, b],
               destinatarios=['zeta@maia.prueba', 'alfa@maia.prueba'])
    antes = _avisos(cliente, admin)['total']
    # primera actualización: cuatro niños (uno con las dos alertas) a los dos correos; el de «zeta» falló
    primera = _corrida_con_avisos(
        n['id'], [('h1', a, 'alerta uno', 98), ('h1', b, 'alerta dos', 91), ('h2', a, 'alerta uno', 96),
                  ('h3', a, 'alerta uno', 92), ('h4', b, 'alerta dos', 86)],
        {'alfa@maia.prueba': ('enviado', None), 'zeta@maia.prueba': ('error', 'SMTPException: buzón lleno')},
        datetime(2026, 3, 1, 10, 0, tzinfo=UTC))
    # segunda actualización: un niño, enviado a los dos
    segunda = _corrida_con_avisos(n['id'], [('h9', a, 'alerta uno', 99)],
                                  {'alfa@maia.prueba': ('enviado', None), 'zeta@maia.prueba': ('enviado', None)},
                                  datetime(2026, 4, 1, 10, 0, tzinfo=UTC))
    h = _avisos(cliente, admin)
    assert h['total'] == antes + 2                                      # dos registros, no las doce filas guardadas
    mios = [i for i in h['items'] if i['notificacion'] == 'Avisos agrupados']
    assert [i['corrida_id'] for i in mios] == [segunda, primera]        # el más reciente primero
    reciente, anterior = mios
    assert anterior == {
        'notificacion_id': n['id'], 'notificacion': 'Avisos agrupados', 'corrida_id': primera,
        'enviado_en': anterior['enviado_en'], 'ninos': 4,
        # el nivel de cada niño es el de su riesgo más alto: h1 (98) y h2 (96) muy alto, h3 (92) alto y h4 (86) por debajo
        'riesgo': {'muy_alto': 2, 'alto': 1, 'otros': 1},
        'alertas': [{'desenlace': 'alerta uno', 'ninos': 3}, {'desenlace': 'alerta dos', 'ninos': 2}],
        'destinatarios': [{'correo': 'alfa@maia.prueba', 'estado': 'enviado', 'error': None},
                          {'correo': 'zeta@maia.prueba', 'estado': 'error', 'error': 'SMTPException: buzón lleno'}],
        'estado': 'parcial'}
    assert anterior['enviado_en'].startswith('2026-03-01T10:00')
    assert (reciente['ninos'], reciente['riesgo'], reciente['estado']) == (1, {'muy_alto': 1, 'alto': 0, 'otros': 0}, 'enviado')
    assert [d['estado'] for d in reciente['destinatarios']] == ['enviado', 'enviado']


def test_avisos_enviados_todos_fallaron_notificacion_eliminada_y_paginas(cliente, admin, paquetes):
    """Si falló el envío a todos los correos el registro queda en «error». La paginación cuenta registros. Al eliminar la
    notificación su registro se conserva, sin nombre."""
    from datetime import UTC, datetime
    a = cliente.get('/api/notificaciones/alertas/desenlaces', headers=admin).json()[0]['clave']
    n = _crear(cliente, admin, 'Avisos que se borran', destinatarios=['uno@maia.prueba', 'dos@maia.prueba'])
    fallo = {'uno@maia.prueba': ('error', 'OSError: sin red'), 'dos@maia.prueba': ('error', 'OSError: sin red')}
    # fechas futuras: son los dos registros más recientes de la base de la prueba, en este orden
    vieja = _corrida_con_avisos(n['id'], [('e2', a, 'alerta uno', 97)], {'uno@maia.prueba': ('enviado', None)},
                                datetime(2029, 1, 1, tzinfo=UTC))
    nueva = _corrida_con_avisos(n['id'], [('e1', a, 'alerta uno', 99)], fallo, datetime(2030, 1, 1, tzinfo=UTC))
    pagina = _avisos(cliente, admin, tamano=1)
    assert len(pagina['items']) == 1 and pagina['total'] >= 2 and pagina['tamano'] == 1
    r = pagina['items'][0]
    assert (r['notificacion'], r['corrida_id'], r['estado']) == ('Avisos que se borran', nueva, 'error')
    assert {d['error'] for d in r['destinatarios']} == {'OSError: sin red'}
    assert _avisos(cliente, admin, tamano=1, pagina=2)['items'][0]['corrida_id'] == vieja
    assert cliente.delete(f"/api/notificaciones/alertas/{n['id']}", headers=admin).status_code == 204
    r = _avisos(cliente, admin, tamano=1)['items'][0]
    assert (r['notificacion_id'], r['notificacion'], r['corrida_id'], r['ninos']) == (None, None, nueva, 1)
    assert [d['correo'] for d in r['destinatarios']] == ['dos@maia.prueba', 'uno@maia.prueba']
