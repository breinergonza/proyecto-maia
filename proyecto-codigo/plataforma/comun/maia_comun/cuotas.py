"""Límites por persona para entrenar modelos propios (D17). La administración no tiene cuota.

Los valores viven en la tabla ``app.cuotas_config`` (migración 0011) y los cambia administración desde la web. Si la
tabla está vacía o no se pasa sesión, valen los de siempre: 1 entrenamiento en cola o en curso, 3 modelos personales
guardados, borrado a los 90 días sin uso con aviso 14 días antes. Las variables de entorno ``MAIA_CUOTA_COLA`` y
``MAIA_CUOTA_MODELOS`` siguen cambiando el valor por defecto (cuando administración no escribió uno).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from maia_comun.modelos_db import Base

CLAVES = ('cola_max', 'modelos_max', 'dias_sin_uso', 'dias_aviso')
LIMITES = {'cola_max': (0, 50), 'modelos_max': (0, 200), 'dias_sin_uso': (1, 3650), 'dias_aviso': (0, 365)}
ENTORNO = {'cola_max': 'MAIA_CUOTA_COLA', 'modelos_max': 'MAIA_CUOTA_MODELOS'}
DEFECTOS = {'cola_max': 1, 'modelos_max': 3, 'dias_sin_uso': 90, 'dias_aviso': 14}


class CuotaConfig(Base):
    __tablename__ = 'cuotas_config'
    __table_args__ = {'schema': 'app'}
    clave: Mapped[str] = mapped_column(Text, primary_key=True)
    valor: Mapped[int] = mapped_column(Integer)
    actualizado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def _entero(nombre: str, defecto: int) -> int:
    try:
        return max(0, int(os.environ.get(nombre, defecto)))
    except ValueError:
        return defecto


def defecto(clave: str) -> int:
    """El valor de fábrica (con el entorno encima, para quien ya lo usaba)."""
    return _entero(ENTORNO[clave], DEFECTOS[clave]) if clave in ENTORNO else DEFECTOS[clave]


def valores(s: Session | None = None) -> dict[str, int]:
    """Los cuatro valores vigentes: lo escrito por administración, o el valor de fábrica."""
    salida = {k: defecto(k) for k in CLAVES}
    if s is not None:
        for c in s.scalars(select(CuotaConfig)):
            if c.clave in salida:
                salida[c.clave] = c.valor
    return salida


def cuota_cola(s: Session | None = None) -> int:
    return valores(s)['cola_max']


def cuota_modelos(s: Session | None = None) -> int:
    return valores(s)['modelos_max']


def dias_sin_uso(s: Session | None = None) -> int:
    return valores(s)['dias_sin_uso']


def dias_aviso(s: Session | None = None) -> int:
    return valores(s)['dias_aviso']


def validar(cambios: dict[str, Any]) -> dict[str, int]:
    """Solo claves conocidas y enteros dentro de su rango; ``ValueError`` en español si algo no cuadra."""
    limpio: dict[str, int] = {}
    for k, v in cambios.items():
        if k not in CLAVES:
            raise ValueError(f'«{k}» no es un límite conocido.')
        if isinstance(v, bool) or not isinstance(v, int):
            raise ValueError(f'«{k}» debe ser un número entero.')
        lo, hi = LIMITES[k]
        if not lo <= v <= hi:
            raise ValueError(f'«{k}» debe estar entre {lo} y {hi}.')
        limpio[k] = v
    return limpio


def guardar(s: Session, cambios: dict[str, int], usuario_id=None) -> dict[str, int]:
    """Escribe los límites cambiados (sin commit) y devuelve los vigentes."""
    for k, v in validar(cambios).items():
        fila = s.get(CuotaConfig, k) or CuotaConfig(clave=k, valor=v)
        fila.valor, fila.actualizado_por, fila.actualizado_en = v, usuario_id, func.now()
        s.add(fila)
    s.flush()
    return valores(s)
