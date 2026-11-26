"""Predicción: cálculos por muestra o universo (solo agregados) y niños nuevos guardados desde un perfil.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-09
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0010'
down_revision: str | None = '0009'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'predicciones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('usuario_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('tipo', sa.Text(), nullable=False),
        sa.Column('estado', sa.Text(), server_default=sa.text("'pendiente'"), nullable=False),
        sa.Column('modelo', sa.Text(), nullable=True),
        sa.Column('parametros', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('progreso', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('paso', sa.Text(), nullable=True),
        sa.Column('n_filtro', sa.Integer(), nullable=True),
        sa.Column('n_puntuados', sa.Integer(), nullable=True),
        sa.Column('agregados', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('mensaje', sa.Text(), nullable=True),
        sa.Column('creada', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('iniciada', sa.DateTime(timezone=True), nullable=True),
        sa.Column('terminada', sa.DateTime(timezone=True), nullable=True),
        sa.Column('vence', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("estado IN ('pendiente','en_curso','ok','error')", name='ck_predicciones_estado'),
        sa.CheckConstraint("tipo IN ('muestra','universo')", name='ck_predicciones_tipo'),
        sa.ForeignKeyConstraint(['usuario_id'], ['app.usuarios.id'], ondelete='SET NULL',
                                name='fk_predicciones_usuario_id_usuarios'),
        sa.PrimaryKeyConstraint('id', name='pk_predicciones'),
        schema='resultados')
    op.create_index('ix_predicciones_usuario_id_id', 'predicciones', ['usuario_id', 'id'], schema='resultados')
    op.create_table(
        'ninos_nuevos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tipo', sa.Text(), nullable=False),
        sa.Column('titulo', sa.Text(), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('propietario_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('modelo', sa.Text(), nullable=True),
        sa.Column('visita', sa.Text(), nullable=False),
        sa.Column('perfil', sa.Text(), nullable=True),
        sa.Column('eg_semanas', sa.Float(), nullable=True),
        sa.Column('cambios', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('valores', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('resultado', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('creada', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("tipo IN ('nino','plantilla')", name='ck_ninos_nuevos_tipo'),
        sa.ForeignKeyConstraint(['propietario_id'], ['app.usuarios.id'], ondelete='SET NULL',
                                name='fk_ninos_nuevos_propietario_id_usuarios'),
        sa.PrimaryKeyConstraint('id', name='pk_ninos_nuevos'),
        schema='app')
    op.create_index('ix_ninos_nuevos_propietario_id_tipo', 'ninos_nuevos', ['propietario_id', 'tipo'], schema='app')


def downgrade() -> None:
    op.drop_index('ix_ninos_nuevos_propietario_id_tipo', table_name='ninos_nuevos', schema='app')
    op.drop_table('ninos_nuevos', schema='app')
    op.drop_index('ix_predicciones_usuario_id_id', table_name='predicciones', schema='resultados')
    op.drop_table('predicciones', schema='resultados')
