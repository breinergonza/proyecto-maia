"""De dónde salen los datos y la configuración de cada fuente.

* ``kmc``: la base de la Fundación (solo lectura, ``KMC_PW``) y la configuración clínica del diccionario de los
  expertos (``MAIA_RAIZ/entradas/diccionario.xlsx``).
* ``simulado``: el simulador de ``maia_comun.simulados`` y su configuración clínica de demostración.

Los cortes se guardan en MinIO; para entrenar se bajan a ``MAIA_RAIZ/cortes/{fuente}/{fecha}/`` (caché local, con
datos por niño: nunca sale del equipo).
"""
from __future__ import annotations

import shutil
from pathlib import Path

from archivos import carpetas as CA
from clinico import configuracion as CF
from clinico import modelo as AC
from maia_comun import sevarti_db as SDB
from maia_comun import simulados
from maia_comun.almacen import Almacen
from sevarti import contrato as SV
from sevarti.contrato import Sevarti

FUENTES = ('kmc', 'simulado')
SUFIJO_REGISTRO = {'kmc': '', 'simulado': '-demo'}


def nombre_registro(modelo: str, fuente: str) -> str:
    """``maia-anomalias`` / ``maia-clinico`` para la base real, con ``-demo`` para los datos simulados."""
    return f'maia-{modelo}{SUFIJO_REGISTRO[fuente]}'


def extraer_kmc() -> Sevarti:
    """La base de la Fundación pasada a SEVARTI con el diccionario de los expertos (que se actualiza si la base
    trae variables nuevas). Necesita ``KMC_PW``."""
    from sevarti import cargar_datos
    return cargar_datos(None)


def simular(sujetos: int, semilla: int, corte: str) -> Sevarti:
    return simulados.simular(sujetos, semilla, corte)


def cache(fuente: str, fecha: str) -> Path:
    return CA.PROYECTO.raiz / 'cortes' / fuente / fecha


def corte_local(almacen: Almacen, fuente: str, fecha: str | None = None) -> tuple[Sevarti, SDB.InfoCorte, Path]:
    """El corte pedido (por defecto el más reciente de MinIO), desde la caché si ya está bajado y su hash coincide."""
    fechas = SDB.cortes_en_minio(almacen, fuente)
    if not fechas:
        raise FileNotFoundError(f'No hay cortes de "{fuente}" en MinIO. Primero: maia '
                                f'{"extraer --fuente kmc" if fuente == "kmc" else "simular"}')
    fecha = fecha or fechas[-1]
    destino = cache(fuente, fecha)
    if destino.exists():
        shutil.rmtree(destino)
    carpeta, info = SDB.bajar_corte(almacen, fuente, destino, fecha)
    return SV.leer(carpeta), info, carpeta


def config_clinica(fuente: str, prueba: bool = False) -> AC.ConfigClinica:
    if fuente == 'simulado':
        return simulados.CONFIG_CLINICA_DEMO
    return CF.cargar(prueba=prueba)


def ruta_diccionario() -> Path | None:
    ruta = CA.PROYECTO.diccionario
    return ruta if ruta.exists() else None
