-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- DML 03 · Operaciones de la aplicación (INSERT, UPDATE y DELETE)
-- ==============================================================================================================
-- Las escrituras que hace la solución en su operación diaria, escritas en SQL sobre el modelo real. En la
-- solución las hacen la API (FastAPI + SQLAlchemy) y la CLI "maia"; aquí sirven para entender y probar el modelo.
--
-- Requiere el DDL completo, 01_datos_iniciales.sql y 02_cohorte_simulada.sql.
-- Todo va dentro de una transacción que termina en ROLLBACK: se puede ejecutar cuantas veces se quiera sin
-- cambiar la base. Para conservar los cambios, reemplace el ROLLBACK del final por COMMIT.
--
--   psql -d maia -v ON_ERROR_STOP=1 -f 03_operaciones_de_la_aplicacion.sql
-- ==============================================================================================================

BEGIN;

-- --------------------------------------------------------------------------------------------------------------
-- 1. Usuarios y permisos (Administración › Usuarios y permisos)
-- --------------------------------------------------------------------------------------------------------------
-- Un usuario por perfil. La API guarda la clave como hash Argon2 (maia_api/seguridad.py); el texto de abajo es
-- un marcador: un usuario creado así no puede ingresar hasta que administración le asigne una clave en la web.
INSERT INTO app.usuarios (email, nombre, hash_clave, rol)
VALUES ('expertoclinico@ejemplo.org', 'Experto clínico de ejemplo', 'hash-argon2-generado-por-la-api', 'experto'),
       ('expertoendatos@ejemplo.org', 'Experto en datos de ejemplo', 'hash-argon2-generado-por-la-api', 'datos'),
       ('consulta@ejemplo.org',       'Consulta de ejemplo',         'hash-argon2-generado-por-la-api', 'visualizador')
ON CONFLICT (email) DO NOTHING;

-- Cada acción de administración queda en la auditoría.
INSERT INTO app.auditoria (usuario_id, accion, recurso, detalle)
SELECT id, 'crear_usuario', 'usuarios', jsonb_build_object('email', 'expertoclinico@ejemplo.org', 'rol', 'experto')
FROM app.usuarios WHERE email = 'admin@ejemplo.org';

-- Ingreso: se registra la hora y se emite un token de refresco (la API guarda solo su hash SHA-256).
UPDATE app.usuarios SET ultimo_ingreso = now() WHERE email = 'expertoclinico@ejemplo.org';

INSERT INTO app.refresh_tokens (usuario_id, hash_token, expira)
SELECT id, encode(digest('token-de-ejemplo-' || id::text, 'sha256'), 'hex'), now() + interval '7 days'
FROM app.usuarios WHERE email = 'expertoclinico@ejemplo.org';

-- Cambiar el perfil de un usuario.
UPDATE app.usuarios SET rol = 'datos' WHERE email = 'consulta@ejemplo.org';

-- Desactivar un usuario y cerrar todas sus sesiones.
UPDATE app.usuarios SET activo = false WHERE email = 'consulta@ejemplo.org';
UPDATE app.refresh_tokens SET revocado = true
WHERE usuario_id = (SELECT id FROM app.usuarios WHERE email = 'consulta@ejemplo.org');

-- --------------------------------------------------------------------------------------------------------------
-- 2. Configuración del sistema y del entrenamiento (Datos y modelos › Configuración)
-- --------------------------------------------------------------------------------------------------------------
-- Hiperparámetros del próximo entrenamiento: solo los que cambian respecto del núcleo (una fila por modelo).
INSERT INTO app.hiperparametros (modelo, valores, actualizado_por)
SELECT 'anomalias', '{"alpha": 0.005}'::jsonb, id FROM app.usuarios WHERE email = 'admin@ejemplo.org'
ON CONFLICT (modelo) DO UPDATE
    SET valores = EXCLUDED.valores, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now();

-- Límites de «Mis modelos» (claves: cola_max, modelos_max, dias_sin_uso, dias_aviso).
INSERT INTO app.cuotas_config (clave, valor, actualizado_por)
SELECT 'modelos_max', 5, id FROM app.usuarios WHERE email = 'admin@ejemplo.org'
ON CONFLICT (clave) DO UPDATE
    SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now();

-- Conexión a la base de origen. La clave va cifrada con Fernet (MAIA_CIFRADO_CLAVE); aquí, un marcador.
INSERT INTO app.conexion_origen (fuente, host, base, usuario, clave_cifrada, actualizado_por)
SELECT 'kmc', 'servidor-de-ejemplo.org', 'postgres', 'usuario_solo_lectura', 'texto-cifrado-por-la-api', id
FROM app.usuarios WHERE email = 'admin@ejemplo.org'
ON CONFLICT (fuente) DO UPDATE
    SET host = EXCLUDED.host, usuario = EXCLUDED.usuario, clave_cifrada = EXCLUDED.clave_cifrada,
        actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now();

-- --------------------------------------------------------------------------------------------------------------
-- 3. Ejecuciones automáticas (Configuración › Programar ejecuciones automáticas)
-- --------------------------------------------------------------------------------------------------------------
-- Una corrida cada semestre, el 1 de enero y el 1 de julio a las 02:00, solo si hay datos nuevos.
INSERT INTO app.programaciones (nombre, fuente, cron, solo_si_nuevo, proxima, creado_por)
SELECT 'Corrida semestral', 'simulado', '0 2 1 1,7 *', true,
       date_trunc('year', now()) + interval '1 year 2 hours', id
FROM app.usuarios WHERE email = 'admin@ejemplo.org';

-- «Corrida ahora»: la web pone una ejecución en la cola.
INSERT INTO app.ejecuciones (tipo, origen, fuente, parametros, solicitada_por)
SELECT 'corrida', 'manual', 'simulado', '{"silencio": false}'::jsonb, id
FROM app.usuarios WHERE email = 'expertoendatos@ejemplo.org';

-- El programador toma la más antigua pendiente, una a la vez (FOR UPDATE SKIP LOCKED, maia_comun/ejecuciones.py).
UPDATE app.ejecuciones SET estado = 'en_curso', iniciada = now()
WHERE id = (SELECT id FROM app.ejecuciones WHERE estado = 'pendiente' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED);

-- --------------------------------------------------------------------------------------------------------------
-- 4. Paquetes de modelos (Operación de modelos › Modelos disponibles)
-- --------------------------------------------------------------------------------------------------------------
-- La API registra un paquete después de verificar su firma HMAC-SHA256 y el hash de cada archivo.
INSERT INTO app.paquetes (version, fuente, manifest, ruta, subido_por)
SELECT '2026-11-26-ejemplo', 'simulado',
       '{"version": "2026-11-26-ejemplo", "fuente": "simulado", "lightgbm": "4.7.0"}'::jsonb,
       '/datos/paquetes/2026-11-26-ejemplo', id
FROM app.usuarios WHERE email = 'admin@ejemplo.org';

-- Activar un paquete deja inactivos a los demás.
UPDATE app.paquetes SET activo = (version = '2026-11-26-ejemplo');

-- --------------------------------------------------------------------------------------------------------------
-- 5. Una corrida y sus resultados (lo que escribe "maia corrida")
-- --------------------------------------------------------------------------------------------------------------
INSERT INTO resultados.corridas (corte_id, fuente, fecha_corte, tipo, paquete, modelo_anomalias, modelo_clinico,
                                 dispositivo, paso)
SELECT id, fuente, fecha_corte, 'completa', '2026-11-26-ejemplo', '9eea708fbf', 'c299096a71', 'cpu', 'riesgos'
FROM sevarti.cortes WHERE fuente = 'simulado' AND vigente;

-- Mediciones por revisar: una alerta por dato raro, con su capa, lo esperado y la prioridad.
INSERT INTO resultados.alertas_dato (corrida_id, sujeto, variable, etiqueta, unidad, etapa, fecha, valor, esperado,
                                     rango_bajo, rango_alto, capas, motivo, fuerza, prioridad)
SELECT (SELECT max(id) FROM resultados.corridas), m.sujeto, m.variable, 'Peso a las 40 semanas', 'g', '40 sem', m.fecha,
       m.valor, 3100, 2500, 3700, ARRAY['1. Valor', '2. Contexto'], 'El valor se aleja de lo esperado para este niño',
       4.2, row_number() OVER (ORDER BY m.sujeto)
FROM sevarti.mediciones m
JOIN sevarti.cortes c ON c.id = m.corte_id AND c.vigente AND c.fuente = 'simulado'
WHERE m.variable = 'peso_40'
ORDER BY m.sujeto
LIMIT 3;

-- Riesgo por niño y desenlace, con los tres motivos que más pesaron (TreeSHAP). percentil: nivel frente a los
-- niños con que se calibró el modelo (0 a 100); el primero queda en riesgo muy alto y el segundo, no.
INSERT INTO resultados.riesgos (corrida_id, sujeto, clave, desenlace, momento, riesgo, percentil, motivos, fecha_visita)
SELECT (SELECT max(id) FROM resultados.corridas), x.sujeto, 'desarrollo_12m', 'desarrollo psicomotor bajo a los 12 meses',
       '6 m EC', (ARRAY[0.31, 0.06])[x.n], (ARRAY[97.2, 61.0])[x.n],
       jsonb_build_array('Peso al nacer (peso_nacer) = 1350', 'Semanas de gestación = 28', 'Talla a 3 m EC (talla_3m) = sin dato'),
       x.fecha_nacimiento + 270
FROM (SELECT s.sujeto, s.fecha_nacimiento, row_number() OVER (ORDER BY s.sujeto) AS n
      FROM sevarti.sujetos s
      JOIN sevarti.cortes c ON c.id = s.corte_id AND c.vigente AND c.fuente = 'simulado') x
WHERE x.n <= 2;

-- Crecimiento frente a la OMS: puntaje z y marcas de seguimiento.
INSERT INTO resultados.crecimiento (corrida_id, sujeto, etapa, indicador, fecha, edad_corregida, valor, z, bajo_2de,
                                    caida_1de, variable)
SELECT (SELECT max(id) FROM resultados.corridas), m.sujeto, '12 m EC', 'talla', m.fecha, 365, m.valor::double precision,
       -2.4, true, false, m.variable
FROM sevarti.mediciones m
JOIN sevarti.cortes c ON c.id = m.corte_id AND c.vigente AND c.fuente = 'simulado'
WHERE m.variable = 'talla_12m' AND m.valor ~ '^-?[0-9.]+$'
ORDER BY m.sujeto
LIMIT 1;

-- Métricas agregadas de la corrida (nunca datos por niño).
INSERT INTO resultados.metricas_modelo (corrida_id, modelo, version, clave, metrica, valor)
VALUES ((SELECT max(id) FROM resultados.corridas), 'clinico', 'c299096a71', 'desarrollo_12m', 'AUC', 0.77),
       ((SELECT max(id) FROM resultados.corridas), 'anomalias', '9eea708fbf', 'cualquiera', 'alertas_por_1000', 64.84);

-- Cerrar la corrida con su resumen.
UPDATE resultados.corridas
SET estado = 'ok', terminada = now(), paso = NULL,
    resumen = jsonb_build_object('alertas_dato', (SELECT count(*) FROM resultados.alertas_dato a WHERE a.corrida_id = corridas.id),
                                 'riesgos',      (SELECT count(*) FROM resultados.riesgos r WHERE r.corrida_id = corridas.id))
WHERE id = (SELECT max(id) FROM resultados.corridas);

UPDATE app.ejecuciones SET estado = 'ok', terminada = now(), mensaje = 'Corrida terminada'
WHERE estado = 'en_curso';

-- --------------------------------------------------------------------------------------------------------------
-- 6. Revisión de los expertos
-- --------------------------------------------------------------------------------------------------------------
-- Mediciones por revisar: ¿es un error? (si / no / no_se). Una respuesta por alerta y experto; responder de
-- nuevo la reemplaza.
INSERT INTO resultados.revision_datos (alerta_id, usuario_id, es_error, comentario)
SELECT a.id, u.id, 'si', 'Unidad equivocada: el peso se anotó en kilogramos'
FROM resultados.alertas_dato a, app.usuarios u
WHERE a.corrida_id = (SELECT max(id) FROM resultados.corridas) AND a.prioridad = 1 AND u.email = 'expertoendatos@ejemplo.org'
ON CONFLICT (alerta_id, usuario_id) DO UPDATE
    SET es_error = EXCLUDED.es_error, comentario = EXCLUDED.comentario, creado_en = now();

-- Revisión clínica de casos (ciega): ¿le preocupa este niño?
INSERT INTO resultados.revision_riesgos (riesgo_id, usuario_id, preocupa, comentario)
SELECT r.id, u.id, 'no_se', NULL
FROM resultados.riesgos r, app.usuarios u
WHERE r.corrida_id = (SELECT max(id) FROM resultados.corridas) AND u.email = 'expertoclinico@ejemplo.org'
ON CONFLICT (riesgo_id, usuario_id) DO UPDATE SET preocupa = EXCLUDED.preocupa, creado_en = now();

-- --------------------------------------------------------------------------------------------------------------
-- 7. Notificaciones (Notificaciones › Reglas y envíos de alertas por correo)
-- --------------------------------------------------------------------------------------------------------------
INSERT INTO app.notificaciones_config (nombre, percentil_minimo, destinatarios, activo)
VALUES ('Riesgo muy alto de desarrollo psicomotor', 95, ARRAY['equipo.clinico@ejemplo.org'], true);

INSERT INTO app.notificaciones_config_alertas (notificacion_id, desenlace)
SELECT id, 'desarrollo_12m' FROM app.notificaciones_config WHERE nombre = 'Riesgo muy alto de desarrollo psicomotor';

-- Cada correo enviado (o fallido) queda registrado una sola vez por riesgo y destinatario.
INSERT INTO app.notificaciones (riesgo_id, destinatario, estado, notificacion_config_id)
SELECT r.id, 'equipo.clinico@ejemplo.org', 'enviado', n.id
FROM resultados.riesgos r
JOIN app.notificaciones_config n ON n.nombre = 'Riesgo muy alto de desarrollo psicomotor'
WHERE r.corrida_id = (SELECT max(id) FROM resultados.corridas) AND r.percentil >= n.percentil_minimo
ON CONFLICT (riesgo_id, destinatario) DO NOTHING;

-- --------------------------------------------------------------------------------------------------------------
-- 8. Diccionario de variables (Guía de variables y unidades › Versiones e importación)
-- --------------------------------------------------------------------------------------------------------------
-- Una versión nueva entra como borrador; al publicarla, la anterior se archiva. Solo puede haber una vigente
-- (índice único parcial ix_diccionarios_un_vigente), por eso son dos pasos.
INSERT INTO app.diccionarios (version, archivo, sha256, estado, origen, nota, creado_por)
SELECT d.version + 1, d.archivo, d.sha256, 'borrador', 'subido', 'Ejemplo: misma hoja, versión nueva', u.id
FROM app.diccionarios d, app.usuarios u
WHERE d.estado = 'vigente' AND u.email = 'expertoendatos@ejemplo.org';

UPDATE app.diccionarios SET estado = 'archivado' WHERE estado = 'vigente';
UPDATE app.diccionarios SET estado = 'vigente' WHERE version = (SELECT max(version) FROM app.diccionarios);

-- --------------------------------------------------------------------------------------------------------------
-- 9. Mantenimiento (DELETE)
-- --------------------------------------------------------------------------------------------------------------
-- Las estimaciones por grupo se guardan una hora; después se borran.
DELETE FROM resultados.predicciones WHERE vence < now();

-- Sesiones vencidas o revocadas.
DELETE FROM app.refresh_tokens WHERE expira < now() OR revocado;

-- Borrar una programación no borra su historial: las ejecuciones quedan con programacion_id en NULL.
DELETE FROM app.programaciones WHERE nombre = 'Corrida semestral';

-- --------------------------------------------------------------------------------------------------------------
-- Lo que quedó escrito dentro de la transacción
-- --------------------------------------------------------------------------------------------------------------
SELECT 'usuarios' AS tabla, count(*) AS filas FROM app.usuarios
UNION ALL SELECT 'auditoria', count(*) FROM app.auditoria
UNION ALL SELECT 'ejecuciones', count(*) FROM app.ejecuciones
UNION ALL SELECT 'paquetes activos', count(*) FROM app.paquetes WHERE activo
UNION ALL SELECT 'corridas terminadas', count(*) FROM resultados.corridas WHERE estado = 'ok'
UNION ALL SELECT 'alertas de datos', count(*) FROM resultados.alertas_dato
UNION ALL SELECT 'riesgos', count(*) FROM resultados.riesgos
UNION ALL SELECT 'revisiones de datos', count(*) FROM resultados.revision_datos
UNION ALL SELECT 'revisiones de riesgos', count(*) FROM resultados.revision_riesgos
UNION ALL SELECT 'correos registrados', count(*) FROM app.notificaciones
UNION ALL SELECT 'diccionario vigente (versión)', max(version) FROM app.diccionarios WHERE estado = 'vigente';

ROLLBACK;
