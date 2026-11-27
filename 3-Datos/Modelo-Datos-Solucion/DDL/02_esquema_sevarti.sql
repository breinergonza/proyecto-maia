-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- DDL 02 · Esquema sevarti (contrato de datos SEVARTI)
-- ==============================================================================================================
-- Un corte (sevarti.cortes) agrupa todo lo extraído en una fecha; las demás tablas cuelgan de él por corte_id.
-- Las llaves primarias, únicas y foráneas se crean en 05_llaves_restricciones_e_indices.sql.
--
-- Generado el 2026-11-26 desde las migraciones de Alembic (revisión 0014) aplicadas a PostgreSQL 16.
-- Fuente de verdad: 6-Codigo-Fuente-Proyecto/plataforma/comun/maia_comun/alembic/versions/
-- ==============================================================================================================

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: sevarti; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS sevarti;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: atributos_sujeto; Type: TABLE; Schema: sevarti; Owner: -
--

CREATE TABLE sevarti.atributos_sujeto (
    corte_id integer NOT NULL,
    sujeto text NOT NULL,
    variable text NOT NULL,
    valor text NOT NULL,
    valor_num double precision
);

--
-- Name: cortes; Type: TABLE; Schema: sevarti; Owner: -
--

CREATE TABLE sevarti.cortes (
    id integer NOT NULL,
    fuente text NOT NULL,
    fecha_corte date NOT NULL,
    ruta_minio text,
    sha256 text,
    filas jsonb NOT NULL,
    vigente boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    parametros jsonb,
    consulta_sha text,
    CONSTRAINT ck_cortes_fuente CHECK ((fuente = ANY (ARRAY['kmc'::text, 'simulado'::text])))
);

--
-- Name: cortes_id_seq; Type: SEQUENCE; Schema: sevarti; Owner: -
--

CREATE SEQUENCE sevarti.cortes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: cortes_id_seq; Type: SEQUENCE OWNED BY; Schema: sevarti; Owner: -
--

ALTER SEQUENCE sevarti.cortes_id_seq OWNED BY sevarti.cortes.id;

--
-- Name: episodios; Type: TABLE; Schema: sevarti; Owner: -
--

CREATE TABLE sevarti.episodios (
    corte_id integer NOT NULL,
    id bigint NOT NULL,
    sujeto text NOT NULL,
    tipo text NOT NULL,
    edad_inicio double precision,
    edad_fin double precision
);

--
-- Name: esquema; Type: TABLE; Schema: sevarti; Owner: -
--

CREATE TABLE sevarti.esquema (
    corte_id integer NOT NULL,
    variable text NOT NULL,
    datos jsonb NOT NULL
);

--
-- Name: etapas; Type: TABLE; Schema: sevarti; Owner: -
--

CREATE TABLE sevarti.etapas (
    corte_id integer NOT NULL,
    etapa text NOT NULL,
    orden integer NOT NULL,
    edad_min double precision,
    edad_max double precision,
    base text NOT NULL,
    nombre text
);

--
-- Name: mediciones; Type: TABLE; Schema: sevarti; Owner: -
--

CREATE TABLE sevarti.mediciones (
    corte_id integer NOT NULL,
    id bigint NOT NULL,
    sujeto text NOT NULL,
    variable text NOT NULL,
    valor text,
    fecha date,
    edad_dias double precision
);

--
-- Name: quiebres; Type: TABLE; Schema: sevarti; Owner: -
--

CREATE TABLE sevarti.quiebres (
    corte_id integer NOT NULL,
    quiebre text NOT NULL,
    fecha date
);

--
-- Name: resumen_sujeto; Type: TABLE; Schema: sevarti; Owner: -
--

CREATE TABLE sevarti.resumen_sujeto (
    corte_id integer NOT NULL,
    sujeto text NOT NULL,
    n_datos integer NOT NULL
);

--
-- Name: sujetos; Type: TABLE; Schema: sevarti; Owner: -
--

CREATE TABLE sevarti.sujetos (
    corte_id integer NOT NULL,
    sujeto text NOT NULL,
    grupo text,
    fecha_nacimiento date,
    anio_nacimiento integer,
    eg_semanas double precision
);

--
-- Name: cortes id; Type: DEFAULT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.cortes ALTER COLUMN id SET DEFAULT nextval('sevarti.cortes_id_seq'::regclass);

--
-- PostgreSQL database dump complete
--
