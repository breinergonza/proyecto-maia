"""Riesgo de un niño visita por visita y la primera visita en que se encendió la alerta (D12, D19, 8.1 del plan).

Parte de los puntos que da ``GET /ninos/{sujeto}/historia-riesgo`` (``puntuacion.historia_riesgo``): uno por desenlace y
visita, con el percentil de riesgo de ese niño frente a los demás. Una alerta es entrar al porcentaje con más riesgo
(``percentil >= umbral``, el 10 % de mayor riesgo por defecto). Sin acceso a datos: solo ordena y marca.

Para una familia de anticipación (``readm_6m``) se juntan sus filas base y ``readm_6m_desde_<visita>``: cada una se
calcula en su visita de partida, así que la línea del niño recorre todas las visitas de la familia.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping

from maia_comun import analitica as AN


def de_la_familia(clave: str, desenlace: str) -> bool:
    """Si ``clave`` es el desenlace pedido o una de sus filas ``_desde_``."""
    familia = AN.familia_desde(clave)
    return clave == desenlace or (familia is not None and familia[0] == desenlace)


def primera_alerta(puntos: Iterable[Mapping], umbral: float) -> dict | None:
    """La primera visita (la de menor ``orden``) con ``percentil >= umbral``; ``None`` si nunca se encendió."""
    en_alerta = [p for p in puntos if p['percentil'] >= umbral]
    if not en_alerta:
        return None
    p = min(en_alerta, key=lambda x: (x['orden'], x['clave']))
    return {'clave': p['clave'], 'momento': p['momento'], 'momento_nombre': p.get('momento_nombre', p['momento']),
            'orden': p['orden'], 'percentil': p['percentil']}


def por_desenlace(puntos: Iterable[Mapping], umbral: float, desenlace: str | None = None) -> dict:
    """``{'puntos': [...], 'primera_alerta': {...} | None}`` de un desenlace o de una familia (``desenlace``); sin pedir
    uno, de todos juntos. Los puntos salen de la visita más temprana a la más tardía."""
    elegidos = sorted((p for p in puntos if desenlace is None or de_la_familia(p['clave'], desenlace)),
                      key=lambda p: (p['orden'], p['clave']))
    return {'puntos': elegidos, 'primera_alerta': primera_alerta(elegidos, umbral)}
