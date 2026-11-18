"""Day-to-day use: saved models, the review queue, the expert loop and the command line."""
import json

import numpy as np
import pandas as pd
import pytest

from anomalias import __main__ as CLI
from anomalias import modelo as MA
from anomalias import operacion as OP
from archivos import libros as LB
from sevarti import contrato as SV
from datos_nucleo import CONFIG_RAPIDA


def test_modelo_guardado_puntua_igual_y_trae_su_ficha(modelo, particion, puntuado, tmp_path):
    te, res = puntuado
    destino = OP.guardar(modelo, tmp_path, te, {'alertas_por_1000_prueba': OP.tasas_alerta(res)})
    assert (destino / f'mascara_{modelo.version}.csv.gz').exists()
    cargado, ficha = OP.cargar(tmp_path)  # the folder of models: takes the most recent
    assert ficha['version'] == modelo.version and ficha['sujetos'] == te.sujetos.sujeto.nunique()
    otra = cargado.puntuar(te).datos
    pd.testing.assert_series_equal(otra.z2, res.datos.z2)
    assert not OP.deriva(cargado.puntuar(te), ficha).revisar.any()


def test_modelo_de_otra_version_del_codigo_no_se_carga(modelo, puntuado, tmp_path, monkeypatch):
    te, _ = puntuado
    OP.guardar(modelo, tmp_path, te, None)
    monkeypatch.setattr(MA, 'VERSION_CODIGO', 'otra')
    with pytest.raises(RuntimeError, match='hay que reentrenar'):
        OP.cargar(tmp_path)
    with pytest.raises(FileNotFoundError, match='-m anomalias entrenar'):
        OP.cargar(tmp_path / 'vacia')


def test_deriva_avisa_si_una_capa_alerta_mucho_mas(puntuado):
    _, res = puntuado
    ficha = {'validacion': {'alertas_por_1000_prueba': {c: v / 5 for c, v in OP.tasas_alerta(res).items()}}}
    assert OP.deriva(res, ficha).revisar.all()


def test_cola_una_fila_por_dato_ordenada_por_capas_y_fuerza(modelo, puntuado):
    te, res = puntuado
    d = res.datos
    cola = OP.cola_revision(res, te.esquema, modelo.cfg)
    assert len(cola) == int((d.alerta1 | d.alerta2 | d.alerta3).sum())
    assert cola.prioridad.tolist() == list(range(1, len(cola) + 1))
    assert cola.n_capas.is_monotonic_decreasing
    for _, g in cola.groupby('n_capas'):
        assert g.fuerza.is_monotonic_decreasing
    assert (cola.fuerza >= 1 - 1e-6).all()  # every alert is at or past its own threshold
    dos = cola[cola.n_capas >= 2].iloc[0]
    assert ';' in dos.motivos and ',' in dos.capas
    con_minimo = OP.cola_revision(res, te.esquema.assign(rango_min=0.0), modelo.cfg)
    assert (cola.rango_bajo < 0).any() and (con_minimo.rango_bajo >= 0).all()   # nothing expected below zero
    desde = d.t.quantile(0.8)
    reciente = OP.cola_revision(res, te.esquema, modelo.cfg, desde)
    assert 0 < len(reciente) < len(cola) and (pd.to_datetime(reciente.fecha) >= desde.normalize()).all()


def test_evaluacion_compara_con_el_rango_del_diccionario(modelo, particion):
    _, _, te, _ = particion
    ev = MA.evaluar(modelo, te, rondas=1)
    recall, falsas = ev.recall, ev.falsas
    assert MA.BASE_COMPARACION in recall and MA.BASE_COMPARACION in falsas
    # a plausible value shifted 3 DE rarely leaves the declared range; the model's context sees it
    assert recall.loc['desvío de 3 DE', 'cualquiera'] > recall.loc['desvío de 3 DE', MA.BASE_COMPARACION]


def test_sevarti_en_parquet_ida_y_vuelta(sev, tmp_path):
    s = sev.subconjunto(sev.sujetos.sujeto[:200])
    leido = SV.leer(SV.guardar(s, tmp_path / 'sev'))
    assert leido.corte == s.corte and len(leido.mediciones) == len(s.mediciones)
    a, _ = MA.preparar(s)
    b, _ = MA.preparar(leido)
    np.testing.assert_allclose(a.x.to_numpy(), b.x.to_numpy(), equal_nan=True)
    (tmp_path / 'sev' / 'episodios.parquet').unlink()
    with pytest.raises(FileNotFoundError, match='episodios'):
        SV.leer(tmp_path / 'sev')


def test_linea_de_comandos_de_punta_a_punta(sev, proyecto, tmp_path, capsys):
    carpeta = SV.guardar(sev.subconjunto(sev.sujetos.sujeto[:2500]), tmp_path / 'sev')
    P = proyecto
    config = tmp_path / 'config.json'
    config.write_text(json.dumps({'rondas': CONFIG_RAPIDA.rondas}), encoding='utf-8')
    base = ['--sevarti', str(carpeta)]

    CLI.main([*base, 'entrenar', '--sin-validacion', '--config', str(config)])
    fichas = list(P.modelos_anomalias.glob('*/ficha.json'))
    assert len(fichas) == 1 and json.loads(fichas[0].read_text(encoding='utf-8'))['config']['rondas'] == 80

    CLI.main(['modelos'])
    assert json.loads(fichas[0].read_text(encoding='utf-8'))['version'] in capsys.readouterr().out

    CLI.main([*base, 'revisar', '--desde', '2023-01-01'])
    salida = capsys.readouterr().out
    assert 'datos para revisar' in salida and 'Alertas frente a la validación' in salida
    revision = next(P.revisiones.glob('*.xlsx'))
    libro = pd.read_excel(revision, sheet_name=None)
    assert list(libro) == ['Instrucciones', 'Datos', 'Grupos', 'No usados']
    assert {'Prioridad', 'Qué se midió', 'Valor anotado', 'Por qué se marcó'} <= set(libro['Datos'])
    grupos = libro['Grupos']
    if grupos['Qué cambió'].isna().all():
        assert list(grupos.iloc[:, 0]) == [LB.VACIA]    # an empty sheet says so
    else:
        assert grupos['Qué cambió'].str.endswith('.').all()
    estado = json.loads((P.interno_anomalias / 'estado.json').read_text(encoding='utf-8'))
    assert estado['ultimo_corte'] == str(sev.corte.date())
    CLI.main([*base, 'revisar'])       # the same cut again: the same delivery, not an empty one
    capsys.readouterr()
    assert len(pd.read_excel(revision, sheet_name='Datos')) == len(libro['Datos'])
    assert len(list(P.interno_anomalias.glob('puntajes_*.parquet'))) == 1    # the expert sample reuses them


def test_curva_mas_exigente_alerta_menos_y_encuentra_menos(modelo, particion):
    _, _, te, _ = particion
    curva = MA.evaluar(modelo, te, rondas=1).curva
    assert list(curva.index) == list(MA.ALPHAS)
    for c in curva:
        assert curva[c].is_monotonic_increasing
    fila = curva.loc[modelo.cfg.alpha]
    assert fila['total por 1.000 limpios'] >= fila['capa 2 por 1.000 limpios']


