"""Extracción parametrizada de la base de la Fundación: parámetros, SQL sin valores interpolados y, contra un Postgres
real con un esquema ``consumo`` de prueba, filtros, exclusión de restringidas, solo lectura y trazabilidad."""
import json
import uuid
from datetime import date

import pandas as pd
import psycopg
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from maia_comun import sevarti_db as SDB
from maia_comun.config import Configuracion
from maia_entrenamiento.fuentes import kmc_postgres as KP
from maia_entrenamiento.fuentes.kmc_postgres import ParametrosExtraccion as P

# ====================================================================== parámetros


def test_parametros_validos_y_serializables():
    p = P.desde_textos('2026-06-30', 2015, 2020, '2025-01-01', '2026-12-31', 10)
    assert p.fecha_corte == date(2026, 6, 30) and p.tope == date(2026, 6, 30) and p.anio_maximo == 2020
    d = p.como_dict()
    assert json.loads(json.dumps(d)) == d == {'fecha_corte': '2026-06-30', 'anio_desde': 2015, 'anio_hasta': 2020,
                                               'desde': '2025-01-01', 'hasta': '2026-12-31', 'limite': 10}
    assert P().vacio and not p.vacio and P().como_dict() == dict.fromkeys(d)
    assert P(hasta=date(2024, 3, 1)).anio_maximo == 2024      # nadie nacido después del tope
    assert P(anio_hasta=2030, fecha_corte=date(2025, 1, 1)).anio_maximo == 2025
    assert P.desde_textos(None, None, None, '', None).vacio


@pytest.mark.parametrize('kwargs, mensaje', [
    (dict(desde=date(2025, 2, 1), hasta=date(2025, 1, 1)), 'desde'),
    (dict(desde=date(2025, 2, 1), fecha_corte=date(2025, 1, 1)), 'fecha de corte'),
    (dict(anio_desde=2020, anio_hasta=2015), 'anio_desde'),
    (dict(anio_desde=2026, fecha_corte=date(2025, 1, 1)), 'anio_desde'),
    (dict(anio_desde=1500), 'fuera'),
    (dict(limite=0), 'limite'),
    (dict(limite=True), 'entero'),
    (dict(anio_desde='2015'), 'entero'),
    (dict(fecha_corte='2025-01-01'), 'fecha'),
])
def test_parametros_invalidos(kwargs, mensaje):
    with pytest.raises(ValueError, match=mensaje):
        P(**kwargs)


def test_fechas_mal_escritas():
    with pytest.raises(ValueError, match='AAAA-MM-DD'):
        P.desde_textos(fecha_corte='30/06/2026')


# ====================================================================== SQL


def test_consulta_de_la_tabla_ancha_no_interpola_valores():
    p = P(anio_desde=2013, anio_hasta=2017, limite=37)
    nombre, q, valores = KP.consulta_perfil('consumo', ['paciente_id', 'v215', 'anio_parto'], p, 'integer')
    t = KP.texto(q)
    assert nombre == 'perfil_paciente'
    assert t == ('SELECT "paciente_id", "v215", "anio_parto" FROM "consumo"."perfil_paciente" '
                 'WHERE "anio_parto" >= %(anio_desde)s AND "anio_parto" <= %(anio_hasta)s '
                 'ORDER BY "paciente_id" LIMIT %(limite)s')
    assert valores == {'anio_desde': 2013, 'anio_hasta': 2017, 'limite': 37}
    assert not any(str(v) in t for v in valores.values())
    # el mismo texto (y el mismo sha) con otros valores: el sha identifica la consulta, no los datos
    _, q2, _ = KP.consulta_perfil('consumo', ['paciente_id', 'v215', 'anio_parto'], P(anio_desde=2001, anio_hasta=2002,
                                                                                       limite=1), 'integer')
    assert KP.sha(KP.texto(q2)) == KP.sha(t)


def test_sin_filtros_no_hay_where_y_el_anio_de_texto_se_convierte():
    _, q, valores = KP.consulta_perfil('consumo', ['paciente_id'], P(), None)
    assert KP.texto(q) == 'SELECT "paciente_id" FROM "consumo"."perfil_paciente" ORDER BY "paciente_id"' and not valores
    _, q, _ = KP.consulta_perfil('consumo', ['paciente_id'], P(anio_desde=2015), 'text')
    assert "CAST(NULLIF(btrim(\"anio_parto\"::text), '') AS numeric) >= %(anio_desde)s" in KP.texto(q)
    with pytest.raises(ValueError, match='anio_parto'):
        KP.consulta_perfil('consumo', ['paciente_id'], P(anio_desde=2015), None)


def test_los_nombres_van_como_identificadores():
    malo = 'consumo"; DROP TABLE x; --'
    for _, q, _ in (KP.consulta_restringidas(malo), KP.consulta_diccionario(malo), KP.consulta_categorias(malo),
                    KP.consulta_perfil(malo, ['paciente_id'], P(), None)):
        assert '"consumo""; DROP TABLE x; --".' in KP.texto(q)
    _, q, valores = KP.consulta_columnas(malo)
    assert malo not in KP.texto(q) and valores['esquema'] == malo     # en information_schema, como valor enlazado
    assert '"a""b"' in KP.texto(KP.consulta_perfil('consumo', ['a"b'], P(), None)[1])


def test_conectar_exige_servidor_usuario_y_clave():
    with pytest.raises(RuntimeError, match='KMC_HOST y KMC_USUARIO'):
        KP.conectar(Configuracion(_env_file=None, kmc_host='', kmc_usuario='', kmc_pw='x'))
    with pytest.raises(RuntimeError, match='KMC_PW'):
        KP.conectar(Configuracion(_env_file=None, kmc_host='db.entidad', kmc_usuario='lector', kmc_pw=None))


# ====================================================================== un consumo de prueba

RESTRINGIDAS = ('iden_sede', 'iden_fechaparto')
DICCIONARIO = [  # variable, tipo
    ('paciente_id', 'TEXT'), ('iden_codigo', 'TEXT'), ('iden_sede', 'INTEGER'), ('iden_fechaparto', 'DATE'),
    ('eg_semanas', 'FLOAT'), ('ern_peso', 'FLOAT'), ('ern_sexo', 'CATEGORIC'),
    ('v195', 'DATE'), ('v196', 'INTEGER'), ('v195a', 'DATE'), ('v196a', 'FLOAT'),
    ('v215', 'DATE'), ('v216', 'INTEGER'), ('v218', 'FLOAT'),
    ('v259', 'DATE'), ('v260', 'INTEGER'), ('v261', 'FLOAT'), ('hd_diasurn', 'INTEGER'),
]
TIPO_SQL = {'TEXT': 'text', 'INTEGER': 'integer', 'FLOAT': 'double precision', 'CATEGORIC': 'text', 'DATE': 'text'}
DIAS = {'v195': 20, 'v195a': 25, 'v215': 60, 'v259': 150}   # días desde el nacimiento de cada fecha


def _ninos() -> list[dict]:
    """Ocho niños, uno por año de nacimiento (2014 a 2021), nacidos el 15 de enero."""
    filas = []
    for i in range(8):
        anio = 2014 + i
        nac = pd.Timestamp(f'{anio}-01-15')
        f = {c: str((nac + pd.Timedelta(days=d)).date()) for c, d in DIAS.items()}
        filas.append({'paciente_id': f'p{i:02d}', 'iden_codigo': f'CC-{i}', 'iden_sede': 1 + i % 3,
                      'iden_fechaparto': str(nac.date()), 'eg_semanas': 32.0, 'ern_peso': 1500.0 + 10 * i,
                      'ern_sexo': '1' if i % 2 else '2', **f, 'v196': 20, 'v196a': 1600.0, 'v216': 60, 'v218': 2500.0,
                      'v260': 150, 'v261': 4000.0 + i, 'hd_diasurn': 10, 'anio_parto': anio})
    return filas


DDL = """
CREATE SCHEMA consumo;
CREATE TABLE consumo.diccionario (variable text PRIMARY KEY, nombre_corto text, tipo text, unidades text,
    rango_min numeric, rango_max numeric, subtipo text, origen text, descripcion text);
CREATE TABLE consumo.categoria (variable text, codigo text, etiqueta text, es_missing boolean);
CREATE TABLE consumo.variable_restringida (variable text PRIMARY KEY, motivo text);
"""


def _poblar(conn: psycopg.Connection) -> None:
    conn.execute(DDL)
    with conn.cursor() as cur:
        cur.executemany('INSERT INTO consumo.diccionario (variable, nombre_corto, tipo, unidades, rango_min, rango_max, '
                        'origen) VALUES (%s, %s, %s, %s, %s, %s, %s)',
                        [(v, v.upper(), t, 'g' if v in ('ern_peso', 'v218', 'v261') else None,
                          0 if t == 'FLOAT' else None, 10000 if t == 'FLOAT' else None, 'prueba') for v, t in DICCIONARIO])
        cur.executemany('INSERT INTO consumo.categoria VALUES (%s, %s, %s, %s)',
                        [('ern_sexo', '1', 'niño', False), ('ern_sexo', '2', 'niña', False),
                         ('ern_sexo', '9', 'sin dato', True)])
        cur.executemany('INSERT INTO consumo.variable_restringida VALUES (%s, %s)',
                        [(v, 'reidentifica') for v in RESTRINGIDAS])
        columnas = [v for v, _ in DICCIONARIO] + ['anio_parto']
        tipos = [TIPO_SQL[t] for _, t in DICCIONARIO] + ['integer']
        cur.execute('CREATE TABLE consumo.perfil_paciente ('
                    + ', '.join(f'{c} {t}' for c, t in zip(columnas, tipos)) + ')')
        cur.executemany(f'INSERT INTO consumo.perfil_paciente ({", ".join(columnas)}) '
                        f'VALUES ({", ".join(["%s"] * len(columnas))})',
                        [tuple(n[c] for c in columnas) for n in _ninos()])


@pytest.fixture(scope='module')
def cfg_kmc(servidor_pg):
    """Una base nueva con el esquema consumo de prueba y la configuración KMC_* que apunta a ella."""
    url = make_url(servidor_pg.replace('postgresql+psycopg://', 'postgresql://', 1))
    admin = dict(host=url.host or 'localhost', port=url.port or 5432, user=url.username, password=url.password)
    nombre = f'kmc_prueba_{uuid.uuid4().hex[:8]}'
    with psycopg.connect(dbname=url.database or 'postgres', autocommit=True, **admin) as cx:
        cx.execute(f'CREATE DATABASE {nombre}')
    try:
        with psycopg.connect(dbname=nombre, **admin) as cx:
            _poblar(cx)
        yield Configuracion(kmc_host=admin['host'], kmc_port=admin['port'], kmc_db=nombre, kmc_usuario=admin['user'],
                            kmc_pw=admin['password'] or 'sin-clave', kmc_sslmode='disable', kmc_timeout=10)
    finally:
        with psycopg.connect(dbname=url.database or 'postgres', autocommit=True, **admin) as cx:
            cx.execute('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s', (nombre,))
            cx.execute(f'DROP DATABASE IF EXISTS {nombre}')


@pytest.fixture
def extraer(cfg_kmc, tmp_path):
    def _extraer(**kwargs):
        return KP.extraer(P(**kwargs), tmp_path / 'diccionario.xlsx', cfg_kmc, bloque=3)
    return _extraer


@pytest.mark.integracion
def test_sin_filtros_trae_todo_y_nunca_las_restringidas(extraer, monkeypatch):
    pedidas = []
    original = KP.consulta_perfil

    def espia(*a, **k):
        r = original(*a, **k)
        pedidas.append(KP.texto(r[1]))
        return r
    monkeypatch.setattr(KP, 'consulta_perfil', espia)
    sev, meta = extraer()
    assert sorted(sev.sujetos.sujeto) == [f'p{i:02d}' for i in range(8)]
    assert sev.sujetos.anio_nacimiento.tolist() == list(range(2014, 2022))
    prohibidas = {*RESTRINGIDAS, 'iden_codigo'}
    assert not prohibidas & set(sev.esquema.variable) and not prohibidas & set(sev.mediciones.variable)
    assert not {'CC-0', '2014-01-15'} & set(sev.mediciones.valor.astype(str))
    assert all(f'"{c}"' not in pedidas[0] for c in prohibidas)          # ni siquiera se pidieron
    assert meta['columnas_excluidas'] == ['iden_codigo', 'iden_fechaparto', 'iden_sede']
    assert meta['filas'] == {'perfil_paciente': 8, 'excluidos_por_fecha': 0, 'sujetos': 8,
                             'mediciones': len(sev.mediciones)}
    assert meta['parametros'] == P().como_dict() and len(meta['consulta_sha']) == 64
    assert meta['origen']['esquema'] == 'consumo' and 'sin-clave' not in json.dumps(meta)
    assert [c['nombre'] for c in meta['consultas']] == ['existe_variable_restringida', 'variable_restringida',
                                                        'diccionario', 'categoria', 'columnas', 'perfil_paciente']
    assert {'v218', 'v261', 'ern_peso'} <= set(sev.mediciones.variable)    # las fechas no son mediciones


@pytest.mark.integracion
def test_filtro_por_anio_de_nacimiento(extraer):
    sev, meta = extraer(anio_desde=2016, anio_hasta=2018)
    assert sorted(sev.sujetos.sujeto) == ['p02', 'p03', 'p04']
    assert meta['filas']['perfil_paciente'] == 3
    # mismos filtros con otros valores: misma consulta, mismo sha
    _, otro = extraer(anio_desde=2015, anio_hasta=2019)
    assert otro['consulta_sha'] == meta['consulta_sha']
    _, sin = extraer()
    assert sin['consulta_sha'] != meta['consulta_sha']


@pytest.mark.integracion
def test_fecha_de_corte_deja_fuera_lo_posterior(extraer):
    corte = date(2018, 4, 1)
    sev, meta = extraer(fecha_corte=corte)
    # nacidos después de 2018 no entran; el de 2018 entra sin su visita de 3 meses (2018-06-14)
    assert sorted(sev.sujetos.sujeto) == ['p00', 'p01', 'p02', 'p03', 'p04']
    assert sev.corte == pd.Timestamp(corte) and meta['corte'] == '2018-04-01'
    assert not (pd.to_datetime(sev.mediciones.fecha) > pd.Timestamp(corte)).any()
    p04 = sev.mediciones[sev.mediciones.sujeto == 'p04']
    assert 'v218' in set(p04.variable) and 'v261' not in set(p04.variable)
    assert len(sev.mediciones[(sev.mediciones.sujeto == 'p03') & (sev.mediciones.variable == 'v261')]) == 1


@pytest.mark.integracion
def test_ventana_de_visitas(extraer):
    sev, meta = extraer(desde=date(2017, 1, 1), hasta=date(2019, 12, 31))
    # 2014 a 2016: todas sus visitas antes de la ventana; 2020 y 2021: no se piden (año > tope)
    assert sorted(sev.sujetos.sujeto) == ['p03', 'p04', 'p05']
    assert meta['filas'] == {'perfil_paciente': 6, 'excluidos_por_fecha': 3, 'sujetos': 3,
                             'mediciones': len(sev.mediciones)}
    assert sev.corte <= pd.Timestamp('2019-12-31')
    assert set(sev.mediciones[sev.mediciones.sujeto == 'p05'].variable) >= {'v218', 'v261', 'ern_peso'}


@pytest.mark.integracion
def test_limite_para_pruebas(extraer):
    sev, meta = extraer(limite=2)
    assert sorted(sev.sujetos.sujeto) == ['p00', 'p01'] and meta['parametros']['limite'] == 2


@pytest.mark.integracion
def test_ningun_nino_cumple(extraer):
    with pytest.raises(ValueError, match='Ningún niño'):
        extraer(anio_desde=2030)


@pytest.mark.integracion
def test_la_conexion_es_de_solo_lectura(cfg_kmc):
    with KP.conectar(cfg_kmc) as conn:
        assert conn.read_only is True
        assert conn.execute('SHOW default_transaction_read_only').fetchone()[0] == 'on'
        with pytest.raises(psycopg.errors.ReadOnlySqlTransaction):
            conn.execute('INSERT INTO consumo.variable_restringida VALUES (%(v)s, %(m)s)', {'v': 'x', 'm': 'y'})
        conn.rollback()
        conn.autocommit = True     # tampoco fuera de una transacción explícita
        with pytest.raises(psycopg.errors.ReadOnlySqlTransaction):
            conn.execute('DELETE FROM consumo.categoria')
    with psycopg.connect(host=cfg_kmc.kmc_host, port=cfg_kmc.kmc_port, dbname=cfg_kmc.kmc_db,
                         user=cfg_kmc.kmc_usuario, password=cfg_kmc.kmc_pw) as cx:
        assert cx.execute('SELECT count(*) FROM consumo.categoria').fetchone()[0] == 3


@pytest.mark.integracion
def test_guardar_en_db_y_minio_conservan_los_parametros(extraer, url_db, almacen, tmp_path):
    sev, meta = extraer(anio_desde=2015, fecha_corte=date(2019, 6, 30))
    info = SDB.subir_corte(sev, 'kmc', almacen, meta['parametros'], meta['consulta_sha'], {'origen': meta['origen']})
    carpeta, bajado = SDB.bajar_corte(almacen, 'kmc', tmp_path / 'c', info.fecha)
    assert bajado.sha256 == info.sha256 and bajado.parametros == meta['parametros']
    assert bajado.consulta_sha == meta['consulta_sha']
    assert SDB.leer_extraccion(carpeta)['origen']['esquema'] == 'consumo'
    motor = create_engine(url_db)
    cid = SDB.guardar_en_db(motor, sev, 'kmc', bajado.ruta_minio, bajado.sha256, bajado.parametros, bajado.consulta_sha)
    with motor.connect() as cx:
        fila = cx.execute(text('SELECT parametros, consulta_sha, fecha_corte FROM sevarti.cortes WHERE id = :c'),
                          {'c': cid}).one()
    assert fila.parametros == {'fecha_corte': '2019-06-30', 'anio_desde': 2015, 'anio_hasta': None, 'desde': None,
                               'hasta': None, 'limite': None}
    assert fila.consulta_sha == meta['consulta_sha'] and str(fila.fecha_corte) == '2019-06-30'
    SDB.eliminar_corte(motor, cid)


def test_corte_sin_extraccion_no_cambia(almacen, sev_demo, tmp_path):
    info = SDB.subir_corte(sev_demo, 'simulado', almacen)
    _, bajado = SDB.bajar_corte(almacen, 'simulado', tmp_path / 'c')
    assert bajado.sha256 == info.sha256 and bajado.parametros is None and bajado.consulta_sha is None


def test_params_de_mlflow_sin_vacios():
    from maia_entrenamiento import registro as R
    assert R.params_extraccion({'fecha_corte': '2026-06-30', 'anio_desde': None}, 'abc') == {
        'extraccion.fecha_corte': '2026-06-30', 'extraccion.consulta_sha': 'abc'}
    assert R.params_extraccion(None, None) == {}


@pytest.mark.integracion
def test_cli_extraer_con_parametros(cfg_kmc, url_db, s3, tmp_path, monkeypatch):
    from typer.testing import CliRunner

    from archivos import carpetas as CA
    from archivos.carpetas import Carpetas
    from maia_comun import config, db
    from maia_entrenamiento.cli import app
    entorno = {'MINIO_URL': s3, 'MINIO_ACCESS_KEY': 'prueba', 'MINIO_SECRET_KEY': 'prueba-secreta', 'DATABASE_URL': url_db,
               'KMC_HOST': cfg_kmc.kmc_host, 'KMC_PORT': str(cfg_kmc.kmc_port), 'KMC_DB': cfg_kmc.kmc_db,
               'KMC_USUARIO': cfg_kmc.kmc_usuario, 'KMC_PW': cfg_kmc.kmc_pw, 'KMC_SSLMODE': 'disable'}
    for k, v in entorno.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(CA, 'PROYECTO', Carpetas(tmp_path / 'raiz'))
    monkeypatch.chdir(tmp_path)
    config.obtener.cache_clear()
    db.motor.cache_clear()
    try:
        r = CliRunner().invoke(app, ['extraer', '--fecha-corte', '2018-04-01', '--anio-desde', '2015', '--cargar'])
        assert r.exit_code == 0, r.output
        assert 'Corte 2018-04-01 guardado' in r.output and '"anio_desde": 2015' in r.output
        with create_engine(url_db).connect() as cx:
            fila = cx.execute(text("SELECT parametros, consulta_sha FROM sevarti.cortes WHERE fuente = 'kmc' "
                                   'AND vigente')).one()
        assert fila.parametros['fecha_corte'] == '2018-04-01' and len(fila.consulta_sha) == 64
        r = CliRunner().invoke(app, ['extraer', '--desde-visita', '2020-01-01', '--hasta-visita', '2019-01-01'])
        assert r.exit_code != 0 and 'posterior a hasta' in r.output
        r = CliRunner().invoke(app, ['corrida', '--fuente', 'simulado', '--anio-desde', '2015'])
        assert r.exit_code != 0 and 'solo aplican a --fuente kmc' in r.output
    finally:
        SDB.eliminar_corte(create_engine(url_db), fila_id(url_db))     # la base de la sesión la comparten otras pruebas
        config.obtener.cache_clear()
        db.motor.cache_clear()


def fila_id(url_db: str) -> int:
    with create_engine(url_db).connect() as cx:
        return cx.execute(text("SELECT id FROM sevarti.cortes WHERE fuente = 'kmc' AND vigente")).scalar_one()
