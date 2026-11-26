#!/bin/sh
# Lo corre el contenedor minio-init (imagen minio/mc) cada vez que se levanta el compose. Es idempotente:
# crea los cuatro buckets con versionado y dos usuarios de servicio con permisos acotados.
set -eu
mc alias set local "${MINIO_URL:-http://minio:9000}" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

for b in maia-sevarti maia-mlflow maia-salidas maia-paquetes; do
  mc mb --ignore-existing "local/$b" >/dev/null
  mc version enable "local/$b" >/dev/null
done

cat > /tmp/politica-maia.json <<'JSON'
{"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": ["s3:*"],
  "Resource": ["arn:aws:s3:::maia-sevarti", "arn:aws:s3:::maia-sevarti/*",
               "arn:aws:s3:::maia-salidas", "arn:aws:s3:::maia-salidas/*",
               "arn:aws:s3:::maia-paquetes", "arn:aws:s3:::maia-paquetes/*"]}]}
JSON
cat > /tmp/politica-mlflow.json <<'JSON'
{"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": ["s3:*"],
  "Resource": ["arn:aws:s3:::maia-mlflow", "arn:aws:s3:::maia-mlflow/*"]}]}
JSON
mc admin policy create local maia-servicio /tmp/politica-maia.json >/dev/null 2>&1 || true
mc admin policy create local maia-mlflow /tmp/politica-mlflow.json >/dev/null 2>&1 || true

mc admin user add local "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
mc admin policy attach local maia-servicio --user "$MINIO_ACCESS_KEY" >/dev/null 2>&1 || true
mc admin user add local "$MLFLOW_MINIO_ACCESS_KEY" "$MLFLOW_MINIO_SECRET_KEY" >/dev/null
mc admin policy attach local maia-mlflow --user "$MLFLOW_MINIO_ACCESS_KEY" >/dev/null 2>&1 || true
echo "MinIO listo: buckets con versionado y usuarios de servicio."
