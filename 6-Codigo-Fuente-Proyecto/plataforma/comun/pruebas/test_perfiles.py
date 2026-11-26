"""Perfiles provisionales (D15) y perfiles reales de investigación."""
import json

import pandas as pd
import pytest

from maia_comun import perfiles as P
from maia_comun import perfiles_reales as R


@pytest.mark.parametrize('eg,esperado', [
    (24, 'extremo'), (27.9, 'extremo'), (28, 'muy_prematuro'), (31.9, 'muy_prematuro'), (32, 'moderado_tardio'),
    (36.9, 'moderado_tardio'), (37, 'a_termino'), (41, 'a_termino'), (None, None), (float('nan'), None),
    ('x', None)])
def test_categoria_eg_bordes(eg, esperado):
    assert P.categoria_eg(eg) == esperado


@pytest.mark.parametrize('v,esperado', [
    (1, 'adecuado'), (2.0, 'pequeno'), ('3', 'grande'), (4, 'pequeno'), (5, 'pequeno'), (7, 'pequeno'),
    ('PTAEG', 'adecuado'), ('PTGEG', 'grande'), ('ATBPN', 'pequeno'), (None, None), (99, None), ('??', None)])
def test_categoria_lubchenco(v, esperado):
    assert P.categoria_lubchenco(v) == esperado


def test_perfil_provisional_sin_numeros_clinicos():
    p = P.perfil_provisional(29, 2, '3 m EC')
    assert p['eg'] == 'muy_prematuro' and p['lubchenco'] == 'pequeno' and p['visita'] == '3 m EC'
    assert not any(c.isdigit() for c in p['etiqueta_corta'])
    assert P.perfil_provisional(None, None)['etiqueta_corta'] == 'Sin clasificar'
    assert P.perfil_provisional(38, None)['etiqueta_corta'] == 'A término'


def test_perfiles_por_ninos_y_resumen(sev_demo):
    por = P.perfiles_por_ninos(sev_demo)
    assert len(por) == len(sev_demo.sujetos)
    assert all(v['lubchenco'] is None for v in por.values())  # el simulador no trae Lubchenco
    res = P.resumen_perfiles(sev_demo)
    n_visibles = sum(f['n'] for f in res['eg'])
    assert 0 < n_visibles <= len(por)
    json.dumps(res)
    riesgos = pd.DataFrame({'sujeto': list(por), 'evento': [1, 0] * (len(por) // 2)})
    con_tasa = P.resumen_perfiles(sev_demo, riesgos)
    assert all(0 <= f['tasa'] <= 1 for f in con_tasa['eg'] if f['n'])


def test_resumen_da_su_cifra_a_los_grupos_pequenos(sev_demo):
    chico = sev_demo.subconjunto(list(sev_demo.sujetos.sujeto[:3]))
    filas = P.resumen_perfiles(chico)['eg']
    assert sum(f['n'] for f in filas) == 3 and all(isinstance(f['n'], int) and 'oculto' not in f for f in filas)


def test_perfil_al_nacer_reproducible_y_serializable(sev_demo):
    a = R.perfil_al_nacer(sev_demo, semilla=1)
    b = R.perfil_al_nacer(sev_demo, semilla=1)
    assert a.resumen() == b.resumen()
    json.dumps(a.resumen())
    assert a.k is not None and 2 <= a.k <= 6
    assert all(n >= R.MIN_PERFIL for n in a.tamanos) and sum(a.tamanos) == len(sev_demo.sujetos)
    assert isinstance(a.estable, bool)
    assert 'eg_semanas' in a.variables


def test_cohorte_chica_no_da_perfiles(sev_demo):
    chico = sev_demo.subconjunto(list(sev_demo.sujetos.sujeto[:30]))
    m = R.perfil_al_nacer(chico)
    assert m.k is None and not m.estable and m.motivo


def test_k_fijo_y_asignar(sev_demo):
    m = R.perfil_al_nacer(sev_demo, k=3, semilla=2)
    if m.k is None:  # con k fijo puede romperse el mínimo de 20; en el simulador no debería
        pytest.fail(m.motivo)
    assert m.k == 3
    a = R.asignar(m, m.medoides[1])
    assert a['perfil'] == 1 and a['distancia'] == pytest.approx(0) and a['probabilidad'] > 0.99
    assert sum(a['probabilidades']) == pytest.approx(1)
    assert R.asignar(m, {})['perfil'] in (0, 1, 2)  # sin datos: distancia máxima igual para todos, no falla
