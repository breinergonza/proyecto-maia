from dataclasses import replace

import numpy as np
import pandas as pd
import pytest

from anomalias import modelo as MA
from sevarti.contrato import Sevarti, edad_corregida


def _con(sev: Sevarti, filas: list[tuple]) -> Sevarti:
    nuevas = pd.DataFrame(filas, columns=['sujeto', 'variable', 'valor', 'fecha', 'edad_dias'])
    return replace(sev, mediciones=pd.concat([sev.mediciones, nuevas], ignore_index=True))


# ------------------------------------------------------------------ contract

def test_edad_corregida_resta_las_semanas_de_prematuridad():
    edad = edad_corregida(pd.Series([70.0, 91.0]), pd.Series([30.0, 40.0]))
    assert edad.tolist() == [0.0, 91.0]


def test_esquema_que_no_cumple_el_contrato_se_rechaza(sev):
    malo = sev.esquema.copy()
    malo.loc[0, 'tipo'] = 'imagen'
    with pytest.raises(ValueError, match='tipos desconocidos'):
        replace(sev, esquema=malo)
    sin_etapa = sev.esquema.copy()
    sin_etapa.loc[0, 'etapa'] = '18 m EC'
    with pytest.raises(ValueError, match='etapas que no están definidas'):
        replace(sev, esquema=sin_etapa)


def test_capa0_rechaza_sin_contar_como_anomalia(sev):
    s = sev.subconjunto(sev.sujetos.sujeto[:50])
    uno = s.sujetos.iloc[0]
    nac = pd.Timestamp(uno.fecha_nacimiento)
    s = _con(s, [
        (uno.sujeto, 'peso_3m', 'cuatro mil', nac + pd.Timedelta(days=150), np.nan),
        (uno.sujeto, 'variable_nueva_sin_fila', 3.0, nac, np.nan),
        ('no_existe', 'peso_3m', 5000, nac, np.nan),
        (uno.sujeto, 'peso_6m', 6000, nac - pd.Timedelta(days=5), np.nan),
        (uno.sujeto, 'peso_12m', 9000, s.corte + pd.Timedelta(days=30), np.nan),
    ])
    datos, rech = MA.preparar(s)
    assert sorted(rech.motivo) == sorted(['no es un número', 'variable sin esquema', 'sujeto desconocido',
                                          'fecha antes del nacimiento', 'fecha después del corte'])
    assert len(datos) + len(rech) == s.mediciones.valor.notna().sum()


# ------------------------------------------------------------------- layer 1

def test_codigo_usado_en_la_mayoria_no_se_aprende_como_normal(modelo):
    ref = modelo.refs1['hematocrito']
    assert -1.0 in ref.codigos
    assert 35 < ref.mediana < 55  # the scale is the real lab values, not the code


def test_error_de_unidad_y_codigo_en_la_capa_1(modelo, particion):
    _, _, te, _ = particion
    d, _ = MA.preparar(te)
    fila = d.index[d.variable == 'peso_6m'][0]
    med = te.mediciones.copy()
    med['valor'] = med.valor.astype(object)
    med.loc[fila, 'valor'] = float(d.x[fila]) / 1000
    d2, _ = MA.preparar(replace(te, mediciones=med))
    p1 = MA.puntuar_valor(d2, modelo.refs1, te.esquema, modelo.cfg)
    assert bool(p1.loc[fila, 'unidad'])
    assert p1.loc[fila, 'motivo1'] == 'posible error de unidad'


def test_codigo_conocido_se_registra_pero_no_es_alerta(modelo, particion):
    _, _, te, _ = particion
    d, _ = MA.preparar(te)
    p1 = MA.puntuar_valor(d, modelo.refs1, te.esquema, modelo.cfg)
    menos_uno = d.index[(d.variable == 'hematocrito') & (d.x == -1)]
    assert len(menos_uno) and p1.loc[menos_uno, 'codigo'].all()
    assert not p1.loc[menos_uno, 'alerta1'].any()


def test_cero_o_negativo_en_variable_logaritmica_es_atipico(modelo, particion):
    _, _, te, _ = particion
    assert modelo.refs1['ingreso_hogar'].log
    d, _ = MA.preparar(te)
    filas = d.index[d.variable == 'ingreso_hogar'][:2]
    med = te.mediciones.copy()
    med['valor'] = med.valor.astype(object)
    med.loc[filas, 'valor'] = [0.0, -5000.0]
    d2, _ = MA.preparar(replace(te, mediciones=med))
    p1 = MA.puntuar_valor(d2, modelo.refs1, te.esquema, modelo.cfg)
    assert p1.loc[filas, 'atipico'].all()


def test_atipico_que_el_contexto_explica_no_alerta_salvo_fuera_del_rango(modelo, particion):
    _, _, te, _ = particion
    d, _ = MA.preparar(te)
    ref = modelo.refs1['talla_3m']
    filas = d.index[d.variable == 'talla_3m'][:40]
    med = te.mediciones.copy()
    med['valor'] = med.valor.astype(object)
    med.loc[filas, 'valor'] = ref.mediana + 4 * ref.escala
    te2 = replace(te, mediciones=med)
    r = modelo.puntuar(te2).datos.loc[filas]
    assert r.atipico.all()
    explicado = r.z2.notna() & ~r.alerta2
    assert explicado.any() and not explicado.all()
    assert r.alerta1.equals(~explicado)
    assert (r.motivo1[explicado] == '').all()
    esquema = te.esquema.copy()
    esquema.loc[esquema.variable == 'talla_3m', 'rango_max'] = ref.mediana + 3 * ref.escala
    assert modelo.puntuar(replace(te2, esquema=esquema)).datos.loc[filas, 'alerta1'].all()


# ------------------------------------------------------------- training mask

def test_rango_declarado_no_se_usa_como_filtro(particion):
    tr, ca, _, _ = particion
    cfg = MA.Config()
    d, _ = MA.preparar(tr)
    base = MA.mascara_base(d, MA.puntuar_valor(d, MA.ajustar_valor(d, tr.esquema, cfg), tr.esquema, cfg), cfg)
    esquema = tr.esquema.copy()
    esquema.loc[esquema.variable == 'peso_3m', ['rango_min', 'rango_max']] = (0, 10)  # absurd declared range
    tr2 = replace(tr, esquema=esquema)
    d2, _ = MA.preparar(tr2)
    otra = MA.mascara_base(d2, MA.puntuar_valor(d2, MA.ajustar_valor(d2, esquema, cfg), esquema, cfg), cfg)
    assert base.equals(otra)


def test_mascara_por_celda_excluye_mas_de_6_mad_y_alerta_desde_3_5(modelo, particion):
    tr, _, _, _ = particion
    d, _ = MA.preparar(tr)
    ref = modelo.refs1['talla_3m']
    filas = d.index[d.variable == 'talla_3m'][:2]
    med = tr.mediciones.copy()
    med['valor'] = med.valor.astype(object)
    med.loc[filas[0], 'valor'] = ref.mediana + 7 * ref.escala
    med.loc[filas[1], 'valor'] = ref.mediana + 4 * ref.escala
    d2, _ = MA.preparar(replace(tr, mediciones=med))
    p1 = MA.puntuar_valor(d2, modelo.refs1, tr.esquema, modelo.cfg)
    excl = MA.mascara_base(d2, p1, modelo.cfg)
    assert excl.get(filas[0]) == 'más de 6 MAD'
    assert filas[1] not in excl.index
    assert bool(p1.loc[filas[1], 'atipico'])


def test_mascara_versionada_sin_valores(modelo, tmp_path):
    ruta = modelo.guardar_mascara(tmp_path)
    leida = pd.read_csv(ruta)
    assert list(leida.columns) == ['sujeto', 'variable', 'motivo']
    assert modelo.version in ruta.name
    assert {'código especial', 'segunda vuelta'} <= set(leida.motivo)


# ------------------------------------------------------------------- splits

def test_division_por_tiempo_sin_solape_y_con_todos_los_regimenes(particion, sev):
    tr, ca, te, info = particion
    a, b, c = (set(x.sujetos.sujeto) for x in (tr, ca, te))
    assert not (a & b or a & c or b & c)
    assert len(a | b | c) == len(sev.sujetos)
    quiebre = sev.quiebres.fecha.iloc[0]
    for parte in (tr, ca, te):
        nac = pd.to_datetime(parte.sujetos.fecha_nacimiento)
        assert (nac < quiebre).any() and (nac >= quiebre).any()
    nac = {k: pd.to_datetime(x.sujetos.fecha_nacimiento) for k, x in (('tr', tr), ('ca', ca), ('te', te))}
    antes = {k: v[v < quiebre] for k, v in nac.items()}
    assert antes['tr'].max() <= antes['ca'].min() and antes['ca'].max() <= antes['te'].min()


# ------------------------------------------------------------------- layer 2

def test_capa2_controla_falsas_alertas_y_el_contexto_suma(modelo, particion):
    _, _, te, _ = particion
    ev = MA.evaluar(modelo, te, rondas=1)
    recall, falsas = ev.recall, ev.falsas
    assert falsas.loc[:, '2. Contexto'].iloc[0] <= 3 * 1000 * modelo.cfg.alpha
    desvio = recall.loc['desvío de 3 DE']
    assert desvio['2. Contexto'] > desvio['1. Valor'] + 30
    assert (recall.cualquiera >= recall[['1. Valor', '2. Contexto', '3. Trayectoria']].max(axis=1)).all()


def test_capa2_no_entrena_variables_con_pocos_sujetos(particion):
    tr, ca, _, _ = particion
    cfg = replace(MA.Config(rondas=20), min_sujetos=2000)
    m = MA.ModeloAnomalias(cfg).ajustar(tr, ca)
    assert 'pc_12m' in m.omitidas and 'pc_12m' not in m.capa2


# ------------------------------------------------------------------- layer 3

def test_culpable_es_el_dato_comun_a_dos_pares_anomalos():
    p = pd.DataFrame({'fila_a': [1, 2, 3], 'fila_b': [2, 3, 4]})
    malo = np.array([False, True, True])
    assert MA._culpables(p, malo, np.ones(3, dtype=bool)).tolist() == [3]
    solo = np.array([False, False, True])  # 3 is vouched by its normal pair with 2
    assert MA._culpables(p, solo, np.ones(3, dtype=bool)).tolist() == [4]


def test_capa3_disminucion_y_ventana(modelo, particion):
    _, _, te, _ = particion
    d, _ = MA.preparar(te)
    t3 = d[d.variable == 'talla_3m']
    con_6m = set(d.sujeto[d.variable == 'talla_6m']) & set(d.sujeto[d.variable == 'talla_40'])
    fila = t3.index[t3.sujeto.isin(con_6m)][0]
    med = te.mediciones.copy()
    med['valor'] = med.valor.astype(object)
    med.loc[fila, 'valor'] = float(d.x[fila]) + 6  # longer than both neighbours: the 6m one decreases
    fuera, incoherente = d.index[(d.variable == 'peso_6m')][:2]
    med.loc[fuera, 'fecha'] = pd.Timestamp(d.t[fuera]) + pd.Timedelta(days=200)
    med.loc[fuera, 'edad_dias'] = d.edad_dias[fuera] + 200
    med.loc[incoherente, 'fecha'] = pd.Timestamp(d.t[incoherente]) + pd.Timedelta(days=60)
    res = modelo.puntuar(replace(te, mediciones=med))
    assert res.datos.loc[fila, 'alerta3']
    assert res.datos.loc[fuera, 'motivo3'] == 'fuera de la ventana de la etapa'
    assert res.datos.loc[incoherente, 'motivo3'] == 'la edad anotada no coincide con la fecha'


# ------------------------------------------------------------------- layer 4

def test_capa4_detecta_sesgo_faltantes_y_redondeo(modelo, sev_grande):
    m = modelo
    desde = pd.Timestamp('2018-01-01')
    sesgada = MA.inyectar_sesgo(sev_grande, 'peso_3m', 1, desde, 400)
    d, _ = MA.preparar(sesgada)
    quitar = d.index[(d.variable == 'pc_3m') & (d.grupo == 3) & (d.t >= desde)]
    sesgada = replace(sesgada, mediciones=sesgada.mediciones.drop(quitar))
    g = m.puntuar(sesgada).grupo
    sesgo = g[(g.senal == 'residuo del contexto') & (g.variable == 'peso_3m') & (g.grupo == 1)]
    assert len(sesgo) and sesgo.periodo.min() >= desde - pd.DateOffset(months=3)
    falt = g[(g.senal == 'datos faltantes') & (g.variable == 'pc_3m') & (g.grupo == 3)]
    assert len(falt) and falt.periodo.min() >= desde - pd.DateOffset(months=3)
    red = g[(g.senal == 'redondeo') & g.variable.isin(['peso_40', 'peso_3m', 'peso_6m', 'peso_12m'])]
    assert len(red) and (red.periodo >= pd.Timestamp('2021-10-01')).mean() >= 0.8
    # a group that changes nothing raises almost no alarm across all variables and periods
    otros = g[(g.grupo == 2) & (g.periodo < pd.Timestamp('2021-10-01'))]
    assert len(otros) <= 3


# ------------------------------------------------------------- new variable

def test_variable_nueva_sin_cambiar_codigo(particion):
    tr, ca, te, _ = particion
    sin = [x.sin_variable('talla_12m') for x in (tr, ca, te)]
    m = MA.ModeloAnomalias(MA.Config(rondas=40)).ajustar(sin[0], sin[1])
    assert 'talla_12m' not in m.capa2
    fila = tr.esquema.set_index('variable').loc['talla_12m'].to_dict() | {'variable': 'talla_12m'}
    datos_nuevos = te.mediciones[te.mediciones.variable == 'talla_12m']
    con = sin[2].con_variable(fila, datos_nuevos)
    res = m.puntuar(con)
    nueva = res.datos[res.datos.variable == 'talla_12m']
    assert nueva.z1.notna().all()                          # layer 1 from the first datum
    assert not nueva.alerta2.any() and nueva.z2.isna().all()  # layer 2 waits for its own model
    pares = res.pares
    assert pares.transicion.str.contains('12 m EC').any()    # layer 3 chains it through its concept
    otros = dict(m.capa2)
    tr_con = sin[0].con_variable(fila, tr.mediciones[tr.mediciones.variable == 'talla_12m'])
    ca_con = sin[1].con_variable(fila, ca.mediciones[ca.mediciones.variable == 'talla_12m'])
    m.ajustar(tr_con, ca_con, solo_nuevas=True)
    assert 'talla_12m' in m.capa2
    assert all(m.capa2[v] is otros[v] for v in otros)       # existing models are kept


# ---------------------------------------------------- found on the real base

def _capa1(valores: np.ndarray, cfg: MA.Config = MA.Config()) -> tuple[MA.RefValor, pd.DataFrame]:
    datos = pd.DataFrame({'variable': 'v', 'tipo': 'numeric', 'x': valores.astype(float)})
    esquema = pd.DataFrame({'variable': ['v'], 'codigos_especiales': ['']})
    ref = MA.ref_valor(datos.x, (), cfg)
    return ref, MA.puntuar_valor(datos, {'v': ref}, esquema, cfg)


def test_conteo_casi_siempre_cero_no_marca_sus_valores_comunes():
    rng = np.random.default_rng(3)
    # hospitalizations in pregnancy: 0 for most mothers, 1 for a third, rarely more
    x = rng.choice([0, 1, 2, 3], size=5000, p=[0.62, 0.33, 0.04, 0.01])
    _, p1 = _capa1(x)
    assert not p1.alerta1.any() and not p1.unidad.any()
    assert MA.mascara_base(pd.DataFrame(index=p1.index), p1, MA.Config()).empty


def test_variable_sesgada_con_ceros_va_en_escala_log():
    rng = np.random.default_rng(4)
    dias = np.round(rng.lognormal(np.log(7), 1.0, 5000))  # days in hospital: skewed, some zeros
    ref, p1 = _capa1(dias)
    assert ref.log and ref.desplazamiento == ref.resolucion and (dias == 0).any()
    assert p1.alerta1.mean() < 0.01 and not p1.unidad.any()
    _, con_error = _capa1(np.append(dias, [7000.0]))  # 7 days typed with three extra zeros
    assert con_error.unidad.iloc[-1]


def test_codigo_conocido_no_lo_puntua_la_capa_2(modelo, particion):
    _, _, te, _ = particion
    d = modelo.puntuar(te).datos
    codigos = d[d.codigo.fillna(False).astype(bool)]
    assert len(codigos) and codigos.z2.isna().all() and not codigos.alerta2.any()


def test_variable_con_muchos_ceros_se_escala_con_los_demas_valores():
    rng = np.random.default_rng(5)
    # days in an incubator: 0 for term babies, a long skewed tail for preterm ones
    dias = np.where(rng.random(6000) < 0.53, 0, np.round(rng.lognormal(np.log(4), 1.0, 6000)) + 1)
    _, p1 = _capa1(np.append(dias, [50.0, 900.0]))
    assert p1.alerta1.mean() < 0.01
    assert not p1.alerta1.iloc[-2] and p1.alerta1.iloc[-1]  # 50 days happens to preterm babies; 900 does not


def test_cambio_entre_visitas_se_mide_segun_el_tiempo_transcurrido():
    rng = np.random.default_rng(6)
    n = 4000
    dias = np.where(rng.random(n) < 0.6, 0, rng.integers(7, 60, n))  # most pairs the same day
    delta = np.where(dias == 0, rng.normal(0, 5, n).round(), dias * 30 + rng.normal(0, 25, n) * np.sqrt(dias))
    g = pd.DataFrame({'dias': dias.astype(float), 'delta': delta})
    g['velocidad'] = np.where(g.dias > 0, g.delta / g.dias.where(g.dias > 0), np.nan)
    ref = MA._ref_transicion(g, MA.Config())
    assert 25 < ref.velocidad < 35
    z = (g.delta - ref.velocidad * g.dias) / ref.escala(g.dias.to_numpy())
    assert (z.abs() > 3.5).mean() < 0.01
    assert ref.escala(np.array([0.0]))[0] < ref.escala(np.array([50.0]))[0]
    mismo_dia = (40 - ref.velocidad * 0) / ref.escala(np.array([0.0]))[0]
    assert abs(mismo_dia) > 3.5  # 40 g apart on the same day is a copy or typing error


def test_cambio_copiado_no_achica_la_escala_del_cambio():
    rng = np.random.default_rng(8)
    n = 6000
    # discharge weight to programme-entry weight, 1 to 3 days apart: for years the entry weight
    # was copied from the discharge one (change exactly 0); weighed again, they differ by tens of grams
    dias = rng.integers(1, 4, n).astype(float)
    copiado = rng.random(n) < 0.45
    delta = np.where(copiado, 0.0, rng.normal(0, 60, n).round(-1))
    g = pd.DataFrame({'dias': dias, 'delta': delta})
    g['velocidad'] = g.delta / g.dias
    ref = MA._ref_transicion(g, MA.Config())
    z = (g.delta - ref.velocidad * g.dias) / ref.escala(g.dias.to_numpy())
    assert (z[~copiado].abs() > 3.5).mean() < 0.01   # a real second weighing is not atypical
    assert (z[copiado].abs() > 3.5).mean() == 0       # nor is a copy
    assert abs(400 / ref.escala(np.array([2.0]))[0]) > 3.5  # 400 g in two days still is


def test_capa2_no_es_mas_fina_que_el_paso_de_la_variable(modelo):
    for var, m in modelo.capa2.items():
        assert m.escala_min >= modelo.refs1[var].resolucion / 2


def test_funciona_con_el_nacimiento_conocido_solo_al_anio(sev):
    """The source may share only the birth year: ages come as recorded and nothing rebuilds the date."""
    s = sev.subconjunto(sev.sujetos.sujeto[:2500])
    anio = pd.to_datetime(s.sujetos.fecha_nacimiento).dt.year
    s = replace(s, sujetos=s.sujetos.assign(fecha_nacimiento=pd.NaT, anio_nacimiento=anio, grupo='todo'))
    tr, ca, te, info = MA.dividir_por_tiempo(s)
    assert info.sujetos.sum() == 2500 and info.sujetos.min() > 0
    anios = {k: set(x.sujetos.anio_nacimiento) for k, x in (('tr', tr), ('ca', ca), ('te', te))}
    assert max(anios['te']) == anio.max()  # the most recent births are tested
    m = MA.ModeloAnomalias(MA.Config(rondas=60)).ajustar(tr, ca)
    d = m.puntuar(te).datos
    assert d.z2.notna().any() and d.ec_dias.notna().any()
    assert m.matriz.quiebres and any(c.startswith('quiebre_') for c in m.capa2[next(iter(m.capa2))].columnas)


def test_variable_entrenada_sola_da_el_mismo_modelo(modelo, particion):
    """Each variable draws from its own random stream, so retraining one alone (a new variable)
    gives exactly the model the full fit gave."""
    tr, ca, te, _ = particion
    var = 'talla_12m'
    sola = modelo.sin_variable(var).ajustar(tr, ca, solo_nuevas=True)
    a = modelo.puntuar(te).datos.query('variable == @var').z2
    b = sola.puntuar(te).datos.query('variable == @var').z2
    np.testing.assert_allclose(a.to_numpy(), b.to_numpy(), equal_nan=True)


def test_capa3_no_marca_campos_categoricos_de_la_visita(modelo, particion):
    """A visit outside its window is one problem per measured value, not one per form field."""
    _, _, te, _ = particion
    datos, _ = MA.preparar(te)
    visita = datos[datos.variable == 'peso_3m'][['sujeto', 't', 'edad_dias']].head(200)
    campo = pd.DataFrame({'sujeto': visita.sujeto, 'variable': 'vacuna_3m', 'valor': 'sí',
                          'fecha': visita.t + pd.Timedelta(days=400), 'edad_dias': np.nan})
    fila = dict(variable='vacuna_3m', tipo='categorical', rol='medicion', etapa='3 m EC')
    d = modelo.puntuar(te.con_variable(fila, campo)).datos
    assert not d[d.variable == 'vacuna_3m'].alerta3.any()
