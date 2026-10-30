"""La aplicación FastAPI. Todo bajo ``/api``; documentación en ``/api/docs``.

    uvicorn maia_api.main:app --host :: --port 8000      (un solo proceso: el paquete activo vive en memoria)
"""
from __future__ import annotations

import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from maia_api import errores
from maia_api import trabajos as T
from maia_api.rutas import (
    administracion,
    auth,
    corridas,
    diccionario,
    entrenamientos,
    inferencia,
    modelos,
    ninos,
    notificaciones,
    revision,
    salud,
    tablero,
    usuarios,
)
from maia_api.semillas import sembrar
from maia_comun import db
from maia_comun.config import obtener


@asynccontextmanager
async def ciclo(app: FastAPI):
    cfg = obtener()
    cfg.exigir_secretos()
    with db.fabrica()() as s:
        T.cerrar_interrumpidas(s)
    print('Arranque:', sembrar(cfg), flush=True)
    parar = threading.Event()
    if not cfg.maia_solo_simulado:   # los paquetes que aprueba administración (los arma el programador)
        T.vigilar_aprobados(cfg, parar)
    yield
    parar.set()


def crear_app() -> FastAPI:
    cfg = obtener()
    app = FastAPI(title='MAIA · Observatorio de alertas clínicas', version='0.1.0', lifespan=ciclo,
                  docs_url='/api/docs', redoc_url=None, openapi_url='/api/openapi.json',
                  description='Apoyo a la decisión, no diagnóstico. Solo códigos seudonimizados.')
    if cfg.maia_entorno == 'local':
        # en local el frontend de Vite corre en otro puerto; en Railway, nginx sirve todo bajo el mismo origen
        app.add_middleware(CORSMiddleware, allow_origins=cfg.maia_cors_origenes, allow_credentials=True,
                           allow_methods=['*'], allow_headers=['*'])
    errores.registrar(app)
    for r in (salud, auth, usuarios, modelos, corridas, tablero, ninos, revision, inferencia, notificaciones,
              administracion, entrenamientos, diccionario):
        app.include_router(r.ruta, prefix='/api')
    return app


app = crear_app()
