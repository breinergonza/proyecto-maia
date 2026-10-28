"""Configuración, almacén (MinIO simulado con moto) y el corte SEVARTI en Postgres."""
from dataclasses import replace

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session

from maia_comun import sevarti_db as SDB
from maia_comun.almacen import BUCKET_SEVARTI, separar_uri
from maia_comun.config import Configuracion, normalizar_url_db
from maia_comun.modelos_db import Corte
from sevarti import contrato as SV


def test_url_de_railway_se_normaliza():
    assert normalizar_url_db('postgres://u:p@h:5432/db') == 'postgresql+psycopg://u:p@h:5432/db'
    assert normalizar_url_db('postgresql://u@h/db') == 'postgresql+psycopg://u@h/db'
    assert Configuracion(database_url='postgres://a@b/c').database_url.startswith('postgresql+psycopg://')


def test_fuera_de_local_no_se_arranca_con_secretos_de_ejemplo(monkeypatch):
    for n in ('MAIA_JWT_SECRETO', 'MAIA_PAQUETE_CLAVE', 'MAIA_ADMIN_CLAVE'):   # sin el .env ni el entorno del equipo
        monkeypatch.delenv(n, raising=False)
    Configuracion(maia_entorno='local').exigir_secretos()
    with pytest.raises(RuntimeError, match='MAIA_JWT_SECRETO'):
        Configuracion(_env_file=None, maia_entorno='demo').exigir_secretos()
    Configuracion(maia_entorno='demo', maia_jwt_secreto='x' * 40, maia_paquete_clave='y' * 40,
                  maia_admin_clave='z' * 16).exigir_secretos()


def test_separar_uri():
    assert separar_uri('s3://maia-sevarti/cortes/a/b/') == ('maia-sevarti', 'cortes/a/b/')
    with pytest.raises(ValueError):
        separar_uri('/tmp/x')


def _normalizar(sev):
    """Lo que el contrato deja igual tras el viaje por Parquet: valores como texto, fechas como fecha."""
    m = sev.mediciones
    return m.assign(valor=m.valor.map(lambda v: None if pd.isna(v) else str(v)),
                    fecha=pd.to_datetime(m.fecha).dt.normalize().astype('datetime64[ns]')).reset_index(drop=True)


def test_corte_ida_y_vuelta_por_minio(almacen, sev_demo, tmp_path):
    info = SDB.subir_corte(sev_demo, 'simulado', almacen)
    assert info.fecha == '2026-06-30' and info.filas['sujetos'] == 1500
    assert SDB.cortes_en_minio(almacen, 'simulado') == ['2026-06-30']
    carpeta, info2 = SDB.bajar_corte(almacen, 'simulado', tmp_path / 'c')
    assert info2.sha256 == info.sha256
    leido = SV.leer(carpeta)
    assert leido.corte == sev_demo.corte
    pd.testing.assert_frame_equal(_normalizar(leido)[['sujeto', 'variable', 'valor']],
                                  _normalizar(sev_demo)[['sujeto', 'variable', 'valor']])


def test_corte_alterado_en_minio_no_se_usa(almacen, sev_demo, tmp_path):
    info = SDB.subir_corte(sev_demo, 'simulado', almacen)
    _, prefijo = separar_uri(info.ruta_minio)
    almacen.cliente.put_object(Bucket=BUCKET_SEVARTI, Key=prefijo + 'quiebres.parquet',
                               Body=SDB.a_bytes_parquet(pd.DataFrame({'quiebre': ['x'], 'fecha': [pd.Timestamp('2020-01-01')]})))
    with pytest.raises(RuntimeError, match='hash'):
        SDB.bajar_corte(almacen, 'simulado', tmp_path / 'c')


def test_fuente_desconocida(almacen, sev_demo):
    with pytest.raises(ValueError, match='Fuente desconocida'):
        SDB.subir_corte(sev_demo, 'otra', almacen)


@pytest.mark.integracion
def test_migraciones_crean_los_tres_esquemas(url_db):
    insp = inspect(create_engine(url_db))
    assert {'sevarti', 'resultados', 'app'} <= set(insp.get_schema_names())
    assert 'mediciones' in insp.get_table_names(schema='sevarti')
    assert 'riesgos' in insp.get_table_names(schema='resultados')
    assert 'usuarios' in insp.get_table_names(schema='app')


@pytest.mark.integracion
def test_corte_en_postgres_ida_y_vuelta_y_vigencia(url_db, sev_demo):
    motor = create_engine(url_db)
    cid = SDB.guardar_en_db(motor, sev_demo, 'simulado')
    leido = SDB.leer_de_db(motor, cid)
    assert len(leido.mediciones) == len(sev_demo.mediciones)
    assert set(leido.sujetos.sujeto) == set(sev_demo.sujetos.sujeto)
    pd.testing.assert_frame_equal(
        _normalizar(leido)[['sujeto', 'variable', 'valor', 'fecha']],
        _normalizar(sev_demo)[['sujeto', 'variable', 'valor', 'fecha']])
    np.testing.assert_allclose(leido.mediciones.edad_dias.to_numpy(dtype=float),
                               pd.to_numeric(sev_demo.mediciones.edad_dias).to_numpy(dtype=float))
    assert list(leido.etapas.etapa) == list(sev_demo.etapas.etapa)
    assert leido.esquema.set_index('variable').etiqueta.to_dict() == sev_demo.esquema.set_index('variable').etiqueta.to_dict()
    assert leido.corte == sev_demo.corte
    # solo algunos niños
    parte = SDB.leer_de_db(motor, cid, sujetos=['s00001', 's00002'])
    assert set(parte.mediciones.sujeto) <= {'s00001', 's00002'} and len(parte.esquema) == len(sev_demo.esquema)
    # un corte nuevo de la misma fuente reemplaza al vigente
    otro = sev_demo.subconjunto(sev_demo.sujetos.sujeto[:100])
    otro = replace(otro, corte=pd.Timestamp('2026-12-31'))
    cid2 = SDB.guardar_en_db(motor, otro, 'simulado')
    with Session(motor) as s:
        vigentes = s.scalars(select(Corte).where(Corte.vigente.is_(True))).all()
        assert [c.id for c in vigentes] == [cid2]
        assert SDB.corte_vigente(s, 'simulado').id == cid2
    with motor.connect() as cx:
        assert cx.execute(text('SELECT count(*) FROM sevarti.mediciones WHERE corte_id = :c'), {'c': cid}).scalar() == 0
    SDB.eliminar_corte(motor, cid2)
