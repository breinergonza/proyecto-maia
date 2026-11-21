"""Analítica: trayectorias de crecimiento, perfiles provisionales y anticipación. Solo agregados; cada celda con su
cifra aunque sean 1 a 4 niños; los niños individuales solo para experto y administrador."""
from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integracion

ADMIN = ('admin@maia.prueba', 'clave-admin-de-prueba')
EXPERTO = ('experto@maia.prueba', 'clave-experto-de-prueba')
VISOR = ('visor@maia.prueba', 'clave-visor-de-prueba')


@pytest.fixture(scope='module')
def cliente(url_db_propia, tmp_path_factory):
    from maia_api import estado as E
    from maia_api import seguridad as SG
    from maia_comun import config, db
    tmp = tmp_path_factory.mktemp('api_analitica_tray')
    mp = pytest.MonkeyPatch()
    for k, v in {'DATABASE_URL': url_db_propia, 'MAIA_ENTORNO': 'local', 'MAIA_SOLO_SIMULADO': 'false',
                 'MAIA_CIFRADO_CLAVE': 'llave-de-cifrado-de-prueba-con-32-caracteres',
                 'MAIA_JWT_SECRETO': 'secreto-jwt-de-prueba-con-mas-de-32-caracteres', 'MAIA_PAQUETE_CLAVE': 'p' * 20,
                 'MAIA_ADMIN_EMAIL': ADMIN[0], 'MAIA_ADMIN_CLAVE': ADMIN[1], 'MAIA_DIR_PAQUETES': str(tmp / 'paquetes'),
                 'MAIA_DEMO_SUJETOS': '300', 'KMC_PW': ''}.items():
        mp.setenv(k, v)
    mp.delenv('MAIA_EJECUCION_ID', raising=False)
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
def tokens(cliente):
    admin = _login(cliente, *ADMIN)
    for (email, clave), rol in ((EXPERTO, 'experto'), (VISOR, 'visualizador')):
        r = cliente.post('/api/usuarios', headers=admin, json={'email': email, 'nombre': rol, 'rol': rol, 'clave': clave})
        assert r.status_code == 201, r.text
    return {'admin': admin, 'experto': _login(cliente, *EXPERTO), 'visualizador': _login(cliente, *VISOR)}


N = 40          # niños; los 8 primeros con riesgo alto; las 3 últimas son niñas (grupo de 3)


@pytest.fixture(scope='module')
def datos(cliente):
    """Un corte con crecimiento, riesgos y un entrenamiento con analítica (rendimiento y una familia de anticipación)."""
    from maia_comun import db
    from maia_comun import modelos_db as M
    from maia_entrenamiento import analitica_clinica as AL
    rng = np.random.default_rng(1)
    with db.sesion() as s:
        corte = M.Corte(fuente='simulado', fecha_corte=date(2026, 6, 30), filas={}, vigente=True)
        s.add(corte)
        s.flush()
        c = corte.id
        s.add_all([M.Etapa(corte_id=c, etapa='40 sem', orden=0, base='eg', nombre='40 semanas'),
                   M.Etapa(corte_id=c, etapa='3 m EC', orden=1, base='ec', nombre='3 meses'),
                   M.Etapa(corte_id=c, etapa='6 m EC', orden=2, base='ec', nombre='6 meses'),
                   M.Esquema(corte_id=c, variable='peso40', datos={'concepto': 'peso', 'unidad': 'g', 'etapa': '40 sem'}),
                   M.Esquema(corte_id=c, variable='peso3', datos={'concepto': 'peso', 'unidad': 'kg', 'etapa': '3 m EC'})])
        corrida = M.Corrida(corte_id=c, fuente='simulado', tipo='completa', estado='ok')
        s.add(corrida)
        s.flush()
        mid = 1
        for i in range(N):
            suj = f'N{i:03d}'
            s.add(M.Sujeto(corte_id=c, sujeto=suj, grupo='sede A', fecha_nacimiento=date(2026, 1, 1),
                         eg_semanas=38 if i >= N - 3 else 26 + i % 8))   # las 3 niñas nacen a término
            s.add(M.Medicion(corte_id=c, id=mid, sujeto=suj, variable='ern_sexo', valor='2' if i >= N - 3 else '1'))
            mid += 1
            s.add(M.Riesgo(corrida_id=corrida.id, sujeto=suj, clave='readm_3m', desenlace='readmisión', momento='40 sem',
                           riesgo=0.5, percentil=95.0 if i < 8 else 50.0, motivos=[]))
            for etapa, var, ec, valor in (('40 sem', 'peso40', 0, 2500.0), ('3 m EC', 'peso3', 90, 5.5),
                                          ('6 m EC', 'peso3', 180, 7.0)):
                if etapa == '6 m EC' and i >= 4:
                    continue          # solo 4 niños a los 6 meses: la celda se omite
                s.add(M.Crecimiento(corrida_id=corrida.id, sujeto=suj, etapa=etapa, indicador='peso', variable=var,
                                    fecha=date(2026, 1, 1) + timedelta(days=ec), edad_corregida=float(ec), valor=valor + float(rng.normal()),
                                    z=float(rng.normal(-1.0 if i < 8 else 0.2, 0.5))))
        corrida_id = corrida.id
    preds = {}
    for desde, ventaja_momento in (('3', '3 m EC'), ('6', '6 m EC')):
        r = rng.random(200)
        y = rng.random(200) < r * 0.4
        preds[f'talla_baja_12m_desde_{desde}'] = {
            'r': r, 'y': y, 'variables': pd.DataFrame({'x': r}, index=[f'N{i:03d}' for i in range(200)]),
            'desenlace': SimpleNamespace(nombre='talla baja a los 12 meses (riesgo calculado a x)',
                                         momento=ventaja_momento, etapa='12 m EC')}
    anticipacion = AL.anticipacion_artefactos(preds, {'40 sem': 0, '3 m EC': 1, '6 m EC': 2, '12 m EC': 4})
    meta = {'fuente': 'simulado', 'registro': 'maia-clinico-demo', 'version_registro': '3', 'version_modelo': 'abc',
            'corte': '2026-06-30'}
    con = AL.guardar({**{'readm_3m': {'rendimiento': {'auc_desenlace': {'auc': 0.7}}}},
                      **{f: {'anticipacion': d} for f, d in anticipacion.items()}},
                     [{'clave': 'readm_3m', 'nombre': 'readmisión', 'momento': '40 sem', 'etiqueta': 'En uso'}], meta)
    sin = AL.guardar({'readm_3m': {'rendimiento': {'auc_desenlace': {'auc': 0.7}}}},
                     [{'clave': 'readm_3m', 'nombre': 'readmisión', 'momento': '40 sem', 'etiqueta': 'En uso'}], meta)
    return {'con': con, 'sin': sin, 'corrida': corrida_id}


def _get(cliente, tokens, rol, ruta, **params):
    return cliente.get(f'/api/analitica/{ruta}', params=params, headers=tokens[rol])


def test_trayectorias_por_riesgo(cliente, tokens, datos):
    r = _get(cliente, tokens, 'visualizador', f'{datos["con"]}/trayectorias', indicador='peso', agrupar='riesgo')
    assert r.status_code == 200, r.text
    j = r.json()
    assert j['estado'] == 'ok' and j['referencia'].startswith('OMS')
    por = {g['grupo']: g for g in j['grupos']}
    assert set(por) == {'Riesgo alto', 'Resto'}
    alto = {e['etapa']: e for e in por['Riesgo alto']['etapas']}
    resto = {e['etapa']: e for e in por['Resto']['etapas']}
    assert alto['40 sem']['n'] == 8 and alto['40 sem']['z_desvio'] is None, 'el desvío pide 20 o más'
    assert resto['40 sem']['n'] == 32 and resto['40 sem']['z_desvio'] is not None
    assert alto['40 sem']['diferencia_oms'] < resto['40 sem']['diferencia_oms']
    assert alto['40 sem']['unidad'] == 'g' and alto['3 m EC']['unidad'] == 'kg'
    assert alto['3 m EC']['edad_media_meses'] == pytest.approx(90 / 30.4375, abs=0.01)
    assert alto['6 m EC']['n'] == 4, 'a los 6 meses hay 4 niños de riesgo alto: la celda sale con su cifra'
    assert 'celdas_omitidas' not in j and 'grupos_omitidos' not in j and 'minimo_ninos' not in j


def test_visualizador_no_ve_ninos_individuales(cliente, tokens, datos):
    ruta = f'{datos["con"]}/trayectorias'
    v = _get(cliente, tokens, 'visualizador', ruta).json()
    assert v['individuales'] == [] and v['individuales_visibles'] is False
    for rol in ('experto', 'admin'):
        j = _get(cliente, tokens, rol, ruta).json()
        assert j['individuales_visibles'] is True and 0 < len(j['individuales']) <= 30
        n = j['individuales'][0]
        assert n['codigo'].startswith('N') and n['serie'] and {'etapa', 'z', 'edad_meses'} <= set(n['serie'][0])


def test_grupo_de_menos_de_5_ninos_sale_con_su_cifra(cliente, tokens, datos):
    j = _get(cliente, tokens, 'experto', f'{datos["con"]}/trayectorias', agrupar='sexo').json()
    por = {g['grupo']: g for g in j['grupos']}
    assert set(por) == {'masculino', 'femenino'} and por['femenino']['ninos'] == 3
    assert por['femenino']['etapas'][0]['n'] == 3 and por['femenino']['etapas'][0]['z_media'] is not None
    assert 0 < len(j['individuales']) <= 30
    v = _get(cliente, tokens, 'visualizador', f'{datos["con"]}/trayectorias', agrupar='sexo').json()
    assert v['individuales'] == [] and {g['grupo'] for g in v['grupos']} == {'masculino', 'femenino'}


def test_otros_agrupamientos_y_ejes(cliente, tokens, datos):
    ruta = f'{datos["con"]}/trayectorias'
    j = _get(cliente, tokens, 'visualizador', ruta, agrupar='perfil', eje='cronologica').json()
    assert j['estado'] == 'ok' and j['eje'] == 'cronologica'
    etapa = {e['etapa']: e for e in j['grupos'][0]['etapas']}['3 m EC']
    assert etapa['edad_media_meses'] == pytest.approx(90 / 30.4375, abs=0.01)
    sede = _get(cliente, tokens, 'visualizador', ruta, agrupar='sede').json()
    assert sede['estado'] == 'pendiente' and 'sola sede' in sede['mensaje']
    ppt = _get(cliente, tokens, 'visualizador', ruta, indicador='peso_para_talla').json()
    assert ppt['etiqueta'] == 'En prueba' and ppt['estado'] == 'pendiente'
    assert _get(cliente, tokens, 'visualizador', ruta, indicador='otro').status_code == 422


def test_sexo_de_ambas_fuentes():
    from maia_api.rutas.analitica import sexo_legible
    assert [sexo_legible(v) for v in ('1', '2', '1.0', 'M', 'f', ' F ', 'Femenino')] == \
        ['masculino', 'femenino', 'masculino', 'masculino', 'femenino', 'femenino', 'femenino']
    assert sexo_legible(None) is None and sexo_legible('x') is None


def test_sin_riesgo_para_el_desenlace_se_explica(cliente, tokens, datos):
    """La corrida solo calcula el riesgo de los niños en seguimiento: sin riesgo del desenlace no hay tasa."""
    t = _get(cliente, tokens, 'visualizador', f'{datos["con"]}/trayectorias', agrupar='riesgo', desenlace='otro').json()
    assert t['estado'] == 'pendiente' and t['motivo'] == 'sin_riesgo' and 'seguimiento' in t['mensaje']
    p = _get(cliente, tokens, 'visualizador', f'{datos["con"]}/perfiles', desenlace='otro').json()
    assert p['riesgo_disponible'] is False and p['n_con_riesgo'] == 0 and 'seguimiento' in p['mensaje_riesgo']
    con = _get(cliente, tokens, 'visualizador', f'{datos["con"]}/perfiles', desenlace='readm_3m').json()
    assert con['riesgo_disponible'] is True and 'mensaje_riesgo' not in con


def test_usa_lo_guardado_por_el_entrenamiento(cliente, tokens, datos):
    """Con ``trayectorias_riesgo`` y ``perfiles`` guardados (niños de validación), la API los usa en vez de la corrida."""
    from maia_entrenamiento import analitica_clinica as AL
    tray = {'peso': {'grupos': [{'grupo': 'Riesgo alto', 'ninos': 50, 'etapas': [{'etapa': '40 sem', 'nombre': '40 semanas',
                                                                             'orden': 0, 'n': 50, 'z_media': -1.0}]},
                                {'grupo': 'Resto', 'ninos': 450, 'etapas': [{'etapa': '40 sem', 'nombre': '40 semanas',
                                                                        'orden': 0, 'n': 450, 'z_media': 0.1}]}],
                     'grupos_omitidos': 0, 'celdas_omitidas': 0}}
    # lo guardado antes de abandonar D4 trae ``oculto``: no sale en la respuesta
    perf = {'eg': [{'categoria': 'extremo', 'etiqueta': 'Prematuro extremo', 'n': 40, 'oculto': False,
                    'tasa_observada': 0.3, 'tasa_riesgo_alto': 0.4, 'eg_media': 26.0, 'peso_medio': None}],
            'lubchenco': [], 'ninos': 500, 'casos': 80, 'top_riesgo_alto': 10}
    meta = {'fuente': 'simulado', 'registro': 'maia-clinico-demo', 'version_registro': '4', 'corte': '2026-06-30'}
    ent = AL.guardar({'otro_3m': {'rendimiento': {'auc_desenlace': {'auc': 0.7}}, 'trayectorias_riesgo': tray, 'perfiles': perf}},
                     [{'clave': 'otro_3m', 'nombre': 'otro', 'momento': '40 sem', 'etiqueta': 'En uso'}], meta)
    t = _get(cliente, tokens, 'visualizador', f'{ent}/trayectorias', agrupar='riesgo', desenlace='otro_3m').json()
    assert t['estado'] == 'ok' and t['fuente'] == 'validacion' and t['individuales'] == []
    assert [g['grupo'] for g in t['grupos']] == ['Riesgo alto', 'Resto']
    cron = _get(cliente, tokens, 'visualizador', f'{ent}/trayectorias', agrupar='riesgo', desenlace='otro_3m', eje='cronologica').json()
    assert cron.get('fuente') != 'validacion', 'lo guardado es por edad corregida'
    p = _get(cliente, tokens, 'visualizador', f'{ent}/perfiles', desenlace='otro_3m').json()
    assert p['fuente'] == 'validacion' and p['riesgo_disponible'] is True and p['ninos'] == 500
    assert p['eg'][0]['tasa_observada'] == 0.3 and p['eg'][0]['tasa'] == 0.4 and 'oculto' not in p['eg'][0]
    assert 'categorias_ocultas' not in p


def test_perfiles(cliente, tokens, datos):
    j = _get(cliente, tokens, 'visualizador', f'{datos["con"]}/perfiles', desenlace='readm_3m').json()
    assert j['estado'] == 'ok' and j['confianza']['aprobacion'] == 'pendiente' and 'minimo_ninos' not in j['confianza']
    eg = {f['categoria']: f for f in j['eg']}
    assert eg['extremo']['n'] is not None and 'oculto' not in eg['extremo']
    assert 0 < eg['a_termino']['n'] < 5 and eg['a_termino']['tasa'] is not None, 'un grupo de 1 a 4 niños dice su cifra'
    assert eg['a_termino']['eg_media'] is not None
    assert eg['muy_prematuro']['eg_media'] is not None
    assert 'categorias_ocultas' not in j


def test_entrenamiento_sin_artefactos(cliente, tokens, datos):
    for sub in ('trayectorias', 'perfiles', 'anticipacion'):
        j = _get(cliente, tokens, 'visualizador', f'987654/{sub}').json()
        assert j['estado'] == 'sin_artefactos'


def test_anticipacion(cliente, tokens, datos):
    j = _get(cliente, tokens, 'visualizador', f'{datos["con"]}/anticipacion').json()
    assert j['estado'] == 'ok'
    fam = j['desenlaces']['talla_baja_12m']
    assert fam['etiqueta'] == 'En prueba' and [v['desde'] for v in fam['visitas']] == ['3 m EC', '6 m EC']
    assert [v['ventaja_visitas'] for v in fam['visitas']] == [3, 2]
    assert all(v['casos_detectados_pct'] is not None for v in fam['visitas'])
    assert 0 <= fam['avisados_antes']['pct'] <= 100
    estados = {s['id']: s['estado'] for s in _get(cliente, tokens, 'visualizador', 'contexto',
                                                  entrenamiento=datos['con']).json()['submodulos']}
    assert estados['anticipacion'] == 'ok' and estados['trayectorias'] == 'ok' and estados['perfiles'] == 'ok'


def test_anticipacion_pendiente_sin_familias(cliente, tokens, datos):
    j = _get(cliente, tokens, 'visualizador', f'{datos["sin"]}/anticipacion').json()
    assert j['estado'] == 'pendiente' and 'desde varias visitas' in j['mensaje']
