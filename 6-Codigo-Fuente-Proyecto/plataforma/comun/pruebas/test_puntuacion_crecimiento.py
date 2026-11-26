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
                      'bajo': [False, True], 'cae': [False, False], 'improbable': [False, False]}, index=idx)
    p = SimpleNamespace(datos=pd.DataFrame({'t': pd.to_datetime(['2024-01-01', '2024-02-01'])}, index=idx),
                        x=pd.Series([4.5, 55.0], index=idx))
    t = PU.tabla_crecimiento(c, p, 7)
    assert t.variable.iloc[0] == 'peso_kg' and pd.isna(t.variable.iloc[1])   # sin variable: NULL al copiar
    assert t.indicador.tolist() == ['peso_para_talla', 'talla_para_edad']
    assert set(t.columns) <= {col.name for col in Crecimiento.__table__.columns}
