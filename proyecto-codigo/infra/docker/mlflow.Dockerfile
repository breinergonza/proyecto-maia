# syntax=docker/dockerfile:1.7
# Servidor de MLflow: backend en Postgres (base mlflow) y artefactos en MinIO (bucket maia-mlflow).
# Los clientes (trainer) suben los artefactos a través del servidor (--serve-artifacts): no necesitan claves de MinIO.
# Variables: MLFLOW_DB_PASSWORD, MLFLOW_S3_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (usuario maia-mlflow).
FROM python:3.13-slim
RUN pip install --no-cache-dir "mlflow==3.17.1" "psycopg[binary]>=3.3" "boto3>=1.40" \
    && useradd --create-home --uid 10001 mlflow
COPY --chmod=755 <<'EOF' /usr/local/bin/iniciar-mlflow
#!/bin/sh
set -eu
exec mlflow server --host 0.0.0.0 --port 5000 \
  --backend-store-uri "postgresql+psycopg://mlflow:${MLFLOW_DB_PASSWORD}@postgres:5432/mlflow" \
  --artifacts-destination s3://maia-mlflow --serve-artifacts \
  --allowed-hosts "${MLFLOW_ALLOWED_HOSTS:-mlflow,mlflow:5000,localhost,localhost:5000,127.0.0.1,127.0.0.1:5000}"
EOF
USER mlflow
EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health')"
CMD ["iniciar-mlflow"]
