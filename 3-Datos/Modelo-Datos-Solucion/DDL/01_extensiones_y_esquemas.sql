-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- DDL 01 · Extensiones, esquemas y tabla de versiones
-- ==============================================================================================================
-- Se ejecuta conectado a la base "maia" con su usuario dueño (ver 00_base_de_datos_y_roles.sql).
--
-- citext  : correos sin distinguir mayúsculas (app.usuarios.email).
-- pgcrypto: gen_random_uuid() para los identificadores de usuarios y sesiones.
-- sevarti   : el corte de datos con el contrato SEVARTI (sujetos, etapas, mediciones, episodios...).
-- resultados: lo que producen las corridas (alertas de datos, riesgos, crecimiento) y las revisiones.
-- app       : la aplicación (usuarios, sesiones, paquetes, configuración, cola de ejecuciones, auditoría).
-- public.alembic_version: revisión de las migraciones; con ella "alembic upgrade" sabe desde dónde seguir.
--
-- Generado el 2026-11-26 desde las migraciones de Alembic (revisión 0014) aplicadas a PostgreSQL 16.
-- Fuente de verdad: 6-Codigo-Fuente-Proyecto/plataforma/comun/maia_comun/alembic/versions/
-- ==============================================================================================================

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE SCHEMA IF NOT EXISTS sevarti;
CREATE SCHEMA IF NOT EXISTS resultados;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);

--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);

--
-- PostgreSQL database dump complete
--
