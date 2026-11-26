"""Salud del servicio (sin autenticación; la usa el healthcheck de Railway y de Docker)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text

from maia_api import estado as E
from maia_api.dependencias import configuracion
from maia_comun import db
from maia_comun.config import Configuracion

ruta = APIRouter(tags=['salud'])


@ruta.get('/salud')
def salud(respuesta: Response, cfg: Configuracion = Depends(configuracion)) -> dict:
    try:
        with db.motor().connect() as cx:
            cx.execute(text('SELECT 1'))
        ok_db = True
    except Exception:   # cualquier fallo de conexión cuenta como base caída
        ok_db = False
    if not ok_db:
        respuesta.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {'db': ok_db, 'paquete': E.estado.version, 'entorno': cfg.maia_entorno}
