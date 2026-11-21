# ruff: noqa: F811
"""Riesgo por corte (S7): el riesgo de cada familia de desenlaces en cada visita a la que fue el niño, calculado solo con
lo medido hasta esa visita, en la ficha (``/ninos/{s}/historia-riesgo``) y en «Calcular un niño» (``/inferencia``).

Reutiliza el paquete simulado y la API de ``test_api``. La anticipación está encendida por defecto (D68): el paquete trae
las filas ``_desde_`` y cada familia tiene más de un corte."""
from __future__ import annotations

import pytest
from test_api import _subir, admin, cliente, corrida, paquetes  # noqa: F401

pytestmark = [pytest.mark.integracion, pytest.mark.timeout(1800)]

ESTADOS = {'en_uso', 'en_prueba'}


@pytest.fixture(scope='module')
def listo(cliente, admin, paquetes):  # noqa: F811
    """El paquete simulado (con anticipación) subido y activo, antes de la corrida."""
    r = _subir(cliente, admin, paquetes['valido'])
    assert r.status_code == 200, r.text
    assert cliente.post(f'/api/modelos/paquetes/{r.json()["version"]}/activar', headers=admin).status_code == 200
    return r.json()


def _historia(cliente, admin, sujeto: str, **params) -> dict:
    r = cliente.get(f'/api/ninos/{sujeto}/historia-riesgo', headers=admin, params=params)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope='module')
def nino(cliente, admin, listo, corrida):  # noqa: F811
    return cliente.get('/api/ninos', headers=admin, params={'orden': 'percentil_max', 'tamano': 1}).json()['items'][0]['sujeto']


def test_la_historia_trae_las_familias_del_paquete_con_sus_cortes(cliente, admin, nino):
    h = _historia(cliente, admin, nino)
    familias = {f['clave']: f for f in h['familias']}
    # la anticipación suma filas _desde_: «desarrollo_12m» se predice desde cuatro visitas, no desde una
    desarrollo = familias['desarrollo_12m']
    assert [c['clave'] for c in desarrollo['cortes']] == ['desarrollo_12m_desde_pmc', 'desarrollo_12m_desde_40',
                                                         'desarrollo_12m_desde_3', 'desarrollo_12m']
    assert [c['orden'] for c in desarrollo['cortes']] == sorted(c['orden'] for c in desarrollo['cortes'])
    assert [c['estado'] for c in desarrollo['cortes']] == ['en_prueba', 'en_prueba', 'en_prueba', 'en_uso']
    # la talla baja solo tiene filas _desde_: toda la familia está «En prueba»
    assert familias['talla_baja_12m']['estado'] == 'en_prueba'
    assert desarrollo['estado'] == 'en_uso' and 'desarrollo' in desarrollo['nombre'].lower()
    assert '(riesgo calculado' not in desarrollo['nombre']
    assert desarrollo['definicion'].startswith('Resultado por debajo del percentil 10')
    # el nombre y el estado de cada corte vienen del paquete; cada punto dice si su desenlace está en uso o en prueba
    assert all(c['momento_nombre'] for f in h['familias'] for c in f['cortes'])
    assert all(p['estado'] == ('en_prueba' if '_desde_' in p['clave'] else 'en_uso') for p in h['puntos'])
    assert {f['estado'] for f in h['familias']} <= ESTADOS


def test_la_historia_dice_con_que_modelo_se_calculo(cliente, admin, nino):
    h = _historia(cliente, admin, nino)
    assert h['modelo']['version'] and h['modelo']['entrenado'] and h['modelo']['corte_datos']
    assert h['paquete'] == cliente.get('/api/modelos/activo', headers=admin).json()['version']
    calibrados = [c['calibrado_con'] for f in h['familias'] for c in f['cortes'] if c['motivo_sin_riesgo'] is None]
    assert calibrados and all(c.startswith('nacidos de ') for c in calibrados)


def test_lo_que_mas_peso_solo_se_pide_y_no_cambia_el_riesgo(cliente, admin, nino):
    sin = _historia(cliente, admin, nino)
    con = _historia(cliente, admin, nino, motivos='true')
    assert all('motivos' not in p for p in sin['puntos'])   # lo que ya consume la web no cambia
    assert con['puntos'] and all(isinstance(p['motivos'], list) for p in con['puntos'])
    assert any(p['motivos'] for p in con['puntos'])
    assert [{k: v for k, v in p.items() if k != 'motivos'} for p in con['puntos']] == sin['puntos']


def test_un_corte_sin_riesgo_dice_por_que(cliente, admin, listo, corrida):
    sin_visita = None
    for item in cliente.get('/api/ninos', headers=admin, params={'tamano': 80}).json()['items']:
        h = _historia(cliente, admin, item['sujeto'])
        con_riesgo = {p['clave'] for p in h['puntos']}
        for f in h['familias']:
            for c in f['cortes']:
                # un corte tiene riesgo o dice por qué no, nunca las dos cosas ni ninguna
                assert (c['clave'] in con_riesgo) == (c['motivo_sin_riesgo'] is None), (item['sujeto'], c)
                if c['motivo_sin_riesgo'] == 'no_asistio':
                    sin_visita = (item['sujeto'], c)
        if sin_visita:
            break
    assert sin_visita, 'con 80 niños alguno no fue a todas las visitas'
    sujeto, corte = sin_visita
    visitas = cliente.get(f'/api/ninos/{sujeto}/linea-temporal', headers=admin).json()['visitas']
    # no hay datos fechados de esa visita: por eso no hay riesgo desde ella
    assert not [v for v in visitas if v['etapa'] == corte['momento'] and v['mediciones']]


# ------------------------------------------------------------------ «Calcular un niño»: sin datos de después de cada corte

def _hasta(peticion: dict, formulario: dict, orden: int) -> dict:
    """La misma petición con solo lo de las visitas hasta ``orden`` (y lo general): como si el niño no hubiera vuelto."""
    despues = {c['variable'] for v in formulario['visitas'] if v['orden'] > orden for c in v['campos']}
    return {**peticion, 'mediciones': [m for m in peticion['mediciones'] if m['variable'] not in despues]}


@pytest.fixture(scope='module')
def ejemplo(cliente, admin, listo, corrida):
    peticion = cliente.get('/api/inferencia/ejemplo', headers=admin).json()
    peticion.pop('nota')
    return peticion, cliente.get('/api/inferencia/formulario', headers=admin).json()


def _inferir(cliente, admin, peticion: dict) -> dict:
    r = cliente.post('/api/inferencia', headers=admin, json=peticion)
    assert r.status_code == 200, r.text
    return r.json()


def test_calcular_un_nino_trae_el_riesgo_de_cada_corte(cliente, admin, ejemplo):
    peticion, formulario = ejemplo
    h = _inferir(cliente, admin, peticion)['historia']
    assert h['modelo']['version'] and {f['clave'] for f in h['familias']} == {'desarrollo_12m', 'talla_baja_12m'}
    assert h['puntos'] and all(isinstance(p['motivos'], list) for p in h['puntos'])
    # el riesgo de la última visita es el que ya devolvía /inferencia
    ultimo = max(p['orden'] for p in h['puntos'])
    de_siempre = {r['clave']: r['riesgo'] for r in _inferir(cliente, admin, peticion)['riesgos']}
    en_la_ultima = {p['clave']: p['riesgo'] for p in h['puntos'] if p['orden'] == ultimo}
    assert en_la_ultima == pytest.approx({k: v for k, v in de_siempre.items() if k in en_la_ultima})


def test_un_corte_nunca_usa_datos_posteriores(cliente, admin, ejemplo):
    """Quitar lo que se midió después de un corte no cambia el riesgo de ese corte ni de los anteriores."""
    peticion, formulario = ejemplo
    completo = _inferir(cliente, admin, peticion)['historia']['puntos']
    cortes = sorted({p['orden'] for p in completo})
    assert len(cortes) >= 2, 'el niño de ejemplo tiene riesgos desde más de una visita'
    por_corte = {(p['clave'], p['orden']): p['riesgo'] for p in completo}
    for corte in cortes[:-1]:
        parcial = _inferir(cliente, admin, _hasta(peticion, formulario, corte))['historia']['puntos']
        assert parcial and max(p['orden'] for p in parcial) <= corte, 'sin visitas posteriores no hay riesgos posteriores'
        for p in parcial:
            assert p['riesgo'] == pytest.approx(por_corte[(p['clave'], p['orden'])], abs=1e-9), (corte, p['clave'])


def test_con_varios_ninos_no_hay_riesgo_por_corte(cliente, admin, ejemplo):
    peticion, _ = ejemplo
    otro = {**peticion['sujetos'][0], 'sujeto': 'calculo-2'}
    doble = {**peticion, 'sujetos': [*peticion['sujetos'], otro],
             'mediciones': [*peticion['mediciones'], *({**m, 'sujeto': 'calculo-2'} for m in peticion['mediciones'])]}
    assert _inferir(cliente, admin, doble).get('historia') is None   # la vista compara un niño, no una tanda
