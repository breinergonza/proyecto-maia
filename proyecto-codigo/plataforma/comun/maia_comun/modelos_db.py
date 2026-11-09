"""Tablas de la base ``maia`` (sección 4.4 del plan), en tres esquemas:

* ``sevarti``: el corte vigente de cada fuente, para las consultas de la API (el histórico vive en MinIO).
* ``resultados``: corridas, alertas de dato, alarmas de grupo, riesgos, crecimiento y revisiones expertas.
* ``app``: usuarios, tokens de refresco, paquetes de modelos, notificaciones y auditoría.

Las migraciones (Alembic, ``maia_comun/alembic``) se escriben a mano a partir de estas clases.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    MetaData,
    PrimaryKeyConstraint,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, CITEXT, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

CONVENCION = {
    'ix': 'ix_%(table_name)s_%(column_0_N_name)s',
    'uq': 'uq_%(table_name)s_%(column_0_N_name)s',
    'ck': 'ck_%(table_name)s_%(constraint_name)s',
    'fk': 'fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s',
    'pk': 'pk_%(table_name)s',
}
ROLES = ('admin', 'experto', 'visualizador')
FUENTES = ('kmc', 'simulado')
RESPUESTAS = ('si', 'no', 'no_se')


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=CONVENCION)


# ============================================================ esquema sevarti

class Corte(Base):
    __tablename__ = 'cortes'
    __table_args__ = (UniqueConstraint('fuente', 'fecha_corte'),
                      CheckConstraint("fuente IN ('kmc','simulado')", name='fuente'),
                      {'schema': 'sevarti'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fuente: Mapped[str] = mapped_column(Text)
    fecha_corte: Mapped[date] = mapped_column(Date)
    ruta_minio: Mapped[str | None] = mapped_column(Text)        # s3://maia-sevarti/cortes/<fuente>/<fecha>/
    sha256: Mapped[str | None] = mapped_column(Text)
    filas: Mapped[dict] = mapped_column(JSONB)
    vigente: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    parametros: Mapped[dict | None] = mapped_column(JSONB)      # parámetros de la extracción (0002)
    consulta_sha: Mapped[str | None] = mapped_column(Text)      # sha256 de las consultas SQL ejecutadas


def _fk_corte() -> ForeignKey:
    return ForeignKey('sevarti.cortes.id', ondelete='CASCADE')


class Esquema(Base):
    __tablename__ = 'esquema'
    __table_args__ = (PrimaryKeyConstraint('corte_id', 'variable'), {'schema': 'sevarti'})
    corte_id: Mapped[int] = mapped_column(_fk_corte())
    variable: Mapped[str] = mapped_column(Text)
    datos: Mapped[dict] = mapped_column(JSONB)


class Etapa(Base):
    __tablename__ = 'etapas'
    __table_args__ = (PrimaryKeyConstraint('corte_id', 'etapa'), {'schema': 'sevarti'})
    corte_id: Mapped[int] = mapped_column(_fk_corte())
    etapa: Mapped[str] = mapped_column(Text)
    orden: Mapped[int] = mapped_column(Integer)
    edad_min: Mapped[float | None] = mapped_column(Float)
    edad_max: Mapped[float | None] = mapped_column(Float)
    base: Mapped[str] = mapped_column(Text)
    nombre: Mapped[str | None] = mapped_column(Text)


class Sujeto(Base):
    __tablename__ = 'sujetos'
    __table_args__ = (PrimaryKeyConstraint('corte_id', 'sujeto'), {'schema': 'sevarti'})
    corte_id: Mapped[int] = mapped_column(_fk_corte())
    sujeto: Mapped[str] = mapped_column(Text)
    grupo: Mapped[str | None] = mapped_column(Text)
    fecha_nacimiento: Mapped[date | None] = mapped_column(Date)
    anio_nacimiento: Mapped[int | None] = mapped_column(Integer)
    eg_semanas: Mapped[float | None] = mapped_column(Float)


class Medicion(Base):
    __tablename__ = 'mediciones'
    __table_args__ = (PrimaryKeyConstraint('corte_id', 'id'), Index(None, 'corte_id', 'sujeto'),
                      {'schema': 'sevarti'})
    corte_id: Mapped[int] = mapped_column(_fk_corte())
    id: Mapped[int] = mapped_column(BigInteger)
    sujeto: Mapped[str] = mapped_column(Text)
    variable: Mapped[str] = mapped_column(Text)
    valor: Mapped[str | None] = mapped_column(Text)
    fecha: Mapped[date | None] = mapped_column(Date)
    edad_dias: Mapped[float | None] = mapped_column(Float)


class Episodio(Base):
    __tablename__ = 'episodios'
    __table_args__ = (PrimaryKeyConstraint('corte_id', 'id'), Index(None, 'corte_id', 'sujeto'),
                      {'schema': 'sevarti'})
    corte_id: Mapped[int] = mapped_column(_fk_corte())
    id: Mapped[int] = mapped_column(BigInteger)
    sujeto: Mapped[str] = mapped_column(Text)
    tipo: Mapped[str] = mapped_column(Text)
    edad_inicio: Mapped[float | None] = mapped_column(Float)
    edad_fin: Mapped[float | None] = mapped_column(Float)


class Quiebre(Base):
    __tablename__ = 'quiebres'
    __table_args__ = (PrimaryKeyConstraint('corte_id', 'quiebre'), {'schema': 'sevarti'})
    corte_id: Mapped[int] = mapped_column(_fk_corte())
    quiebre: Mapped[str] = mapped_column(Text)
    fecha: Mapped[date | None] = mapped_column(Date)


# ============================================================ esquema app

class Usuario(Base):
    __tablename__ = 'usuarios'
    __table_args__ = {'schema': 'app'}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()'))
    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    nombre: Mapped[str] = mapped_column(Text)
    hash_clave: Mapped[str] = mapped_column(Text)
    rol: Mapped[str] = mapped_column(Enum(*ROLES, name='rol', schema='app'))
    activo: Mapped[bool] = mapped_column(Boolean, server_default=text('true'))
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ultimo_ingreso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'
    __table_args__ = {'schema': 'app'}
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text('gen_random_uuid()'))
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('app.usuarios.id', ondelete='CASCADE'), index=True)
    hash_token: Mapped[str] = mapped_column(Text, unique=True)
    expira: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revocado: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))


class Paquete(Base):
    __tablename__ = 'paquetes'
    __table_args__ = {'schema': 'app'}
    version: Mapped[str] = mapped_column(Text, primary_key=True)
    fuente: Mapped[str] = mapped_column(Text)
    manifest: Mapped[dict] = mapped_column(JSONB)
    ruta: Mapped[str] = mapped_column(Text)
    activo: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
    subido_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    subido_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# «Riesgo alto»: estar en el 10 % de mayor riesgo de su desenlace (percentil dentro de la corrida), no un umbral clínico.
# La web tiene los mismos valores (RIESGO_ALTO, RIESGO_MUY_ALTO); pruebas/test_umbrales.py los mantiene iguales.
PERCENTIL_ALTO = 90
# «Riesgo muy alto»: el 5 % de mayor riesgo; es también el mínimo con que parten los avisos por correo.
PERCENTIL_MUY_ALTO = 95


class ConfigNotificacion(Base):
    __tablename__ = 'config_notificaciones'
    __table_args__ = {'schema': 'app'}
    desenlace: Mapped[str] = mapped_column(Text, primary_key=True)   # clave del desenlace
    nombre: Mapped[str | None] = mapped_column(Text)
    percentil_minimo: Mapped[float] = mapped_column(Float, server_default=text(str(PERCENTIL_MUY_ALTO)))
    destinatarios: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default=text("'{}'"))
    activo: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))


class Auditoria(Base):
    __tablename__ = 'auditoria'
    __table_args__ = {'schema': 'app'}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    accion: Mapped[str] = mapped_column(Text)
    recurso: Mapped[str | None] = mapped_column(Text)
    detalle: Mapped[dict | None] = mapped_column(JSONB)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---- administración de las ejecuciones (0003): conexión a la base de la entidad, horarios, cola e hiperparámetros

class ConexionOrigen(Base):
    __tablename__ = 'conexion_origen'
    __table_args__ = (CheckConstraint("fuente IN ('kmc')", name='fuente'), {'schema': 'app'})
    fuente: Mapped[str] = mapped_column(Text, primary_key=True)
    host: Mapped[str] = mapped_column(Text)
    puerto: Mapped[int] = mapped_column(Integer, server_default=text('5432'))
    base: Mapped[str] = mapped_column(Text)
    usuario: Mapped[str] = mapped_column(Text)
    esquema: Mapped[str] = mapped_column(Text, server_default=text("'consumo'"))
    sslmode: Mapped[str] = mapped_column(Text, server_default=text("'require'"))
    timeout: Mapped[int] = mapped_column(Integer, server_default=text('20'))
    clave_cifrada: Mapped[str | None] = mapped_column(Text)   # Fernet con MAIA_CIFRADO_CLAVE; nunca sale de la API
    actualizado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Programacion(Base):
    __tablename__ = 'programaciones'
    __table_args__ = (CheckConstraint("fuente IN ('kmc','simulado')", name='fuente'), {'schema': 'app'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(Text)
    fuente: Mapped[str] = mapped_column(Text, server_default=text("'kmc'"))
    cron: Mapped[str] = mapped_column(Text)                   # minuto hora día mes día-semana (maia_comun.calendario)
    zona: Mapped[str] = mapped_column(Text, server_default=text("'America/Bogota'"))
    activo: Mapped[bool] = mapped_column(Boolean, server_default=text('true'))
    silencio: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
    solo_si_nuevo: Mapped[bool] = mapped_column(Boolean, server_default=text('true'))
    parametros: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'"))   # filtros de extracción
    proxima: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ultima: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Ejecucion(Base):
    __tablename__ = 'ejecuciones'
    __table_args__ = (CheckConstraint("tipo IN ('corrida','aprobacion','entrenamiento')", name='tipo'),
                      CheckConstraint("origen IN ('programada','manual')", name='origen'),
                      CheckConstraint("estado IN ('pendiente','en_curso','ok','error')", name='estado'),
                      Index(None, 'estado', 'id'), {'schema': 'app'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipo: Mapped[str] = mapped_column(Text)
    origen: Mapped[str] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text, server_default=text("'pendiente'"))
    programacion_id: Mapped[int | None] = mapped_column(ForeignKey('app.programaciones.id', ondelete='SET NULL'))
    fuente: Mapped[str] = mapped_column(Text)
    parametros: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'"))
    resultado: Mapped[dict | None] = mapped_column(JSONB)      # corrida, versiones registradas, paquete
    registro: Mapped[str | None] = mapped_column(Text)         # últimas líneas de la salida (sin datos por niño)
    mensaje: Mapped[str | None] = mapped_column(Text)
    solicitada_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    creada_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    iniciada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terminada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Hiperparametro(Base):
    __tablename__ = 'hiperparametros'
    __table_args__ = (CheckConstraint("modelo IN ('anomalias','clinico')", name='modelo'), {'schema': 'app'})
    modelo: Mapped[str] = mapped_column(Text, primary_key=True)
    valores: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'"))
    actualizado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    actualizado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---- diccionario de variables con versiones (0005): el Excel de los expertos, guardado aquí y no en MinIO

class VersionDiccionario(Base):
    __tablename__ = 'diccionarios'
    __table_args__ = (CheckConstraint("estado IN ('vigente','borrador','archivado')", name='estado'),
                      CheckConstraint("origen IN ('subido','corrida','semilla')", name='origen'),
                      Index('ix_diccionarios_un_vigente', 'estado', unique=True,
                            postgresql_where=text("estado = 'vigente'")),
                      {'schema': 'app'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, unique=True)
    archivo: Mapped[bytes] = mapped_column(LargeBinary)          # el .xlsx tal cual (pesa poco)
    sha256: Mapped[str] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text, server_default=text("'borrador'"))
    origen: Mapped[str] = mapped_column(Text)
    nota: Mapped[str | None] = mapped_column(Text)
    creado_por: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('app.usuarios.id', ondelete='SET NULL'))
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ============================================================ esquema resultados

class Corrida(Base):
    __tablename__ = 'corridas'
    __table_args__ = (CheckConstraint("tipo IN ('completa','revision','riesgos','demo')", name='tipo'),
                      CheckConstraint("estado IN ('en_curso','ok','error')", name='estado'),
                      {'schema': 'resultados'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    corte_id: Mapped[int | None] = mapped_column(ForeignKey('sevarti.cortes.id', ondelete='SET NULL'))
    fuente: Mapped[str | None] = mapped_column(Text)
    fecha_corte: Mapped[date | None] = mapped_column(Date)
    tipo: Mapped[str] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text, server_default=text("'en_curso'"))
    silencio: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
    modelo_anomalias: Mapped[str | None] = mapped_column(Text)
    modelo_clinico: Mapped[str | None] = mapped_column(Text)
    paquete: Mapped[str | None] = mapped_column(Text)
    dispositivo: Mapped[str | None] = mapped_column(Text)
    paso: Mapped[str | None] = mapped_column(Text)          # lo que está haciendo ahora, para el progreso
    resumen: Mapped[dict | None] = mapped_column(JSONB)     # solo agregados
    iniciada: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    terminada: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mensaje: Mapped[str | None] = mapped_column(Text)


def _fk_corrida() -> ForeignKey:
    return ForeignKey('resultados.corridas.id', ondelete='CASCADE')


class AlertaDato(Base):
    __tablename__ = 'alertas_dato'
    __table_args__ = (Index(None, 'corrida_id', 'prioridad'), Index(None, 'corrida_id', 'sujeto'),
                      {'schema': 'resultados'})
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    corrida_id: Mapped[int] = mapped_column(_fk_corrida())
    sujeto: Mapped[str] = mapped_column(Text)
    variable: Mapped[str] = mapped_column(Text)
    etiqueta: Mapped[str | None] = mapped_column(Text)
    unidad: Mapped[str | None] = mapped_column(Text)
    etapa: Mapped[str | None] = mapped_column(Text)
    fecha: Mapped[date | None] = mapped_column(Date)
    valor: Mapped[str | None] = mapped_column(Text)
    esperado: Mapped[float | None] = mapped_column(Float)
    rango_bajo: Mapped[float | None] = mapped_column(Float)
    rango_alto: Mapped[float | None] = mapped_column(Float)
    capas: Mapped[list[str]] = mapped_column(ARRAY(Text))
    motivo: Mapped[str | None] = mapped_column(Text)
    fuerza: Mapped[float | None] = mapped_column(Float)
    prioridad: Mapped[int] = mapped_column(Integer)          # 1 = la primera de la cola


class AlarmaGrupo(Base):
    __tablename__ = 'alarmas_grupo'
    __table_args__ = {'schema': 'resultados'}
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    corrida_id: Mapped[int] = mapped_column(_fk_corrida(), index=True)
    grupo: Mapped[str | None] = mapped_column(Text)
    periodo: Mapped[str | None] = mapped_column(Text)
    variable: Mapped[str | None] = mapped_column(Text)
    etiqueta: Mapped[str | None] = mapped_column(Text)
    senal: Mapped[str | None] = mapped_column(Text)
    valor: Mapped[float | None] = mapped_column(Float)
    referencia: Mapped[float | None] = mapped_column(Float)
    estadistico: Mapped[float | None] = mapped_column(Float)
    que_paso: Mapped[str | None] = mapped_column(Text)


class Riesgo(Base):
    __tablename__ = 'riesgos'
    __table_args__ = (Index(None, 'corrida_id', 'clave', 'percentil'), Index(None, 'corrida_id', 'sujeto'),
                      {'schema': 'resultados'})
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    corrida_id: Mapped[int] = mapped_column(_fk_corrida())
    sujeto: Mapped[str] = mapped_column(Text)
    clave: Mapped[str] = mapped_column(Text)                 # clave del desenlace
    desenlace: Mapped[str] = mapped_column(Text)             # nombre legible
    momento: Mapped[str] = mapped_column(Text)
    riesgo: Mapped[float] = mapped_column(Float)
    percentil: Mapped[float] = mapped_column(Float)
    motivos: Mapped[list] = mapped_column(JSONB)
    fecha_visita: Mapped[date | None] = mapped_column(Date)
    silencio: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))


class Crecimiento(Base):
    __tablename__ = 'crecimiento'
    __table_args__ = (Index(None, 'corrida_id', 'sujeto'), {'schema': 'resultados'})
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    corrida_id: Mapped[int] = mapped_column(_fk_corrida())
    sujeto: Mapped[str] = mapped_column(Text)
    etapa: Mapped[str | None] = mapped_column(Text)
    indicador: Mapped[str] = mapped_column(Text)
    variable: Mapped[str | None] = mapped_column(Text)       # variable de origen: de ella sale la unidad del valor
    fecha: Mapped[date | None] = mapped_column(Date)
    edad_corregida: Mapped[float | None] = mapped_column(Float)
    valor: Mapped[float | None] = mapped_column(Float)
    z: Mapped[float | None] = mapped_column(Float)
    bajo_2de: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
    caida_1de: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
    improbable: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))


class MetricaModelo(Base):
    __tablename__ = 'metricas_modelo'
    __table_args__ = (Index(None, 'corrida_id'), {'schema': 'resultados'})
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    corrida_id: Mapped[int | None] = mapped_column(_fk_corrida())
    modelo: Mapped[str] = mapped_column(Text)                # anomalias | clinico
    version: Mapped[str] = mapped_column(Text)
    clave: Mapped[str] = mapped_column(Text)                 # desenlace, tipo de error o capa
    metrica: Mapped[str] = mapped_column(Text)
    valor: Mapped[float | None] = mapped_column(Float)


class RevisionDato(Base):
    __tablename__ = 'revision_datos'
    __table_args__ = (PrimaryKeyConstraint('alerta_id', 'usuario_id'),
                      CheckConstraint("es_error IN ('si','no','no_se')", name='es_error'),
                      {'schema': 'resultados'})
    alerta_id: Mapped[int] = mapped_column(ForeignKey('resultados.alertas_dato.id', ondelete='CASCADE'))
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('app.usuarios.id', ondelete='CASCADE'))
    es_error: Mapped[str] = mapped_column(Text)
    comentario: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RevisionRiesgo(Base):
    __tablename__ = 'revision_riesgos'
    __table_args__ = (PrimaryKeyConstraint('riesgo_id', 'usuario_id'),
                      CheckConstraint("preocupa IN ('si','no','no_se')", name='preocupa'),
                      {'schema': 'resultados'})
    riesgo_id: Mapped[int] = mapped_column(ForeignKey('resultados.riesgos.id', ondelete='CASCADE'))
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('app.usuarios.id', ondelete='CASCADE'))
    preocupa: Mapped[str] = mapped_column(Text)
    comentario: Mapped[str | None] = mapped_column(Text)
    creado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notificacion(Base):
    __tablename__ = 'notificaciones'
    __table_args__ = (UniqueConstraint('riesgo_id', 'destinatario'),
                      CheckConstraint("estado IN ('enviado','error')", name='estado'),
                      {'schema': 'app'})
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    riesgo_id: Mapped[int] = mapped_column(ForeignKey('resultados.riesgos.id', ondelete='CASCADE'))
    destinatario: Mapped[str] = mapped_column(Text)
    estado: Mapped[str] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    enviado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


ESQUEMAS = ('sevarti', 'resultados', 'app')
import maia_comun.modelos_analitica  # noqa: E402,F401  (registra la tabla de analítica en la metadata)
import maia_comun.modelos_muestras  # noqa: E402,F401  (registra las tablas de muestras en la metadata)
