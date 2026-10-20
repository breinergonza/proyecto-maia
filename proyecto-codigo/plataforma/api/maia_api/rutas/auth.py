"""Ingreso, refresco del token (cookie httpOnly rotada en cada uso), salida y usuario actual."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from maia_api import seguridad as SG
from maia_api.dependencias import auditar, configuracion, ip_cliente, sesion, usuario_actual
from maia_api.esquemas import Login, RespuestaLogin, UsuarioSalida
from maia_comun.config import Configuracion
from maia_comun.modelos_db import RefreshToken, Usuario

ruta = APIRouter(prefix='/auth', tags=['auth'])


def _cookie_segura(cfg: Configuracion) -> bool:
    return cfg.maia_entorno != 'local' or cfg.maia_url_publica.startswith('https://')


def _emitir(s: Session, cfg: Configuracion, u: Usuario, respuesta: Response) -> RespuestaLogin:
    token, h = SG.nuevo_refresco()
    s.add(RefreshToken(usuario_id=u.id, hash_token=h,
                       expira=datetime.now(UTC) + timedelta(days=cfg.maia_refresco_dias)))
    respuesta.set_cookie(SG.COOKIE_REFRESCO, token, max_age=cfg.maia_refresco_dias * 86400, httponly=True,
                         secure=_cookie_segura(cfg), samesite='strict', path=SG.RUTA_COOKIE)
    acceso = SG.crear_acceso(cfg, str(u.id), u.rol, u.nombre)
    return RespuestaLogin(acceso=acceso, usuario=UsuarioSalida.model_validate(u))


@ruta.post('/login', response_model=RespuestaLogin)
def login(datos: Login, request: Request, respuesta: Response, s: Session = Depends(sesion),
          cfg: Configuracion = Depends(configuracion)) -> RespuestaLogin:
    if not SG.limite_login.permitir(ip_cliente(request)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, 'Demasiados intentos. Espere un minuto.')
    u = s.scalars(select(Usuario).where(Usuario.email == datos.email)).first()
    if u is None or not u.activo or not SG.verificar_clave(datos.clave, u.hash_clave):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Correo o contraseña incorrectos.')
    u.ultimo_ingreso = datetime.now(UTC)
    salida = _emitir(s, cfg, u, respuesta)
    auditar(s, u, 'ingreso', 'auth')
    s.commit()
    return salida


@ruta.post('/refrescar', response_model=RespuestaLogin)
def refrescar(request: Request, respuesta: Response, s: Session = Depends(sesion),
              cfg: Configuracion = Depends(configuracion)) -> RespuestaLogin:
    token = request.cookies.get(SG.COOKIE_REFRESCO)
    no = HTTPException(status.HTTP_401_UNAUTHORIZED, 'La sesión terminó. Ingrese de nuevo.')
    if not token:
        raise no
    rt = s.scalars(select(RefreshToken).where(RefreshToken.hash_token == SG.hash_refresco(token))).first()
    if rt is None:
        raise no
    if rt.revocado:
        # reuso de un token ya rotado: se cierran todas las sesiones del usuario
        s.execute(update(RefreshToken).where(RefreshToken.usuario_id == rt.usuario_id).values(revocado=True))
        s.commit()
        raise no
    if rt.expira < datetime.now(UTC):
        raise no
    u = s.get(Usuario, rt.usuario_id)
    if u is None or not u.activo:
        raise no
    rt.revocado = True
    salida = _emitir(s, cfg, u, respuesta)
    s.commit()
    return salida


@ruta.post('/salir', status_code=status.HTTP_204_NO_CONTENT)
def salir(request: Request, respuesta: Response, s: Session = Depends(sesion),
          cfg: Configuracion = Depends(configuracion)) -> Response:
    token = request.cookies.get(SG.COOKIE_REFRESCO)
    if token:
        s.execute(update(RefreshToken).where(RefreshToken.hash_token == SG.hash_refresco(token)).values(revocado=True))
        s.commit()
    respuesta.status_code = status.HTTP_204_NO_CONTENT
    respuesta.delete_cookie(SG.COOKIE_REFRESCO, path=SG.RUTA_COOKIE, secure=_cookie_segura(cfg), httponly=True,
                            samesite='strict')
    return respuesta


@ruta.get('/yo', response_model=UsuarioSalida)
def yo(u: Usuario = Depends(usuario_actual)) -> Usuario:
    return u
