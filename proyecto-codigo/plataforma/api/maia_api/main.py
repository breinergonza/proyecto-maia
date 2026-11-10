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
    analitica,
    auth,
    corridas,
    diccionario,
    entrenamientos,
    exploracion,
    inferencia,
    modelos,
    muestras,
    ninos,
    notificaciones,
    prediccion,
    revision,
    salud,
    tablero,
    usuarios,
)
from maia_api.semillas import sembrar
from maia_comun import db
from maia_comun.atributos import rellenar_faltantes
from maia_comun.config import obtener


def _rellenar_atributos() -> None:
    """Los cortes cargados antes de la migración 0008 no tienen ``atributos_sujeto``: sin ellos Explorar y las
    muestras no filtran por ninguna variable. Se rellenan en segundo plano para no demorar el arranque."""
    try:
        hechos = rellenar_faltantes(db.motor())
        if hechos:
            print('Atributos rellenados:', hechos, flush=True)
    except Exception as e:  # noqa: BLE001  (un fallo aquí no tumba la API; queda en el registro)
        print(f'No se pudieron rellenar los atributos: {type(e).__name__}: {e}', flush=True)


@asynccontextmanager
async def ciclo(app: FastAPI):
    cfg = obtener()
    cfg.exigir_secretos()
    with db.fabrica()() as s:
        T.cerrar_interrumpidas(s)
    print('Arranque:', sembrar(cfg), flush=True)
    threading.Thread(target=_rellenar_atributos, name='atributos', daemon=True).start()
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
              administracion, entrenamientos, diccionario, analitica, muestras, exploracion, prediccion):
        app.include_router(r.ruta, prefix='/api')
    return app


app = crear_app()
