"""Where the files live, grouped by what they are for. Inputs and outputs are what the Foundation sees;
``interno/`` is only for the system. Everything except ``entradas/diccionario.xlsx`` has data per patient
and leaves the team never: not by email, not in the zip of the project.

  entradas/
    diccionario.xlsx                   the variables of the data, kept by the experts
    retroalimentacion/                 expertos_<versión>.xlsx, medicos_<versión>.xlsx
                                       (the answered sheets come back here)
  salidas/
    revision_de_datos/                 <fecha>.xlsx: the review queue of the anomaly model
    riesgos/                           <fecha>.xlsx: the clinical risks
  interno/
    anomalias/                         modelos/<versión>/, estado.json, puntajes_<versión>_<fecha>.parquet
    clinico/                           modelos/<versión>/, estado.json, silencio/<versión>_<fecha>.parquet,
                                       experimentos/<fecha>.csv (validation of the experimental outcomes)
    claves/                           expertos_<versión>.csv, medicos_<versión>.csv
                                       (the answer keys, never next to the sheets)

``PROYECTO`` is the folder of this project. The command line tools read it when they run, so the tests
point it at a temporary folder.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# MAIA_RAIZ moves entradas/, salidas/ and interno/ out of the code (a container volume, for example).
RAIZ = Path(os.environ.get('MAIA_RAIZ') or Path(__file__).resolve().parent.parent)


@dataclass(frozen=True)
class Carpetas:
    raiz: Path

    @property
    def diccionario(self) -> Path:
        return self.raiz / 'entradas' / 'diccionario.xlsx'

    @property
    def para_llenar(self) -> Path:
        return self.raiz / 'entradas' / 'retroalimentacion'

    @property
    def revisiones(self) -> Path:
        return self.raiz / 'salidas' / 'revision_de_datos'

    @property
    def riesgos(self) -> Path:
        return self.raiz / 'salidas' / 'riesgos'

    @property
    def interno_anomalias(self) -> Path:
        return self.raiz / 'interno' / 'anomalias'

    @property
    def modelos_anomalias(self) -> Path:
        return self.interno_anomalias / 'modelos'

    @property
    def interno_clinico(self) -> Path:
        return self.raiz / 'interno' / 'clinico'

    @property
    def modelos_clinicos(self) -> Path:
        return self.interno_clinico / 'modelos'

    @property
    def silencio(self) -> Path:
        return self.interno_clinico / 'silencio'

    @property
    def experimentos(self) -> Path:
        return self.interno_clinico / 'experimentos'

    @property
    def claves(self) -> Path:
        return self.raiz / 'interno' / 'claves'

    def relativa(self, ruta: Path) -> Path:
        """``ruta`` as it is shown to people: from the project folder."""
        return ruta.relative_to(self.raiz)


PROYECTO = Carpetas(RAIZ)
