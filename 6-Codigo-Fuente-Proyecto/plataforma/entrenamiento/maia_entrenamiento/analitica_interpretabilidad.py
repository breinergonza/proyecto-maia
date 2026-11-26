"""Interpretabilidad del modelo clínico dentro de la misma corrida de entrenamiento (sin ocupar la GPU dos veces).

Calcula, con una submuestra acotada de los niños de validación, los artefactos ``shap_global``, ``pdp``,
``motivos_frecuentes`` e ``interaccion`` (ver ``maia_comun.analitica_interpretabilidad``) y los deja junto a los demás
de la interpretabilidad en ``resultados.analitica`` (tipo ``interpretabilidad``). Solo agregados (D7).

* SHAP son las contribuciones exactas de LightGBM (``pred_contrib``, el mismo algoritmo TreeSHAP del paquete ``shap``),
  así no hace falta una dependencia extra ni la GPU.
* ``MAIA_INTERPRETABILIDAD=0`` lo apaga; ``MAIA_INTERPRETABILIDAD_FILAS`` acota la submuestra (por defecto 2.000).
* Un fallo aquí nunca rompe el entrenamiento ni el resto de la analítica: queda un aviso.
"""
from __future__ import annotations

import os
import re
import sys

import numpy as np
import pandas as pd

from maia_comun import analitica as AN
from maia_comun import analitica_interpretabilidad as AI

FILAS_POR_DEFECTO = 2_000
ALERTA_TOP_PCT = 10     # la alerta de hoy: el 10 % de mayor riesgo (D30)
_CODIGO = re.compile(r'\s*\(\w+\)\s*$')


def activa() -> bool:
    return os.environ.get('MAIA_INTERPRETABILIDAD', '1').strip().lower() not in ('0', 'false', 'no', 'off', '')


def max_filas() -> int:
    v = os.environ.get('MAIA_INTERPRETABILIDAD_FILAS', '').strip()
    return int(v) if v.isdigit() and int(v) > 0 else FILAS_POR_DEFECTO


def _legibles(etiquetas: dict[str, str]) -> dict[str, str]:
    """«Peso al nacer (ern_peso)» -> «Peso al nacer»: el código de la variable no se muestra."""
    return {k: (_CODIGO.sub('', v) or k) for k, v in etiquetas.items()}


def artefactos(modelo, m, variables: pd.DataFrame, riesgo: np.ndarray, semilla: int = 0) -> dict | None:
    """Los cuatro artefactos de un desenlace (``m`` es su ``ModeloDesenlace``). ``variables`` y ``riesgo`` son los de
    los niños de validación; aquí se submuestrean. ``None`` si hay muy pocos niños."""
    n = len(variables)
    if n < AN.MIN_DISTRIBUCION:
        return None
    k = max_filas()
    if n > k:
        idx = np.sort(np.random.default_rng(semilla).choice(n, k, replace=False))
        variables, riesgo = variables.iloc[idx], np.asarray(riesgo)[idx]
    X = variables.reindex(columns=m.columnas)
    etiquetas = _legibles(getattr(modelo, 'etiquetas', {}) or {})
    contrib = m.modelo.predict(X, pred_contrib=True)[:, :-1]
    sg = AI.shap_global(contrib, m.columnas, X, etiquetas)
    principales = [v['variable'] for v in (sg or {}).get('variables', [])]
    r = np.asarray(riesgo, dtype=float)
    kk = max(1, int(round(len(r) * ALERTA_TOP_PCT / 100)))
    alerta = np.zeros(len(r), dtype=bool)
    alerta[AN._orden(r)[:kk]] = True
    numericas = [v for v in principales if pd.to_numeric(X[v], errors='coerce').nunique() >= 3]
    pares = [(numericas[i], numericas[j]) for i, j in ((0, 1), (0, 2), (1, 2)) if j < len(numericas)]
    salida = {
        'shap_global': sg,
        'pdp': AI.pdp(m.riesgo, X, principales, etiquetas),
        'motivos_frecuentes': AI.motivos_frecuentes(contrib, m.columnas, alerta, etiquetas),
        'interaccion': AI.interaccion(X, r, pares, etiquetas),
    }
    return salida if any(v is not None for v in salida.values()) else None


def agregar(resultados: dict[str, dict[str, dict]], modelo, preds: dict[str, dict]) -> None:
    """Suma los artefactos a ``resultados[clave]['interpretabilidad']`` de cada desenlace con datos. Si está apagado o
    algo falla, lo dice en los ``avisos`` de ese desenlace."""
    for clave, d in preds.items():
        base = (resultados.get(clave) or {}).get('interpretabilidad')
        if base is None:        # desenlace con muy pocos niños o sin las dos clases
            continue
        if not activa():
            base.setdefault('avisos', []).append('SHAP, dependencia parcial, motivos e interacción desactivados (MAIA_INTERPRETABILIDAD=0).')
            continue
        try:
            extra = artefactos(modelo, modelo.modelos[clave], d['variables'], d['r'])
        except Exception as e:  # noqa: BLE001  (la interpretabilidad no rompe el resto)
            print(f'Aviso de analítica: interpretabilidad de {clave} falló ({type(e).__name__}: {e}).', file=sys.stderr, flush=True)
            base.setdefault('avisos', []).append('No se pudo calcular SHAP, dependencia parcial, motivos ni interacción.')
            continue
        if extra:
            base.update(AN.limpio(extra))
