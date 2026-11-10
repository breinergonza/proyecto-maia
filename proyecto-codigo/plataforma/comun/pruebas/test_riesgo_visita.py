"""Riesgo por visita y primera alerta (D12, D19); claves de anticipación. Sin base de datos."""
from __future__ import annotations

import pytest

from maia_comun import analitica as AN
from maia_comun import riesgo_visita as RV


def _p(clave, orden, percentil):
    return {'clave': clave, 'momento': f'v{orden}', 'momento_nombre': f'Visita {orden}', 'orden': orden, 'percentil': percentil}


@pytest.mark.parametrize('clave, esperado', [
    ('talla_baja_12m_desde_3', ('talla_baja_12m', '3')), ('readm_6m_desde_pmc', ('readm_6m', 'pmc')),
    ('oxigeno_12m_desde_40', ('oxigeno_12m', '40')), ('readm_6m', None), ('readm_6m_desde_', None)])
def test_clave_de_familia(clave, esperado):
    assert AN.familia_desde(clave) == esperado


def test_la_primera_alerta_es_la_visita_mas_temprana_con_percentil_alto():
    puntos = [_p('a', 3, 95), _p('a', 1, 40), _p('a', 2, 91), _p('b', 1, 99)]
    assert RV.primera_alerta([p for p in puntos if p['clave'] == 'a'], 90)['orden'] == 2
    assert RV.primera_alerta([_p('a', 1, 89.9)], 90) is None
    assert RV.primera_alerta([_p('a', 1, 90)], 90)['orden'] == 1, 'el umbral entra'


def test_una_familia_junta_la_fila_base_y_las_desde_en_orden_de_visita():
    puntos = [_p('readm_6m', 3, 92), _p('readm_6m_desde_pmc', 1, 50), _p('readm_6m_desde_40', 2, 91), _p('otra', 1, 99),
              _p('readm_6m2', 1, 99)]
    r = RV.por_desenlace(puntos, 90, 'readm_6m')
    assert [p['clave'] for p in r['puntos']] == ['readm_6m_desde_pmc', 'readm_6m_desde_40', 'readm_6m']
    assert r['primera_alerta']['clave'] == 'readm_6m_desde_40'
    assert len(RV.por_desenlace(puntos, 90)['puntos']) == 5
