# syntax=docker/dockerfile:1.7
# Servidor de MLflow: backend en Postgres (base mlflow) y artefactos en MinIO (bucket maia-mlflow).
# Los clientes (trainer) suben los artefactos a través del servidor (--serve-artifacts): no necesitan claves de MinIO.
# Variables: MLFLOW_DB_PASSWORD, MLFLOW_S3_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (usuario maia-mlflow).
# Autenticación nativa (--app-name basic-auth): usuarios y permisos en la misma base mlflow (tablas propias, versión en
# alembic_version_auth). El administrador se crea en el primer arranque con MLFLOW_TRACKING_USERNAME / MLFLOW_TRACKING_PASSWORD
# (las mismas que usan trainer y API); después cambiar la variable no cambia la clave: se cambia en MLflow (ver README).
# MLFLOW_FLASK_SERVER_SECRET_KEY firma las sesiones y el CSRF de la interfaz.
FROM python:3.13-slim
RUN pip install --no-cache-dir "mlflow[auth]==3.17.1""psycopg[binary]>=3.3" "boto3>=1.40" \
    && useradd --create-home --uid 10001 mlflow
COPY --chmod=755 <<'EOF' /usr/local/bin/iniciar-mlflow
#!/bin/sh
set -eu
: "${MLFLOW_TRACKING_PASSWORD:?defina MLFLOW_TRACKING_PASSWORD (clave del administrador de MLflow)}"
: "${MLFLOW_FLASK_SERVER_SECRET_KEY:?defina MLFLOW_FLASK_SERVER_SECRET_KEY}"
BASE="postgresql+psycopg://mlflow:${MLFLOW_DB_PASSWORD}@postgres:5432/mlflow"
export MLFLOW_AUTH_ADMIN_USERNAME="${MLFLOW_TRACKING_USERNAME:-admin}" MLFLOW_AUTH_ADMIN_PASSWORD="$MLFLOW_TRACKING_PASSWORD"
export MLFLOW_AUTH_CONFIG_PATH="$HOME/basic_auth.ini"
umask 077                                   # el .ini lleva la clave de la base
cat > "$MLFLOW_AUTH_CONFIG_PATH" <<INI
[mlflow]
default_permission = NO_PERMISSIONS
database_uri = $BASE
authorization_function = mlflow.server.auth:authenticate_request_basic_auth
INI
exec mlflow server --host 0.0.0.0 --port 5000 --app-name basic-auth \
  --backend-store-uri "$BASE" \
  --artifacts-destination s3://maia-mlflow --serve-artifacts \
  --allowed-hosts "${MLFLOW_ALLOWED_HOSTS:-mlflow,mlflow:5000,localhost,localhost:5000,127.0.0.1,127.0.0.1:5000}"
EOF
USER mlflow
EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health')"
CMD ["iniciar-mlflow"]
