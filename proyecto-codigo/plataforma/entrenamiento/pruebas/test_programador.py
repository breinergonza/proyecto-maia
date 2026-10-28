"""El programador contra Postgres real, con un lanzador falso en lugar de ``maia`` (sin entrenar de verdad): encola lo
vencido, pasa la conexión guardada como ``KMC_*`` solo al proceso, lee el resultado y deja el error a la vista."""
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from maia_comun import conexion_origen as CO
from maia_comun import ejecuciones as EJ
from maia_comun.config import Configuracion
from maia_comun.modelos_db import ConexionOrigen, Ejecucion, Programacion
from maia_entrenamiento.programador import Programador

pytestmark = pytest.mark.integracion

SALIDA_CORRIDA = """=== 2. Cargar el corte en Postgres ===
Corte 2026-06-30 (id 7).
Registrado en MLflow: maia-anomalias v4 · maia-clinico v9 (alias candidato)
Corrida 12 terminada en 3 min. Excel en /datos/salidas"""


class Lanzador:
    def __init__(self, salidas: dict[str, tuple[int, str]]):
        self.salidas, self.llamadas = salidas, []

    def __call__(self, args, env, al_linea):
        self.llamadas.append((args, env))
        codigo, texto = self.salidas.get(args[0], (0, ''))
        for linea in texto.splitlines():
            al_linea(linea)
        return codigo


@pytest.fixture
def motor(url_db):
    m = create_engine(url_db)
    yield m
    with Session(m) as s:
        for t in (Ejecucion, Programacion, ConexionOrigen):
            s.execute(delete(t))
        s.commit()


CFG = Configuracion(_env_file=None, maia_cifrado_clave='p' * 40, kmc_pw=None)


def _ultima(motor) -> Ejecucion:
    with Session(motor) as s:
        return s.scalars(select(Ejecucion).order_by(Ejecucion.id.desc())).first()


def test_programacion_vencida_corre_con_la_conexion_guardada(motor, monkeypatch):
    monkeypatch.setenv('KMC_PW', 'no-debe-pasar')
    with Session(motor) as s:
        CO.guardar(s, CO.Datos('db.entidad', 6543, 'origen', 'lector', 'consumo', 'require', 10), 'clave-de-la-entidad',
                   None, cfg=CFG)
        p = Programacion(nombre='semestral', fuente='kmc', cron='0 2 1 1,7 *', zona='America/Bogota', activo=True,
                         silencio=False, solo_si_nuevo=True, parametros={'anio_desde': 2015},
                         proxima=datetime.now(UTC) - timedelta(minutes=1))
        s.add(p)
        s.commit()
        pid = p.id
    lanzador = Lanzador({'corrida': (0, SALIDA_CORRIDA)})
    prog = Programador(motor=motor, lanzar=lanzador, cfg=CFG)
    eid = prog.ciclo()
    assert eid is not None and prog.ciclo() is None
    args, env = lanzador.llamadas[0]
    assert args == ['corrida', '--fuente', 'kmc', '--solo-si-nuevo', '--anio-desde', '2015']
    assert env['KMC_HOST'] == 'db.entidad' and env['KMC_PORT'] == '6543' and env['KMC_PW'] == 'clave-de-la-entidad'
    assert env['MAIA_EJECUCION_ID'] == str(eid) and env['MAIA_PROGRAMACION_ID'] == str(pid)
    e = _ultima(motor)
    assert e.estado == 'ok' and e.origen == 'programada' and e.programacion_id == pid
    assert e.resultado == {'corrida': 12, 'corte': '2026-06-30', 'corte_id': 7,
                           'modelos': {'anomalias': {'registro': 'maia-anomalias', 'version': '4'},
                                       'clinico': {'registro': 'maia-clinico', 'version': '9'}}}
    assert 'candidatos' in e.mensaje and 'clave-de-la-entidad' not in (e.registro or '')
    with Session(motor) as s:
        assert s.get(Programacion, pid).proxima > datetime.now(UTC)


def test_sin_clave_la_corrida_real_falla_con_un_mensaje_claro(motor, monkeypatch):
    monkeypatch.delenv('KMC_PW', raising=False)
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'kmc', 'manual')
        s.commit()
    lanzador = Lanzador({})
    Programador(motor=motor, lanzar=lanzador, cfg=CFG).ciclo()
    e = _ultima(motor)
    assert e.estado == 'error' and 'No hay clave' in e.mensaje and lanzador.llamadas == []


def test_corrida_que_falla_y_base_sin_cambios(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'simulado', 'manual', {'silencio': True})
        s.commit()
    Programador(motor=motor, lanzar=Lanzador({'corrida': (1, 'Traceback...\nRuntimeError: sin corte')}), cfg=CFG).ciclo()
    e = _ultima(motor)
    assert e.estado == 'error' and 'código 1' in e.mensaje and 'sin corte' in e.mensaje and 'Traceback' in e.registro
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'simulado', 'manual')
        s.commit()
    Programador(motor=motor, lanzar=Lanzador({'corrida': (0, 'La base no cambió (corte ...). Nada que hacer.')}),
                cfg=CFG).ciclo()
    e = _ultima(motor)
    assert e.estado == 'ok' and e.resultado == {'sin_cambios': True}


def test_aprobacion_promueve_y_exporta(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'aprobacion', 'simulado', 'manual', {'anomalias': '4', 'clinico': '9'})
        s.commit()
    lanzador = Lanzador({'exportar': (0, 'Paquete 2026-10-28_1200_ab12 (simulado) firmado.\n  MinIO: s3://...')})
    Programador(motor=motor, lanzar=lanzador, cfg=CFG).ciclo()
    assert [a for a, _ in lanzador.llamadas] == [
        ['promover', 'anomalias', '--version', '4', '--fuente', 'simulado'],
        ['promover', 'clinico', '--version', '9', '--fuente', 'simulado'],
        ['exportar', '--fuente', 'simulado', '--modelo-anomalias', '4', '--modelo-clinico', '9']]
    assert all('KMC_PW' not in env for _, env in lanzador.llamadas)
    e = _ultima(motor)
    assert e.estado == 'ok' and e.resultado == {'modelos': {'anomalias': '4', 'clinico': '9'},
                                                'paquete': '2026-10-28_1200_ab12'}


def test_al_arrancar_cierra_las_interrumpidas(motor):
    with Session(motor) as s:
        e = EJ.encolar(s, 'corrida', 'simulado', 'manual')
        e.estado = 'en_curso'
        s.commit()
    assert Programador(motor=motor, lanzar=Lanzador({}), cfg=CFG).arrancar() == 1
    assert _ultima(motor).estado == 'error'


def test_entrenar_ahora_trae_datos_y_entrena_con_los_hiperparametros_de_la_web(motor):
    with Session(motor) as s:
        CO.guardar(s, CO.Datos('db.entidad', 5432, 'origen', 'lector', 'consumo', 'require', 10), 'clave-de-la-entidad',
                   None, cfg=CFG)
        EJ.encolar(s, 'entrenamiento', 'kmc', 'manual', {
            'modelos': ['clinico'], 'extraer': True, 'filtros': {'anio_desde': 2018},
            'hiperparametros': {'clinico': {'rondas': 800, 'tasa': 0.03}}})
        s.commit()
    pasos_vistos = []

    class ConPasos(Lanzador):
        def __call__(self, args, env, al_linea):
            pasos_vistos.append(_ultima(motor).resultado['paso'])
            return super().__call__(args, env, al_linea)

    lanzador = ConPasos({
        'extraer': (0, 'Corte 2026-10-27 guardado en s3://maia-sevarti/cortes/kmc/2026-10-27/ (10 datos)'),
        'entrenar': (0, 'Corte 2026-10-27 (1,200 niños).\nRegistrado como maia-clinico v12 (alias candidato).')})
    Programador(motor=motor, lanzar=lanzador, cfg=CFG).ciclo()
    (a1, env1), (a2, env2) = lanzador.llamadas
    assert a1 == ['extraer', '--fuente', 'kmc', '--anio-desde', '2018'] and env1['KMC_PW'] == 'clave-de-la-entidad'
    assert a2 == ['entrenar', 'clinico', '--fuente', 'kmc', '--fecha', '2026-10-27',
                  '--hiperparametros', '{"rondas": 800, "tasa": 0.03}']
    assert pasos_vistos == ['extrayendo', 'entrenando_clinico']
    e = _ultima(motor)
    assert e.estado == 'ok' and e.resultado['paso'] == 'entrenado'
    assert e.resultado['modelos'] == {'clinico': {'registro': 'maia-clinico', 'version': '12'}}
    assert e.resultado['hechos'] == ['extrayendo', 'entrenando_clinico'] and 'candidato' in e.mensaje


def test_entrenar_ahora_que_falla_deja_el_paso_donde_fallo(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'entrenamiento', 'simulado', 'manual', {'modelos': ['anomalias', 'clinico'], 'extraer': False})
        s.commit()
    lanzador = Lanzador({'entrenar': (2, 'Error: no hay cortes de "simulado" en MinIO')})
    Programador(motor=motor, lanzar=lanzador, cfg=CFG).ciclo()
    e = _ultima(motor)
    assert e.estado == 'error' and e.resultado == {'paso': 'entrenando_anomalias', 'hechos': []}
    assert 'no hay cortes' in e.mensaje and len(lanzador.llamadas) == 1
    assert '--hiperparametros' not in lanzador.llamadas[0][0]
