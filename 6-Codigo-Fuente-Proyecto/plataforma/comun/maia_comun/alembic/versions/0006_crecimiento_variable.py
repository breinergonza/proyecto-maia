"""Crecimiento guarda la variable de origen: de ella sale la unidad (p. ej. el peso para la talla se mide en kg o g).

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-09
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # nullable: las corridas anteriores no la tienen y la API vuelve a buscar la unidad por indicador y etapa
    op.add_column('crecimiento', sa.Column('variable', sa.Text(), nullable=True), schema='resultados')


def downgrade() -> None:
    op.drop_column('crecimiento', 'variable', schema='resultados')
