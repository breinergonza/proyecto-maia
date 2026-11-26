"""Límites de Mis modelos administrables (cola, modelos guardados, días sin uso y aviso).

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-09
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0011'
down_revision: str | None = '0010'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # sin filas: mientras administración no escriba un límite valen los de fábrica de ``maia_comun.cuotas``
    op.create_table(
        'cuotas_config',
        sa.Column('clave', sa.Text(), nullable=False),
        sa.Column('valor', sa.Integer(), nullable=False),
        sa.Column('actualizado_por', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('actualizado_en', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['actualizado_por'], ['app.usuarios.id'], ondelete='SET NULL',
                                name='fk_cuotas_config_actualizado_por_usuarios'),
        sa.PrimaryKeyConstraint('clave', name='pk_cuotas_config'),
        schema='app')


def downgrade() -> None:
    op.drop_table('cuotas_config', schema='app')
