"""Muestras: validación de la gramática, filtros, facetas, huella, fechas de nacimiento y muestreo (en memoria)."""
from dataclasses import replace

import numpy as np
import pandas as pd
import pytest

from maia_comun import muestra as M
from sevarti.contrato import Sevarti


@pytest.fixture(scope='module')
def sev(sev_demo):
    """La cohorte simulada, declarando el −1 del hematocrito como código de «no se hizo»."""
    esquema = sev_demo.esquema.copy()
    esquema.loc[esquema.variable == 'hematocrito', 'codigos_especiales'] = '-1'
    return replace(sev_demo, esquema=esquema)


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
def mini():
    """Tres niños con varias mediciones de peso, para ver primera / última / alguna / etapa."""
    esquema = pd.DataFrame([
        dict(variable='sexo', tipo='categorical', rol='basal', categorias='1=niño;2=niña'),
        dict(variable='peso', tipo='numeric', rol='medicion', etapa='3m', codigos_especiales='-1;-2'),
    ])
    etapas = pd.DataFrame([('3m', 1, 45, 135, 'cronologica')], columns=['etapa', 'orden', 'edad_min', 'edad_max', 'base'])
    sujetos = pd.DataFrame({'sujeto': ['a', 'b', 'c'], 'grupo': ['X', 'X', 'Y'],
                            'fecha_nacimiento': pd.to_datetime(['2020-03-01', '2021-07-15', None]),
                            'anio_nacimiento': [2020, 2021, 2019], 'eg_semanas': [30, 34, 28]})
    filas = [('a', 'sexo', 1, None, 0), ('b', 'sexo', 2, None, 0), ('c', 'sexo', 1, None, 0),
             ('a', 'peso', -1, '2020-03-10', 9), ('a', 'peso', 3000, '2020-05-01', 60),
             ('a', 'peso', 7000, '2020-11-01', 240),
             ('b', 'peso', 'abc', '2021-09-01', 50), ('b', 'peso', 5000, '2021-10-01', 80),
             ('c', 'peso', -2, '2019-06-01', 30), ('c', 'peso', 2000, '2019-08-01', 90)]
    med = pd.DataFrame(filas, columns=['sujeto', 'variable', 'valor', 'fecha', 'edad_dias'])
    med['fecha'] = pd.to_datetime(med.fecha)
    med['valor'] = med.valor.astype(object)
    episodios = pd.DataFrame({'sujeto': ['a', 'b'], 'tipo': ['uci', 'uci'], 'edad_inicio': [0, 0], 'edad_fin': [5, 7]})
    quiebres = pd.DataFrame({'quiebre': [], 'fecha': pd.to_datetime([])})
    return Sevarti(esquema=esquema, etapas=etapas, sujetos=sujetos, mediciones=med, episodios=episodios,
                   quiebres=quiebres, corte=pd.Timestamp('2022-01-31'))


# ------------------------------------------------------------------ validación

def test_validar_acepta_una_muestra_correcta(sev):
    m = _muestra(_y('sexo', 'lista', ['M']), _y('peso_nacer', 'numero', [1000, None]), _y('sede', 'lista', [1]),
                 tiempo={'fecha': 'fecha_nacimiento', 'modo': 'periodo', 'desde': '2018', 'hasta': '2022-12-31'},
                 muestreo={'modo': 'estratificado', 'por': 'sede', 'maximo_por_categoria': 50, 'semilla': 3})
    assert M.validar(m, sev.esquema) == []


def test_validar_exige_cuando_en_variables_que_se_miden_varias_veces(sev):
    errores = M.validar(_muestra(_y('peso_3m', 'numero', [3000, 5000])), sev.esquema)
    assert len(errores) == 1 and 'peso_3m' in errores[0] and 'cuando' in errores[0]
    assert M.validar(_muestra(_y('peso_3m', 'numero', [3000, 5000], 'etapa:3 m EC')), sev.esquema) == []
    assert M.validar(_muestra(_y('peso_nacer', 'numero', [1000, 1500])), sev.esquema) == []   # basal: opcional


@pytest.mark.parametrize('muestra, fragmento', [
    ({'version': 1, 'y': []}, 'versión'),
    (_muestra(_y('no_existe', 'lista', ['a'])), 'no existe'),
    (_muestra({**_y('sexo', 'lista', ['M']), 'op': 'es'}), 'operador'),
    (_muestra(_y('sexo', 'lista', [])), 'al menos una'),
    (_muestra(_y('peso_nacer', 'numero', [2000, 1000])), 'mayor que el máximo'),
    (_muestra(_y('peso_nacer', 'numero', [None, None])), 'al menos un extremo'),
    (_muestra(_y('sexo', 'numero', [1, 2])), 'no es numérica'),
    (_muestra(_y('notas', 'lista', ['x'])), 'no se puede filtrar'),
    (_muestra(_y('sexo', 'si_no', ['quizás'])), 'sí/no'),
    (_muestra(_y('sexo', 'lista', ['M'], 'siempre')), 'cuando'),
    (_muestra(tiempo={'fecha': 'cumpleaños', 'modo': 'periodo', 'desde': '2020'}), 'fecha'),
    (_muestra(tiempo={'fecha': 'fecha_nacimiento', 'modo': 'periodo', 'desde': '2022', 'hasta': '2020'}), 'posterior'),
    (_muestra(tiempo={'fecha': 'fecha_nacimiento', 'modo': 'periodo', 'desde': 'ayer'}), 'no válida'),
    (_muestra(tiempo={'fecha': 'fecha_nacimiento', 'modo': 'ultimos_meses', 'desde': 0}), 'meses'),
    (_muestra(muestreo={'modo': 'estratificado', 'por': 'peso_nacer', 'maximo_por_categoria': 5}), 'categórica'),
    (_muestra(muestreo={'modo': 'estratificado', 'por': 'sede', 'maximo_por_categoria': 0}), 'maximo_por_categoria'),
])
def test_validar_dice_en_espanol_que_esta_mal(sev, muestra, fragmento):
    esquema = pd.concat([sev.esquema, sev.esquema.iloc[[0]].assign(variable='notas', tipo='text')], ignore_index=True)
    errores = M.validar(muestra, esquema)
    assert errores and any(fragmento in e for e in errores), errores


def test_aplicar_con_una_muestra_invalida_lanza_con_todos_los_errores(sev):
    with pytest.raises(M.MuestraInvalida) as ex:
        M.aplicar(sev, _muestra(_y('nada', 'lista', ['a']), _y('peso_3m', 'numero', [1, 2])))
    assert len(ex.value.errores) == 2


# ------------------------------------------------------------------ aplicar y contar

def test_contar_es_igual_a_los_sujetos_de_aplicar_y_recorta_las_tablas(sev):
    m = _muestra(_y('sexo', 'lista', ['M']), _y('peso_nacer', 'numero', [1500, 2500]))
    out = M.aplicar(sev, m)
    n = M.contar(sev, m)
    assert 0 < n < len(sev.sujetos) and n == len(out.sujetos)
    quedan = set(out.sujetos.sujeto)
    assert set(out.mediciones.sujeto) <= quedan and set(out.episodios.sujeto) <= quedan
    nacer = out.mediciones[out.mediciones.variable == 'peso_nacer'].valor.astype(float)
    assert nacer.between(1500, 2500).all()
    assert (out.mediciones[out.mediciones.variable == 'sexo'].valor == 'M').all()
    assert M.contar(sev, _muestra()) == len(sev.sujetos)


def test_el_filtro_de_sede_y_el_de_eg_semanas_usan_los_datos_del_niño(sev):
    n1 = M.contar(sev, _muestra(_y('sede', 'lista', [1])))
    assert n1 == int((sev.sujetos.grupo == 1).sum())
    n_eg = M.contar(sev, _muestra(_y('eg_semanas', 'numero', [None, 30])))
    assert n_eg == int((sev.sujetos.eg_semanas <= 30).sum())


def test_categorias_de_edad_gestacional_son_tramos_propios(sev):
    eg = sev.sujetos.set_index('sujeto').eg_semanas
    cat = eg.map(M.categoria_eg)
    assert set(cat.dropna()) == set(M.NOMBRES_EG)
    dos = M.ids(sev, _muestra(_y('eg_categoria', 'lista', ['muy_prematuro', 'a_termino'])))
    assert sorted(dos) == sorted(cat.index[cat.isin(['muy_prematuro', 'a_termino'])])
    assert not set(dos) & set(cat.index[cat == 'moderado_tardio'])
    # los cortes: 28, 32 y 37 semanas empiezan la categoría siguiente
    assert [M.categoria_eg(x) for x in (27.99, 28, 31.999, 32, 36.999, 37, 41)] == [
        'extremo', 'muy_prematuro', 'muy_prematuro', 'moderado_tardio', 'moderado_tardio', 'a_termino', 'a_termino']
    assert M.categoria_eg(None) is None and M.categoria_eg(float('nan')) is None and M.categoria_eg('x') is None
    assert any('casi' in e for e in M.validar(_muestra(_y('eg_categoria', 'lista', ['casi'])), sev.esquema))
    assert any('lista' in e for e in M.validar(_muestra(_y('eg_categoria', 'numero', [28, 32])), sev.esquema))
    # y se puede estratificar por ella
    est = _muestra(muestreo={'modo': 'estratificado', 'por': 'eg_categoria', 'maximo_por_categoria': 25, 'semilla': 1})
    assert M.validar(est, sev.esquema) == []
    elegidos = M.ids(sev, est)
    assert max(cat.reindex(elegidos).value_counts().max(), 0) <= 25


def test_codigo_especial_no_cuenta_como_dato(sev):
    h = sev.mediciones[sev.mediciones.variable == 'hematocrito']
    sin_hecho = h[h.valor.astype(float) == -1]
    hechos = h[h.valor.astype(float) != -1]
    assert len(sin_hecho) > 0
    # un -1 no es un hematocrito: nadie cae en el rango [-1, 0], y los que sí lo tienen son los del valor real
    assert M.contar(sev, _muestra(_y('hematocrito', 'numero', [-1, 0], 'primera'))) == 0
    assert M.contar(sev, _muestra(_y('hematocrito', 'numero', [0, 100], 'primera'))) == hechos.sujeto.nunique()
    # si el diccionario no declara el código, sí cuenta (así es el simulador sin declarar)
    sin_declarar = replace(sev, esquema=sev.esquema.assign(codigos_especiales=''))
    assert M.contar(sin_declarar, _muestra(_y('hematocrito', 'numero', [-1, 0], 'primera'))) \
        == sin_hecho.sujeto.nunique()


def test_primera_ultima_alguna_y_etapa(mini):
    def quienes(valores, cuando):
        return M.ids(mini, _muestra(_y('peso', 'numero', valores, cuando)))
    # a: -1 (especial, no cuenta), 3000, 7000. b: 'abc' (no es número), 5000. c: -2 (especial), 2000
    assert quienes([2500, 3500], 'primera') == ['a']
    assert quienes([6000, None], 'ultima') == ['a']
    assert quienes([4000, 6000], 'alguna') == ['b']
    assert quienes([2500, 5500], 'alguna') == ['a', 'b']
    assert quienes([None, 2000], 'primera') == ['c']
    assert quienes([-5, 0], 'alguna') == []
    # 3m = días 45 a 135: a tiene 3000 (día 60), b 5000 (día 80), c 2000 (día 90); el 7000 de a está fuera
    assert quienes([6000, None], 'etapa:3m') == []
    assert quienes([2500, 3500], 'etapa:3m') == ['a']
    with pytest.raises(M.MuestraInvalida, match='etapa'):
        quienes([1, 2], 'etapa:nunca')


def test_si_no_y_lista_con_etiquetas_numericas(mini):
    assert M.ids(mini, _muestra(_y('sexo', 'lista', [1]))) == ['a', 'c']
    assert M.ids(mini, _muestra(_y('sexo', 'lista', ['2']))) == ['b']
    assert M.ids(mini, _muestra(_y('sexo', 'si_no', [True]))) == ['a', 'c']     # 1 = sí
    assert M.ids(mini, _muestra(_y('sexo', 'si_no', [False]))) == []


# ------------------------------------------------------------------ fechas

def test_tiempo_por_fecha_de_nacimiento_con_y_sin_fecha_de_parto(mini):
    def en(desde, hasta, campo='fecha_nacimiento', modo='periodo'):
        return M.ids(mini, _muestra(tiempo={'fecha': campo, 'modo': modo, 'desde': desde, 'hasta': hasta}))
    assert en('2020-03-01', '2020-03-01') == ['a']                    # extremos incluidos
    assert en('2021', '2021') == ['b']
    # c no trae fecha de parto: se compara su año de nacimiento (2019), D34
    assert en('2019', '2019') == ['c']
    assert en('2020-01-01', None) == ['a', 'b']       # el año 2019 de c es anterior al periodo
    assert en('2020', '2021', 'anio_nacimiento') == ['a', 'b']
    # visitas: alguna medición en el periodo
    assert en('2019-07-01', '2019-12-31', 'fecha_visita') == ['c']
    # últimos 18 meses desde el corte (2022-01-31): desde 2020-07-31, solo b nació después
    assert en(18, None, modo='ultimos_meses') == ['b']


def test_si_el_corte_no_trae_fecha_de_parto_todo_cae_a_anio_nacimiento(sev_demo):
    sujetos = sev_demo.sujetos.assign(anio_nacimiento=sev_demo.sujetos.fecha_nacimiento.dt.year,
                                      fecha_nacimiento=pd.NaT)
    sin_fecha = replace(sev_demo, sujetos=sujetos)
    tiempo = {'fecha': 'fecha_nacimiento', 'modo': 'periodo', 'desde': '2015-06-01', 'hasta': '2017-03-01'}
    # por año: se cuentan los niños nacidos en 2015 a 2017, sin mirar el mes
    esperado = int(sujetos.anio_nacimiento.between(2015, 2017).sum())
    assert esperado > 0
    assert M.contar(sin_fecha, _muestra(tiempo=tiempo)) == esperado
    # con la fecha completa se respeta el día
    con_fecha = int(sev_demo.sujetos.fecha_nacimiento.between('2015-06-01', '2017-03-01').sum())
    assert M.contar(sev_demo, _muestra(tiempo=tiempo)) == con_fecha != esperado


# ------------------------------------------------------------------ facetas

def test_facetas_no_aplican_su_propio_filtro_pero_si_los_demas(sev):
    y_sexo = _y('sexo', 'lista', ['M'])
    y_peso = _y('peso_nacer', 'numero', [None, 2000])
    base = M.facetas(sev, _muestra(), ['sexo'])
    con_peso = M.facetas(sev, _muestra(y_peso), ['sexo'])
    con_ambos = M.facetas(sev, _muestra(y_sexo, y_peso), ['sexo'])
    n_total, n_peso = len(sev.sujetos), M.contar(sev, _muestra(y_peso))
    assert sum(o['n'] for o in base['sexo']['opciones']) == n_total
    assert sum(o['n'] for o in con_peso['sexo']['opciones']) == n_peso
    # el filtro propio no recorta su faceta: sigue mostrando las dos opciones con los demás filtros
    assert con_ambos['sexo'] == con_peso['sexo']
    n_m = next(o['n'] for o in con_ambos['sexo']['opciones'] if o['valor'] == 'M')
    assert n_m == M.contar(sev, _muestra(y_sexo, y_peso))
    # y la faceta de otra variable sí ve el filtro de sexo
    f = M.facetas(sev, _muestra(y_sexo), ['sexo', 'oxigeno_3m'])
    assert sum(o['n'] for o in f['oxigeno_3m']['opciones']) <= M.contar(sev, _muestra(y_sexo))


def test_facetas_con_sede_etiquetas_y_numericas(sev):
    f = M.facetas(sev, _muestra(_y('sexo', 'lista', ['F'])), ['oxigeno_3m', 'peso_nacer'])
    assert list(f) == ['sede', 'oxigeno_3m', 'peso_nacer']      # la sede sale sola: hay tres grupos
    assert [o['valor'] for o in f['sede']['opciones']] == [1, 2, 3]
    assert sum(o['n'] for o in f['sede']['opciones']) == M.contar(sev, _muestra(_y('sexo', 'lista', ['F'])))
    assert {o['etiqueta'] for o in f['oxigeno_3m']['opciones']} == {'displasia broncopulmonar', 'sin diagnóstico'}
    n = f['peso_nacer']
    assert n['tipo'] == 'numero' and n['n'] == sum(b['n'] for b in n['bins']) and n['min'] <= n['max']


def test_sin_sede_cuando_hay_un_solo_grupo(sev):
    uno = sev.subconjunto(sev.sujetos[sev.sujetos.grupo == 2].sujeto)
    assert 'sede' not in M.facetas(uno, _muestra(), ['sexo'])
    assert 'sede' in M.facetas(sev, _muestra(), ['sexo'])


def test_faceta_de_variable_inexistente(sev):
    with pytest.raises(M.MuestraInvalida, match='faceta'):
        M.facetas(sev, _muestra(), ['no_existe'])


# ------------------------------------------------------------------ huella y muestreo

def test_huella_es_estable_e_independiente_del_orden(sev):
    ids = M.ids(sev, _muestra(_y('sexo', 'lista', ['M'])))
    assert M.huella(ids) == M.huella(list(reversed(ids))) == M.huella(ids + ids[:5])
    assert M.huella(ids) != M.huella(ids[:-1])
    assert len(M.huella(ids)) == 64
    assert M.huella(M.ids(sev, _muestra(_y('sexo', 'lista', ['M'])))) == M.huella(ids)


def test_muestreo_estratificado_respeta_el_tope_y_la_semilla(sev):
    def muestreo(semilla, tope=40):
        return _muestra(muestreo={'modo': 'estratificado', 'por': 'sede', 'maximo_por_categoria': tope,
                                  'semilla': semilla})
    a = M.ids(sev, muestreo(1))
    por_sede = sev.sujetos.set_index('sujeto').loc[a].grupo.value_counts()
    assert set(por_sede) == {40} and len(a) == 120
    assert M.ids(sev, muestreo(1)) == a                    # misma semilla, mismos niños
    assert M.ids(sev, muestreo(2)) != a                    # otra semilla, otros niños
    assert M.contar(sev, muestreo(1)) == len(M.aplicar(sev, muestreo(1)).sujetos) == 120
    assert len(M.ids(sev, muestreo(1), muestreo=False)) == len(sev.sujetos)
    # con un tope mayor que la categoría se queda con todos los de esa categoría
    assert len(M.ids(sev, muestreo(1, tope=10_000))) == len(sev.sujetos)


def test_muestreo_por_variable_cuenta_sin_dato_como_una_categoria(mini):
    m = _muestra(muestreo={'modo': 'estratificado', 'por': 'sexo', 'maximo_por_categoria': 1, 'semilla': 0})
    ids = M.ids(mini, m)
    assert len(ids) == 2 and 'b' in ids                    # un niño del sexo 1 (a o c) y b, único del sexo 2


def test_muestrear_es_reproducible_con_numpy():
    cat = pd.Series(['x'] * 10 + ['y'] * 3, index=[f's{i:02d}' for i in range(13)])
    a, b = M.muestrear(cat, 4, 9), M.muestrear(cat, 4, 9)
    assert a == b and len(a) == 7 and np.array_equal(sorted(a), a)
