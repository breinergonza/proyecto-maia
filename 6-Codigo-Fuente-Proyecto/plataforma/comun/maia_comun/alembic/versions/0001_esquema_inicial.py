"""Esquema inicial: extensiones, los tres esquemas (sevarti, resultados, app) y todas las tablas.

Revision ID: 0001
Revises:
Create Date: 2026-10-20
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ESQUEMAS = ('sevarti', 'resultados', 'app')


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS citext')
    op.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    for esquema in ESQUEMAS:
        op.execute(f'CREATE SCHEMA IF NOT EXISTS {esquema}')
    op.create_table('auditoria',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('usuario_id', sa.UUID(), nullable=True),
    sa.Column('accion', sa.Text(), nullable=False),
    sa.Column('recurso', sa.Text(), nullable=True),
    sa.Column('detalle', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_auditoria')),
    schema='app'
    )
    op.create_table('config_notificaciones',
    sa.Column('desenlace', sa.Text(), nullable=False),
    sa.Column('nombre', sa.Text(), nullable=True),
    sa.Column('percentil_minimo', sa.Float(), server_default=sa.text('95'), nullable=False),
    sa.Column('destinatarios', postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'"), nullable=False),
    sa.Column('activo', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.PrimaryKeyConstraint('desenlace', name=op.f('pk_config_notificaciones')),
    schema='app'
    )
    op.create_table('usuarios',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('email', postgresql.CITEXT(), nullable=False),
    sa.Column('nombre', sa.Text(), nullable=False),
    sa.Column('hash_clave', sa.Text(), nullable=False),
    sa.Column('rol', sa.Enum('admin', 'experto', 'visualizador', name='rol', schema='app'), nullable=False),
    sa.Column('activo', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('ultimo_ingreso', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_usuarios')),
    sa.UniqueConstraint('email', name=op.f('uq_usuarios_email')),
    schema='app'
    )
    op.create_table('cortes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('fuente', sa.Text(), nullable=False),
    sa.Column('fecha_corte', sa.Date(), nullable=False),
    sa.Column('ruta_minio', sa.Text(), nullable=True),
    sa.Column('sha256', sa.Text(), nullable=True),
    sa.Column('filas', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('vigente', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("fuente IN ('kmc','simulado')", name=op.f('ck_cortes_fuente')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_cortes')),
    sa.UniqueConstraint('fuente', 'fecha_corte', name=op.f('uq_cortes_fuente_fecha_corte')),
    schema='sevarti'
    )
    op.create_table('paquetes',
    sa.Column('version', sa.Text(), nullable=False),
    sa.Column('fuente', sa.Text(), nullable=False),
    sa.Column('manifest', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('ruta', sa.Text(), nullable=False),
    sa.Column('activo', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('subido_por', sa.UUID(), nullable=True),
    sa.Column('subido_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['subido_por'], ['app.usuarios.id'], name=op.f('fk_paquetes_subido_por_usuarios'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('version', name=op.f('pk_paquetes')),
    schema='app'
    )
    op.create_table('refresh_tokens',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('usuario_id', sa.UUID(), nullable=False),
    sa.Column('hash_token', sa.Text(), nullable=False),
    sa.Column('expira', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revocado', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['app.usuarios.id'], name=op.f('fk_refresh_tokens_usuario_id_usuarios'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_refresh_tokens')),
    sa.UniqueConstraint('hash_token', name=op.f('uq_refresh_tokens_hash_token')),
    schema='app'
    )
    op.create_index(op.f('ix_refresh_tokens_usuario_id'), 'refresh_tokens', ['usuario_id'], unique=False, schema='app')
    op.create_table('corridas',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('corte_id', sa.Integer(), nullable=True),
    sa.Column('fuente', sa.Text(), nullable=True),
    sa.Column('fecha_corte', sa.Date(), nullable=True),
    sa.Column('tipo', sa.Text(), nullable=False),
    sa.Column('estado', sa.Text(), server_default=sa.text("'en_curso'"), nullable=False),
    sa.Column('silencio', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('modelo_anomalias', sa.Text(), nullable=True),
    sa.Column('modelo_clinico', sa.Text(), nullable=True),
    sa.Column('paquete', sa.Text(), nullable=True),
    sa.Column('dispositivo', sa.Text(), nullable=True),
    sa.Column('paso', sa.Text(), nullable=True),
    sa.Column('resumen', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('iniciada', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('terminada', sa.DateTime(timezone=True), nullable=True),
    sa.Column('mensaje', sa.Text(), nullable=True),
    sa.CheckConstraint("estado IN ('en_curso','ok','error')", name=op.f('ck_corridas_estado')),
    sa.CheckConstraint("tipo IN ('completa','revision','riesgos','demo')", name=op.f('ck_corridas_tipo')),
    sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], name=op.f('fk_corridas_corte_id_cortes'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_corridas')),
    schema='resultados'
    )
    op.create_table('episodios',
    sa.Column('corte_id', sa.Integer(), nullable=False),
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('sujeto', sa.Text(), nullable=False),
    sa.Column('tipo', sa.Text(), nullable=False),
    sa.Column('edad_inicio', sa.Float(), nullable=True),
    sa.Column('edad_fin', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], name=op.f('fk_episodios_corte_id_cortes'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('corte_id', 'id', name=op.f('pk_episodios')),
    schema='sevarti'
    )
    op.create_index(op.f('ix_episodios_corte_id_sujeto'), 'episodios', ['corte_id', 'sujeto'], unique=False, schema='sevarti')
    op.create_table('esquema',
    sa.Column('corte_id', sa.Integer(), nullable=False),
    sa.Column('variable', sa.Text(), nullable=False),
    sa.Column('datos', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], name=op.f('fk_esquema_corte_id_cortes'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('corte_id', 'variable', name=op.f('pk_esquema')),
    schema='sevarti'
    )
    op.create_table('etapas',
    sa.Column('corte_id', sa.Integer(), nullable=False),
    sa.Column('etapa', sa.Text(), nullable=False),
    sa.Column('orden', sa.Integer(), nullable=False),
    sa.Column('edad_min', sa.Float(), nullable=True),
    sa.Column('edad_max', sa.Float(), nullable=True),
    sa.Column('base', sa.Text(), nullable=False),
    sa.Column('nombre', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], name=op.f('fk_etapas_corte_id_cortes'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('corte_id', 'etapa', name=op.f('pk_etapas')),
    schema='sevarti'
    )
    op.create_table('mediciones',
    sa.Column('corte_id', sa.Integer(), nullable=False),
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('sujeto', sa.Text(), nullable=False),
    sa.Column('variable', sa.Text(), nullable=False),
    sa.Column('valor', sa.Text(), nullable=True),
    sa.Column('fecha', sa.Date(), nullable=True),
    sa.Column('edad_dias', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], name=op.f('fk_mediciones_corte_id_cortes'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('corte_id', 'id', name=op.f('pk_mediciones')),
    schema='sevarti'
    )
    op.create_index(op.f('ix_mediciones_corte_id_sujeto'), 'mediciones', ['corte_id', 'sujeto'], unique=False, schema='sevarti')
    op.create_table('quiebres',
    sa.Column('corte_id', sa.Integer(), nullable=False),
    sa.Column('quiebre', sa.Text(), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=True),
    sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], name=op.f('fk_quiebres_corte_id_cortes'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('corte_id', 'quiebre', name=op.f('pk_quiebres')),
    schema='sevarti'
    )
    op.create_table('sujetos',
    sa.Column('corte_id', sa.Integer(), nullable=False),
    sa.Column('sujeto', sa.Text(), nullable=False),
    sa.Column('grupo', sa.Text(), nullable=True),
    sa.Column('fecha_nacimiento', sa.Date(), nullable=True),
    sa.Column('anio_nacimiento', sa.Integer(), nullable=True),
    sa.Column('eg_semanas', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], name=op.f('fk_sujetos_corte_id_cortes'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('corte_id', 'sujeto', name=op.f('pk_sujetos')),
    schema='sevarti'
    )
    op.create_table('alarmas_grupo',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('corrida_id', sa.Integer(), nullable=False),
    sa.Column('grupo', sa.Text(), nullable=True),
    sa.Column('periodo', sa.Text(), nullable=True),
    sa.Column('variable', sa.Text(), nullable=True),
    sa.Column('etiqueta', sa.Text(), nullable=True),
    sa.Column('senal', sa.Text(), nullable=True),
    sa.Column('valor', sa.Float(), nullable=True),
    sa.Column('referencia', sa.Float(), nullable=True),
    sa.Column('estadistico', sa.Float(), nullable=True),
    sa.Column('que_paso', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['corrida_id'], ['resultados.corridas.id'], name=op.f('fk_alarmas_grupo_corrida_id_corridas'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_alarmas_grupo')),
    schema='resultados'
    )
    op.create_index(op.f('ix_alarmas_grupo_corrida_id'), 'alarmas_grupo', ['corrida_id'], unique=False, schema='resultados')
    op.create_table('alertas_dato',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('corrida_id', sa.Integer(), nullable=False),
    sa.Column('sujeto', sa.Text(), nullable=False),
    sa.Column('variable', sa.Text(), nullable=False),
    sa.Column('etiqueta', sa.Text(), nullable=True),
    sa.Column('unidad', sa.Text(), nullable=True),
    sa.Column('etapa', sa.Text(), nullable=True),
    sa.Column('fecha', sa.Date(), nullable=True),
    sa.Column('valor', sa.Text(), nullable=True),
    sa.Column('esperado', sa.Float(), nullable=True),
    sa.Column('rango_bajo', sa.Float(), nullable=True),
    sa.Column('rango_alto', sa.Float(), nullable=True),
    sa.Column('capas', postgresql.ARRAY(sa.Text()), nullable=False),
    sa.Column('motivo', sa.Text(), nullable=True),
    sa.Column('fuerza', sa.Float(), nullable=True),
    sa.Column('prioridad', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['corrida_id'], ['resultados.corridas.id'], name=op.f('fk_alertas_dato_corrida_id_corridas'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_alertas_dato')),
    schema='resultados'
    )
    op.create_index(op.f('ix_alertas_dato_corrida_id_prioridad'), 'alertas_dato', ['corrida_id', 'prioridad'], unique=False, schema='resultados')
    op.create_index(op.f('ix_alertas_dato_corrida_id_sujeto'), 'alertas_dato', ['corrida_id', 'sujeto'], unique=False, schema='resultados')
    op.create_table('crecimiento',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('corrida_id', sa.Integer(), nullable=False),
    sa.Column('sujeto', sa.Text(), nullable=False),
    sa.Column('etapa', sa.Text(), nullable=True),
    sa.Column('indicador', sa.Text(), nullable=False),
    sa.Column('fecha', sa.Date(), nullable=True),
    sa.Column('edad_corregida', sa.Float(), nullable=True),
    sa.Column('valor', sa.Float(), nullable=True),
    sa.Column('z', sa.Float(), nullable=True),
    sa.Column('bajo_2de', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('caida_1de', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('improbable', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.ForeignKeyConstraint(['corrida_id'], ['resultados.corridas.id'], name=op.f('fk_crecimiento_corrida_id_corridas'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_crecimiento')),
    schema='resultados'
    )
    op.create_index(op.f('ix_crecimiento_corrida_id_sujeto'), 'crecimiento', ['corrida_id', 'sujeto'], unique=False, schema='resultados')
    op.create_table('metricas_modelo',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('corrida_id', sa.Integer(), nullable=True),
    sa.Column('modelo', sa.Text(), nullable=False),
    sa.Column('version', sa.Text(), nullable=False),
    sa.Column('clave', sa.Text(), nullable=False),
    sa.Column('metrica', sa.Text(), nullable=False),
    sa.Column('valor', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['corrida_id'], ['resultados.corridas.id'], name=op.f('fk_metricas_modelo_corrida_id_corridas'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_metricas_modelo')),
    schema='resultados'
    )
    op.create_index(op.f('ix_metricas_modelo_corrida_id'), 'metricas_modelo', ['corrida_id'], unique=False, schema='resultados')
    op.create_table('riesgos',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('corrida_id', sa.Integer(), nullable=False),
    sa.Column('sujeto', sa.Text(), nullable=False),
    sa.Column('clave', sa.Text(), nullable=False),
    sa.Column('desenlace', sa.Text(), nullable=False),
    sa.Column('momento', sa.Text(), nullable=False),
    sa.Column('riesgo', sa.Float(), nullable=False),
    sa.Column('percentil', sa.Float(), nullable=False),
    sa.Column('motivos', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('fecha_visita', sa.Date(), nullable=True),
    sa.Column('silencio', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.ForeignKeyConstraint(['corrida_id'], ['resultados.corridas.id'], name=op.f('fk_riesgos_corrida_id_corridas'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_riesgos')),
    schema='resultados'
    )
    op.create_index(op.f('ix_riesgos_corrida_id_clave_percentil'), 'riesgos', ['corrida_id', 'clave', 'percentil'], unique=False, schema='resultados')
    op.create_index(op.f('ix_riesgos_corrida_id_sujeto'), 'riesgos', ['corrida_id', 'sujeto'], unique=False, schema='resultados')
    op.create_table('notificaciones',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('riesgo_id', sa.BigInteger(), nullable=False),
    sa.Column('destinatario', sa.Text(), nullable=False),
    sa.Column('estado', sa.Text(), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('enviado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("estado IN ('enviado','error')", name=op.f('ck_notificaciones_estado')),
    sa.ForeignKeyConstraint(['riesgo_id'], ['resultados.riesgos.id'], name=op.f('fk_notificaciones_riesgo_id_riesgos'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notificaciones')),
    sa.UniqueConstraint('riesgo_id', 'destinatario', name=op.f('uq_notificaciones_riesgo_id_destinatario')),
    schema='app'
    )
    op.create_table('revision_datos',
    sa.Column('alerta_id', sa.BigInteger(), nullable=False),
    sa.Column('usuario_id', sa.UUID(), nullable=False),
    sa.Column('es_error', sa.Text(), nullable=False),
    sa.Column('comentario', sa.Text(), nullable=True),
    sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("es_error IN ('si','no','no_se')", name=op.f('ck_revision_datos_es_error')),
    sa.ForeignKeyConstraint(['alerta_id'], ['resultados.alertas_dato.id'], name=op.f('fk_revision_datos_alerta_id_alertas_dato'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['usuario_id'], ['app.usuarios.id'], name=op.f('fk_revision_datos_usuario_id_usuarios'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('alerta_id', 'usuario_id', name=op.f('pk_revision_datos')),
    schema='resultados'
    )
    op.create_table('revision_riesgos',
    sa.Column('riesgo_id', sa.BigInteger(), nullable=False),
    sa.Column('usuario_id', sa.UUID(), nullable=False),
    sa.Column('preocupa', sa.Text(), nullable=False),
    sa.Column('comentario', sa.Text(), nullable=True),
    sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("preocupa IN ('si','no','no_se')", name=op.f('ck_revision_riesgos_preocupa')),
    sa.ForeignKeyConstraint(['riesgo_id'], ['resultados.riesgos.id'], name=op.f('fk_revision_riesgos_riesgo_id_riesgos'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['usuario_id'], ['app.usuarios.id'], name=op.f('fk_revision_riesgos_usuario_id_usuarios'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('riesgo_id', 'usuario_id', name=op.f('pk_revision_riesgos')),
    schema='resultados'
    )


def downgrade() -> None:
    op.drop_table('revision_riesgos', schema='resultados')
    op.drop_table('revision_datos', schema='resultados')
    op.drop_table('notificaciones', schema='app')
    op.drop_index(op.f('ix_riesgos_corrida_id_sujeto'), table_name='riesgos', schema='resultados')
    op.drop_index(op.f('ix_riesgos_corrida_id_clave_percentil'), table_name='riesgos', schema='resultados')
    op.drop_table('riesgos', schema='resultados')
    op.drop_index(op.f('ix_metricas_modelo_corrida_id'), table_name='metricas_modelo', schema='resultados')
    op.drop_table('metricas_modelo', schema='resultados')
    op.drop_index(op.f('ix_crecimiento_corrida_id_sujeto'), table_name='crecimiento', schema='resultados')
    op.drop_table('crecimiento', schema='resultados')
    op.drop_index(op.f('ix_alertas_dato_corrida_id_sujeto'), table_name='alertas_dato', schema='resultados')
    op.drop_index(op.f('ix_alertas_dato_corrida_id_prioridad'), table_name='alertas_dato', schema='resultados')
    op.drop_table('alertas_dato', schema='resultados')
    op.drop_index(op.f('ix_alarmas_grupo_corrida_id'), table_name='alarmas_grupo', schema='resultados')
    op.drop_table('alarmas_grupo', schema='resultados')
    op.drop_table('sujetos', schema='sevarti')
    op.drop_table('quiebres', schema='sevarti')
    op.drop_index(op.f('ix_mediciones_corte_id_sujeto'), table_name='mediciones', schema='sevarti')
    op.drop_table('mediciones', schema='sevarti')
    op.drop_table('etapas', schema='sevarti')
    op.drop_table('esquema', schema='sevarti')
    op.drop_index(op.f('ix_episodios_corte_id_sujeto'), table_name='episodios', schema='sevarti')
    op.drop_table('episodios', schema='sevarti')
    op.drop_table('corridas', schema='resultados')
    op.drop_index(op.f('ix_refresh_tokens_usuario_id'), table_name='refresh_tokens', schema='app')
    op.drop_table('refresh_tokens', schema='app')
    op.drop_table('paquetes', schema='app')
    op.drop_table('cortes', schema='sevarti')
    op.drop_table('usuarios', schema='app')
    op.drop_table('config_notificaciones', schema='app')
    op.drop_table('auditoria', schema='app')
    sa.Enum(name='rol', schema='app').drop(op.get_bind(), checkfirst=True)
    for esquema in reversed(ESQUEMAS):
        op.execute(f'DROP SCHEMA IF EXISTS {esquema} CASCADE')
