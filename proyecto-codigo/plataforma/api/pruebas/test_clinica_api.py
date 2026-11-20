"""Vista clínica: ``POST /clinica/resumen`` (observado a 12 meses, talla por visita, riesgo por corte y niños con más
riesgo de una familia de desenlaces) con las mismas reglas de privacidad que Explorar."""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest
from sqlalchemy import select

# la API, los usuarios y el corte simulado son los de las pruebas de muestras
from test_muestras_api import _muestra, _y, cliente, corte, sev, tokens  # noqa: F401

pytestmark = pytest.mark.integracion

ALTO = 90
POCOS = 3   # varones con dato en lo que se arma «pequeño»
ETAPAS = ['40 sem', '3 m EC', '6 m EC', '12 m EC']


@pytest.fixture(scope='module')
def datos(sev):  # noqa: F811
    """Las filas sintéticas de una corrida, para calcular lo esperado sin pasar por la API."""
    from maia_comun import muestra as M
    rng = np.random.default_rng(7)
    todos = sorted(sev.sujetos.sujeto)
    varones = set(M.ids(sev, _muestra(_y('sexo', 'lista', ['M']))))
    pocos = sorted(varones)[:POCOS]
    riesgos, crecimiento, observados = [], [], []
    for i, suj in enumerate(todos):
        mujer = suj not in varones
        con_dato = mujer or suj in pocos   # a los 12 meses y en el desarrollo, casi ningún varón tiene dato
        for clave, momento, nombre, hay in (
                ('talla_baja_12m_desde_3', '3 m EC', 'talla baja (riesgo calculado a 3 m EC)', True),
                ('talla_baja_12m_desde_6', '6 m EC', 'talla baja (riesgo calculado a 6 m EC)', rng.random() < 0.6),
                ('desarrollo_12m', '6 m EC', 'desarrollo bajo a 12 meses', con_dato),
                ('readm_3m', '40 sem', 'readmisión', True)):
            if hay:
                # los percentiles de la primera clave son todos distintos: el orden de «los de más riesgo» es único
                p = 100 * (i + 1) / (len(todos) + 1) if clave == 'talla_baja_12m_desde_3' else float(rng.uniform(0, 100))
                riesgos.append(dict(sujeto=suj, clave=clave, desenlace=nombre, momento=momento, riesgo=p / 200,
                                    percentil=p, motivos=[]))
        for etapa in ETAPAS:
            if etapa == '12 m EC' and not con_dato:
                continue
            for indicador in ('talla', 'peso'):
                z = float(rng.normal(-0.5 - (0.5 if mujer else 0), 1.1))
                mala = bool(rng.random() < 0.02)   # un dato improbable no cuenta
                crecimiento.append(dict(sujeto=suj, etapa=etapa, indicador=indicador, valor=1.0,
                                        z=-9.0 if mala else z, bajo_2de=z < -2, caida_1de=z < -1, improbable=mala))
        if rng.random() < 0.7:
            observados.append(dict(sujeto=suj, familia='talla_baja_12m', valor=bool(rng.random() < (0.2 if mujer else 0.4))))
        if con_dato:
            observados.append(dict(sujeto=suj, familia='desarrollo_12m', valor=bool(rng.random() < 0.3)))
    return {'todos': todos, 'varones': sorted(varones), 'riesgos': pd.DataFrame(riesgos),
            'crecimiento': pd.DataFrame(crecimiento), 'observados': pd.DataFrame(observados)}


@pytest.fixture(scope='module')
def corrida(cliente, corte, datos):  # noqa: F811
    from maia_comun import db
    from maia_comun.modelos_db import Corrida, Crecimiento, DesenlaceObservado, Riesgo
    with db.fabrica()() as s:
        c = Corrida(corte_id=corte, fuente='simulado', fecha_corte=date(2026, 6, 30), tipo='completa', estado='ok',
                    resumen={'ninos': len(datos['todos']), 'corte': '2026-06-30'})
        s.add(c)
        s.flush()
        s.add_all(Riesgo(corrida_id=c.id, **f) for f in datos['riesgos'].to_dict('records'))
        s.add_all(Crecimiento(corrida_id=c.id, **f) for f in datos['crecimiento'].to_dict('records'))
        s.add_all(DesenlaceObservado(corrida_id=c.id, **f) for f in datos['observados'].to_dict('records'))
        s.commit()
        return c.id


def _resumen(cliente, tokens, rol='admin', **cuerpo):  # noqa: F811
    return cliente.post('/api/clinica/resumen', headers=tokens[rol], json=cuerpo)


def _familia(r: dict, clave: str) -> dict:
    return next(f for f in r['familias'] if f['clave'] == clave)


def _z(datos, indicador: str, ids=None) -> pd.DataFrame:
    z = datos['crecimiento']
    z = z[(z.indicador == indicador) & ~z.improbable]
    return z if ids is None else z[z.sujeto.isin(ids)]


def test_roles(cliente, tokens, corrida):  # noqa: F811
    assert cliente.post('/api/clinica/resumen', json={}).status_code == 401
    for rol in ('admin', 'experto', 'visualizador'):
        assert _resumen(cliente, tokens, rol, corrida_id=corrida).status_code == 200


def test_contrato(cliente, tokens, corrida, datos):  # noqa: F811
    r = _resumen(cliente, tokens, corrida_id=corrida).json()
    assert r['insuficiente'] is False and r['corrida_id'] == corrida and r['datos_al'] == '2026-06-30'
    assert [f['clave'] for f in r['familias']] == ['talla_baja_12m', 'desarrollo_12m']   # las priorizadas, en ese orden
    talla, desarrollo = _familia(r, 'talla_baja_12m'), _familia(r, 'desarrollo_12m')
    assert set(talla) == {'clave', 'nombre', 'definicion', 'estado', 'indicador'}
    assert talla['estado'] == 'en_prueba' and desarrollo['estado'] == 'en_uso'
    assert talla['indicador'] == 'talla' and desarrollo['indicador'] is None
    # la definición dice el indicador, la referencia, el umbral y la edad
    for texto in ('Talla para la edad', 'OMS', '−2', '12 meses'):
        assert texto in talla['definicion']
    assert '10 %' in desarrollo['definicion'] and 'más bajo' in desarrollo['definicion']
    assert r['familia'] == 'talla_baja_12m' and r['indicador'] == 'talla'   # por defecto: la primera y su medida
    n = len(datos['todos'])
    assert r['grupo'] == {'n': n, 'n_total': n}

    obs = datos['observados'][datos['observados'].familia == 'talla_baja_12m']
    esperado = {'casos': int(obs.valor.sum()), 'con_dato': len(obs), 'sin_dato': n - len(obs)}
    assert r['observado']['grupo'] == esperado == r['observado']['poblacion']   # sin filtro, el grupo es la población

    tr = r['trayectoria']
    assert tr['indicador'] == 'talla' and tr['unidad'] and [e['etapa'] for e in tr['etapas']] == ETAPAS
    z = _z(datos, 'talla')
    for e in tr['etapas']:
        v = z[z.etapa == e['etapa']].z
        assert e['grupo']['n'] == len(v) and e['grupo']['mediana'] == pytest.approx(v.median())
        assert e['grupo']['p25'] == pytest.approx(v.quantile(.25)) and e['grupo']['p75'] == pytest.approx(v.quantile(.75))
        assert e['poblacion'] == {'n': len(v), 'mediana': pytest.approx(v.median())}
    assert tr['etapas'][-1]['grupo']['n'] < tr['etapas'][0]['grupo']['n']   # a los 12 meses vino menos gente

    ri = datos['riesgos']
    assert r['alerta_percentil'] == ALTO
    assert [(f['momento'], f['clave'], f['estado']) for f in r['riesgo']] == [
        ('3 m EC', 'talla_baja_12m_desde_3', 'en_prueba'), ('6 m EC', 'talla_baja_12m_desde_6', 'en_prueba')]
    for f in r['riesgo']:
        filas = ri[ri.clave == f['clave']]
        assert f['calculados'] == len(filas) and f['en_alerta'] == int((filas.percentil >= ALTO).sum())

    # los 5 niños con más riesgo de la familia, cada uno con su percentil más alto
    top = ri[ri.clave.str.startswith('talla_baja_12m')].sort_values(['percentil', 'sujeto'], ascending=[False, True])
    top = top.drop_duplicates('sujeto').head(5)
    assert [x['sujeto'] for x in r['ninos']] == top.sujeto.tolist()
    primero = r['ninos'][0]
    assert set(primero) == {'sujeto', 'semanas', 'momento', 'riesgo', 'percentil', 'ultima_z'}
    assert primero['percentil'] == pytest.approx(top.percentil.iloc[0]) and primero['momento'] == '3 m EC'
    assert primero['riesgo'] == pytest.approx(top.riesgo.iloc[0]) and primero['semanas'] is not None
    suyas = z[z.sujeto == primero['sujeto']]
    ultima = suyas.iloc[suyas.etapa.map(ETAPAS.index).argmax()]   # su dato de la última visita, no el de otra
    assert primero['ultima_z'] == pytest.approx(float(ultima.z))


def test_otra_familia_y_otro_indicador(cliente, tokens, corrida, datos):  # noqa: F811
    r = _resumen(cliente, tokens, corrida_id=corrida, familia='desarrollo_12m', indicador='peso').json()
    assert r['familia'] == 'desarrollo_12m' and r['indicador'] == 'peso' and r['trayectoria']['indicador'] == 'peso'
    assert [f['clave'] for f in r['riesgo']] == ['desarrollo_12m'] and r['riesgo'][0]['estado'] == 'en_uso'
    obs = datos['observados'][datos['observados'].familia == 'desarrollo_12m']
    assert r['observado']['grupo']['con_dato'] == len(obs)
    assert r['ninos'] and all(x['momento'] == '6 m EC' for x in r['ninos'])


def test_un_filtro_cambia_cada_bloque(cliente, tokens, corrida, datos):  # noqa: F811
    todos = _resumen(cliente, tokens, corrida_id=corrida).json()
    v = _resumen(cliente, tokens, corrida_id=corrida, muestra=_muestra(_y('sexo', 'lista', ['M']))).json()
    ids = set(datos['varones'])
    assert v['grupo'] == {'n': len(ids), 'n_total': len(datos['todos'])} and 0 < len(ids) < len(datos['todos'])
    obs = datos['observados']
    obs = obs[(obs.familia == 'talla_baja_12m') & obs.sujeto.isin(ids)]
    assert v['observado']['grupo'] == {'casos': int(obs.valor.sum()), 'con_dato': len(obs), 'sin_dato': len(ids) - len(obs)}
    assert v['observado']['poblacion'] == todos['observado']['poblacion']   # la población de referencia no cambia
    z = _z(datos, 'talla', ids)
    for e, antes in zip(v['trayectoria']['etapas'], todos['trayectoria']['etapas']):
        assert e['poblacion'] == antes['poblacion']
        if e['etapa'] != '12 m EC':   # a los 12 meses el grupo casi no tiene dato (se prueba abajo)
            esperado = z[z.etapa == e['etapa']].z
            assert e['grupo']['n'] == len(esperado) < antes['grupo']['n']
            assert e['grupo']['mediana'] == pytest.approx(esperado.median())
    ri = datos['riesgos']
    for f, antes in zip(v['riesgo'], todos['riesgo']):
        assert f['calculados'] == int((ri.clave.eq(f['clave']) & ri.sujeto.isin(ids)).sum()) < antes['calculados']
    assert v['ninos'] and all(x['sujeto'] in ids for x in v['ninos'])


def test_celdas_de_menos_de_5_no_se_dan(cliente, tokens, corrida, datos):  # noqa: F811
    # solo 3 varones tienen dato a los 12 meses y en el desarrollo: esas celdas del grupo salen vacías
    m = _muestra(_y('sexo', 'lista', ['M']))
    r = _resumen(cliente, tokens, corrida_id=corrida, muestra=m, familia='desarrollo_12m', indicador='talla').json()
    assert r['observado']['grupo'] is None and r['observado']['poblacion']['con_dato'] > POCOS
    doce = next(e for e in r['trayectoria']['etapas'] if e['etapa'] == '12 m EC')
    assert doce['grupo'] is None and doce['poblacion']['n'] > POCOS
    assert r['riesgo'] == []   # solo 3 varones tienen riesgo de esa familia
    assert r['grupo']['n'] == len(datos['varones'])   # el grupo sí se cuenta: tiene 20 o más niños


def test_menos_de_20_ninos_no_hay_cifras(cliente, tokens, corrida):  # noqa: F811
    pocos = _muestra(_y('eg_semanas', 'numero', [None, 24]), _y('sexo', 'lista', ['F']))
    for rol in ('admin', 'visualizador'):
        r = _resumen(cliente, tokens, rol, corrida_id=corrida, muestra=pocos)
        assert r.status_code == 200 and r.json() == {'insuficiente': True, 'vacio': False, 'ninos': None, 'minimo': 20}


def test_el_visualizador_no_ve_ninos_y_ve_conteos_redondeados(cliente, tokens, corrida, sev):  # noqa: F811
    from maia_comun import muestra as M
    for rol in ('admin', 'experto'):
        assert len(_resumen(cliente, tokens, rol, corrida_id=corrida).json()['ninos']) == 5
    vis = _resumen(cliente, tokens, 'visualizador', corrida_id=corrida)
    assert vis.status_code == 200 and vis.json()['ninos'] is None
    # un grupo de 20 a 99 niños: sus conteos van en múltiplos de 5 para quien solo consulta
    elegida = None
    for tope in range(25, 36):
        m = _muestra(_y('eg_semanas', 'numero', [None, tope]))
        if 20 <= len(M.ids(sev, m)) < 100:
            elegida = m
            break
    assert elegida, 'el corte de prueba no tiene un grupo de 20 a 99 niños para esta prueba'
    m = elegida
    n = len(M.ids(sev, m))
    v = _resumen(cliente, tokens, 'visualizador', corrida_id=corrida, muestra=m).json()
    e = _resumen(cliente, tokens, 'experto', corrida_id=corrida, muestra=m).json()
    assert e['grupo']['n'] == n and v['grupo']['n'] == int(n / 5 + 0.5) * 5
    assert v['ninos'] is None and e['ninos'] is not None
    assert v['riesgo'] and all(f['calculados'] % 5 == 0 and f['en_alerta'] % 5 == 0 for f in v['riesgo'])
    assert v['observado']['grupo'] and all(v['observado']['grupo'][k] % 5 == 0 for k in ('casos', 'con_dato', 'sin_dato'))


def test_familia_o_indicador_desconocidos(cliente, tokens, corrida):  # noqa: F811
    r = _resumen(cliente, tokens, corrida_id=corrida, familia='no_existe')
    assert r.status_code == 404 and 'no_existe' in r.json()['detail']
    assert _resumen(cliente, tokens, corrida_id=corrida, indicador='no_existe').status_code == 422
    assert _resumen(cliente, tokens, corrida_id=99999).status_code == 404


def test_quedan_en_la_auditoria(cliente, tokens, corrida):  # noqa: F811
    from maia_comun import db
    from maia_comun.modelos_db import Auditoria
    _resumen(cliente, tokens, 'experto', corrida_id=corrida)
    _resumen(cliente, tokens, 'visualizador', corrida_id=corrida)
    with db.fabrica()() as s:
        filas = s.scalars(select(Auditoria).where(Auditoria.accion.in_(('clinica.consultar', 'clinica.ninos')))
                          .order_by(Auditoria.id)).all()
    consultas = [f for f in filas if f.accion == 'clinica.consultar']
    ninos = [f for f in filas if f.accion == 'clinica.ninos']
    assert consultas and ninos and len(ninos) < len(consultas)   # el visualizador consulta, pero no lista niños
    assert ninos[-1].detalle == {'familia': 'talla_baja_12m', 'ninos': 5}   # códigos contados, sin valores clínicos
