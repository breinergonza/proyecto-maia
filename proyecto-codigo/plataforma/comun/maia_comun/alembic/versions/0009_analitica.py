"""Analítica de los modelos: artefactos agregados por entrenamiento, desenlace y submódulo.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-09
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0009'
down_revision: str | None = '0008'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'analitica',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('entrenamiento_id', sa.Integer(), nullable=False),
        sa.Column('ejecucion_id', sa.Integer(), nullable=True),
        sa.Column('modelo', sa.Text(), nullable=False),
        sa.Column('desenlace', sa.Text(), nullable=True),
        sa.Column('tipo', sa.Text(), nullable=False),
        sa.Column('datos', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('creada', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id', name='pk_analitica'),
        schema='resultados')
    op.create_index('ix_analitica_entrenamiento_id_tipo', 'analitica', ['entrenamiento_id', 'tipo'], schema='resultados')


def downgrade() -> None:
    op.drop_index('ix_analitica_entrenamiento_id_tipo', table_name='analitica', schema='resultados')
    op.drop_table('analitica', schema='resultados')
