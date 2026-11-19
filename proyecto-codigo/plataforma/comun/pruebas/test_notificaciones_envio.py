"""Envío por notificación: varias alertas por correo, grupos distintos, deduplicación y fallo sin servidor."""
from sqlalchemy import select

from maia_comun import notificaciones as N
from maia_comun.modelos_db import Notificacion, NotificacionAlerta, NotificacionConfig


def _notif(s, nombre, alertas, correos, activo=True, minimo=95):
    n = NotificacionConfig(nombre=nombre, destinatarios=correos, activo=activo, percentil_minimo=minimo,
                           alertas=[NotificacionAlerta(desenlace=a) for a in alertas])
    s.add(n)
    s.commit()
    return n


def test_cada_grupo_recibe_solo_sus_alertas(sesion_db, motor, smtp_guardado, corrida_con_riesgos):
    _, buzon = smtp_guardado
    _notif(sesion_db, 'Neonatología', ['a'], ['neo@maia.prueba'])
    _notif(sesion_db, 'Todo', ['a', 'b'], ['jefe@maia.prueba'])
    r = N.enviar_pendientes(motor, corrida_con_riesgos)
    assert r['correos'] == 2 and r['errores'] == 0
    por = {m['To']: m for m in buzon.mensajes}
    assert set(por) == {'neo@maia.prueba', 'jefe@maia.prueba'}
    assert len(list(por['neo@maia.prueba'].iter_attachments())) == 1
    assert '2 niños' in por['neo@maia.prueba']['Subject'] and '3 niños' in por['jefe@maia.prueba']['Subject']


def test_un_correo_en_dos_notificaciones_recibe_cada_nino_una_vez(sesion_db, motor, smtp_guardado, corrida_con_riesgos):
    _, buzon = smtp_guardado
    _notif(sesion_db, 'Uno', ['a'], ['x@maia.prueba'])
    _notif(sesion_db, 'Dos', ['a', 'b'], ['x@maia.prueba'])
    N.enviar_pendientes(motor, corrida_con_riesgos)
    assert len(buzon.mensajes) == 2
    assert '1 niños con riesgo alto: Dos' in buzon.mensajes[1]['Subject']   # solo el niño de 'b'
    N.enviar_pendientes(motor, corrida_con_riesgos)                         # idempotente
    assert len(buzon.mensajes) == 2


def test_sin_servidor_no_rompe_la_corrida(sesion_db, motor, corrida_con_riesgos):
    _notif(sesion_db, 'Uno', ['a'], ['x@maia.prueba'])
    r = N.enviar_pendientes(motor, corrida_con_riesgos)
    assert r['correos'] == 0 and r['sin_servidor'] is True


def test_enviar_ahora_manda_todos_aunque_ya_se_avisaron(sesion_db, motor, smtp_guardado, corrida_con_riesgos):
    _, buzon = smtp_guardado
    n = _notif(sesion_db, 'Uno', ['a'], ['x@maia.prueba'])
    N.enviar_pendientes(motor, corrida_con_riesgos)
    r = N.enviar_ahora(motor, n.id)
    assert r['correos'] == 1 and r['ninos'] == 2 and len(buzon.mensajes) == 2


def test_el_historial_guarda_de_que_notificacion_salio(sesion_db, motor, smtp_guardado, corrida_con_riesgos):
    n = _notif(sesion_db, 'Uno', ['a'], ['x@maia.prueba'])
    N.enviar_pendientes(motor, corrida_con_riesgos)
    assert set(sesion_db.scalars(select(Notificacion.notificacion_config_id))) == {n.id}


def test_clave_que_no_se_puede_descifrar_no_rompe_la_corrida(sesion_db, motor, servidor_smtp, corrida_con_riesgos):
    from maia_comun import correo
    from maia_comun.config import Configuracion
    puerto, _ = servidor_smtp
    cfg_a = Configuracion(maia_cifrado_clave='a' * 40)
    correo.guardar(sesion_db, dict(host='127.0.0.1', puerto=puerto, usuario='u', remitente='alertas@maia.prueba', tls=False),
                   clave='secreta', usuario_id=None, cfg=cfg_a)
    sesion_db.commit()
    _notif(sesion_db, 'Uno', ['a'], ['x@maia.prueba'])
    r = N.enviar_pendientes(motor, corrida_con_riesgos, Configuracion(maia_cifrado_clave='b' * 40))
    assert r['correos'] == 0 and r['sin_servidor'] is True and r['error']


def test_un_envio_fallido_no_degrada_lo_ya_enviado(sesion_db, motor, smtp_guardado, corrida_con_riesgos):
    from maia_comun.modelos_db import ConfigSmtp
    _, buzon = smtp_guardado
    n = _notif(sesion_db, 'Uno', ['a'], ['x@maia.prueba'])
    assert N.enviar_pendientes(motor, corrida_con_riesgos)['correos'] == 1
    sesion_db.get(ConfigSmtp, 1).puerto = 1   # servidor caído
    sesion_db.commit()
    r = N.enviar_ahora(motor, n.id)
    assert r['errores'] == 1 and r['correos'] == 0
    sesion_db.expire_all()
    assert set(sesion_db.scalars(select(Notificacion.estado))) == {'enviado'}
    antes = len(buzon.mensajes)
    assert N.enviar_pendientes(motor, corrida_con_riesgos)['correos'] == 0 and len(buzon.mensajes) == antes


def test_el_excel_neutraliza_formulas():
    from io import BytesIO
    from types import SimpleNamespace

    from openpyxl import load_workbook
    f = SimpleNamespace(sujeto='=1+1', momento='@x', desenlace='-y', percentil=97)
    hoja = load_workbook(BytesIO(N.libro_excel([f], {}, 'https://m.prueba'))).active
    assert [c.value for c in hoja[2]][:4] == ["'=1+1", 'Sin clasificar', "'@x", "'-y"]
