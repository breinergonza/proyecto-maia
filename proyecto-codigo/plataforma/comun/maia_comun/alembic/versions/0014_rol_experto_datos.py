"""Rol «Experto en datos» (``datos``): opera datos y modelos; el experto clínico se queda con lo clínico (D77).

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-21
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = '0014'
down_revision: str | None = '0013'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # un valor nuevo de un enum no se puede usar en la misma transacción que lo crea: va en su propio bloque
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE app.rol ADD VALUE IF NOT EXISTS 'datos' BEFORE 'visualizador'")


def downgrade() -> None:
    # Postgres no quita valores de un enum: quien tenía el rol nuevo queda en consulta (el permiso menor) y el valor sin uso
    op.execute("UPDATE app.usuarios SET rol = 'visualizador' WHERE rol = 'datos'")
