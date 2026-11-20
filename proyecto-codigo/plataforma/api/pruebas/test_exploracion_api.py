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


def _corrida(corte_id: int, sujetos: list[str], semilla: int = 5, datos: int = 1) -> int:
    """Una corrida terminada con riesgos y crecimiento sintéticos para esos niños (sin entrenar modelos)."""
    from maia_comun import db
    from maia_comun.modelos_db import Corrida, Crecimiento, Riesgo
    rng = np.random.default_rng(semilla)
    with db.fabrica()() as s:
        c = Corrida(corte_id=corte_id, fuente='simulado', fecha_corte=date(2026, 6, 30), tipo='completa', estado='ok',
                    resumen={'ninos': len(sujetos), 'datos': datos, 'corte': '2026-06-30'})
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
    return _corrida(corte, list(sev.sujetos.sujeto), datos=len(sev.mediciones))   # como la corrida: len(sev.mediciones)


def _resumen(cliente, tokens, rol='admin', **cuerpo):  # noqa: F811
    return cliente.post('/api/exploracion/resumen', headers=tokens[rol], json=cuerpo)


def test_roles(cliente, tokens, corrida):  # noqa: F811
    assert cliente.post('/api/exploracion/resumen', json={}).status_code == 401
    assert cliente.post('/api/exploracion/facetas', json={}).status_code == 401
    for rol in ('admin', 'experto', 'visualizador'):
        assert _resumen(cliente, tokens, rol).status_code == 200
        assert cliente.post('/api/exploracion/facetas', headers=tokens[rol], json={}).status_code == 200


def test_sin_filtros_da_lo_mismo_que_el_tablero(cliente, tokens, corrida, sev):  # noqa: F811
    t = cliente.get('/api/tablero/resumen', headers=tokens['admin'], params={'corrida_id': corrida}).json()
    e = _resumen(cliente, tokens, corrida_id=corrida).json()
    assert e['insuficiente'] is False and e['filtrado'] is False
    assert e['ninos'] == t['ninos'] == e['ninos_total']
    assert e['datos'] == t['datos'] == len(sev.mediciones)   # «datos leídos» se define igual en los dos
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
    # «datos leídos» del grupo: las filas de mediciones de esos niños, igual que el Tablero con todos
    assert e['datos'] == int(sev.mediciones.sujeto.isin(ids).sum())
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
        assert r.status_code == 200 and r.json() == {'insuficiente': True, 'vacio': False, 'ninos': None, 'minimo': 20}
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


# ---------------------------------------------------------------- cero, categorías, tiempo, muestreo, medición

def _facetas(cliente, tokens, rol='experto', **cuerpo):  # noqa: F811
    r = cliente.post('/api/exploracion/facetas', headers=tokens[rol], json=cuerpo)
    assert r.status_code == 200, r.text
    return r.json()


def test_ningun_nino_cumple_es_un_cero_y_no_un_dato_oculto(cliente, tokens, corrida):  # noqa: F811
    nadie = _muestra(_y('eg_semanas', 'numero', [None, 20]))   # nadie nace antes de las 20 semanas en el corte simulado
    for rol in ('admin', 'visualizador'):
        r = _resumen(cliente, tokens, rol, corrida_id=corrida, muestra=nadie).json()
        assert r == {'insuficiente': True, 'vacio': True, 'ninos': 0, 'minimo': 20}
        f = _facetas(cliente, tokens, rol, muestra=nadie)
        assert f['vacio'] is True and f['insuficiente'] is True and f['n'] == 0   # 0, no null
    # con pocos (1 a 19) sí es un dato oculto: ni cifra ni «vacío»
    pocos = _resumen(cliente, tokens, corrida_id=corrida, muestra=_muestra(
        _y('eg_semanas', 'numero', [None, 24]), _y('sexo', 'lista', ['F']))).json()
    assert pocos['vacio'] is False and pocos['ninos'] is None


def test_una_opcion_sin_ninos_sale_con_cero(cliente, tokens, corte, sev):  # noqa: F811
    """Con 20 niños o más en el grupo, una opción que ningún niño tiene dice «0» (n=0), no «<5» ni «—»."""
    from maia_comun import muestra as M
    elegida = None
    for peso in range(1000, 3500, 100):   # un peso mínimo que deje a todos los extremos fuera
        m = _muestra(_y('peso_nacer', 'numero', [peso, None]))
        n = M.contar(sev, m)
        cuenta = _facetas(cliente, tokens, muestra=m)['facetas']['eg_categoria']['opciones']
        if n >= 20 and any(o['n'] == 0 for o in cuenta):
            elegida = (m, n, cuenta)
            break
    assert elegida, 'el corte de prueba no tiene un grupo con una categoría de edad gestacional vacía'
    m, n, cuenta = elegida
    ceros = [o for o in cuenta if o['n'] == 0]
    assert all(o['texto'] == '0' for o in ceros)
    # y es un cero verdadero: ningún niño del grupo tiene esa categoría
    grupo = set(M.ids(sev, m))
    eg = sev.sujetos.set_index('sujeto').eg_semanas
    for o in ceros:
        assert not any(M.categoria_eg(eg[x]) == o['valor'] for x in grupo)
    # el visualizador también ve el cero (0 redondeado sigue siendo 0)
    fv = _facetas(cliente, tokens, 'visualizador', muestra=m)['facetas']['eg_categoria']['opciones']
    assert [o['valor'] for o in fv if o['n'] == 0] == [o['valor'] for o in ceros]


def test_categorias_de_edad_gestacional_no_son_un_rango(cliente, tokens, corrida, sev):  # noqa: F811
    """Elegir «muy prematuro» y «a término» deja afuera a los moderados: cada categoría vale por sí sola."""
    from maia_comun import muestra as M
    m = _muestra(_y('eg_categoria', 'lista', ['muy_prematuro', 'a_termino']))
    eg = sev.sujetos.set_index('sujeto').eg_semanas
    esperado = sorted(x for x in eg.index if M.categoria_eg(eg[x]) in ('muy_prematuro', 'a_termino'))
    assert sorted(M.ids(sev, m)) == esperado
    por_categoria = {c: sum(M.categoria_eg(eg[x]) == c for x in eg.index) for c in M.NOMBRES_EG}
    assert por_categoria['moderado_tardio'] > 0   # si no hubiera moderados la prueba no probaría nada
    e = _resumen(cliente, tokens, 'admin', corrida_id=corrida, muestra=m).json()
    assert e['ninos'] == len(esperado) == por_categoria['muy_prematuro'] + por_categoria['a_termino']
    # la faceta no cambia con su propio filtro, y tampoco con el de semanas (es la misma dimensión)
    sin = {o['valor']: o['n'] for o in _facetas(cliente, tokens, muestra=_muestra())['facetas']['eg_categoria']['opciones']}
    con = {o['valor']: o['n'] for o in _facetas(cliente, tokens, muestra=m)['facetas']['eg_categoria']['opciones']}
    assert con == sin
    # una categoría que no existe es un 422 con el motivo
    mala = _resumen(cliente, tokens, corrida_id=corrida, muestra=_muestra(_y('eg_categoria', 'lista', ['casi_termino'])))
    assert mala.status_code == 422 and 'casi_termino' in mala.json()['detail']
    # el rango de semanas sigue existiendo, ahora como número
    f = _facetas(cliente, tokens, muestra=_muestra())['facetas']['eg_semanas']
    assert f['tipo'] == 'numero' and f['min'] is not None and 'opciones' not in f


def test_el_tiempo_filtra_y_viaja_en_la_muestra_guardada(cliente, tokens, corrida, sev):  # noqa: F811
    from maia_comun import muestra as M
    t = {'fecha': 'fecha_nacimiento', 'modo': 'periodo', 'desde': '2018-01-01', 'hasta': '2019-12-31'}
    m = {**_muestra(), 'tiempo': t}
    ids = M.ids(sev, m)
    assert 20 <= len(ids) < len(sev.sujetos)
    e = _resumen(cliente, tokens, corrida_id=corrida, muestra=m).json()
    assert e['filtrado'] is True and e['ninos'] == len(ids)
    f = _facetas(cliente, tokens, muestra=m)
    assert f['n'] == len(ids)
    assert sum(o['n'] for o in f['facetas']['sede']['opciones']) == len(ids)
    g = cliente.post('/api/muestras', headers=tokens['experto'], json={'titulo': 'Nacidos 2018-2019', 'muestra': m}).json()
    assert g['definicion']['tiempo'] == t
    assert _resumen(cliente, tokens, corrida_id=corrida, muestra_id=g['id']).json()['ninos'] == len(ids)
    # lo que ofrece el corte: fecha de nacimiento primero
    assert f['tiempo']['defecto'] == 'fecha_nacimiento' and f['tiempo']['hay_fecha_nacimiento'] is True
    assert [c['valor'] for c in f['tiempo']['campos']] == ['fecha_nacimiento', 'anio_nacimiento', 'fecha_visita']
    assert f['tiempo']['desde'] <= 2018 and f['tiempo']['hasta'] >= 2019


def test_sin_fecha_de_parto_el_tiempo_cae_al_anio(cliente, tokens, corte, sev):  # noqa: F811
    from maia_comun import db
    from maia_comun import sevarti_db as SDB
    from maia_comun.modelos_db import Corte
    sub = sev.subconjunto(list(sev.sujetos.sujeto[:300]))
    anios = sub.sujetos.fecha_nacimiento.dt.year
    sin = replace(sub, sujetos=sub.sujetos.assign(anio_nacimiento=anios, fecha_nacimiento=np.datetime64('NaT')))
    cid = SDB.guardar_en_db(db.motor(), sin, 'kmc')
    try:
        c = _corrida(cid, list(sub.sujetos.sujeto), semilla=9)
        f = _facetas(cliente, tokens, corrida_id=c)
        assert f['tiempo']['defecto'] == 'anio_nacimiento' and f['tiempo']['hay_fecha_nacimiento'] is False
        assert [x['valor'] for x in f['tiempo']['campos']] == ['anio_nacimiento', 'fecha_visita']
        m = {**_muestra(), 'tiempo': {'fecha': 'fecha_nacimiento', 'modo': 'periodo', 'desde': '2018', 'hasta': '2019'}}
        esperado = int(anios.between(2018, 2019).sum())
        assert 20 <= esperado < 300
        assert _facetas(cliente, tokens, corrida_id=c, muestra=m)['n'] == esperado
    finally:
        with db.fabrica()() as s:
            s.delete(s.get(Corte, cid))
            s.commit()


def test_el_muestreo_viaja_pero_las_cifras_son_las_del_grupo(cliente, tokens, corrida, sev):  # noqa: F811
    from maia_comun import muestra as M
    mu = {'modo': 'estratificado', 'por': 'sede', 'maximo_por_categoria': 30, 'semilla': 11}
    m = {**_muestra(), 'muestreo': mu}
    con_tope = M.ids(sev, m)
    sin_tope = M.ids(sev, m, muestreo=False)
    assert len(con_tope) < len(sin_tope)
    e = _resumen(cliente, tokens, 'admin', corrida_id=corrida, muestra=m).json()
    assert e['ninos'] == len(sin_tope)   # Explorar muestra el grupo completo...
    assert e['muestreo'] == {'modo': 'estratificado', 'por': 'sede', 'maximo_por_categoria': 30, 'ninos': len(con_tope)}
    assert _resumen(cliente, tokens, 'admin', corrida_id=corrida, muestra=_muestra()).json()['muestreo'] is None
    f = _facetas(cliente, tokens, muestra=m)
    assert [p['valor'] for p in f['muestreo']['por']][:1] == ['sede']   # ...y ofrece con qué categorías estratificar


def test_variables_de_medicion_con_su_regla_de_lectura(cliente, tokens, corrida, sev):  # noqa: F811
    """Una variable que se mide en cada visita entra como faceta al filtrarla o agregarla, con la regla que se eligió."""
    from maia_comun import muestra as M
    base = _facetas(cliente, tokens, muestra=_muestra())
    assert 'oxigeno_3m' not in base['facetas']
    assert 'oxigeno_3m' in {d['variable'] for d in base['disponibles']}   # se puede agregar con «+ Agregar variable»
    med = next(d for d in base['disponibles'] if d['variable'] == 'oxigeno_3m')
    assert med['reglas'] == ['primera', 'ultima', 'alguna'] and med['cuando'] == 'alguna'
    assert [e['etapa'] for e in base['etapas']][:1] == ['prenatal']
    # agregada sin filtro: cuenta con la regla pedida
    for cuando in ('primera', 'ultima', 'alguna', 'etapa:3 m EC'):
        f = _facetas(cliente, tokens, muestra=_muestra(), variables=[{'variable': 'oxigeno_3m', 'cuando': cuando}])
        fa = f['facetas']['oxigeno_3m']
        assert fa['cuando'] == cuando and fa['reglas'] == ['primera', 'ultima', 'alguna']
        med_ox = sev.mediciones[(sev.mediciones.variable == 'oxigeno_3m') & sev.mediciones.valor.notna()]
        if cuando == 'alguna':
            esperado = {M.canonico(v): int(g.sujeto.nunique()) for v, g in med_ox.groupby(med_ox.valor.map(str))}
        elif cuando == 'primera':
            p = med_ox.drop_duplicates('sujeto', keep='first')
            esperado = {M.canonico(v): len(g) for v, g in p.groupby(p.valor.map(str))}
        else:
            esperado = None
        if esperado is not None:
            assert {str(o['valor']): o['n'] for o in fa['opciones']} == {k: v for k, v in esperado.items()}
        assert sum(o['n'] for o in fa['opciones']) > 0
    # filtrada con «alguna»: el filtro, el conteo del grupo y la faceta usan la misma regla (con el código frecuente,
    # para que el grupo pase el mínimo de niños que se muestran)
    m = _muestra(_y('oxigeno_3m', 'lista', ['9'], 'alguna'))
    ids = M.ids(sev, m)
    f = _facetas(cliente, tokens, muestra=m)
    assert f['n'] == len(ids) > 0 and f['facetas']['oxigeno_3m']['cuando'] == 'alguna'
    assert _resumen(cliente, tokens, corrida_id=corrida, muestra=m).json()['ninos'] == len(ids)
    # una etapa que no existe es un 422 claro
    r = cliente.post('/api/exploracion/facetas', headers=tokens['experto'], json={
        'muestra': _muestra(), 'variables': [{'variable': 'oxigeno_3m', 'cuando': 'etapa:no_hay'}]})
    assert r.status_code == 422 and 'no_hay' in r.json()['detail']
