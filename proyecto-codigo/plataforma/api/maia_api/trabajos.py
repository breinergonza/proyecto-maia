"""La corrida desde la API: puntúa el corte vigente con el paquete activo, en un hilo aparte.

Una sola a la vez. El progreso queda en ``resultados.corridas`` (estado y paso); el frontend lo consulta cada 3 s.
"""
from __future__ import annotations

import threading
import traceback

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from maia_api import estado as E
from maia_comun import db
from maia_comun import notificaciones as N
from maia_comun import puntuacion as PU
from maia_comun import sevarti_db as SDB
from maia_comun.config import obtener
from maia_comun.modelos_db import Corrida

_lock = threading.Lock()


class CorridaEnCurso(RuntimeError):
    pass


def hay_en_curso(s: Session) -> bool:
    return s.scalars(select(Corrida.id).where(Corrida.estado == 'en_curso')).first() is not None


def cerrar_interrumpidas(s: Session) -> int:
    """Al arrancar: las corridas de la API que quedaron 'en_curso' se interrumpieron con el proceso anterior."""
    filas = s.execute(update(Corrida).where(Corrida.estado == 'en_curso', Corrida.tipo == 'demo')
                      .values(estado='error', mensaje='Interrumpida: la API se reinició durante la corrida.'))
    s.commit()
    return filas.rowcount or 0


def iniciar(s: Session, silencio: bool = False, esperar: bool = False) -> int:
    """Crea la corrida y la lanza. Lanza ``LookupError`` si falta el paquete o el corte."""
    modelos, manifest = E.estado.modelos, E.estado.manifest
    if modelos is None:
        raise LookupError('No hay un paquete de modelos activo. Súbalo y actívelo en Modelos.')
    corte = SDB.corte_vigente(s, manifest['fuente'])
    if corte is None:
        raise LookupError(f'No hay datos cargados de la fuente "{manifest["fuente"]}".')
    if not _lock.acquire(blocking=False):
        raise CorridaEnCurso('Ya hay una corrida en curso.')
    try:
        motor = db.motor()
        cid = PU.nueva_corrida(motor, 'demo', modelos, corte.id, corte.fuente, corte.fecha_corte, silencio,
                               'cpu', paquete=manifest['version'])
    except Exception:
        _lock.release()
        raise
    hilo = threading.Thread(target=_correr, args=(cid, corte.id, silencio), daemon=True, name=f'corrida-{cid}')
    hilo.start()
    if esperar:
        hilo.join()
    return cid


def _correr(cid: int, corte_id: int, silencio: bool) -> None:
    motor = db.motor()
    try:
        PU.marcar(motor, cid, paso='leyendo los datos')
        sev = SDB.leer_de_db(motor, corte_id)
        PU.correr(motor, sev, E.estado.modelos, cid, silencio=silencio,
                  notificar=lambda c: N.enviar_pendientes(motor, c, obtener()))
    except Exception as e:   # el error queda en la corrida; el hilo no debe morir en silencio
        PU.marcar(motor, cid, estado='error', mensaje=f'{type(e).__name__}: {e}')
        traceback.print_exc()
    finally:
        _lock.release()
