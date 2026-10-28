"""MLflow: un run por entrenamiento, el modelo en el Model Registry y los alias ``candidato`` y ``produccion``.

Solo se registran métricas agregadas, parámetros, la ficha y el modelo. Nunca tablas por niño.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
from dataclasses import asdict, is_dataclass
from pathlib import Path

import mlflow
import pandas as pd
from mlflow import MlflowClient
from mlflow.entities.model_registry import ModelVersion

from maia_comun.config import obtener
from maia_comun.metricas import metricas_anomalias, metricas_clinicas, nombre_metrica  # noqa: F401

EXPERIMENTOS = {'anomalias': 'maia-anomalias', 'clinico': 'maia-clinico', 'experimentos': 'maia-experimentos-desenlaces'}
ALIAS_CANDIDATO, ALIAS_PRODUCCION = 'candidato', 'produccion'
REQUISITOS = ['pandas>=3.0', 'numpy>=2.5', 'lightgbm==4.7.0', 'scipy>=1.15', 'pyarrow>=20', 'openpyxl>=3.1']


def configurar(uri: str | None = None) -> None:
    mlflow.set_tracking_uri(uri or os.environ.get('MLFLOW_TRACKING_URI') or obtener().mlflow_tracking_uri)


def experimento(clave: str) -> str:
    nombre = EXPERIMENTOS[clave]
    if mlflow.get_experiment_by_name(nombre) is None:
        mlflow.create_experiment(nombre)
    mlflow.set_experiment(nombre)
    return nombre


def _git_sha() -> str:
    if sha := os.environ.get('MAIA_GIT_SHA'):
        return sha
    try:
        return subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True, timeout=5,
                              check=True).stdout.strip() or 'desconocido'
    except (OSError, subprocess.SubprocessError):
        return 'desconocido'


def params_de(cfg) -> dict[str, str]:
    d = asdict(cfg) if is_dataclass(cfg) else dict(cfg)
    salida = {}
    for k, v in d.items():
        if k in ('desenlaces', 'medidas', 'descartados'):
            v = json.dumps(v, default=str, ensure_ascii=False)
        texto = str(v)
        salida[f'cfg.{k}'] = texto if len(texto) <= 6000 else texto[:5990] + '…'
    return salida


def params_extraccion(parametros: dict | None, consulta_sha: str | None) -> dict[str, str]:
    """Los parámetros de extracción del corte como params de MLflow (``extraccion.*``): solo filtros, nunca datos."""
    salida = {f'extraccion.{k}': str(v) for k, v in (parametros or {}).items() if v is not None}
    if consulta_sha:
        salida['extraccion.consulta_sha'] = consulta_sha
    return salida


def _etiquetas_ejecucion() -> dict[str, str]:
    """Si el programador lanzó el entrenamiento: qué ejecución (y qué programación) de ``app.ejecuciones``."""
    return {k: v for k, v in (('ejecucion', os.environ.get('MAIA_EJECUCION_ID')),
                               ('programacion', os.environ.get('MAIA_PROGRAMACION_ID'))) if v}


def _codigo() -> list[str]:
    import anomalias
    import archivos
    import clinico
    import retroalimentacion
    import sevarti
    from maia_entrenamiento import envolturas
    return [str(Path(m.__file__).parent) for m in (sevarti, anomalias, clinico, retroalimentacion, archivos)] + \
        [envolturas.__file__]


def registrar(tipo: str, fuente: str, carpeta_modelo: Path, cfg, metricas: dict[str, float], etiquetas: dict[str, str],
              nombre_registro: str, artefactos: dict[str, Path] | None = None,
              extraccion: dict[str, str] | None = None) -> ModelVersion:
    """Un run con params, tags, métricas y artefactos; el modelo pyfunc registrado con alias ``candidato``.
    ``extraccion`` (de ``params_extraccion``) dice con qué parámetros se extrajo el corte."""
    from maia_entrenamiento.envolturas import EnvolturaAnomalias, EnvolturaClinico

    experimento(tipo)
    ficha = json.loads((carpeta_modelo / 'ficha.json').read_text(encoding='utf-8'))
    with mlflow.start_run(run_name=f'{tipo} {fuente} {ficha.get("corte_datos")} {ficha["version"]}') as run:
        mlflow.log_params({**params_de(cfg), **(extraccion or {})})
        mlflow.set_tags({'fuente': fuente, 'corte': str(ficha.get('corte_datos')), 'version_modelo': ficha['version'],
                         'version_codigo': str(ficha.get('version_codigo')), 'n_sujetos': str(ficha.get('sujetos')),
                         'git_sha': _git_sha(), 'host': socket.gethostname(), **_etiquetas_ejecucion(),
                         **({'consulta_sha': extraccion['extraccion.consulta_sha']}
                            if extraccion and 'extraccion.consulta_sha' in extraccion else {}),
                         **etiquetas})
        if metricas:
            mlflow.log_metrics(metricas)
        mlflow.log_dict(ficha, 'ficha.json')
        for nombre, ruta in (artefactos or {}).items():
            if ruta.is_dir():
                mlflow.log_artifacts(str(ruta), nombre)
            else:
                mlflow.log_artifact(str(ruta), nombre)
        envoltura = EnvolturaAnomalias() if tipo == 'anomalias' else EnvolturaClinico()
        info = mlflow.pyfunc.log_model(name='modelo', python_model=envoltura, artifacts={'carpeta': str(carpeta_modelo)},
                                       code_paths=_codigo(), pip_requirements=REQUISITOS,
                                       registered_model_name=nombre_registro)
        cliente = MlflowClient()
        version = _version_de_run(cliente, nombre_registro, run.info.run_id, info)
        cliente.set_registered_model_alias(nombre_registro, ALIAS_CANDIDATO, version.version)
        cliente.set_model_version_tag(nombre_registro, version.version, 'version_modelo', ficha['version'])
        cliente.set_model_version_tag(nombre_registro, version.version, 'fuente', fuente)
        return cliente.get_model_version(nombre_registro, version.version)


def _version_de_run(cliente: MlflowClient, nombre: str, run_id: str, info) -> ModelVersion:
    v = getattr(info, 'registered_model_version', None)
    if v is not None:
        return cliente.get_model_version(nombre, str(v))
    versiones = cliente.search_model_versions(f"name='{nombre}' and run_id='{run_id}'")
    if not versiones:
        raise RuntimeError(f'MLflow no registró el modelo {nombre} del run {run_id}')
    return max(versiones, key=lambda x: int(x.version))


def version(nombre_registro: str, alias_o_numero: str) -> ModelVersion:
    cliente = MlflowClient()
    if alias_o_numero.isdigit():
        return cliente.get_model_version(nombre_registro, alias_o_numero)
    return cliente.get_model_version_by_alias(nombre_registro, alias_o_numero)


def promover(nombre_registro: str, numero: str, alias: str = ALIAS_PRODUCCION) -> ModelVersion:
    cliente = MlflowClient()
    cliente.get_model_version(nombre_registro, numero)   # falla si no existe
    cliente.set_registered_model_alias(nombre_registro, alias, numero)
    return cliente.get_model_version(nombre_registro, numero)


def descargar(nombre_registro: str, alias_o_numero: str, destino: Path | None = None) -> tuple[ModelVersion, Path, Path]:
    """La versión pedida: su metadato, la carpeta del modelo del núcleo (con ``ficha.json``) y la carpeta del run
    (artefactos ``sevarti_base`` y ``diccionario``)."""
    mv = version(nombre_registro, alias_o_numero)
    destino = Path(destino or tempfile.mkdtemp(prefix='maia-modelo-'))
    raiz = Path(mlflow.artifacts.download_artifacts(artifact_uri=f'models:/{nombre_registro}/{mv.version}',
                                                    dst_path=str(destino / 'modelo')))
    fichas = list(raiz.rglob('ficha.json'))
    if not fichas:
        raise FileNotFoundError(f'El modelo {nombre_registro} v{mv.version} no trae ficha.json')
    run_dir = Path(mlflow.artifacts.download_artifacts(run_id=mv.run_id, artifact_path='', dst_path=str(destino / 'run')))
    return mv, fichas[0].parent, run_dir


def modelos_registrados() -> pd.DataFrame:
    cliente = MlflowClient()
    filas = []
    for rm in cliente.search_registered_models():
        alias = {v: k for k, v in (rm.aliases or {}).items()}
        for mv in cliente.search_model_versions(f"name='{rm.name}'"):
            filas.append(dict(modelo=rm.name, version=int(mv.version), alias=alias.get(mv.version, ''),
                              version_modelo=(mv.tags or {}).get('version_modelo', ''),
                              creado=pd.Timestamp(mv.creation_timestamp, unit='ms').strftime('%Y-%m-%d %H:%M'),
                              run_id=mv.run_id))
    return pd.DataFrame(filas).sort_values(['modelo', 'version'], ascending=[True, False]) if filas else pd.DataFrame()
