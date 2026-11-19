"""Piezas puras de la predicción asíncrona (sin base de datos): la memoria de resultados por niño, la comprobación de fuga
de entrenamiento y los agregados por visita.

* La tabla por niño de un cálculo grande **no se guarda en la base** (D7): vive aquí, en la memoria del proceso de la
  API, una hora como máximo y hasta ``MAXIMO`` cálculos a la vez. Los agregados sí quedan en ``resultados.predicciones``.
* ``fuga_entrenamiento`` compara los niños de la muestra con los que entraron al entrenamiento del modelo (la lista va
  en ``sevarti_base/ninos_entrenamiento.parquet`` del paquete; ver ``maia_entrenamiento.entrenar._sevarti_base``).
* ``por_visita`` agrega el riesgo en cada visita (la integración con el riesgo por visita de Analítica, si algún día
  se comparte, entra aquí: basta con reemplazar esta función por la compartida).
"""
from __future__ import annotations

import threading
import time
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

TTL_SEGUNDOS = 3600
MAXIMO = 4                 # cálculos que se conservan en memoria a la vez
MINIMO_CELDA = 5           # D4: una celda con menos niños no se muestra
NOMBRE_LISTA = 'ninos_entrenamiento.parquet'


class Resultados:
    """Resultados por niño en memoria, con vencimiento. Seguro entre hilos."""

    def __init__(self, ttl: float = TTL_SEGUNDOS, maximo: int = MAXIMO, reloj=time.monotonic):
        self._d: dict[int, tuple[float, pd.DataFrame]] = {}
        self._lock = threading.RLock()
        self.ttl, self.maximo, self._reloj = ttl, maximo, reloj

    def _purgar(self) -> None:
        ahora = self._reloj()
        for k in [k for k, (t, _) in self._d.items() if ahora - t > self.ttl]:
            del self._d[k]
        while len(self._d) > self.maximo:
            del self._d[min(self._d, key=lambda k: self._d[k][0])]

    def poner(self, clave: int, tabla: pd.DataFrame) -> None:
        with self._lock:
            self._d[clave] = (self._reloj(), tabla)
            self._purgar()

    def obtener(self, clave: int) -> pd.DataFrame | None:
        with self._lock:
            self._purgar()
            return self._d[clave][1] if clave in self._d else None

    def quitar(self, clave: int) -> None:
        with self._lock:
            self._d.pop(clave, None)

    def vaciar(self) -> None:
        with self._lock:
            self._d.clear()


RESULTADOS = Resultados()


# ------------------------------------------------------------------ fuga de entrenamiento

def leer_entrenados(base: Path) -> set[str] | None:
    """Los niños con que se entrenó el modelo, o ``None`` si el paquete no trae la lista (paquetes anteriores)."""
    ruta = base / NOMBRE_LISTA
    if not ruta.exists():
        return None
    return set(pd.read_parquet(ruta, columns=['sujeto']).sujeto.astype(str))


def fuga_entrenamiento(ids: Iterable[str], entrenados: set[str] | None, excluir: bool) -> tuple[list[str], dict[str, Any]]:
    """(niños que quedan, estado de la fuga). Con la lista del entrenamiento: cuántos de ``ids`` estaban en ella y, si
    ``excluir``, se quitan. Sin la lista, la fuga no se puede verificar (``fuga_no_verificable``)."""
    ids = list(ids)
    fuga: dict[str, Any] = {'fuga_no_verificable': entrenados is None, 'en_entrenamiento': None, 'excluidos': 0,
                            'n_entrenamiento': None}
    if entrenados is None:
        return ids, fuga
    dentro = [i for i in ids if i in entrenados]
    fuga['en_entrenamiento'] = len(dentro)
    fuga['n_entrenamiento'] = len(entrenados)
    if excluir:
        fuera = set(dentro)
        ids = [i for i in ids if i not in fuera]
        fuga['excluidos'] = len(dentro)
    return ids, fuga


# ------------------------------------------------------------------ riesgo por visita

def por_visita(hist: pd.DataFrame, orden: dict[str, int], nombres: dict[str, str], percentil_alto: float,
               minimo: int = MINIMO_CELDA) -> list[dict]:
    """Para cada desenlace y visita: cuántos niños, riesgo mediano y cuántos en riesgo alto. ``hist`` trae una fila por
    niño, desenlace y visita (``clave, desenlace, momento, riesgo, percentil``; sin el código del niño, que aquí no hace
    falta). Las celdas con menos de
    ``minimo`` niños no llevan cifras (D4)."""
    if hist.empty:
        return []
    salida = []
    for (clave, desenlace, momento), g in hist.groupby(['clave', 'desenlace', 'momento']):
        n = len(g)
        celda: dict[str, Any] = {'clave': clave, 'desenlace': desenlace, 'momento': str(momento),
                                 'momento_nombre': nombres.get(str(momento), str(momento)),
                                 'orden': orden.get(str(momento), 99), 'n': n, 'oculta': n < minimo}
        if n >= minimo:
            altos = int((g.percentil >= percentil_alto).sum())
            celda |= {'riesgo_mediano': float(np.median(g.riesgo)), 'altos': altos, 'pct_altos': round(100 * altos / n, 1)}
        else:
            celda |= {'riesgo_mediano': None, 'altos': None, 'pct_altos': None}
        salida.append(celda)
    return sorted(salida, key=lambda c: (c['clave'], c['orden']))
