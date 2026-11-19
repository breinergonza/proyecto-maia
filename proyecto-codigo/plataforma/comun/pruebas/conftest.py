"""Fixtures de las pruebas de maia_comun que usan la base (las de la raíz entregan ``url_db`` y ``servidor_pg``)."""
from __future__ import annotations

import email
import email.policy
import socket
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session


@pytest.fixture
def motor(url_db):
    """Motor sobre la base migrada de la sesión de pruebas."""
    m = create_engine(url_db)
    yield m
    m.dispose()


@pytest.fixture
def sesion_db(motor):
    """Sesión sobre la base migrada; al terminar limpia lo que las pruebas de notificaciones hayan escrito."""
    with Session(motor) as s:
        yield s
        s.rollback()
    with motor.begin() as c:
        c.execute(text('DELETE FROM app.notificaciones WHERE notificacion_config_id IS NOT NULL'))
        c.execute(text('DELETE FROM app.notificaciones_config'))
        c.execute(text('DELETE FROM app.config_smtp'))
        # corridas de prueba (tipo 'demo' sin corte); sus riesgos caen en cascada. No toca corridas ajenas.
        c.execute(text("DELETE FROM resultados.corridas WHERE tipo = 'demo' AND corte_id IS NULL"))


@pytest.fixture
def motor_vacio(servidor_pg):
    """Motor sobre una base temporal SIN migrar (la prueba decide hasta qué revisión llega); se borra al salir."""
    base = make_url(servidor_pg.replace('postgresql://', 'postgresql+psycopg://', 1)
                    if servidor_pg.startswith('postgresql://') else servidor_pg)
    nombre = f'maia_prueba_{uuid.uuid4().hex[:8]}'
    admin = create_engine(base.set(database='postgres'), isolation_level='AUTOCOMMIT')
    with admin.connect() as cx:
        cx.execute(text(f'CREATE DATABASE {nombre}'))
    m = create_engine(base.set(database=nombre))
    try:
        yield m
    finally:
        m.dispose()
        with admin.connect() as cx:
            cx.execute(text(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{nombre}'"))
            cx.execute(text(f'DROP DATABASE IF EXISTS {nombre}'))
        admin.dispose()


@pytest.fixture
def servidor_smtp():
    """SMTP de prueba (aiosmtpd) en un puerto libre: entrega (puerto, buzón); el buzón guarda los mensajes ya parseados."""
    from aiosmtpd.controller import Controller

    class Buzon:
        def __init__(self):
            self.mensajes: list = []

        async def handle_DATA(self, server, session, envelope):
            self.mensajes.append(email.message_from_bytes(envelope.content, policy=email.policy.default))
            return '250 OK'

    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        puerto = s.getsockname()[1]
    buzon = Buzon()
    c = Controller(buzon, hostname='127.0.0.1', port=puerto)
    c.start()
    try:
        yield puerto, buzon
    finally:
        c.stop()


@pytest.fixture
def smtp_guardado(sesion_db, servidor_smtp):
    """Servidor SMTP de prueba ya guardado en la configuración; entrega (puerto, buzón)."""
    from maia_comun import correo
    puerto, buzon = servidor_smtp
    correo.guardar(sesion_db, dict(host='127.0.0.1', puerto=puerto, usuario=None, remitente='alertas@maia.prueba', tls=False),
                   clave=None, usuario_id=None)
    sesion_db.commit()
    return puerto, buzon


@pytest.fixture
def corrida_con_riesgos(sesion_db):
    """Corrida 'demo' con cuatro niños: p1, p2 y p3 con riesgo alto (alertas a, a, b) y p4 por debajo del umbral."""
    from maia_comun.modelos_db import Corrida, Riesgo
    c = Corrida(tipo='demo', estado='ok', silencio=False)
    sesion_db.add(c)
    sesion_db.flush()
    for sujeto, clave, percentil in [('p1', 'a', 97), ('p2', 'a', 96), ('p3', 'b', 99), ('p4', 'a', 50)]:
        sesion_db.add(Riesgo(corrida_id=c.id, sujeto=sujeto, clave=clave, desenlace=f'alerta {clave}', momento='6 meses',
                             riesgo=0.5, percentil=percentil, motivos=[], silencio=False))
    sesion_db.commit()
    return c.id
