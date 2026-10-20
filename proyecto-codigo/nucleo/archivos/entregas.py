"""Which period a delivery covers. Each one starts at the previous delivery's cut; running the same cut
again repeats its period instead of delivering only what came after it."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


def periodo(estado: Path, corte: pd.Timestamp | None, pedido: str | None) -> pd.Timestamp | None:
    """The start date (None = from the beginning): the one asked for, else the one the state implies."""
    if pedido:
        return pd.Timestamp(pedido)
    previo = json.loads(estado.read_text(encoding='utf-8')) if estado.exists() else {}
    if 'ultimo_corte' not in previo:
        return None
    if corte is not None and previo['ultimo_corte'] == str(corte.date()):
        return pd.Timestamp(previo['desde']) if previo['desde'] else None
    return pd.Timestamp(previo['ultimo_corte'])


def registrar(estado: Path, corte: pd.Timestamp | None, desde: pd.Timestamp | None, modelo: str) -> None:
    if corte is None:
        return
    estado.parent.mkdir(parents=True, exist_ok=True)
    estado.write_text(json.dumps({'ultimo_corte': str(corte.date()),
                                  'desde': str(desde.date()) if desde is not None else None,
                                  'modelo': modelo}), encoding='utf-8')
