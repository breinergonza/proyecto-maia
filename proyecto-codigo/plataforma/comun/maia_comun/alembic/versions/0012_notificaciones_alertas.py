"""Servidor de correo en base y notificaciones con varias alertas.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-17
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0012'
down_revision: str | None = '0011'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'config_smtp',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('host', sa.Text(), nullable=False),
        sa.Column('puerto', sa.Integer(), nullable=False),
        sa.Column('usuario', sa.Text(), nullable=True),
        sa.Column('clave_cifrada', sa.Text(), nullable=True),
        sa.Column('remitente', sa.Text(), nullable=False),
        sa.Column('tls', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('actualizado_por', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('actualizado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('id = 1', name='ck_config_smtp_unica'),
        sa.ForeignKeyConstraint(['actualizado_por'], ['app.usuarios.id'], ondelete='SET NULL',
                                name='fk_config_smtp_actualizado_por_usuarios'),
        sa.PrimaryKeyConstraint('id', name='pk_config_smtp'),
        schema='app')
    op.create_table(
        'notificaciones_config',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),   # serial, como el modelo
        sa.Column('nombre', sa.Text(), nullable=False),
        sa.Column('percentil_minimo', sa.Float(), server_default=sa.text('95'), nullable=False),
        sa.Column('destinatarios', postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'"), nullable=False),
        sa.Column('activo', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_notificaciones_config'),
        sa.UniqueConstraint('nombre', name='uq_notificaciones_config_nombre'),
        schema='app')
    op.create_table(
        'notificaciones_config_alertas',
        sa.Column('notificacion_id', sa.Integer(), nullable=False),
        sa.Column('desenlace', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['notificacion_id'], ['app.notificaciones_config.id'], ondelete='CASCADE',
                                name='fk_notif_config_alertas_notificacion_id'),
        sa.PrimaryKeyConstraint('notificacion_id', 'desenlace', name='pk_notificaciones_config_alertas'),
        schema='app')
    op.add_column('notificaciones', sa.Column('notificacion_config_id', sa.Integer(), nullable=True), schema='app')
    op.create_foreign_key('fk_notificaciones_notificacion_config_id_notificaciones_config', 'notificaciones',
                          'notificaciones_config', ['notificacion_config_id'], ['id'], source_schema='app',
                          referent_schema='app', ondelete='SET NULL')
    # lo configurado hoy pasa a una notificación por desenlace; la tabla vieja queda como catálogo de alertas
    # _desenlace liga cada notificación copiada con su fila del catálogo sin depender del nombre (que puede repetirse)
    op.add_column('notificaciones_config', sa.Column('_desenlace', sa.Text(), nullable=True), schema='app')
    op.execute("""
        INSERT INTO app.notificaciones_config (nombre, percentil_minimo, destinatarios, activo, _desenlace)
        SELECT CASE WHEN rn > 1 THEN base || ' (' || desenlace || ')' ELSE base END,
               percentil_minimo, destinatarios, activo, desenlace
        FROM (SELECT COALESCE(nombre, desenlace) AS base, desenlace, percentil_minimo, destinatarios, activo,
                     row_number() OVER (PARTITION BY COALESCE(nombre, desenlace) ORDER BY desenlace) AS rn
              FROM app.config_notificaciones WHERE activo OR cardinality(destinatarios) > 0) t""")
    op.execute("""
        INSERT INTO app.notificaciones_config_alertas (notificacion_id, desenlace)
        SELECT id, _desenlace FROM app.notificaciones_config WHERE _desenlace IS NOT NULL""")
    op.drop_column('notificaciones_config', '_desenlace', schema='app')
    op.execute("UPDATE app.config_notificaciones SET activo = false, destinatarios = '{}'")


def downgrade() -> None:
    # no restaura destinatarios/activo de config_notificaciones (al subir quedaron vacíos y la copia se descarta)
    op.drop_constraint('fk_notificaciones_notificacion_config_id_notificaciones_config', 'notificaciones',
                       schema='app', type_='foreignkey')
    op.drop_column('notificaciones', 'notificacion_config_id', schema='app')
    op.drop_table('notificaciones_config_alertas', schema='app')
    op.drop_table('notificaciones_config', schema='app')
    op.drop_table('config_smtp', schema='app')
