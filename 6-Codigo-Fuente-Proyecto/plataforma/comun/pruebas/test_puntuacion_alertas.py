"""``tabla_alertas`` guarda la cola de revisión del núcleo tal como la entrega ``cola_revision``."""
from __future__ import annotations

import pandas as pd

from maia_comun import puntuacion as PU
from maia_comun.modelos_db import AlertaDato


def _cola(**cambios) -> pd.DataFrame:
    fila = {'sujeto': 's1', 'variable': 'peso', 'etiqueta': 'Peso', 'unidad': 'GRAMOS', 'etapa': '3 m EC',
            'fecha': pd.Timestamp('2024-01-01'), 'valor': 2300.0, 'esperado': 2410.123, 'rango_bajo': 2000.0,
            'rango_alto': 2800.0, 'capas': '2', 'n_capas': 1, 'motivos': 'lejos de lo esperado', 'fuerza': 1.5,
            'prioridad': 1}
    fila.update(cambios)
    return pd.DataFrame([fila])


def test_una_visita_fuera_de_su_ventana_tiene_su_propia_medicion():
    """El núcleo junta en una fila la visita con una edad que no es la suya, sin variable (``''``). En la
    plataforma la medición es el filtro de la cola: vacía se confundiría con «todas», así que lleva su clave."""
    cola = _cola(variable='', etiqueta='Edad a la visita', unidad='días', valor=0.0, esperado=float('nan'),
                 rango_bajo=330.0, rango_alto=400.0, capas='3', motivos='fuera de la ventana de la etapa')
    t = PU.tabla_alertas(cola, 7)
    assert t.variable.tolist() == [PU.VARIABLE_EDAD_VISITA] and PU.VARIABLE_EDAD_VISITA
    assert t.etiqueta.tolist() == ['Edad a la visita'] and t.rango_bajo.tolist() == [330.0]
    assert pd.isna(t.esperado.iloc[0])
    assert set(t.columns) <= {col.name for col in AlertaDato.__table__.columns}


def test_una_medicion_con_variable_la_conserva():
    t = PU.tabla_alertas(_cola(), 7)
    assert t.variable.tolist() == ['peso'] and t.esperado.tolist() == [2410.12]   # el núcleo ya no redondea
