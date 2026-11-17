"""Piezas de la administración de ejecuciones: calendario cron, cifrado de la clave, hiperparámetros ajustables y la
cola de ejecuciones (esta última contra Postgres real)."""
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from maia_comun import calendario as CAL
from maia_comun import cifrado
from maia_comun import conexion_origen as CO
from maia_comun import ejecuciones as EJ
from maia_comun import hiperparametros as HP
from maia_comun.config import Configuracion
from maia_comun.modelos_db import ConexionOrigen, Ejecucion, Programacion

BOG = ZoneInfo('America/Bogota')


# ====================================================================== calendario

def test_cron_semestral_y_sus_proximas_fechas():
    c = CAL.Cron.leer('0 2 1 1,7 *')
    t = datetime(2026, 10, 28, 9, 0, tzinfo=BOG)
    assert c.siguiente(t) == datetime(2027, 1, 1, 2, 0, tzinfo=BOG)
    assert c.siguiente(datetime(2027, 1, 1, 2, 0, tzinfo=BOG)) == datetime(2027, 7, 1, 2, 0, tzinfo=BOG)
    assert CAL.describir('0 2 1 1,7 *') == 'El día 1 de enero y julio, a las 02:00'


def test_cron_listas_rangos_pasos_y_domingo():
    c = CAL.Cron.leer('*/15 8-10 * * 1-5')
    assert c.minutos == {0, 15, 30, 45} and c.horas == {8, 9, 10} and c.semana == {1, 2, 3, 4, 5}
    sabado = datetime(2026, 10, 31, 12, 0, tzinfo=BOG)
    assert c.siguiente(sabado) == datetime(2026, 11, 2, 8, 0, tzinfo=BOG)     # el lunes
    assert CAL.Cron.leer('0 3 * * 7').semana == {0}
    assert CAL.describir('30 4 * * 0') == 'Los domingo, a las 04:30'


def test_cron_dia_del_mes_o_de_la_semana():
    c = CAL.Cron.leer('0 6 15 * 1')   # el 15 o cualquier lunes, como cron
    assert c.siguiente(datetime(2026, 10, 28, 7, 0, tzinfo=BOG)) == datetime(2026, 11, 2, 6, 0, tzinfo=BOG)
    assert c.siguiente(datetime(2026, 11, 10, 7, 0, tzinfo=BOG)) == datetime(2026, 11, 15, 6, 0, tzinfo=BOG)


@pytest.mark.parametrize('texto', ['', '0 2 * *', '61 2 * * *', '0 25 * * *', '0 2 0 * *', '0 2 * 13 *', 'a b c d e',
                                   '0 2 * * */0', '0 2 31 2 *'])
def test_cron_invalido(texto):
    with pytest.raises(CAL.CronInvalido):
        CAL.Cron.leer(texto).siguiente(datetime(2026, 1, 1, tzinfo=UTC))


def test_proxima_respeta_la_zona():
    p = CAL.proxima('0 2 * * *', datetime(2026, 10, 28, 6, 30, tzinfo=UTC), 'America/Bogota')   # 01:30 en Bogotá
    assert p == datetime(2026, 10, 28, 2, 0, tzinfo=BOG) and p.astimezone(UTC).hour == 7
    with pytest.raises(CAL.CronInvalido):
        CAL.zona('Marte/Olympus')


# ====================================================================== cifrado

def test_cifrado_ida_y_vuelta_y_sin_llave():
    cfg = Configuracion(_env_file=None, maia_cifrado_clave='k' * 40)
    token = cifrado.cifrar('clave-secreta', cfg)
    assert 'clave-secreta' not in token and cifrado.descifrar(token, cfg) == 'clave-secreta'
    with pytest.raises(cifrado.SinLlave, match='cambió'):
        cifrado.descifrar(token, Configuracion(_env_file=None, maia_cifrado_clave='otra' * 10))
    for flojo in (None, 'corta', 'cambiar'):
        cfg_flojo = Configuracion(_env_file=None, maia_cifrado_clave=flojo)
        assert not cifrado.disponible(cfg_flojo)
        with pytest.raises(cifrado.SinLlave):
            cifrado.cifrar('x', cfg_flojo)


# ====================================================================== hiperparámetros

def test_hiperparametros_por_defecto_son_los_del_nucleo():
    from anomalias import modelo as MA
    d = HP.por_defecto('anomalias')
    assert d['rondas'] == MA.Config().rondas and d['tasa'] == MA.Config().tasa and 'alpha' in d
    assert set(HP.por_defecto('clinico')) == {c.nombre for c in HP.CAMPOS['clinico']}


def test_hiperparametros_se_validan():
    assert HP.validar('clinico', {'rondas': '800', 'tasa': 0.03, 'hojas': None, 'semilla': ''}) == \
        {'rondas': 800, 'tasa': 0.03}
    for malo, texto in (({'rondas': 2.5}, 'entero'), ({'tasa': 2}, 'entre'), ({'hilos': 4}, 'no es un hiperparámetro'),
                        ({'rondas': 'mucho'}, 'no es un número')):
        with pytest.raises(ValueError, match=texto):
            HP.validar('clinico', malo)
    from anomalias import modelo as MA
    cfg = HP.aplicar(MA.Config(dispositivo='cpu'), {'rondas': 50, 'alpha': 0.002})
    assert cfg.rondas == 50 and cfg.alpha == 0.002 and cfg.dispositivo == 'cpu'



def test_un_valor_igual_al_del_nucleo_no_es_un_ajuste():
    """Vacío y el valor del núcleo son lo mismo: guardarlo no cuenta como ajuste (ni en la insignia ni en MLflow)."""
    from anomalias import modelo as MA
    assert HP.validar('anomalias', {'alpha': MA.Config().alpha, 'rondas': 300, 'tasa': 0.1}) == {'tasa': 0.1}
    assert HP.ajustes('anomalias', {'alpha': MA.Config().alpha, 'z_alerta': 3.5}) == {}
    assert HP.ajustes('anomalias', {'alpha': 0.002}) == {'alpha': 0.002}


def test_la_meta_de_falsas_alertas_dice_su_escala():
    alpha = next(c for c in HP.CAMPOS['anomalias'] if c.nombre == 'alpha')
    assert alpha.escala == 'por_mil'
    assert all(c.escala is None for c in HP.CAMPOS['anomalias'] + HP.CAMPOS['clinico'] if c.nombre != 'alpha')

# ====================================================================== parámetros de una programación

def test_parametros_de_programacion_y_argumentos():
    assert EJ.validar_parametros('kmc', {'anio_desde': '2015', 'anio_hasta': None, 'ventana_meses': 24}) == \
        {'anio_desde': 2015, 'ventana_meses': 24}
    for malo in ({'otra': 1}, {'anio_desde': 2020, 'anio_hasta': 2010}, {'ventana_meses': 0}):
        with pytest.raises(ValueError):
            EJ.validar_parametros('kmc', malo)
    with pytest.raises(ValueError, match='solo aplican'):
        EJ.validar_parametros('simulado', {'anio_desde': 2015})
    e = Ejecucion(fuente='kmc', parametros={'anio_desde': 2015, 'ventana_meses': 6, 'silencio': True,
                                            'solo_si_nuevo': True})
    e.origen = 'programada'
    assert EJ.argumentos_corrida(e, hoy=date(2026, 3, 31)) == [
        'corrida', '--fuente', 'kmc', '--usar', 'produccion', '--silencio', '--solo-si-nuevo', '--anio-desde', '2015',
        '--desde-visita', '2025-09-28']
    # la pedida a mano no entrena: calcula los riesgos con los modelos aprobados
    assert EJ.argumentos_corrida(Ejecucion(fuente='simulado', origen='manual', parametros={'solo_si_nuevo': True})) == \
        ['corrida', '--fuente', 'simulado', '--usar', 'produccion', '--sin-entrenar', '--sin-extraer']


# ====================================================================== cola y conexión (Postgres)

@pytest.fixture
def sesion_db(url_db):
    motor = create_engine(url_db)
    with Session(motor) as s:
        yield s
        s.rollback()
        for t in (Ejecucion, Programacion, ConexionOrigen):
            s.execute(delete(t))
        s.commit()


@pytest.mark.integracion
def test_programacion_vencida_se_encola_una_vez(sesion_db):
    s = sesion_db
    p = Programacion(nombre='semestral', fuente='kmc', cron='0 2 1 1,7 *', zona='America/Bogota',
                     parametros={'anio_desde': 2015}, solo_si_nuevo=True, silencio=False, activo=True)
    EJ.recalcular(p, datetime(2026, 12, 31, 12, tzinfo=UTC))
    assert p.proxima == datetime(2027, 1, 1, 2, tzinfo=BOG)
    s.add(p)
    s.commit()
    assert EJ.vencer(s, datetime(2027, 1, 1, 6, tzinfo=UTC)) == []           # aún no (01:00 en Bogotá)
    nuevas = EJ.vencer(s, datetime(2027, 1, 1, 8, tzinfo=UTC))
    assert len(nuevas) == 1 and nuevas[0].origen == 'programada'
    assert nuevas[0].parametros == {'anio_desde': 2015, 'silencio': False, 'solo_si_nuevo': True}
    assert p.proxima == datetime(2027, 7, 1, 2, tzinfo=BOG) and p.ultima is not None
    s.commit()
    p.proxima = datetime(2027, 1, 1, tzinfo=UTC)                              # vencida otra vez, la anterior pendiente
    s.commit()
    assert EJ.vencer(s, datetime(2027, 1, 2, tzinfo=UTC)) == []
    s.commit()
    # tomar: una sola en curso a la vez
    e = EJ.tomar(s)
    s.commit()
    assert e.estado == 'en_curso' and e.iniciada is not None
    EJ.encolar(s, 'corrida', 'kmc', 'manual')
    s.commit()
    assert EJ.tomar(s) is None
    EJ.terminar(s, e.id, True, 'listo', {'corrida': 3}, ['a', 'b'])
    s.commit()
    s.refresh(e)
    assert (e.estado, e.mensaje, e.resultado, e.registro) == ('ok', 'listo', {'corrida': 3}, 'a\nb')
    siguiente = EJ.tomar(s)
    s.commit()
    assert siguiente is not None and siguiente.id != e.id
    assert EJ.cerrar_interrumpidas(s) == 1
    s.commit()
    s.refresh(siguiente)
    assert siguiente.estado == 'error' and 'reinició' in siguiente.mensaje


@pytest.mark.integracion
def test_conexion_guardada_con_clave_cifrada(sesion_db, servidor_pg):
    from sqlalchemy.engine import make_url
    s = sesion_db
    cfg = Configuracion(_env_file=None, maia_cifrado_clave='c' * 40, kmc_pw=None)
    assert CO.datos_de(None, cfg).host == cfg.kmc_host and CO.clave(None, cfg) is None
    u = make_url(servidor_pg)
    datos = CO.Datos(u.host, u.port or 5432, 'postgres', u.username, 'information_schema', 'disable', 5)
    CO.guardar(s, datos, u.password, None, cfg=cfg)
    s.commit()
    c = CO.guardada(s)
    assert c.clave_cifrada and u.password not in c.clave_cifrada
    assert CO.clave(c, cfg) == u.password
    env = CO.entorno(CO.datos_de(c, cfg), CO.clave(c, cfg))
    assert env['KMC_HOST'] == u.host and env['KMC_PW'] == u.password and env['KMC_ESQUEMA'] == 'information_schema'
    r = CO.probar(CO.datos_de(c, cfg), CO.clave(c, cfg))
    assert 'tables' in r['tablas'] and r['version_servidor']
    CO.guardar(s, datos, None, None, cfg=cfg)                                  # sin clave nueva: conserva la guardada
    assert CO.clave(CO.guardada(s), cfg) == u.password
    CO.guardar(s, datos, None, None, borrar_clave=True, cfg=cfg)
    assert CO.guardada(s).clave_cifrada is None
    with pytest.raises(ValueError, match='sslmode'):
        CO.guardar(s, CO.Datos('h', 1, 'b', 'u', 'e', 'nada', 5), None, None, cfg=cfg)
