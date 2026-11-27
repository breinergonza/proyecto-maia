-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- DML 04 · Consultas frecuentes (SELECT)
-- ==============================================================================================================
-- Preguntas que responde la solución, escritas en SQL sobre el modelo de datos. Solo leen.
-- Requiere el DDL completo, 01_datos_iniciales.sql y 02_cohorte_simulada.sql. Las consultas sobre el esquema
-- resultados devuelven filas cuando hay una corrida (con "maia corrida" o con 03 terminado en COMMIT).
--
--   psql -d maia -f 04_consultas_frecuentes.sql
-- ==============================================================================================================

-- --------------------------------------------------------------------------------------------------------------
-- A. El corte de datos (esquema sevarti)
-- --------------------------------------------------------------------------------------------------------------

-- A1. Cortes cargados y cuál está vigente por fuente.
SELECT id, fuente, fecha_corte, vigente, filas->>'sujetos' AS sujetos, filas->>'mediciones' AS mediciones, creado_en
FROM sevarti.cortes
ORDER BY fuente, fecha_corte DESC;

-- A2. Niños del corte vigente por categoría de edad gestacional.
SELECT CASE WHEN s.eg_semanas < 28 THEN '1. Prematuro extremo (< 28 sem)'
            WHEN s.eg_semanas < 32 THEN '2. Muy prematuro (28 a 31 sem)'
            WHEN s.eg_semanas < 37 THEN '3. Moderado a tardío (32 a 36 sem)'
            ELSE '4. A término (37 sem o más)' END AS categoria,
       count(*) AS ninos,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS porcentaje
FROM sevarti.sujetos s
JOIN sevarti.cortes c ON c.id = s.corte_id AND c.vigente
GROUP BY 1
ORDER BY 1;

-- A3. Cobertura de las medidas de crecimiento por visita: cuántos niños tienen el dato.
SELECT e.datos->>'etapa' AS visita, e.datos->>'concepto' AS medida, count(DISTINCT m.sujeto) AS ninos_con_dato,
       (SELECT count(*) FROM sevarti.sujetos s WHERE s.corte_id = c.id) AS ninos_del_corte
FROM sevarti.esquema e
JOIN sevarti.cortes c ON c.id = e.corte_id AND c.vigente
LEFT JOIN sevarti.mediciones m ON m.corte_id = e.corte_id AND m.variable = e.variable AND m.valor IS NOT NULL
JOIN sevarti.etapas t ON t.corte_id = e.corte_id AND t.etapa = e.datos->>'etapa'
WHERE e.datos->>'concepto' IN ('peso', 'talla', 'perimetro_cefalico')
GROUP BY t.orden, 1, 2, c.id
ORDER BY t.orden, 2;

-- A4. Trayectoria de peso de un niño, visita por visita.
SELECT m.sujeto, t.nombre AS visita, m.fecha, m.edad_dias, m.valor AS peso_g
FROM sevarti.mediciones m
JOIN sevarti.cortes c ON c.id = m.corte_id AND c.vigente
JOIN sevarti.esquema e ON e.corte_id = m.corte_id AND e.variable = m.variable
JOIN sevarti.etapas t ON t.corte_id = m.corte_id AND t.etapa = e.datos->>'etapa'
WHERE e.datos->>'concepto' = 'peso' AND m.sujeto = 's00001'
ORDER BY t.orden;

-- A5. Mediciones fuera del rango esperado del Diccionario (la regla simple contra la que se compara el detector).
SELECT m.sujeto, m.variable, m.valor, e.datos->>'rango_min' AS rango_min, e.datos->>'rango_max' AS rango_max
FROM sevarti.mediciones m
JOIN sevarti.cortes c ON c.id = m.corte_id AND c.vigente
JOIN sevarti.esquema e ON e.corte_id = m.corte_id AND e.variable = m.variable
WHERE e.datos->>'tipo' = 'numeric' AND m.valor ~ '^-?[0-9]+(\.[0-9]+)?$'
  AND (m.valor::numeric < (e.datos->>'rango_min')::numeric OR m.valor::numeric > (e.datos->>'rango_max')::numeric)
ORDER BY m.variable, m.sujeto;

-- A6. Estancias: días promedio por tipo de episodio.
SELECT ep.tipo, count(*) AS episodios, round(avg(ep.edad_fin - ep.edad_inicio)::numeric, 1) AS dias_promedio
FROM sevarti.episodios ep
JOIN sevarti.cortes c ON c.id = ep.corte_id AND c.vigente
GROUP BY ep.tipo
ORDER BY ep.tipo;

-- --------------------------------------------------------------------------------------------------------------
-- B. Resultados de los modelos (esquema resultados)
-- --------------------------------------------------------------------------------------------------------------

-- B1. Última corrida terminada por fuente.
SELECT DISTINCT ON (fuente) id, fuente, fecha_corte, tipo, silencio, paquete, modelo_anomalias, modelo_clinico,
       iniciada, terminada, resumen
FROM resultados.corridas
WHERE estado = 'ok'
ORDER BY fuente, terminada DESC;

-- B2. Niños con mayor riesgo en la última corrida (lo que ve el equipo clínico), sin los guardados en silencio.
SELECT r.sujeto, r.desenlace, r.momento, round((100 * r.riesgo)::numeric, 1) AS riesgo_pct, r.percentil, r.motivos
FROM resultados.riesgos r
WHERE r.corrida_id = (SELECT max(id) FROM resultados.corridas WHERE estado = 'ok') AND NOT r.silencio
ORDER BY r.percentil DESC, r.riesgo DESC
LIMIT 20;

-- B3. Mediciones por revisar que nadie ha respondido, por prioridad.
SELECT a.prioridad, a.sujeto, a.etiqueta, a.valor, a.esperado, a.capas, a.motivo
FROM resultados.alertas_dato a
WHERE a.corrida_id = (SELECT max(id) FROM resultados.corridas WHERE estado = 'ok')
  AND NOT EXISTS (SELECT 1 FROM resultados.revision_datos v WHERE v.alerta_id = a.id)
ORDER BY a.prioridad;

-- B4. Precisión por capa según los expertos: de lo que marcó cada capa, qué parte era un error.
SELECT capa, count(*) AS respondidas,
       count(*) FILTER (WHERE v.es_error = 'si') AS eran_error,
       round(100.0 * count(*) FILTER (WHERE v.es_error = 'si')
             / nullif(count(*) FILTER (WHERE v.es_error <> 'no_se'), 0), 1) AS precision_pct
FROM resultados.alertas_dato a
CROSS JOIN LATERAL unnest(a.capas) AS capa
JOIN resultados.revision_datos v ON v.alerta_id = a.id
GROUP BY capa
ORDER BY capa;

-- B5. Revisión ciega: ¿preocupan más los niños de riesgo alto (percentil 90 o más) que el resto?
SELECT CASE WHEN r.percentil >= 90 THEN 'Riesgo alto' ELSE 'Resto' END AS grupo,
       count(*) AS respuestas,
       round(100.0 * count(*) FILTER (WHERE v.preocupa = 'si')
             / nullif(count(*) FILTER (WHERE v.preocupa <> 'no_se'), 0), 1) AS preocupa_pct
FROM resultados.revision_riesgos v
JOIN resultados.riesgos r ON r.id = v.riesgo_id
GROUP BY 1
ORDER BY 1;

-- B6. Crecimiento bajo frente a la OMS (z < -2) por visita e indicador, contando niños y no registros.
SELECT etapa, indicador, count(DISTINCT sujeto) FILTER (WHERE bajo_2de) AS ninos_bajo_2de,
       count(DISTINCT sujeto) AS ninos_medidos
FROM resultados.crecimiento
WHERE corrida_id = (SELECT max(id) FROM resultados.corridas WHERE estado = 'ok')
GROUP BY etapa, indicador
ORDER BY etapa, indicador;

-- --------------------------------------------------------------------------------------------------------------
-- C. Operación de la aplicación (esquema app)
-- --------------------------------------------------------------------------------------------------------------

-- C1. Usuarios por perfil.
SELECT rol, count(*) AS usuarios, count(*) FILTER (WHERE activo) AS activos, max(ultimo_ingreso) AS ultimo_ingreso
FROM app.usuarios
GROUP BY rol
ORDER BY rol;

-- C2. Paquete de modelos activo.
SELECT version, fuente, subido_en, manifest->>'lightgbm' AS lightgbm FROM app.paquetes WHERE activo;

-- C3. Cola de ejecuciones: lo pendiente y lo último que terminó.
SELECT id, tipo, origen, fuente, estado, creada_en, iniciada, terminada, mensaje
FROM app.ejecuciones
ORDER BY (estado IN ('pendiente', 'en_curso')) DESC, id DESC
LIMIT 20;

-- C4. Diccionario vigente y sus versiones.
SELECT version, estado, origen, left(sha256, 12) AS sha256, octet_length(archivo) AS bytes, creado_en
FROM app.diccionarios
ORDER BY version DESC;

-- C5. Últimas acciones registradas en la auditoría.
SELECT a.creado_en, u.email, a.accion, a.recurso, a.detalle
FROM app.auditoria a
LEFT JOIN app.usuarios u ON u.id = a.usuario_id
ORDER BY a.creado_en DESC
LIMIT 20;
