"""Muestras en Postgres: atributos por niño, el SQL de los filtros y que dé lo mismo que el motor en memoria."""
from dataclasses import replace

import pandas as pd
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from maia_comun import atributos as AT
from maia_comun import filtros_sql as F
from maia_comun import muestra as M
from maia_comun import sevarti_db as SDB


def _y(variable, tipo, valores, cuando=None):
    e = {'variable': variable, 'tipo': tipo, 'op': M.OPERADOR[tipo], 'valores': valores}
    return {**e, 'cuando': cuando} if cuando else e


def _muestra(*y, tiempo=None, muestreo=None):
    m = {'version': 2, 'y': list(y)}
    if tiempo:
        m['tiempo'] = tiempo
    if muestreo:
        m['muestreo'] = muestreo
    return m


@pytest.fixture(scope='module')
def sev(sev_demo):
    esquema = sev_demo.esquema.copy()
    esquema.loc[esquema.variable == 'hematocrito', 'codigos_especiales'] = '-1'
    return replace(sev_demo, esquema=esquema)


@pytest.fixture(scope='module')
def motor(url_db_propia):
    m = create_engine(url_db_propia)
    yield m
    m.dispose()


@pytest.fixture(scope='module')
def corte_id(motor, sev):
    return SDB.guardar_en_db(motor, sev, 'simulado')


CASOS = {
    'sin filtros': _muestra(),
    'lista categórica': _muestra(_y('sexo', 'lista', ['M'])),
    'rango numérico': _muestra(_y('peso_nacer', 'numero', [1500, 2500])),
    'extremo abierto': _muestra(_y('talla_nacer', 'numero', [None, 40])),
    'sí/no con códigos': _muestra(_y('oxigeno_3m', 'si_no', [True], 'primera')),
    'sede': _muestra(_y('sede', 'lista', [1, 3])),
    'edad gestacional': _muestra(_y('eg_semanas', 'numero', [28, 32])),
    'categorías de edad gestacional': _muestra(_y('eg_categoria', 'lista', ['muy_prematuro', 'a_termino'])),
    'una categoría y la fecha': _muestra(_y('eg_categoria', 'lista', ['moderado_tardio']),
                                         tiempo={'fecha': 'fecha_nacimiento', 'modo': 'periodo', 'desde': '2016'}),
    'estratificada por categoría de edad gestacional': _muestra(muestreo={
        'modo': 'estratificado', 'por': 'eg_categoria', 'maximo_por_categoria': 40, 'semilla': 3}),
    'primera medición': _muestra(_y('peso_3m', 'numero', [4000, 7000], 'primera')),
    'última medición': _muestra(_y('peso_6m', 'numero', [None, 8000], 'ultima')),
    'código especial -1': _muestra(_y('hematocrito', 'numero', [-1, 0], 'primera')),
    'hematocrito real': _muestra(_y('hematocrito', 'numero', [0, 100], 'primera')),
    'alguna (con memoria)': _muestra(_y('peso_6m', 'numero', [5000, 9000], 'alguna'), _y('sexo', 'lista', ['F'])),
    'etapa (con memoria)': _muestra(_y('talla_3m', 'numero', [55, 70], 'etapa:3 m EC')),
    'varios filtros': _muestra(_y('sexo', 'lista', ['F']), _y('sede', 'lista', [2]),
                               _y('peso_nacer', 'numero', [1000, 2200])),
    'nacimiento por periodo': _muestra(tiempo={'fecha': 'fecha_nacimiento', 'modo': 'periodo',
                                               'desde': '2015-06-01', 'hasta': '2019-03'}),
    'nacimiento solo desde': _muestra(tiempo={'fecha': 'fecha_nacimiento', 'modo': 'periodo', 'desde': '2020'}),
    'año de nacimiento': _muestra(tiempo={'fecha': 'anio_nacimiento', 'modo': 'periodo', 'desde': '2013',
                                          'hasta': '2016'}),
    'visita en el periodo': _muestra(tiempo={'fecha': 'fecha_visita', 'modo': 'periodo', 'desde': '2020-01-01',
                                             'hasta': '2021-06-30'}),
    'últimos meses': _muestra(tiempo={'fecha': 'fecha_nacimiento', 'modo': 'ultimos_meses', 'desde': 40}),
    'filtros y tiempo': _muestra(_y('sexo', 'lista', ['M']), _y('peso_3m', 'numero', [None, 6000], 'ultima'),
                                 tiempo={'fecha': 'fecha_nacimiento', 'modo': 'periodo', 'desde': '2016'}),
    'estratificada por sede': _muestra(muestreo={'modo': 'estratificado', 'por': 'sede', 'maximo_por_categoria': 30,
                                                 'semilla': 5}),
    'estratificada con filtro': _muestra(_y('peso_nacer', 'numero', [None, 2500]),
                                         muestreo={'modo': 'estratificado', 'por': 'sexo',
                                                   'maximo_por_categoria': 50, 'semilla': 1}),
}


@pytest.mark.parametrize('nombre', list(CASOS))
def test_el_sql_da_lo_mismo_que_aplicar_en_python(motor, sev, corte_id, nombre):
    muestra = CASOS[nombre]
    esperado = M.ids(sev, muestra)
    with Session(motor) as s:
        obtenido = F.ids_muestra(s, corte_id, muestra)
    assert obtenido == esperado
    if nombre == 'código especial -1':
        assert esperado == []


def test_los_casos_no_son_triviales(sev):
    cuentas = {n: M.contar(sev, m) for n, m in CASOS.items() if n != 'código especial -1'}
    assert all(0 < c <= len(sev.sujetos) for c in cuentas.values()), cuentas
    assert cuentas['rango numérico'] < len(sev.sujetos)


def test_ids_muestra_sin_muestreo_ignora_el_tope(motor, sev, corte_id):
    m = CASOS['estratificada por sede']
    with Session(motor) as s:
        assert len(F.ids_muestra(s, corte_id, m)) == 90
        assert F.ids_muestra(s, corte_id, m, muestreo=False) == sorted(sev.sujetos.sujeto)


def test_ids_muestra_rechaza_muestras_invalidas(motor, corte_id):
    with Session(motor) as s, pytest.raises(M.MuestraInvalida, match='cuando'):
        F.ids_muestra(s, corte_id, _muestra(_y('peso_3m', 'numero', [1, 2])))


def test_fragmento_es_parametrizado_y_no_se_deja_inyectar(motor, corte_id):
    malo = "x'); DROP TABLE sevarti.sujetos; --"
    f = F.fragmento(_muestra(_y('sexo', 'lista', [malo]), _y('sede', 'lista', [malo])), corte_id, prefijo='p')
    assert 'DROP' not in f.sql and malo in str(f.params)
    assert all(k.startswith('p_') for k in f.params)
    with Session(motor) as s:
        assert s.execute(text(f.sql), f.params).all() == []
        assert s.execute(text('SELECT count(*) FROM sevarti.sujetos')).scalar_one() > 0
        # el fragmento se puede usar como subconsulta de otra
        n = s.execute(text(f'SELECT count(*) FROM sevarti.sujetos t WHERE t.sujeto IN ({f.sql})'), f.params).scalar_one()
        assert n == 0


def test_fragmento_dice_que_alguna_y_etapa_no_van_en_sql(corte_id):
    with pytest.raises(ValueError, match='ids_muestra'):
        F.fragmento(_muestra(_y('peso_6m', 'numero', [1, 2], 'alguna')), corte_id)
    parcial = F.fragmento(_muestra(_y('peso_6m', 'numero', [1, 2], 'alguna')), corte_id, parcial=True)
    assert 'EXISTS' not in parcial.sql


def test_fragmentos_con_distinto_prefijo_se_pueden_juntar(motor, corte_id):
    m1, m2 = _muestra(_y('sexo', 'lista', ['M'])), _muestra(_y('sede', 'lista', [1]))
    a = F.fragmento(m1, corte_id, prefijo='a')
    b = F.fragmento(m2, corte_id, prefijo='b')
    with Session(motor) as s:
        n = s.execute(text(f'SELECT count(*) FROM ({a.sql}) x JOIN ({b.sql}) y USING (sujeto)'),
                      {**a.params, **b.params}).scalar_one()
        assert n == len(F.ids_muestra(s, corte_id, _muestra(*m1['y'], *m2['y']))) > 0


# ------------------------------------------------------------------ atributos y resumen

def test_atributos_guardan_primera_y_ultima_sin_codigos_especiales(motor, sev, corte_id):
    with motor.connect() as cx:
        filas = pd.read_sql_query(text("SELECT sujeto, variable, valor, valor_num FROM sevarti.atributos_sujeto "
                                       "WHERE corte_id = :c AND variable IN ('hematocrito', 'hematocrito@ultima', "
                                       "'peso_3m', 'peso_3m@ultima', 'sexo')"), cx, params={'c': corte_id})
    assert not (filas[filas.variable.str.startswith('hematocrito')].valor_num == -1).any()
    h = sev.mediciones[sev.mediciones.variable == 'hematocrito']
    n_hecho = h[h.valor.astype(float) != -1].sujeto.nunique()
    assert (filas.variable == 'hematocrito').sum() == (filas.variable == 'hematocrito@ultima').sum() == n_hecho
    assert (filas.variable == 'sexo').sum() == len(sev.sujetos)
    assert filas[filas.variable == 'sexo'].valor_num.isna().all()
    assert set(filas[filas.variable == 'sexo'].valor) == {'M', 'F'}


def test_solo_las_variables_filtrables_tienen_atributos():
    esq = pd.DataFrame({'variable': ['a', 'b', 'c', 'd'], 'tipo': ['numeric', 'text', 'date', 'categorical']})
    assert list(AT.variables_filtrables(esq).variable) == ['a', 'd']


def test_resumen_sujeto_cuenta_los_datos_de_cada_nino(motor, sev, corte_id):
    esperado = sev.mediciones[sev.mediciones.valor.notna()]
    h = esperado[esperado.variable == 'hematocrito']
    esperado = esperado.drop(h[h.valor.astype(float) == -1].index).groupby('sujeto').size()
    with motor.connect() as cx:
        r = pd.read_sql_query(text('SELECT sujeto, n_datos FROM sevarti.resumen_sujeto WHERE corte_id = :c'),
                              cx, params={'c': corte_id}).set_index('sujeto').n_datos
    assert len(r) == len(sev.sujetos)
    assert (r.reindex(esperado.index) == esperado).all()
    assert (r.drop(esperado.index) == 0).all()


def test_cargar_atributos_es_idempotente(motor, sev, corte_id):
    def estado():
        with motor.connect() as cx:
            return (tuple(cx.execute(text('SELECT count(*), sum(coalesce(valor_num, 0)) FROM '
                                          'sevarti.atributos_sujeto WHERE corte_id = :c'), {'c': corte_id}).one()),
                    tuple(cx.execute(text('SELECT count(*), sum(n_datos) FROM sevarti.resumen_sujeto '
                                          'WHERE corte_id = :c'), {'c': corte_id}).one()))
    antes = estado()
    puestas = AT.cargar_atributos(motor, corte_id, sev.esquema)
    assert estado() == antes
    assert puestas == {'atributos': antes[0][0], 'resumen': len(sev.sujetos)}


def test_un_corte_cargado_sin_atributos_se_rellena(motor, sev, corte_id):
    """El corte de producción se cargó antes de la migración 0008: sin atributos, Explorar no filtra por nada."""
    with motor.begin() as cx:
        antes = cx.execute(text('SELECT count(*) FROM sevarti.atributos_sujeto WHERE corte_id = :c'), {'c': corte_id}).scalar()
        cx.execute(text('DELETE FROM sevarti.atributos_sujeto WHERE corte_id = :c'), {'c': corte_id})
    assert AT.cortes_sin_atributos(motor) == [corte_id]
    hechos = AT.rellenar_faltantes(motor)
    assert hechos[corte_id]['atributos'] == antes
    assert AT.cortes_sin_atributos(motor) == []
    assert AT.rellenar_faltantes(motor) == {}, 'con todo cargado no hace nada'


def test_cada_categoria_de_edad_gestacional_es_un_tramo_propio(motor, sev, corte_id):
    """Elegir dos categorías separadas no incluye a la del medio (no es un rango continuo)."""
    eg = sev.sujetos.set_index('sujeto').eg_semanas
    sel = {c: {x for x in eg.index if M.categoria_eg(eg[x]) == c} for c in M.NOMBRES_EG}
    assert all(sel.values()), 'el corte de prueba debe tener niños en las cuatro categorías'
    with Session(motor) as s:
        ids = set(F.ids_muestra(s, corte_id, _muestra(_y('eg_categoria', 'lista', ['extremo', 'a_termino']))))
    assert ids == sel['extremo'] | sel['a_termino']
    assert not ids & (sel['muy_prematuro'] | sel['moderado_tardio'])


def test_lecturas_alguna_y_etapa_leen_solo_esa_variable(motor, sev, corte_id):
    ids = sorted(sev.sujetos.sujeto)[:150]
    with Session(motor) as s:
        alguna = F.lecturas(s, corte_id, 'peso_6m', 'alguna', ids)
        etapa = F.lecturas(s, corte_id, 'peso_6m', 'etapa:6 m EC', ids)
        with pytest.raises(M.MuestraInvalida, match='no_hay'):
            F.lecturas(s, corte_id, 'peso_6m', 'etapa:no_hay', ids)
        assert F.lecturas(s, corte_id, 'peso_6m', 'alguna', []).empty
    med = sev.mediciones[(sev.mediciones.variable == 'peso_6m') & sev.mediciones.sujeto.isin(ids) & sev.mediciones.valor.notna()]
    assert len(alguna) == len(med) and set(alguna.sujeto) == set(med.sujeto)
    assert etapa.sujeto.is_unique and set(etapa.sujeto) <= set(alguna.sujeto)



def test_al_reemplazar_el_corte_vigente_se_van_sus_atributos(url_db_propia, sev, corte_id):
    motor = create_engine(url_db_propia)
    otro = replace(sev, corte=pd.Timestamp('2026-07-31'))
    nuevo = SDB.guardar_en_db(motor, otro.subconjunto(sev.sujetos.sujeto[:50]), 'simulado')
    with motor.connect() as cx:
        cortes = set(cx.execute(text('SELECT DISTINCT corte_id FROM sevarti.atributos_sujeto')).scalars())
        assert cortes == {nuevo}        # el vigente anterior de la fuente se borró con todo lo suyo
        assert cx.execute(text('SELECT count(*) FROM sevarti.resumen_sujeto WHERE corte_id = :c'),
                          {'c': nuevo}).scalar_one() == 50
    motor.dispose()


def test_las_tablas_nuevas_existen_con_su_indice(motor):
    insp = inspect(motor)
    assert 'muestras' in insp.get_table_names('app')
    assert {'atributos_sujeto', 'resumen_sujeto'} <= set(insp.get_table_names('sevarti'))
    indices = {i['name'] for i in insp.get_indexes('atributos_sujeto', 'sevarti')}
    assert 'ix_atributos_sujeto_corte_id_variable_valor' in indices
