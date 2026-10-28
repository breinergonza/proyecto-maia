"""Trazabilidad de la extracción: con qué parámetros y qué consultas se armó cada corte.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-28
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('cortes', sa.Column('parametros', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
                  schema='sevarti')
    op.add_column('cortes', sa.Column('consulta_sha', sa.Text(), nullable=True), schema='sevarti')


def downgrade() -> None:
    op.drop_column('cortes', 'consulta_sha', schema='sevarti')
    op.drop_column('cortes', 'parametros', schema='sevarti')
