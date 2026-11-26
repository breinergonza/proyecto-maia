"""Muestras de niños (cohortes guardadas) y los atributos por niño que hacen rápidos sus filtros.

* ``app.muestras``: la definición JSON de una muestra (gramática de ``muestra.py``), con cuántos niños dio y la
  huella de la lista de niños. Una muestra ``inmutable`` no se edita: se duplica.
* ``sevarti.atributos_sujeto``: un valor por niño y variable (regla D1: la primera medición válida, y con el sufijo
  ``@ultima`` la última), sin los códigos especiales. Lo llena ``atributos.cargar_atributos`` al cargar el corte.
* ``sevarti.resumen_sujeto``: cuántos datos tiene cada niño.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from maia_comun.modelos_db import Base


class Muestra(Base):
    __tablename__ = 'muestras'
    __table_args__ = (CheckConstraint("fuente IN ('kmc','simulado')", name='fuente'), {'schema': 'app'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    titulo: Mapped[str] = mapped_column(Text)
    descripcion: Mapped[str | None] = mapped_column(Text)
    fuente: Mapped[str] = mapped_column(Text)
    # el corte puede salir de Postgres cuando llega uno nuevo (sigue en MinIO): la muestra se conserva
    corte_id: Mapped[int | None] = mapped_column(ForeignKey('sevarti.cortes.id', ondelete='SET NULL'))
    version_diccionario: Mapped[int | None] = mapped_column(Integer)
    definicion: Mapped[dict] = mapped_column(JSONB)
    n_ninos: Mapped[int] = mapped_column(Integer)
    n_base: Mapped[int] = mapped_column(Integer)
    huella: Mapped[str] = mapped_column(Text)
    resumen: Mapped[dict | None] = mapped_column(JSONB)
    propietario_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    creada: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    inmutable: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))


class AtributoSujeto(Base):
    __tablename__ = 'atributos_sujeto'
    __table_args__ = (PrimaryKeyConstraint('corte_id', 'sujeto', 'variable'),
                      Index(None, 'corte_id', 'variable', 'valor'), {'schema': 'sevarti'})
    corte_id: Mapped[int] = mapped_column(ForeignKey('sevarti.cortes.id', ondelete='CASCADE'))
    sujeto: Mapped[str] = mapped_column(Text)
    variable: Mapped[str] = mapped_column(Text)         # ``variable`` o ``variable@ultima``
    valor: Mapped[str] = mapped_column(Text)
    valor_num: Mapped[float | None] = mapped_column(Float)


class ResumenSujeto(Base):
    __tablename__ = 'resumen_sujeto'
    __table_args__ = (PrimaryKeyConstraint('corte_id', 'sujeto'), {'schema': 'sevarti'})
    corte_id: Mapped[int] = mapped_column(ForeignKey('sevarti.cortes.id', ondelete='CASCADE'))
    sujeto: Mapped[str] = mapped_column(Text)
    n_datos: Mapped[int] = mapped_column(Integer)
