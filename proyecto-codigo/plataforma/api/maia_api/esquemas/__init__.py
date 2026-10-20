"""Modelos Pydantic de entrada y salida de la API (los tipos del frontend se generan de aquí vía OpenAPI)."""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Rol = Literal['admin', 'experto', 'visualizador']
Respuesta = Literal['si', 'no', 'no_se']
_EMAIL = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _email(v: str) -> str:
    v = v.strip().lower()
    if not _EMAIL.match(v):
        raise ValueError('correo no válido')
    return v


class Base(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------------ auth y usuarios

class Login(Base):
    email: str
    clave: str = Field(min_length=1, max_length=200)

    _v = field_validator('email')(_email)


class UsuarioSalida(Base):
    id: uuid.UUID
    email: str
    nombre: str
    rol: Rol
    activo: bool = True
    creado_en: datetime | None = None
    ultimo_ingreso: datetime | None = None


class RespuestaLogin(Base):
    acceso: str
    usuario: UsuarioSalida


class UsuarioNuevo(Base):
    email: str
    nombre: str = Field(min_length=2, max_length=120)
    rol: Rol
    clave: str = Field(min_length=10, max_length=200)

    _v = field_validator('email')(_email)


class UsuarioCambio(Base):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    rol: Rol | None = None
    activo: bool | None = None
    clave: str | None = Field(default=None, min_length=10, max_length=200)


# ------------------------------------------------------------------ modelos y corridas

class PaqueteSalida(Base):
    version: str
    fuente: str
    activo: bool
    subido_en: datetime | None = None
    corte: str | None = None
    creado: str | None = None
    modelos: dict[str, Any] = {}
    metricas: dict[str, float] = {}


class CorridaNueva(Base):
    tipo: Literal['demo'] = 'demo'
    silencio: bool = False


class CorridaSalida(Base):
    id: int
    tipo: str
    estado: str
    silencio: bool
    fuente: str | None = None
    fecha_corte: date | None = None
    paquete: str | None = None
    modelo_anomalias: str | None = None
    modelo_clinico: str | None = None
    paso: str | None = None
    resumen: dict[str, Any] | None = None
    iniciada: datetime | None = None
    terminada: datetime | None = None
    mensaje: str | None = None


# ------------------------------------------------------------------ revisión

class RevisionDatoEntrada(Base):
    es_error: Respuesta
    comentario: str | None = Field(default=None, max_length=2000)


class RevisionRiesgoEntrada(Base):
    preocupa: Respuesta
    comentario: str | None = Field(default=None, max_length=2000)


# ------------------------------------------------------------------ inferencia

class SujetoEntrada(Base):
    sujeto: str = Field(min_length=1, max_length=64)
    grupo: str | None = None
    fecha_nacimiento: date | None = None
    anio_nacimiento: int | None = None
    eg_semanas: float | None = Field(default=None, ge=20, le=45)


class MedicionEntrada(Base):
    sujeto: str
    variable: str
    valor: str | float | int | None = None
    fecha: date | None = None
    edad_dias: float | None = None


class EpisodioEntrada(Base):
    sujeto: str
    tipo: str
    edad_inicio: float | None = None
    edad_fin: float | None = None


class PeticionInferencia(Base):
    corte: date | None = None
    sujetos: list[SujetoEntrada] = Field(min_length=1, max_length=50)
    mediciones: list[MedicionEntrada] = Field(min_length=1, max_length=5000)
    episodios: list[EpisodioEntrada] = Field(default_factory=list, max_length=500)


# ------------------------------------------------------------------ notificaciones

class ConfigNotificacionEntrada(Base):
    desenlace: str
    nombre: str | None = None
    percentil_minimo: float = Field(default=95, ge=0, le=100)
    destinatarios: list[str] = Field(default_factory=list, max_length=50)
    activo: bool = False

    @field_validator('destinatarios')
    @classmethod
    def _correos(cls, v: list[str]) -> list[str]:
        return [_email(x) for x in v]


class PruebaCorreo(Base):
    destinatario: str

    _v = field_validator('destinatario')(_email)
