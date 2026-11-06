"""Entrenamientos registrados en MLflow (solo administración): hiperparámetros, métricas de validación, versión del
registro y sus alias. Aprobar unas versiones candidatas deja una ejecución ``aprobacion`` para el programador, que
las promueve a ``produccion`` y arma el paquete; la API lo importa y lo activa (``trabajos.importar_aprobados``)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from maia_api.dependencias import ADMIN, auditar, configuracion, sesion
from maia_api.esquemas import AprobacionEntrada, EjecucionSalida, Entrenamientos, EntrenarAhora, Fuente
from maia_comun import ejecuciones as EJ
from maia_comun import hiperparametros as HP
from maia_comun import mlflow_rest as ML
from maia_comun.config import Configuracion
from maia_comun.metricas import interna
from maia_comun.modelos_db import Ejecucion, Hiperparametro, Usuario

ruta = APIRouter(prefix='/entrenamientos', tags=['entrenamientos'])


def _enlace(cfg: Configuracion, e: dict) -> str | None:
    if not cfg.mlflow_url_publica:
        return None
    return f'{cfg.mlflow_url_publica.rstrip("/")}/#/experiments/{e["experimento_id"]}/runs/{e["run_id"]}'


@ruta.get('', response_model=Entrenamientos)
def listar(fuente: Fuente | None = Query(None), limite: int = Query(30, ge=1, le=200),
           cfg: Configuracion = Depends(configuracion), _: Usuario = Depends(ADMIN)) -> Entrenamientos:
    lector = ML.Lector(cfg.mlflow_tracking_uri, cfg.mlflow_tracking_username, cfg.mlflow_tracking_password)
    try:
        datos = {t: lector.entrenamientos(t, fuente, limite) for t in ML.EXPERIMENTOS}
    except ML.MlflowNoDisponible as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e
    for lista in datos.values():
        for e in lista:
            e['enlace'] = _enlace(cfg, e)
            e['metricas'] = {k: v for k, v in e['metricas'].items() if not interna(k)}
    return Entrenamientos(mlflow_url=cfg.mlflow_url_publica, **datos)


@ruta.post('/aprobar', response_model=EjecucionSalida, status_code=status.HTTP_202_ACCEPTED)
def aprobar(datos: AprobacionEntrada, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
            admin: Usuario = Depends(ADMIN)) -> Ejecucion:
    """Promueve las dos versiones a ``produccion``, arma el paquete y lo activa en la solución."""
    if cfg.maia_solo_simulado and datos.fuente == 'kmc':
        raise HTTPException(status.HTTP_409_CONFLICT, 'Este servicio solo trabaja con datos simulados.')
    if s.scalars(select(Ejecucion.id).where(Ejecucion.tipo == 'aprobacion',
                                            Ejecucion.estado.in_(EJ.ACTIVAS))).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'Ya hay una aprobación pendiente o en curso.')
    e = EJ.encolar(s, 'aprobacion', datos.fuente, 'manual',
                   {'anomalias': datos.anomalias, 'clinico': datos.clinico}, None, admin.id)
    auditar(s, admin, 'aprobar_modelos', str(e.id), datos.model_dump())
    s.commit()
    return e


@ruta.post('/entrenar', response_model=EjecucionSalida, status_code=status.HTTP_202_ACCEPTED)
def entrenar(datos: EntrenarAhora, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
             admin: Usuario = Depends(ADMIN)) -> Ejecucion:
    """Entrena ya: el programador trae los datos de la fuente y entrena cada modelo con estos hiperparámetros. El
    resultado queda en MLflow como ``candidato``; el avance se ve en ``GET /entrenamientos/ejecuciones``."""
    if cfg.maia_solo_simulado and datos.fuente == 'kmc':
        raise HTTPException(status.HTTP_409_CONFLICT, 'Este servicio solo trabaja con datos simulados.')
    if s.scalars(select(Ejecucion.id).where(Ejecucion.tipo == 'entrenamiento',
                                            Ejecucion.estado.in_(EJ.ACTIVAS))).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'Ya hay un entrenamiento en cola o en curso: espere a que termine.')
    try:
        hp = {m: HP.validar(m, datos.hiperparametros.get(m, {})) for m in datos.modelos}
        filtros = EJ.validar_parametros(datos.fuente, datos.filtros.model_dump()) if datos.extraer else {}
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    parametros = {'modelos': list(dict.fromkeys(datos.modelos)), 'extraer': datos.extraer, 'hiperparametros': hp,
                  'filtros': filtros}
    if datos.fuente == 'simulado' and datos.sujetos:
        parametros['sujetos'] = datos.sujetos
    if datos.guardar:
        for m, valores in hp.items():
            h = s.get(Hiperparametro, m) or Hiperparametro(modelo=m)
            antes = dict(h.valores or {})
            h.valores, h.actualizado_por, h.actualizado_en = valores, admin.id, EJ.ahora()
            s.add(h)
            auditar(s, admin, 'ajustar_hiperparametros', m, {'antes': antes, 'despues': valores})
    e = EJ.encolar(s, 'entrenamiento', datos.fuente, 'manual', parametros, None, admin.id)
    auditar(s, admin, 'entrenar_ahora', str(e.id), parametros)
    s.commit()
    return e


@ruta.get('/ejecuciones', response_model=list[EjecucionSalida])
def ejecuciones(limite: int = Query(10, ge=1, le=50), s: Session = Depends(sesion),
                _: Usuario = Depends(ADMIN)) -> list[Ejecucion]:
    """Los últimos entrenamientos pedidos desde la web, con su paso actual (para la capa de presentación)."""
    return list(s.scalars(select(Ejecucion).where(Ejecucion.tipo == 'entrenamiento')
                          .order_by(Ejecucion.id.desc()).limit(limite)))
