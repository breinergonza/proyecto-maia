# syntax=docker/dockerfile:1.7
# Postgres con el script que crea la base y el usuario de MLflow ya dentro de la imagen (on-premise no se usan
# bind mounts del repositorio). Contexto de build: proyecto-codigo/.
FROM postgres:16
COPY --chmod=755 infra/local/initdb/ /docker-entrypoint-initdb.d/
