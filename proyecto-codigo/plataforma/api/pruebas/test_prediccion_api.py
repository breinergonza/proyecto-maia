# ruff: noqa: F811
"""Predicción: coherencia con la historia de riesgo, roles, reserva de cifras, nada guardado y ejemplos típicos.

Reutiliza el paquete simulado y la API de ``test_api`` (corte demo de 600 niños)."""
from __future__ import annotations

import csv
import io
import json
import time

import numpy as np
import pytest
from sqlalchemy import text
from test_api import ADMIN, _login, _subir, admin, cliente, corrida, paquetes  # noqa: F401

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
    assert muestra['fuga_no_verificable'] is False     # el paquete trae la lista de niños con que se entrenó
    assert isinstance(muestra['en_entrenamiento'], int) and muestra['n_entrenamiento'] > 0
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


# ------------------------------------------------------------------ fuga de entrenamiento real

def test_fuga_cuenta_y_excluye_a_los_entrenados(cliente, admin, muestra):
    dentro = muestra['en_entrenamiento']
    assert 0 <= dentro <= muestra['n_filtro']
    r = cliente.post('/api/prediccion/muestra', headers=admin, json={'excluir_entrenamiento': True}).json()
    assert r['excluidos'] == dentro and r['n_filtro'] == muestra['n_filtro'] - dentro
    # los códigos que se quedaron fuera son justamente los de la lista del paquete
    from maia_api import estado as E
    from maia_comun import db
    from maia_comun import prediccion_trabajos as PT
    base = E.activo()[2] / 'sevarti_base'
    entrenados = PT.leer_entrenados(base)
    assert entrenados and len(entrenados) == muestra['n_entrenamiento']
    with db.motor().connect() as cx:
        todos = {x[0] for x in cx.execute(text('SELECT sujeto FROM sevarti.sujetos'))}
    assert len(todos & entrenados) == dentro


def test_paquete_sin_lista_sigue_siendo_no_verificable(cliente, admin, muestra, monkeypatch):
    from maia_comun import prediccion_trabajos as PT
    monkeypatch.setattr(PT, 'leer_entrenados', lambda base: None)
    r = cliente.post('/api/prediccion/muestra', headers=admin, json={'excluir_entrenamiento': True}).json()
    assert r['fuga_no_verificable'] is True and r['en_entrenamiento'] is None and r['excluidos'] == 0
    assert r['n_filtro'] == muestra['n_filtro']


# ------------------------------------------------------------------ cálculo asíncrono

def _esperar(cliente, h, tid: str | int, limite: float = 300) -> dict:
    t0 = time.time()
    while time.time() - t0 < limite:
        d = cliente.get(f'/api/prediccion/trabajos/{tid}', headers=h).json()
        if d['estado'] in ('ok', 'error'):
            return d
        time.sleep(0.5)
    raise AssertionError('el cálculo no terminó')


def test_trabajo_asincrono_coincide_con_el_sincrono(cliente, admin, experto, muestra):
    r = cliente.post('/api/prediccion/trabajos', headers=admin, json={})
    assert r.status_code == 202, r.text
    tid = r.json()['id']
    assert r.json()['tipo'] == 'universo' and r.json()['estado'] in ('pendiente', 'en_curso')
    # uno a la vez
    assert cliente.post('/api/prediccion/trabajos', headers=admin, json={}).status_code == 409
    d = _esperar(cliente, admin, tid)
    assert d['estado'] == 'ok' and d['progreso'] == 100 and d['tabla_disponible'] is True
    res = d['resultado']
    assert res['insuficiente'] is False and res['agregados']['n_puntuados'] == muestra['agregados']['n_puntuados']
    assert res['agregados']['niveles'] == muestra['agregados']['niveles']
    assert res['fuga_no_verificable'] is False and 'aviso_corte' in res
    # riesgo por visita: celdas con su n y las chicas sin cifras
    assert res['por_visita'] and all({'n', 'oculta', 'momento_nombre', 'orden'} <= set(c) for c in res['por_visita'])
    assert all(c['riesgo_mediano'] is None for c in res['por_visita'] if c['oculta'])
    assert any(not c['oculta'] and 0 <= c['pct_altos'] <= 100 for c in res['por_visita'])
    # la primera página es la de la muestra síncrona: mismos niños, mismo riesgo
    p1 = cliente.get(f'/api/prediccion/trabajos/{tid}/tabla', headers=admin).json()
    assert p1['total'] == muestra['tabla']['total'] and p1['pagina'] == 1 and len(p1['filas']) <= 200
    assert [f['sujeto'] for f in p1['filas'][:20]] == [f['sujeto'] for f in muestra['tabla']['filas'][:20]]
    assert p1['filas'][0]['riesgo'] == pytest.approx(muestra['tabla']['filas'][0]['riesgo'], abs=1e-5)
    assert all(f['perfil'] for f in p1['filas'])
    # el historial
    assert tid in [t['id'] for t in cliente.get('/api/prediccion/trabajos', headers=admin).json()]
    # no es de otra persona
    assert cliente.get(f'/api/prediccion/trabajos/{tid}', headers=experto).status_code == 404
    assert cliente.get(f'/api/prediccion/trabajos/{tid}/tabla', headers=experto).status_code == 404


def test_trabajo_pagina_la_tabla_y_no_guarda_ninos(cliente, admin, muestra):
    tid = cliente.post('/api/prediccion/trabajos', headers=admin, json={}).json()['id']
    d = _esperar(cliente, admin, tid)
    assert d['estado'] == 'ok'
    total = d['resultado']['tabla_total']
    p = cliente.get(f'/api/prediccion/trabajos/{tid}/tabla', headers=admin, params={'pagina': 2, 'limite': 7}).json()
    assert p['pagina'] == 2 and p['limite'] == 7 and p['total'] == total and p['paginas'] == -(-total // 7)
    assert len(p['filas']) == 7
    uno = cliente.get(f'/api/prediccion/trabajos/{tid}/tabla', headers=admin, params={'pagina': 1, 'limite': 7}).json()
    assert not {f['sujeto'] for f in uno['filas']} & {f['sujeto'] for f in p['filas']}
    ultima = cliente.get(f'/api/prediccion/trabajos/{tid}/tabla', headers=admin,
                         params={'pagina': p['paginas'] + 1, 'limite': 7}).json()
    assert ultima['filas'] == []
    assert cliente.get(f'/api/prediccion/trabajos/{tid}/tabla', headers=admin, params={'limite': 201}).status_code == 422
    # en la base quedan solo agregados: ni un código de niño
    from maia_comun import db
    with db.motor().connect() as cx:
        fila = cx.execute(text('SELECT agregados::text, parametros::text FROM resultados.predicciones WHERE id = :i'),
                          {'i': tid}).one()
    assert uno['filas'][0]['sujeto'] not in fila[0] + fila[1]
    # pasada la hora (la memoria se vació), la tabla se pide de nuevo
    from maia_comun import prediccion_trabajos as PT
    PT.RESULTADOS.vaciar()
    assert cliente.get(f'/api/prediccion/trabajos/{tid}/tabla', headers=admin).status_code == 410
    assert cliente.get(f'/api/prediccion/trabajos/{tid}', headers=admin).json()['tabla_disponible'] is False


def test_trabajo_con_muestra_chica_no_da_cifras_y_los_errores_se_reportan(cliente, admin, experto, muestra):
    chica = {'version': 2, 'y': [{'variable': 'eg_semanas', 'tipo': 'numero', 'op': 'entre', 'valores': [22, 22]}]}
    tid = cliente.post('/api/prediccion/trabajos', headers=admin, json={'muestra': chica}).json()['id']
    d = _esperar(cliente, admin, tid)
    assert d['estado'] == 'ok' and d['tipo'] == 'muestra'
    assert d['resultado']['insuficiente'] is True and 'agregados' not in d['resultado']
    assert cliente.get(f'/api/prediccion/trabajos/{tid}/tabla', headers=admin).status_code == 410
    # validaciones al lanzar
    assert cliente.post('/api/prediccion/trabajos', headers=admin, json={'visita': 'no-existe'}).status_code == 422
    assert cliente.post('/api/prediccion/trabajos', headers=admin, json={'modelo': 'no-existe'}).status_code == 404
    assert cliente.post('/api/prediccion/trabajos', headers=admin, json={'muestra_id': 999999}).status_code == 404
    assert cliente.post('/api/prediccion/trabajos').status_code == 401


def test_trabajo_interrumpido_se_marca_con_error(cliente, admin):
    from maia_comun import db
    with db.motor().begin() as cx:
        i = cx.execute(text("INSERT INTO resultados.predicciones (tipo, estado, parametros, usuario_id) "
                            "VALUES ('universo', 'en_curso', '{}', (SELECT id FROM app.usuarios WHERE rol = 'admin' LIMIT 1)) "
                            "RETURNING id")).scalar_one()
    d = cliente.get(f'/api/prediccion/trabajos/{i}', headers=admin).json()
    assert d['estado'] == 'error' and 'reinició' in d['mensaje']


def test_trabajo_deja_auditoria_sin_contenido(cliente, admin, muestra):
    from maia_comun import db
    with db.motor().connect() as cx:
        detalle = cx.execute(text("SELECT detalle FROM app.auditoria WHERE accion = 'prediccion.trabajo' "
                                  "AND (detalle->>'n')::int > 20 ORDER BY id DESC LIMIT 1")).scalar_one()
    assert detalle['n'] > 20 and len(detalle['huella']) == 64 and 'id' in detalle


# ------------------------------------------------------------------ niños nuevos guardados

def _nino_cuerpo(cliente, experto, **extra) -> dict:
    lista = cliente.get('/api/prediccion/ejemplos', headers=experto).json()
    return {'visita': lista['visitas'][-1]['etapa'], 'perfil': 'a_termino', **extra}


def test_guardar_nino_nuevo_y_plantilla(cliente, admin, experto, muestra):
    from maia_comun import db
    with db.motor().connect() as cx:
        antes = cx.execute(text('SELECT count(*) FROM sevarti.sujetos')).scalar_one()
    cuerpo = _nino_cuerpo(cliente, experto)
    campos = cliente.get('/api/prediccion/ejemplos', headers=experto,
                         params={'visita': cuerpo['visita'], 'perfil': 'a_termino'}).json()['campos']
    variable = next(c['variable'] for c in campos if c['tipo'] == 'numero')
    r = cliente.post('/api/prediccion/ninos-nuevos', headers=experto,
                     json={**cuerpo, 'cambios': {variable: 1}, 'titulo': 'Mi niño', 'descripcion': 'prueba'})
    assert r.status_code == 201, r.text
    g = r.json()
    assert g['tipo'] == 'nino' and g['perfil'] == 'a_termino' and g['cambios'] == {variable: 1} and g['propio'] is True
    assert g['valores'][variable] == 1 and 'riesgos' in g['resultado'] and g['resultado']['perfil']['eg']
    pl = cliente.post('/api/prediccion/ninos-nuevos', headers=experto,
                      json={**cuerpo, 'titulo': 'Plantilla a término', 'tipo': 'plantilla'})
    assert pl.status_code == 201 and pl.json()['cambios'] == {}
    # nunca se mezcla con el corte oficial
    with db.motor().connect() as cx:
        assert cx.execute(text('SELECT count(*) FROM sevarti.sujetos')).scalar_one() == antes
        assert cx.execute(text('SELECT count(*) FROM app.ninos_nuevos')).scalar_one() >= 2
    # el niño es de su dueño (y de administración); la plantilla es de todos los expertos
    de_admin = {n['id'] for n in cliente.get('/api/prediccion/ninos-nuevos', headers=admin).json()}
    assert g['id'] in de_admin and pl.json()['id'] in de_admin
    otro = {'email': 'experto-pred2@maia.prueba', 'nombre': 'Otra experta', 'rol': 'experto', 'clave': 'clave-experto-larga-2'}
    assert cliente.post('/api/usuarios', headers=admin, json=otro).status_code == 201
    h2 = _login(cliente, otro['email'], otro['clave'])
    vistos = {n['id']: n for n in cliente.get('/api/prediccion/ninos-nuevos', headers=h2).json()}
    assert pl.json()['id'] in vistos and g['id'] not in vistos
    assert vistos[pl.json()['id']]['propio'] is False and vistos[pl.json()['id']]['dueno'] == 'Experta'
    assert cliente.get(f'/api/prediccion/ninos-nuevos/{g["id"]}', headers=h2).status_code == 404
    assert cliente.get(f'/api/prediccion/ninos-nuevos/{pl.json()["id"]}', headers=h2).status_code == 200
    assert cliente.delete(f'/api/prediccion/ninos-nuevos/{pl.json()["id"]}', headers=h2).status_code == 403
    only = cliente.get('/api/prediccion/ninos-nuevos', headers=experto, params={'tipo': 'plantilla'}).json()
    assert [n['tipo'] for n in only] and set(n['tipo'] for n in only) == {'plantilla'}
    # se puede volver a calcular con lo guardado y borrar
    det = cliente.get(f'/api/prediccion/ninos-nuevos/{g["id"]}', headers=experto).json()
    again = cliente.post('/api/prediccion/nino', headers=experto,
                         json={'visita': det['visita'], 'perfil': det['perfil'], 'cambios': det['cambios']})
    assert again.status_code == 200 and again.json()['cambiados'] == [variable]
    assert cliente.delete(f'/api/prediccion/ninos-nuevos/{g["id"]}', headers=experto).status_code == 204
    assert cliente.get(f'/api/prediccion/ninos-nuevos/{g["id"]}', headers=experto).status_code == 404
    assert cliente.delete(f'/api/prediccion/ninos-nuevos/{pl.json()["id"]}', headers=admin).status_code == 204


def test_guardar_nino_pide_titulo_perfil_y_rol(cliente, admin, experto, muestra):
    cuerpo = _nino_cuerpo(cliente, experto)
    assert cliente.post('/api/prediccion/ninos-nuevos', headers=experto, json=cuerpo).status_code == 422   # sin título
    assert cliente.post('/api/prediccion/ninos-nuevos', headers=experto,
                        json={**cuerpo, 'titulo': 'x', 'perfil': 'no-existe'}).status_code == 422
    assert cliente.post('/api/prediccion/ninos-nuevos', json={**cuerpo, 'titulo': 'x'}).status_code == 401
