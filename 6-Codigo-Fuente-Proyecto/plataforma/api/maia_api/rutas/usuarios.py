"""Usuarios y roles (solo administración). Nunca se devuelve el hash de la contraseña."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from maia_api import seguridad as SG
from maia_api.dependencias import ADMIN, auditar, sesion
from maia_api.esquemas import UsuarioCambio, UsuarioNuevo, UsuarioSalida
from maia_comun.modelos_db import RefreshToken, Usuario

ruta = APIRouter(prefix='/usuarios', tags=['usuarios'])


@ruta.get('', response_model=list[UsuarioSalida])
def listar(s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> list[Usuario]:
    return list(s.scalars(select(Usuario).order_by(Usuario.creado_en)))


@ruta.post('', response_model=UsuarioSalida, status_code=status.HTTP_201_CREATED)
def crear(datos: UsuarioNuevo, s: Session = Depends(sesion), admin: Usuario = Depends(ADMIN)) -> Usuario:
    if s.scalars(select(Usuario).where(Usuario.email == datos.email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, 'Ya hay un usuario con ese correo.')
    u = Usuario(email=datos.email, nombre=datos.nombre, rol=datos.rol, hash_clave=SG.hash_clave(datos.clave))
    s.add(u)
    s.flush()
    auditar(s, admin, 'crear_usuario', str(u.id), {'email': u.email, 'rol': u.rol})
    s.commit()
    s.refresh(u)
    return u


@ruta.patch('/{usuario_id}', response_model=UsuarioSalida)
def cambiar(usuario_id: uuid.UUID, datos: UsuarioCambio, s: Session = Depends(sesion),
            admin: Usuario = Depends(ADMIN)) -> Usuario:
    u = s.get(Usuario, usuario_id)
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'No existe ese usuario.')
    if u.id == admin.id and ((datos.rol and datos.rol != 'admin') or datos.activo is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, 'No puede quitarse a sí mismo el perfil de administración.')
    cambios = datos.model_dump(exclude_unset=True, exclude={'clave'})
    for k, v in cambios.items():
        setattr(u, k, v)
    if datos.clave:
        u.hash_clave = SG.hash_clave(datos.clave)
        cambios['clave'] = '***'
    if datos.clave or datos.activo is False:
        s.execute(update(RefreshToken).where(RefreshToken.usuario_id == u.id).values(revocado=True))
    auditar(s, admin, 'cambiar_usuario', str(u.id), cambios)
    s.commit()
    s.refresh(u)
    return u
