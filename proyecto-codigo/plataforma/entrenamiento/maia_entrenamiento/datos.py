"""De dónde salen los datos y la configuración de cada fuente.

* ``kmc``: la base de la Fundación (solo lectura, ``KMC_PW``, consultas parametrizadas de
  ``fuentes.kmc_postgres``) y la configuración clínica del diccionario de los expertos
  (``MAIA_RAIZ/entradas/diccionario.xlsx``).
* ``simulado``: el simulador de ``maia_comun.simulados`` y su configuración clínica de demostración.

Los cortes se guardan en MinIO; para entrenar se bajan a ``MAIA_RAIZ/cortes/{fuente}/{fecha}/`` (caché local, con
datos por niño: nunca sale del equipo).
"""
from __future__ import annotations

import shutil
import time
from pathlib import Path

from archivos import carpetas as CA
from clinico import configuracion as CF
from clinico import modelo as AC
from maia_comun import anticipacion as ANT
from maia_comun import sevarti_db as SDB
from maia_comun import simulados
from maia_comun.almacen import Almacen
from maia_entrenamiento.fuentes.kmc_postgres import ParametrosExtraccion
from sevarti import contrato as SV
from sevarti.contrato import Sevarti

FUENTES = ('kmc', 'simulado')
SUFIJO_REGISTRO = {'kmc': '', 'simulado': '-demo'}


def nombre_registro(modelo: str, fuente: str) -> str:
    """``maia-anomalias`` / ``maia-clinico`` para la base real, con ``-demo`` para los datos simulados."""
    return f'maia-{modelo}{SUFIJO_REGISTRO[fuente]}'


def extraer_kmc(params: ParametrosExtraccion | None = None) -> tuple[Sevarti, dict]:
    """La base de la Fundación pasada a SEVARTI con el diccionario de los expertos (que se actualiza si la base
    trae variables nuevas), filtrada según ``params``. Devuelve también los metadatos de la extracción (parámetros,
    sha de las consultas, origen sin clave, filas). Necesita ``KMC_PW``."""
    from maia_entrenamiento.fuentes import kmc_postgres as KP
    t0 = time.time()
    sev, meta = KP.extraer(params or ParametrosExtraccion(), CA.PROYECTO.diccionario)
    print(f'Datos: {meta["filas"]["sujetos"]:,} sujetos, {meta["filas"]["mediciones"]:,} datos, corte {meta["corte"]} '
          f'({time.time() - t0:.0f} s; consultas {meta["consulta_sha"][:12]})', flush=True)
    return sev, meta


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


def config_clinica(fuente: str, prueba: bool = False, anticipacion: bool | None = None) -> AC.ConfigClinica:
    """La configuración clínica de la fuente. Con la anticipación (encendida por defecto, D68; ``anticipacion=False``
    o ``MAIA_ANTICIPACION=0`` la apagan) suma los desenlaces desde otras visitas (D20): en el simulador, las variantes
    de ``maia_comun.anticipacion`` y la talla baja a 12 meses; en la base real, las filas ``_desde_`` «En prueba» del
    Diccionario."""
    anticipar = ANT.activa() if anticipacion is None else anticipacion
    if fuente == 'simulado':
        if anticipar:
            return ANT.con_anticipacion(simulados.CONFIG_CLINICA_DEMO, en_prueba=simulados.EN_PRUEBA_DEMO)
        return simulados.CONFIG_CLINICA_DEMO
    if anticipar and not prueba:
        return ANT.con_anticipacion_del_diccionario(CF.cargar(), CF.cargar(prueba=True))
    return CF.cargar(prueba=prueba)


def ruta_diccionario() -> Path | None:
    ruta = CA.PROYECTO.diccionario
    return ruta if ruta.exists() else None
