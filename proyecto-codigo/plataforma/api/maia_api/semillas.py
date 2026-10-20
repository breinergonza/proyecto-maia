"""Lo que se crea al arrancar (idempotente):

* el administrador de ``MAIA_ADMIN_EMAIL`` / ``MAIA_ADMIN_CLAVE`` si no hay usuarios;
* en la demostración (``MAIA_ENTORNO=demo``), una cohorte simulada de ``MAIA_DEMO_SUJETOS`` niños si no hay corte;
* la configuración de notificaciones (inactiva) de cada desenlace del paquete activo.

    python -m maia_api.semillas
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from maia_api import estado as E
from maia_api import seguridad as SG
from maia_comun import db
from maia_comun import sevarti_db as SDB
from maia_comun.config import Configuracion, obtener
from maia_comun.modelos_db import ConfigNotificacion, Usuario


def admin_inicial(s: Session, cfg: Configuracion) -> bool:
    if s.scalar(select(func.count()).select_from(Usuario)):
        return False
    s.add(Usuario(email=cfg.maia_admin_email.strip().lower(), nombre='Administración', rol='admin',
                  hash_clave=SG.hash_clave(cfg.maia_admin_clave)))
    s.commit()
    return True


def datos_demo(s: Session, cfg: Configuracion) -> int | None:
    """Una cohorte simulada (semilla distinta de la de entrenamiento: son niños nuevos para el modelo)."""
    if cfg.maia_entorno != 'demo' or SDB.corte_vigente(s, 'simulado') is not None:
        return None
    from maia_comun import simulados
    sev = simulados.simular(cfg.maia_demo_sujetos, semilla=7)
    return SDB.guardar_en_db(db.motor(), sev, 'simulado')


def config_notificaciones_de(s: Session) -> int:
    """Una fila (inactiva) por desenlace del paquete activo que todavía no tenga configuración."""
    if E.estado.modelos is None:
        return 0
    existentes = set(s.scalars(select(ConfigNotificacion.desenlace)))
    nuevos = 0
    for clave, m in E.estado.modelos.clinico.modelos.items():
        if clave not in existentes:
            s.add(ConfigNotificacion(desenlace=clave, nombre=m.desenlace.nombre, percentil_minimo=95,
                                     destinatarios=[], activo=False))
            nuevos += 1
    s.commit()
    return nuevos


def sembrar(cfg: Configuracion | None = None) -> dict:
    cfg = cfg or obtener()
    with db.fabrica()() as s:
        hecho = {'admin': admin_inicial(s, cfg), 'corte_demo': datos_demo(s, cfg)}
        hecho['paquete'] = E.cargar_activo(s, cfg)
        hecho['notificaciones'] = config_notificaciones_de(s)
    return hecho


if __name__ == '__main__':
    print(sembrar())
