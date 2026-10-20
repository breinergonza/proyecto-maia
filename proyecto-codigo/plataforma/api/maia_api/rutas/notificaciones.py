"""Notificaciones por correo ante riesgo alto: configuración por desenlace, historial y correo de prueba."""
from __future__ import annotations

import smtplib

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from maia_api.dependencias import ADMIN, auditar, configuracion, sesion
from maia_api.esquemas import ConfigNotificacionEntrada, PruebaCorreo
from maia_comun import notificaciones as N
from maia_comun.config import Configuracion
from maia_comun.modelos_db import ConfigNotificacion, Usuario

ruta = APIRouter(prefix='/notificaciones', tags=['notificaciones'])


def _salida(c: ConfigNotificacion) -> dict:
    return {'desenlace': c.desenlace, 'nombre': c.nombre, 'percentil_minimo': c.percentil_minimo,
            'destinatarios': list(c.destinatarios or []), 'activo': c.activo}


@ruta.get('/config')
def config(s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> list[dict]:
    return [_salida(c) for c in s.scalars(select(ConfigNotificacion).order_by(ConfigNotificacion.nombre))]


@ruta.put('/config/{desenlace}')
def guardar(desenlace: str, datos: ConfigNotificacionEntrada, s: Session = Depends(sesion),
            admin: Usuario = Depends(ADMIN)) -> dict:
    if datos.desenlace != desenlace:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, 'El desenlace del cuerpo no coincide con la ruta.')
    if datos.activo and not datos.destinatarios:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, 'Para activar, agregue al menos un destinatario.')
    c = s.get(ConfigNotificacion, desenlace)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Ese desenlace no está en el paquete activo.')
    c.percentil_minimo, c.destinatarios, c.activo = datos.percentil_minimo, datos.destinatarios, datos.activo
    if datos.nombre:
        c.nombre = datos.nombre
    auditar(s, admin, 'configurar_notificacion', desenlace,
            {'activo': datos.activo, 'percentil_minimo': datos.percentil_minimo, 'destinatarios': len(datos.destinatarios)})
    s.commit()
    return _salida(c)


@ruta.get('/historial')
def historial(pagina: int = Query(1, ge=1), tamano: int = Query(50, ge=1, le=200), s: Session = Depends(sesion),
              _: Usuario = Depends(ADMIN)) -> dict:
    total = s.execute(text('SELECT count(*) FROM app.notificaciones')).scalar_one()
    filas = s.execute(text("""
        SELECT n.id, n.destinatario, n.estado, n.error, n.enviado_en, r.sujeto, r.desenlace, r.percentil, r.corrida_id
        FROM app.notificaciones n JOIN resultados.riesgos r ON r.id = n.riesgo_id
        ORDER BY n.enviado_en DESC, n.id DESC LIMIT :lim OFFSET :off"""),
        {'lim': tamano, 'off': (pagina - 1) * tamano})
    return {'total': total, 'pagina': pagina, 'tamano': tamano, 'items': [dict(f._mapping) for f in filas]}


@ruta.post('/prueba', status_code=status.HTTP_204_NO_CONTENT)
def prueba(datos: PruebaCorreo, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
           admin: Usuario = Depends(ADMIN)) -> None:
    try:
        N.enviar([datos.destinatario], '[MAIA] Correo de prueba',
                 'Si recibe este correo, las notificaciones del Observatorio están bien configuradas.', cfg=cfg)
    except (OSError, smtplib.SMTPException) as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f'No se pudo enviar: {type(e).__name__}: {e}') from e
    auditar(s, admin, 'correo_prueba', None)
    s.commit()
