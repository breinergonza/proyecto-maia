"""Límites por persona para entrenar modelos propios (D17). La administración no tiene cuota.

Valores por defecto: 1 entrenamiento en cola o en curso y 3 modelos personales guardados; se cambian con las
variables de entorno ``MAIA_CUOTA_COLA`` y ``MAIA_CUOTA_MODELOS``.
"""
from __future__ import annotations

import os


def _entero(nombre: str, defecto: int) -> int:
    try:
        return max(0, int(os.environ.get(nombre, defecto)))
    except ValueError:
        return defecto


def cuota_cola() -> int:
    return _entero('MAIA_CUOTA_COLA', 1)


def cuota_modelos() -> int:
    return _entero('MAIA_CUOTA_MODELOS', 3)
