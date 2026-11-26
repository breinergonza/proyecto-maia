"""The simulated cohort reaches the extraction date like the real base: some children are still at their first
follow-up visit, so the demo can show the risk calculated at 40 weeks. Ningún dato es de pacientes."""
from __future__ import annotations

import pandas as pd

from maia_comun import simulados


def test_hay_ninos_que_fueron_a_40_semanas_y_aun_esperan_la_de_3_meses():
    sev = simulados.simular(2000, 3)
    m = sev.mediciones.merge(sev.esquema[['variable', 'etapa']], on='variable')
    fueron = set(m[m.etapa == '40 sem'].sujeto)
    s = sev.sujetos.set_index('sujeto')
    edad_corregida = (sev.corte - s.fecha_nacimiento).dt.days - (40 - s.eg_semanas) * 7
    fin_3m = sev.etapas.set_index('etapa').edad_max['3 m EC']  # last day of the 3-month window
    esperan = edad_corregida[(edad_corregida <= fin_3m) & s.index.isin(fueron)]
    assert len(esperan) >= 20, 'la demo necesita niños pendientes en la visita de 40 semanas'


def test_los_nacimientos_cubren_los_14_anios_previos_al_corte():
    sev = simulados.simular(2000, 3)
    nac = sev.sujetos.fecha_nacimiento
    assert nac.max() <= sev.corte
    assert nac.max() >= sev.corte - pd.Timedelta(days=30)
    assert nac.min() >= sev.corte - pd.DateOffset(years=14) - pd.Timedelta(days=4)
