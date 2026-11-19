"""Atributos por niño para filtrar muestras sin leer todas las mediciones.

``cargar_atributos`` llena, para un corte ya guardado en Postgres:

* ``sevarti.atributos_sujeto``: por niño y variable filtrable (numérica, categórica o sí/no), su primera medición válida
  (``variable``) y su última (``variable@ultima``), según la regla D1. Una medición es válida si tiene valor, es un
  número cuando la variable es numérica y no es uno de los códigos especiales que declara el diccionario.
* ``sevarti.resumen_sujeto``: cuántos datos tiene cada niño (los códigos especiales no cuentan).

Se hace con ``INSERT ... SELECT`` dentro de Postgres (no baja las mediciones), y se puede repetir: borra y recarga.
``rellenar_faltantes`` lo hace para los cortes vigentes que se cargaron antes de que existiera la tabla (la API lo
corre al arrancar).
"""
from __future__ import annotations

import json

import pandas as pd
from sqlalchemy import Engine, text

from maia_comun.muestra import RE_NUMERO, SUFIJO_ULTIMA
from sevarti import contrato as SV

TIPOS_FILTRABLES = ('numeric', 'categorical', 'boolean')

_VALIDAS = f"""
WITH reglas AS (
    SELECT r.variable, r.numerica
    FROM unnest(CAST(:vars AS text[]), CAST(:numericas AS boolean[])) AS r(variable, numerica)),
codigos AS (
    SELECT c.variable, c.codigo
    FROM unnest(CAST(:cvars AS text[]), CAST(:ccodigos AS float8[])) AS c(variable, codigo)),
leidas AS (
    SELECT m.id, m.sujeto, m.variable, m.valor,
           CASE WHEN m.valor ~ '{RE_NUMERO}' THEN CAST(m.valor AS float8) END AS valor_num
    FROM sevarti.mediciones m
    WHERE m.corte_id = :c AND m.valor IS NOT NULL),
validas AS (
    SELECT l.*, r.numerica FROM leidas l JOIN reglas r USING (variable)
    WHERE (NOT r.numerica OR l.valor_num IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM codigos k WHERE k.variable = l.variable AND k.codigo = l.valor_num))
"""

_INSERTAR = _VALIDAS + """
INSERT INTO sevarti.atributos_sujeto (corte_id, sujeto, variable, valor, valor_num)
SELECT DISTINCT ON (sujeto, variable) :c, sujeto, variable || CAST(:sufijo AS text), valor, valor_num
FROM validas ORDER BY sujeto, variable, id {orden}
"""

_RESUMEN = f"""
INSERT INTO sevarti.resumen_sujeto (corte_id, sujeto, n_datos)
SELECT s.corte_id, s.sujeto, count(m.id)
FROM sevarti.sujetos s
LEFT JOIN (
    SELECT m.id, m.sujeto, m.variable,
           CASE WHEN m.valor ~ '{RE_NUMERO}' THEN CAST(m.valor AS float8) END AS valor_num
    FROM sevarti.mediciones m WHERE m.corte_id = :c AND m.valor IS NOT NULL) m
  ON m.sujeto = s.sujeto
 AND NOT EXISTS (SELECT 1 FROM unnest(CAST(:cvars AS text[]), CAST(:ccodigos AS float8[])) AS k(variable, codigo)
                 WHERE k.variable = m.variable AND k.codigo = m.valor_num)
WHERE s.corte_id = :c
GROUP BY s.corte_id, s.sujeto
"""


def variables_filtrables(esquema: pd.DataFrame) -> pd.DataFrame:
    return esquema[esquema.tipo.isin(TIPOS_FILTRABLES)]


def cargar_atributos(motor: Engine, corte_id: int, esquema: pd.DataFrame) -> dict[str, int]:
    """Recarga ``atributos_sujeto`` y ``resumen_sujeto`` del corte. Devuelve cuántas filas puso en cada tabla."""
    filtrables = variables_filtrables(esquema)
    codigos = [(str(v), c) for v, t in zip(esquema.variable, esquema.codigos_especiales)
               for c in SV.codigos_declarados(t)]
    p = {'c': corte_id, 'vars': [str(v) for v in filtrables.variable],
         'numericas': [t == 'numeric' for t in filtrables.tipo],
         'cvars': [v for v, _ in codigos], 'ccodigos': [c for _, c in codigos]}
    with motor.begin() as cx:
        cx.execute(text('DELETE FROM sevarti.atributos_sujeto WHERE corte_id = :c'), {'c': corte_id})
        cx.execute(text('DELETE FROM sevarti.resumen_sujeto WHERE corte_id = :c'), {'c': corte_id})
        # la primera medición válida lleva el nombre de la variable; la última, el sufijo (D1)
        primeras = cx.execute(text(_INSERTAR.format(orden='ASC')), {**p, 'sufijo': ''}).rowcount
        ultimas = cx.execute(text(_INSERTAR.format(orden='DESC')), {**p, 'sufijo': SUFIJO_ULTIMA}).rowcount
        resumen = cx.execute(text(_RESUMEN), {k: p[k] for k in ('c', 'cvars', 'ccodigos')}).rowcount
    return {'atributos': primeras + ultimas, 'resumen': resumen}


# candado de Postgres para que dos procesos de la API no rellenen a la vez (número fijo de este módulo)
_CANDADO = 734_118_001


def _esquema(cx, corte_id: int) -> pd.DataFrame:
    filas = cx.execute(text('SELECT variable, datos FROM sevarti.esquema WHERE corte_id = :c ORDER BY variable'),
                       {'c': corte_id}).all()
    return SV.normalizar_esquema(pd.DataFrame([{'variable': v, **(d if isinstance(d, dict) else json.loads(d))}
                                               for v, d in filas]))


def cortes_sin_atributos(motor: Engine) -> list[int]:
    """Cortes vigentes con niños pero sin ``atributos_sujeto``: los que se cargaron antes de la migración 0008."""
    with motor.connect() as cx:
        return [int(c) for (c,) in cx.execute(text(
            'SELECT c.id FROM sevarti.cortes c WHERE c.vigente '
            'AND EXISTS (SELECT 1 FROM sevarti.sujetos s WHERE s.corte_id = c.id) '
            'AND NOT EXISTS (SELECT 1 FROM sevarti.atributos_sujeto a WHERE a.corte_id = c.id) ORDER BY c.id'))]


def rellenar_faltantes(motor: Engine) -> dict[int, dict[str, int]]:
    """Llena ``atributos_sujeto`` y ``resumen_sujeto`` de los cortes vigentes que no los tienen. Sin ellos, Explorar,
    las muestras y Predicción no pueden filtrar por ninguna variable (las facetas salen vacías). Se puede repetir: si
    otro proceso ya está rellenando, no hace nada."""
    hechos: dict[int, dict[str, int]] = {}
    with motor.connect() as cx:
        if not cx.execute(text('SELECT pg_try_advisory_lock(:k)'), {'k': _CANDADO}).scalar():
            return hechos
        try:
            for corte in cortes_sin_atributos(motor):
                hechos[corte] = cargar_atributos(motor, corte, _esquema(cx, corte))
        finally:
            cx.execute(text('SELECT pg_advisory_unlock(:k)'), {'k': _CANDADO})
    return hechos
