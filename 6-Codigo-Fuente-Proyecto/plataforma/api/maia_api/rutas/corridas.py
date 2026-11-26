"""Corridas: historial y ejecutar la corrida desde la API (administración)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from maia_api import trabajos as T
from maia_api.dependencias import DATOS, auditar, sesion
from maia_api.esquemas import CorridaNueva, CorridaSalida
from maia_comun.modelos_db import Corrida, Usuario

ruta = APIRouter(prefix='/corridas', tags=['corridas'])


@ruta.get('', response_model=list[CorridaSalida])
def listar(s: Session = Depends(sesion), _: Usuario = Depends(DATOS)) -> list[Corrida]:
    return list(s.scalars(select(Corrida).order_by(Corrida.id.desc()).limit(50)))


@ruta.post('', response_model=CorridaSalida, status_code=status.HTTP_202_ACCEPTED)
def ejecutar(datos: CorridaNueva, s: Session = Depends(sesion), admin: Usuario = Depends(DATOS)) -> Corrida:
    try:
        cid = T.iniciar(s, silencio=datos.silencio)
    except LookupError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    except T.CorridaEnCurso as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    auditar(s, admin, 'ejecutar_corrida', str(cid), {'silencio': datos.silencio})
    s.commit()
    s.expire_all()
    return s.get(Corrida, cid)


@ruta.get('/{corrida_id}', response_model=CorridaSalida)
def una(corrida_id: int, s: Session = Depends(sesion), _: Usuario = Depends(DATOS)) -> Corrida:
    c = s.get(Corrida, corrida_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No existe la corrida {corrida_id}.')
    return c
