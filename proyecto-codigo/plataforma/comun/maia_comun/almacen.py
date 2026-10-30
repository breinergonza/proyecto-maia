"""Cliente de MinIO (API S3) y los cuatro buckets del proyecto (sección 4.5 del plan).

* ``maia-sevarti``: cortes inmutables, ``cortes/{fuente}/{AAAA-MM-DD}/{tabla}.parquet`` y ``corte.json``.
* ``maia-mlflow``: artefactos de MLflow (los escribe el servidor de MLflow).
* ``maia-salidas``: entregables Excel, ``corridas/{corrida_id}/...``. Tienen datos por niño: solo local.
* ``maia-paquetes``: paquetes firmados, ``{fuente}/{version}/paquete.tar.gz``.

Solo se usa en el equipo local; la API en Railway no tiene MinIO.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from maia_comun.config import Configuracion, obtener

BUCKET_SEVARTI = 'maia-sevarti'
BUCKET_MLFLOW = 'maia-mlflow'
BUCKET_SALIDAS = 'maia-salidas'
BUCKET_PAQUETES = 'maia-paquetes'
BUCKETS = (BUCKET_SEVARTI, BUCKET_MLFLOW, BUCKET_SALIDAS, BUCKET_PAQUETES)


@dataclass
class Almacen:
    cliente: object

    @classmethod
    def desde_config(cls, cfg: Configuracion | None = None) -> Almacen:
        cfg = cfg or obtener()
        cliente = boto3.client(
            's3', endpoint_url=cfg.minio_url, aws_access_key_id=cfg.minio_access_key,
            aws_secret_access_key=cfg.minio_secret_key, region_name='us-east-1',
            config=BotoConfig(signature_version='s3v4', s3={'addressing_style': 'path'},
                              retries={'max_attempts': 5, 'mode': 'standard'}))
        return cls(cliente)

    # ------------------------------------------------------------- buckets
    def asegurar_buckets(self, buckets: tuple[str, ...] = BUCKETS) -> None:
        """Crea los buckets que falten (minio-init los crea en compose; esto es para pruebas y arranques limpios).

        Se pregunta bucket por bucket: el usuario de servicio no ve ``maia-mlflow`` (es del usuario de MLflow), así que
        ``list_buckets`` no dice si existe. Un 403 es un bucket que existe y es de otro servicio: se deja como está."""
        for b in buckets:
            try:
                self.cliente.head_bucket(Bucket=b)
                continue
            except ClientError as e:
                codigo = e.response.get('Error', {}).get('Code')
                if codigo in ('403', 'AccessDenied', 'Forbidden'):
                    continue
                if codigo not in ('404', 'NoSuchBucket', 'NotFound'):
                    raise
            self.cliente.create_bucket(Bucket=b)
            self.cliente.put_bucket_versioning(Bucket=b, VersioningConfiguration={'Status': 'Enabled'})

    # ------------------------------------------------------------- objetos
    def subir_archivo(self, ruta: Path, bucket: str, clave: str) -> str:
        self.cliente.upload_file(str(ruta), bucket, clave)
        return f's3://{bucket}/{clave}'

    def bajar_archivo(self, bucket: str, clave: str, destino: Path) -> Path:
        destino.parent.mkdir(parents=True, exist_ok=True)
        self.cliente.download_file(bucket, clave, str(destino))
        return destino

    def existe(self, bucket: str, clave: str) -> bool:
        try:
            self.cliente.head_object(Bucket=bucket, Key=clave)
            return True
        except ClientError as e:
            if e.response.get('Error', {}).get('Code') in ('404', 'NoSuchKey', 'NotFound'):
                return False
            raise

    def listar(self, bucket: str, prefijo: str = '') -> list[str]:
        claves: list[str] = []
        paginador = self.cliente.get_paginator('list_objects_v2')
        for pagina in paginador.paginate(Bucket=bucket, Prefix=prefijo):
            claves += [o['Key'] for o in pagina.get('Contents', [])]
        return sorted(claves)

    def subir_carpeta(self, carpeta: Path, bucket: str, prefijo: str) -> str:
        prefijo = prefijo.rstrip('/') + '/'
        for ruta in sorted(p for p in carpeta.rglob('*') if p.is_file()):
            self.subir_archivo(ruta, bucket, prefijo + ruta.relative_to(carpeta).as_posix())
        return f's3://{bucket}/{prefijo}'

    def bajar_carpeta(self, bucket: str, prefijo: str, destino: Path) -> Path:
        prefijo = prefijo.rstrip('/') + '/'
        claves = self.listar(bucket, prefijo)
        if not claves:
            raise FileNotFoundError(f'No hay nada en s3://{bucket}/{prefijo}')
        for clave in claves:
            self.bajar_archivo(bucket, clave, destino / clave[len(prefijo):])
        return destino


def separar_uri(uri: str) -> tuple[str, str]:
    """``s3://bucket/a/b`` -> (``bucket``, ``a/b``)."""
    if not uri.startswith('s3://'):
        raise ValueError(f'No es una ruta s3://: {uri}')
    bucket, _, clave = uri[5:].partition('/')
    return bucket, clave
