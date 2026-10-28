"""La conexión a la base de la entidad (la de la Fundación) que administración configura desde la web.

Lo guardado en ``app.conexion_origen`` reemplaza a ``KMC_*`` del entorno. La clave se guarda cifrada
(``maia_comun.cifrado``) y solo se descifra en el programador, para pasarla al proceso de la corrida como ``KMC_PW``
(nunca se escribe en un archivo ni vuelve a la web). Sin fila guardada siguen valiendo ``KMC_*`` y el llavero.
"""
from __future__ import annotations

from dataclasses import dataclass

import psycopg
from sqlalchemy.orm import Session

from maia_comun import cifrado
from maia_comun.config import Configuracion, obtener
from maia_comun.modelos_db import ConexionOrigen

SSLMODES = ('disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full')


@dataclass(frozen=True)
class Datos:
    host: str
    puerto: int
    base: str
    usuario: str
    esquema: str
    sslmode: str
    timeout: int


def guardada(s: Session, fuente: str = 'kmc') -> ConexionOrigen | None:
    return s.get(ConexionOrigen, fuente)


def datos_de(c: ConexionOrigen | None, cfg: Configuracion | None = None) -> Datos:
    """Lo guardado o, si no hay, lo del entorno (``KMC_*``)."""
    if c is not None:
        return Datos(c.host, c.puerto, c.base, c.usuario, c.esquema, c.sslmode, c.timeout)
    cfg = cfg or obtener()
    return Datos(cfg.kmc_host, cfg.kmc_port, cfg.kmc_db, cfg.kmc_usuario, cfg.kmc_esquema, cfg.kmc_sslmode,
                 cfg.kmc_timeout)


def clave(c: ConexionOrigen | None, cfg: Configuracion | None = None) -> str | None:
    """La clave en claro: la guardada (descifrada) o ``KMC_PW`` del entorno."""
    if c is not None and c.clave_cifrada:
        return cifrado.descifrar(c.clave_cifrada, cfg)
    return (cfg or obtener()).kmc_pw


def guardar(s: Session, datos: Datos, clave_nueva: str | None, usuario_id, borrar_clave: bool = False,
            cfg: Configuracion | None = None, fuente: str = 'kmc') -> ConexionOrigen:
    """Crea o actualiza la conexión. ``clave_nueva`` vacía conserva la guardada; ``borrar_clave`` la quita."""
    if datos.sslmode not in SSLMODES:
        raise ValueError(f'sslmode debe ser uno de: {", ".join(SSLMODES)}')
    c = s.get(ConexionOrigen, fuente) or ConexionOrigen(fuente=fuente)
    c.host, c.puerto, c.base, c.usuario = datos.host, datos.puerto, datos.base, datos.usuario
    c.esquema, c.sslmode, c.timeout = datos.esquema, datos.sslmode, datos.timeout
    if clave_nueva:
        c.clave_cifrada = cifrado.cifrar(clave_nueva, cfg)
    elif borrar_clave:
        c.clave_cifrada = None
    c.actualizado_por = usuario_id
    s.add(c)
    return c


def entorno(datos: Datos, clave_texto: str | None) -> dict[str, str]:
    """Las variables ``KMC_*`` para el proceso de la corrida."""
    env = {'KMC_HOST': datos.host, 'KMC_PORT': str(datos.puerto), 'KMC_DB': datos.base, 'KMC_USUARIO': datos.usuario,
           'KMC_ESQUEMA': datos.esquema, 'KMC_SSLMODE': datos.sslmode, 'KMC_TIMEOUT': str(datos.timeout)}
    if clave_texto:
        env['KMC_PW'] = clave_texto
    return env


def probar(datos: Datos, clave_texto: str | None) -> dict:
    """Conecta en solo lectura y lista las tablas del esquema. No lee datos de ningún niño."""
    if not clave_texto:
        raise ValueError('No hay clave: escríbala en el formulario o defina KMC_PW en el servidor.')
    with psycopg.connect(host=datos.host, port=datos.puerto, dbname=datos.base, user=datos.usuario,
                         password=clave_texto, sslmode=datos.sslmode, connect_timeout=datos.timeout,
                         application_name='maia-prueba-conexion', autocommit=True) as conn:
        conn.execute('SET default_transaction_read_only = on')
        version = conn.execute('SHOW server_version').fetchone()[0]
        tablas = [r[0] for r in conn.execute(
            'SELECT table_name FROM information_schema.tables WHERE table_schema = %s ORDER BY 1', (datos.esquema,))]
    return {'version_servidor': version, 'esquema': datos.esquema, 'tablas': tablas}
