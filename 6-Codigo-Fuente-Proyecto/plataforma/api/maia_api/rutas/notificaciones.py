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
from maia_comun.modelos_db import (
    PERCENTIL_ALTO,
    PERCENTIL_MUY_ALTO,
    ConfigNotificacion,
    ConfigSmtp,
    NotificacionAlerta,
    NotificacionConfig,
    Usuario,
)

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
        correo.enviar(smtp, [datos.destinatario], f'[{N.NOMBRE_PLATAFORMA}] Correo de prueba',
                      f'Si recibe este correo, las notificaciones de {N.NOMBRE_PLATAFORMA} están bien configuradas.')
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


# Las filas guardadas (una por niño y destinatario) con la corrida, el niño y el nivel de su riesgo: de aquí sale cada registro
_FILAS_AVISOS = """
    SELECT n.notificacion_config_id AS config_id, r.corrida_id, n.destinatario, n.estado, n.error, n.enviado_en,
           r.sujeto, r.desenlace, r.percentil
    FROM app.notificaciones n JOIN resultados.riesgos r ON r.id = n.riesgo_id"""


@ruta.get('/historial')
def historial(pagina: int = Query(1, ge=1), tamano: int = Query(50, ge=1, le=200), s: Session = Depends(sesion),
              _: Usuario = Depends(ADMIN)) -> dict:
    """«Avisos enviados»: un registro por notificación y actualización de resultados (corrida), el más reciente primero.
    Cada registro trae todos sus destinatarios con su estado, cuántos niños distintos fueron, cuántos de cada nivel de
    riesgo (el de su riesgo más alto en ese aviso), el desglose por alerta y un estado: ``enviado`` si llegó a todos los
    correos, ``parcial`` si alguno falló y ``error`` si fallaron todos. ``total`` cuenta registros, no filas guardadas.
    Una notificación eliminada conserva sus registros, sin nombre."""
    total = s.execute(text(f'SELECT count(*) FROM (SELECT 1 FROM ({_FILAS_AVISOS}) f GROUP BY config_id, corrida_id) g')
                      ).scalar_one()
    grupos = s.execute(text(f"""
        SELECT f.config_id, f.corrida_id, max(f.enviado_en) AS enviado_en, count(DISTINCT f.sujeto) AS ninos,
               max(c.nombre) AS notificacion
        FROM ({_FILAS_AVISOS}) f LEFT JOIN app.notificaciones_config c ON c.id = f.config_id
        GROUP BY f.config_id, f.corrida_id
        ORDER BY max(f.enviado_en) DESC, f.corrida_id DESC, f.config_id DESC NULLS LAST
        LIMIT :lim OFFSET :off"""), {'lim': tamano, 'off': (pagina - 1) * tamano}).all()
    if not grupos:
        return {'total': total, 'pagina': pagina, 'tamano': tamano, 'items': []}
    # el detalle de los registros de la página se agrega en la base: un aviso puede tener miles de filas
    de_la_pagina = {'corridas': sorted({g.corrida_id for g in grupos})}
    filtro = f'FROM ({_FILAS_AVISOS}) f WHERE f.corrida_id = ANY(:corridas)'
    niveles = {(f.config_id, f.corrida_id): {'muy_alto': f.muy_alto, 'alto': f.alto, 'otros': f.otros}
               for f in s.execute(text(f"""
        SELECT config_id, corrida_id, count(*) FILTER (WHERE p >= :muy) AS muy_alto,
               count(*) FILTER (WHERE p >= :alto AND p < :muy) AS alto, count(*) FILTER (WHERE p < :alto) AS otros
        FROM (SELECT f.config_id, f.corrida_id, f.sujeto, max(f.percentil) AS p {filtro} GROUP BY 1, 2, 3) x
        GROUP BY config_id, corrida_id"""), {**de_la_pagina, 'muy': PERCENTIL_MUY_ALTO, 'alto': PERCENTIL_ALTO})}
    alertas: dict[tuple, list[dict]] = {}
    for f in s.execute(text(f"""
            SELECT f.config_id, f.corrida_id, f.desenlace, count(DISTINCT f.sujeto) AS ninos {filtro}
            GROUP BY 1, 2, 3 ORDER BY count(DISTINCT f.sujeto) DESC, f.desenlace"""), de_la_pagina):
        alertas.setdefault((f.config_id, f.corrida_id), []).append({'desenlace': f.desenlace, 'ninos': f.ninos})
    destinatarios: dict[tuple, list[dict]] = {}
    for f in s.execute(text(f"""
            SELECT f.config_id, f.corrida_id, f.destinatario, bool_and(f.estado = 'enviado') AS enviado,
                   (array_agg(f.error ORDER BY f.enviado_en DESC) FILTER (WHERE f.estado = 'error'))[1] AS error {filtro}
            GROUP BY 1, 2, 3 ORDER BY f.destinatario"""), de_la_pagina):
        destinatarios.setdefault((f.config_id, f.corrida_id), []).append(
            {'correo': f.destinatario, 'estado': 'enviado' if f.enviado else 'error', 'error': None if f.enviado else f.error})

    def registro(g) -> dict:
        llave = (g.config_id, g.corrida_id)
        correos = destinatarios.get(llave, [])
        fallaron = sum(d['estado'] == 'error' for d in correos)
        return {'notificacion_id': g.config_id, 'notificacion': g.notificacion, 'corrida_id': g.corrida_id,
                'enviado_en': g.enviado_en, 'ninos': g.ninos, 'riesgo': niveles.get(llave, {'muy_alto': 0, 'alto': 0, 'otros': 0}),
                'alertas': alertas.get(llave, []), 'destinatarios': correos,
                'estado': 'enviado' if fallaron == 0 else 'error' if fallaron == len(correos) else 'parcial'}
    return {'total': total, 'pagina': pagina, 'tamano': tamano, 'items': [registro(g) for g in grupos]}
