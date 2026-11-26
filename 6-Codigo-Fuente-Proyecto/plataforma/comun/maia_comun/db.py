"""Conexión a la base ``maia`` (SQLAlchemy 2 + psycopg 3)."""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from maia_comun.config import normalizar_url_db, obtener


@lru_cache
def motor(url: str | None = None) -> Engine:
    return create_engine(normalizar_url_db(url or obtener().database_url), pool_pre_ping=True, pool_size=5,
                         max_overflow=5, future=True)


def fabrica(url: str | None = None) -> sessionmaker[Session]:
    return sessionmaker(bind=motor(url), expire_on_commit=False, future=True)


@contextmanager
def sesion(url: str | None = None) -> Iterator[Session]:
    """Una transacción: confirma al salir sin errores y deshace si algo falla."""
    s = fabrica(url)()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
