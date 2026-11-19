"""Analítica de los modelos: artefactos agregados (curvas, tablas por grupo y trimestre) que se calculan una vez al
terminar el entrenamiento y la web solo lee (D32). Nunca predicciones por niño (D7); celdas con menos de 5 niños
se omiten y las distribuciones piden 20 o más (D4, D52).

Una fila por entrenamiento, desenlace y submódulo: ``tipo`` es ``meta`` (descripción del entrenamiento, sin desenlace),
``rendimiento``, ``calibracion``, ``poblacion``, ``equidad``, ``estabilidad``, ``interpretabilidad`` o ``chequeos``.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from maia_comun.modelos_db import Base


class Analitica(Base):
    __tablename__ = 'analitica'
    __table_args__ = (Index(None, 'entrenamiento_id', 'tipo'), {'schema': 'resultados'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entrenamiento_id: Mapped[int] = mapped_column(Integer)   # la ejecución de entrenamiento; si no hubo, un número propio
    ejecucion_id: Mapped[int | None] = mapped_column(Integer)
    modelo: Mapped[str] = mapped_column(Text)                # clinico
    desenlace: Mapped[str | None] = mapped_column(Text)      # clave; vacío en la fila ``meta``
    tipo: Mapped[str] = mapped_column(Text)
    datos: Mapped[dict] = mapped_column(JSONB)
    creada: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
