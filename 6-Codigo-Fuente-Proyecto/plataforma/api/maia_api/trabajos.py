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
from maia_comun.modelos_db import Corrida, Paquete

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


# ------------------------------------------------------------------ paquetes aprobados desde la web

INTERVALO_IMPORTAR = 15   # segundos


def importar_aprobados(s: Session, cfg) -> list[str]:
    """Importa de MinIO y activa los paquetes que armó el programador para una aprobación terminada.

    Cada aprobación se intenta una vez: el resultado queda en ``resultado.activado`` (y ``error_activacion``)."""
    import tempfile
    from pathlib import Path

    from maia_api.rutas.modelos import registrar_paquete
    from maia_api.semillas import config_notificaciones_de
    from maia_comun import paquete as PQ
    from maia_comun.almacen import BUCKET_PAQUETES, Almacen
    from maia_comun.modelos_db import Auditoria, Ejecucion

    activados = []
    pendientes = s.scalars(select(Ejecucion).where(
        Ejecucion.tipo == 'aprobacion', Ejecucion.estado == 'ok',
        Ejecucion.resultado['paquete'].astext.is_not(None), Ejecucion.resultado['activado'].is_(None))
        .order_by(Ejecucion.id)).all()
    for e in pendientes:
        version = e.resultado['paquete']
        try:
            if s.get(Paquete, version) is None:
                with tempfile.TemporaryDirectory() as tmp:
                    ruta = Almacen.desde_config(cfg).bajar_archivo(BUCKET_PAQUETES, f'{e.fuente}/{version}/{PQ.NOMBRE}',
                                                                   Path(tmp) / PQ.NOMBRE)
                    registrar_paquete(s, cfg, ruta, e.solicitada_por)
                    s.commit()
            E.activar(s, cfg, version)
            config_notificaciones_de(s)
            e.resultado = {**e.resultado, 'activado': True}
            s.add(Auditoria(usuario_id=e.solicitada_por, accion='activar_paquete_aprobado', recurso=version,
                            detalle={'ejecucion': e.id}))
            activados.append(version)
        except Exception as ex:   # queda en la ejecución para que administración lo vea
            s.rollback()
            e = s.get(Ejecucion, e.id)
            e.resultado = {**e.resultado, 'activado': False, 'error_activacion': f'{type(ex).__name__}: {ex}'[:500]}
            traceback.print_exc()
        s.commit()
    return activados


def vigilar_aprobados(cfg, parar: threading.Event) -> threading.Thread:
    def _bucle() -> None:
        while not parar.wait(INTERVALO_IMPORTAR):
            try:
                with db.fabrica()() as s:
                    for v in importar_aprobados(s, cfg):
                        print(f'Paquete aprobado {v} importado y activo.', flush=True)
            except Exception:   # la base o MinIO caídos un momento no deben matar la vigilancia
                traceback.print_exc()
    hilo = threading.Thread(target=_bucle, daemon=True, name='importar-aprobados')
    hilo.start()
    return hilo
