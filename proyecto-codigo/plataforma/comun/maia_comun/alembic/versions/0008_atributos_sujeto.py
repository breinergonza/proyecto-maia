"""Atributos por niño (primer y último valor válido de cada variable) y número de datos por niño.

Revision ID: 0008
Revises: 0007
Create Date: 2026-11-09
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0008'
down_revision: str | None = '0007'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'atributos_sujeto',
        sa.Column('corte_id', sa.Integer(), nullable=False),
        sa.Column('sujeto', sa.Text(), nullable=False),
        sa.Column('variable', sa.Text(), nullable=False),
        sa.Column('valor', sa.Text(), nullable=False),
        sa.Column('valor_num', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], ondelete='CASCADE',
                                name='fk_atributos_sujeto_corte_id_cortes'),
        sa.PrimaryKeyConstraint('corte_id', 'sujeto', 'variable', name='pk_atributos_sujeto'),
        schema='sevarti')
    op.create_index('ix_atributos_sujeto_corte_id_variable_valor', 'atributos_sujeto',
                    ['corte_id', 'variable', 'valor'], schema='sevarti')
    op.create_table(
        'resumen_sujeto',
        sa.Column('corte_id', sa.Integer(), nullable=False),
        sa.Column('sujeto', sa.Text(), nullable=False),
        sa.Column('n_datos', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['corte_id'], ['sevarti.cortes.id'], ondelete='CASCADE',
                                name='fk_resumen_sujeto_corte_id_cortes'),
        sa.PrimaryKeyConstraint('corte_id', 'sujeto', name='pk_resumen_sujeto'),
        schema='sevarti')


def downgrade() -> None:
    op.drop_table('resumen_sujeto', schema='sevarti')
    op.drop_index('ix_atributos_sujeto_corte_id_variable_valor', table_name='atributos_sujeto', schema='sevarti')
    op.drop_table('atributos_sujeto', schema='sevarti')
