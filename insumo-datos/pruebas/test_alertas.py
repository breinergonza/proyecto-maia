"""Clinical early warning: growth against WHO, outcome labels, the time cut and the risk models."""
from dataclasses import fields, replace

import numpy as np
import pandas as pd
import pytest

from anomalias import modelo as MA
from clinico import __main__ as CLI
from clinico import crecimiento as CR
from clinico import configuracion as CF
from clinico import modelo as AC
from sevarti import contrato as SV
from sevarti import diccionario as D
from sevarti import kmc as K
from conftest import CFG


# ------------------------------------------------------------------ growth

def test_puntaje_z_coincide_con_la_oms():
    ref = CR.leer_referencia()
    L, M, S = CR._lms(ref, 'peso', np.array([1.0, 1.0]), np.array([0.0, 365.25]))
    assert M.round(4).tolist() == [3.3464, 9.6479]   # WHO medians, boys, birth and 12 months
    z = CR.puntaje_z(np.array([3.3464, 9.6479]), L, M, S, restringido=True)
    np.testing.assert_allclose(z, [0, 0], atol=1e-6)
    menos2 = M[0] * (1 - 2 * L[0] * S[0]) ** (1 / L[0])     # the -2 SD weight at birth
    assert abs(CR.puntaje_z(np.array([menos2]), L[:1], M[:1], S[:1], True)[0] + 2) < 1e-6
    # beyond -3 SD, WHO measures in units of the last band: 1.5 kg at birth
    sd3, sd2 = (M[0] * (1 + L[0] * S[0] * k) ** (1 / L[0]) for k in (-3, -2))
    esperado = -3 + (1.5 - sd3) / (sd2 - sd3)
    assert abs(CR.puntaje_z(np.array([1.5]), L[:1], M[:1], S[:1], True)[0] - esperado) < 1e-9


def test_alerta_de_crecimiento_bajo_y_caida():
    z = pd.DataFrame({'sujeto': ['a', 'a', 'a', 'b'], 'concepto': 'peso', 'ec_dias': [0, 90, 180, 90],
                      'z': [0.5, -0.8, -2.3, -1.0], 'etapa': ['40 sem', '3 m EC', '6 m EC', '3 m EC']})
    a = CR.alertas_crecimiento(z).set_index(['sujeto', 'ec_dias'])
    assert a.loc[('a', 90), 'cae'] and not a.loc[('a', 90), 'bajo']       # fell 1.3 SD
    assert a.loc[('a', 180), 'bajo'] and a.loc[('a', 180), 'cae']
    assert not a.loc[('b', 90), ['bajo', 'cae']].any()
    assert a.loc[('a', 180), 'motivo'].startswith('por debajo de -2 DE')


# ------------------------------------------------------------ fixtures

# ------------------------------------------------------------- labels

def test_un_codigo_se_muestra_con_su_etiqueta(clinico):
    modelo = clinico[-1]
    assert modelo.dato('oxigeno_3m', '9.0') == 'oxigeno_3m = sin diagnóstico'
    assert modelo.dato('ingreso_hogar', 3500000.0).endswith('= 3.500.000')


def test_etiquetas_solo_para_quien_vino_y_con_ventana_cerrada(clinico):
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    vinieron = modelo.asistieron(p, '40 sem')
    readm = modelo.etiqueta(p, CFG.desenlaces[0])
    assert set(readm.index) == set(vinieron)
    con_3m = set(p.datos.loc[p.datos.etapa == '3 m EC', 'sujeto'])
    assert readm[readm.notna()].index.isin(list(con_3m)).all()      # known only if the child came back
    no_vuelve = modelo.etiqueta(p, CFG.desenlaces[1])
    volvieron = no_vuelve[no_vuelve.index.isin(list(con_3m))]
    assert (volvieron.dropna() == 0).all()
    assert (no_vuelve[~no_vuelve.index.isin(list(con_3m))].dropna() == 1).all()
    # with the cut at the 40-week visits themselves, nobody's 3-month window has closed yet
    temprano = replace(sev, corte=p.datos.loc[p.datos.etapa == '40 sem', 't'].min())
    p2 = modelo.preparar(temprano)
    assert modelo.etiqueta(p2, CFG.desenlaces[1]).dropna().empty


def test_el_momento_no_ve_nada_posterior(clinico):
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    X = modelo.matriz(p, '40 sem')
    posteriores = set(sev.esquema.variable[sev.esquema.etapa.isin(['3 m EC', '6 m EC', '12 m EC'])])
    assert not posteriores & set(X.columns)
    assert 'dias_uci' in X and 'peso_40' in X and 'z_peso_40_sem' in X
    assert not [c for c in X if c.startswith('z_') and not c.endswith('40_sem')]
    m = modelo.modelos['readm']
    assert 'readm_3m' not in m.columnas


# --------------------------------------------------------------- models

def test_aprende_la_causa_y_le_gana_a_la_regla_simple(clinico):
    *_, te, modelo = clinico
    ev, cal, _ = AC.evaluar(modelo, te)
    readm = ev.loc['readmisión antes de los 3 meses']
    assert readm.AUC > 0.7 and readm.AUC > readm['AUC regla simple'] + 0.05
    assert ev.loc['desarrollo bajo a los 6 meses'].AUC > 0.7     # gestational age carries it
    c = cal['readm']
    assert abs(c.riesgo_medio.mean() - c.observado.mean()) < 0.05   # calibrated on average
    assert readm['casos en el riesgo más alto (%)'] > 100 * CFG.fraccion_alta   # better than chance


def test_riesgos_en_la_ultima_visita_con_motivos(clinico):
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    r = modelo.riesgos(p, solo_pendientes=False)
    assert r.groupby(['sujeto', 'clave']).size().max() == 1
    assert r.riesgo.between(0, 1).all()
    assert r.motivos.str.len().gt(0).all()                          # every child gets its reasons
    readm = r[r.clave == 'readm']
    altos = readm[readm.riesgo >= readm.riesgo.quantile(0.9)]
    assert len(altos) and altos.motivos.str.contains('ingreso_hogar').mean() > 0.5
    orden = sev.etapas.set_index('etapa').orden
    vino = p.datos[p.datos.etapa.notna() & p.datos.t.notna()]
    ultima = vino.assign(o=vino.etapa.map(orden)).groupby('sujeto').o.max()
    assert (ultima.reindex(r.sujeto).to_numpy() == r.momento.map(orden).to_numpy()).all()


def test_el_modelo_no_decide_a_quien_avisar(clinico):
    """How many children are shown is decided by whoever presents the risks, not by the model:
    every child gets its risk and its position, and nothing says who is alerted."""
    sev, *_, modelo = clinico
    r = modelo.riesgos(modelo.preparar(sev), con_motivos=False, solo_pendientes=False)
    assert 'alerta' not in r and 'tasa_alerta' not in {f.name for f in fields(AC.ConfigClinica)}
    assert r.percentil.between(0, 100).all()
    for _, g in r.groupby('clave'):
        assert g.sort_values(['percentil', 'riesgo']).riesgo.is_monotonic_increasing   # same order as risk


def test_percentil_ordena_aunque_la_calibracion_tenga_escalones(clinico):
    """Calibration is a step function: many children share a calibrated risk. The position is
    read on the model's own score, which orders them finely, so the top 10% is about 10%."""
    sev, *_, te, modelo = clinico
    r = modelo.riesgos(modelo.preparar(te), solo_ultima_visita=False, con_motivos=False, solo_pendientes=False)
    for clave, g in r.groupby('clave'):
        assert (g.percentil >= 90).mean() == pytest.approx(0.10, abs=0.04), clave
        assert g.percentil.nunique() > g.riesgo.nunique(), clave


def test_modelo_clinico_guardado_da_los_mismos_riesgos(clinico, tmp_path, monkeypatch):
    sev, *_, te, modelo = clinico
    AC.guardar(modelo, tmp_path, sev, None)
    cargado, ficha = AC.cargar(tmp_path)
    p = modelo.preparar(te)
    pd.testing.assert_frame_equal(modelo.riesgos(p, con_motivos=False), cargado.riesgos(p, con_motivos=False))
    assert 'umbrales' not in ficha and 'tasa_alerta' not in ficha['config']
    monkeypatch.setattr(AC, 'VERSION_CODIGO', 'otra')
    with pytest.raises(RuntimeError, match='reentrenar'):
        AC.cargar(tmp_path)


def test_metricas_basicas():
    y = np.array([0, 0, 1, 1])
    assert AC.auc(y, np.array([0.1, 0.2, 0.8, 0.9])) == 1.0
    assert AC.auc(y, np.array([0.9, 0.8, 0.2, 0.1])) == 0.0
    xs, ys = AC.isotonica(np.array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), np.array([0, 1, 0, 0, 1, 1]))
    assert (np.diff(ys) >= 0).all() and ys.min() >= 0 and ys.max() <= 1


def test_riesgo_calibrado_nunca_es_0_ni_100():
    rng = np.random.default_rng(9)
    p = rng.random(3000)
    y = (rng.random(3000) < p ** 3).astype(int)
    y[p < 0.3] = 0                 # a whole low tail without a single case
    y[np.argsort(p)[-3:]] = 1      # and the three highest, all cases
    xs, ys = AC.isotonica(p, y)
    assert (np.diff(ys) >= 0).all()
    assert 0 < ys.min() < 0.01 and 0.5 < ys.max() < 1    # three cases out of three is not certainty
    bajo = p < 0.3
    assert abs(np.interp(0.15, xs, ys) - y[bajo].mean()) < 0.01   # large groups keep their own rate


def test_conteo_de_una_visita_que_no_ocurrio_no_es_desenlace(clinico):
    """A source may fill the readmission count with 0 for children who never came to that visit."""
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    vinieron_3m = set(modelo.asistieron(p, '3 m EC'))
    vinieron_40 = modelo.asistieron(p, '40 sem')
    no_vino = [s for s in vinieron_40 if s not in vinieron_3m][:50]
    relleno = pd.DataFrame({'sujeto': no_vino, 'variable': 'readm_3m', 'valor': 0.0, 'fecha': pd.NaT,
                            'edad_dias': np.nan})
    con_relleno = replace(sev, mediciones=pd.concat([sev.mediciones, relleno], ignore_index=True))
    y = modelo.etiqueta(modelo.preparar(con_relleno), CFG.desenlaces[0])
    assert y.reindex(no_vino).isna().all()


def test_linea_de_comandos_clinica_de_punta_a_punta(clinico, proyecto, tmp_path, monkeypatch, capsys):
    sev = clinico[0]
    carpeta = SV.guardar(sev, tmp_path / 'sev')
    monkeypatch.setattr(CF, 'cargar', lambda prueba=False: pytest.fail('entrenar usa solo lo "En uso"') if prueba else CFG)
    P = proyecto
    base = ['--sevarti', str(carpeta)]

    CLI.main([*base, 'entrenar', '--sin-validacion'])
    assert len(list(P.modelos_clinicos.glob('*/ficha.json'))) == 1

    CLI.main([*base, 'riesgos', '--silencio'])
    assert 'no se entrega' in capsys.readouterr().out
    assert len(list(P.silencio.glob('*.parquet'))) == 1
    assert not P.riesgos.exists()                                               # silence delivers nothing

    CLI.main([*base, 'silencio'])
    assert 'Riesgos guardados en silencio' in capsys.readouterr().out

    with pytest.raises(SystemExit):                       # the threshold is not the pipeline's
        CLI.main([*base, '--tasa', '0.2', 'riesgos'])
    capsys.readouterr()

    CLI.main([*base, 'riesgos', '--desde', '2020-01-01'])
    capsys.readouterr()
    libro = pd.read_excel(next(P.riesgos.glob('*.xlsx')), sheet_name=None)
    assert list(libro) == ['Instrucciones', 'Riesgo', 'Crecimiento', 'Resumen']
    hoja_riesgo = libro['Riesgo']
    assert {'Riesgo (%)', 'Posición (0 a 100)', 'Por qué'} <= set(hoja_riesgo) and 'alerta' not in hoja_riesgo
    assert (pd.to_datetime(hoja_riesgo['Fecha de la visita']) >= '2020-01-01').all()
    assert hoja_riesgo['Por qué'].str.len().gt(0).all()
    assert hoja_riesgo['Riesgo (%)'].between(0, 100).all()
    assert len(hoja_riesgo) == libro['Resumen']['Niños'].sum()    # every pending child, not a share
    CLI.main([*base, 'riesgos'])                      # the same cut again: the same delivery, not an empty one
    capsys.readouterr()
    assert len(pd.read_excel(next(P.riesgos.glob('*.xlsx')), sheet_name='Riesgo')) == len(hoja_riesgo)


def test_columnas_categoricas_iguales_aunque_falte_la_variable(clinico):
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    sin_sexo = replace(sev, mediciones=sev.mediciones[sev.mediciones.variable != 'sexo'])
    X = modelo.matriz(modelo.preparar(sin_sexo), '40 sem')
    assert isinstance(X['sexo'].dtype, pd.CategoricalDtype) and X['sexo'].isna().all()
    assert modelo.modelos['readm'].riesgo(X).shape == (len(X),)


def test_dato_de_crecimiento_imposible_se_revisa_no_alerta():
    z = pd.DataFrame({'sujeto': ['a'] * 3, 'concepto': 'talla', 'ec_dias': [0, 90, 180],
                      'z': [-1.0, -9.0, -1.2], 'etapa': ['40 sem', '3 m EC', '6 m EC']})
    a = CR.alertas_crecimiento(z).set_index('ec_dias')
    assert a.loc[90, 'improbable'] and not a.loc[90, 'bajo'] and 'revisar el dato' in a.loc[90, 'motivo']
    assert not a.loc[180, 'cae']           # compared with the last credible value (-1.0), not with -9


def test_medida_con_la_edad_de_otra_visita_se_revisa_no_alerta():
    z = pd.DataFrame({'sujeto': ['a'] * 3, 'concepto': 'peso', 'ec_dias': [90, 0, 270],
                      'z': [-1.0, -3.5, -1.3], 'etapa': ['3 m EC', '12 m EC', '9 m EC'],
                      'en_ventana': [True, False, True]})   # a 12-month visit recorded at age 0
    a = CR.alertas_crecimiento(z).set_index('etapa')
    assert a.loc['12 m EC', 'revisar'] and not a.loc['12 m EC', 'bajo'] and not a.loc['12 m EC', 'cae']
    assert 'revisar el dato' in a.loc['12 m EC', 'motivo'] and 'edad' in a.loc['12 m EC', 'motivo']
    assert not a.loc['9 m EC', 'cae'] and a.loc['9 m EC', 'z_previo'] == -1.0   # compared with the credible one
    assert not a.loc['3 m EC', 'revisar']


def test_una_medida_por_visita_y_edad_fuera_de_la_ventana():
    datos = pd.DataFrame({'sujeto': ['a', 'a', 'b'], 'variable': ['peso_40', 'peso_salida_pc', 'peso_12m'],
                          'etapa': ['40 sem', '40 sem', '12 m EC'], 'concepto': 'peso',
                          'ec_dias': [10.0, 3.0, 20.0], 'edad_dias': [70.0, 63.0, 80.0]})
    x = pd.Series([3500.0, 3300.0, 3600.0], index=datos.index)
    sexo = pd.Series({'a': 1, 'b': 2})
    etapas = pd.DataFrame({'etapa': ['40 sem', '12 m EC'], 'orden': [1, 2], 'edad_min': [-21, 315],
                           'edad_max': [35, 450], 'base': 'corregida'})
    medida = CR.Medida('peso', 'peso', factor=0.001, restringido=True)
    z = CR.puntajes_z(datos, x, sexo, (medida,), CR.leer_referencia(), {'40 sem', '12 m EC'}, etapas).set_index('sujeto')
    assert len(z.loc[['a']]) == 1 and z.loc['a', 'variable'] == 'peso_40'   # the visit's latest weight
    assert z.loc['a', 'en_ventana'] and not z.loc['b', 'en_ventana']      # 20 days is not a 12-month visit


def test_comparacion_justa_con_empates():
    r = np.array([0.2] * 90 + [0.5] * 10)
    assert AC.primeros(r, 0.10).sum() == 10 and AC.primeros(r, 0.10)[90:].all()
    assert AC.primeros(np.full(100, 0.3), 0.10).sum() == 10     # all tied: still exactly 10%


def test_no_vuelve_solo_si_la_siguiente_visita_aun_no_empieza(clinico):
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    des = CFG.desenlaces[1]
    y = modelo.etiqueta(p, des)
    en_40 = p.datos[(p.datos.etapa == '40 sem') & p.datos.t.notna()].groupby('sujeto').ec_dias.median()
    tarde = en_40[en_40 >= 45].index                  # already inside the 3-month window (edad_min 45)
    assert y.reindex(tarde).isna().all()


def test_desenlace_solo_desde_un_quiebre(clinico):
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    des = replace(CFG.desenlaces[2], solo_desde='cambio de sistema 2022')
    y = modelo.etiqueta(p, des).dropna()
    nac = pd.to_datetime(sev.sujetos.set_index('sujeto').fecha_nacimiento)
    assert len(y) and (nac.reindex(y.index) >= '2022-01-01').all()


def test_solo_los_codigos_de_ausencia_cuentan_como_no(clinico):
    """With the absence codes listed, any other code ("no hay dato", a stray one) leaves the outcome
    unknown instead of counting as a no; without them, every other code is a no."""
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    filas = p.datos.index[p.datos.variable == 'oxigeno_3m']
    raro = filas[p.datos.valor[filas].astype(float).to_numpy() == 9.0][:20]
    p = replace(p, datos=p.datos.assign(valor=p.datos.valor.where(~p.datos.index.isin(raro), 5.0)))
    sujetos_raros = p.datos.sujeto[raro]
    con_ausencia = modelo.etiqueta(p, replace(CFG.desenlaces[2], negativos=(9.0,)))
    sin_ausencia = modelo.etiqueta(p, CFG.desenlaces[2])
    assert con_ausencia.reindex(sujetos_raros).isna().all()
    assert (sin_ausencia.reindex(sujetos_raros).dropna() == 0).all() and sin_ausencia.reindex(sujetos_raros).notna().any()
    otros = con_ausencia.index.difference(pd.Index(sujetos_raros))
    pd.testing.assert_series_equal(con_ausencia.reindex(otros), sin_ausencia.reindex(otros))
    solo_dos = modelo.etiqueta(p, replace(CFG.desenlaces[2], negativos=(2.0,)))
    assert set(solo_dos.dropna().unique()) == {1.0}     # 9 is "sin diagnóstico" only when listed


def test_calibra_con_los_mas_recientes_de_desenlace_conocido(clinico):
    """Level and threshold are set on the most recent children whose outcome is known."""
    _, tr, _, _, modelo = clinico
    p = modelo.preparar(tr)
    nac = pd.to_datetime(tr.sujetos.set_index('sujeto').fecha_nacimiento)
    for clave, m in modelo.modelos.items():
        y = modelo.etiqueta(p, m.desenlace, m.corte_variable).dropna()
        anio_max_calibracion = int(m.calibrado_con.split(' a ')[-1])
        assert anio_max_calibracion == nac.reindex(y.index).dt.year.max()
        assert m.n_entrenamiento < len(y)

def test_ultima_visita_ignora_datos_rellenos_de_visitas_futuras(clinico):
    """A source may fill a later visit's count with 0: the child still gets its alert at the
    last visit it really came to."""
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    solo_40 = set(modelo.asistieron(p, '40 sem')) - set(modelo.asistieron(p, '3 m EC')) - set(
        modelo.asistieron(p, '6 m EC')) - set(modelo.asistieron(p, '12 m EC'))
    elegidos = sorted(solo_40)[:40]
    relleno = pd.DataFrame({'sujeto': elegidos, 'variable': 'readm_3m', 'valor': 0.0, 'fecha': pd.NaT, 'edad_dias': np.nan})
    con_relleno = replace(sev, mediciones=pd.concat([sev.mediciones, relleno], ignore_index=True))
    r = modelo.riesgos(modelo.preparar(con_relleno), con_motivos=False, solo_pendientes=False)
    assert set(elegidos) <= set(r.loc[r.momento == '40 sem', 'sujeto'])


def test_avisa_solo_a_quien_aun_puede_llegar_a_la_siguiente_visita(clinico):
    """An early alert is for children whose next visit window is still open at the cut."""
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    todos = modelo.riesgos(p, con_motivos=False, solo_pendientes=False)
    vigentes = modelo.riesgos(p, con_motivos=False)
    assert 0 < len(vigentes) < len(todos)
    en_40 = p.datos[(p.datos.etapa == '40 sem') & p.datos.t.notna()].groupby('sujeto').agg(t=('t', 'median'),
                                                                                           ec=('ec_dias', 'median'))
    cierra = en_40.t + pd.to_timedelta(135 - en_40.ec, unit='D')       # 3-month window closes at 135 days
    a_40 = vigentes[vigentes.momento == '40 sem'].sujeto
    assert (cierra.reindex(a_40) > sev.corte).all()
    viejo = replace(sev, corte=pd.Timestamp('2040-01-01'))           # every window closed: nobody pending
    assert modelo.riesgos(modelo.preparar(viejo), con_motivos=False).empty


def test_variable_que_llega_tarde_no_se_usa(clinico):
    """A visit variable the source fills in months later is still missing at alert time: a model
    that used it would read "missing" as risk."""
    sev, tr, _, _, _ = clinico
    datos, _ = MA.preparar(sev)
    recientes = datos[(datos.etapa == '40 sem') & (datos.t >= sev.corte - pd.Timedelta(days=180))].sujeto.unique()
    med = sev.mediciones
    tarde = replace(sev, mediciones=med[~((med.variable == 'talla_40') & med.sujeto.isin(recientes))])
    cfg = replace(CFG, dias_recientes=180)          # the simulated cohort has few visits in the last 90 days
    tardias = AC.ModeloClinico(cfg).detectar_tardias(tarde)
    assert tardias == ['talla_40']
    assert AC.ModeloClinico(cfg).detectar_tardias(sev) == []
    m = AC.ModeloClinico(CFG).ajustar(tr, tardias=tardias)
    assert m.tardias == tardias and all('talla_40' not in md.columnas for md in m.modelos.values())


def test_variable_que_se_llena_en_la_visita_siguiente_no_se_usa(clinico):
    """A visit variable the source fills in only when the child comes to the next visit is empty
    for every child an alert is for, and in the history its presence gives away the outcome.
    Even a rarely filled one (here 1 in 4 of those who came back) is found, when the recent
    visits would have held enough of it (``min_casos``; the simulated cohort has few of them)."""
    sev, *_ = clinico
    datos, _ = MA.preparar(sev)
    volvieron = datos[(datos.etapa == '6 m EC') & datos.t.notna()].sujeto.unique()[::4]
    med = sev.mediciones
    luego = replace(sev, mediciones=med[~((med.variable == 'talla_3m') & ~med.sujeto.isin(volvieron))])
    cfg = replace(CFG, min_casos=5)
    assert AC.ModeloClinico(cfg).detectar_tardias(luego) == ['talla_3m']
    assert AC.ModeloClinico(cfg).detectar_tardias(sev) == []



# ------------------------------------------------- what the dictionary leaves out

def _sin_variable(sev, variable):
    return replace(sev, esquema=sev.esquema[sev.esquema.variable != variable],
                   mediciones=sev.mediciones[sev.mediciones.variable != variable])


def test_desenlace_sin_su_variable_visita_o_quiebre_queda_sin_modelo_con_el_motivo(clinico):
    """An expert may mark an outcome's variable "No usar", or drop a visit or a break: that
    outcome is left out with the reason, and the others are still trained."""
    _, tr, *_ = clinico
    leido = CFG.desenlaces[0]
    cfg = replace(CFG, desenlaces=(
        leido,
        replace(leido, clave='sin_variable', variable='no_existe'),
        replace(leido, clave='sin_visita', momento='visita que no existe'),
        replace(leido, clave='sin_quiebre', solo_desde='quiebre que no existe'),
    ))
    modelo = AC.ModeloClinico(cfg).ajustar(tr)
    assert list(modelo.modelos) == ['readm']
    assert set(modelo.omitidos) == {'sin_variable', 'sin_visita', 'sin_quiebre'}
    assert 'la variable no_existe no está en los datos' in modelo.omitidos['sin_variable']
    assert 'estado "Lista"' in modelo.omitidos['sin_variable']
    assert 'la visita "visita que no existe" no está en los datos' in modelo.omitidos['sin_visita']
    assert 'el quiebre "quiebre que no existe" no está en los datos' in modelo.omitidos['sin_quiebre']


def test_riesgos_sin_la_visita_o_el_quiebre_de_un_desenlace_entregan_los_demas(clinico):
    sev, *_, modelo = clinico
    con_quiebre = replace(modelo, modelos={**modelo.modelos, 'readm': replace(
        modelo.modelos['readm'], desenlace=replace(modelo.modelos['readm'].desenlace, solo_desde='cambio de sistema 2022'))})
    sin_quiebre = replace(sev, quiebres=sev.quiebres.iloc[:0])
    assert con_quiebre.sin_datos(sev) == {}
    assert set(con_quiebre.sin_datos(sin_quiebre)) == {'readm'}
    r = con_quiebre.riesgos(con_quiebre.preparar(sin_quiebre), solo_pendientes=False, con_motivos=False)
    assert 'readm' not in set(r.clave) and set(r.clave) == set(modelo.modelos) - {'readm'}
    # the outcome's own variable is not needed to score: only to learn
    assert con_quiebre.sin_datos(_sin_variable(sev, 'readm_3m')) == {}


def test_sin_la_variable_de_sexo_no_hay_crecimiento_y_lo_dice(clinico):
    sev, *_, modelo = clinico
    with pytest.raises(ValueError, match='sexo.*estado "Lista"'):
        modelo.preparar(_sin_variable(sev, 'sexo'))


# ------------------------------------------------- growth at 12 months, experiment

TALLA_12M = AC.Desenlace('talla_12m', 'talla baja para la edad a los 12 meses', '40 sem', 'z_bajo',
                         concepto='talla', etapa='12 m EC')


def test_peso_para_la_talla_coincide_con_la_oms():
    """Weight-for-length runs on the length measured at the same visit, not on age."""
    datos = pd.DataFrame({'sujeto': ['a', 'a', 'b', 'b', 'c'], 'variable': ['peso_12m', 'talla_12m'] * 2 + ['peso_12m'],
                          'etapa': '12 m EC', 'concepto': ['peso', 'talla'] * 2 + ['peso'], 'ec_dias': 365.0})
    sd2 = 2.4607 * (1 - 2 * -0.3833 * 0.09029) ** (1 / -0.3833)       # girls, 45 cm, -2 SD
    x = pd.Series([7266.6, 65.0, 1000 * sd2, 45.0, 7000.0], index=datos.index)
    sexo = pd.Series({'a': 1, 'b': 2, 'c': 1})
    medida = CR.Medida('peso', 'peso_para_talla', factor=0.001, restringido=True, por_talla='talla')
    z = CR.puntajes_z(datos, x, sexo, (medida,), CR.leer_referencia(), {'12 m EC'}).set_index('sujeto')
    assert set(z.concepto) == {'peso_para_talla'} and 'c' not in z.index      # no length, no z
    assert abs(z.z['a']) < 1e-3 and abs(z.z['b'] + 2) < 1e-6


def test_desenlace_de_crecimiento_a_los_12_meses(clinico):
    sev, *_, modelo = clinico
    p = modelo.preparar(sev)
    y = modelo.etiqueta(p, TALLA_12M)
    assert set(y.index) == set(modelo.asistieron(p, '40 sem'))
    z = p.z[(p.z.concepto == 'talla') & (p.z.etapa == '12 m EC') & p.z.en_ventana].groupby('sujeto').z.first()
    z = z[z.abs() <= CR.Z_IMPROBABLE].reindex(y.index)   # an implausible z or an age outside the visit is not known
    pd.testing.assert_series_equal(y.dropna(), (z.dropna() < -2).astype(float), check_names=False)
    assert y.notna().sum() < len(y) and y.sum() > 0         # unknown without the 12-month length


def test_desenlace_de_crecimiento_sin_lo_que_necesita_queda_sin_modelo(clinico):
    sev, *_, modelo = clinico
    assert modelo.falta(sev, TALLA_12M) is None
    sin_etapa = replace(TALLA_12M, etapa='24 m EC')
    assert 'la visita "24 m EC" no está en los datos' in modelo.falta(sev, sin_etapa)
    assert 'peso_para_talla' in modelo.falta(sev, replace(TALLA_12M, concepto='peso_para_talla'))
    tarde = replace(TALLA_12M, momento='12 m EC')
    assert 'antes de' in modelo.falta(sev, tarde)


def test_experimento_valida_sin_tocar_el_modelo_en_uso(clinico, proyecto, tmp_path, monkeypatch, capsys):
    sev = clinico[0]
    carpeta = SV.guardar(sev, tmp_path / 'sev')
    pedidas = []

    def cargar(prueba=False):
        pedidas.append(prueba)
        return replace(CFG, desenlaces=(CFG.desenlaces[0], TALLA_12M),
                       descartados=(('mal_escrito', 'falta la "Variable"'),))
    monkeypatch.setattr(CF, 'cargar', cargar)
    CLI.main(['--sevarti', str(carpeta), 'experimento'])
    salida = capsys.readouterr().out
    assert pedidas == [True]                                  # "En uso" and "En prueba"
    assert 'Validación por desenlace (experimento)' in salida and 'talla baja para la edad' in salida
    assert 'mal_escrito' in salida                            # an unusable row is said, the rest go on
    tabla = pd.read_csv(next(proyecto.experimentos.glob('*.csv')))
    assert {'readmisión antes de los 3 meses', 'talla baja para la edad a los 12 meses'} <= set(tabla.desenlace)
    assert 'mal_escrito' in set(tabla.desenlace)
    assert not proyecto.modelos_clinicos.exists() and not proyecto.riesgos.exists()


# ---------------------------------------------------------- configuration from the dictionary

def _diccionario(desenlaces: list[dict], crecimiento: list[dict] | None = None) -> D.Diccionario:
    """A small dictionary: two visits, a coded event, weight and length, one break."""
    variables = pd.DataFrame([
        dict(variable='evento', estado=D.LISTA, tipo='categorical', categorias='1=Si;2=No;9=No hay dato'),
        dict(variable='conteo', estado=D.LISTA, tipo='numeric'),
        dict(variable='peso_v', estado=D.LISTA, tipo='numeric', concepto='peso'),
        dict(variable='talla_v', estado=D.LISTA, tipo='numeric', concepto='talla'),
        dict(variable='sexo', estado=D.LISTA, tipo='categorical', categorias='1=niño;2=niña'),
    ])
    visitas = pd.DataFrame([dict(etapa='a', orden=0, base='corregida'), dict(etapa='b', orden=1, base='corregida')])
    quiebres = pd.DataFrame([dict(quiebre='cambio', fecha=pd.Timestamp('2022-01-01'))])
    crecimiento = crecimiento if crecimiento is not None else [
        dict(indicador='peso', concepto='peso', unidad='g', estado=D.EN_USO),
        dict(indicador='talla', concepto='talla', unidad='cm', z_bajo=-3.0, caida=1.5, estado=D.EN_USO)]
    curva = pd.DataFrame([dict(sexo='sexo', codigo_nino='1', codigo_nina='2', etapas='a;b')])
    return D.Diccionario(variables, visitas, quiebres=quiebres, desenlaces=pd.DataFrame(desenlaces),
                         crecimiento=pd.DataFrame(crecimiento), curva=curva)


def _fila(clave: str, regla: str = 'en_codigos', estado: str = D.EN_USO, **resto: object) -> dict:
    base = dict(clave=clave, nombre=f'desenlace {clave}', estado=estado, regla=regla, momento='a',
                variable='evento' if regla == 'en_codigos' else None, codigos='1' if regla == 'en_codigos' else None,
                negativos='2;9' if regla == 'en_codigos' else None, comparar='eg_semanas;peso_v')
    return base | resto


def test_un_desenlace_del_diccionario_llega_al_modelo_como_lo_escribieron_los_expertos():
    dic = _diccionario([
        _fila('ok'),
        _fila('cuenta', 'mayor_que_cero', variable='conteo', solo_desde='cambio'),
        _fila('bajo', 'percentil_bajo', variable='conteo', percentil=5.0),
        _fila('bajo_defecto', 'percentil_bajo', variable='conteo'),
        _fila('se_va', 'no_vuelve'),
        _fila('talla_baja', 'z_bajo', medida='talla', etapa='b'),
        _fila('nuevo', estado=D.EN_PRUEBA),
        _fila('apagado', estado=D.APAGADO),
    ])
    en_uso, prueba = CF.leer(dic), CF.leer(dic, prueba=True)
    assert [d.clave for d in en_uso.desenlaces] == ['ok', 'cuenta', 'bajo', 'bajo_defecto', 'se_va', 'talla_baja']
    assert [d.clave for d in prueba.desenlaces] == [d.clave for d in en_uso.desenlaces] + ['nuevo']
    assert not en_uso.descartados
    d = {x.clave: x for x in en_uso.desenlaces}
    assert d['ok'] == AC.Desenlace('ok', 'desenlace ok', 'a', 'en_codigos', 'evento', codigos=(1.0,),
                                   negativos=(2.0, 9.0), comparar=('eg_semanas', 'peso_v'))
    assert d['cuenta'].solo_desde == 'cambio' and d['bajo'].percentil == 0.05 and d['bajo_defecto'].percentil == 0.10
    assert d['se_va'].variable is None
    assert (d['talla_baja'].concepto, d['talla_baja'].etapa) == ('talla', 'b')
    medidas = {m.indicador: m for m in en_uso.medidas}
    assert medidas['peso'] == CR.Medida('peso', 'peso', factor=0.001, restringido=True)   # grams to WHO's kg
    assert (medidas['talla'].factor, medidas['talla'].z_bajo, medidas['talla'].caida) == (1.0, -3.0, 1.5)
    assert (en_uso.sexo, en_uso.codigos_sexo, en_uso.etapas_crecimiento) == ('sexo', (('1', 1), ('2', 2)), ('a', 'b'))


@pytest.mark.parametrize('fila, motivo', [
    (_fila('x', variable=None), 'falta la "Variable"'),
    (_fila('x', variable='no_existe'), 'no_existe no está en la hoja "Variables"'),
    (_fila('x', negativos=None), 'faltan los "Códigos de no"'),
    (_fila('x', codigos='uno'), '"Códigos de sí" tiene algo que no es un código'),
    (_fila('x', codigos='3'), 'el código 3 no está en las etiquetas de evento'),
    (_fila('x', codigos='1', negativos='1;2'), 'a la vez'),
    (_fila('x', momento='z'), 'la visita "z" no está en la hoja "Visitas"'),
    (_fila('x', solo_desde='otro'), 'el quiebre "otro" no está en la hoja "Quiebres"'),
    (_fila('x', comparar='eg_semanas;inventada'), 'inventada'),
    (_fila('x', 'percentil_bajo', variable='conteo', percentil=150.0), 'entre 0 y 100'),
    (_fila('x', 'z_bajo'), 'falta la "Medida de crecimiento"'),
    (_fila('x', 'z_bajo', medida='perimetro_cefalico', etapa='b'), 'no está en uso en la hoja "Crecimiento"'),
    (_fila('x', 'z_bajo', medida='talla'), 'falta la "Visita del desenlace"'),
])
def test_una_fila_que_no_se_puede_usar_queda_sin_modelo_con_su_motivo_y_las_demas_siguen(fila, motivo):
    cfg = CF.leer(_diccionario([_fila('ok'), fila]))
    assert [d.clave for d in cfg.desenlaces] == ['ok']
    assert motivo in dict(cfg.descartados)['x']


@pytest.mark.parametrize('medida, motivo', [
    (dict(indicador='talla', concepto='talla', unidad='kg', estado=D.EN_USO), 'la unidad kg no es de longitud'),
    (dict(indicador='peso_para_talla', concepto='peso', unidad='g', estado=D.EN_USO), 'falta "Con la talla de"'),
    (dict(indicador='perimetro_cefalico', concepto='cabeza', unidad='cm', estado=D.EN_USO), '"cabeza" en "Qué mide"'),
])
def test_una_medida_que_no_se_puede_usar_se_dice_y_sus_desenlaces_tambien(medida, motivo):
    dic = _diccionario([_fila('baja', 'z_bajo', medida=medida['indicador'], etapa='b')], crecimiento=[medida])
    cfg = CF.leer(dic)
    assert not cfg.medidas and not cfg.desenlaces
    descartados = dict(cfg.descartados)
    assert motivo in next(v for k, v in descartados.items() if k.startswith('crecimiento: '))
    assert 'no está en uso en la hoja "Crecimiento"' in descartados['baja']


def test_sin_curva_oms_no_hay_crecimiento_y_lo_dice():
    with pytest.raises(ValueError, match='"Curva OMS"'):
        CF.leer(replace(_diccionario([_fila('ok')]), curva=pd.DataFrame()))
    con_visita_inventada = _diccionario([_fila('ok')])
    con_visita_inventada.curva.loc[0, 'etapas'] = 'a;z'
    with pytest.raises(ValueError, match='z'):
        CF.leer(con_visita_inventada)


def test_el_borrador_clinico_de_kmc_trae_los_desenlaces_en_uso_y_en_prueba_y_todos_se_pueden_usar():
    """The first content of the clinical sheets: every row usable with a dictionary that has the
    variables it names; 14 outcomes in use, 52 with those in test."""
    clinico = K.borrador_clinico()
    nombradas = set(clinico.desenlaces.variable.dropna()) | {c for t in clinico.desenlaces.comparar
                                                            for c in D.partes(t)} - set(CF.DEL_NINO)
    variables = pd.DataFrame([dict(variable=v, estado=D.LISTA, tipo='categorical', categorias='1=a;2=b;3=c;4=d')
                              for v in sorted(nombradas)]
                             + [dict(variable=c, estado=D.LISTA, tipo='numeric', concepto=c)
                                for c in ('peso', 'talla', 'perimetro_cefalico')])
    dic = replace(clinico, variables=variables, visitas=K.ETAPAS_SEVARTI, quiebres=K.QUIEBRES)
    en_uso, prueba = CF.leer(dic), CF.leer(dic, prueba=True)
    assert not en_uso.descartados and not prueba.descartados
    assert (len(en_uso.desenlaces), len(prueba.desenlaces)) == (14, 52)
    assert set(en_uso.desenlaces) < set(prueba.desenlaces)
    assert {d.regla for d in prueba.desenlaces} <= set(AC.REGLAS)
    assert all(d.negativos for d in prueba.desenlaces if d.regla == 'en_codigos')   # "no hay dato" is unknown
    assert all(d.comparar for d in prueba.desenlaces)


def test_las_listas_del_diccionario_son_las_del_motor():
    assert set(D._REGLA) == set(AC.REGLAS)
    assert set(D._INDICADOR) == set(CR.INDICADORES) == set(CR.MAGNITUD)
    assert set(D._UNIDAD) == set(CR.UNIDADES)


def test_cada_medida_alerta_con_sus_propios_limites():
    z = pd.DataFrame({'sujeto': ['a', 'a', 'b'], 'variable': 'v', 'etapa': ['1', '2', '1'],
                      'concepto': ['talla', 'talla', 'peso'], 'ec_dias': [10.0, 100.0, 10.0], 'z': [0.0, -2.5, -2.5]})
    talla = CR.Medida('talla', 'talla', z_bajo=-3.0, caida=3.0)
    a = CR.alertas_crecimiento(z, (talla,)).set_index(['sujeto', 'ec_dias'])
    assert not a.loc[('a', 100.0), 'bajo'] and not a.loc[('a', 100.0), 'cae']    # -2.5 is not under -3
    assert a.loc[('b', 10.0), 'bajo'] and a.loc[('b', 10.0), 'motivo'] == 'por debajo de -2 DE'   # WHO default
    a = CR.alertas_crecimiento(z).set_index(['sujeto', 'ec_dias'])
    assert a.loc[('a', 100.0), 'motivo'] == 'por debajo de -2 DE y cayó más de 1 DE'
