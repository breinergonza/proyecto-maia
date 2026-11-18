"""Correo ante riesgo alto (sección 4.12). Cada notificación (``app.notificaciones_config``) junta una o varias alertas
y su propia lista de correos. Tras una corrida que no es en silencio, cada destinatario recibe un correo por notificación
con un resumen y un Excel adjunto de los niños de esas alertas cuyo percentil llega al mínimo. Idempotente por
(riesgo, destinatario): un niño no se repite aunque el correo esté en varias notificaciones. El correo y el Excel llevan
solo el código seudonimizado, la alerta, la visita, el perfil (categorías) y un enlace; nunca valores clínicos.
El servidor SMTP sale de ``app.config_smtp`` (``maia_comun.correo``).
"""
from __future__ import annotations

import smtplib
from html import escape
from io import BytesIO
from urllib.parse import urlencode

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy import Engine, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from maia_comun import cifrado, correo
from maia_comun.config import Configuracion, obtener
from maia_comun.modelos_db import PERCENTIL_MUY_ALTO, Corrida, Notificacion, NotificacionConfig, Riesgo
from maia_comun.perfiles import VARIABLE_LUBCHENCO, perfil_provisional

LOTE = 5000   # filas por INSERT del historial
NOMBRE_EXCEL = 'maia-riesgo-alto.xlsx'
PIE_CORREO = 'Apoyo a la decisión, no diagnóstico. El riesgo ordena a los niños; la decisión es del equipo clínico.'
# Identidad de la plataforma (web/src/estilos.css y components/Marco.tsx), repetida en línea porque el correo no carga CSS
COLOR_TEAL, COLOR_TEAL_MEDIO, COLOR_TEAL_TINTE = '#1f4e52', '#2e6b70', '#e8f1f0'
COLOR_CORAL_TINTE, COLOR_CORAL_HONDO = '#fbeae5', '#a8472a'
COLOR_OCRE_TINTE, COLOR_OCRE_HONDO = '#f7eed9', '#7a5712'
COLOR_TINTA, COLOR_SALVIA, COLOR_FONDO, COLOR_PAPEL, COLOR_LINEA = '#14262a', '#4d6561', '#f6f8f8', '#ffffff', '#e3e9e8'
FUENTE = "'Atkinson Hyperlegible Next','Atkinson Hyperlegible',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif"
COLUMNAS_EXCEL = ['Código', 'Perfil', 'Visita', 'Alerta', 'Más riesgo que (de cada 10 niños)', 'Nivel', 'Enlace']
MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def cuantos_menos(percentil: float) -> int:
    """De cada 10 niños, cuántos tienen menos riesgo (posición 87 → 8). Es ``cuantosMenos`` de web/src/lib/lenguaje.ts."""
    return max(0, min(9, int(percentil // 10)))


def perfiles_de(s: Session, corte_id: int | None, filas: list[Riesgo]) -> dict[str, dict]:
    """Perfil provisional de cada niño de ``filas`` (con la visita de su riesgo) leído de la base del corte."""
    if corte_id is None or not filas:
        return {}
    codigos = sorted({r.sujeto for r in filas})
    eg = dict(s.execute(text('SELECT sujeto, eg_semanas FROM sevarti.sujetos WHERE corte_id = :c AND sujeto = ANY(:s)'),
                        {'c': corte_id, 's': codigos}).all())
    lub = dict(s.execute(text('SELECT sujeto, valor FROM sevarti.mediciones WHERE corte_id = :c AND variable = :v '
                              'AND sujeto = ANY(:s) AND valor IS NOT NULL'),
                         {'c': corte_id, 'v': VARIABLE_LUBCHENCO, 's': codigos}).all())
    return {c: perfil_provisional(eg.get(c), lub.get(c)) for c in codigos}


def _texto_seguro(v):
    """Un texto que empieza por = + - @ se leería como fórmula en Excel: se antepone un apóstrofo."""
    return f"'{v}" if isinstance(v, str) and v[:1] in ('=', '+', '-', '@') else v


def libro_excel(filas: list, perfiles: dict[str, dict], url: str) -> bytes:
    """Todos los niños de la notificación, sin valores clínicos."""
    libro = Workbook()
    hoja = libro.active
    hoja.title = 'Riesgo alto'
    hoja.append(COLUMNAS_EXCEL)
    for c in hoja[1]:
        c.font = Font(bold=True)
    for r in filas:
        etiqueta = (perfiles.get(r.sujeto) or {}).get('etiqueta_corta') or 'Sin clasificar'
        hoja.append([_texto_seguro(v) for v in (
            r.sujeto, etiqueta, r.momento, r.desenlace, cuantos_menos(r.percentil),
            'Muy alto' if r.percentil >= PERCENTIL_MUY_ALTO else 'Alto', f'{url}/ninos/{r.sujeto}')])
    for letra, ancho in zip('ABCDEFG', (14, 34, 14, 40, 18, 10, 48)):
        hoja.column_dimensions[letra].width = ancho
    hoja.freeze_panes = 'A2'
    salida = BytesIO()
    libro.save(salida)
    return salida.getvalue()


def _resumen_por_alerta(filas: list) -> list[dict]:
    """Por alerta (``desenlace``): clave, niños, cuántos en «Muy alto» y cuántos en «Alto»; de más a menos niños."""
    grupos: dict[str, dict] = {}
    for r in filas:
        g = grupos.setdefault(r.clave, {'clave': r.clave, 'alerta': r.desenlace, 'ninos': 0, 'muy_alto': 0, 'alto': 0})
        g['ninos'] += 1
        g['muy_alto' if r.percentil >= PERCENTIL_MUY_ALTO else 'alto'] += 1
    return sorted(grupos.values(), key=lambda g: (-g['ninos'], g['alerta']))


def _enlace_ninos(url: str, minimo: float, clave: str | None = None) -> str:
    """Lista de niños de la plataforma; con ``clave``, filtrada por esa alerta y el mínimo de la notificación."""
    if clave is None:
        return f'{url}/ninos'
    return f'{url}/ninos?{urlencode({"desenlace": clave, "percentil_min": f"{minimo:g}"})}'


def _plural(n: int, uno: str, varios: str) -> str:
    return f'{n} {uno if n == 1 else varios}'


def _texto_correo(nombre: str, resumen: list[dict], total: int, url: str, minimo: float) -> str:
    lineas = ['Hola,', '',
              f'{_plural(total, "niño con riesgo alto", "niños con riesgo alto")} en {nombre}', '',
              f'Son niños con más riesgo que {cuantos_menos(minimo)} de cada 10 niños del programa.', '']
    for g in resumen:
        lineas.append(f'- {g["alerta"]}: {_plural(g["ninos"], "niño", "niños")} ({g["muy_alto"]} Muy alto, {g["alto"]} Alto)'
                      + (f' · {_enlace_ninos(url, minimo, g["clave"])}' if len(resumen) > 1 else ''))
    lineas += ['', f'Total: {_plural(total, "niño", "niños")} en {_plural(len(resumen), "alerta", "alertas")}.',
               f'El detalle de cada niño va en el Excel adjunto ({NOMBRE_EXCEL}).', '',
               f'Ver niños en la plataforma: {_enlace_ninos(url, minimo, resumen[0]["clave"] if len(resumen) == 1 else None)}',
               '', PIE_CORREO]
    return '\n'.join(lineas)


def _insignia(texto: str, nivel: str) -> str:
    """Insignia «Muy alto» (coral) o «Alto» (ocre), con los colores de la plataforma."""
    fondo, tinta = (COLOR_CORAL_TINTE, COLOR_CORAL_HONDO) if nivel == 'muy_alto' else (COLOR_OCRE_TINTE, COLOR_OCRE_HONDO)
    return (f'<span style="display:inline-block;background:{fondo};color:{tinta};border-radius:999px;padding:2px 10px;'
            f'font-size:13px;font-weight:bold;white-space:nowrap">{escape(texto)}</span>')


def _fila_alerta(g: dict, url: str, minimo: float, con_enlace: bool) -> str:
    celda = f'border-bottom:1px solid {COLOR_LINEA};padding:10px 6px;vertical-align:top;'
    enlace = (f'<br><a href="{escape(_enlace_ninos(url, minimo, g["clave"]))}" '
              f'style="color:{COLOR_TEAL};font-size:13px;text-decoration:underline">Ver estos niños</a>' if con_enlace else '')
    return (f'<tr><td style="{celda}color:{COLOR_TINTA};font-size:15px">{escape(g["alerta"])}{enlace}</td>'
            f'<td align="right" style="{celda}color:{COLOR_TINTA};font-size:15px;font-weight:bold">{g["ninos"]}</td>'
            f'<td align="right" style="{celda}">{_insignia(f"{g["muy_alto"]} Muy alto", "muy_alto")}</td>'
            f'<td align="right" style="{celda}">{_insignia(f"{g["alto"]} Alto", "alto")}</td></tr>')


def _html_correo(nombre: str, resumen: list[dict], total: int, url: str, minimo: float) -> str:
    """Correo con la identidad de la plataforma: tablas anidadas y estilos en línea (sin CSS externo, JS ni imágenes)."""
    unica = resumen[0]['clave'] if len(resumen) == 1 else None
    th = f'padding:6px;font-size:12px;color:{COLOR_SALVIA};border-bottom:2px solid {COLOR_LINEA};font-weight:bold;'
    filas = ''.join(_fila_alerta(g, url, minimo, len(resumen) > 1) for g in resumen)
    titulo = escape(f'{_plural(total, "niño con riesgo alto", "niños con riesgo alto")} en {nombre}')
    return (
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="color-scheme" content="light"><title>Observatorio Canguro</title></head>'
        f'<body style="margin:0;padding:0;background:{COLOR_FONDO};font-family:{FUENTE};color:{COLOR_TINTA}">'
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0">{titulo}</div>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{COLOR_FONDO}">'
        '<tr><td align="center" style="padding:24px 12px">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;'
        f'background:{COLOR_PAPEL};border:1px solid {COLOR_LINEA};border-radius:16px;border-collapse:separate;overflow:hidden">'
        # cabecera de marca
        f'<tr><td style="background:{COLOR_TEAL};padding:18px 24px">'
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
        f'<td width="36" height="36" align="center" valign="middle" style="background:{COLOR_TEAL_MEDIO};border-radius:10px;'
        f'color:#ffffff;font-size:20px;font-weight:bold;line-height:36px" aria-hidden="true">&#8599;</td>'
        '<td style="padding-left:12px;line-height:1.25">'
        '<div style="color:#ffffff;font-size:17px;font-weight:bold">Observatorio Canguro</div>'
        '<div style="color:#d4e3e1;font-size:13px">Alertas cl&iacute;nicas tempranas</div></td></tr></table></td></tr>'
        # contenido
        f'<tr><td style="padding:24px 24px 8px 24px;font-size:15px;line-height:1.5">'
        f'<p style="margin:0 0 12px 0;color:{COLOR_SALVIA}">Hola,</p>'
        f'<h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.25;color:{COLOR_TINTA}">{titulo}</h1>'
        f'<p style="margin:0 0 16px 0;color:{COLOR_SALVIA}">Son ni&ntilde;os con m&aacute;s riesgo que {cuantos_menos(minimo)} '
        'de cada 10 ni&ntilde;os del programa.</p></td></tr>'
        f'<tr><td style="padding:0 24px 8px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'border="0" style="border-collapse:collapse"><tr><th align="left" style="{th}">Alerta</th>'
        f'<th align="right" style="{th}">Ni&ntilde;os</th><th align="right" style="{th}">Muy alto</th>'
        f'<th align="right" style="{th}">Alto</th></tr>{filas}</table></td></tr>'
        f'<tr><td style="padding:12px 24px 0 24px;font-size:15px;line-height:1.5;color:{COLOR_TINTA}">'
        f'<p style="margin:0 0 8px 0"><b>Total:</b> {_plural(total, "ni&ntilde;o", "ni&ntilde;os")} en '
        f'{_plural(len(resumen), "alerta", "alertas")}.</p>'
        f'<p style="margin:0 0 20px 0;color:{COLOR_SALVIA}">El detalle de cada ni&ntilde;o va en el Excel adjunto '
        f'({escape(NOMBRE_EXCEL)}).</p></td></tr>'
        # botón
        '<tr><td align="center" style="padding:0 24px 24px 24px">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:{COLOR_TEAL};'
        f'border-radius:10px"><a href="{escape(_enlace_ninos(url, minimo, unica))}" style="display:inline-block;padding:12px 24px;'
        'color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">Ver ni&ntilde;os en la plataforma</a></td></tr></table></td></tr>'
        # pie
        f'<tr><td style="background:{COLOR_TEAL_TINTE};padding:14px 24px;font-size:13px;line-height:1.5;color:{COLOR_SALVIA}">'
        f'{escape(PIE_CORREO)}</td></tr>'
        '</table></td></tr></table></body></html>')


def _cuerpo(nombre: str, filas: list, url: str, minimo: float) -> tuple[str, str]:
    """(texto, html) del correo: solo el resumen por alerta, sin códigos de niños ni perfiles; el detalle va en el Excel."""
    resumen = _resumen_por_alerta(filas)
    return (_texto_correo(nombre, resumen, len(filas), url, minimo),
            _html_correo(nombre, resumen, len(filas), url, minimo))


def _despachar(s: Session, smtp: correo.Smtp, n: NotificacionConfig, destinatario: str, riesgos: list[Riesgo],
               corte_id: int | None, url: str, resumen: dict) -> None:
    perfiles = perfiles_de(s, corte_id, riesgos)
    texto, html = _cuerpo(n.nombre, riesgos, url, n.percentil_minimo)
    adjunto = (NOMBRE_EXCEL, libro_excel(riesgos, perfiles, url), MIME_XLSX)
    estado, error = 'enviado', None
    try:
        correo.enviar(smtp, [destinatario], f'[MAIA] {len(riesgos)} niños con riesgo alto: {n.nombre}', texto, html, [adjunto])
        resumen['correos'] += 1
        resumen['ninos'] += len(riesgos)
    except (OSError, smtplib.SMTPException, ValueError) as e:   # ValueError: cabeceras inválidas
        estado, error = 'error', f'{type(e).__name__}: {e}'[:1000]
        resumen['errores'] += 1
    for i in range(0, len(riesgos), LOTE):
        q = pg_insert(Notificacion).values([dict(riesgo_id=r.id, destinatario=destinatario, estado=estado, error=error,
                                                 notificacion_config_id=n.id) for r in riesgos[i:i + LOTE]])
        # un envío fallido nunca degrada una fila que ya se había enviado
        s.execute(q.on_conflict_do_update(
            index_elements=['riesgo_id', 'destinatario'],
            set_={'estado': q.excluded.estado, 'error': q.excluded.error, 'enviado_en': q.excluded.enviado_en,
                  'notificacion_config_id': q.excluded.notificacion_config_id},
            where=(Notificacion.estado != 'enviado') if estado == 'error' else None))
    s.commit()


def _riesgos(s: Session, corrida_id: int, n: NotificacionConfig) -> list[Riesgo]:
    claves = [a.desenlace for a in n.alertas]
    if not claves:
        return []
    return list(s.scalars(select(Riesgo).where(
        Riesgo.corrida_id == corrida_id, Riesgo.clave.in_(claves), Riesgo.silencio.is_(False),
        Riesgo.percentil >= n.percentil_minimo).order_by(Riesgo.percentil.desc(), Riesgo.sujeto)))


def enviar_pendientes(motor: Engine, corrida_id: int, cfg: Configuracion | None = None) -> dict:
    """Envía lo que falta de una corrida. Devuelve {'correos', 'ninos', 'errores', 'sin_servidor'}."""
    cfg = cfg or obtener()
    url = cfg.maia_url_publica.rstrip('/')
    resumen = {'correos': 0, 'ninos': 0, 'errores': 0, 'sin_servidor': False}
    with Session(motor, expire_on_commit=False) as s:
        configs = s.scalars(select(NotificacionConfig).where(NotificacionConfig.activo.is_(True))
                            .order_by(NotificacionConfig.id)).all()
        if not configs:
            return resumen
        try:
            smtp = correo.cargar(s, cfg)
        except correo.SinServidor:
            resumen['sin_servidor'] = True
            return resumen
        except cifrado.SinLlave as e:   # la clave guardada no se puede descifrar: no tumba la corrida
            resumen['sin_servidor'] = True
            resumen['error'] = str(e)
            return resumen
        corte_id = s.scalar(select(Corrida.corte_id).where(Corrida.id == corrida_id))
        for n in configs:
            riesgos = _riesgos(s, corrida_id, n)
            if not riesgos:
                continue
            for destinatario in n.destinatarios:
                ya = set(s.scalars(select(Notificacion.riesgo_id).where(
                    Notificacion.destinatario == destinatario, Notificacion.riesgo_id.in_([r.id for r in riesgos]),
                    Notificacion.estado == 'enviado')))
                nuevos = [r for r in riesgos if r.id not in ya]
                if nuevos:
                    _despachar(s, smtp, n, destinatario, nuevos, corte_id, url, resumen)
    return resumen


def enviar_ahora(motor: Engine, notificacion_id: int, cfg: Configuracion | None = None) -> dict:
    """Botón «Enviar ahora»: todos los niños de riesgo alto de la última corrida terminada, aunque ya se hayan avisado.
    Lanza ``correo.SinServidor`` si falta el servidor y ``LookupError`` si no hay notificación o corrida."""
    cfg = cfg or obtener()
    url = cfg.maia_url_publica.rstrip('/')
    resumen = {'correos': 0, 'ninos': 0, 'errores': 0, 'sin_servidor': False}
    with Session(motor, expire_on_commit=False) as s:
        n = s.get(NotificacionConfig, notificacion_id)
        if n is None:
            raise LookupError('No existe esa notificación.')
        smtp = correo.cargar(s, cfg)
        corrida = s.scalar(select(Corrida).where(Corrida.estado == 'ok').order_by(Corrida.id.desc()).limit(1))
        if corrida is None:
            raise LookupError('Todavía no hay resultados para enviar.')
        riesgos = _riesgos(s, corrida.id, n)
        if riesgos:
            for destinatario in n.destinatarios:
                _despachar(s, smtp, n, destinatario, riesgos, corrida.corte_id, url, resumen)
    return resumen
