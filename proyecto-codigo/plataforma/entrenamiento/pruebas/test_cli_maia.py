"""La CLI maia de punta a punta con datos simulados: MinIO (moto), Postgres y MLflow (sqlite) temporales.

simular -> entrenar ambos -> registro y alias -> exportar paquete firmado -> corrida -> silencio retrospectivo.
"""
import json
import tarfile

import pandas as pd
import pytest
from sqlalchemy import create_engine, text
from typer.testing import CliRunner

pytestmark = [pytest.mark.integracion, pytest.mark.timeout(1800)]


@pytest.fixture(scope='module')
def entorno(url_db, s3, tmp_path_factory):
    from archivos import carpetas as CA
    from archivos.carpetas import Carpetas
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('maia')
    mp = pytest.MonkeyPatch()
    for k, v in {'MINIO_URL': s3, 'MINIO_ACCESS_KEY': 'prueba', 'MINIO_SECRET_KEY': 'prueba-secreta',
                 'DATABASE_URL': url_db, 'MLFLOW_TRACKING_URI': f'sqlite:///{tmp}/mlflow.db',
                 'MAIA_PAQUETE_CLAVE': 'clave-de-prueba-larga', 'MAIA_RAIZ': str(tmp / 'raiz'),
                 'SMTP_HOST': '127.0.0.1', 'SMTP_PORT': '1'}.items():
        mp.setenv(k, v)
    mp.setattr(CA, 'PROYECTO', Carpetas(tmp / 'raiz'))
    mp.chdir(tmp)
    config.obtener.cache_clear()
    db.motor.cache_clear()
    (tmp / 'rapido.json').write_text(json.dumps({'rondas': 40}))
    yield tmp
    mp.undo()
    config.obtener.cache_clear()
    db.motor.cache_clear()


def _maia(*args):
    from maia_entrenamiento.cli import app
    r = CliRunner().invoke(app, list(args), catch_exceptions=False)
    print(r.output)
    assert r.exit_code == 0, r.output
    return r.output


def test_flujo_completo_con_datos_simulados(entorno, url_db):
    from maia_comun import paquete as PQ
    from maia_comun.almacen import BUCKET_PAQUETES, Almacen

    salida = _maia('verificar-gpu', '--no-medir')
    assert salida.splitlines()[0] in ('cpu', 'cuda')

    assert 'Corte simulado 2026-06-30' in _maia('simular', '--sujetos', '2500', '--semilla', '5', '--cargar')
    salida = _maia('entrenar', 'anomalias', '--config', str(entorno / 'rapido.json'), '--sin-validacion')
    assert 'maia-anomalias-demo v1 (alias candidato)' in salida
    salida = _maia('entrenar', 'clinico')
    assert 'maia-clinico-demo v1 (alias candidato)' in salida
    assert 'auc__' in salida

    salida = _maia('modelos')
    assert 'maia-anomalias-demo' in salida and 'maia-clinico-demo' in salida and 'candidato' in salida
    assert 'produccion' in _maia('promover', 'clinico', '--version', '1')

    salida = _maia('exportar', '--modelo-clinico', 'produccion')
    version = salida.split('Paquete ', 1)[1].split(' ', 1)[0]
    almacen = Almacen.desde_config()
    ruta = almacen.bajar_archivo(BUCKET_PAQUETES, f'simulado/{version}/paquete.tar.gz', entorno / 'p.tar.gz')
    contenido = PQ.verificar(ruta, 'clave-de-prueba-larga', entorno / 'ver', solo_simulado=True)
    assert contenido.manifest['fuente'] == 'simulado'
    assert contenido.manifest['modelos']['clinico']['version'] == '1'
    assert any(k.startswith('auc__') for k in contenido.manifest['metricas'])
    with tarfile.open(ruta) as t:
        nombres = t.getnames()
    assert 'sevarti_base/esquema.parquet' in nombres and 'anomalias/ficha.json' in nombres
    modelos = PQ.cargar(contenido)
    assert modelos.clinico.modelos

    salida = _maia('corrida', '--fuente', 'simulado', '--sin-entrenar', '--alias', 'candidato')
    assert 'Corrida' in salida and 'terminada' in salida
    motor = create_engine(url_db)
    with motor.connect() as cx:
        estado, resumen = cx.execute(text("SELECT estado, resumen FROM resultados.corridas WHERE tipo = 'completa' "
                                          'ORDER BY id DESC LIMIT 1')).one()
        assert estado == 'ok'
        assert resumen['datos_revisar'] > 0 and resumen['datos_crecimiento'] > 0
        assert cx.execute(text('SELECT count(*) FROM resultados.alertas_dato')).scalar() == resumen['datos_revisar']
        assert cx.execute(text('SELECT count(*) FROM resultados.crecimiento')).scalar() == resumen['datos_crecimiento']
        assert cx.execute(text('SELECT count(*) FROM resultados.metricas_modelo')).scalar() > 0
    assert len(resumen['archivos']) == 2

    salida = _maia('silencio-retrospectivo', '--corte', '2025-09-30')
    assert 'Riesgos calculados el 2025-09-30' in salida


def test_metricas_de_validacion_clinica_tienen_nombres_validos():
    from maia_comun.metricas import metricas_clinicas, nombre_metrica
    tabla = pd.DataFrame({'AUC': [0.8], 'AUC regla simple': [0.6], 'casos en el riesgo más alto (%)': [40.0]},
                         index=['readmisión (3 meses)'])
    m = metricas_clinicas(tabla, None, {'readmisión (3 meses)': 'readm'})
    assert m['auc__readm'] == 0.8 and m['top10__readm'] == 40.0 and m['desenlaces_que_superan_la_regla'] == 1
    assert nombre_metrica('casos en el riesgo más alto (%)') == 'casos en el riesgo más alto pct'


def test_config_de_archivo_se_valida_como_en_la_web(tmp_path):
    """``maia entrenar --config``: los hiperparámetros de la web con sus límites; lo demás, campos del núcleo."""
    from maia_entrenamiento import entrenar as E
    f = tmp_path / 'config.json'
    f.write_text('{"alpha": 0.002, "dispositivo": "cpu"}', encoding='utf-8')
    cfg = E.config_anomalias(str(f))
    assert cfg.alpha == 0.002 and cfg.dispositivo == 'cpu'
    for malo, texto in (('{"alpha": 0.5}', 'entre'), ('{"alfa": 0.002}', 'no es un parámetro')):
        f.write_text(malo, encoding='utf-8')
        with pytest.raises(ValueError, match=texto):
            E.config_anomalias(str(f))

