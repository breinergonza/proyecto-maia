"""Feedback from the clinicians: a blinded sheet of children (high risk mixed with the rest) and what
their answers say about the risk. Outside the semester run: it is made when the clinicians are asked.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from clinico.modelo import ModeloClinico, ModeloDesenlace, Preparado, importancia, primeros
from retroalimentacion.respuestas import RESPUESTAS, wilson


def resumen_nino(modelo: ModeloClinico, m: ModeloDesenlace, X: pd.DataFrame, n: int = 6) -> list[str]:
    """What a clinician needs to judge the child for this outcome: the model's most important
    inputs with the child's values. The same inputs for every child, so the sheet does not
    tell whose risk is high."""
    cols = list(importancia(m, {}, top=n).index)
    Xc = X.reindex(columns=cols)
    salida = []
    for fila in Xc.itertuples(index=False):
        partes = []
        for col, val in zip(cols, fila):
            partes.append(modelo.dato(col, val))
        salida.append('; '.join(partes))
    return salida


def muestra_medicos(modelo: ModeloClinico, p: Preparado, riesgos: pd.DataFrame, por_grupo: int = 20,
                    semilla: int = 0) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Blinded sheet for clinicians: per outcome, children with the highest risk (the
    ``fraccion_alta`` share) mixed with the rest, in random order, each with the same summary.
    The key (which stratum) stays apart. The clinicians answer whether the child worries them
    (sí / no / no sé)."""
    rng = np.random.default_rng(semilla)
    partes = []
    for clave, g in riesgos.groupby('clave'):
        alto = primeros(g.riesgo.to_numpy(), modelo.cfg.fraccion_alta, semilla)
        for estrato, sub in (('riesgo alto', g[alto]), ('resto', g[~alto])):
            if len(sub):
                partes.append(sub.iloc[rng.choice(len(sub), size=min(por_grupo, len(sub)), replace=False)]
                              .assign(estrato=estrato))
    if not partes:
        return pd.DataFrame(), pd.DataFrame()
    elegidos = pd.concat(partes).sample(frac=1, random_state=semilla).reset_index(drop=True)
    elegidos.insert(0, 'id', np.arange(1, len(elegidos) + 1))
    resumen = pd.Series('', index=elegidos.index)
    for clave, g in elegidos.groupby('clave'):
        m = modelo.modelos[clave]
        X = modelo.matriz(p, m.desenlace.momento).reindex(g.sujeto)
        resumen[g.index] = resumen_nino(modelo, m, X)
    hoja = pd.DataFrame({'id': elegidos.id, 'sujeto': elegidos.sujeto, 'visita': elegidos.momento,
                         'fecha_visita': pd.to_datetime(elegidos.fecha_visita).dt.date,
                         'pregunta': '¿Le preocupa este niño por: ' + elegidos.desenlace + '?',
                         'datos_del_nino': resumen, 'le_preocupa': '', 'comentario': ''})
    clave = elegidos[['id', 'clave', 'desenlace', 'estrato', 'riesgo']]
    return hoja, clave


def medir_revision(hoja: pd.DataFrame, clave: pd.DataFrame) -> pd.DataFrame:
    """Share of children that worried the clinicians, per outcome and stratum, with a 95%
    interval. Children with high risk should worry them much more often than the rest."""
    j = clave.merge(hoja[['id', 'le_preocupa']], on='id')
    j['si'] = j.le_preocupa.astype(str).str.strip().str.lower().map(RESPUESTAS)
    j = j.dropna(subset=['si'])
    filas = []
    for (des, estrato), g in j.groupby(['desenlace', 'estrato']):
        k, n = float(g.si.sum()), len(g)
        lo, hi = wilson(k, n)
        filas.append(dict(desenlace=des, estrato=estrato, revisados=n, le_preocupan=int(k),
                          pct=100 * k / n, ic95_bajo=lo, ic95_alto=hi))
    return pd.DataFrame(filas).set_index(['desenlace', 'estrato'])
