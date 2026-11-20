"""Calibración (hist_riesgo), Población (distribuciones muestra/universo) y Comparar con réplicas, por la API."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import select

# la corrida con desenlaces observados, talla por visita y riesgos por corte, de las pruebas de la Vista clínica
from test_clinica_api import ETAPAS, datos  # noqa: F401
from test_clinica_api import corrida as corrida_clinica  # noqa: F401

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


# ------------------------------------------------------------------------ comparar grupos, por pregunta clínica

def _clinico(cliente, tokens, rol='experto', **cuerpo):  # noqa: F811
    return cliente.post('/api/analitica/comparar/grupos/clinico', headers=tokens[rol], json=cuerpo)


@pytest.fixture(scope='module')
def lados(sev):  # noqa: F811
    from maia_comun import muestra as M
    a, b = _muestra(_y('sexo', 'lista', ['M'])), _muestra(_y('sexo', 'lista', ['F']))
    return {'a': {'muestra': a, 'nombre': 'Varones'}, 'b': {'muestra': b, 'nombre': 'Mujeres'},
            'ids_a': set(M.ids(sev, a)), 'ids_b': set(M.ids(sev, b))}


def _p(x: float) -> float:
    return round(100 * x, 1)


def test_clinico_roles_y_encabezado_de_cada_lado(cliente, tokens, corrida_clinica, lados, datos):  # noqa: F811
    assert cliente.post('/api/analitica/comparar/grupos/clinico', json={'a': {}, 'b': {}}).status_code == 401
    for rol in ('admin', 'experto', 'visualizador'):
        assert _clinico(cliente, tokens, rol, a=lados['a'], b=lados['b'], corrida_id=corrida_clinica).status_code == 200
    d = _clinico(cliente, tokens, a=lados['a'], b={'muestra': lados['b']['muestra']}, corrida_id=corrida_clinica).json()
    total = len(datos['todos'])
    assert d['estado'] == 'ok' and d['corrida_id'] == corrida_clinica and d['alerta_percentil'] == 90
    assert d['a'] == {'nombre': 'Varones', 'n': len(lados['ids_a']), 'n_total': total}
    assert d['b'] == {'nombre': 'Grupo B', 'n': len(lados['ids_b']), 'n_total': total}   # sin nombre, «Grupo B»
    assert [f['clave'] for f in d['desenlaces']] == ['talla_baja_12m', 'desarrollo_12m']
    talla = d['desenlaces'][0]
    assert set(talla) >= {'clave', 'nombre', 'definicion', 'estado', 'a', 'b', 'dif', 'riesgo'} and talla['estado'] == 'en_prueba'


def test_clinico_observado_a_los_12_meses_por_lado_con_diferencia(cliente, tokens, corrida_clinica, lados, datos):  # noqa: F811
    d = _clinico(cliente, tokens, a=lados['a'], b=lados['b'], corrida_id=corrida_clinica).json()
    obs = datos['observados']
    obs = obs[obs.familia == 'talla_baja_12m']
    talla = d['desenlaces'][0]
    for lado, ids in (('a', lados['ids_a']), ('b', lados['ids_b'])):
        v = obs[obs.sujeto.isin(ids)]
        assert talla[lado]['casos'] == int(v.valor.sum()) and talla[lado]['con_dato'] == len(v)
        assert talla[lado]['sin_dato'] == len(ids) - len(v)
        assert talla[lado]['pct'] == pytest.approx(_p(v.valor.mean()), abs=0.06)   # entre quienes tienen dato
    dif = talla['dif']
    assert dif['valor'] == pytest.approx(talla['b']['pct'] - talla['a']['pct'], abs=0.01)
    assert dif['ic_bajo'] <= dif['valor'] <= dif['ic_alto'] and isinstance(dif['clara'], bool)
    assert dif['valor'] < 0   # en lo simulado las mujeres tienen menos talla baja que los varones: B frente a A baja


def test_clinico_talla_por_visita_de_cada_lado_con_umbral_y_referencia(cliente, tokens, corrida_clinica, lados, datos):  # noqa: F811
    d = _clinico(cliente, tokens, a=lados['a'], b=lados['b'], corrida_id=corrida_clinica).json()
    tr = d['trayectoria']
    assert tr['indicador'] == 'talla' and tr['unidad'] and tr['referencia'] == 'OMS' and tr['umbral'] == -2
    assert [e['etapa'] for e in tr['etapas']] == ETAPAS
    z = datos['crecimiento']
    z = z[(z.indicador == 'talla') & ~z.improbable]
    for e in tr['etapas']:
        for lado, ids in (('a', lados['ids_a']), ('b', lados['ids_b'])):
            v = z[(z.etapa == e['etapa']) & z.sujeto.isin(ids)].z
            if len(v) < 5:   # los varones casi no tienen dato a los 12 meses: la celda no se da
                assert e[lado] is None
                continue
            assert e[lado]['n'] == len(v) and e[lado]['mediana'] == pytest.approx(v.median())


def test_clinico_datos_faltantes_por_visita_con_su_denominador(cliente, tokens, corrida_clinica, lados):  # noqa: F811
    d = _clinico(cliente, tokens, a=lados['a'], b=lados['b'], corrida_id=corrida_clinica).json()
    for e in d['trayectoria']['etapas']:
        for lado, n in (('a', d['a']['n']), ('b', d['b']['n'])):
            celda = e[lado]
            if celda is None:
                continue
            assert celda['sin_dato'] == n - celda['n']
            assert celda['pct_sin_dato'] == pytest.approx(100 * (n - celda['n']) / n, abs=0.05)
    doce = next(e for e in d['trayectoria']['etapas'] if e['etapa'] == '12 m EC')
    assert doce['a'] is None and doce['b']['pct_sin_dato'] < 5   # varones: 3 con dato, no se dice; mujeres: todas con dato


def test_clinico_riesgo_estimado_por_corte_de_cada_lado(cliente, tokens, corrida_clinica, lados, datos):  # noqa: F811
    d = _clinico(cliente, tokens, a=lados['a'], b=lados['b'], corrida_id=corrida_clinica).json()
    talla, desarrollo = d['desenlaces']
    assert [(f['momento'], f['clave'], f['estado']) for f in talla['riesgo']] == [
        ('3 m EC', 'talla_baja_12m_desde_3', 'en_prueba'), ('6 m EC', 'talla_baja_12m_desde_6', 'en_prueba')]
    ri = datos['riesgos']
    for f in talla['riesgo']:
        for lado, ids in (('a', lados['ids_a']), ('b', lados['ids_b'])):
            filas = ri[(ri.clave == f['clave']) & ri.sujeto.isin(ids)]
            assert f[lado] == {'calculados': len(filas), 'en_alerta': int((filas.percentil >= 90).sum())}
    # desarrollo: solo 3 varones tienen riesgo de esa familia, así que el lado A no da cifra y B sí
    assert [f['clave'] for f in desarrollo['riesgo']] == ['desarrollo_12m']
    assert desarrollo['riesgo'][0]['a'] is None and desarrollo['riesgo'][0]['b']['calculados'] > 5
    assert desarrollo['a'] is None and desarrollo['b']['con_dato'] > 5 and desarrollo['dif']['valor'] is None


def test_clinico_con_menos_de_20_ninos_en_un_lado_no_da_cifras(cliente, tokens, corrida_clinica, lados):  # noqa: F811
    pocos = {'muestra': _muestra(_y('eg_semanas', 'numero', [None, 24]), _y('sexo', 'lista', ['F']))}
    r = _clinico(cliente, tokens, 'visualizador', a=pocos, b=lados['b'], corrida_id=corrida_clinica).json()
    assert r['estado'] == 'insuficiente' and r['minimo_ninos'] == 20 and 'mensaje' in r
    assert not {'desenlaces', 'trayectoria'} & set(r) and (r['a']['n'] is None or r['a']['n'] >= 5)


def test_clinico_el_visualizador_ve_conteos_redondeados(cliente, tokens, corrida_clinica, sev):  # noqa: F811
    from maia_comun import muestra as M
    grupo = None
    for tope in range(25, 36):   # un grupo de 20 a 99 niños: sus conteos van en múltiplos de 5 para quien solo consulta
        m = _muestra(_y('eg_semanas', 'numero', [None, tope]))
        if 20 <= len(M.ids(sev, m)) < 100:
            grupo = {'muestra': m}
            break
    assert grupo, 'el corte de prueba no tiene un grupo de 20 a 99 niños para esta prueba'
    todos = {'muestra': _muestra()}
    exacto = _clinico(cliente, tokens, 'experto', a=grupo, b=todos, corrida_id=corrida_clinica).json()
    r = _clinico(cliente, tokens, 'visualizador', a=grupo, b=todos, corrida_id=corrida_clinica).json()
    assert r['a']['n'] == int(exacto['a']['n'] / 5 + 0.5) * 5 and r['a']['n'] % 5 == 0
    talla = r['desenlaces'][0]
    assert all(talla['a'][k] % 5 == 0 for k in ('casos', 'con_dato', 'sin_dato'))
    assert all(f['a']['calculados'] % 5 == 0 for f in talla['riesgo'] if f['a'])


def test_clinico_errores_y_auditoria(cliente, tokens, corrida_clinica, lados):  # noqa: F811
    from maia_comun import db
    from maia_comun.modelos_db import Auditoria
    assert _clinico(cliente, tokens, a={'muestra_id': 99999}, b=lados['b'], corrida_id=corrida_clinica).status_code == 404
    assert _clinico(cliente, tokens, a=lados['a'], b=lados['b'], corrida_id=99999).status_code == 404
    assert _clinico(cliente, tokens, a={'muestra': _muestra(_y('no_existe', 'lista', ['x']))}, b=lados['b'],
                    corrida_id=corrida_clinica).status_code == 422
    with db.fabrica()() as s:
        antes = len(s.scalars(select(Auditoria).where(Auditoria.accion == 'analitica.comparar_grupos')).all())
    _clinico(cliente, tokens, a=lados['a'], b=lados['b'], corrida_id=corrida_clinica)
    with db.fabrica()() as s:
        filas = s.scalars(select(Auditoria).where(Auditoria.accion == 'analitica.comparar_grupos')).all()
    assert len(filas) == antes + 1 and set(filas[-1].detalle) == {'huella_a', 'huella_b', 'n_a', 'n_b'}
