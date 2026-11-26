"""Desenlaces observados por niño y familia (la vista clínica).

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-19
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0013'
down_revision: str | None = '0012'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'desenlaces_observados',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('corrida_id', sa.Integer(), nullable=False),
        sa.Column('sujeto', sa.Text(), nullable=False),
        sa.Column('familia', sa.Text(), nullable=False),
        sa.Column('valor', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['corrida_id'], ['resultados.corridas.id'], ondelete='CASCADE',
                                name=op.f('fk_desenlaces_observados_corrida_id_corridas')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_desenlaces_observados')),
        schema='resultados')
    op.create_index(op.f('ix_desenlaces_observados_corrida_id_familia'), 'desenlaces_observados',
                    ['corrida_id', 'familia'], unique=False, schema='resultados')
    op.create_index(op.f('ix_desenlaces_observados_corrida_id_sujeto'), 'desenlaces_observados',
                    ['corrida_id', 'sujeto'], unique=False, schema='resultados')


def downgrade() -> None:
    op.drop_table('desenlaces_observados', schema='resultados')
