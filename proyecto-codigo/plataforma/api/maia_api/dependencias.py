"""Dependencias de FastAPI: configuración, sesión de base de datos, usuario actual y roles."""
from __future__ import annotations

import uuid
from collections.abc import Iterator

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from maia_api import seguridad as SG
from maia_comun import config as C
from maia_comun import db
from maia_comun.modelos_db import Auditoria, Usuario

_bearer = HTTPBearer(auto_error=False)


def configuracion() -> C.Configuracion:
    return C.obtener()


def sesion() -> Iterator[Session]:
    s = db.fabrica()()
    try:
        yield s
    finally:
        s.close()


def usuario_actual(cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
                   s: Session = Depends(sesion), cfg: C.Configuracion = Depends(configuracion)) -> Usuario:
    no = HTTPException(status.HTTP_401_UNAUTHORIZED, 'Inicie sesión.', headers={'WWW-Authenticate': 'Bearer'})
    if cred is None:
        raise no
    try:
        datos = SG.leer_acceso(cfg, cred.credentials)
        uid = uuid.UUID(datos['sub'])
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise no from None
    u = s.get(Usuario, uid)
    if u is None or not u.activo:
        raise no
    return u


def requiere_rol(*roles: str):
    def _dep(u: Usuario = Depends(usuario_actual)) -> Usuario:
        if u.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Su perfil no tiene permiso para esto.')
        return u
    return _dep


ADMIN = requiere_rol('admin')
EXPERTO = requiere_rol('admin', 'experto')
CUALQUIERA = requiere_rol('admin', 'experto', 'visualizador')


def ip_cliente(request: Request) -> str:
    reenviada = request.headers.get('x-forwarded-for')
    if reenviada:
        return reenviada.split(',')[0].strip()
    return request.client.host if request.client else 'desconocida'


def auditar(s: Session, usuario: Usuario | None, accion: str, recurso: str | None = None,
            detalle: dict | None = None) -> None:
    s.add(Auditoria(usuario_id=usuario.id if usuario else None, accion=accion, recurso=recurso, detalle=detalle))
