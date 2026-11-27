-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- DDL completo en un solo archivo
-- ==============================================================================================================
-- Equivale a ejecutar 01 a 05 en orden. Uso: psql -d maia -v ON_ERROR_STOP=1 -f ddl_completo.sql
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
-- Name: resultados; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS resultados;

--
-- Name: sevarti; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS sevarti;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

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
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);

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
-- Name: cortes id; Type: DEFAULT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.cortes ALTER COLUMN id SET DEFAULT nextval('sevarti.cortes_id_seq'::regclass);

--
-- Name: auditoria pk_auditoria; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.auditoria
    ADD CONSTRAINT pk_auditoria PRIMARY KEY (id);

--
-- Name: conexion_origen pk_conexion_origen; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.conexion_origen
    ADD CONSTRAINT pk_conexion_origen PRIMARY KEY (fuente);

--
-- Name: config_notificaciones pk_config_notificaciones; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.config_notificaciones
    ADD CONSTRAINT pk_config_notificaciones PRIMARY KEY (desenlace);

--
-- Name: config_smtp pk_config_smtp; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.config_smtp
    ADD CONSTRAINT pk_config_smtp PRIMARY KEY (id);

--
-- Name: cuotas_config pk_cuotas_config; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.cuotas_config
    ADD CONSTRAINT pk_cuotas_config PRIMARY KEY (clave);

--
-- Name: diccionarios pk_diccionarios; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diccionarios
    ADD CONSTRAINT pk_diccionarios PRIMARY KEY (id);

--
-- Name: ejecuciones pk_ejecuciones; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ejecuciones
    ADD CONSTRAINT pk_ejecuciones PRIMARY KEY (id);

--
-- Name: hiperparametros pk_hiperparametros; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hiperparametros
    ADD CONSTRAINT pk_hiperparametros PRIMARY KEY (modelo);

--
-- Name: muestras pk_muestras; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.muestras
    ADD CONSTRAINT pk_muestras PRIMARY KEY (id);

--
-- Name: ninos_nuevos pk_ninos_nuevos; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ninos_nuevos
    ADD CONSTRAINT pk_ninos_nuevos PRIMARY KEY (id);

--
-- Name: notificaciones pk_notificaciones; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones
    ADD CONSTRAINT pk_notificaciones PRIMARY KEY (id);

--
-- Name: notificaciones_config pk_notificaciones_config; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones_config
    ADD CONSTRAINT pk_notificaciones_config PRIMARY KEY (id);

--
-- Name: notificaciones_config_alertas pk_notificaciones_config_alertas; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones_config_alertas
    ADD CONSTRAINT pk_notificaciones_config_alertas PRIMARY KEY (notificacion_id, desenlace);

--
-- Name: paquetes pk_paquetes; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.paquetes
    ADD CONSTRAINT pk_paquetes PRIMARY KEY (version);

--
-- Name: programaciones pk_programaciones; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.programaciones
    ADD CONSTRAINT pk_programaciones PRIMARY KEY (id);

--
-- Name: refresh_tokens pk_refresh_tokens; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.refresh_tokens
    ADD CONSTRAINT pk_refresh_tokens PRIMARY KEY (id);

--
-- Name: usuarios pk_usuarios; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.usuarios
    ADD CONSTRAINT pk_usuarios PRIMARY KEY (id);

--
-- Name: diccionarios uq_diccionarios_version; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diccionarios
    ADD CONSTRAINT uq_diccionarios_version UNIQUE (version);

--
-- Name: notificaciones_config uq_notificaciones_config_nombre; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones_config
    ADD CONSTRAINT uq_notificaciones_config_nombre UNIQUE (nombre);

--
-- Name: notificaciones uq_notificaciones_riesgo_id_destinatario; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones
    ADD CONSTRAINT uq_notificaciones_riesgo_id_destinatario UNIQUE (riesgo_id, destinatario);

--
-- Name: refresh_tokens uq_refresh_tokens_hash_token; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.refresh_tokens
    ADD CONSTRAINT uq_refresh_tokens_hash_token UNIQUE (hash_token);

--
-- Name: usuarios uq_usuarios_email; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.usuarios
    ADD CONSTRAINT uq_usuarios_email UNIQUE (email);

--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);

--
-- Name: alarmas_grupo pk_alarmas_grupo; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.alarmas_grupo
    ADD CONSTRAINT pk_alarmas_grupo PRIMARY KEY (id);

--
-- Name: alertas_dato pk_alertas_dato; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.alertas_dato
    ADD CONSTRAINT pk_alertas_dato PRIMARY KEY (id);

--
-- Name: analitica pk_analitica; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.analitica
    ADD CONSTRAINT pk_analitica PRIMARY KEY (id);

--
-- Name: corridas pk_corridas; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.corridas
    ADD CONSTRAINT pk_corridas PRIMARY KEY (id);

--
-- Name: crecimiento pk_crecimiento; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.crecimiento
    ADD CONSTRAINT pk_crecimiento PRIMARY KEY (id);

--
-- Name: desenlaces_observados pk_desenlaces_observados; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.desenlaces_observados
    ADD CONSTRAINT pk_desenlaces_observados PRIMARY KEY (id);

--
-- Name: metricas_modelo pk_metricas_modelo; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.metricas_modelo
    ADD CONSTRAINT pk_metricas_modelo PRIMARY KEY (id);

--
-- Name: predicciones pk_predicciones; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.predicciones
    ADD CONSTRAINT pk_predicciones PRIMARY KEY (id);

--
-- Name: revision_datos pk_revision_datos; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.revision_datos
    ADD CONSTRAINT pk_revision_datos PRIMARY KEY (alerta_id, usuario_id);

--
-- Name: revision_riesgos pk_revision_riesgos; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.revision_riesgos
    ADD CONSTRAINT pk_revision_riesgos PRIMARY KEY (riesgo_id, usuario_id);

--
-- Name: riesgos pk_riesgos; Type: CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.riesgos
    ADD CONSTRAINT pk_riesgos PRIMARY KEY (id);

--
-- Name: atributos_sujeto pk_atributos_sujeto; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.atributos_sujeto
    ADD CONSTRAINT pk_atributos_sujeto PRIMARY KEY (corte_id, sujeto, variable);

--
-- Name: cortes pk_cortes; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.cortes
    ADD CONSTRAINT pk_cortes PRIMARY KEY (id);

--
-- Name: episodios pk_episodios; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.episodios
    ADD CONSTRAINT pk_episodios PRIMARY KEY (corte_id, id);

--
-- Name: esquema pk_esquema; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.esquema
    ADD CONSTRAINT pk_esquema PRIMARY KEY (corte_id, variable);

--
-- Name: etapas pk_etapas; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.etapas
    ADD CONSTRAINT pk_etapas PRIMARY KEY (corte_id, etapa);

--
-- Name: mediciones pk_mediciones; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.mediciones
    ADD CONSTRAINT pk_mediciones PRIMARY KEY (corte_id, id);

--
-- Name: quiebres pk_quiebres; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.quiebres
    ADD CONSTRAINT pk_quiebres PRIMARY KEY (corte_id, quiebre);

--
-- Name: resumen_sujeto pk_resumen_sujeto; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.resumen_sujeto
    ADD CONSTRAINT pk_resumen_sujeto PRIMARY KEY (corte_id, sujeto);

--
-- Name: sujetos pk_sujetos; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.sujetos
    ADD CONSTRAINT pk_sujetos PRIMARY KEY (corte_id, sujeto);

--
-- Name: cortes uq_cortes_fuente_fecha_corte; Type: CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.cortes
    ADD CONSTRAINT uq_cortes_fuente_fecha_corte UNIQUE (fuente, fecha_corte);

--
-- Name: ix_diccionarios_un_vigente; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX ix_diccionarios_un_vigente ON app.diccionarios USING btree (estado) WHERE (estado = 'vigente'::text);

--
-- Name: ix_ejecuciones_estado_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_ejecuciones_estado_id ON app.ejecuciones USING btree (estado, id);

--
-- Name: ix_ninos_nuevos_propietario_id_tipo; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_ninos_nuevos_propietario_id_tipo ON app.ninos_nuevos USING btree (propietario_id, tipo);

--
-- Name: ix_refresh_tokens_usuario_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ix_refresh_tokens_usuario_id ON app.refresh_tokens USING btree (usuario_id);

--
-- Name: ix_alarmas_grupo_corrida_id; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_alarmas_grupo_corrida_id ON resultados.alarmas_grupo USING btree (corrida_id);

--
-- Name: ix_alertas_dato_corrida_id_prioridad; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_alertas_dato_corrida_id_prioridad ON resultados.alertas_dato USING btree (corrida_id, prioridad);

--
-- Name: ix_alertas_dato_corrida_id_sujeto; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_alertas_dato_corrida_id_sujeto ON resultados.alertas_dato USING btree (corrida_id, sujeto);

--
-- Name: ix_analitica_entrenamiento_id_tipo; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_analitica_entrenamiento_id_tipo ON resultados.analitica USING btree (entrenamiento_id, tipo);

--
-- Name: ix_crecimiento_corrida_id_sujeto; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_crecimiento_corrida_id_sujeto ON resultados.crecimiento USING btree (corrida_id, sujeto);

--
-- Name: ix_desenlaces_observados_corrida_id_familia; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_desenlaces_observados_corrida_id_familia ON resultados.desenlaces_observados USING btree (corrida_id, familia);

--
-- Name: ix_desenlaces_observados_corrida_id_sujeto; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_desenlaces_observados_corrida_id_sujeto ON resultados.desenlaces_observados USING btree (corrida_id, sujeto);

--
-- Name: ix_metricas_modelo_corrida_id; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_metricas_modelo_corrida_id ON resultados.metricas_modelo USING btree (corrida_id);

--
-- Name: ix_predicciones_usuario_id_id; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_predicciones_usuario_id_id ON resultados.predicciones USING btree (usuario_id, id);

--
-- Name: ix_riesgos_corrida_id_clave_percentil; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_riesgos_corrida_id_clave_percentil ON resultados.riesgos USING btree (corrida_id, clave, percentil);

--
-- Name: ix_riesgos_corrida_id_sujeto; Type: INDEX; Schema: resultados; Owner: -
--

CREATE INDEX ix_riesgos_corrida_id_sujeto ON resultados.riesgos USING btree (corrida_id, sujeto);

--
-- Name: ix_atributos_sujeto_corte_id_variable_valor; Type: INDEX; Schema: sevarti; Owner: -
--

CREATE INDEX ix_atributos_sujeto_corte_id_variable_valor ON sevarti.atributos_sujeto USING btree (corte_id, variable, valor);

--
-- Name: ix_episodios_corte_id_sujeto; Type: INDEX; Schema: sevarti; Owner: -
--

CREATE INDEX ix_episodios_corte_id_sujeto ON sevarti.episodios USING btree (corte_id, sujeto);

--
-- Name: ix_mediciones_corte_id_sujeto; Type: INDEX; Schema: sevarti; Owner: -
--

CREATE INDEX ix_mediciones_corte_id_sujeto ON sevarti.mediciones USING btree (corte_id, sujeto);

--
-- Name: conexion_origen fk_conexion_origen_actualizado_por_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.conexion_origen
    ADD CONSTRAINT fk_conexion_origen_actualizado_por_usuarios FOREIGN KEY (actualizado_por) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: config_smtp fk_config_smtp_actualizado_por_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.config_smtp
    ADD CONSTRAINT fk_config_smtp_actualizado_por_usuarios FOREIGN KEY (actualizado_por) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: cuotas_config fk_cuotas_config_actualizado_por_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.cuotas_config
    ADD CONSTRAINT fk_cuotas_config_actualizado_por_usuarios FOREIGN KEY (actualizado_por) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: diccionarios fk_diccionarios_creado_por_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diccionarios
    ADD CONSTRAINT fk_diccionarios_creado_por_usuarios FOREIGN KEY (creado_por) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: ejecuciones fk_ejecuciones_programacion_id_programaciones; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ejecuciones
    ADD CONSTRAINT fk_ejecuciones_programacion_id_programaciones FOREIGN KEY (programacion_id) REFERENCES app.programaciones(id) ON DELETE SET NULL;

--
-- Name: ejecuciones fk_ejecuciones_solicitada_por_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ejecuciones
    ADD CONSTRAINT fk_ejecuciones_solicitada_por_usuarios FOREIGN KEY (solicitada_por) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: hiperparametros fk_hiperparametros_actualizado_por_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hiperparametros
    ADD CONSTRAINT fk_hiperparametros_actualizado_por_usuarios FOREIGN KEY (actualizado_por) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: muestras fk_muestras_corte_id_cortes; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.muestras
    ADD CONSTRAINT fk_muestras_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE SET NULL;

--
-- Name: muestras fk_muestras_propietario_id_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.muestras
    ADD CONSTRAINT fk_muestras_propietario_id_usuarios FOREIGN KEY (propietario_id) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: ninos_nuevos fk_ninos_nuevos_propietario_id_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ninos_nuevos
    ADD CONSTRAINT fk_ninos_nuevos_propietario_id_usuarios FOREIGN KEY (propietario_id) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: notificaciones_config_alertas fk_notif_config_alertas_notificacion_id; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones_config_alertas
    ADD CONSTRAINT fk_notif_config_alertas_notificacion_id FOREIGN KEY (notificacion_id) REFERENCES app.notificaciones_config(id) ON DELETE CASCADE;

--
-- Name: notificaciones fk_notificaciones_notificacion_config_id_notificaciones_config; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones
    ADD CONSTRAINT fk_notificaciones_notificacion_config_id_notificaciones_config FOREIGN KEY (notificacion_config_id) REFERENCES app.notificaciones_config(id) ON DELETE SET NULL;

--
-- Name: notificaciones fk_notificaciones_riesgo_id_riesgos; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.notificaciones
    ADD CONSTRAINT fk_notificaciones_riesgo_id_riesgos FOREIGN KEY (riesgo_id) REFERENCES resultados.riesgos(id) ON DELETE CASCADE;

--
-- Name: paquetes fk_paquetes_subido_por_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.paquetes
    ADD CONSTRAINT fk_paquetes_subido_por_usuarios FOREIGN KEY (subido_por) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: programaciones fk_programaciones_creado_por_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.programaciones
    ADD CONSTRAINT fk_programaciones_creado_por_usuarios FOREIGN KEY (creado_por) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: refresh_tokens fk_refresh_tokens_usuario_id_usuarios; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.refresh_tokens
    ADD CONSTRAINT fk_refresh_tokens_usuario_id_usuarios FOREIGN KEY (usuario_id) REFERENCES app.usuarios(id) ON DELETE CASCADE;

--
-- Name: alarmas_grupo fk_alarmas_grupo_corrida_id_corridas; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.alarmas_grupo
    ADD CONSTRAINT fk_alarmas_grupo_corrida_id_corridas FOREIGN KEY (corrida_id) REFERENCES resultados.corridas(id) ON DELETE CASCADE;

--
-- Name: alertas_dato fk_alertas_dato_corrida_id_corridas; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.alertas_dato
    ADD CONSTRAINT fk_alertas_dato_corrida_id_corridas FOREIGN KEY (corrida_id) REFERENCES resultados.corridas(id) ON DELETE CASCADE;

--
-- Name: corridas fk_corridas_corte_id_cortes; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.corridas
    ADD CONSTRAINT fk_corridas_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE SET NULL;

--
-- Name: crecimiento fk_crecimiento_corrida_id_corridas; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.crecimiento
    ADD CONSTRAINT fk_crecimiento_corrida_id_corridas FOREIGN KEY (corrida_id) REFERENCES resultados.corridas(id) ON DELETE CASCADE;

--
-- Name: desenlaces_observados fk_desenlaces_observados_corrida_id_corridas; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.desenlaces_observados
    ADD CONSTRAINT fk_desenlaces_observados_corrida_id_corridas FOREIGN KEY (corrida_id) REFERENCES resultados.corridas(id) ON DELETE CASCADE;

--
-- Name: metricas_modelo fk_metricas_modelo_corrida_id_corridas; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.metricas_modelo
    ADD CONSTRAINT fk_metricas_modelo_corrida_id_corridas FOREIGN KEY (corrida_id) REFERENCES resultados.corridas(id) ON DELETE CASCADE;

--
-- Name: predicciones fk_predicciones_usuario_id_usuarios; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.predicciones
    ADD CONSTRAINT fk_predicciones_usuario_id_usuarios FOREIGN KEY (usuario_id) REFERENCES app.usuarios(id) ON DELETE SET NULL;

--
-- Name: revision_datos fk_revision_datos_alerta_id_alertas_dato; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.revision_datos
    ADD CONSTRAINT fk_revision_datos_alerta_id_alertas_dato FOREIGN KEY (alerta_id) REFERENCES resultados.alertas_dato(id) ON DELETE CASCADE;

--
-- Name: revision_datos fk_revision_datos_usuario_id_usuarios; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.revision_datos
    ADD CONSTRAINT fk_revision_datos_usuario_id_usuarios FOREIGN KEY (usuario_id) REFERENCES app.usuarios(id) ON DELETE CASCADE;

--
-- Name: revision_riesgos fk_revision_riesgos_riesgo_id_riesgos; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.revision_riesgos
    ADD CONSTRAINT fk_revision_riesgos_riesgo_id_riesgos FOREIGN KEY (riesgo_id) REFERENCES resultados.riesgos(id) ON DELETE CASCADE;

--
-- Name: revision_riesgos fk_revision_riesgos_usuario_id_usuarios; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.revision_riesgos
    ADD CONSTRAINT fk_revision_riesgos_usuario_id_usuarios FOREIGN KEY (usuario_id) REFERENCES app.usuarios(id) ON DELETE CASCADE;

--
-- Name: riesgos fk_riesgos_corrida_id_corridas; Type: FK CONSTRAINT; Schema: resultados; Owner: -
--

ALTER TABLE ONLY resultados.riesgos
    ADD CONSTRAINT fk_riesgos_corrida_id_corridas FOREIGN KEY (corrida_id) REFERENCES resultados.corridas(id) ON DELETE CASCADE;

--
-- Name: atributos_sujeto fk_atributos_sujeto_corte_id_cortes; Type: FK CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.atributos_sujeto
    ADD CONSTRAINT fk_atributos_sujeto_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE CASCADE;

--
-- Name: episodios fk_episodios_corte_id_cortes; Type: FK CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.episodios
    ADD CONSTRAINT fk_episodios_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE CASCADE;

--
-- Name: esquema fk_esquema_corte_id_cortes; Type: FK CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.esquema
    ADD CONSTRAINT fk_esquema_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE CASCADE;

--
-- Name: etapas fk_etapas_corte_id_cortes; Type: FK CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.etapas
    ADD CONSTRAINT fk_etapas_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE CASCADE;

--
-- Name: mediciones fk_mediciones_corte_id_cortes; Type: FK CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.mediciones
    ADD CONSTRAINT fk_mediciones_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE CASCADE;

--
-- Name: quiebres fk_quiebres_corte_id_cortes; Type: FK CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.quiebres
    ADD CONSTRAINT fk_quiebres_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE CASCADE;

--
-- Name: resumen_sujeto fk_resumen_sujeto_corte_id_cortes; Type: FK CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.resumen_sujeto
    ADD CONSTRAINT fk_resumen_sujeto_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE CASCADE;

--
-- Name: sujetos fk_sujetos_corte_id_cortes; Type: FK CONSTRAINT; Schema: sevarti; Owner: -
--

ALTER TABLE ONLY sevarti.sujetos
    ADD CONSTRAINT fk_sujetos_corte_id_cortes FOREIGN KEY (corte_id) REFERENCES sevarti.cortes(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--
