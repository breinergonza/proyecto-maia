"""Explorar: lo mismo que el Tablero sin filtros, y con filtro solo el grupo, con las reservas de privacidad (D46)."""
from __future__ import annotations

from dataclasses import replace
from datetime import date

import numpy as np
import pytest
from sqlalchemy import func, select

# la API, los usuarios y el corte simulado son los de las pruebas de muestras
from test_muestras_api import _muestra, _y, cliente, corte, sev, tokens  # noqa: F401

pytestmark = pytest.mark.integracion

LIMITE_ALTO = 90


def _corrida(corte_id: int, sujetos: list[str], semilla: int = 5) -> int:
    """Una corrida terminada con riesgos y crecimiento sintéticos para esos niños (sin entrenar modelos)."""
    from maia_comun import db
    from maia_comun.modelos_db import Corrida, Crecimiento, Riesgo
    rng = np.random.default_rng(semilla)
    with db.fabrica()() as s:
        c = Corrida(corte_id=corte_id, fuente='simulado', fecha_corte=date(2026, 6, 30), tipo='completa', estado='ok',
                    resumen={'ninos': len(sujetos), 'datos': 1, 'corte': '2026-06-30'})
        s.add(c)
        s.flush()
        for suj in sujetos:
            for clave, nombre in (('readm_3m', 'readmisión'), ('oxigeno_3m', 'oxigenodependencia')):
                if rng.random() < 0.8:
                    p = float(rng.uniform(0, 100))
                    s.add(Riesgo(corrida_id=c.id, sujeto=suj, clave=clave, desenlace=nombre, momento='40 sem',
                                 riesgo=p / 200, percentil=p, motivos=[]))
            for etapa in ('3 m EC', '6 m EC'):
                for ind in ('peso', 'talla'):
                    z = float(rng.normal(-0.5, 1.2))
                    s.add(Crecimiento(corrida_id=c.id, sujeto=suj, etapa=etapa, indicador=ind, z=z, valor=1.0,
                                      bajo_2de=z < -2, caida_1de=z < -1, improbable=bool(rng.random() < 0.02)))
        s.commit()
        return c.id


@pytest.fixture(scope='module')
def corrida(cliente, corte, sev):  # noqa: F811
    return _corrida(corte, list(sev.sujetos.sujeto))


def _resumen(cliente, tokens, rol='admin', **cuerpo):  # noqa: F811
    return cliente.post('/api/exploracion/resumen', headers=tokens[rol], json=cuerpo)


def test_roles(cliente, tokens, corrida):  # noqa: F811
    assert cliente.post('/api/exploracion/resumen', json={}).status_code == 401
    assert cliente.post('/api/exploracion/facetas', json={}).status_code == 401
    for rol in ('admin', 'experto', 'visualizador'):
        assert _resumen(cliente, tokens, rol).status_code == 200
        assert cliente.post('/api/exploracion/facetas', headers=tokens[rol], json={}).status_code == 200


def test_sin_filtros_da_lo_mismo_que_el_tablero(cliente, tokens, corrida):  # noqa: F811
    t = cliente.get('/api/tablero/resumen', headers=tokens['admin'], params={'corrida_id': corrida}).json()
    e = _resumen(cliente, tokens, corrida_id=corrida).json()
    assert e['insuficiente'] is False and e['filtrado'] is False
    assert e['ninos'] == t['ninos'] == e['ninos_total']
    assert e['riesgos_por_desenlace'] == t['riesgos_por_desenlace'] and e['riesgos_por_desenlace']
    assert e['crecimiento_por_etapa'] == t['crecimiento_por_etapa'] and e['crecimiento_por_etapa']
    assert e['ninos_riesgo_alto'] == t['ninos_riesgo_alto'] and e['riesgos_altos'] == t['riesgos_altos']
    assert 0 < e['pct_crecimiento_bajo'] < 100
    # una muestra sin filtros (solo la versión) es lo mismo que ningún cuerpo
    assert _resumen(cliente, tokens, corrida_id=corrida, muestra=_muestra()).json()['ninos'] == t['ninos']


def test_con_filtro_solo_cuenta_al_grupo(cliente, tokens, corrida, sev):  # noqa: F811
    from maia_comun import db
    from maia_comun import muestra as M
    from maia_comun.modelos_db import Crecimiento, Riesgo
    m = _muestra(_y('sexo', 'lista', ['M']))
    ids = M.ids(sev, m)
    e = _resumen(cliente, tokens, corrida_id=corrida, muestra=m).json()
    assert e['filtrado'] is True and e['ninos'] == len(ids) < e['ninos_total']
    with db.fabrica()() as s:
        esperado = dict(s.execute(select(Riesgo.clave, func.count()).where(
            Riesgo.corrida_id == corrida, Riesgo.sujeto.in_(ids), Riesgo.silencio.is_(False)).group_by(Riesgo.clave)).all())
        altos = s.scalar(select(func.count(func.distinct(Riesgo.sujeto))).where(
            Riesgo.corrida_id == corrida, Riesgo.sujeto.in_(ids), Riesgo.percentil >= LIMITE_ALTO))
        datos = s.scalar(select(func.count()).where(Crecimiento.corrida_id == corrida, Crecimiento.sujeto.in_(ids),
                                                    Crecimiento.improbable.is_(False), Crecimiento.etapa == '3 m EC',
                                                    Crecimiento.indicador == 'peso'))
    assert {f['clave']: f['ninos'] for f in e['riesgos_por_desenlace']} == esperado
    assert e['ninos_riesgo_alto'] == altos
    assert next(f for f in e['crecimiento_por_etapa'] if f['etapa'] == '3 m EC' and f['indicador'] == 'peso')['datos'] == datos
    # quiénes son: el grupo es solo de varones
    sexo = {c['categoria']: c for c in e['distribuciones']['sexo']['categorias']}
    assert sexo['M']['grupo'] == 100.0 and sexo['F']['grupo'] == 0.0 and 0 < sexo['M']['todos'] < 100
    assert {'eg', 'sede'} <= set(e['distribuciones'])
    # lo mismo con la muestra guardada
    g = cliente.post('/api/muestras', headers=tokens['experto'], json={'titulo': 'Varones', 'muestra': m}).json()
    assert _resumen(cliente, tokens, corrida_id=corrida, muestra_id=g['id']).json()['ninos'] == len(ids)
    assert _resumen(cliente, tokens, muestra_id=99999).status_code == 404
    assert _resumen(cliente, tokens, muestra=_muestra(_y('no_existe', 'lista', ['x']))).status_code == 422


def test_con_menos_de_20_ninos_no_hay_cifras(cliente, tokens, corrida):  # noqa: F811
    pocos = _muestra(_y('eg_semanas', 'numero', [None, 24]), _y('sexo', 'lista', ['F']))
    for rol in ('admin', 'visualizador'):
        r = _resumen(cliente, tokens, rol, corrida_id=corrida, muestra=pocos)
        assert r.status_code == 200 and r.json() == {'insuficiente': True, 'ninos': None, 'minimo': 20}
    f = cliente.post('/api/exploracion/facetas', headers=tokens['admin'], json={'muestra': pocos}).json()
    assert f['insuficiente'] is True and f['n'] is None
    assert all(o['n'] is None for fa in f['facetas'].values() for o in fa.get('opciones', []))


def test_el_visualizador_ve_conteos_pequenos_redondeados(cliente, tokens, corrida, sev):  # noqa: F811
    from maia_comun import muestra as M
    elegida = None
    for tope in range(25, 36):
        m = _muestra(_y('eg_semanas', 'numero', [None, tope]))
        n = M.contar(sev, m)
        if 20 <= n < 100 and n % 5 != 0:
            elegida = (m, n)
            break
    assert elegida, 'el corte de prueba no tiene un grupo de 20 a 99 niños para esta prueba'
    m, n = elegida
    adm = _resumen(cliente, tokens, 'admin', corrida_id=corrida, muestra=m).json()
    vis = _resumen(cliente, tokens, 'visualizador', corrida_id=corrida, muestra=m).json()
    assert adm['ninos'] == n and vis['ninos'] == int(n / 5 + 0.5) * 5 != n
    for f in vis['riesgos_por_desenlace']:
        assert f['ninos'] % 5 == 0 and f['altos'] % 5 == 0
    assert all(f['datos'] % 5 == 0 for f in vis['crecimiento_por_etapa'] if f['datos'] < 100)
    # las facetas también: nada menor de 100 que no sea múltiplo de 5
    fv = cliente.post('/api/exploracion/facetas', headers=tokens['visualizador'], json={'muestra': m}).json()
    assert fv['n'] % 5 == 0
    assert all(o['n'] is None or o['n'] >= 100 or o['n'] % 5 == 0 for fa in fv['facetas'].values() for o in fa.get('opciones', []))
    # el experto ve el número exacto
    assert _resumen(cliente, tokens, 'experto', corrida_id=corrida, muestra=m).json()['ninos'] == n


def _contar_auditoria() -> int:
    from maia_comun import db
    from maia_comun.modelos_db import Auditoria
    with db.fabrica()() as s:
        return s.scalar(select(func.count()).where(Auditoria.accion == 'exploracion.consultar'))


def test_cada_consulta_queda_en_la_auditoria_sin_valores_clinicos(cliente, tokens, corrida, sev):  # noqa: F811
    from maia_comun import db
    from maia_comun import muestra as M
    from maia_comun.modelos_db import Auditoria
    m = _muestra(_y('sexo', 'lista', ['F']), _y('peso_nacer', 'numero', [None, 2500]))
    antes = _contar_auditoria()
    _resumen(cliente, tokens, 'experto', corrida_id=corrida, muestra=m)
    _resumen(cliente, tokens, 'visualizador', corrida_id=corrida, muestra=_muestra(_y('eg_semanas', 'numero', [None, 24])))
    assert _contar_auditoria() == antes + 2
    with db.fabrica()() as s:
        ultimas = s.scalars(select(Auditoria).where(Auditoria.accion == 'exploracion.consultar')
                            .order_by(Auditoria.id.desc()).limit(2)).all()
    pocos, normal = ultimas
    ids = M.ids(sev, m)
    assert normal.detalle == {'huella': M.huella(ids), 'n': len(ids)} and normal.recurso == f'corrida:{corrida}'
    assert set(pocos.detalle) == {'huella', 'n'} and pocos.detalle['n'] < 20


def test_sin_sede_no_hay_reparto_por_sede(cliente, tokens, corte, sev):  # noqa: F811
    from maia_comun import db
    from maia_comun import sevarti_db as SDB
    from maia_comun.modelos_db import Corte
    sub = sev.subconjunto(list(sev.sujetos.sujeto[:80]))
    cid = SDB.guardar_en_db(db.motor(), replace(sub, sujetos=sub.sujetos.assign(grupo=None)), 'kmc')
    try:
        c = _corrida(cid, list(sub.sujetos.sujeto), semilla=8)
        e = _resumen(cliente, tokens, corrida_id=c).json()
        assert e['ninos'] == e['ninos_total'] == 80 and 'sede' not in e['distribuciones']
        f = cliente.post('/api/exploracion/facetas', headers=tokens['admin'], json={'corrida_id': c}).json()
        assert 'sede' not in f['facetas'] and f['n'] == 80
    finally:
        with db.fabrica()() as s:
            s.delete(s.get(Corte, cid))
            s.commit()
