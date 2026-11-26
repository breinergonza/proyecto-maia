"""Entorno de Alembic: la URL sale de la configuración del proyecto (DATABASE_URL)."""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from maia_comun.config import normalizar_url_db, obtener
from maia_comun.modelos_db import Base

config = context.config
if config.config_file_name is not None and config.attributes.get('configurar_logs', True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

url = config.attributes.get('url') or obtener().database_url
config.set_main_option('sqlalchemy.url', normalizar_url_db(url).replace('%', '%%'))
target_metadata = Base.metadata


def _incluir(objeto, nombre, tipo, reflejado, comparado):
    if tipo == 'table' and getattr(objeto, 'schema', None) not in ('sevarti', 'resultados', 'app'):
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option('sqlalchemy.url'), target_metadata=target_metadata,
                      literal_binds=True, include_schemas=True, include_object=_incluir,
                      version_table_schema='public')
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    conectable = engine_from_config(config.get_section(config.config_ini_section, {}), prefix='sqlalchemy.',
                                    poolclass=pool.NullPool)
    with conectable.connect() as conexion:
        context.configure(connection=conexion, target_metadata=target_metadata, include_schemas=True,
                          include_object=_incluir, version_table_schema='public')
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
