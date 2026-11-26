"""Tablas de Predicción (funcionalidad 7).

* ``resultados.predicciones``: el estado de un cálculo por muestra o universo y sus **agregados** (distribución, niveles,
  por desenlace, por visita). Nunca el riesgo por niño (D7): la tabla por niño vive solo en la memoria del proceso de la
  API (``prediccion_trabajos``) y se descarta a la hora; si la API se reinicia, se vuelve a calcular.
* ``app.ninos_nuevos``: los niños inventados desde un perfil que alguien guardó («Guardar como niño nuevo») y las
  plantillas de un perfil. Es una tabla aparte para no mezclar con los niños del corte oficial: no hay ``sujeto`` del
  corte aquí, solo la visita, el perfil y los valores que se cambiaron.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from maia_comun.modelos_db import Base

TIPOS_NINO_NUEVO = ('nino', 'plantilla')


class Prediccion(Base):
    __tablename__ = 'predicciones'
    __table_args__ = (CheckConstraint("estado IN ('pendiente','en_curso','ok','error')", name='estado'),
                      CheckConstraint("tipo IN ('muestra','universo')", name='tipo'),
                      Index(None, 'usuario_id', 'id'), {'schema': 'resultados'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    tipo: Mapped[str] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text, server_default=text("'pendiente'"))
    modelo: Mapped[str | None] = mapped_column(Text)            # versión del paquete con que se calcula
    parametros: Mapped[dict] = mapped_column(JSONB)             # filtro, visita, excluir: nunca la lista de niños
    progreso: Mapped[int] = mapped_column(Integer, server_default=text('0'))   # 0 a 100
    paso: Mapped[str | None] = mapped_column(Text)
    n_filtro: Mapped[int | None] = mapped_column(Integer)
    n_puntuados: Mapped[int | None] = mapped_column(Integer)
    agregados: Mapped[dict | None] = mapped_column(JSONB)       # solo cifras de grupo
    mensaje: Mapped[str | None] = mapped_column(Text)
    creada: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    iniciada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terminada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    vence: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))   # retención limitada de las cifras


class NinoNuevo(Base):
    __tablename__ = 'ninos_nuevos'
    __table_args__ = (CheckConstraint("tipo IN ('nino','plantilla')", name='tipo'),
                      Index(None, 'propietario_id', 'tipo'), {'schema': 'app'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipo: Mapped[str] = mapped_column(Text)                     # nino | plantilla
    titulo: Mapped[str] = mapped_column(Text)
    descripcion: Mapped[str | None] = mapped_column(Text)
    propietario_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    modelo: Mapped[str | None] = mapped_column(Text)            # versión del paquete con que se armó
    visita: Mapped[str] = mapped_column(Text)
    perfil: Mapped[str | None] = mapped_column(Text)
    eg_semanas: Mapped[float | None] = mapped_column(Float)
    cambios: Mapped[dict] = mapped_column(JSONB)                # lo que se cambió del ejemplo típico
    valores: Mapped[dict] = mapped_column(JSONB)                # el niño completo (típicos + cambios) al guardar
    resultado: Mapped[dict | None] = mapped_column(JSONB)       # riesgo por desenlace al guardar (solo de este niño inventado)
    creada: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
