"""Paquetes de modelos: el activo (todos), y subir, listar y activar (administración)."""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from maia_api import estado as E
from maia_api.dependencias import CUALQUIERA, DATOS, auditar, configuracion, sesion
from maia_api.esquemas import PaqueteSalida
from maia_api.semillas import config_notificaciones_de
from maia_comun import paquete as PQ
from maia_comun.config import Configuracion
from maia_comun.metricas import interna
from maia_comun.modelos_db import Paquete, Usuario

ruta = APIRouter(prefix='/modelos', tags=['modelos'])
MAX_BYTES = 1024 * 1024 * 1024   # 1 GB


def _salida(p: Paquete) -> PaqueteSalida:
    m = p.manifest or {}
    return PaqueteSalida(version=p.version, fuente=p.fuente, activo=p.activo, subido_en=p.subido_en,
                         corte=m.get('corte'), creado=m.get('creado'), modelos=m.get('modelos', {}),
                         metricas={k: v for k, v in (m.get('metricas') or {}).items() if not interna(k)})


@ruta.get('/activo', response_model=PaqueteSalida | None)
def activo(s: Session = Depends(sesion), _: Usuario = Depends(CUALQUIERA)) -> PaqueteSalida | None:
    p = s.scalars(select(Paquete).where(Paquete.activo.is_(True))).first()
    return _salida(p) if p and E.estado.version == p.version else None


@ruta.get('/paquetes', response_model=list[PaqueteSalida])
def listar(s: Session = Depends(sesion), _: Usuario = Depends(DATOS)) -> list[PaqueteSalida]:
    return [_salida(p) for p in s.scalars(select(Paquete).order_by(Paquete.subido_en.desc()))]


def registrar_paquete(s: Session, cfg: Configuracion, origen: Path, usuario_id=None) -> Paquete:
    """Verifica un paquete (firma, hashes, versiones), lo copia a ``MAIA_DIR_PAQUETES`` y lo registra sin activarlo.
    Lo usan la subida desde la web y la importación de un paquete aprobado (``trabajos.importar_aprobados``)."""
    with tempfile.TemporaryDirectory() as tmp:
        contenido = PQ.verificar(origen, cfg.maia_paquete_clave, Path(tmp) / 'contenido',
                                 solo_simulado=cfg.maia_solo_simulado)
        version = contenido.manifest['version']
        if s.get(Paquete, version):
            raise FileExistsError(f'El paquete {version} ya está subido.')
        destino = E.carpeta_paquete(cfg, version)
        destino.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origen, destino / PQ.NOMBRE)
    p = Paquete(version=version, fuente=contenido.manifest['fuente'], manifest=contenido.manifest,
                ruta=str(destino / PQ.NOMBRE), activo=False, subido_por=usuario_id)
    s.add(p)
    return p


@ruta.post('/paquetes', response_model=PaqueteSalida)
def subir(archivo: UploadFile = File(...), s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
          admin: Usuario = Depends(DATOS)) -> PaqueteSalida:
    with tempfile.TemporaryDirectory() as tmp:
        ruta_tmp = Path(tmp) / PQ.NOMBRE
        total = 0
        with open(ruta_tmp, 'wb') as f:
            while bloque := archivo.file.read(1 << 20):
                total += len(bloque)
                if total > MAX_BYTES:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, 'El paquete pasa de 1 GB.')
                f.write(bloque)
        try:
            p = registrar_paquete(s, cfg, ruta_tmp, admin.id)
        except PQ.PaqueteInvalido as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
        except FileExistsError as e:
            raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    auditar(s, admin, 'subir_paquete', p.version, {'fuente': p.fuente})
    s.commit()
    s.refresh(p)
    return _salida(p)


@ruta.post('/paquetes/{version}/activar', response_model=PaqueteSalida)
def activar(version: str, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
            admin: Usuario = Depends(DATOS)) -> PaqueteSalida:
    try:
        E.activar(s, cfg, version)
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    except PQ.PaqueteInvalido as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from e
    config_notificaciones_de(s)
    auditar(s, admin, 'activar_paquete', version)
    s.commit()
    return _salida(s.get(Paquete, version))
