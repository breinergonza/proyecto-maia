"""Ejecución ``entrenamiento``: entrenar ya desde la web (extraer de la fuente y entrenar con hiperparámetros propios).

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-28
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint('ck_ejecuciones_tipo', 'ejecuciones', schema='app', type_='check')
    op.create_check_constraint('ck_ejecuciones_tipo', 'ejecuciones', "tipo IN ('corrida','aprobacion','entrenamiento')",
                               schema='app')


def downgrade() -> None:
    op.execute("DELETE FROM app.ejecuciones WHERE tipo = 'entrenamiento'")
    op.drop_constraint('ck_ejecuciones_tipo', 'ejecuciones', schema='app', type_='check')
    op.create_check_constraint('ck_ejecuciones_tipo', 'ejecuciones', "tipo IN ('corrida','aprobacion')", schema='app')
