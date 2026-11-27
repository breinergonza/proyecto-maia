-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- DDL 00 · Bases de datos y roles
-- ==============================================================================================================
-- Crea las dos bases que usa la solución en el mismo servidor PostgreSQL 16:
--   maia   : la de la aplicación (esquemas sevarti, resultados y app). Su dueño es el rol maia.
--   mlflow : la de MLflow (experimentos y registro de modelos). La llena MLflow solo; no tiene DDL propio aquí.
--
-- Uso, como superusuario y conectado a la base "postgres" (las claves nunca se escriben en este archivo):
--   psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--        -v clave_maia='<clave de maia>' -v clave_mlflow='<clave de mlflow>' -f 00_base_de_datos_y_roles.sql
--
-- Con docker compose no hace falta: la imagen postgres:16 crea la base y el rol maia (POSTGRES_USER y
-- POSTGRES_DB) y 6-Codigo-Fuente-Proyecto/infra/local/initdb/01-mlflow.sh crea mlflow.
-- ==============================================================================================================

CREATE ROLE maia LOGIN PASSWORD :'clave_maia';
CREATE DATABASE maia OWNER maia ENCODING 'UTF8' TEMPLATE template0;

CREATE ROLE mlflow LOGIN PASSWORD :'clave_mlflow';
CREATE DATABASE mlflow OWNER mlflow ENCODING 'UTF8' TEMPLATE template0;
