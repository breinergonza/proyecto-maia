"""Contraseñas (Argon2), tokens de acceso (JWT HS256, 30 min) y de refresco (opacos, 7 días, rotados en cada uso)."""
from __future__ import annotations

import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from maia_comun.config import Configuracion

_hasher = PasswordHash.recommended()
ALGORITMO = 'HS256'
COOKIE_REFRESCO = 'maia_refresco'
RUTA_COOKIE = '/api/auth'


def hash_clave(clave: str) -> str:
    return _hasher.hash(clave)


def verificar_clave(clave: str, hash_guardado: str) -> bool:
    try:
        return _hasher.verify(clave, hash_guardado)
    except Exception:   # hash corrupto o de otro esquema
        return False


def crear_acceso(cfg: Configuracion, usuario_id: str, rol: str, nombre: str) -> str:
    ahora = datetime.now(UTC)
    return jwt.encode({'sub': usuario_id, 'rol': rol, 'nombre': nombre, 'typ': 'acceso', 'iat': ahora,
                       'exp': ahora + timedelta(minutes=cfg.maia_jwt_minutos)}, cfg.maia_jwt_secreto, ALGORITMO)


def leer_acceso(cfg: Configuracion, token: str) -> dict:
    """Lanza ``jwt.InvalidTokenError`` si el token no es válido, expiró o no es de acceso."""
    datos = jwt.decode(token, cfg.maia_jwt_secreto, algorithms=[ALGORITMO], options={'require': ['exp', 'sub']})
    if datos.get('typ') != 'acceso':
        raise jwt.InvalidTokenError('no es un token de acceso')
    return datos


def nuevo_refresco() -> tuple[str, str]:
    """(token para la cookie, hash para la base). La base nunca guarda el token."""
    token = secrets.token_urlsafe(48)
    return token, hash_refresco(token)


def hash_refresco(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


class LimiteIntentos:
    """N intentos por ventana y por clave (IP). En memoria: la API corre con un solo proceso."""

    def __init__(self, maximo: int = 5, ventana_s: float = 60.0):
        self.maximo, self.ventana = maximo, ventana_s
        self._intentos: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def permitir(self, clave: str) -> bool:
        ahora = time.monotonic()
        with self._lock:
            q = self._intentos[clave]
            while q and ahora - q[0] > self.ventana:
                q.popleft()
            if len(q) >= self.maximo:
                return False
            q.append(ahora)
            return True

    def limpiar(self) -> None:
        with self._lock:
            self._intentos.clear()


limite_login = LimiteIntentos()
