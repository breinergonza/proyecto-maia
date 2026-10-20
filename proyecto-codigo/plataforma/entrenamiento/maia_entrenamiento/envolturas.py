"""Los modelos del núcleo como ``mlflow.pyfunc``: así quedan en el Model Registry con su firma de uso.

La entrada es un DataFrame con la columna ``carpeta_sevarti`` (ruta a una carpeta con las seis tablas en Parquet);
la salida, la cola de revisión (anomalías) o los riesgos por niño (clínico). La plataforma no los carga por aquí
(la API usa el paquete firmado); sirven para reproducir un modelo registrado con ``mlflow.pyfunc.load_model``.
"""
from __future__ import annotations

from pathlib import Path

import mlflow.pyfunc
import pandas as pd


def _carpeta_modelo(context) -> Path:
    raiz = Path(context.artifacts['carpeta'])
    fichas = list(raiz.rglob('ficha.json'))
    if not fichas:
        raise FileNotFoundError(f'No hay ficha.json en {raiz}')
    return fichas[0].parent


class EnvolturaAnomalias(mlflow.pyfunc.PythonModel):
    def load_context(self, context):
        from anomalias import operacion as OP
        self.modelo, self.ficha = OP.cargar(_carpeta_modelo(context))

    def predict(self, context, model_input: pd.DataFrame, params=None) -> pd.DataFrame:
        from anomalias import operacion as OP
        from sevarti.contrato import leer
        partes = []
        for carpeta in model_input['carpeta_sevarti']:
            sev = leer(Path(carpeta))
            res = self.modelo.puntuar(sev)
            partes.append(OP.cola_revision(res, sev.esquema, self.modelo.cfg))
        return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()


class EnvolturaClinico(mlflow.pyfunc.PythonModel):
    def load_context(self, context):
        from clinico import modelo as AC
        self.modelo, self.ficha = AC.cargar(_carpeta_modelo(context))

    def predict(self, context, model_input: pd.DataFrame, params=None) -> pd.DataFrame:
        from sevarti.contrato import leer
        partes = []
        for carpeta in model_input['carpeta_sevarti']:
            p = self.modelo.preparar(leer(Path(carpeta)))
            partes.append(self.modelo.riesgos(p))
        return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()
