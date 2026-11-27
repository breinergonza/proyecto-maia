-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- DDL 03 · Esquema resultados (salidas de los modelos)
-- ==============================================================================================================
-- Cada corrida (resultados.corridas) produce alertas de datos, riesgos, crecimiento y métricas.
-- Las revisiones de los expertos (revision_datos, revision_riesgos) cuelgan de esas filas.
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
-- Name: resultados; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS resultados;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alarmas_grupo; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.alarmas_grupo (
    id bigint NOT NULL,
    corrida_id integer NOT NULL,
    grupo text,
    periodo text,
    variable text,
    etiqueta text,
    senal text,
    valor double precision,
    referencia double precision,
    estadistico double precision,
    que_paso text
);

--
-- Name: alarmas_grupo_id_seq; Type: SEQUENCE; Schema: resultados; Owner: -
--

CREATE SEQUENCE resultados.alarmas_grupo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: alarmas_grupo_id_seq; Type: SEQUENCE OWNED BY; Schema: resultados; Owner: -
--

ALTER SEQUENCE resultados.alarmas_grupo_id_seq OWNED BY resultados.alarmas_grupo.id;

--
-- Name: alertas_dato; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.alertas_dato (
    id bigint NOT NULL,
    corrida_id integer NOT NULL,
    sujeto text NOT NULL,
    variable text NOT NULL,
    etiqueta text,
    unidad text,
    etapa text,
    fecha date,
    valor text,
    esperado double precision,
    rango_bajo double precision,
    rango_alto double precision,
    capas text[] NOT NULL,
    motivo text,
    fuerza double precision,
    prioridad integer NOT NULL
);

--
-- Name: alertas_dato_id_seq; Type: SEQUENCE; Schema: resultados; Owner: -
--

CREATE SEQUENCE resultados.alertas_dato_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: alertas_dato_id_seq; Type: SEQUENCE OWNED BY; Schema: resultados; Owner: -
--

ALTER SEQUENCE resultados.alertas_dato_id_seq OWNED BY resultados.alertas_dato.id;

--
-- Name: analitica; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.analitica (
    id integer NOT NULL,
    entrenamiento_id integer NOT NULL,
    ejecucion_id integer,
    modelo text NOT NULL,
    desenlace text,
    tipo text NOT NULL,
    datos jsonb NOT NULL,
    creada timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: analitica_id_seq; Type: SEQUENCE; Schema: resultados; Owner: -
--

CREATE SEQUENCE resultados.analitica_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: analitica_id_seq; Type: SEQUENCE OWNED BY; Schema: resultados; Owner: -
--

ALTER SEQUENCE resultados.analitica_id_seq OWNED BY resultados.analitica.id;

--
-- Name: corridas; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.corridas (
    id integer NOT NULL,
    corte_id integer,
    fuente text,
    fecha_corte date,
    tipo text NOT NULL,
    estado text DEFAULT 'en_curso'::text NOT NULL,
    silencio boolean DEFAULT false NOT NULL,
    modelo_anomalias text,
    modelo_clinico text,
    paquete text,
    dispositivo text,
    paso text,
    resumen jsonb,
    iniciada timestamp with time zone DEFAULT now() NOT NULL,
    terminada timestamp with time zone,
    mensaje text,
    CONSTRAINT ck_corridas_estado CHECK ((estado = ANY (ARRAY['en_curso'::text, 'ok'::text, 'error'::text]))),
    CONSTRAINT ck_corridas_tipo CHECK ((tipo = ANY (ARRAY['completa'::text, 'revision'::text, 'riesgos'::text, 'demo'::text])))
);

--
-- Name: corridas_id_seq; Type: SEQUENCE; Schema: resultados; Owner: -
--

CREATE SEQUENCE resultados.corridas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: corridas_id_seq; Type: SEQUENCE OWNED BY; Schema: resultados; Owner: -
--

ALTER SEQUENCE resultados.corridas_id_seq OWNED BY resultados.corridas.id;

--
-- Name: crecimiento; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.crecimiento (
    id bigint NOT NULL,
    corrida_id integer NOT NULL,
    sujeto text NOT NULL,
    etapa text,
    indicador text NOT NULL,
    fecha date,
    edad_corregida double precision,
    valor double precision,
    z double precision,
    bajo_2de boolean DEFAULT false NOT NULL,
    caida_1de boolean DEFAULT false NOT NULL,
    improbable boolean DEFAULT false NOT NULL,
    variable text
);

--
-- Name: crecimiento_id_seq; Type: SEQUENCE; Schema: resultados; Owner: -
--

CREATE SEQUENCE resultados.crecimiento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: crecimiento_id_seq; Type: SEQUENCE OWNED BY; Schema: resultados; Owner: -
--

ALTER SEQUENCE resultados.crecimiento_id_seq OWNED BY resultados.crecimiento.id;

--
-- Name: desenlaces_observados; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.desenlaces_observados (
    id bigint NOT NULL,
    corrida_id integer NOT NULL,
    sujeto text NOT NULL,
    familia text NOT NULL,
    valor boolean NOT NULL
);

--
-- Name: desenlaces_observados_id_seq; Type: SEQUENCE; Schema: resultados; Owner: -
--

CREATE SEQUENCE resultados.desenlaces_observados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: desenlaces_observados_id_seq; Type: SEQUENCE OWNED BY; Schema: resultados; Owner: -
--

ALTER SEQUENCE resultados.desenlaces_observados_id_seq OWNED BY resultados.desenlaces_observados.id;

--
-- Name: metricas_modelo; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.metricas_modelo (
    id integer NOT NULL,
    corrida_id integer,
    modelo text NOT NULL,
    version text NOT NULL,
    clave text NOT NULL,
    metrica text NOT NULL,
    valor double precision
);

--
-- Name: metricas_modelo_id_seq; Type: SEQUENCE; Schema: resultados; Owner: -
--

CREATE SEQUENCE resultados.metricas_modelo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: metricas_modelo_id_seq; Type: SEQUENCE OWNED BY; Schema: resultados; Owner: -
--

ALTER SEQUENCE resultados.metricas_modelo_id_seq OWNED BY resultados.metricas_modelo.id;

--
-- Name: predicciones; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.predicciones (
    id integer NOT NULL,
    usuario_id uuid,
    tipo text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    modelo text,
    parametros jsonb NOT NULL,
    progreso integer DEFAULT 0 NOT NULL,
    paso text,
    n_filtro integer,
    n_puntuados integer,
    agregados jsonb,
    mensaje text,
    creada timestamp with time zone DEFAULT now() NOT NULL,
    iniciada timestamp with time zone,
    terminada timestamp with time zone,
    vence timestamp with time zone,
    CONSTRAINT ck_predicciones_ck_predicciones_estado CHECK ((estado = ANY (ARRAY['pendiente'::text, 'en_curso'::text, 'ok'::text, 'error'::text]))),
    CONSTRAINT ck_predicciones_ck_predicciones_tipo CHECK ((tipo = ANY (ARRAY['muestra'::text, 'universo'::text])))
);

--
-- Name: predicciones_id_seq; Type: SEQUENCE; Schema: resultados; Owner: -
--

CREATE SEQUENCE resultados.predicciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: predicciones_id_seq; Type: SEQUENCE OWNED BY; Schema: resultados; Owner: -
--

ALTER SEQUENCE resultados.predicciones_id_seq OWNED BY resultados.predicciones.id;

--
-- Name: revision_datos; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.revision_datos (
    alerta_id bigint NOT NULL,
    usuario_id uuid NOT NULL,
    es_error text NOT NULL,
    comentario text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_revision_datos_es_error CHECK ((es_error = ANY (ARRAY['si'::text, 'no'::text, 'no_se'::text])))
);

--
-- Name: revision_riesgos; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.revision_riesgos (
    riesgo_id bigint NOT NULL,
    usuario_id uuid NOT NULL,
    preocupa text NOT NULL,
    comentario text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_revision_riesgos_preocupa CHECK ((preocupa = ANY (ARRAY['si'::text, 'no'::text, 'no_se'::text])))
);

--
-- Name: riesgos; Type: TABLE; Schema: resultados; Owner: -
--

CREATE TABLE resultados.riesgos (
    id bigint NOT NULL,
    corrida_id integer NOT NULL,
    sujeto text NOT NULL,
    clave text NOT NULL,
    desenlace text NOT NULL,
    momento text NOT NULL,
    riesgo double precision NOT NULL,
    percentil double precision NOT NULL,
    motivos jsonb NOT NULL,
    fecha_visita date,
    silencio boolean DEFAULT false NOT NULL
);

--
-- Name: riesgos_id_seq; Type: SEQUENCE; Schema: resultados; Owner: -
--

CREATE SEQUENCE resultados.riesgos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: riesgos_id_seq; Type: SEQUENCE OWNED BY; Schema: resultados; Owner: -
--

ALTER SEQUENCE resultados.riesgos_id_seq OWNED BY resultados.riesgos.id;

--
-- Name: alarmas_grupo id; Type: DEFAULT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.alarmas_grupo ALTER COLUMN id SET DEFAULT nextval('resultados.alarmas_grupo_id_seq'::regclass);

--
-- Name: alertas_dato id; Type: DEFAULT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.alertas_dato ALTER COLUMN id SET DEFAULT nextval('resultados.alertas_dato_id_seq'::regclass);

--
-- Name: analitica id; Type: DEFAULT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.analitica ALTER COLUMN id SET DEFAULT nextval('resultados.analitica_id_seq'::regclass);

--
-- Name: corridas id; Type: DEFAULT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.corridas ALTER COLUMN id SET DEFAULT nextval('resultados.corridas_id_seq'::regclass);

--
-- Name: crecimiento id; Type: DEFAULT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.crecimiento ALTER COLUMN id SET DEFAULT nextval('resultados.crecimiento_id_seq'::regclass);

--
-- Name: desenlaces_observados id; Type: DEFAULT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.desenlaces_observados ALTER COLUMN id SET DEFAULT nextval('resultados.desenlaces_observados_id_seq'::regclass);

--
-- Name: metricas_modelo id; Type: DEFAULT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.metricas_modelo ALTER COLUMN id SET DEFAULT nextval('resultados.metricas_modelo_id_seq'::regclass);

--
-- Name: predicciones id; Type: DEFAULT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.predicciones ALTER COLUMN id SET DEFAULT nextval('resultados.predicciones_id_seq'::regclass);

--
-- Name: riesgos id; Type: DEFAULT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.riesgos ALTER COLUMN id SET DEFAULT nextval('resultados.riesgos_id_seq'::regclass);

--
-- PostgreSQL database dump complete
--
