"""Modelos Pydantic del diccionario de variables con versiones (``rutas/diccionario.py``)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class VersionDiccionarioSalida(Base):
    id: int
    version: int
    estado: Literal['vigente', 'borrador', 'archivado']
    origen: Literal['subido', 'corrida', 'semilla']
    nota: str | None = None
    sha256: str
    tamano: int
    creado_por: str | None = None          # nombre de quien la creó
    creado_en: datetime


class VariableDiccionario(Base):
    variable: str
    etiqueta: str | None = None
    estado: str | None = None
    tema: str | None = None
    etapa: str | None = None
    visita: str | None = None               # nombre legible de la visita sugerida
    nota: str | None = None


class CambioEstado(VariableDiccionario):
    antes: str | None = None
    despues: str | None = None


class CambioDesenlace(Base):
    clave: str
    nombre: str | None = None
    antes: str | None = None
    despues: str | None = None


class DiferenciasDiccionario(Base):
    nuevas: list[VariableDiccionario]
    quitadas: list[VariableDiccionario]
    estados: list[CambioEstado]
    desenlaces_activados: list[CambioDesenlace]
    desenlaces_apagados: list[CambioDesenlace]
    sin_cambios: bool
    vigente: int | None = None              # número de la versión vigente contra la que se comparó


class BorradorDiccionario(Base):
    version: VersionDiccionarioSalida
    nuevas: list[VariableDiccionario]


class PorClasificar(Base):
    vigente: VersionDiccionarioSalida | None = None
    variables: list[VariableDiccionario]
    borrador: BorradorDiccionario | None = None   # una actualización trajo variables y falta activarla
    total: int                                     # lo que se muestra en la insignia del menú


class Clasificacion(Base):
    variable: str = Field(min_length=1, max_length=200)
    estado: Literal['Lista', 'No usar']
