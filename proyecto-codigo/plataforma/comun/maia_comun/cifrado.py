"""Cifrado de los secretos que administración guarda en la base (hoy, la clave del Postgres de la entidad).

La llave sale de ``MAIA_CIFRADO_CLAVE``, que vive solo en el entorno del servidor (nunca en la base ni en git).
Se acepta cualquier texto de 32 caracteres o más: la llave de Fernet (AES-128-CBC + HMAC-SHA256) se deriva con SHA-256.
Sin esa variable no se guarda ni se lee ningún secreto.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from maia_comun.config import INSEGURO, Configuracion, obtener

MINIMO = 32


class SinLlave(RuntimeError):
    pass


def _fernet(cfg: Configuracion | None = None) -> Fernet:
    secreto = (cfg or obtener()).maia_cifrado_clave
    if not secreto or secreto == INSEGURO or len(secreto) < MINIMO:
        raise SinLlave(f'Defina MAIA_CIFRADO_CLAVE ({MINIMO} caracteres o más) en el entorno del servidor para '
                       'guardar claves desde la web.')
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secreto.encode('utf-8')).digest()))


def disponible(cfg: Configuracion | None = None) -> bool:
    try:
        _fernet(cfg)
        return True
    except SinLlave:
        return False


def cifrar(texto: str, cfg: Configuracion | None = None) -> str:
    return _fernet(cfg).encrypt(texto.encode('utf-8')).decode('ascii')


def descifrar(token: str, cfg: Configuracion | None = None) -> str:
    try:
        return _fernet(cfg).decrypt(token.encode('ascii')).decode('utf-8')
    except InvalidToken:
        raise SinLlave('La clave guardada no se puede descifrar: MAIA_CIFRADO_CLAVE cambió. Escríbala de nuevo en '
                       'Administración › Configuración.') from None
