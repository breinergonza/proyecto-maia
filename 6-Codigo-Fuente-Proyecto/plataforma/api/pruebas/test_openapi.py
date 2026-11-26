"""D47: el contrato infra/openapi.json (de donde salen los tipos de la web) debe coincidir con la API."""
from __future__ import annotations

import json
from pathlib import Path

from maia_api.main import app

RUTA = Path(__file__).resolve().parents[3] / 'infra' / 'openapi.json'


def test_openapi_al_dia():
    guardado = json.loads(RUTA.read_text(encoding='utf-8'))
    vivo = json.loads(json.dumps(app.openapi(), ensure_ascii=False))
    assert guardado == vivo, 'infra/openapi.json está desfasado: corra "make tipos-web"'
