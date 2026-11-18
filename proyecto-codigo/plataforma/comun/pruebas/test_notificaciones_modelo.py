"""Modelos de las notificaciones con varias alertas y del SMTP guardado en base."""
import pytest
from alembic import command
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from maia_comun.migraciones import configuracion
from maia_comun.modelos_db import ConfigSmtp, NotificacionAlerta, NotificacionConfig


def test_una_notificacion_junta_varias_alertas(sesion_db):
    n = NotificacionConfig(nombre='Neonatología', destinatarios=['a@maia.prueba'], activo=True,
                           alertas=[NotificacionAlerta(desenlace='x'), NotificacionAlerta(desenlace='y')])
    sesion_db.add(n)
    sesion_db.commit()
    assert sorted(a.desenlace for a in n.alertas) == ['x', 'y']
    assert n.percentil_minimo > 0


def test_el_nombre_es_unico(sesion_db):
    sesion_db.add_all([NotificacionConfig(nombre='Igual'), NotificacionConfig(nombre='Igual')])
    with pytest.raises(IntegrityError):
        sesion_db.commit()
    sesion_db.rollback()


def test_el_smtp_es_una_sola_fila(sesion_db):
    sesion_db.add(ConfigSmtp(id=1, host='h', puerto=25, remitente='a@b.co', tls=False))
    sesion_db.commit()
    sesion_db.add(ConfigSmtp(id=2, host='h2', puerto=25, remitente='a@b.co', tls=False))
    with pytest.raises(IntegrityError):
        sesion_db.commit()
    sesion_db.rollback()


def _cfg(motor):
    return configuracion(motor.url.render_as_string(hide_password=False))


def _sembrar_catalogo(motor, filas):
    """Pisa el catálogo sembrado por migraciones anteriores: solo quedan activas/con correos las filas dadas."""
    with motor.begin() as c:
        c.execute(text("UPDATE app.config_notificaciones SET activo = false, destinatarios = '{}'"))
        for desenlace, nombre, dest, activo in filas:
            c.execute(text("INSERT INTO app.config_notificaciones (desenlace, nombre, percentil_minimo, destinatarios, activo)"
                           " VALUES (:d, :n, 95, :c, :a) ON CONFLICT (desenlace) DO UPDATE SET nombre = EXCLUDED.nombre,"
                           " destinatarios = EXCLUDED.destinatarios, activo = EXCLUDED.activo"),
                      {'d': desenlace, 'n': nombre, 'c': dest, 'a': activo})


def test_la_migracion_copia_lo_configurado(motor_vacio):
    cfg = _cfg(motor_vacio)
    command.upgrade(cfg, '0011')
    _sembrar_catalogo(motor_vacio, [('a', 'Alerta A', ['x@maia.prueba'], True), ('b', 'Alerta B', [], False)])
    command.upgrade(cfg, '0012')
    with motor_vacio.connect() as c:
        filas = c.execute(text("SELECT n.nombre, a.desenlace, n.destinatarios, n.activo, n.percentil_minimo "
                               "FROM app.notificaciones_config n "
                               "JOIN app.notificaciones_config_alertas a ON a.notificacion_id = n.id")).all()
        vacia = c.execute(text("SELECT count(*) FROM app.config_notificaciones "
                               "WHERE activo OR cardinality(destinatarios) > 0")).scalar_one()
        catalogo = c.execute(text("SELECT count(*) FROM app.config_notificaciones "
                                  "WHERE desenlace IN ('a','b')")).scalar_one()
        columnas = {k['name'] for k in inspect(c).get_columns('notificaciones_config', schema='app')}
    assert [tuple(f) for f in filas] == [('Alerta A', 'a', ['x@maia.prueba'], True, 95)]   # 'b' no se copia
    assert vacia == 0 and catalogo == 2
    assert '_desenlace' not in columnas


def test_la_migracion_resuelve_nombres_repetidos(motor_vacio):
    cfg = _cfg(motor_vacio)
    command.upgrade(cfg, '0011')
    _sembrar_catalogo(motor_vacio, [('a', 'Igual', ['x@maia.prueba'], True), ('b', 'Igual', ['y@maia.prueba'], True),
                                    ('c', 'a', ['z@maia.prueba'], True)])   # un nombre que coincide con otro desenlace
    command.upgrade(cfg, '0012')
    with motor_vacio.connect() as c:
        filas = c.execute(text("SELECT n.nombre, a.desenlace, n.destinatarios FROM app.notificaciones_config n "
                               "JOIN app.notificaciones_config_alertas a ON a.notificacion_id = n.id "
                               "ORDER BY a.desenlace")).all()
    assert [tuple(f) for f in filas] == [('Igual', 'a', ['x@maia.prueba']), ('Igual (b)', 'b', ['y@maia.prueba']),
                                         ('a', 'c', ['z@maia.prueba'])]


def test_el_downgrade_quita_lo_nuevo(motor_vacio):
    cfg = _cfg(motor_vacio)
    command.upgrade(cfg, '0012')
    command.downgrade(cfg, '0011')
    insp = inspect(motor_vacio)
    tablas = set(insp.get_table_names(schema='app'))
    assert not tablas & {'config_smtp', 'notificaciones_config', 'notificaciones_config_alertas'}
    assert 'notificacion_config_id' not in {k['name'] for k in insp.get_columns('notificaciones', schema='app')}
