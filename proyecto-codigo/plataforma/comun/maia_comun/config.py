"""Todas las variables de entorno del proyecto, en un solo lugar (sección 6 del plan).

Se leen del entorno y, si existe, de ``.env`` en el directorio de trabajo. Ningún secreto tiene un valor
por defecto útil: los que dicen ``cambiar`` se rechazan fuera de ``MAIA_ENTORNO=local``.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

INSEGURO = 'cambiar'


def normalizar_url_db(url: str) -> str:
    """Railway y la mayoría de servicios entregan ``postgres://`` o ``postgresql://``; SQLAlchemy con psycopg 3
    necesita ``postgresql+psycopg://``."""
    for prefijo in ('postgres://', 'postgresql://'):
        if url.startswith(prefijo):
            return 'postgresql+psycopg://' + url[len(prefijo):]
    return url


class Configuracion(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore',
                                      case_sensitive=False)

    # --- comunes
    maia_entorno: Literal['local', 'demo', 'prueba', 'produccion'] = 'local'
    database_url: str = 'postgresql+psycopg://maia:cambiar@localhost:5432/maia'
    maia_raiz: Path | None = None
    maia_paquete_clave: str = INSEGURO

    # --- solo local
    kmc_pw: str | None = None
    maia_lgbm_device: str = 'cpu'
    mlflow_tracking_uri: str = 'http://localhost:5000'
    minio_url: str = 'http://localhost:9000'
    minio_access_key: str = 'maia-servicio'
    minio_secret_key: str = INSEGURO

    # --- API
    maia_jwt_secreto: str = INSEGURO
    maia_jwt_minutos: int = 30
    maia_refresco_dias: int = 7
    maia_admin_email: str = 'admin@maia.local'
    maia_admin_clave: str = INSEGURO
    maia_solo_simulado: bool = False
    maia_dir_paquetes: Path = Path('/datos/paquetes')
    maia_demo_sujetos: int = 3000
    maia_url_publica: str = 'http://localhost:8080'
    maia_cors_origenes: list[str] = Field(default_factory=lambda: ['http://localhost:5173'])

    # --- correo
    smtp_host: str = 'localhost'
    smtp_port: int = 1025
    smtp_usuario: str | None = None
    smtp_clave: str | None = None
    smtp_remitente: str = 'alertas@maia.local'
    smtp_tls: bool = False

    @field_validator('database_url')
    @classmethod
    def _url(cls, v: str) -> str:
        return normalizar_url_db(v)

    @field_validator('smtp_usuario', 'smtp_clave', 'kmc_pw', mode='before')
    @classmethod
    def _vacio(cls, v):
        return v or None

    def exigir_secretos(self) -> None:
        """Fuera del entorno local no se arranca con secretos de ejemplo."""
        if self.maia_entorno == 'local':
            return
        flojos = [n for n in ('maia_jwt_secreto', 'maia_paquete_clave', 'maia_admin_clave')
                  if getattr(self, n) in (INSEGURO, '') or len(getattr(self, n)) < 12]
        if flojos:
            raise RuntimeError('Defina valores propios (12 caracteres o más) para: ' + ', '.join(n.upper() for n in flojos))


@lru_cache
def obtener() -> Configuracion:
    return Configuracion()
