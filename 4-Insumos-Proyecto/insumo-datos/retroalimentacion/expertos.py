"""Feedback from the experts: a blinded sample of the anomaly model's alerts, and what their answers
say about each layer. Outside the semester run: it is made when the experts are asked.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from anomalias.operacion import CAPAS
from retroalimentacion.respuestas import RESPUESTAS, wilson


def _historia(d: pd.DataFrame, filas: pd.Index, nombres: dict[str, str]) -> pd.Series:
    """The subject's values of the same concept in age order, so the expert can judge the
    datum against the rest of the trajectory (``etapa: valor`` separated by ' | ')."""
    sel = d.loc[filas]
    con = d[d.concepto.notna() & d.sujeto.isin(set(sel.sujeto)) & d.x.notna()].sort_values('edad_dias')
    lugar = con.etapa.replace(nombres).fillna(con.variable).astype(str)
    texto = (lugar + ': ' + con.x.map(lambda v: f'{v:g}')).groupby([con.sujeto, con.concepto]).agg(' | '.join)
    claves = list(zip(sel.sujeto, sel.concepto))
    return pd.Series([texto.get(k, '') if isinstance(k[1], str) else '' for k in claves], index=filas)


def muestra_expertos(d: pd.DataFrame, esquema: pd.DataFrame, por_capa: int = 60, control: int = 120,
                     semilla: int = 0, nombres: dict[str, str] | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """A blinded sample for expert review: alerts of every layer mixed with numeric data
    that raised nothing. Returns the sheet (no hint of which data alerted, in random order)
    and the key that says which stratum each row was drawn from. Precision per layer and
    the errors the model misses come out of the labelled sheet with ``medir_precision``.
    ``d`` is the scored data (``Resultado.datos``, or the scores saved by the last review);
    ``nombres`` the readable stage names (``sevarti.nombres_etapa``)."""
    rng = np.random.default_rng(semilla)
    alerta = d.alerta1 | d.alerta2 | d.alerta3
    usadas: set = set()
    partes = []
    for i, capa in enumerate(CAPAS, start=1):
        pool = d.index[d[f'alerta{i}'] & ~d.index.isin(list(usadas))]
        filas = rng.choice(pool, size=min(por_capa, len(pool)), replace=False)
        usadas.update(filas.tolist())
        partes.append(pd.DataFrame({'fila': filas, 'estrato': capa}))
    pool = d.index[(d.tipo == 'numeric') & d.x.notna() & ~alerta]
    partes.append(pd.DataFrame({'fila': rng.choice(pool, size=min(control, len(pool)), replace=False),
                                'estrato': 'sin alerta'}))
    clave = pd.concat(partes, ignore_index=True).sample(frac=1, random_state=semilla).reset_index(drop=True)
    clave.insert(0, 'id', np.arange(1, len(clave) + 1))
    s = d.loc[clave.fila]
    hoja = pd.DataFrame({
        'id': clave.id.to_numpy(), 'sujeto': s.sujeto.to_numpy(), 'variable': s.variable.to_numpy(),
        'etiqueta': s.variable.map(esquema.set_index('variable').etiqueta).fillna(s.variable).to_numpy(),
        'unidad': s.variable.map(esquema.set_index('variable').unidad).to_numpy(),
        'etapa': s.etapa.to_numpy(), 'fecha': s.t.dt.date.to_numpy(), 'edad_dias': s.edad_dias.to_numpy(),
        'eg_semanas': s.eg_semanas.to_numpy(), 'valor': s.valor.to_numpy(),
        'misma_medida_en_el_tiempo': _historia(d, clave.fila, nombres or {}).to_numpy(),
        'es_error': '', 'comentario': '',
    })
    clave = clave.assign(**{c: d.loc[clave.fila, f'alerta{i}'].to_numpy() for i, c in enumerate(CAPAS, start=1)})
    return hoja, clave.drop(columns='fila')


def medir_precision(hoja: pd.DataFrame, clave: pd.DataFrame) -> pd.DataFrame:
    """Share of real errors per stratum, from the sheet the experts labelled (``es_error``:
    sí / no; anything else, like "no sé", is left out). For a layer it is its precision; for
    the data without alert it is the share of errors the model let through."""
    j = clave.merge(hoja[['id', 'es_error']], on='id', how='inner')
    j['error'] = j.es_error.astype(str).str.strip().str.lower().map(RESPUESTAS)
    j = j.dropna(subset=['error'])
    filas = []
    for estrato, g in j.groupby('estrato', sort=False):
        k, n = float(g.error.sum()), len(g)
        lo, hi = wilson(k, n)
        filas.append(dict(estrato=estrato, revisados=n, errores=int(k), pct_error=100 * k / n,
                          ic95_bajo=lo, ic95_alto=hi))
    orden = [*CAPAS, 'sin alerta']
    return pd.DataFrame(filas).set_index('estrato').reindex([o for o in orden if o in set(j.estrato)])
