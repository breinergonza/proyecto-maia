"""Modelos Pydantic de entrada y salida de la API (los tipos del frontend se generan de aquí vía OpenAPI)."""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from maia_comun.modelos_db import PERCENTIL_MUY_ALTO

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
    # posición entera de 0 a 100 (95 = el 5 % con más riesgo); 0,95 avisaría de casi todos los niños
    percentil_minimo: int = Field(default=PERCENTIL_MUY_ALTO, ge=0, le=100)
    destinatarios: list[str] = Field(default_factory=list, max_length=50)
    activo: bool = False

    @field_validator('destinatarios')
    @classmethod
    def _correos(cls, v: list[str]) -> list[str]:
        return [_email(x) for x in v]


class PruebaCorreo(Base):
    destinatario: str

    _v = field_validator('destinatario')(_email)


# ------------------------------------------------------------------ administración de las ejecuciones

Fuente = Literal['kmc', 'simulado']
SslMode = Literal['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']
_TEXTO = Field(min_length=1, max_length=255)


class ResumenAdministracion(Base):
    entorno: str
    solo_simulado: bool
    zona_horaria: str
    mlflow_url: str | None
    cifrado_disponible: bool
    conexion_guardada: bool
    clave_disponible: bool
    programaciones_activas: int
    hiperparametros_ajustados: bool
    paquete_activo: str | None
    ultima_ejecucion: EjecucionSalida | None = None


class ConexionEntrada(Base):
    host: str = _TEXTO
    puerto: int = Field(default=5432, ge=1, le=65535)
    base: str = _TEXTO
    usuario: str = _TEXTO
    esquema: str = Field(default='consumo', min_length=1, max_length=63, pattern=r'^[A-Za-z_][A-Za-z0-9_]*$')
    sslmode: SslMode = 'require'
    timeout: int = Field(default=20, ge=1, le=120)
    clave: str | None = Field(default=None, max_length=500)   # vacía conserva la guardada; nunca se devuelve
    borrar_clave: bool = False


class ConexionSalida(Base):
    host: str
    puerto: int
    base: str
    usuario: str
    esquema: str
    sslmode: str
    timeout: int
    guardada: bool                                  # False: son los valores del entorno (KMC_*)
    origen_clave: Literal['guardada', 'entorno', 'ninguna']
    cifrado_disponible: bool
    actualizado_en: datetime | None = None


class PruebaConexionSalida(Base):
    ok: bool
    mensaje: str
    version_servidor: str | None = None
    esquema: str | None = None
    tablas: list[str] = Field(default_factory=list)


class CampoHiperparametro(Base):
    nombre: str
    etiqueta: str
    tipo: Literal['int', 'float']
    minimo: float
    maximo: float
    ayuda: str
    escala: Literal['por_mil'] | None = None        # 'por_mil': fracción que la web dice también por cada 1.000
    defecto: float | int | None
    valor: float | int | None                       # ajuste guardado; None = el del núcleo


class HiperparametrosSalida(Base):
    modelo: Literal['anomalias', 'clinico']
    campos: list[CampoHiperparametro]
    actualizado_en: datetime | None = None


class HiperparametrosEntrada(Base):
    valores: dict[str, float | int | None]


class Calendario(Base):
    cron: str
    zona: str
    descripcion: str
    proximas: list[datetime]


class ParametrosProgramacion(Base):
    anio_desde: int | None = Field(default=None, ge=1990, le=2100)
    anio_hasta: int | None = Field(default=None, ge=1990, le=2100)
    ventana_meses: int | None = Field(default=None, ge=1, le=240)


class ProgramacionEntrada(Base):
    nombre: str = Field(min_length=1, max_length=120)
    fuente: Fuente = 'kmc'
    cron: str = Field(min_length=9, max_length=120)
    zona: str | None = Field(default=None, max_length=64)
    activo: bool = True
    silencio: bool = False
    solo_si_nuevo: bool = True
    parametros: ParametrosProgramacion = Field(default_factory=ParametrosProgramacion)


class ProgramacionSalida(Base):
    id: int
    nombre: str
    fuente: str
    cron: str
    zona: str
    descripcion: str
    activo: bool
    silencio: bool
    solo_si_nuevo: bool
    parametros: dict[str, Any]
    proxima: datetime | None = None
    ultima: datetime | None = None
    creado_en: datetime | None = None


class EjecucionNueva(Base):
    fuente: Fuente = 'kmc'
    silencio: bool = False
    solo_si_nuevo: bool = False
    parametros: ParametrosProgramacion = Field(default_factory=ParametrosProgramacion)


class EjecucionSalida(Base):
    id: int
    tipo: Literal['corrida', 'aprobacion', 'entrenamiento']
    origen: Literal['programada', 'manual']
    estado: Literal['pendiente', 'en_curso', 'ok', 'error']
    programacion_id: int | None = None
    fuente: str
    parametros: dict[str, Any] = Field(default_factory=dict)
    resultado: dict[str, Any] | None = None
    registro: str | None = None
    mensaje: str | None = None
    creada_en: datetime | None = None
    iniciada: datetime | None = None
    terminada: datetime | None = None


ResumenAdministracion.model_rebuild()


# ------------------------------------------------------------------ entrenamientos (MLflow)

class ModeloRegistrado(Base):
    registro: str
    version: str
    alias: list[str] = Field(default_factory=list)


class Entrenamiento(Base):
    run_id: str
    experimento_id: str
    tipo: Literal['anomalias', 'clinico']
    nombre: str | None = None
    estado: str | None = None
    inicio: datetime | None = None
    fin: datetime | None = None
    fuente: str | None = None
    corte: str | None = None
    hiperparametros: dict[str, str] = Field(default_factory=dict)
    extraccion: dict[str, str] = Field(default_factory=dict)
    metricas: dict[str, float] = Field(default_factory=dict)
    etiquetas: dict[str, str] = Field(default_factory=dict)
    modelo: ModeloRegistrado | None = None
    enlace: str | None = None


class Entrenamientos(Base):
    mlflow_url: str | None
    anomalias: list[Entrenamiento]
    clinico: list[Entrenamiento]


class AprobacionEntrada(Base):
    fuente: Fuente = 'kmc'
    anomalias: str = Field(pattern=r'^\d{1,6}$')    # número de versión en el registro de MLflow
    clinico: str = Field(pattern=r'^\d{1,6}$')


class EntrenarAhora(Base):
    """Entrenar ya desde la web: datos de la fuente y los hiperparámetros escritos en el formulario."""
    fuente: Fuente = 'kmc'
    modelos: list[Literal['anomalias', 'clinico']] = Field(default_factory=lambda: ['anomalias', 'clinico'],
                                                           min_length=1, max_length=2)
    extraer: bool = True                     # ir a la fuente (kmc: extraer; simulado: generar) antes de entrenar
    hiperparametros: dict[Literal['anomalias', 'clinico'], dict[str, float | int | None]] = Field(default_factory=dict)
    filtros: ParametrosProgramacion = Field(default_factory=ParametrosProgramacion)
    sujetos: int | None = Field(default=None, ge=500, le=50000)   # solo datos simulados
    guardar: bool = False                    # guardar también estos hiperparámetros para las ejecuciones programadas
