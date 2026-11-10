"""Calibración (hist_riesgo), Población (distribuciones muestra/universo) y Comparar con réplicas, por la API."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import select

# la API, los usuarios, el corte simulado y la corrida sintética son los de las pruebas de Explorar
from test_exploracion_api import _corrida, cliente, corte, sev, tokens  # noqa: F401
from test_muestras_api import _muestra, _y

pytestmark = pytest.mark.integracion


def _guardar(semilla: int, mejora: float = 0.0, con_extras: bool = True) -> int:
    from maia_comun import analitica as AN
    from maia_comun import analitica_distribuciones as AD
    from maia_entrenamiento import analitica_clinica as AL
    rng = np.random.default_rng(semilla)
    n = 1500
    puntaje = rng.normal(size=n)
    y = rng.random(n) < 1 / (1 + np.exp(-(puntaje - 2)))
    r = 1 / (1 + np.exp(-(puntaje * (1 - mejora) + rng.normal(size=n) * mejora * 3 - 2)))
    sexo = pd.Series(np.where(np.arange(n) % 2 == 0, 'femenino', 'masculino'), index=[f'N{i}' for i in range(n)])
    res = AN.analizar(r, y, grupos={'sexo': pd.Series(sexo.to_numpy())}, variables=pd.DataFrame({'x': puntaje}),
                      importancias={'x': 1.0})
    if con_extras:
        res.update(AD.artefactos_extra(y, r, sexo.index[: n * 2 // 3], {'categorias': {'sexo': sexo}}))
    return AL.guardar({'readm_3m': res}, [{'clave': 'readm_3m', 'nombre': 'readmisión', 'momento': '40 sem',
                                         'etiqueta': 'En uso'}],
                      {'fuente': 'simulado', 'registro': 'maia-clinico-demo', 'version_registro': str(semilla),
                       'version_modelo': 'abc', 'corte': '2026-06-30'})


@pytest.fixture(scope='module')
def entrenamientos(cliente):  # noqa: F811
    return {'a': _guardar(11), 'b': _guardar(12, mejora=0.9), 'viejo': _guardar(13, con_extras=False)}


@pytest.fixture(scope='module')
def corrida(cliente, corte, sev):  # noqa: F811
    return _corrida(corte, list(sev.sujetos.sujeto))


@pytest.mark.parametrize('rol', ['admin', 'experto', 'visualizador'])
def test_calibracion_y_poblacion_traen_los_nuevos_artefactos(cliente, tokens, entrenamientos, rol):  # noqa: F811
    h = tokens[rol]
    cal = cliente.get(f'/api/analitica/{entrenamientos["a"]}/calibracion', headers=h).json()['desenlaces']['readm_3m']
    hist = cal['hist_riesgo']
    assert {'bins', 'histograma', 'decision'} <= set(cal) and hist['estado'] == 'ok'
    assert all(t['con'] is None or t['con'] >= 5 for t in hist['tramos'])
    pob = cliente.get(f'/api/analitica/{entrenamientos["a"]}/poblacion', headers=h).json()['desenlaces']['readm_3m']
    sexo = pob['distribuciones_muestra_universo']['categoricas']['sexo']
    assert sexo['n_universo'] == 1500 and sexo['n_muestra'] == 1000 and {'embudo', 'eventos', 'nulos'} <= set(pob)


def test_entrenamiento_anterior_no_trae_los_artefactos_nuevos(cliente, tokens, entrenamientos):  # noqa: F811
    h = tokens['visualizador']
    cal = cliente.get(f'/api/analitica/{entrenamientos["viejo"]}/calibracion', headers=h).json()['desenlaces']['readm_3m']
    pob = cliente.get(f'/api/analitica/{entrenamientos["viejo"]}/poblacion', headers=h).json()['desenlaces']['readm_3m']
    assert 'hist_riesgo' not in cal and 'histograma' in cal and 'distribuciones_muestra_universo' not in pob


def test_comparar_entrenamientos(cliente, tokens, entrenamientos):  # noqa: F811
    a, b = entrenamientos['a'], entrenamientos['b']
    url = '/api/analitica/comparar'
    assert cliente.get(url, params={'a': a, 'b': b, 'desenlace': 'readm_3m'}).status_code == 401
    assert cliente.get(url, params={'a': a, 'b': a, 'desenlace': 'readm_3m'}, headers=tokens['admin']).status_code == 422
    for rol in ('admin', 'experto', 'visualizador'):
        r = cliente.get(url, params={'a': a, 'b': b, 'desenlace': 'readm_3m'}, headers=tokens[rol])
        assert r.status_code == 200, r.text
    d = r.json()
    assert d['estado'] == 'ok' and d['replicas'] == 500 and 'aproximado' in d['aviso']
    m = {f['id']: f for f in d['metricas']}
    assert m['auc']['diferencia'] < -0.05 and m['auc']['clara'] is True and m['auc']['n_a'] == 1500
    assert m['det10']['ic_bajo'] is not None and d['a']['version_registro'] == '11' and d['b']['version_registro'] == '12'
    assert {f['grupo'] for f in d['por_grupo']} == {'femenino', 'masculino'}
    assert {c['id'] for c in d['calibracion']} == {'brier', 'razon'}
    # repetible
    assert cliente.get(url, params={'a': a, 'b': b, 'desenlace': 'readm_3m'}, headers=tokens['admin']).json() == d


def test_comparar_entrenamientos_sin_artefactos_y_desenlace_sin_datos(cliente, tokens, entrenamientos):  # noqa: F811
    h = tokens['experto']
    r = cliente.get('/api/analitica/comparar', params={'a': 987654, 'b': entrenamientos['a'], 'desenlace': 'readm_3m'}, headers=h)
    assert r.status_code == 200 and r.json()['estado'] == 'sin_artefactos'
    r = cliente.get('/api/analitica/comparar', params={'a': entrenamientos['a'], 'b': entrenamientos['b'], 'desenlace': 'otro'}, headers=h)
    assert r.json()['estado'] == 'insuficiente'


def _grupos(cliente, tokens, rol='experto', **cuerpo):  # noqa: F811
    return cliente.post('/api/analitica/comparar/grupos', headers=tokens[rol], json=cuerpo)


def test_comparar_grupos(cliente, tokens, corrida):  # noqa: F811
    assert cliente.post('/api/analitica/comparar/grupos', json={'a': {}, 'b': {}}).status_code == 401
    a, b = {'muestra': _muestra(_y('sexo', 'lista', ['M'])), 'nombre': 'Varones'}, {'muestra': _muestra(_y('sexo', 'lista', ['F']))}
    for rol in ('admin', 'experto', 'visualizador'):
        r = _grupos(cliente, tokens, rol, a=a, b=b, corrida_id=corrida)
        assert r.status_code == 200, r.text
    d = _grupos(cliente, tokens, 'admin', a=a, b=b, corrida_id=corrida).json()
    assert d['estado'] == 'ok' and d['a']['nombre'] == 'Varones' and d['b']['nombre'] == 'Grupo B'
    assert d['a']['n'] + d['b']['n'] <= 400 and d['a']['n'] >= 20 and d['replicas'] == 300
    assert {f['clave'] for f in d['riesgo']} == {'readm_3m', 'oxigeno_3m'}
    f = d['riesgo'][0]
    assert f['n_a'] >= 20 and f['ic_a'][0] <= f['a'] <= f['ic_a'][1] and f['ic_bajo'] <= f['diferencia'] <= f['ic_alto']
    assert d['crecimiento']['indicador'] == 'peso' and d['crecimiento']['n_a'] >= 20
    assert isinstance(d['motivos'], list) and isinstance(d['faltantes'], list)
    assert all(f['a']['pct'] is not None and f['b']['pct'] is not None for f in d['faltantes'])
    sexo = {c['categoria']: c for c in d['composicion'].get('sexo', {'categorias': []})['categorias']} if 'sexo' in d['composicion'] else {}
    assert not sexo or (sexo['M']['pct_a'] == 100.0 and sexo['M']['pct_b'] == 0.0 or sexo['M']['pct_b'] is None)
    # un solo desenlace
    solo = _grupos(cliente, tokens, a=a, b=b, corrida_id=corrida, desenlace='readm_3m').json()
    assert [f['clave'] for f in solo['riesgo']] == ['readm_3m']


def test_comparar_grupos_con_pocos_ninos_no_da_cifras_y_queda_en_auditoria(cliente, tokens, corrida):  # noqa: F811
    from maia_comun import db
    from maia_comun.modelos_db import Auditoria
    pocos = {'muestra': _muestra(_y('eg_semanas', 'numero', [None, 24]), _y('sexo', 'lista', ['F']))}
    todos = {'muestra': _muestra(_y('sexo', 'lista', ['M']))}
    r = _grupos(cliente, tokens, 'visualizador', a=pocos, b=todos, corrida_id=corrida).json()
    assert r['estado'] == 'insuficiente' and 'riesgo' not in r and r['minimo_ninos'] == 20
    assert r['a']['n'] is None or r['a']['n'] >= 5
    with db.fabrica()() as s:
        n = len(s.scalars(select(Auditoria).where(Auditoria.accion == 'analitica.comparar_grupos')).all())
    assert n >= 1
    assert _grupos(cliente, tokens, a={'muestra_id': 99999}, b=todos, corrida_id=corrida).status_code == 404
    assert _grupos(cliente, tokens, a={'muestra': _muestra(_y('no_existe', 'lista', ['x']))}, b=todos,
                   corrida_id=corrida).status_code == 422
