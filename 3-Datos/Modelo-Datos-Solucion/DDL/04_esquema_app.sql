-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- DDL 04 · Esquema app (aplicación web y operación)
-- ==============================================================================================================
-- Incluye el tipo enumerado app.rol: admin, experto, datos y visualizador (Consulta).
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
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS app;

--
-- Name: rol; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.rol AS ENUM (
    'admin',
    'experto',
    'datos',
    'visualizador'
);

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auditoria; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.auditoria (
    id bigint NOT NULL,
    usuario_id uuid,
    accion text NOT NULL,
    recurso text,
    detalle jsonb,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: auditoria_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.auditoria_id_seq OWNED BY app.auditoria.id;

--
-- Name: conexion_origen; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.conexion_origen (
    fuente text NOT NULL,
    host text NOT NULL,
    puerto integer DEFAULT 5432 NOT NULL,
    base text NOT NULL,
    usuario text NOT NULL,
    esquema text DEFAULT 'consumo'::text NOT NULL,
    sslmode text DEFAULT 'require'::text NOT NULL,
    timeout integer DEFAULT 20 NOT NULL,
    clave_cifrada text,
    actualizado_por uuid,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_conexion_origen_ck_conexion_origen_fuente CHECK ((fuente = 'kmc'::text))
);

--
-- Name: config_notificaciones; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.config_notificaciones (
    desenlace text NOT NULL,
    nombre text,
    percentil_minimo double precision DEFAULT 95 NOT NULL,
    destinatarios text[] DEFAULT '{}'::text[] NOT NULL,
    activo boolean DEFAULT false NOT NULL
);

--
-- Name: config_smtp; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.config_smtp (
    id integer NOT NULL,
    host text NOT NULL,
    puerto integer NOT NULL,
    usuario text,
    clave_cifrada text,
    remitente text NOT NULL,
    tls boolean DEFAULT false NOT NULL,
    actualizado_por uuid,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_config_smtp_ck_config_smtp_unica CHECK ((id = 1))
);

--
-- Name: config_smtp_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.config_smtp_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: config_smtp_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.config_smtp_id_seq OWNED BY app.config_smtp.id;

--
-- Name: cuotas_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.cuotas_config (
    clave text NOT NULL,
    valor integer NOT NULL,
    actualizado_por uuid,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: diccionarios; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.diccionarios (
    id integer NOT NULL,
    version integer NOT NULL,
    archivo bytea NOT NULL,
    sha256 text NOT NULL,
    estado text DEFAULT 'borrador'::text NOT NULL,
    origen text NOT NULL,
    nota text,
    creado_por uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_diccionarios_ck_diccionarios_estado CHECK ((estado = ANY (ARRAY['vigente'::text, 'borrador'::text, 'archivado'::text]))),
    CONSTRAINT ck_diccionarios_ck_diccionarios_origen CHECK ((origen = ANY (ARRAY['subido'::text, 'corrida'::text, 'semilla'::text])))
);

--
-- Name: diccionarios_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.diccionarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: diccionarios_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.diccionarios_id_seq OWNED BY app.diccionarios.id;

--
-- Name: ejecuciones; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.ejecuciones (
    id integer NOT NULL,
    tipo text NOT NULL,
    origen text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    programacion_id integer,
    fuente text NOT NULL,
    parametros jsonb DEFAULT '{}'::jsonb NOT NULL,
    resultado jsonb,
    registro text,
    mensaje text,
    solicitada_por uuid,
    creada_en timestamp with time zone DEFAULT now() NOT NULL,
    iniciada timestamp with time zone,
    terminada timestamp with time zone,
    CONSTRAINT ck_ejecuciones_ck_ejecuciones_estado CHECK ((estado = ANY (ARRAY['pendiente'::text, 'en_curso'::text, 'ok'::text, 'error'::text]))),
    CONSTRAINT ck_ejecuciones_ck_ejecuciones_origen CHECK ((origen = ANY (ARRAY['programada'::text, 'manual'::text]))),
    CONSTRAINT ck_ejecuciones_ck_ejecuciones_tipo CHECK ((tipo = ANY (ARRAY['corrida'::text, 'aprobacion'::text, 'entrenamiento'::text])))
);

--
-- Name: ejecuciones_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.ejecuciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: ejecuciones_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.ejecuciones_id_seq OWNED BY app.ejecuciones.id;

--
-- Name: hiperparametros; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.hiperparametros (
    modelo text NOT NULL,
    valores jsonb DEFAULT '{}'::jsonb NOT NULL,
    actualizado_por uuid,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_hiperparametros_ck_hiperparametros_modelo CHECK ((modelo = ANY (ARRAY['anomalias'::text, 'clinico'::text])))
);

--
-- Name: muestras; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.muestras (
    id integer NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    fuente text NOT NULL,
    corte_id integer,
    version_diccionario integer,
    definicion jsonb NOT NULL,
    n_ninos integer NOT NULL,
    n_base integer NOT NULL,
    huella text NOT NULL,
    resumen jsonb,
    propietario_id uuid,
    creada timestamp with time zone DEFAULT now() NOT NULL,
    inmutable boolean DEFAULT false NOT NULL,
    CONSTRAINT ck_muestras_ck_muestras_fuente CHECK ((fuente = ANY (ARRAY['kmc'::text, 'simulado'::text])))
);

--
-- Name: muestras_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.muestras_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: muestras_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.muestras_id_seq OWNED BY app.muestras.id;

--
-- Name: ninos_nuevos; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.ninos_nuevos (
    id integer NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    propietario_id uuid,
    modelo text,
    visita text NOT NULL,
    perfil text,
    eg_semanas double precision,
    cambios jsonb NOT NULL,
    valores jsonb NOT NULL,
    resultado jsonb,
    creada timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_ninos_nuevos_ck_ninos_nuevos_tipo CHECK ((tipo = ANY (ARRAY['nino'::text, 'plantilla'::text])))
);

--
-- Name: ninos_nuevos_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.ninos_nuevos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: ninos_nuevos_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.ninos_nuevos_id_seq OWNED BY app.ninos_nuevos.id;

--
-- Name: notificaciones; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.notificaciones (
    id bigint NOT NULL,
    riesgo_id bigint NOT NULL,
    destinatario text NOT NULL,
    estado text NOT NULL,
    error text,
    enviado_en timestamp with time zone DEFAULT now() NOT NULL,
    notificacion_config_id integer,
    CONSTRAINT ck_notificaciones_estado CHECK ((estado = ANY (ARRAY['enviado'::text, 'error'::text])))
);

--
-- Name: notificaciones_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.notificaciones_config (
    id integer NOT NULL,
    nombre text NOT NULL,
    percentil_minimo double precision DEFAULT 95 NOT NULL,
    destinatarios text[] DEFAULT '{}'::text[] NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: notificaciones_config_alertas; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.notificaciones_config_alertas (
    notificacion_id integer NOT NULL,
    desenlace text NOT NULL
);

--
-- Name: notificaciones_config_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.notificaciones_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: notificaciones_config_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.notificaciones_config_id_seq OWNED BY app.notificaciones_config.id;

--
-- Name: notificaciones_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.notificaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: notificaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.notificaciones_id_seq OWNED BY app.notificaciones.id;

--
-- Name: paquetes; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.paquetes (
    version text NOT NULL,
    fuente text NOT NULL,
    manifest jsonb NOT NULL,
    ruta text NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    subido_por uuid,
    subido_en timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: programaciones; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.programaciones (
    id integer NOT NULL,
    nombre text NOT NULL,
    fuente text DEFAULT 'kmc'::text NOT NULL,
    cron text NOT NULL,
    zona text DEFAULT 'America/Bogota'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    silencio boolean DEFAULT false NOT NULL,
    solo_si_nuevo boolean DEFAULT true NOT NULL,
    parametros jsonb DEFAULT '{}'::jsonb NOT NULL,
    proxima timestamp with time zone,
    ultima timestamp with time zone,
    creado_por uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_programaciones_ck_programaciones_fuente CHECK ((fuente = ANY (ARRAY['kmc'::text, 'simulado'::text])))
);

--
-- Name: programaciones_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.programaciones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: programaciones_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.programaciones_id_seq OWNED BY app.programaciones.id;

--
-- Name: refresh_tokens; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    hash_token text NOT NULL,
    expira timestamp with time zone NOT NULL,
    revocado boolean DEFAULT false NOT NULL
);

--
-- Name: usuarios; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email public.citext NOT NULL,
    nombre text NOT NULL,
    hash_clave text NOT NULL,
    rol app.rol NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_ingreso timestamp with time zone
);

--
-- Name: auditoria id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.auditoria ALTER COLUMN id SET DEFAULT nextval('app.auditoria_id_seq'::regclass);

--
-- Name: config_smtp id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.config_smtp ALTER COLUMN id SET DEFAULT nextval('app.config_smtp_id_seq'::regclass);

--
-- Name: diccionarios id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diccionarios ALTER COLUMN id SET DEFAULT nextval('app.diccionarios_id_seq'::regclass);

--
-- Name: ejecuciones id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ejecuciones ALTER COLUMN id SET DEFAULT nextval('app.ejecuciones_id_seq'::regclass);

--
-- Name: muestras id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.muestras ALTER COLUMN id SET DEFAULT nextval('app.muestras_id_seq'::regclass);

--
-- Name: ninos_nuevos id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ninos_nuevos ALTER COLUMN id SET DEFAULT nextval('app.ninos_nuevos_id_seq'::regclass);

--
-- Name: notificaciones id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones ALTER COLUMN id SET DEFAULT nextval('app.notificaciones_id_seq'::regclass);

--
-- Name: notificaciones_config id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones_config ALTER COLUMN id SET DEFAULT nextval('app.notificaciones_config_id_seq'::regclass);

--
-- Name: programaciones id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.programaciones ALTER COLUMN id SET DEFAULT nextval('app.programaciones_id_seq'::regclass);

--
-- PostgreSQL database dump complete
--
