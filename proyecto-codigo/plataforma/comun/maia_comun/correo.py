"""Servidor de correo (SMTP) guardado en la base y envío con adjuntos. Ya no se lee del entorno."""
from __future__ import annotations

import smtplib
import ssl
import uuid
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy.orm import Session

from maia_comun import cifrado
from maia_comun.config import Configuracion
from maia_comun.modelos_db import ConfigSmtp

Adjunto = tuple[str, bytes, str]   # (nombre de archivo, contenido, tipo MIME)


class SinServidor(RuntimeError):
    """Todavía nadie configuró el servidor de correo."""


@dataclass(frozen=True)
class Smtp:
    host: str
    puerto: int
    usuario: str | None
    clave: str | None
    remitente: str
    tls: bool


def cargar(s: Session, cfg: Configuracion | None = None) -> Smtp:
    fila = s.get(ConfigSmtp, 1)
    if fila is None or not fila.host:
        raise SinServidor('Configure el servidor de correo en Notificaciones › Servidor de correo.')
    clave = cifrado.descifrar(fila.clave_cifrada, cfg) if fila.clave_cifrada else None
    return Smtp(fila.host, fila.puerto, fila.usuario or None, clave, fila.remitente, fila.tls)


def guardar(s: Session, datos: dict, clave: str | None, usuario_id: uuid.UUID | None,
            cfg: Configuracion | None = None) -> ConfigSmtp:
    """``clave`` None conserva la guardada; '' la borra; otro texto la reemplaza (cifrada)."""
    fila = s.get(ConfigSmtp, 1)
    if fila is None:
        fila = ConfigSmtp(id=1)
        s.add(fila)
    fila.host, fila.puerto, fila.remitente, fila.tls = datos['host'], datos['puerto'], datos['remitente'], datos['tls']
    fila.usuario = datos.get('usuario') or None
    if clave is not None:
        fila.clave_cifrada = cifrado.cifrar(clave, cfg) if clave else None
    fila.actualizado_por = usuario_id
    s.flush()
    return fila


def enviar(smtp: Smtp, destinatarios: list[str], asunto: str, texto: str, html: str | None = None,
           adjuntos: list[Adjunto] | tuple[Adjunto, ...] = ()) -> None:
    msg = EmailMessage()
    msg['From'], msg['To'], msg['Subject'] = smtp.remitente, ', '.join(destinatarios), asunto
    msg.set_content(texto)
    if html:
        msg.add_alternative(html, subtype='html')
    for nombre, contenido, mime in adjuntos:
        principal, _, sub = mime.partition('/')
        msg.add_attachment(contenido, maintype=principal, subtype=sub, filename=nombre)
    with smtplib.SMTP(smtp.host, smtp.puerto, timeout=30) as conexion:
        if smtp.tls:
            conexion.starttls(context=ssl.create_default_context())
        if smtp.usuario and smtp.clave:
            conexion.login(smtp.usuario, smtp.clave)
        conexion.send_message(msg)
