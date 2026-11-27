-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- Historial de migraciones 0001 a 0014 (alembic upgrade head --sql)
-- ==============================================================================================================
-- Muestra cómo evolucionó el modelo de datos, migración por migración, con el SQL que ejecuta Alembic.
-- Es de consulta: para crear la base use 01-05, ddl_completo.sql o "make migrar".
-- Incluye las pocas sentencias DML de las migraciones de datos (0004, 0012 y 0014).
--
-- Generado el 2026-11-26 desde las migraciones de Alembic (revisión 0014) aplicadas a PostgreSQL 16.
-- Fuente de verdad: 6-Codigo-Fuente-Proyecto/plataforma/comun/maia_comun/alembic/versions/
-- ==============================================================================================================

BEGIN;

CREATE TABLE public.alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001

CREATE EXTENSION IF NOT EXISTS citext;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS sevarti;

CREATE SCHEMA IF NOT EXISTS resultados;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE app.auditoria (
    id BIGSERIAL NOT NULL, 
    usuario_id UUID, 
    accion TEXT NOT NULL, 
    recurso TEXT, 
    detalle JSONB, 
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_auditoria PRIMARY KEY (id)
);

CREATE TABLE app.config_notificaciones (
    desenlace TEXT NOT NULL, 
    nombre TEXT, 
    percentil_minimo FLOAT DEFAULT 95 NOT NULL, 
    destinatarios TEXT[] DEFAULT '{}' NOT NULL, 
    activo BOOLEAN DEFAULT false NOT NULL, 
    CONSTRAINT pk_config_notificaciones PRIMARY KEY (desenlace)
);

CREATE TYPE app.rol AS ENUM ('admin', 'experto', 'visualizador');

CREATE TABLE app.usuarios (
    id UUID DEFAULT gen_random_uuid() NOT NULL, 
    email CITEXT NOT NULL, 
    nombre TEXT NOT NULL, 
    hash_clave TEXT NOT NULL, 
    rol app.rol NOT NULL, 
    activo BOOLEAN DEFAULT true NOT NULL, 
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    ultimo_ingreso TIMESTAMP WITH TIME ZONE, 
    CONSTRAINT pk_usuarios PRIMARY KEY (id), 
    CONSTRAINT uq_usuarios_email UNIQUE (email)
);

CREATE TABLE sevarti.cortes (
    id SERIAL NOT NULL, 
    fuente TEXT NOT NULL, 
    fecha_corte DATE NOT NULL, 
    ruta_minio TEXT, 
    sha256 TEXT, 
    filas JSONB NOT NULL, 
    vigente BOOLEAN DEFAULT false NOT NULL, 
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_cortes PRIMARY KEY (id), 
    CONSTRAINT ck_cortes_fuente CHECK (fuente IN ('kmc','simulado')), 
    CONSTRAINT uq_cortes_fuente_fecha_corte UNIQUE (fuente, fecha_corte)
);

CREATE TABLE app.paquetes (
    version TEXT NOT NULL, 
    fuente TEXT NOT NULL, 
    manifest JSONB NOT NULL, 
    ruta TEXT NOT NULL, 
    activo BOOLEAN DEFAULT false NOT NULL, 
    subido_por UUID, 
    subido_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_paquetes PRIMARY KEY (version), 
    CONSTRAINT fk_paquetes_subido_por_usuarios FOREIGN KEY(subido_por) REFERENCES app.usuarios (id) ON DELETE SET NULL
);

CREATE TABLE app.refresh_tokens (
    id UUID DEFAULT gen_random_uuid() NOT NULL, 
    usuario_id UUID NOT NULL, 
    hash_token TEXT NOT NULL, 
    expira TIMESTAMP WITH TIME ZONE NOT NULL, 
    revocado BOOLEAN DEFAULT false NOT NULL, 
    CONSTRAINT pk_refresh_tokens PRIMARY KEY (id), 
    CONSTRAINT fk_refresh_tokens_usuario_id_usuarios FOREIGN KEY(usuario_id) REFERENCES app.usuarios (id) ON DELETE CASCADE, 
    CONSTRAINT uq_refresh_tokens_hash_token UNIQUE (hash_token)
);

CREATE INDEX ix_refresh_tokens_usuario_id ON app.refresh_tokens (usuario_id);

CREATE TABLE resultados.corridas (
    id SERIAL NOT NULL, 
    corte_id INTEGER, 
    fuente TEXT, 
    fecha_corte DATE, 
    tipo TEXT NOT NULL, 
    estado TEXT DEFAULT 'en_curso' NOT NULL, 
    silencio BOOLEAN DEFAULT false NOT NULL, 
    modelo_anomalias TEXT, 
    modelo_clinico TEXT, 
    paquete TEXT, 
    dispositivo TEXT, 
    paso TEXT, 
    resumen JSONB, 
    iniciada TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    terminada TIMESTAMP WITH TIME ZONE, 
    mensaje TEXT, 
    CONSTRAINT pk_corridas PRIMARY KEY (id), 
    CONSTRAINT ck_corridas_estado CHECK (estado IN ('en_curso','ok','error')), 
    CONSTRAINT ck_corridas_tipo CHECK (tipo IN ('completa','revision','riesgos','demo')), 
    CONSTRAINT fk_corridas_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE SET NULL
);

CREATE TABLE sevarti.episodios (
    corte_id INTEGER NOT NULL, 
    id BIGINT NOT NULL, 
    sujeto TEXT NOT NULL, 
    tipo TEXT NOT NULL, 
    edad_inicio FLOAT, 
    edad_fin FLOAT, 
    CONSTRAINT pk_episodios PRIMARY KEY (corte_id, id), 
    CONSTRAINT fk_episodios_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE CASCADE
);

CREATE INDEX ix_episodios_corte_id_sujeto ON sevarti.episodios (corte_id, sujeto);

CREATE TABLE sevarti.esquema (
    corte_id INTEGER NOT NULL, 
    variable TEXT NOT NULL, 
    datos JSONB NOT NULL, 
    CONSTRAINT pk_esquema PRIMARY KEY (corte_id, variable), 
    CONSTRAINT fk_esquema_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE CASCADE
);

CREATE TABLE sevarti.etapas (
    corte_id INTEGER NOT NULL, 
    etapa TEXT NOT NULL, 
    orden INTEGER NOT NULL, 
    edad_min FLOAT, 
    edad_max FLOAT, 
    base TEXT NOT NULL, 
    nombre TEXT, 
    CONSTRAINT pk_etapas PRIMARY KEY (corte_id, etapa), 
    CONSTRAINT fk_etapas_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE CASCADE
);

CREATE TABLE sevarti.mediciones (
    corte_id INTEGER NOT NULL, 
    id BIGINT NOT NULL, 
    sujeto TEXT NOT NULL, 
    variable TEXT NOT NULL, 
    valor TEXT, 
    fecha DATE, 
    edad_dias FLOAT, 
    CONSTRAINT pk_mediciones PRIMARY KEY (corte_id, id), 
    CONSTRAINT fk_mediciones_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE CASCADE
);

CREATE INDEX ix_mediciones_corte_id_sujeto ON sevarti.mediciones (corte_id, sujeto);

CREATE TABLE sevarti.quiebres (
    corte_id INTEGER NOT NULL, 
    quiebre TEXT NOT NULL, 
    fecha DATE, 
    CONSTRAINT pk_quiebres PRIMARY KEY (corte_id, quiebre), 
    CONSTRAINT fk_quiebres_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE CASCADE
);

CREATE TABLE sevarti.sujetos (
    corte_id INTEGER NOT NULL, 
    sujeto TEXT NOT NULL, 
    grupo TEXT, 
    fecha_nacimiento DATE, 
    anio_nacimiento INTEGER, 
    eg_semanas FLOAT, 
    CONSTRAINT pk_sujetos PRIMARY KEY (corte_id, sujeto), 
    CONSTRAINT fk_sujetos_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE CASCADE
);

CREATE TABLE resultados.alarmas_grupo (
    id BIGSERIAL NOT NULL, 
    corrida_id INTEGER NOT NULL, 
    grupo TEXT, 
    periodo TEXT, 
    variable TEXT, 
    etiqueta TEXT, 
    senal TEXT, 
    valor FLOAT, 
    referencia FLOAT, 
    estadistico FLOAT, 
    que_paso TEXT, 
    CONSTRAINT pk_alarmas_grupo PRIMARY KEY (id), 
    CONSTRAINT fk_alarmas_grupo_corrida_id_corridas FOREIGN KEY(corrida_id) REFERENCES resultados.corridas (id) ON DELETE CASCADE
);

CREATE INDEX ix_alarmas_grupo_corrida_id ON resultados.alarmas_grupo (corrida_id);

CREATE TABLE resultados.alertas_dato (
    id BIGSERIAL NOT NULL, 
    corrida_id INTEGER NOT NULL, 
    sujeto TEXT NOT NULL, 
    variable TEXT NOT NULL, 
    etiqueta TEXT, 
    unidad TEXT, 
    etapa TEXT, 
    fecha DATE, 
    valor TEXT, 
    esperado FLOAT, 
    rango_bajo FLOAT, 
    rango_alto FLOAT, 
    capas TEXT[] NOT NULL, 
    motivo TEXT, 
    fuerza FLOAT, 
    prioridad INTEGER NOT NULL, 
    CONSTRAINT pk_alertas_dato PRIMARY KEY (id), 
    CONSTRAINT fk_alertas_dato_corrida_id_corridas FOREIGN KEY(corrida_id) REFERENCES resultados.corridas (id) ON DELETE CASCADE
);

CREATE INDEX ix_alertas_dato_corrida_id_prioridad ON resultados.alertas_dato (corrida_id, prioridad);

CREATE INDEX ix_alertas_dato_corrida_id_sujeto ON resultados.alertas_dato (corrida_id, sujeto);

CREATE TABLE resultados.crecimiento (
    id BIGSERIAL NOT NULL, 
    corrida_id INTEGER NOT NULL, 
    sujeto TEXT NOT NULL, 
    etapa TEXT, 
    indicador TEXT NOT NULL, 
    fecha DATE, 
    edad_corregida FLOAT, 
    valor FLOAT, 
    z FLOAT, 
    bajo_2de BOOLEAN DEFAULT false NOT NULL, 
    caida_1de BOOLEAN DEFAULT false NOT NULL, 
    improbable BOOLEAN DEFAULT false NOT NULL, 
    CONSTRAINT pk_crecimiento PRIMARY KEY (id), 
    CONSTRAINT fk_crecimiento_corrida_id_corridas FOREIGN KEY(corrida_id) REFERENCES resultados.corridas (id) ON DELETE CASCADE
);

CREATE INDEX ix_crecimiento_corrida_id_sujeto ON resultados.crecimiento (corrida_id, sujeto);

CREATE TABLE resultados.metricas_modelo (
    id SERIAL NOT NULL, 
    corrida_id INTEGER, 
    modelo TEXT NOT NULL, 
    version TEXT NOT NULL, 
    clave TEXT NOT NULL, 
    metrica TEXT NOT NULL, 
    valor FLOAT, 
    CONSTRAINT pk_metricas_modelo PRIMARY KEY (id), 
    CONSTRAINT fk_metricas_modelo_corrida_id_corridas FOREIGN KEY(corrida_id) REFERENCES resultados.corridas (id) ON DELETE CASCADE
);

CREATE INDEX ix_metricas_modelo_corrida_id ON resultados.metricas_modelo (corrida_id);

CREATE TABLE resultados.riesgos (
    id BIGSERIAL NOT NULL, 
    corrida_id INTEGER NOT NULL, 
    sujeto TEXT NOT NULL, 
    clave TEXT NOT NULL, 
    desenlace TEXT NOT NULL, 
    momento TEXT NOT NULL, 
    riesgo FLOAT NOT NULL, 
    percentil FLOAT NOT NULL, 
    motivos JSONB NOT NULL, 
    fecha_visita DATE, 
    silencio BOOLEAN DEFAULT false NOT NULL, 
    CONSTRAINT pk_riesgos PRIMARY KEY (id), 
    CONSTRAINT fk_riesgos_corrida_id_corridas FOREIGN KEY(corrida_id) REFERENCES resultados.corridas (id) ON DELETE CASCADE
);

CREATE INDEX ix_riesgos_corrida_id_clave_percentil ON resultados.riesgos (corrida_id, clave, percentil);

CREATE INDEX ix_riesgos_corrida_id_sujeto ON resultados.riesgos (corrida_id, sujeto);

CREATE TABLE app.notificaciones (
    id BIGSERIAL NOT NULL, 
    riesgo_id BIGINT NOT NULL, 
    destinatario TEXT NOT NULL, 
    estado TEXT NOT NULL, 
    error TEXT, 
    enviado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_notificaciones PRIMARY KEY (id), 
    CONSTRAINT ck_notificaciones_estado CHECK (estado IN ('enviado','error')), 
    CONSTRAINT fk_notificaciones_riesgo_id_riesgos FOREIGN KEY(riesgo_id) REFERENCES resultados.riesgos (id) ON DELETE CASCADE, 
    CONSTRAINT uq_notificaciones_riesgo_id_destinatario UNIQUE (riesgo_id, destinatario)
);

CREATE TABLE resultados.revision_datos (
    alerta_id BIGINT NOT NULL, 
    usuario_id UUID NOT NULL, 
    es_error TEXT NOT NULL, 
    comentario TEXT, 
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_revision_datos PRIMARY KEY (alerta_id, usuario_id), 
    CONSTRAINT ck_revision_datos_es_error CHECK (es_error IN ('si','no','no_se')), 
    CONSTRAINT fk_revision_datos_alerta_id_alertas_dato FOREIGN KEY(alerta_id) REFERENCES resultados.alertas_dato (id) ON DELETE CASCADE, 
    CONSTRAINT fk_revision_datos_usuario_id_usuarios FOREIGN KEY(usuario_id) REFERENCES app.usuarios (id) ON DELETE CASCADE
);

CREATE TABLE resultados.revision_riesgos (
    riesgo_id BIGINT NOT NULL, 
    usuario_id UUID NOT NULL, 
    preocupa TEXT NOT NULL, 
    comentario TEXT, 
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_revision_riesgos PRIMARY KEY (riesgo_id, usuario_id), 
    CONSTRAINT ck_revision_riesgos_preocupa CHECK (preocupa IN ('si','no','no_se')), 
    CONSTRAINT fk_revision_riesgos_riesgo_id_riesgos FOREIGN KEY(riesgo_id) REFERENCES resultados.riesgos (id) ON DELETE CASCADE, 
    CONSTRAINT fk_revision_riesgos_usuario_id_usuarios FOREIGN KEY(usuario_id) REFERENCES app.usuarios (id) ON DELETE CASCADE
);

INSERT INTO public.alembic_version (version_num) VALUES ('0001') RETURNING public.alembic_version.version_num;

-- Running upgrade 0001 -> 0002

ALTER TABLE sevarti.cortes ADD COLUMN parametros JSONB;

ALTER TABLE sevarti.cortes ADD COLUMN consulta_sha TEXT;

UPDATE public.alembic_version SET version_num='0002' WHERE public.alembic_version.version_num = '0001';

-- Running upgrade 0002 -> 0003

CREATE TABLE app.conexion_origen (
    fuente TEXT NOT NULL, 
    host TEXT NOT NULL, 
    puerto INTEGER DEFAULT 5432 NOT NULL, 
    base TEXT NOT NULL, 
    usuario TEXT NOT NULL, 
    esquema TEXT DEFAULT 'consumo' NOT NULL, 
    sslmode TEXT DEFAULT 'require' NOT NULL, 
    timeout INTEGER DEFAULT 20 NOT NULL, 
    clave_cifrada TEXT, 
    actualizado_por UUID, 
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_conexion_origen PRIMARY KEY (fuente), 
    CONSTRAINT fk_conexion_origen_actualizado_por_usuarios FOREIGN KEY(actualizado_por) REFERENCES app.usuarios (id) ON DELETE SET NULL, 
    CONSTRAINT ck_conexion_origen_ck_conexion_origen_fuente CHECK (fuente IN ('kmc'))
);

CREATE TABLE app.programaciones (
    id SERIAL NOT NULL, 
    nombre TEXT NOT NULL, 
    fuente TEXT DEFAULT 'kmc' NOT NULL, 
    cron TEXT NOT NULL, 
    zona TEXT DEFAULT 'America/Bogota' NOT NULL, 
    activo BOOLEAN DEFAULT true NOT NULL, 
    silencio BOOLEAN DEFAULT false NOT NULL, 
    solo_si_nuevo BOOLEAN DEFAULT true NOT NULL, 
    parametros JSONB DEFAULT '{}' NOT NULL, 
    proxima TIMESTAMP WITH TIME ZONE, 
    ultima TIMESTAMP WITH TIME ZONE, 
    creado_por UUID, 
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_programaciones PRIMARY KEY (id), 
    CONSTRAINT fk_programaciones_creado_por_usuarios FOREIGN KEY(creado_por) REFERENCES app.usuarios (id) ON DELETE SET NULL, 
    CONSTRAINT ck_programaciones_ck_programaciones_fuente CHECK (fuente IN ('kmc','simulado'))
);

CREATE TABLE app.ejecuciones (
    id SERIAL NOT NULL, 
    tipo TEXT NOT NULL, 
    origen TEXT NOT NULL, 
    estado TEXT DEFAULT 'pendiente' NOT NULL, 
    programacion_id INTEGER, 
    fuente TEXT NOT NULL, 
    parametros JSONB DEFAULT '{}' NOT NULL, 
    resultado JSONB, 
    registro TEXT, 
    mensaje TEXT, 
    solicitada_por UUID, 
    creada_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    iniciada TIMESTAMP WITH TIME ZONE, 
    terminada TIMESTAMP WITH TIME ZONE, 
    CONSTRAINT pk_ejecuciones PRIMARY KEY (id), 
    CONSTRAINT fk_ejecuciones_solicitada_por_usuarios FOREIGN KEY(solicitada_por) REFERENCES app.usuarios (id) ON DELETE SET NULL, 
    CONSTRAINT ck_ejecuciones_ck_ejecuciones_tipo CHECK (tipo IN ('corrida','aprobacion')), 
    CONSTRAINT ck_ejecuciones_ck_ejecuciones_origen CHECK (origen IN ('programada','manual')), 
    CONSTRAINT ck_ejecuciones_ck_ejecuciones_estado CHECK (estado IN ('pendiente','en_curso','ok','error')), 
    CONSTRAINT fk_ejecuciones_programacion_id_programaciones FOREIGN KEY(programacion_id) REFERENCES app.programaciones (id) ON DELETE SET NULL
);

CREATE INDEX ix_ejecuciones_estado_id ON app.ejecuciones (estado, id);

CREATE TABLE app.hiperparametros (
    modelo TEXT NOT NULL, 
    valores JSONB DEFAULT '{}' NOT NULL, 
    actualizado_por UUID, 
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_hiperparametros PRIMARY KEY (modelo), 
    CONSTRAINT fk_hiperparametros_actualizado_por_usuarios FOREIGN KEY(actualizado_por) REFERENCES app.usuarios (id) ON DELETE SET NULL, 
    CONSTRAINT ck_hiperparametros_ck_hiperparametros_modelo CHECK (modelo IN ('anomalias','clinico'))
);

UPDATE public.alembic_version SET version_num='0003' WHERE public.alembic_version.version_num = '0002';

-- Running upgrade 0003 -> 0004

ALTER TABLE app.ejecuciones DROP CONSTRAINT ck_ejecuciones_ck_ejecuciones_tipo;

ALTER TABLE app.ejecuciones ADD CONSTRAINT ck_ejecuciones_ck_ejecuciones_tipo CHECK (tipo IN ('corrida','aprobacion','entrenamiento'));

UPDATE public.alembic_version SET version_num='0004' WHERE public.alembic_version.version_num = '0003';

-- Running upgrade 0004 -> 0005

CREATE TABLE app.diccionarios (
    id SERIAL NOT NULL, 
    version INTEGER NOT NULL, 
    archivo BYTEA NOT NULL, 
    sha256 TEXT NOT NULL, 
    estado TEXT DEFAULT 'borrador' NOT NULL, 
    origen TEXT NOT NULL, 
    nota TEXT, 
    creado_por UUID, 
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_diccionarios PRIMARY KEY (id), 
    CONSTRAINT ck_diccionarios_ck_diccionarios_estado CHECK (estado IN ('vigente','borrador','archivado')), 
    CONSTRAINT ck_diccionarios_ck_diccionarios_origen CHECK (origen IN ('subido','corrida','semilla')), 
    CONSTRAINT fk_diccionarios_creado_por_usuarios FOREIGN KEY(creado_por) REFERENCES app.usuarios (id) ON DELETE SET NULL, 
    CONSTRAINT uq_diccionarios_version UNIQUE (version)
);

CREATE UNIQUE INDEX ix_diccionarios_un_vigente ON app.diccionarios (estado) WHERE estado = 'vigente';

UPDATE public.alembic_version SET version_num='0005' WHERE public.alembic_version.version_num = '0004';

-- Running upgrade 0005 -> 0006

ALTER TABLE resultados.crecimiento ADD COLUMN variable TEXT;

UPDATE public.alembic_version SET version_num='0006' WHERE public.alembic_version.version_num = '0005';

-- Running upgrade 0006 -> 0007

CREATE TABLE app.muestras (
    id SERIAL NOT NULL, 
    titulo TEXT NOT NULL, 
    descripcion TEXT, 
    fuente TEXT NOT NULL, 
    corte_id INTEGER, 
    version_diccionario INTEGER, 
    definicion JSONB NOT NULL, 
    n_ninos INTEGER NOT NULL, 
    n_base INTEGER NOT NULL, 
    huella TEXT NOT NULL, 
    resumen JSONB, 
    propietario_id UUID, 
    creada TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    inmutable BOOLEAN DEFAULT false NOT NULL, 
    CONSTRAINT pk_muestras PRIMARY KEY (id), 
    CONSTRAINT ck_muestras_ck_muestras_fuente CHECK (fuente IN ('kmc','simulado')), 
    CONSTRAINT fk_muestras_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE SET NULL, 
    CONSTRAINT fk_muestras_propietario_id_usuarios FOREIGN KEY(propietario_id) REFERENCES app.usuarios (id) ON DELETE SET NULL
);

UPDATE public.alembic_version SET version_num='0007' WHERE public.alembic_version.version_num = '0006';

-- Running upgrade 0007 -> 0008

CREATE TABLE sevarti.atributos_sujeto (
    corte_id INTEGER NOT NULL, 
    sujeto TEXT NOT NULL, 
    variable TEXT NOT NULL, 
    valor TEXT NOT NULL, 
    valor_num FLOAT, 
    CONSTRAINT pk_atributos_sujeto PRIMARY KEY (corte_id, sujeto, variable), 
    CONSTRAINT fk_atributos_sujeto_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE CASCADE
);

CREATE INDEX ix_atributos_sujeto_corte_id_variable_valor ON sevarti.atributos_sujeto (corte_id, variable, valor);

CREATE TABLE sevarti.resumen_sujeto (
    corte_id INTEGER NOT NULL, 
    sujeto TEXT NOT NULL, 
    n_datos INTEGER NOT NULL, 
    CONSTRAINT pk_resumen_sujeto PRIMARY KEY (corte_id, sujeto), 
    CONSTRAINT fk_resumen_sujeto_corte_id_cortes FOREIGN KEY(corte_id) REFERENCES sevarti.cortes (id) ON DELETE CASCADE
);

UPDATE public.alembic_version SET version_num='0008' WHERE public.alembic_version.version_num = '0007';

-- Running upgrade 0008 -> 0009

CREATE TABLE resultados.analitica (
    id SERIAL NOT NULL, 
    entrenamiento_id INTEGER NOT NULL, 
    ejecucion_id INTEGER, 
    modelo TEXT NOT NULL, 
    desenlace TEXT, 
    tipo TEXT NOT NULL, 
    datos JSONB NOT NULL, 
    creada TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_analitica PRIMARY KEY (id)
);

CREATE INDEX ix_analitica_entrenamiento_id_tipo ON resultados.analitica (entrenamiento_id, tipo);

UPDATE public.alembic_version SET version_num='0009' WHERE public.alembic_version.version_num = '0008';

-- Running upgrade 0009 -> 0010

CREATE TABLE resultados.predicciones (
    id SERIAL NOT NULL, 
    usuario_id UUID, 
    tipo TEXT NOT NULL, 
    estado TEXT DEFAULT 'pendiente' NOT NULL, 
    modelo TEXT, 
    parametros JSONB NOT NULL, 
    progreso INTEGER DEFAULT 0 NOT NULL, 
    paso TEXT, 
    n_filtro INTEGER, 
    n_puntuados INTEGER, 
    agregados JSONB, 
    mensaje TEXT, 
    creada TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    iniciada TIMESTAMP WITH TIME ZONE, 
    terminada TIMESTAMP WITH TIME ZONE, 
    vence TIMESTAMP WITH TIME ZONE, 
    CONSTRAINT pk_predicciones PRIMARY KEY (id), 
    CONSTRAINT ck_predicciones_ck_predicciones_estado CHECK (estado IN ('pendiente','en_curso','ok','error')), 
    CONSTRAINT ck_predicciones_ck_predicciones_tipo CHECK (tipo IN ('muestra','universo')), 
    CONSTRAINT fk_predicciones_usuario_id_usuarios FOREIGN KEY(usuario_id) REFERENCES app.usuarios (id) ON DELETE SET NULL
);

CREATE INDEX ix_predicciones_usuario_id_id ON resultados.predicciones (usuario_id, id);

CREATE TABLE app.ninos_nuevos (
    id SERIAL NOT NULL, 
    tipo TEXT NOT NULL, 
    titulo TEXT NOT NULL, 
    descripcion TEXT, 
    propietario_id UUID, 
    modelo TEXT, 
    visita TEXT NOT NULL, 
    perfil TEXT, 
    eg_semanas FLOAT, 
    cambios JSONB NOT NULL, 
    valores JSONB NOT NULL, 
    resultado JSONB, 
    creada TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_ninos_nuevos PRIMARY KEY (id), 
    CONSTRAINT ck_ninos_nuevos_ck_ninos_nuevos_tipo CHECK (tipo IN ('nino','plantilla')), 
    CONSTRAINT fk_ninos_nuevos_propietario_id_usuarios FOREIGN KEY(propietario_id) REFERENCES app.usuarios (id) ON DELETE SET NULL
);

CREATE INDEX ix_ninos_nuevos_propietario_id_tipo ON app.ninos_nuevos (propietario_id, tipo);

UPDATE public.alembic_version SET version_num='0010' WHERE public.alembic_version.version_num = '0009';

-- Running upgrade 0010 -> 0011

CREATE TABLE app.cuotas_config (
    clave TEXT NOT NULL, 
    valor INTEGER NOT NULL, 
    actualizado_por UUID, 
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_cuotas_config PRIMARY KEY (clave), 
    CONSTRAINT fk_cuotas_config_actualizado_por_usuarios FOREIGN KEY(actualizado_por) REFERENCES app.usuarios (id) ON DELETE SET NULL
);

UPDATE public.alembic_version SET version_num='0011' WHERE public.alembic_version.version_num = '0010';

-- Running upgrade 0011 -> 0012

CREATE TABLE app.config_smtp (
    id SERIAL NOT NULL, 
    host TEXT NOT NULL, 
    puerto INTEGER NOT NULL, 
    usuario TEXT, 
    clave_cifrada TEXT, 
    remitente TEXT NOT NULL, 
    tls BOOLEAN DEFAULT false NOT NULL, 
    actualizado_por UUID, 
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_config_smtp PRIMARY KEY (id), 
    CONSTRAINT ck_config_smtp_ck_config_smtp_unica CHECK (id = 1), 
    CONSTRAINT fk_config_smtp_actualizado_por_usuarios FOREIGN KEY(actualizado_por) REFERENCES app.usuarios (id) ON DELETE SET NULL
);

CREATE TABLE app.notificaciones_config (
    id SERIAL NOT NULL, 
    nombre TEXT NOT NULL, 
    percentil_minimo FLOAT DEFAULT 95 NOT NULL, 
    destinatarios TEXT[] DEFAULT '{}' NOT NULL, 
    activo BOOLEAN DEFAULT false NOT NULL, 
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    CONSTRAINT pk_notificaciones_config PRIMARY KEY (id), 
    CONSTRAINT uq_notificaciones_config_nombre UNIQUE (nombre)
);

CREATE TABLE app.notificaciones_config_alertas (
    notificacion_id INTEGER NOT NULL, 
    desenlace TEXT NOT NULL, 
    CONSTRAINT pk_notificaciones_config_alertas PRIMARY KEY (notificacion_id, desenlace), 
    CONSTRAINT fk_notif_config_alertas_notificacion_id FOREIGN KEY(notificacion_id) REFERENCES app.notificaciones_config (id) ON DELETE CASCADE
);

ALTER TABLE app.notificaciones ADD COLUMN notificacion_config_id INTEGER;

ALTER TABLE app.notificaciones ADD CONSTRAINT fk_notificaciones_notificacion_config_id_notificaciones_config FOREIGN KEY(notificacion_config_id) REFERENCES app.notificaciones_config (id) ON DELETE SET NULL;

ALTER TABLE app.notificaciones_config ADD COLUMN _desenlace TEXT;

INSERT INTO app.notificaciones_config (nombre, percentil_minimo, destinatarios, activo, _desenlace)
        SELECT CASE WHEN rn > 1 THEN base || ' (' || desenlace || ')' ELSE base END,
               percentil_minimo, destinatarios, activo, desenlace
        FROM (SELECT COALESCE(nombre, desenlace) AS base, desenlace, percentil_minimo, destinatarios, activo,
                     row_number() OVER (PARTITION BY COALESCE(nombre, desenlace) ORDER BY desenlace) AS rn
              FROM app.config_notificaciones WHERE activo OR cardinality(destinatarios) > 0) t;

INSERT INTO app.notificaciones_config_alertas (notificacion_id, desenlace)
        SELECT id, _desenlace FROM app.notificaciones_config WHERE _desenlace IS NOT NULL;

ALTER TABLE app.notificaciones_config DROP COLUMN _desenlace;

UPDATE app.config_notificaciones SET activo = false, destinatarios = '{}';

UPDATE public.alembic_version SET version_num='0012' WHERE public.alembic_version.version_num = '0011';

-- Running upgrade 0012 -> 0013

CREATE TABLE resultados.desenlaces_observados (
    id BIGSERIAL NOT NULL, 
    corrida_id INTEGER NOT NULL, 
    sujeto TEXT NOT NULL, 
    familia TEXT NOT NULL, 
    valor BOOLEAN NOT NULL, 
    CONSTRAINT pk_desenlaces_observados PRIMARY KEY (id), 
    CONSTRAINT fk_desenlaces_observados_corrida_id_corridas FOREIGN KEY(corrida_id) REFERENCES resultados.corridas (id) ON DELETE CASCADE
);

CREATE INDEX ix_desenlaces_observados_corrida_id_familia ON resultados.desenlaces_observados (corrida_id, familia);

CREATE INDEX ix_desenlaces_observados_corrida_id_sujeto ON resultados.desenlaces_observados (corrida_id, sujeto);

UPDATE public.alembic_version SET version_num='0013' WHERE public.alembic_version.version_num = '0012';

-- Running upgrade 0013 -> 0014

COMMIT;

ALTER TYPE app.rol ADD VALUE IF NOT EXISTS 'datos' BEFORE 'visualizador';

BEGIN;

UPDATE public.alembic_version SET version_num='0014' WHERE public.alembic_version.version_num = '0013';

COMMIT;
