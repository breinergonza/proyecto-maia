"""Muestras de niños: definición JSON, tamaño y huella de la lista de niños.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-09
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0007'
down_revision: str | None = '0006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'muestras',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('titulo', sa.Text(), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=True),
        sa.Column('fuente', sa.Text(), nullable=False),
        sa.Column('corte_id', sa.Integer(), nullable=True),
        sa.Column('version_diccionario', sa.Integer(), nullable=True),
        sa.Column('definicion', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('n_ninos', sa.Integer(), nullable=False),
        sa.Column('n_base', sa.Integer(), nullable=False),
        sa.Column('huella', sa.Text(), nullable=False),
        sa.Column('resumen', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('propietario_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('creada', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('inmutable', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.CheckConstraint("fuente IN ('kmc','simulado')", name='ck_muestras_fuente'),
        sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], ondelete='SET NULL',
                                name='fk_muestras_corte_id_cortes'),
        sa.ForeignKeyConstraint(['propietario_id'], ['app.usuarios.id'], ondelete='SET NULL',
                                name='fk_muestras_propietario_id_usuarios'),
        sa.PrimaryKeyConstraint('id', name='pk_muestras'),
        schema='app')


def downgrade() -> None:
    op.drop_table('muestras', schema='app')
