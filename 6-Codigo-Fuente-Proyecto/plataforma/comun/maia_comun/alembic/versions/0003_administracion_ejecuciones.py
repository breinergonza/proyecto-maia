"""Administración de las ejecuciones: conexión a la base de la entidad, programaciones, cola e hiperparámetros.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-28
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_JSONB = postgresql.JSONB(astext_type=sa.Text())


def _usuario(tabla: str, columna: str) -> tuple[sa.Column, sa.ForeignKeyConstraint]:
    return (sa.Column(columna, postgresql.UUID(as_uuid=True), nullable=True),
            sa.ForeignKeyConstraint([columna], ['app.usuarios.id'], ondelete='SET NULL',
                                    name=f'fk_{tabla}_{columna}_usuarios'))


def _momento(nombre: str, nulo: bool = False) -> sa.Column:
    return sa.Column(nombre, sa.DateTime(timezone=True), server_default=None if nulo else sa.func.now(), nullable=nulo)


def upgrade() -> None:
    op.create_table(
        'conexion_origen',
        sa.Column('fuente', sa.Text(), nullable=False),
        sa.Column('host', sa.Text(), nullable=False),
        sa.Column('puerto', sa.Integer(), server_default=sa.text('5432'), nullable=False),
        sa.Column('base', sa.Text(), nullable=False),
        sa.Column('usuario', sa.Text(), nullable=False),
        sa.Column('esquema', sa.Text(), server_default=sa.text("'consumo'"), nullable=False),
        sa.Column('sslmode', sa.Text(), server_default=sa.text("'require'"), nullable=False),
        sa.Column('timeout', sa.Integer(), server_default=sa.text('20'), nullable=False),
        sa.Column('clave_cifrada', sa.Text(), nullable=True),
        *_usuario('conexion_origen', 'actualizado_por'),
        _momento('actualizado_en'),
        sa.CheckConstraint("fuente IN ('kmc')", name='ck_conexion_origen_fuente'),
        sa.PrimaryKeyConstraint('fuente', name='pk_conexion_origen'),
        schema='app')
    op.create_table(
        'programaciones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('nombre', sa.Text(), nullable=False),
        sa.Column('fuente', sa.Text(), server_default=sa.text("'kmc'"), nullable=False),
        sa.Column('cron', sa.Text(), nullable=False),
        sa.Column('zona', sa.Text(), server_default=sa.text("'America/Bogota'"), nullable=False),
        sa.Column('activo', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('silencio', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('solo_si_nuevo', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('parametros', _JSONB, server_default=sa.text("'{}'"), nullable=False),
        _momento('proxima', nulo=True),
        _momento('ultima', nulo=True),
        *_usuario('programaciones', 'creado_por'),
        _momento('creado_en'),
        sa.CheckConstraint("fuente IN ('kmc','simulado')", name='ck_programaciones_fuente'),
        sa.PrimaryKeyConstraint('id', name='pk_programaciones'),
        schema='app')
    op.create_table(
        'ejecuciones',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tipo', sa.Text(), nullable=False),
        sa.Column('origen', sa.Text(), nullable=False),
        sa.Column('estado', sa.Text(), server_default=sa.text("'pendiente'"), nullable=False),
        sa.Column('programacion_id', sa.Integer(), nullable=True),
        sa.Column('fuente', sa.Text(), nullable=False),
        sa.Column('parametros', _JSONB, server_default=sa.text("'{}'"), nullable=False),
        sa.Column('resultado', _JSONB, nullable=True),
        sa.Column('registro', sa.Text(), nullable=True),
        sa.Column('mensaje', sa.Text(), nullable=True),
        *_usuario('ejecuciones', 'solicitada_por'),
        _momento('creada_en'),
        _momento('iniciada', nulo=True),
        _momento('terminada', nulo=True),
        sa.CheckConstraint("tipo IN ('corrida','aprobacion')", name='ck_ejecuciones_tipo'),
        sa.CheckConstraint("origen IN ('programada','manual')", name='ck_ejecuciones_origen'),
        sa.CheckConstraint("estado IN ('pendiente','en_curso','ok','error')", name='ck_ejecuciones_estado'),
        sa.ForeignKeyConstraint(['programacion_id'], ['app.programaciones.id'], ondelete='SET NULL',
                                name='fk_ejecuciones_programacion_id_programaciones'),
        sa.PrimaryKeyConstraint('id', name='pk_ejecuciones'),
        schema='app')
    op.create_index('ix_ejecuciones_estado_id', 'ejecuciones', ['estado', 'id'], schema='app')
    op.create_table(
        'hiperparametros',
        sa.Column('modelo', sa.Text(), nullable=False),
        sa.Column('valores', _JSONB, server_default=sa.text("'{}'"), nullable=False),
        *_usuario('hiperparametros', 'actualizado_por'),
        _momento('actualizado_en'),
        sa.CheckConstraint("modelo IN ('anomalias','clinico')", name='ck_hiperparametros_modelo'),
        sa.PrimaryKeyConstraint('modelo', name='pk_hiperparametros'),
        schema='app')


def downgrade() -> None:
    op.drop_table('hiperparametros', schema='app')
    op.drop_index('ix_ejecuciones_estado_id', table_name='ejecuciones', schema='app')
    op.drop_table('ejecuciones', schema='app')
    op.drop_table('programaciones', schema='app')
    op.drop_table('conexion_origen', schema='app')
