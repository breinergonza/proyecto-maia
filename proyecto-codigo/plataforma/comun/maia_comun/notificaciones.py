"""Correo ante riesgo alto (sección 4.12). SMTP genérico; en local, Mailpit.

Regla: tras una corrida que no es en silencio, por cada desenlace activo en ``app.config_notificaciones``, un correo
por destinatario con los niños cuyo percentil es mayor o igual al mínimo configurado. Idempotente por
(riesgo, destinatario). El correo lleva solo el código seudonimizado, el desenlace, la posición y un enlace;
nunca valores clínicos.
"""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from sqlalchemy import Engine, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from maia_comun.config import Configuracion, obtener
from maia_comun.modelos_db import ConfigNotificacion, Notificacion, Riesgo

MAX_NINOS_POR_CORREO = 200


def enviar(destinatarios: list[str], asunto: str, texto: str, html: str | None = None,
           cfg: Configuracion | None = None) -> None:
    cfg = cfg or obtener()
    msg = EmailMessage()
    msg['From'] = cfg.smtp_remitente
    msg['To'] = ', '.join(destinatarios)
    msg['Subject'] = asunto
    msg.set_content(texto)
    if html:
        msg.add_alternative(html, subtype='html')
    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=30) as smtp:
        if cfg.smtp_tls:
            smtp.starttls(context=ssl.create_default_context())
        if cfg.smtp_usuario and cfg.smtp_clave:
            smtp.login(cfg.smtp_usuario, cfg.smtp_clave)
        smtp.send_message(msg)


def _cuerpo(nombre: str, filas: list[Riesgo], url: str, minimo: float) -> tuple[str, str]:
    # en palabras del equipo clínico: la posición (percentil) se dice como «más riesgo que N de cada 100 niños»
    titulo = f'Niños con más riesgo que {minimo:g} de cada 100 niños del programa en "{nombre}":'
    lineas = [titulo, '']
    lineas += [f'- {r.sujeto}: más riesgo que {r.percentil:.0f} de cada 100 niños · {url}/ninos/{r.sujeto}' for r in filas]
    lineas += ['', 'Apoyo a la decisión, no diagnóstico. El riesgo ordena a los niños; la decisión es del equipo clínico.']
    filas_html = ''.join(
        f'<tr><td><a href="{escape(url)}/ninos/{escape(r.sujeto)}">{escape(r.sujeto)}</a></td>'
        f'<td style="text-align:right">{r.percentil:.0f} de cada 100</td></tr>' for r in filas)
    html = (f'<p>Niños con más riesgo que {minimo:g} de cada 100 niños del programa en <b>{escape(nombre)}</b>:</p>'
            f'<table cellpadding="4" style="border-collapse:collapse"><tr><th align="left">Niño</th>'
            f'<th align="right">Tiene más riesgo que</th></tr>{filas_html}</table>'
            '<p style="color:#555">Apoyo a la decisión, no diagnóstico. El riesgo ordena a los niños; '
            'la decisión es del equipo clínico.</p>')
    return '\n'.join(lineas), html


def enviar_pendientes(motor: Engine, corrida_id: int, cfg: Configuracion | None = None) -> dict:
    """Envía lo que falta de una corrida. Devuelve {'correos': n, 'ninos': n, 'errores': n}."""
    cfg = cfg or obtener()
    url = cfg.maia_url_publica.rstrip('/')
    resumen = {'correos': 0, 'ninos': 0, 'errores': 0}
    with Session(motor) as s:
        configs = s.scalars(select(ConfigNotificacion).where(ConfigNotificacion.activo.is_(True))).all()
        for c in configs:
            riesgos = s.scalars(select(Riesgo).where(Riesgo.corrida_id == corrida_id, Riesgo.clave == c.desenlace,
                                                     Riesgo.silencio.is_(False), Riesgo.percentil >= c.percentil_minimo)
                                .order_by(Riesgo.percentil.desc())).all()
            if not riesgos:
                continue
            for destinatario in c.destinatarios:
                ya = set(s.scalars(select(Notificacion.riesgo_id).where(
                    Notificacion.destinatario == destinatario,
                    Notificacion.riesgo_id.in_([r.id for r in riesgos]), Notificacion.estado == 'enviado')))
                nuevos = [r for r in riesgos if r.id not in ya][:MAX_NINOS_POR_CORREO]
                if not nuevos:
                    continue
                nombre = c.nombre or nuevos[0].desenlace
                texto, html = _cuerpo(nombre, nuevos, url, c.percentil_minimo)
                estado, error = 'enviado', None
                try:
                    enviar([destinatario], f'[MAIA] {len(nuevos)} niños con riesgo alto: {nombre}', texto, html, cfg)
                    resumen['correos'] += 1
                    resumen['ninos'] += len(nuevos)
                except (OSError, smtplib.SMTPException) as e:
                    estado, error = 'error', f'{type(e).__name__}: {e}'[:1000]
                    resumen['errores'] += 1
                filas = [dict(riesgo_id=r.id, destinatario=destinatario, estado=estado, error=error) for r in nuevos]
                q = pg_insert(Notificacion).values(filas)
                s.execute(q.on_conflict_do_update(index_elements=['riesgo_id', 'destinatario'],
                                                  set_={'estado': q.excluded.estado, 'error': q.excluded.error,
                                                        'enviado_en': q.excluded.enviado_en}))
                s.commit()
    return resumen
