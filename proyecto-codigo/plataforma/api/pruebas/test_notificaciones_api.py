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
    h = cliente.get('/api/notificaciones/historial', headers=admin).json()
    assert any(i['notificacion'] == 'Envio directo' for i in h['items'])
    with db.fabrica()() as s:
        acciones = set(s.execute(text('SELECT accion FROM app.auditoria')).scalars())
    assert {'crear_notificacion', 'enviar_notificacion'} <= acciones
