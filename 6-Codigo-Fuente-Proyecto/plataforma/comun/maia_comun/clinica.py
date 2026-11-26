"""Familias de desenlaces de la vista clínica: la clave sin ``_desde_<visita>`` agrupa el mismo desenlace predicho desde
varias visitas. Lo comparten la corrida (desenlaces observados) y la API (``/clinica/resumen``)."""
from __future__ import annotations

from collections.abc import Iterable, Mapping

import pandas as pd

from clinico.modelo import ModeloDesenlace
from maia_comun import analitica as AN

#: Los desenlaces a 12 meses que la vista clínica presenta primero, en este orden.
FAMILIAS_PRIORIZADAS = ('talla_baja_12m', 'desarrollo_12m')


def familia_de(clave: str) -> str:
    """``talla_baja_12m_desde_3`` -> ``talla_baja_12m``; una clave que no es de una familia es su propia familia."""
    desde = AN.familia_desde(clave)
    return desde[0] if desde else clave


def estado_de(clave: str) -> str:
    """Las filas ``_desde_`` están «En prueba» (no dan alertas); la fila base de una familia, «En uso»."""
    return 'en_prueba' if AN.familia_desde(clave) else 'en_uso'


def representantes(modelos: Mapping[str, ModeloDesenlace]) -> dict[str, ModeloDesenlace]:
    """Un submodelo por familia: la clave base si se entrenó; si no, el primero de la familia por clave (todos leen el
    mismo desenlace de los datos; lo que cambia entre ellos es la visita desde la que se predice)."""
    elegidos: dict[str, ModeloDesenlace] = {}
    for clave in sorted(modelos):
        familia = familia_de(clave)
        if familia not in elegidos or clave == familia:
            elegidos[familia] = modelos[clave]
    return elegidos


def primera_visita(momentos: Iterable[str], etapas: pd.DataFrame) -> str:
    """La visita más temprana desde la que algún modelo predice: es la primera visita clínica del programa, y quienes
    asistieron a ella son (casi) todos los niños, no solo quienes llegaron a la visita de cada corte."""
    orden = etapas.set_index('etapa').orden
    return min(momentos, key=lambda m: orden.get(m, float('inf')))
