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
Riesgos con los modelos produccion: anomalías v3 · clínico v8
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
    assert args == ['corrida', '--fuente', 'kmc', '--usar', 'produccion', '--solo-si-nuevo', '--anio-desde', '2015']
    assert env['KMC_HOST'] == 'db.entidad' and env['KMC_PORT'] == '6543' and env['KMC_PW'] == 'clave-de-la-entidad'
    assert env['MAIA_EJECUCION_ID'] == str(eid) and env['MAIA_PROGRAMACION_ID'] == str(pid)
    e = _ultima(motor)
    assert e.estado == 'ok' and e.origen == 'programada' and e.programacion_id == pid
    assert e.resultado == {'corrida': 12, 'corte': '2026-06-30', 'corte_id': 7,
                           'modelos': {'anomalias': {'registro': 'maia-anomalias', 'version': '4'},
                                       'clinico': {'registro': 'maia-clinico', 'version': '9'}},
                           'modelos_riesgos': {'anomalias': '3', 'clinico': '8'}}
    assert 'aprobados (anomalías v3 · clínico v8)' in e.mensaje and 'candidatos' in e.mensaje and 'clave-de-la-entidad' not in (e.registro or '')
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


def test_sin_servidor_ni_usuario_la_corrida_real_falla_con_un_mensaje_claro(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'kmc', 'manual')
        s.commit()
    lanzador = Lanzador({})
    cfg = Configuracion(_env_file=None, maia_cifrado_clave='p' * 40, kmc_pw='clave', kmc_host='', kmc_usuario='')
    Programador(motor=motor, lanzar=lanzador, cfg=cfg).ciclo()
    e = _ultima(motor)
    assert e.estado == 'error' and 'KMC_HOST y KMC_USUARIO' in e.mensaje and lanzador.llamadas == []


def test_un_fallo_conocido_sale_explicado(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'simulado', 'manual')
        s.commit()
    salida = ('Traceback (most recent call last):\nbotocore.exceptions.ClientError: An error occurred (AccessDenied) '
              'when calling the CreateBucket operation: Access Denied.')
    Programador(motor=motor, lanzar=Lanzador({'corrida': (1, salida)}), cfg=CFG).ciclo()
    e = _ultima(motor)
    assert e.estado == 'error' and e.mensaje.startswith('MinIO no le dio permiso') and 'CreateBucket' in e.registro


def test_corrida_que_falla_y_base_sin_cambios(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'simulado', 'manual', {'silencio': True})
        s.commit()
    Programador(motor=motor, lanzar=Lanzador({'corrida': (1, 'Traceback...\nRuntimeError: sin corte')}), cfg=CFG).ciclo()
    e = _ultima(motor)
    # en la web, el paso que falló en palabras claras; el texto de Python queda en el registro («Ver detalle técnico»)
    assert e.estado == 'error' and '«maia corrida»' in e.mensaje and 'Traceback' not in e.mensaje
    assert 'Detalle técnico' in e.registro and 'código 1' in e.registro and 'sin corte' in e.registro
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
    assert 'Todavía no hay datos guardados' in e.mensaje and 'no hay cortes' in e.registro and len(lanzador.llamadas) == 1
    assert '--hiperparametros' not in lanzador.llamadas[0][0]


def test_corrida_a_mano_usa_los_aprobados_sin_entrenar(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'simulado', 'manual')
        s.commit()
    lanzador = Lanzador({'corrida': (0, 'Corte 2026-06-30 (id 7).\n'
                                        'Riesgos con los modelos produccion: anomalías v3 · clínico v3\n'
                                        'Corrida 4 terminada en 2 min.')})
    Programador(motor=motor, lanzar=lanzador, cfg=CFG).ciclo()
    assert lanzador.llamadas[0][0][:6] == ['corrida', '--fuente', 'simulado', '--usar', 'produccion', '--sin-entrenar']
    e = _ultima(motor)
    assert e.estado == 'ok' and e.mensaje == 'Riesgos calculados con los modelos aprobados (anomalías v3 · clínico v3).'
    assert 'modelos' not in e.resultado and e.resultado['corrida'] == 4


def test_corrida_sin_modelos_aprobados_dice_que_hacer(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'simulado', 'manual')
        s.commit()
    salida = ('Traceback...\nRuntimeError: No hay modelos con alias produccion para la fuente simulado: entrene y '
              'apruebe una versión de cada modelo en Datos y modelos › Operación de modelos › Entrenar y aprobar modelos.')
    Programador(motor=motor, lanzar=Lanzador({'corrida': (1, salida)}), cfg=CFG).ciclo()
    e = _ultima(motor)
    assert e.estado == 'error' and e.mensaje.startswith('Todavía no hay modelos aprobados')


# ------------------------------------------------------------------ Mis modelos: etiquetas, métricas y borrado

def test_entrenamiento_personal_lleva_dueno_y_visibilidad_y_guarda_el_auc(motor):
    import uuid

    from maia_comun.modelos_db import Usuario
    uid = uuid.uuid4()
    with Session(motor) as s:
        s.add(Usuario(id=uid, email='exp@maia.prueba', nombre='Exp', rol='experto', hash_clave='x'))
        s.flush()
        EJ.encolar(s, 'entrenamiento', 'simulado', 'manual', {'modelos': ['anomalias', 'clinico'], 'extraer': False,
                                                              'visibilidad': 'personal'}, usuario_id=uid)
        s.commit()
    lanzador = Lanzador({'entrenar': (0, 'Corte 2026-06-30 (900 niños).\nRegistrado como maia-clinico-demo v7 (alias candidato).')})
    leidas = []

    def metricas(registro, version):
        leidas.append((registro, version))
        return {'auc__a': 0.8, 'auc__b': 0.6, 'auc_regla__a': 0.5, 'pr_auc__a': 0.3, 'top10__a': 40.0}

    Programador(motor=motor, lanzar=lanzador, cfg=CFG, leer_metricas=metricas).ciclo()
    for _, env in lanzador.llamadas:
        assert env['MAIA_VISIBILIDAD'] == 'personal' and env['MAIA_PROPIETARIO'] == str(uid)
    e = _ultima(motor)
    assert e.estado == 'ok' and e.resultado['auc'] == pytest.approx(0.7)       # promedio, sin la regla simple
    assert e.resultado['metricas']['clinico'] == {'auc': 0.7, 'pr_auc': 0.3, 'top10': 40.0}
    assert ('maia-clinico-demo', '7') in leidas
    with Session(motor) as s:
        s.execute(delete(Usuario).where(Usuario.id == uid))
        s.commit()


def test_corrida_programada_se_registra_como_oficial_sin_dueno(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'corrida', 'simulado', 'manual')
        s.commit()
    lanzador = Lanzador({'corrida': (0, 'Corrida 1 terminada en 1 min.')})
    Programador(motor=motor, lanzar=lanzador, cfg=CFG).ciclo()
    env = lanzador.llamadas[0][1]
    assert env['MAIA_VISIBILIDAD'] == 'oficial' and 'MAIA_PROPIETARIO' not in env


def test_metricas_caidas_no_hacen_fallar_el_entrenamiento(motor):
    with Session(motor) as s:
        EJ.encolar(s, 'entrenamiento', 'simulado', 'manual', {'modelos': ['clinico'], 'extraer': False})
        s.commit()

    def sin_mlflow(registro, version):
        raise ConnectionError('MLflow no responde')

    lanzador = Lanzador({'entrenar': (0, 'Registrado como maia-clinico-demo v7 (alias candidato).')})
    Programador(motor=motor, lanzar=lanzador, cfg=CFG, leer_metricas=sin_mlflow).ciclo()
    e = _ultima(motor)
    assert e.estado == 'ok' and e.resultado['metricas'] == {} and 'auc' not in e.resultado


def _personal(s, dias_terminada: int, version: str, dueno, tipo='entrenamiento', **parametros) -> int:
    e = EJ.encolar(s, tipo, 'simulado', 'manual', {'visibilidad': 'personal', **parametros}, usuario_id=dueno)
    e.estado, e.iniciada = 'ok', EJ.ahora() - timedelta(days=dias_terminada, minutes=5)
    e.terminada = EJ.ahora() - timedelta(days=dias_terminada)
    e.resultado = {'modelos': {'clinico': {'registro': 'maia-clinico-demo', 'version': version}}}
    e.registro = 'salida'
    s.flush()
    return e.id


def test_borrado_a_los_90_dias_solo_de_lo_propio_vencido_o_descartado(motor):
    import uuid

    from maia_comun.modelos_analitica import Analitica
    from maia_comun.modelos_db import Usuario
    uid = uuid.uuid4()
    borrados: list[tuple[str, str]] = []
    with Session(motor) as s:
        s.add(Usuario(id=uid, email='dueno@maia.prueba', nombre='Dueño', rol='experto', hash_clave='x'))
        s.flush()
        vencido = _personal(s, 91, '1', uid)
        reciente = _personal(s, 30, '2', uid)
        usado = _personal(s, 120, '3', uid, ultimo_uso=(EJ.ahora() - timedelta(days=10)).isoformat())
        descartado = _personal(s, 5, '4', uid, descartado=True)
        aprobado = _personal(s, 200, '5', uid)           # una aprobación lo llevó a producción
        en_uso = _personal(s, 200, '6', uid)             # una ejecución en cola lo usa
        oficial = _personal(s, 400, '7', uid)
        s.get(Ejecucion, oficial).parametros = {'visibilidad': 'oficial'}
        sin_dueno = _personal(s, 400, '8', None)
        ap = EJ.encolar(s, 'aprobacion', 'simulado', 'manual', {'anomalias': '1', 'clinico': '5'})
        ap.estado = 'ok'
        EJ.encolar(s, 'corrida', 'simulado', 'manual', {'entrenamiento_id': en_uso})
        for eid in (vencido, reciente, aprobado):
            s.add(Analitica(entrenamiento_id=eid, modelo='clinico', tipo='meta', datos={}))
        s.commit()
    prog = Programador(motor=motor, lanzar=Lanzador({}), cfg=CFG, borrar_modelo=lambda r, v: borrados.append((r, v)) or True)
    assert sorted(prog.purgar(forzar=True)) == sorted([vencido, descartado])
    assert sorted(v for _, v in borrados) == ['1', '4']
    with Session(motor) as s:
        estados = {i: s.get(Ejecucion, i) for i in (vencido, reciente, usado, descartado, aprobado, en_uso, oficial,
                                                    sin_dueno)}
        assert all(estados[i].parametros.get('borrado') for i in (vencido, descartado))
        assert estados[vencido].registro is None
        assert not any(estados[i].parametros.get('borrado') for i in (reciente, usado, aprobado, en_uso, oficial, sin_dueno))
        quedan = {a.entrenamiento_id for a in s.scalars(select(Analitica))}
        assert {reciente, aprobado} <= quedan and vencido not in quedan       # la analítica del vencido se borró
        assert EJ.personales_guardados(s, uid) == 4          # reciente, usado, aprobado, en_uso siguen contando
        s.execute(delete(Analitica).where(Analitica.entrenamiento_id.in_([reciente, aprobado])))
        s.execute(delete(Usuario).where(Usuario.id == uid))
        s.commit()
    # a la hora siguiente no repite el trabajo
    assert prog.purgar() == []


def test_purga_respeta_los_dias_que_fija_el_admin(motor):
    import uuid

    from maia_comun.cuotas import CuotaConfig
    from maia_comun.modelos_db import Usuario
    uid = uuid.uuid4()
    with Session(motor) as s:
        s.add(Usuario(id=uid, email='dueno2@maia.prueba', nombre='Dueño', rol='experto', hash_clave='x'))
        s.flush()
        e30 = _personal(s, 40, '1', uid)
        s.commit()
    prog = Programador(motor=motor, lanzar=Lanzador({}), cfg=CFG, borrar_modelo=lambda r, v: True)
    assert prog.purgar(forzar=True) == []                     # 40 días: aún dentro de los 90 de fábrica
    with Session(motor) as s:
        s.add(CuotaConfig(clave='dias_sin_uso', valor=30))
        s.commit()
    assert prog.purgar(forzar=True) == [e30]
    with Session(motor) as s:
        s.execute(delete(CuotaConfig))
        s.execute(delete(Usuario).where(Usuario.id == uid))
        s.commit()


def test_purga_que_falla_en_mlflow_no_tumba_el_ciclo(motor):
    import uuid

    from maia_comun.modelos_db import Usuario
    uid = uuid.uuid4()
    with Session(motor) as s:
        s.add(Usuario(id=uid, email='dueno3@maia.prueba', nombre='Dueño', rol='experto', hash_clave='x'))
        s.flush()
        _personal(s, 100, '1', uid)
        s.commit()

    def roto(registro, version):
        raise ConnectionError('MLflow caído')

    prog = Programador(motor=motor, lanzar=Lanzador({}), cfg=CFG, borrar_modelo=roto)
    assert prog.ciclo() is None
    with Session(motor) as s:   # nada quedó marcado: se reintenta después
        assert not any((e.parametros or {}).get('borrado') for e in s.scalars(select(Ejecucion)))
        s.execute(delete(Usuario).where(Usuario.id == uid))
        s.commit()


def test_el_entrenamiento_recibe_la_version_del_diccionario_con_que_se_hace(motor, tmp_path):
    """La versión vigente del Diccionario viaja al entrenamiento (``MAIA_DICCIONARIO_VERSION``): queda en su
    trazabilidad, para saber con qué definiciones de desenlaces y variables se entrenó."""
    from maia_comun import diccionarios as DIC
    from maia_comun.modelos_db import VersionDiccionario
    with Session(motor) as s:
        assert DIC.sembrar(s)
        s.commit()
        version = DIC.vigente(s).version
        EJ.encolar(s, 'entrenamiento', 'simulado', 'manual', {'modelos': ['clinico']})
        s.commit()
    try:
        lanzador = Lanzador({'entrenar': (0, '')})
        Programador(motor=motor, lanzar=lanzador, cfg=CFG, diccionario=tmp_path / 'diccionario.xlsx').ciclo()
        assert lanzador.llamadas and all(env['MAIA_DICCIONARIO_VERSION'] == str(version) for _, env in lanzador.llamadas)
    finally:
        with Session(motor) as s:
            s.execute(delete(VersionDiccionario))
            s.commit()


def test_sin_diccionario_en_la_base_el_entrenamiento_no_inventa_una_version(motor, tmp_path):
    with Session(motor) as s:
        EJ.encolar(s, 'entrenamiento', 'simulado', 'manual', {'modelos': ['clinico']})
        s.commit()
    lanzador = Lanzador({'entrenar': (0, '')})
    Programador(motor=motor, lanzar=lanzador, cfg=CFG, diccionario=tmp_path / 'diccionario.xlsx').ciclo()
    assert lanzador.llamadas and all('MAIA_DICCIONARIO_VERSION' not in env for _, env in lanzador.llamadas)
