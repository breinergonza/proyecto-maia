"""Calidad de datos: la cola de datos por revisar y sus dos medidas, para administración y expertos clínicos (quien
solo consulta no entra). Se siembra una corrida pequeña a mano (sin entrenar nada) contra Postgres real."""
from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integracion

ADMIN = ('admin@maia.prueba', 'clave-admin-de-prueba')
EXPERTO = ('experto@maia.prueba', 'clave-experto-de-prueba')
CONSULTA = ('consulta@maia.prueba', 'clave-consulta-de-prueba')
CLINICO = ('clinico@maia.prueba', 'clave-clinico-de-prueba')
TOTAL_ALERTAS = 120


@pytest.fixture(scope='module')
def cliente(url_db_propia, tmp_path_factory):
    from maia_api import estado as E
    from maia_api import seguridad as SG
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('api_calidad')
    mp = pytest.MonkeyPatch()
    for k, v in {'DATABASE_URL': url_db_propia, 'MAIA_ENTORNO': 'local', 'MAIA_SOLO_SIMULADO': 'false',
                 'MAIA_CIFRADO_CLAVE': 'llave-de-cifrado-de-prueba-con-32-caracteres',
                 'MAIA_JWT_SECRETO': 'secreto-jwt-de-prueba-con-mas-de-32-caracteres', 'MAIA_PAQUETE_CLAVE': 'p' * 20,
                 'MAIA_ADMIN_EMAIL': ADMIN[0], 'MAIA_ADMIN_CLAVE': ADMIN[1], 'MAIA_DIR_PAQUETES': str(tmp / 'paquetes'),
                 'MAIA_DEMO_SUJETOS': '300', 'KMC_PW': ''}.items():
        mp.setenv(k, v)
    mp.chdir(tmp)
    config.obtener.cache_clear()
    db.motor.cache_clear()
    E.limpiar()
    SG.limite_login.limpiar()
    from maia_api.main import crear_app
    with TestClient(crear_app()) as c:
        yield c
    E.limpiar()
    mp.undo()
    config.obtener.cache_clear()
    db.motor.cache_clear()


def _login(c: TestClient, email: str, clave: str) -> dict:
    from maia_api import seguridad as SG
    SG.limite_login.limpiar()
    r = c.post('/api/auth/login', json={'email': email, 'clave': clave})
    assert r.status_code == 200, r.text
    return {'Authorization': f'Bearer {r.json()["acceso"]}'}


@pytest.fixture(scope='module')
def admin(cliente):
    return _login(cliente, *ADMIN)


@pytest.fixture(scope='module')
def experto(cliente, admin):
    r = cliente.post('/api/usuarios', headers=admin,
                     json={'email': EXPERTO[0], 'nombre': 'Experta', 'rol': 'datos', 'clave': EXPERTO[1]})
    assert r.status_code == 201, r.text
    return _login(cliente, *EXPERTO)


@pytest.fixture(scope='module')
def consulta(cliente, admin):
    r = cliente.post('/api/usuarios', headers=admin,
                     json={'email': CONSULTA[0], 'nombre': 'Consulta', 'rol': 'visualizador', 'clave': CONSULTA[1]})
    assert r.status_code == 201, r.text
    return _login(cliente, *CONSULTA)


@pytest.fixture(scope='module')
def corrida(cliente, admin):
    """120 alertas: 'peso' (60: 40 de la sede A, 20 de la B), 'talla' (57: 30 y 27) y 'cefalico' (3, de la A)."""
    from maia_comun import db
    from maia_comun.modelos_db import AlertaDato, Corrida, Corte, Sujeto
    with db.sesion() as s:
        corte = Corte(fuente='simulado', fecha_corte=date(2020, 1, 1), filas={})
        s.add(corte)
        s.flush()
        reparto = [('peso', 'A', 40), ('peso', 'B', 20), ('talla', 'A', 30), ('talla', 'B', 27), ('cefalico', 'A', 3)]
        sujetos = {}
        alertas = []
        for variable, grupo, n in reparto:
            for _ in range(n):
                suj = f'{grupo}{len(alertas)}'
                sujetos[suj] = grupo
                alertas.append((suj, variable))
        s.add_all([Sujeto(corte_id=corte.id, sujeto=suj, grupo=g) for suj, g in sujetos.items()])
        c = Corrida(corte_id=corte.id, fuente='simulado', tipo='revision', estado='ok')
        s.add(c)
        s.flush()
        s.add_all([AlertaDato(corrida_id=c.id, sujeto=suj, variable=v, etiqueta=v.title(), capas=['1'], prioridad=i + 1)
                   for i, (suj, v) in enumerate(alertas)])
        s.commit()
        return c.id


def test_la_ven_expertos_y_administracion_pero_no_quien_solo_consulta(cliente, admin, experto, consulta, corrida):
    r = cliente.post('/api/usuarios', headers=admin,
                     json={'email': CLINICO[0], 'nombre': 'Clínico', 'rol': 'experto', 'clave': CLINICO[1]})
    assert r.status_code == 201, r.text
    clinico = _login(cliente, *CLINICO)
    for ruta in ('/api/revision/datos', '/api/revision/datos/resumen', '/api/revision/datos/aciertos',
                 '/api/revision/datos/concentracion'):
        for fuera in (consulta, clinico):     # la cola de mediciones es del experto en datos, no del clínico
            assert cliente.get(ruta, headers=fuera, params={'corrida_id': corrida}).status_code == 403, ruta
        for quien in (experto, admin):
            assert cliente.get(ruta, headers=quien, params={'corrida_id': corrida}).status_code == 200, ruta
    assert cliente.post('/api/revision/datos/1', headers=consulta, json={'es_error': 'si'}).status_code == 403


def test_aciertos_sin_respuestas(cliente, admin, corrida):
    r = cliente.get('/api/revision/datos/aciertos', headers=admin, params={'corrida_id': corrida}).json()
    assert r['respondidas'] == 0 and r['confirmadas_error_pct'] is None
    assert [p['k'] for p in r['serie']] == [50, 100, TOTAL_ALERTAS]
    assert all(p['respondidas'] == 0 and p['precision'] is None for p in r['serie'])


def test_aciertos_con_respuestas(cliente, admin, corrida):
    ids = [d['id'] for d in cliente.get('/api/revision/datos', headers=admin,
                                         params={'corrida_id': corrida, 'tamano': 200}).json()['items']]
    assert len(ids) == TOTAL_ALERTAS
    # de las 50 primeras: 10 respondidas, 4 errores y una «no sé»; de la 51 a la 100: 10 más, 9 errores
    respuestas = {**{ids[i]: 'si' for i in range(4)}, **{ids[i]: 'no' for i in range(4, 9)}, ids[9]: 'no_se',
                  **{ids[50 + i]: 'si' for i in range(9)}, ids[59]: 'no'}
    for alerta, es_error in respuestas.items():
        assert cliente.post(f'/api/revision/datos/{alerta}', headers=admin, json={'es_error': es_error}).status_code == 204
    r = cliente.get('/api/revision/datos/aciertos', headers=admin, params={'corrida_id': corrida}).json()
    por_k = {p['k']: p for p in r['serie']}
    assert por_k[50] == {'k': 50, 'respondidas': 10, 'precision': 40.0}
    assert por_k[100] == {'k': 100, 'respondidas': 20, 'precision': 65.0}
    assert por_k[TOTAL_ALERTAS]['respondidas'] == 20
    assert r['respondidas'] == 20 and r['confirmadas_error_pct'] == 65.0


def test_concentracion_por_sede_y_variable(cliente, admin, corrida):
    r = cliente.get('/api/revision/datos/concentracion', headers=admin, params={'corrida_id': corrida}).json()
    # D63: nada se oculta ni se suma en «otras»; «cefalico», con 3 alertas, sale con su cifra
    assert r['hay_sede'] and not {'minimo_celda', 'otras_variables', 'otras_celdas'} & set(r)
    assert [(v['variable'], v['alertas']) for v in r['por_variable']] == [('peso', 60), ('talla', 57), ('cefalico', 3)]
    assert [(c['grupo'], c['variable'], c['alertas']) for c in r['celdas'][:4]] == [
        ('A', 'peso', 40), ('A', 'talla', 30), ('B', 'talla', 27), ('B', 'peso', 20)]
    assert sum(c['alertas'] for c in r['celdas'] if c['variable'] == 'cefalico') == 3
    assert sum(c['alertas'] for c in r['celdas']) == sum(v['alertas'] for v in r['por_variable'])


def test_concentracion_sin_sede_real_solo_por_variable(cliente, admin, corrida):
    from sqlalchemy import text

    from maia_comun import db
    with db.sesion() as s:
        s.execute(text('UPDATE sevarti.sujetos SET grupo = NULL WHERE corte_id = (SELECT corte_id FROM resultados.corridas WHERE id = :c)'),
                  {'c': corrida})
        s.commit()
    r = cliente.get('/api/revision/datos/concentracion', headers=admin, params={'corrida_id': corrida}).json()
    assert not r['hay_sede'] and r['celdas'] == []
    assert [v['variable'] for v in r['por_variable']] == ['peso', 'talla', 'cefalico']


@pytest.fixture(scope='module')
def corrida_visitas(cliente, admin):
    """Una corrida de 20 niños con dos visitas (40 semanas y 12 meses): quién tiene talla en cada una, y diez alertas
    repartidas entre las dos visitas, dos de ellas ya respondidas."""
    from maia_comun import db
    from maia_comun.modelos_db import AlertaDato, Corrida, Corte, Crecimiento, Etapa, Sujeto
    with db.sesion() as s:
        corte = Corte(fuente='simulado', fecha_corte=date(2020, 2, 1), filas={})
        s.add(corte)
        s.flush()
        s.add_all([Sujeto(corte_id=corte.id, sujeto=f'v{i}') for i in range(20)])   # 20 niños elegibles
        s.add_all([Etapa(corte_id=corte.id, etapa='e40', orden=3, edad_min=-21, edad_max=35, base='corregida', nombre='40 sem'),
                   Etapa(corte_id=corte.id, etapa='e12', orden=6, edad_min=315, edad_max=450, base='corregida', nombre='12 m')])
        c = Corrida(corte_id=corte.id, fuente='simulado', tipo='revision', estado='ok')
        s.add(c)
        s.flush()
        filas = [Crecimiento(corrida_id=c.id, sujeto=f'v{i}', etapa='e40', indicador='peso', valor=3.0, z=0.0) for i in range(10)]
        filas += [Crecimiento(corrida_id=c.id, sujeto=f'v{i}', etapa='e40', indicador='talla', valor=50.0, z=0.0) for i in range(8)]
        filas += [Crecimiento(corrida_id=c.id, sujeto=f'v{i}', etapa='e12', indicador='peso', valor=9.0, z=0.0) for i in range(5)]
        filas += [Crecimiento(corrida_id=c.id, sujeto=f'v{i}', etapa='e12', indicador='talla', valor=75.0, z=0.0) for i in range(2)]
        filas += [Crecimiento(corrida_id=c.id, sujeto='v9', etapa='e12', indicador='talla', valor=None, z=None)]   # sin dato
        s.add_all(filas)
        s.add_all([AlertaDato(corrida_id=c.id, sujeto=f'v{i}', variable='peso' if i < 6 else 'talla', etiqueta='Peso' if i < 6 else 'Talla',
                              etapa='e40' if i < 6 else 'e12', capas=['1'] if i % 2 else ['2'], prioridad=i + 1) for i in range(10)])
        s.commit()
        return c.id


def test_resumen_cifras_y_completitud_por_visita(cliente, admin, corrida_visitas):
    ids = [d['id'] for d in cliente.get('/api/revision/datos', headers=admin, params={'corrida_id': corrida_visitas}).json()['items']]
    for alerta in ids[:2]:
        assert cliente.post(f'/api/revision/datos/{alerta}', headers=admin, json={'es_error': 'si'}).status_code == 204
    r = cliente.get('/api/revision/datos/resumen', headers=admin, params={'corrida_id': corrida_visitas}).json()
    assert (r['por_revisar'], r['revisadas'], r['revisadas_mes']) == (8, 2, 2)
    assert [(e['etapa'], e['etapa_nombre'], e['alertas']) for e in r['etapas']] == [('e40', '40 sem', 6), ('e12', '12 m', 4)]
    assert [(v['variable'], v['etiqueta'], v['alertas']) for v in r['variables']] == [('peso', 'Peso', 6), ('talla', 'Talla', 4)]
    comp = r['completitud']
    assert comp['indicador'] == 'talla'
    # con talla entre los 20 niños elegibles (no solo entre quienes fueron a la visita); la talla vacía no cuenta
    assert comp['etapas'] == [
        {'etapa': 'e40', 'etapa_nombre': '40 sem', 'con_dato': 8, 'elegibles': 20, 'pct': 40.0, 'a_12_meses': False},
        {'etapa': 'e12', 'etapa_nombre': '12 m', 'con_dato': 2, 'elegibles': 20, 'pct': 10.0, 'a_12_meses': True}]


def test_completitud_sin_ninos_elegibles_no_da_cifras(cliente, admin):
    """Una corrida cuyos datos de origen ya no están (sin corte) no sabe cuántos niños eran elegibles: no hay completitud
    que mostrar, en vez de dividir por cero."""
    from maia_comun import db
    from maia_comun.modelos_db import Corrida, Crecimiento
    with db.sesion() as s:
        c = Corrida(corte_id=None, fuente='simulado', tipo='revision', estado='ok')
        s.add(c)
        s.flush()
        s.add(Crecimiento(corrida_id=c.id, sujeto='x1', etapa='e40', indicador='talla', valor=50.0, z=0.0))
        s.commit()
        corrida_sin_corte = c.id
    r = cliente.get('/api/revision/datos/resumen', headers=admin, params={'corrida_id': corrida_sin_corte})
    assert r.status_code == 200, r.text
    assert r.json()['completitud']['etapas'] == []


def test_cola_se_filtra_por_visita_y_conserva_su_contrato(cliente, admin, corrida_visitas):
    r = cliente.get('/api/revision/datos', headers=admin, params={'corrida_id': corrida_visitas, 'etapa': 'e12', 'estado': 'todos'}).json()
    assert r['total'] == 4 and {d['etapa'] for d in r['items']} == {'e12'} and {d['etapa_nombre'] for d in r['items']} == {'12 m'}
    todas = cliente.get('/api/revision/datos', headers=admin, params={'corrida_id': corrida_visitas, 'estado': 'todos'}).json()
    assert todas['total'] == 10   # sin el filtro nuevo, igual que antes
    assert {'id', 'sujeto', 'variable', 'etiqueta', 'valor', 'capas', 'motivo', 'es_error', 'comentario', 'serie'} <= set(todas['items'][0])


def test_cada_dato_dice_quien_lo_reviso_y_cuando(cliente, admin, corrida_visitas):
    """Quien revisa ve las respuestas de todo el equipo a cada dato: quién, qué respondió y cuándo (la última vez que
    respondió, aunque haya cambiado de opinión), la más reciente primero."""
    r = cliente.post('/api/usuarios', headers=admin, json={'email': 'segunda@maia.prueba', 'nombre': 'Segunda Revisora',
                                                             'rol': 'admin', 'clave': 'clave-segunda-de-prueba'})
    assert r.status_code == 201, r.text
    segunda = _login(cliente, 'segunda@maia.prueba', 'clave-segunda-de-prueba')
    todas = cliente.get('/api/revision/datos', headers=admin, params={'corrida_id': corrida_visitas, 'estado': 'todos'}).json()
    alerta = todas['items'][-1]
    assert alerta['revisiones'] == []   # nadie la respondió todavía
    assert cliente.post(f"/api/revision/datos/{alerta['id']}", headers=admin, json={'es_error': 'si'}).status_code == 204
    assert cliente.post(f"/api/revision/datos/{alerta['id']}", headers=segunda, json={'es_error': 'no'}).status_code == 204

    def revisiones():
        items = cliente.get('/api/revision/datos', headers=admin, params={'corrida_id': corrida_visitas, 'estado': 'todos'}).json()['items']
        return next(d for d in items if d['id'] == alerta['id'])['revisiones']

    antes = revisiones()
    assert [(x['usuario'], x['propia'], x['es_error']) for x in antes][0] == ('Segunda Revisora', False, 'no')
    assert [(x['propia'], x['es_error']) for x in antes] == [(False, 'no'), (True, 'si')]
    assert all(set(x) == {'usuario', 'propia', 'es_error', 'cuando'} and x['cuando'] for x in antes)
    # cambiar la respuesta la vuelve la más reciente, con la hora de ese cambio
    assert cliente.post(f"/api/revision/datos/{alerta['id']}", headers=admin, json={'es_error': 'no_se'}).status_code == 204
    despues = revisiones()
    assert [(x['propia'], x['es_error']) for x in despues] == [(True, 'no_se'), (False, 'no')]
    assert despues[0]['cuando'] >= antes[0]['cuando']


def test_un_experto_responde_y_queda_con_su_nombre(cliente, admin, experto, corrida_visitas):
    todas = cliente.get('/api/revision/datos', headers=experto, params={'corrida_id': corrida_visitas, 'estado': 'todos'}).json()
    alerta = todas['items'][-2]
    assert alerta['revisiones'] == []
    assert cliente.post(f"/api/revision/datos/{alerta['id']}", headers=experto, json={'es_error': 'no'}).status_code == 204
    items = cliente.get('/api/revision/datos', headers=admin, params={'corrida_id': corrida_visitas, 'estado': 'todos'}).json()['items']
    revisiones = next(d for d in items if d['id'] == alerta['id'])['revisiones']
    assert [(x['usuario'], x['propia'], x['es_error']) for x in revisiones] == [('Experta', False, 'no')]
