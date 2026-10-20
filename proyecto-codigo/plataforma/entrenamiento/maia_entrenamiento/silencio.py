"""Periodo en silencio retrospectivo: el modelo clínico como si se hubiera entrenado en una fecha pasada.

1. Se recorta la base a lo que se sabía en ``fecha`` (niños nacidos hasta entonces, datos anotados hasta entonces).
2. Se entrena el modelo clínico con ese recorte y se calculan los riesgos de los niños que esperaban su siguiente
   visita en esa fecha (los mismos a quienes se les habría avisado).
3. Se comparan esos riesgos con lo que pasó después, según la base completa (``clinico.modelo.comparar_silencio``).

El periodo en silencio real (prospectivo) necesita una carga nueva de la base; este lo aproxima con la historia.
"""
from __future__ import annotations

from dataclasses import replace

import numpy as np
import pandas as pd

from clinico import modelo as AC
from sevarti.contrato import Sevarti, nacimiento_referencia


def recortar(sev: Sevarti, fecha: pd.Timestamp) -> Sevarti:
    """La base como estaba en ``fecha``: nada nacido ni anotado después."""
    suj = sev.sujetos.drop_duplicates('sujeto').set_index('sujeto')
    nac = nacimiento_referencia(suj)
    vivos = nac.index[(nac <= fecha).to_numpy()]
    s = sev.subconjunto(vivos)
    m = s.mediciones
    fechas = pd.to_datetime(m.fecha, errors='coerce')
    m = m[fechas.isna() | (fechas <= fecha)]
    e = s.episodios
    if not e.empty:
        fin = nac.reindex(e.sujeto).to_numpy() + pd.to_timedelta(pd.to_numeric(e.edad_fin, errors='coerce'), unit='D')
        e = e[pd.isna(fin) | (fin <= fecha)]
    q = s.quiebres[pd.to_datetime(s.quiebres.fecha) <= fecha]
    return replace(s, mediciones=m, episodios=e, quiebres=q, corte=fecha)


def correr(sev: Sevarti, cfg: AC.ConfigClinica, fecha: pd.Timestamp) -> tuple[pd.DataFrame, pd.DataFrame, AC.ModeloClinico]:
    """Devuelve (comparación por desenlace, predicciones guardadas, modelo del pasado)."""
    pasado = recortar(sev, fecha)
    modelo = AC.ModeloClinico(cfg)
    tardias = modelo.detectar_tardias(pasado)
    modelo = modelo.ajustar(pasado, progreso=True, tardias=tardias)
    p_pasado = modelo.preparar(pasado)
    predicciones = modelo.riesgos(p_pasado, con_motivos=False)
    if predicciones.empty:
        return pd.DataFrame(), predicciones, modelo
    p_hoy = modelo.preparar(sev)
    comparacion = AC.comparar_silencio(modelo, p_hoy, predicciones)
    if not comparacion.empty:
        comparacion['razon_riesgo_observado'] = np.where(comparacion.observado > 0,
                                                         comparacion.riesgo_medio / comparacion.observado, np.nan)
    return comparacion, predicciones, modelo
