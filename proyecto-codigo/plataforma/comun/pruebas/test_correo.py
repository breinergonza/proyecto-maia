import pytest

from maia_comun import correo
from maia_comun.config import Configuracion
from maia_comun.modelos_db import ConfigSmtp

CFG = Configuracion(maia_cifrado_clave='k' * 40)


def test_sin_servidor_configurado_avisa(sesion_db):
    with pytest.raises(correo.SinServidor, match='Configure el servidor de correo'):
        correo.cargar(sesion_db, CFG)


def test_guardar_cifra_la_clave_y_cargar_la_devuelve(sesion_db):
    correo.guardar(sesion_db, dict(host='smtp.maia.prueba', puerto=587, usuario='u', remitente='a@maia.prueba', tls=True),
                   clave='secreta', usuario_id=None, cfg=CFG)
    assert 'secreta' not in sesion_db.get(ConfigSmtp, 1).clave_cifrada
    smtp = correo.cargar(sesion_db, CFG)
    assert (smtp.host, smtp.puerto, smtp.clave, smtp.tls) == ('smtp.maia.prueba', 587, 'secreta', True)


def test_clave_none_conserva_la_anterior_y_cadena_vacia_la_borra(sesion_db):
    base = dict(host='h', puerto=25, usuario=None, remitente='a@maia.prueba', tls=False)
    correo.guardar(sesion_db, base, clave='una', usuario_id=None, cfg=CFG)
    correo.guardar(sesion_db, base, clave=None, usuario_id=None, cfg=CFG)
    assert correo.cargar(sesion_db, CFG).clave == 'una'
    correo.guardar(sesion_db, base, clave='', usuario_id=None, cfg=CFG)
    assert correo.cargar(sesion_db, CFG).clave is None


def test_enviar_lleva_adjuntos(servidor_smtp):
    puerto, buzon = servidor_smtp
    smtp = correo.Smtp('127.0.0.1', puerto, None, None, 'alertas@maia.prueba', False)
    correo.enviar(smtp, ['x@maia.prueba'], 'Asunto', 'texto', '<p>html</p>',
                  adjuntos=[('riesgo.xlsx', b'PK-datos', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')])
    assert len(buzon.mensajes) == 1
    assert [p.get_filename() for p in buzon.mensajes[0].iter_attachments()] == ['riesgo.xlsx']
