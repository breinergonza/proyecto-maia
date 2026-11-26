"""What the command line tools print."""
from __future__ import annotations

import pandas as pd


def mostrar(titulo: str, tabla: pd.DataFrame) -> None:
    print(f'\n{titulo}\n{tabla.to_string() if len(tabla) else "(nada)"}', flush=True)
