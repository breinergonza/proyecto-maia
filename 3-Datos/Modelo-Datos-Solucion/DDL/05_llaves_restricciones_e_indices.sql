-- ==============================================================================================================
-- KMCPred · Proyecto MAIA
-- DDL 05 · Llaves primarias, únicas, foráneas, restricciones e índices
-- ==============================================================================================================
-- Va al final porque hay llaves foráneas entre esquemas en ambos sentidos (app <-> resultados).
-- Las restricciones CHECK de cada tabla ya están en su CREATE TABLE (archivos 02 a 04).
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

SET default_tablespace = '';

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
