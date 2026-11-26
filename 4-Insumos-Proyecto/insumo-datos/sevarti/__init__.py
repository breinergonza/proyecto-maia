"""SEVARTI: the input contract (``contrato``), the experts' variable dictionary (``diccionario``) and the
adapter of the KMC database (``kmc``)."""
from __future__ import annotations

import time
from pathlib import Path

from archivos import carpetas as CA
from sevarti.contrato import Sevarti, leer


def cargar_datos(carpeta: str | None) -> Sevarti:
    """The data every command works on: the six SEVARTI tables of ``carpeta`` (Parquet), or the KMC
    database when there is none, defined by the experts' dictionary (``entradas/diccionario.xlsx``)."""
    t0 = time.time()
    if carpeta:
        sev = leer(Path(carpeta))
    else:
        from sevarti import kmc  # needs the database driver and KMC_PW: only when it is used
        sev = kmc.cargar_sevarti(CA.PROYECTO.diccionario)
    print(f'Datos: {sev.sujetos.sujeto.nunique():,} sujetos, {len(sev.mediciones):,} datos, '
          f'corte {None if sev.corte is None else sev.corte.date()} ({time.time() - t0:.0f} s)', flush=True)
    return sev
