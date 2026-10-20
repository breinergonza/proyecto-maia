"""Fixtures compartidas por las pruebas de la plataforma (comun, entrenamiento, api).

* ``url_db``: una base Postgres nueva por sesión (``url_db_propia``: una por módulo), con las migraciones aplicadas. Usa, en este orden:
  ``MAIA_TEST_DATABASE_URL`` (un servidor existente, p. ej. el Postgres del compose:
  ``postgresql://maia:<clave>@localhost:5432/postgres``) o un contenedor con testcontainers si hay Docker.
  Sin ninguno de los dos, las pruebas que la piden se saltan.
* ``s3``: un servidor S3 en memoria (moto) que hace de MinIO.
* ``sev_demo``: una cohorte simulada pequeña.
"""
from __future__ import annotations

import os
import uuid
from contextlib import contextmanager

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def _servidor_postgres():
    url = os.environ.get('MAIA_TEST_DATABASE_URL')
    if url:
        yield url
        return
    try:
        from testcontainers.postgres import PostgresContainer
    except ImportError:
        pytest.skip('sin MAIA_TEST_DATABASE_URL ni testcontainers')
    try:
        with PostgresContainer('postgres:16', driver='psycopg') as pg:
            yield pg.get_connection_url()
    except Exception as e:  # sin Docker
        pytest.skip(f'sin Postgres para pruebas ({type(e).__name__}); defina MAIA_TEST_DATABASE_URL')


@pytest.fixture(scope='session')
def servidor_pg():
    yield from _servidor_postgres()


@contextmanager
def _base_nueva(servidor: str):
    """Una base vacía con las migraciones aplicadas; se borra al salir."""
    base = make_url(servidor.replace('postgresql://', 'postgresql+psycopg://', 1)
                    if servidor.startswith('postgresql://') else servidor)
    nombre = f'maia_prueba_{uuid.uuid4().hex[:8]}'
    admin = create_engine(base.set(database='postgres'), isolation_level='AUTOCOMMIT')
    with admin.connect() as cx:
        cx.execute(text(f'CREATE DATABASE {nombre}'))
    url = base.set(database=nombre).render_as_string(hide_password=False)
    from maia_comun import migraciones
    migraciones.actualizar(url)
    try:
        yield url
    finally:
        from maia_comun import db
        db.motor.cache_clear()
        with admin.connect() as cx:
            cx.execute(text(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{nombre}'"))
            cx.execute(text(f'DROP DATABASE IF EXISTS {nombre}'))
        admin.dispose()


@pytest.fixture(scope='session')
def url_db(servidor_pg):
    with _base_nueva(servidor_pg) as url:
        yield url


@pytest.fixture(scope='module')
def url_db_propia(servidor_pg):
    """Una base solo para el módulo (p. ej. la API, que siembra su propia cohorte)."""
    with _base_nueva(servidor_pg) as url:
        yield url


@pytest.fixture(scope='session')
def s3():
    import logging

    from moto.server import ThreadedMotoServer
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    servidor = ThreadedMotoServer(ip_address='127.0.0.1', port=0)
    servidor.start()
    host, puerto = servidor.get_host_and_port()
    yield f'http://{host}:{puerto}'
    servidor.stop()


@pytest.fixture
def almacen(s3, monkeypatch):
    from maia_comun import config
    from maia_comun.almacen import Almacen
    monkeypatch.setenv('MINIO_URL', s3)
    monkeypatch.setenv('MINIO_ACCESS_KEY', 'prueba')
    monkeypatch.setenv('MINIO_SECRET_KEY', 'prueba-secreta')
    config.obtener.cache_clear()
    a = Almacen.desde_config()
    a.asegurar_buckets()
    yield a
    config.obtener.cache_clear()


@pytest.fixture(scope='session')
def sev_demo():
    from maia_comun import simulados
    return simulados.simular(1500, semilla=11)
