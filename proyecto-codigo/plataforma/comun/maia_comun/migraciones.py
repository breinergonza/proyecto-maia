"""Aplica las migraciones de la base maia sin depender de la ubicación de alembic.ini.

    python -m maia_comun.migraciones            # upgrade head con DATABASE_URL
    python -m maia_comun.migraciones --bajar    # downgrade base (borra todo: solo para pruebas)
"""
from __future__ import annotations

import sys

from alembic import command
from alembic.config import Config

from maia_comun.config import obtener


def configuracion(url: str | None = None) -> Config:
    cfg = Config()
    cfg.set_main_option('script_location', 'maia_comun:alembic')
    cfg.attributes['url'] = url or obtener().database_url
    cfg.attributes['configurar_logs'] = False
    return cfg


def actualizar(url: str | None = None) -> None:
    command.upgrade(configuracion(url), 'head')


def bajar(url: str | None = None) -> None:
    command.downgrade(configuracion(url), 'base')


if __name__ == '__main__':
    bajar() if '--bajar' in sys.argv else actualizar()
    print('Migraciones aplicadas.' if '--bajar' not in sys.argv else 'Base vaciada.')
