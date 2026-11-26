# syntax=docker/dockerfile:1.7
# Inicialización de MinIO (buckets con versionado y usuarios de servicio) con el script dentro de la imagen.
# Contexto de build: 6-Codigo-Fuente-Proyecto/. MC_IMAGEN permite cambiar el cliente mc (MinIO dejó de publicar en Docker Hub).
ARG MC_IMAGEN=minio/mc:RELEASE.2025-08-13T08-35-41Z
FROM ${MC_IMAGEN}
COPY --chmod=755 infra/local/minio-init.sh /init.sh
ENTRYPOINT ["/bin/sh", "/init.sh"]
