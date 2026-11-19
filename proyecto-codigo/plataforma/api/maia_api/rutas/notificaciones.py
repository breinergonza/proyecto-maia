"""Notificaciones por correo: servidor SMTP, notificaciones con varias alertas, historial y envío manual."""
from __future__ import annotations

import smtplib

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from maia_api.dependencias import ADMIN, auditar, configuracion, sesion
from maia_api.esquemas import NotificacionEntrada, PruebaCorreo, ServidorEntrada
from maia_comun import cifrado, correo, db
from maia_comun import notificaciones as N
from maia_comun.config import Configuracion
from maia_comun.modelos_db import ConfigNotificacion, ConfigSmtp, NotificacionAlerta, NotificacionConfig, Usuario

ruta = APIRouter(prefix='/notificaciones', tags=['notificaciones'])
SIN_SERVIDOR = 'Configure el servidor de correo en Notificaciones › Servidor de correo.'


# ------------------------------------------------------------------ servidor de correo

def _servidor(f: ConfigSmtp | None) -> dict:
    llave = cifrado.disponible()
    if f is None:
        return {'configurado': False, 'host': '', 'puerto': 587, 'usuario': None, 'remitente': '', 'tls': True,
                'clave_guardada': False, 'puede_guardar_clave': llave}
    return {'configurado': True, 'host': f.host, 'puerto': f.puerto, 'usuario': f.usuario, 'remitente': f.remitente,
            'tls': f.tls, 'clave_guardada': bool(f.clave_cifrada), 'puede_guardar_clave': llave}


@ruta.get('/servidor')
def servidor(s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> dict:
    return _servidor(s.get(ConfigSmtp, 1))


@ruta.put('/servidor')
def guardar_servidor(datos: ServidorEntrada, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
                     admin: Usuario = Depends(ADMIN)) -> dict:
    try:
        f = correo.guardar(s, datos.model_dump(exclude={'clave'}), datos.clave, admin.id, cfg)
    except cifrado.SinLlave as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    auditar(s, admin, 'configurar_servidor_correo', None,
            {'host': datos.host, 'puerto': datos.puerto, 'tls': datos.tls, 'clave_cambiada': datos.clave is not None})
    s.commit()
    return _servidor(f)


@ruta.delete('/servidor', status_code=status.HTTP_204_NO_CONTENT)
def reestablecer_servidor(s: Session = Depends(sesion), admin: Usuario = Depends(ADMIN)) -> None:
    """Borra el servidor guardado (con su clave cifrada). Es idempotente: sin servidor también responde 204."""
    f = s.get(ConfigSmtp, 1)
    if f is not None:
        auditar(s, admin, 'reestablecer_servidor_correo', None, {'host': f.host})   # sin la clave
        s.delete(f)
        s.commit()


@ruta.post('/servidor/prueba', status_code=status.HTTP_204_NO_CONTENT)
def prueba(datos: PruebaCorreo, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
           admin: Usuario = Depends(ADMIN)) -> None:
    try:
        smtp = correo.cargar(s, cfg)
        correo.enviar(smtp, [datos.destinatario], '[MAIA] Correo de prueba',
                      'Si recibe este correo, las notificaciones del Observatorio están bien configuradas.')
    except correo.SinServidor as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, SIN_SERVIDOR) from e
    except cifrado.SinLlave as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    except (OSError, smtplib.SMTPException) as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f'No se pudo enviar: {type(e).__name__}: {e}') from e
    auditar(s, admin, 'correo_prueba', None)
    s.commit()


# ------------------------------------------------------------------ notificaciones (alertas por correo)

def _salida(n: NotificacionConfig) -> dict:
    return {'id': n.id, 'nombre': n.nombre, 'percentil_minimo': n.percentil_minimo,
            'destinatarios': list(n.destinatarios or []), 'alertas': [a.desenlace for a in n.alertas], 'activo': n.activo}


def _validar(s: Session, datos: NotificacionEntrada) -> None:
    if datos.activo and not datos.destinatarios:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, 'Para activar, agregue al menos un correo.')
    validas = set(s.scalars(select(ConfigNotificacion.desenlace)))
    malas = [a for a in datos.alertas if a not in validas]
    if malas:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            'Esas alertas no están en el paquete activo: ' + ', '.join(malas))


@ruta.get('/alertas/desenlaces')
def desenlaces(s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> list[dict]:
    filas = s.scalars(select(ConfigNotificacion).order_by(ConfigNotificacion.nombre))
    return [{'clave': c.desenlace, 'nombre': c.nombre or c.desenlace} for c in filas]


@ruta.get('/alertas')
def alertas(s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> list[dict]:
    return [_salida(n) for n in s.scalars(select(NotificacionConfig).order_by(NotificacionConfig.nombre))]


@ruta.post('/alertas', status_code=status.HTTP_201_CREATED)
def crear(datos: NotificacionEntrada, s: Session = Depends(sesion), admin: Usuario = Depends(ADMIN)) -> dict:
    _validar(s, datos)
    n = NotificacionConfig(nombre=datos.nombre, percentil_minimo=datos.percentil_minimo, destinatarios=datos.destinatarios,
                           activo=datos.activo, alertas=[NotificacionAlerta(desenlace=a) for a in datos.alertas])
    s.add(n)
    try:
        s.flush()
    except IntegrityError as e:
        s.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, 'Ya existe una notificación con ese nombre.') from e
    auditar(s, admin, 'crear_notificacion', str(n.id),
            {'nombre': n.nombre, 'alertas': len(datos.alertas), 'destinatarios': len(datos.destinatarios)})
    s.commit()
    return _salida(n)


@ruta.put('/alertas/{notificacion_id}')
def guardar(notificacion_id: int, datos: NotificacionEntrada, s: Session = Depends(sesion),
            admin: Usuario = Depends(ADMIN)) -> dict:
    n = s.get(NotificacionConfig, notificacion_id)
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'No existe esa notificación.')
    _validar(s, datos)
    n.nombre, n.percentil_minimo, n.destinatarios, n.activo = (
        datos.nombre, datos.percentil_minimo, datos.destinatarios, datos.activo)
    n.alertas = [NotificacionAlerta(desenlace=a) for a in datos.alertas]
    try:
        s.flush()
    except IntegrityError as e:
        s.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, 'Ya existe una notificación con ese nombre.') from e
    auditar(s, admin, 'configurar_notificacion', str(n.id),
            {'activo': n.activo, 'alertas': len(datos.alertas), 'destinatarios': len(datos.destinatarios)})
    s.commit()
    return _salida(n)


@ruta.delete('/alertas/{notificacion_id}', status_code=status.HTTP_204_NO_CONTENT)
def borrar(notificacion_id: int, s: Session = Depends(sesion), admin: Usuario = Depends(ADMIN)) -> None:
    n = s.get(NotificacionConfig, notificacion_id)
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'No existe esa notificación.')
    auditar(s, admin, 'borrar_notificacion', str(n.id), {'nombre': n.nombre})
    s.delete(n)
    s.commit()


@ruta.post('/alertas/{notificacion_id}/enviar')
def enviar_ahora(notificacion_id: int, cfg: Configuracion = Depends(configuracion), s: Session = Depends(sesion),
                 admin: Usuario = Depends(ADMIN)) -> dict:
    try:
        r = N.enviar_ahora(db.motor(), notificacion_id, cfg)
    except correo.SinServidor as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, SIN_SERVIDOR) from e
    except cifrado.SinLlave as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    auditar(s, admin, 'enviar_notificacion', str(notificacion_id), r)
    s.commit()
    return r


@ruta.get('/historial')
def historial(pagina: int = Query(1, ge=1), tamano: int = Query(50, ge=1, le=200), s: Session = Depends(sesion),
              _: Usuario = Depends(ADMIN)) -> dict:
    total = s.execute(text('SELECT count(*) FROM app.notificaciones')).scalar_one()
    filas = s.execute(text("""
        SELECT n.id, n.destinatario, n.estado, n.error, n.enviado_en, r.sujeto, r.desenlace, r.percentil, r.corrida_id,
               c.nombre AS notificacion
        FROM app.notificaciones n JOIN resultados.riesgos r ON r.id = n.riesgo_id
        LEFT JOIN app.notificaciones_config c ON c.id = n.notificacion_config_id
        ORDER BY n.enviado_en DESC, n.id DESC LIMIT :lim OFFSET :off"""),
        {'lim': tamano, 'off': (pagina - 1) * tamano})
    return {'total': total, 'pagina': pagina, 'tamano': tamano, 'items': [dict(f._mapping) for f in filas]}
