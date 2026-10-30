"""Diccionario de variables con versiones: el Excel de los expertos guardado en Postgres (una sola versión vigente).

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-30
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'diccionarios',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('archivo', sa.LargeBinary(), nullable=False),
        sa.Column('sha256', sa.Text(), nullable=False),
        sa.Column('estado', sa.Text(), server_default=sa.text("'borrador'"), nullable=False),
        sa.Column('origen', sa.Text(), nullable=False),
        sa.Column('nota', sa.Text(), nullable=True),
        sa.Column('creado_por', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('creado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("estado IN ('vigente','borrador','archivado')", name='ck_diccionarios_estado'),
        sa.CheckConstraint("origen IN ('subido','corrida','semilla')", name='ck_diccionarios_origen'),
        sa.ForeignKeyConstraint(['creado_por'], ['app.usuarios.id'], ondelete='SET NULL',
                                name='fk_diccionarios_creado_por_usuarios'),
        sa.PrimaryKeyConstraint('id', name='pk_diccionarios'),
        sa.UniqueConstraint('version', name='uq_diccionarios_version'),
        schema='app')
    # solo una versión vigente a la vez
    op.create_index('ix_diccionarios_un_vigente', 'diccionarios', ['estado'], unique=True, schema='app',
                    postgresql_where=sa.text("estado = 'vigente'"))


def downgrade() -> None:
    op.drop_index('ix_diccionarios_un_vigente', table_name='diccionarios', schema='app')
    op.drop_table('diccionarios', schema='app')
