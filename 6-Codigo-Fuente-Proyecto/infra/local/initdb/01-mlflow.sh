#!/bin/bash
# Lo ejecuta la imagen de Postgres solo la primera vez (volumen vacío): crea la base y el usuario de MLflow.
# La base "maia" y su usuario los crea la imagen con POSTGRES_USER / POSTGRES_DB.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mlflow') THEN
      CREATE ROLE mlflow LOGIN PASSWORD '${MLFLOW_DB_PASSWORD}';
    END IF;
  END
  \$\$;
EOSQL
if ! psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='mlflow'" | grep -q 1; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE mlflow OWNER mlflow"
fi
