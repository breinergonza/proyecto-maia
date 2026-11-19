"""Lo que la API tiene en memoria: el paquete de modelos activo. Un solo proceso (uvicorn sin --workers)."""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from maia_comun import paquete as PQ
from maia_comun.config import Configuracion
from maia_comun.modelos_db import Paquete
from maia_comun.puntuacion import Modelos


@dataclass
class Estado:
    modelos: Modelos | None = None
    manifest: dict | None = None
    carpeta: Path | None = None
    lock: threading.RLock = field(default_factory=threading.RLock)

    @property
    def version(self) -> str | None:
        return self.manifest['version'] if self.manifest else None


estado = Estado()


def carpeta_paquete(cfg: Configuracion, version: str) -> Path:
    return Path(cfg.maia_dir_paquetes) / version


def activar(s: Session, cfg: Configuracion, version: str) -> dict:
    """Verifica de nuevo el paquete guardado (firma, hashes, versiones), lo carga en memoria y lo marca activo."""
    p = s.get(Paquete, version)
    if p is None:
        raise LookupError(f'No hay un paquete {version}.')
    contenido = PQ.verificar(Path(p.ruta), cfg.maia_paquete_clave, carpeta_paquete(cfg, version) / 'contenido',
                             solo_simulado=cfg.maia_solo_simulado)
    modelos = PQ.cargar(contenido)
    with estado.lock:
        PQ.importar_analitica(s, contenido)   # la analítica viaja con el paquete (el entrenamiento fue en otro equipo)
        s.execute(update(Paquete).values(activo=False))
        s.execute(update(Paquete).where(Paquete.version == version).values(activo=True))
        s.commit()
        estado.modelos, estado.manifest, estado.carpeta = modelos, contenido.manifest, contenido.carpeta
    return contenido.manifest


def cargar_activo(s: Session, cfg: Configuracion) -> str | None:
    """Al arrancar: carga el paquete marcado como activo, si lo hay y sigue siendo válido."""
    activo = s.scalars(select(Paquete).where(Paquete.activo.is_(True))).first()
    if activo is None:
        return None
    try:
        activar(s, cfg, activo.version)
        return activo.version
    except (PQ.PaqueteInvalido, OSError, LookupError) as e:
        print(f'No se pudo cargar el paquete activo {activo.version}: {e}', flush=True)
        return None


def activo() -> tuple[Modelos, dict, Path] | None:
    """Los modelos, el manifiesto y la carpeta del paquete activo, leídos juntos; None si no hay uno cargado."""
    with estado.lock:
        modelos, manifest, carpeta = estado.modelos, estado.manifest, estado.carpeta
    if modelos is None or manifest is None or carpeta is None:
        return None
    return modelos, manifest, carpeta


def limpiar() -> None:
    with estado.lock:
        estado.modelos = estado.manifest = estado.carpeta = None
