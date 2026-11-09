# ruff: noqa: F811
"""Predicción: coherencia con la historia de riesgo, roles, reserva de cifras, nada guardado y ejemplos típicos.

Reutiliza el paquete simulado y la API de ``test_api`` (corte demo de 600 niños)."""
from __future__ import annotations

import csv
import io
import json

import numpy as np
import pytest
from sqlalchemy import text
from test_api import ADMIN, _login, _subir, admin, cliente, corrida, paquetes, smtp  # noqa: F401

pytestmark = [pytest.mark.integracion, pytest.mark.timeout(1800)]

TABLAS_RESULTADOS = ('riesgos', 'alertas_dato', 'crecimiento', 'alarmas_grupo')
EXPERTO = ('experto-pred@maia.prueba', 'clave-experto-larga-1')


@pytest.fixture(scope='module')
def listo(cliente, admin, paquetes):  # noqa: F811
    r = _subir(cliente, admin, paquetes['valido'])
    assert r.status_code == 200, r.text
    assert cliente.post(f'/api/modelos/paquetes/{r.json()["version"]}/activar', headers=admin).status_code == 200
    r = cliente.post('/api/usuarios', headers=admin, json={'email': EXPERTO[0], 'nombre': 'Experta', 'rol': 'experto',
                                                           'clave': EXPERTO[1]})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture(scope='module')
def experto(cliente, listo):
    return _login(cliente, *EXPERTO)


@pytest.fixture(scope='module')
def muestra(cliente, admin, listo, corrida):  # noqa: F811
    r = cliente.post('/api/prediccion/muestra', headers=admin, json={})
    assert r.status_code == 200, r.text
    return r.json()


def _filas_resultados() -> dict[str, int]:
    from maia_comun import db
    with db.motor().connect() as cx:
        return {t: cx.execute(text(f'SELECT count(*) FROM resultados.{t}')).scalar_one() for t in TABLAS_RESULTADOS}


def test_modelos_usables(cliente, experto, listo, corrida):  # noqa: F811
    r = cliente.get('/api/prediccion/modelos', headers=experto)
    assert r.status_code == 200
    activos = [m for m in r.json()['modelos'] if m['activo']]
    assert len(activos) == 1 and activos[0]['origen'] == 'oficial' and 'corte_anterior' in activos[0]
    assert cliente.get('/api/prediccion/modelos').status_code == 401


def test_muestra_agregados_y_tabla(muestra):
    assert muestra['insuficiente'] is False and muestra['guardado'] is False
    ag = muestra['agregados']
    assert ag['n_puntuados'] > 20 and len(ag['deciles']) == 9
    assert sum(b['n'] for b in ag['histograma']) == ag['n_puntuados']
    niv = ag['niveles']
    assert niv['muy_alto'] + niv['alto'] + niv['resto'] == ag['n_puntuados']
    assert muestra['fuga_no_verificable'] is True      # el paquete no trae la lista de niños del entrenamiento
    filas = muestra['tabla']['filas']
    assert 0 < len(filas) <= 200 and muestra['tabla']['total'] == ag['n_puntuados']
    assert [f['percentil'] for f in filas] == sorted((f['percentil'] for f in filas), reverse=True)
    assert all(f['perfil'] for f in filas)


def test_coherente_con_la_historia_de_riesgo(cliente, admin, muestra):
    for fila in muestra['tabla']['filas'][:3]:
        h = cliente.get(f'/api/ninos/{fila["sujeto"]}/historia-riesgo', headers=admin).json()
        punto = next(p for p in h['puntos'] if p['clave'] == fila['clave'] and p['momento'] == fila['momento'])
        assert fila['riesgo'] == pytest.approx(punto['riesgo'], abs=1e-6)
        assert fila['percentil'] == pytest.approx(punto['percentil'], abs=1e-4)
    # la misma visita pedida explícitamente da el mismo riesgo
    fila = muestra['tabla']['filas'][0]
    r = cliente.post('/api/prediccion/muestra', headers=admin, json={'visita': fila['momento']}).json()
    igual = [f for f in r['tabla']['filas'] if f['sujeto'] == fila['sujeto'] and f['clave'] == fila['clave']]
    assert igual and igual[0]['riesgo'] == pytest.approx(fila['riesgo'], abs=1e-6)


def test_roles_y_csv_solo_admin(cliente, admin, experto, muestra):
    visor = {'email': 'visor-pred@maia.prueba', 'nombre': 'Visor', 'rol': 'visualizador', 'clave': 'clave-larga-123'}
    assert cliente.post('/api/usuarios', headers=admin, json=visor).status_code == 201
    cab = _login(cliente, visor['email'], visor['clave'])
    assert cliente.post('/api/prediccion/muestra', headers=cab, json={}).status_code == 403
    assert cliente.post('/api/prediccion/muestra', headers=experto, json={}).status_code == 200
    assert cliente.get('/api/prediccion/muestra/csv', headers=experto).status_code == 403
    r = cliente.get('/api/prediccion/muestra/csv', headers=admin)
    assert r.status_code == 200 and r.headers['content-type'].startswith('text/csv')
    filas = list(csv.reader(io.StringIO(r.text.lstrip('﻿'))))
    assert filas[0][:3] == ['sujeto', 'desenlace', 'visita'] and len(filas) > 21
    from maia_comun import db
    with db.motor().connect() as cx:
        detalle = cx.execute(text("SELECT detalle FROM app.auditoria WHERE accion = 'prediccion.csv' "
                                  "ORDER BY id DESC LIMIT 1")).scalar_one()
    assert detalle['n'] > 20 and len(detalle['huella']) == 64
    assert filas[1][0] not in json.dumps(detalle)


def test_menos_de_20_ninos_no_da_cifras(cliente, admin, muestra):
    chica = {'version': 2, 'y': [{'variable': 'eg_semanas', 'tipo': 'numero', 'op': 'entre', 'valores': [22, 22]}]}
    r = cliente.post('/api/prediccion/muestra', headers=admin, json={'muestra': chica})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['insuficiente'] is True and 'agregados' not in d and 'tabla' not in d
    assert cliente.get('/api/prediccion/muestra/csv', headers=admin,
                       params={'muestra': json.dumps(chica)}).status_code == 422


def test_no_guarda_predicciones(cliente, admin, experto, muestra):
    antes = _filas_resultados()
    assert cliente.post('/api/prediccion/muestra', headers=experto, json={}).status_code == 200
    assert cliente.get('/api/prediccion/muestra/csv', headers=admin).status_code == 200
    ej = cliente.get('/api/prediccion/ejemplos', headers=experto).json()
    v = ej['visitas'][0]['etapa']
    assert cliente.post('/api/prediccion/nino', headers=experto, json={'visita': v, 'perfil': 'a_termino'}).status_code == 200
    assert _filas_resultados() == antes


def test_ejemplos_con_valores_tipicos(cliente, experto, muestra):
    from maia_api.poblacion import corte_actual
    from maia_api.rutas import prediccion as P
    from maia_comun import db
    lista = cliente.get('/api/prediccion/ejemplos', headers=experto).json()
    assert {p['perfil'] for p in lista['perfiles']} >= {'extremo', 'a_termino', 'adecuado', 'pequeno'}
    perfil = max(lista['perfiles'], key=lambda p: p['n'])
    assert not perfil['insuficiente']
    ultima = lista['visitas'][-1]['etapa']
    r = cliente.get('/api/prediccion/ejemplos', headers=experto, params={'visita': ultima, 'perfil': perfil['perfil']})
    assert r.status_code == 200, r.text
    ej = r.json()
    assert ej['insuficiente'] is False and ej['n'] == perfil['n'] and ej['campos']
    # una variable numérica trae la mediana de los niños del subgrupo, no el punto medio del diccionario
    numerico = next(c for c in ej['campos'] if c['tipo'] == 'numero' and c['n'] >= 20)
    with db.fabrica()() as s:
        c = corte_actual(s)
        ids = P._ids_subgrupo(s, c.id, perfil['perfil'])
        valores = [r[0] for r in s.execute(text('SELECT valor_num FROM sevarti.atributos_sujeto WHERE corte_id = :c '
                                                'AND variable = :v AND sujeto = ANY(:i) AND valor_num IS NOT NULL'),
                                           {'c': c.id, 'v': numerico['variable'], 'i': ids})]
    mediana = float(np.median(valores))
    assert numerico['valor'] == pytest.approx(round(mediana) if abs(mediana) >= 100 else round(mediana, 2))
    assert numerico['tipico'] is True


def test_nino_nuevo(cliente, experto, muestra):
    lista = cliente.get('/api/prediccion/ejemplos', headers=experto).json()
    visita = lista['visitas'][-1]['etapa']
    r = cliente.post('/api/prediccion/nino', headers=experto, json={'visita': visita, 'perfil': 'a_termino'})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d['guardado'] is False and d['insuficiente'] is False
    assert d['perfil']['eg'] and d['linea_alerta'] == 90
    assert d['trayectoria'] and all({'riesgo', 'percentil', 'momento_nombre'} <= set(t) for t in d['trayectoria'])
    # lo que se cambia se marca como cambiado
    campos = cliente.get('/api/prediccion/ejemplos', headers=experto,
                         params={'visita': visita, 'perfil': 'a_termino'}).json()['campos']
    variable = next(c['variable'] for c in campos if c['tipo'] == 'numero')
    r2 = cliente.post('/api/prediccion/nino', headers=experto,
                      json={'visita': visita, 'perfil': 'a_termino', 'cambios': {variable: 1}})
    assert r2.status_code == 200 and r2.json()['cambiados'] == [variable]
