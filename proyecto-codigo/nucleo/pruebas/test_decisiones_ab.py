"""Open decisions (a) visit windows from the base and (b) site and delivery date: both off by default.

Everything runs on the simulated KMC base (``base_kmc``); nothing connects to the real one."""
import numpy as np
import pandas as pd
import pytest

from anomalias import modelo as MA
from sevarti import contrato as SV
from sevarti import kmc as K

SEDES = ('norte', 'sur', 'centro')


@pytest.fixture(autouse=True)
def sin_entorno(monkeypatch):
    """The switches start off whatever the shell that runs the tests says."""
    monkeypatch.delenv(K.ENV_VENTANAS_REALES, raising=False)
    monkeypatch.delenv(K.ENV_USAR_SEDE_FECHA, raising=False)


@pytest.fixture
def borrador(meta):
    return K.borrador(meta)


@pytest.fixture
def ancha(wide):
    """The simulated wide table with a real site and delivery date (the base one carries placeholders)."""
    w = wide.copy()
    w['iden_sede'] = [SEDES[i % 3] for i in range(len(w))]
    nac = pd.to_datetime(w.anio_parto.astype(str) + '-01-01') + pd.to_timedelta(np.arange(len(w)) % 300, unit='D')
    w['iden_fechaparto'] = nac.dt.strftime('%Y-%m-%d')
    return w


def _iguales(a: SV.Sevarti, b: SV.Sevarti) -> None:
    for tabla in SV.COLUMNAS:
        pd.testing.assert_frame_equal(getattr(a, tabla), getattr(b, tabla), obj=tabla)
    assert a.corte == b.corte


# ---------------------------------------------------------------- off by default

def test_apagadas_por_defecto_nada_cambia(borrador, ancha):
    antes = K.to_sevarti(borrador, ancha)
    _iguales(antes, K.to_sevarti(borrador, ancha, ventanas_reales=False, usar_sede_fecha=False))
    assert (antes.sujetos.grupo == K.GRUPO_UNICO).all() and antes.sujetos.fecha_nacimiento.isna().all()
    assert 'ventana_fuente' not in antes.etapas
    pd.testing.assert_frame_equal(antes.etapas[['edad_min', 'edad_max']],
                                  borrador.visitas.sort_values('orden')[['edad_min', 'edad_max']].reset_index(drop=True),
                                  check_dtype=False)


@pytest.mark.parametrize('texto', ['', '0', 'no', 'false'])
def test_el_entorno_apagado_no_cambia_nada(borrador, ancha, monkeypatch, texto):
    monkeypatch.setenv(K.ENV_VENTANAS_REALES, texto)
    monkeypatch.setenv(K.ENV_USAR_SEDE_FECHA, texto)
    _iguales(K.to_sevarti(borrador, ancha), K.to_sevarti(borrador, ancha, ventanas_reales=False, usar_sede_fecha=False))


# ---------------------------------------------------------------- (a) windows from the base

def _esperada(ancha: pd.DataFrame, columna_edad: str) -> tuple[float, float]:
    """p1 to p99 of the corrected age, computed here independently (every subject has the recorded age)."""
    edad = pd.to_numeric(ancha[columna_edad], errors='coerce')
    ec = (edad.where(edad >= 0) - (40 - ancha.eg_semanas) * 7).dropna()
    return float(np.floor(ec.quantile(0.01))), float(np.ceil(ec.quantile(0.99)))


def test_ventanas_reales_son_p1_a_p99_de_la_edad_corregida(borrador, ancha, monkeypatch, capsys, tmp_path):
    monkeypatch.setattr(K, 'VENTANA_MIN_SUJETOS', 30)   # the simulated base has 60 subjects
    sev = K.to_sevarti(borrador, ancha, ventanas_reales=True)
    et = sev.etapas.set_index('etapa')
    for etapa, columna in (('3 m EC', 'v260'), ('12 m EC', 'v388')):
        assert (et.at[etapa, 'edad_min'], et.at[etapa, 'edad_max']) == _esperada(ancha, columna)
        assert et.at[etapa, 'ventana_fuente'].startswith('base p1-p99 (n=')
    # chronological stages keep the dictionary window, and the run says which windows it used
    nac = borrador.visitas.set_index('etapa').loc['nacimiento']
    assert (et.at['nacimiento', 'edad_min'], et.at['nacimiento', 'edad_max']) == (nac.edad_min, nac.edad_max)
    assert et.at['nacimiento', 'ventana_fuente'] == 'diccionario'
    assert '3 m EC' in capsys.readouterr().out
    # the windows used travel with the tables (traceable)
    leidas = SV.leer(SV.guardar(sev, tmp_path / 'tablas')).etapas
    pd.testing.assert_frame_equal(leidas, sev.etapas)


def test_ventanas_reales_desde_el_entorno(borrador, ancha, monkeypatch):
    monkeypatch.setattr(K, 'VENTANA_MIN_SUJETOS', 30)
    monkeypatch.setenv(K.ENV_VENTANAS_REALES, '1')
    assert K.to_sevarti(borrador, ancha).etapas.set_index('etapa').at['3 m EC', 'ventana_fuente'].startswith('base')
    # an explicit argument wins over the environment
    assert 'ventana_fuente' not in K.to_sevarti(borrador, ancha, ventanas_reales=False).etapas


def test_con_pocos_sujetos_queda_la_ventana_del_diccionario(borrador, ancha):
    sev = K.to_sevarti(borrador, ancha, ventanas_reales=True)   # 60 subjects < 200
    antes = K.to_sevarti(borrador, ancha)
    pd.testing.assert_frame_equal(sev.etapas.drop(columns='ventana_fuente'), antes.etapas, check_dtype=False)
    corregidas = sev.etapas[sev.etapas.base == 'corregida']
    assert corregidas.ventana_fuente.str.startswith('diccionario (solo').all()


def test_ventanas_de_la_base_usa_solo_las_visitas_con_datos():
    etapas = pd.DataFrame({'etapa': ['a', 'b', 'c'], 'orden': [1, 2, 3], 'edad_min': [0, 10, 20],
                           'edad_max': [5, 15, 25], 'base': ['corregida', 'corregida', 'cronologica']})
    eg = pd.Series(40.0, index=range(300))
    edades = {'a': pd.Series(np.linspace(100, 200, 300)), 'c': pd.Series(np.linspace(0, 1, 300))}
    out = K.ventanas_de_la_base(etapas, edades, eg).set_index('etapa')
    assert (out.at['a', 'edad_min'], out.at['a', 'edad_max']) == (101.0, 199.0)
    assert (out.at['b', 'edad_min'], out.at['b', 'edad_max'], out.at['b', 'ventana_fuente']) == (10, 15, 'diccionario')
    assert (out.at['c', 'edad_min'], out.at['c', 'edad_max']) == (20, 25)   # chronological: untouched


# ---------------------------------------------------------------- (b) site and delivery date

def test_sede_y_fecha_de_parto_cuando_la_base_las_trae(borrador, ancha, capsys):
    sev = K.to_sevarti(borrador, ancha, usar_sede_fecha=True)
    suj = sev.sujetos.set_index('sujeto')
    assert set(suj.grupo) == set(SEDES)
    esperado = pd.to_datetime(ancha.set_index('paciente_id').iden_fechaparto)
    pd.testing.assert_series_equal(pd.to_datetime(suj.fecha_nacimiento), esperado, check_names=False,
                                   check_dtype=False)
    assert (suj.anio_nacimiento == esperado.dt.year).all()
    assert 'Sede como grupo: sí' in capsys.readouterr().out
    # only sujetos change: the data rows are the same as before
    pd.testing.assert_frame_equal(sev.mediciones, K.to_sevarti(borrador, ancha).mediciones)


def test_sede_vacia_se_nombra(borrador, ancha):
    w = ancha.copy()
    w.loc[:4, 'iden_sede'] = None
    grupo = K.to_sevarti(borrador, w, usar_sede_fecha=True).sujetos.grupo
    assert (grupo.iloc[:5] == K.SIN_SEDE).all() and grupo.notna().all()


@pytest.mark.parametrize('quitar', [('iden_sede',), ('iden_fechaparto',), ('iden_sede', 'iden_fechaparto')])
def test_sin_las_columnas_sigue_como_hoy(borrador, ancha, quitar):
    sev = K.to_sevarti(borrador, ancha.drop(columns=list(quitar)), usar_sede_fecha=True)
    assert (sev.sujetos.grupo == K.GRUPO_UNICO).all() == ('iden_sede' in quitar)
    assert sev.sujetos.fecha_nacimiento.isna().all() == ('iden_fechaparto' in quitar)


def test_restringidas_no_se_usan_aunque_vengan(borrador, ancha):
    sev = K.to_sevarti(borrador, ancha, usar_sede_fecha=True, restringidas={'iden_sede', 'iden_fechaparto'})
    _iguales(sev, K.to_sevarti(borrador, ancha))


def test_fecha_ilegible_no_cuenta(borrador, wide):
    """The base table carries placeholders ('NO_USAR'): no date is invented from them."""
    w = wide.drop(columns='iden_sede')
    _iguales(K.to_sevarti(borrador, w, usar_sede_fecha=True), K.to_sevarti(borrador, w))


def test_nunca_se_usa_el_codigo_del_paciente(ancha):
    sede, _ = K.sede_y_fecha(ancha.drop(columns='iden_sede'), restringidas=set())
    assert sede is None   # without the site, the patient key is not a fallback
    assert 'NO_USAR' not in set(K.sede_y_fecha(ancha)[0])
    assert 'iden_codigo' in K.NUNCA


# ---------------------------------------------------------------- the loader and the models

@pytest.fixture
def base_falsa(monkeypatch, meta, ancha):
    """The KMC database replaced by the simulated base, with a declaration of restricted fields."""
    restringidas: set[str] = set()

    class Conexion:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(K, 'connect', Conexion)
    monkeypatch.setattr(K, 'load_metadata', lambda conn: meta)
    monkeypatch.setattr(K, 'load_restricted', lambda conn: set(restringidas))
    monkeypatch.setattr(K, 'load_wide', lambda conn: ancha)
    return restringidas


def test_cargar_sevarti_usa_sede_y_fecha_sin_restriccion(base_falsa, tmp_path, monkeypatch):
    monkeypatch.setenv(K.ENV_USAR_SEDE_FECHA, '1')
    sev = K.cargar_sevarti(tmp_path / 'diccionario.xlsx')
    assert set(sev.sujetos.grupo) == set(SEDES) and sev.sujetos.fecha_nacimiento.notna().all()


def test_cargar_sevarti_sin_activar_sigue_como_hoy(base_falsa, tmp_path):
    sev = K.cargar_sevarti(tmp_path / 'diccionario.xlsx')
    assert (sev.sujetos.grupo == K.GRUPO_UNICO).all() and sev.sujetos.fecha_nacimiento.isna().all()


def test_cargar_sevarti_respeta_la_restriccion(base_falsa, tmp_path, monkeypatch):
    base_falsa.update({'iden_sede', 'iden_fechaparto'})
    monkeypatch.setenv(K.ENV_USAR_SEDE_FECHA, '1')
    sev = K.cargar_sevarti(tmp_path / 'diccionario.xlsx')
    assert (sev.sujetos.grupo == K.GRUPO_UNICO).all() and sev.sujetos.fecha_nacimiento.isna().all()


def test_el_modelo_de_anomalias_lee_la_sede_y_la_fecha(borrador, ancha, monkeypatch):
    """With both on, layer 0 of the anomaly model reads one group per site and an exact birth date."""
    monkeypatch.setattr(K, 'VENTANA_MIN_SUJETOS', 30)
    sev = K.to_sevarti(borrador, ancha, usar_sede_fecha=True, ventanas_reales=True)
    datos, _ = MA.preparar(sev)
    assert set(datos.grupo) == set(SEDES)
    assert datos.nacimiento.notna().all()
