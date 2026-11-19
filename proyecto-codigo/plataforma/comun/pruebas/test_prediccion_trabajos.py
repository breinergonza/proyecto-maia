"""Predicción asíncrona: memoria de resultados con vencimiento, fuga de entrenamiento y riesgo por visita (sin base)."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from maia_comun import prediccion_trabajos as PT


class Reloj:
    def __init__(self):
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


def _tabla(n: int = 3) -> pd.DataFrame:
    return pd.DataFrame({'sujeto': [f'N-{i}' for i in range(n)], 'riesgo': np.linspace(0.1, 0.9, n)})


def test_la_memoria_vence_y_limita_cuantos_conserva():
    reloj = Reloj()
    r = PT.Resultados(ttl=100, maximo=2, reloj=reloj)
    r.poner(1, _tabla())
    reloj.t = 10
    r.poner(2, _tabla())
    reloj.t = 20
    r.poner(3, _tabla())                       # el más viejo (1) sale por el tope
    assert r.obtener(1) is None and r.obtener(2) is not None and r.obtener(3) is not None
    reloj.t = 115                              # 2 (puesto en 10) venció; 3 (puesto en 20) sigue
    assert r.obtener(2) is None and r.obtener(3) is not None
    r.quitar(3)
    assert r.obtener(3) is None


def test_fuga_sin_lista_no_es_verificable():
    ids, fuga = PT.fuga_entrenamiento(['a', 'b'], None, excluir=True)
    assert ids == ['a', 'b']                   # no se puede excluir lo que no se conoce
    assert fuga == {'fuga_no_verificable': True, 'en_entrenamiento': None, 'excluidos': 0, 'n_entrenamiento': None}


def test_fuga_cuenta_y_excluye_a_los_entrenados():
    entrenados = {'a', 'b', 'z'}
    ids, fuga = PT.fuga_entrenamiento(['a', 'c', 'b', 'd'], entrenados, excluir=False)
    assert ids == ['a', 'c', 'b', 'd']
    assert fuga['fuga_no_verificable'] is False and fuga['en_entrenamiento'] == 2 and fuga['excluidos'] == 0
    assert fuga['n_entrenamiento'] == 3
    ids, fuga = PT.fuga_entrenamiento(['a', 'c', 'b', 'd'], entrenados, excluir=True)
    assert ids == ['c', 'd'] and fuga['excluidos'] == 2 and fuga['en_entrenamiento'] == 2
    ids, fuga = PT.fuga_entrenamiento(['c'], entrenados, excluir=True)
    assert ids == ['c'] and fuga['en_entrenamiento'] == 0


def test_leer_entrenados(tmp_path):
    assert PT.leer_entrenados(tmp_path) is None       # paquete anterior, sin lista
    pd.DataFrame({'sujeto': ['N-1', 'N-2', 'N-2']}).to_parquet(tmp_path / PT.NOMBRE_LISTA, index=False)
    assert PT.leer_entrenados(tmp_path) == {'N-1', 'N-2'}


def test_por_visita_oculta_celdas_con_menos_de_5():
    rng = np.random.default_rng(0)

    def bloque(momento: str, n: int) -> pd.DataFrame:
        return pd.DataFrame({'clave': 'd1', 'desenlace': 'Desenlace uno', 'momento': momento,
                             'riesgo': rng.random(n), 'percentil': np.linspace(0, 100, n)})

    hist = pd.concat([bloque('nac', 40), bloque('3m', 4)], ignore_index=True)
    cel = PT.por_visita(hist, {'nac': 1, '3m': 2}, {'nac': 'Nacimiento', '3m': '3 meses'}, percentil_alto=90)
    assert [c['momento'] for c in cel] == ['nac', '3m']          # por orden de visita
    nac, tres = cel
    assert nac['n'] == 40 and nac['oculta'] is False and nac['momento_nombre'] == 'Nacimiento'
    assert nac['altos'] == int((hist[hist.momento == 'nac'].percentil >= 90).sum())
    assert nac['pct_altos'] == pytest.approx(100 * nac['altos'] / 40, abs=0.1)
    assert tres['oculta'] is True and tres['riesgo_mediano'] is None and tres['altos'] is None
    assert PT.por_visita(hist.iloc[0:0], {}, {}, 90) == []
