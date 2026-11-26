"""``tabla_crecimiento`` guarda la variable de origen de cada dato (de ella sale la unidad)."""
from __future__ import annotations

from types import SimpleNamespace

import pandas as pd

from maia_comun import puntuacion as PU
from maia_comun.modelos_db import Crecimiento


def test_tabla_crecimiento_incluye_variable():
    idx = pd.Index([10, 11])
    c = pd.DataFrame({'sujeto': ['a', 'a'], 'variable': ['peso_kg', None], 'etapa': ['e1', None],
                      'concepto': ['peso_para_talla', 'talla_para_edad'], 'ec_dias': [30.0, 60.0], 'z': [-1.0, -2.5],
                      'bajo': [False, True], 'cae': [False, False], 'improbable': [False, False],
                      'revisar': [False, False]}, index=idx)
    p = SimpleNamespace(datos=pd.DataFrame({'t': pd.to_datetime(['2024-01-01', '2024-02-01'])}, index=idx),
                        x=pd.Series([4.5, 55.0], index=idx))
    t = PU.tabla_crecimiento(c, p, 7)
    assert t.variable.iloc[0] == 'peso_kg' and pd.isna(t.variable.iloc[1])   # sin variable: NULL al copiar
    assert t.indicador.tolist() == ['peso_para_talla', 'talla_para_edad']
    assert set(t.columns) <= {col.name for col in Crecimiento.__table__.columns}


def test_una_edad_que_no_es_la_de_la_visita_se_guarda_como_dato_a_revisar():
    """El núcleo marca ``revisar`` cuando el z es improbable o la edad anotada no cae en la ventana de la visita
    (un control de 12 meses anotado a los 0 días): ninguno de los dos se grafica ni se cuenta."""
    idx = pd.Index([10, 11, 12])
    c = pd.DataFrame({'sujeto': ['a', 'a', 'a'], 'variable': ['talla', 'talla', 'talla'], 'etapa': ['e1', 'e2', 'e3'],
                      'concepto': ['talla_para_edad'] * 3, 'ec_dias': [30.0, 0.0, 90.0], 'z': [-1.0, 0.5, 7.0],
                      'bajo': [False, False, False], 'cae': [False, False, False],
                      'improbable': [False, False, True], 'revisar': [False, True, True]}, index=idx)
    p = SimpleNamespace(datos=pd.DataFrame({'t': pd.to_datetime(['2024-01-01', '2024-02-01', '2024-03-01'])}, index=idx),
                        x=pd.Series([50.0, 51.0, 90.0], index=idx))
    assert PU.tabla_crecimiento(c, p, 7).improbable.tolist() == [False, True, True]
