"""Configuración de la anticipación (D20, D50): el mismo desenlace predicho desde otras visitas, para medir qué tan
temprano avisa el modelo.

* En la base real, las filas ``<clave>_desde_<visita>`` salen del Diccionario (parche 09 del núcleo, hoja Desenlaces,
  estado «En prueba»): ``con_anticipacion_del_diccionario`` las suma a los desenlaces «En uso».
* En el simulador no hay Diccionario: ``con_anticipacion`` las arma con ``variantes`` a partir de los desenlaces de la
  configuración de demostración.

Las filas «En prueba» no se entrenan salvo que se pida (``MAIA_ANTICIPACION=1``): así no cambian los modelos ni las
alertas que ya se usan. Todo ocurre al entrenar; nada se calcula por niño aquí.
"""
from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from dataclasses import replace

from clinico.modelo import ConfigClinica, Desenlace
from maia_comun import analitica as AN

VARIABLE_ENTORNO = 'MAIA_ANTICIPACION'
_SI = ('1', 'true', 'si', 'sí', 'yes', 'on')

# Simulador (pocas visitas): dónde se registra cada desenlace de demostración, y las visitas desde las que se predice.
# «hospitalización» hace de entrada al programa (la primera visita de la lista).
EVENTOS_SIMULADO = {'readm_3m': '3 m EC', 'oxigeno_3m': '3 m EC', 'desarrollo_6m': '6 m EC'}
VISITAS_SIMULADO = ('hospitalización', '40 sem', '3 m EC', '6 m EC', '12 m EC')


def activa() -> bool:
    return os.environ.get(VARIABLE_ENTORNO, '').strip().lower() in _SI


def etiqueta_visita(momento: str, primera: str) -> str:
    """Lo que va en la clave: ``pmc`` para la primera visita (la entrada al programa), si no el número con que empieza
    la visita (``40 sem`` -> ``40``, ``3 m EC`` -> ``3``), como las claves del Diccionario."""
    return 'pmc' if momento == primera else momento.split()[0]


def variantes(cfg: ConfigClinica, eventos: Mapping[str, str], visitas: Sequence[str]) -> tuple[Desenlace, ...]:
    """Una copia de cada desenlace de ``eventos`` por cada visita anterior a donde se registra (menos en la que ya se
    predice), con la clave ``<clave>_desde_<visita>``."""
    nuevas = []
    for d in cfg.desenlaces:
        evento = eventos.get(d.clave)
        if evento is None or evento not in visitas:
            continue
        for momento in visitas[:visitas.index(evento)]:
            if momento != d.momento:
                nuevas.append(replace(d, clave=f'{d.clave}_desde_{etiqueta_visita(momento, visitas[0])}',
                                      nombre=f'{d.nombre} (riesgo calculado a {momento})', momento=momento))
    return tuple(nuevas)


def con_anticipacion(cfg: ConfigClinica, eventos: Mapping[str, str] = EVENTOS_SIMULADO,
                     visitas: Sequence[str] = VISITAS_SIMULADO) -> ConfigClinica:
    """``cfg`` con las variantes de anticipación de sus desenlaces."""
    return replace(cfg, desenlaces=cfg.desenlaces + variantes(cfg, eventos, visitas))


def con_anticipacion_del_diccionario(en_uso: ConfigClinica, con_prueba: ConfigClinica) -> ConfigClinica:
    """Los desenlaces «En uso» más las filas de anticipación (``_desde_``) del Diccionario, y solo las medidas de
    crecimiento «En prueba» que esas filas necesitan. ``en_uso`` y ``con_prueba`` son ``clinico.configuracion.cargar``
    sin y con ``prueba``."""
    propios = {d.clave for d in en_uso.desenlaces}
    extra = tuple(d for d in con_prueba.desenlaces if d.clave not in propios and AN.familia_desde(d.clave) is not None)
    medidas = {m.nombre for m in en_uso.medidas}
    faltan = {d.concepto for d in extra if d.concepto} - medidas
    return replace(en_uso, desenlaces=en_uso.desenlaces + extra,
                   medidas=en_uso.medidas + tuple(m for m in con_prueba.medidas if m.nombre in faltan),
                   descartados=en_uso.descartados + tuple(x for x in con_prueba.descartados
                                                          if AN.familia_desde(x[0]) is not None))
