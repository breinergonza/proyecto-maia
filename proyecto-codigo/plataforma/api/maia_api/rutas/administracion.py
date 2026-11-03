"""Administración de las ejecuciones (solo el perfil admin): conexión a la base de la entidad, hiperparámetros,
programaciones y la cola que vacía el programador (``maia programador``, en el servidor con GPU).

La API no extrae ni entrena: deja la ejecución en ``app.ejecuciones`` y el programador la toma. La clave de la base
de la entidad entra cifrada y nunca sale (la respuesta solo dice de dónde viene).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from maia_api.dependencias import ADMIN, auditar, configuracion, sesion
from maia_api.esquemas import (
    Calendario,
    CampoHiperparametro,
    ConexionEntrada,
    ConexionSalida,
    EjecucionNueva,
    EjecucionSalida,
    HiperparametrosEntrada,
    HiperparametrosSalida,
    ProgramacionEntrada,
    ProgramacionSalida,
    PruebaConexionSalida,
    ResumenAdministracion,
)
from maia_comun import calendario as CAL
from maia_comun import cifrado
from maia_comun import conexion_origen as CO
from maia_comun import ejecuciones as EJ
from maia_comun import hiperparametros as HP
from maia_comun.config import Configuracion
from maia_comun.modelos_db import Ejecucion, Hiperparametro, Paquete, Programacion, Usuario

ruta = APIRouter(prefix='/administracion', tags=['administracion'])


def _no_real(cfg: Configuracion, fuente: str = 'kmc') -> None:
    if cfg.maia_solo_simulado and fuente == 'kmc':
        raise HTTPException(status.HTTP_409_CONFLICT,
                            'Este servicio solo trabaja con datos simulados: aquí no se configura la base real.')


def _invalido(e: Exception) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))


# ------------------------------------------------------------------ resumen (configuración inicial)

@ruta.get('/resumen', response_model=ResumenAdministracion)
def resumen(s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
            _: Usuario = Depends(ADMIN)) -> ResumenAdministracion:
    c = CO.guardada(s)
    try:
        clave = bool(CO.clave(c, cfg))
    except cifrado.SinLlave:
        clave = False
    activo = s.scalars(select(Paquete.version).where(Paquete.activo.is_(True))).first()
    ultima = s.scalars(select(Ejecucion).order_by(Ejecucion.id.desc()).limit(1)).first()
    return ResumenAdministracion(
        entorno=cfg.maia_entorno, solo_simulado=cfg.maia_solo_simulado, zona_horaria=cfg.maia_zona_horaria,
        mlflow_url=cfg.mlflow_url_publica, cifrado_disponible=cifrado.disponible(cfg), conexion_guardada=c is not None,
        clave_disponible=clave,
        programaciones_activas=s.scalar(select(func.count()).select_from(Programacion)
                                        .where(Programacion.activo.is_(True))) or 0,
        hiperparametros_ajustados=any(HP.ajustes(h.modelo, h.valores or {}) for h in s.scalars(select(Hiperparametro))),
        paquete_activo=activo, ultima_ejecucion=EjecucionSalida.model_validate(ultima) if ultima else None)


# ------------------------------------------------------------------ conexión a la base de la entidad

def _salida_conexion(s: Session, cfg: Configuracion) -> ConexionSalida:
    c = CO.guardada(s)
    d = CO.datos_de(c, cfg)
    origen = 'guardada' if c is not None and c.clave_cifrada else 'entorno' if cfg.kmc_pw else 'ninguna'
    return ConexionSalida(host=d.host, puerto=d.puerto, base=d.base, usuario=d.usuario, esquema=d.esquema,
                          sslmode=d.sslmode, timeout=d.timeout, guardada=c is not None, origen_clave=origen,
                          cifrado_disponible=cifrado.disponible(cfg), actualizado_en=c.actualizado_en if c else None)


def _datos(e: ConexionEntrada) -> CO.Datos:
    return CO.Datos(e.host.strip(), e.puerto, e.base.strip(), e.usuario.strip(), e.esquema, e.sslmode, e.timeout)


@ruta.get('/conexion', response_model=ConexionSalida)
def conexion(s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
             _: Usuario = Depends(ADMIN)) -> ConexionSalida:
    return _salida_conexion(s, cfg)


@ruta.put('/conexion', response_model=ConexionSalida)
def guardar_conexion(datos: ConexionEntrada, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
                     admin: Usuario = Depends(ADMIN)) -> ConexionSalida:
    _no_real(cfg)
    d = _datos(datos)
    try:
        CO.guardar(s, d, datos.clave, admin.id, datos.borrar_clave, cfg)
    except cifrado.SinLlave as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    except ValueError as e:
        raise _invalido(e) from e
    auditar(s, admin, 'guardar_conexion_origen', 'kmc',
            {'host': d.host, 'puerto': d.puerto, 'base': d.base, 'usuario': d.usuario, 'esquema': d.esquema,
             'sslmode': d.sslmode, 'clave': 'cambiada' if datos.clave else 'borrada' if datos.borrar_clave else 'igual'})
    s.commit()
    return _salida_conexion(s, cfg)


@ruta.post('/conexion/probar', response_model=PruebaConexionSalida)
def probar_conexion(datos: ConexionEntrada | None = None, s: Session = Depends(sesion),
                    cfg: Configuracion = Depends(configuracion), admin: Usuario = Depends(ADMIN)) -> PruebaConexionSalida:
    """Prueba los datos del formulario (o los guardados) sin guardarlos. Sin clave en el formulario, usa la guardada."""
    _no_real(cfg)
    c = CO.guardada(s)
    d = _datos(datos) if datos else CO.datos_de(c, cfg)
    try:
        clave = datos.clave if datos and datos.clave else CO.clave(c, cfg)
        r = CO.probar(d, clave)
    except Exception as e:   # el mensaje del controlador no trae la clave
        auditar(s, admin, 'probar_conexion_origen', 'kmc', {'ok': False, 'host': d.host})
        s.commit()
        return PruebaConexionSalida(ok=False, mensaje=f'{type(e).__name__}: {str(e)[:400]}')
    auditar(s, admin, 'probar_conexion_origen', 'kmc', {'ok': True, 'host': d.host, 'tablas': len(r['tablas'])})
    s.commit()
    vacio = '' if r['tablas'] else f' El esquema {d.esquema} no tiene tablas visibles para ese usuario.'
    return PruebaConexionSalida(ok=True, mensaje=f'Conexión de solo lectura correcta.{vacio}', **r)


# ------------------------------------------------------------------ hiperparámetros

def _salida_hp(s: Session, modelo: str) -> HiperparametrosSalida:
    h = s.get(Hiperparametro, modelo)
    guardados, defecto = (h.valores if h else {}), HP.por_defecto(modelo)
    campos = [CampoHiperparametro(nombre=c.nombre, etiqueta=c.etiqueta, tipo=c.tipo.__name__, minimo=c.minimo,
                                  maximo=c.maximo, ayuda=c.ayuda, escala=c.escala, defecto=defecto.get(c.nombre),
                                  valor=guardados.get(c.nombre)) for c in HP.CAMPOS[modelo]]
    return HiperparametrosSalida(modelo=modelo, campos=campos, actualizado_en=h.actualizado_en if h else None)


@ruta.get('/hiperparametros', response_model=list[HiperparametrosSalida])
def hiperparametros(s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> list[HiperparametrosSalida]:
    return [_salida_hp(s, m) for m in HP.TIPOS]


@ruta.put('/hiperparametros/{modelo}', response_model=HiperparametrosSalida)
def guardar_hiperparametros(modelo: str, datos: HiperparametrosEntrada, s: Session = Depends(sesion),
                            admin: Usuario = Depends(ADMIN)) -> HiperparametrosSalida:
    if modelo not in HP.TIPOS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'Modelo desconocido: {modelo}')
    try:
        valores = HP.validar(modelo, datos.valores)
    except ValueError as e:
        raise _invalido(e) from e
    h = s.get(Hiperparametro, modelo) or Hiperparametro(modelo=modelo)
    antes = dict(h.valores or {})
    h.valores, h.actualizado_por, h.actualizado_en = valores, admin.id, EJ.ahora()
    s.add(h)
    auditar(s, admin, 'ajustar_hiperparametros', modelo, {'antes': antes, 'despues': valores})
    s.commit()
    return _salida_hp(s, modelo)


# ------------------------------------------------------------------ calendario y programaciones

@ruta.get('/calendario', response_model=Calendario)
def calendario(cron: str = Query(min_length=9, max_length=120), zona: str | None = Query(None, max_length=64),
               cfg: Configuracion = Depends(configuracion), _: Usuario = Depends(ADMIN)) -> Calendario:
    """Cómo se lee una expresión cron y sus próximas cinco fechas (para revisarla antes de guardarla)."""
    zona = zona or cfg.maia_zona_horaria
    try:
        c, z = CAL.Cron.leer(cron), CAL.zona(zona)
        proximas, t = [], EJ.ahora().astimezone(z)
        for _ in range(5):
            t = c.siguiente(t)
            proximas.append(t)
        return Calendario(cron=c.texto, zona=zona, descripcion=CAL.describir(cron), proximas=proximas)
    except CAL.CronInvalido as e:
        raise _invalido(e) from e


def _salida_prog(p: Programacion) -> ProgramacionSalida:
    return ProgramacionSalida(id=p.id, nombre=p.nombre, fuente=p.fuente, cron=p.cron, zona=p.zona,
                              descripcion=CAL.describir(p.cron), activo=p.activo, silencio=p.silencio,
                              solo_si_nuevo=p.solo_si_nuevo, parametros=p.parametros or {}, proxima=p.proxima,
                              ultima=p.ultima, creado_en=p.creado_en)


def _aplicar(p: Programacion, datos: ProgramacionEntrada, cfg: Configuracion) -> None:
    _no_real(cfg, datos.fuente)
    try:
        cron = CAL.Cron.leer(datos.cron).texto
        zona = datos.zona or cfg.maia_zona_horaria
        CAL.zona(zona)
        parametros = EJ.validar_parametros(datos.fuente, datos.parametros.model_dump())
    except ValueError as e:
        raise _invalido(e) from e
    p.nombre, p.fuente, p.cron, p.zona = datos.nombre.strip(), datos.fuente, cron, zona
    p.activo, p.silencio, p.solo_si_nuevo, p.parametros = datos.activo, datos.silencio, datos.solo_si_nuevo, parametros
    EJ.recalcular(p)


def _programacion(s: Session, pid: int) -> Programacion:
    p = s.get(Programacion, pid)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No existe la programación {pid}.')
    return p


@ruta.get('/programaciones', response_model=list[ProgramacionSalida])
def programaciones(s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> list[ProgramacionSalida]:
    return [_salida_prog(p) for p in s.scalars(select(Programacion).order_by(Programacion.id))]


@ruta.post('/programaciones', response_model=ProgramacionSalida, status_code=status.HTTP_201_CREATED)
def crear_programacion(datos: ProgramacionEntrada, s: Session = Depends(sesion),
                       cfg: Configuracion = Depends(configuracion), admin: Usuario = Depends(ADMIN)) -> ProgramacionSalida:
    p = Programacion(creado_por=admin.id)
    _aplicar(p, datos, cfg)
    s.add(p)
    s.flush()
    auditar(s, admin, 'crear_programacion', str(p.id), datos.model_dump(mode='json'))
    s.commit()
    return _salida_prog(p)


@ruta.put('/programaciones/{pid}', response_model=ProgramacionSalida)
def cambiar_programacion(pid: int, datos: ProgramacionEntrada, s: Session = Depends(sesion),
                         cfg: Configuracion = Depends(configuracion), admin: Usuario = Depends(ADMIN)) -> ProgramacionSalida:
    p = _programacion(s, pid)
    _aplicar(p, datos, cfg)
    auditar(s, admin, 'cambiar_programacion', str(pid), datos.model_dump(mode='json'))
    s.commit()
    return _salida_prog(p)


@ruta.delete('/programaciones/{pid}', status_code=status.HTTP_204_NO_CONTENT)
def borrar_programacion(pid: int, s: Session = Depends(sesion), admin: Usuario = Depends(ADMIN)) -> None:
    p = _programacion(s, pid)
    s.delete(p)
    auditar(s, admin, 'borrar_programacion', str(pid), {'nombre': p.nombre, 'cron': p.cron})
    s.commit()


@ruta.post('/programaciones/{pid}/ejecutar', response_model=EjecucionSalida, status_code=status.HTTP_202_ACCEPTED)
def ejecutar_programacion(pid: int, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
                          admin: Usuario = Depends(ADMIN)) -> Ejecucion:
    """La ejecuta ya, con sus mismos parámetros, sin mover su próxima hora."""
    p = _programacion(s, pid)
    _no_real(cfg, p.fuente)
    if s.scalars(select(Ejecucion.id).where(Ejecucion.programacion_id == pid,
                                            Ejecucion.estado.in_(EJ.ACTIVAS))).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'Esta programación ya tiene una ejecución pendiente o en curso.')
    e = EJ.encolar(s, 'corrida', p.fuente, 'manual', EJ.de_programacion(p), p.id, admin.id)
    auditar(s, admin, 'ejecutar_programacion', str(pid), {'ejecucion': e.id})
    s.commit()
    return e


# ------------------------------------------------------------------ ejecuciones

@ruta.get('/ejecuciones', response_model=list[EjecucionSalida])
def ejecuciones(limite: int = Query(30, ge=1, le=200), s: Session = Depends(sesion),
                _: Usuario = Depends(ADMIN)) -> list[Ejecucion]:
    return list(s.scalars(select(Ejecucion).order_by(Ejecucion.id.desc()).limit(limite)))


@ruta.get('/ejecuciones/{eid}', response_model=EjecucionSalida)
def ejecucion(eid: int, s: Session = Depends(sesion), _: Usuario = Depends(ADMIN)) -> Ejecucion:
    e = s.get(Ejecucion, eid)
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No existe la ejecución {eid}.')
    return e


@ruta.post('/ejecuciones', response_model=EjecucionSalida, status_code=status.HTTP_202_ACCEPTED)
def nueva_ejecucion(datos: EjecucionNueva, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
                    admin: Usuario = Depends(ADMIN)) -> Ejecucion:
    """Una corrida ahora (extraer, entrenar, registrar en MLflow, revisar y calcular riesgos)."""
    _no_real(cfg, datos.fuente)
    try:
        parametros = EJ.validar_parametros(datos.fuente, datos.parametros.model_dump())
    except ValueError as e:
        raise _invalido(e) from e
    e = EJ.encolar(s, 'corrida', datos.fuente, 'manual',
                   {**parametros, 'silencio': datos.silencio, 'solo_si_nuevo': datos.solo_si_nuevo}, None, admin.id)
    auditar(s, admin, 'encolar_corrida', str(e.id), e.parametros)
    s.commit()
    return e
