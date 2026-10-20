import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))  # the packages are imported from the project folder

import base_kmc as BK  # noqa: E402
import simulador_sevarti as SIM  # noqa: E402
from anomalias import modelo as MA  # noqa: E402
from archivos import carpetas as CA  # noqa: E402
from archivos.carpetas import Carpetas  # noqa: E402
from clinico import crecimiento as CR  # noqa: E402
from clinico import modelo as AC  # noqa: E402

CONFIG_RAPIDA = MA.Config(rondas=80)


@pytest.fixture
def proyecto(tmp_path, monkeypatch):
    """The project folder of the command line tools, in a temporary place."""
    carpetas = Carpetas(tmp_path)
    monkeypatch.setattr(CA, 'PROYECTO', carpetas)
    return carpetas


@pytest.fixture(scope='session')
def sev():
    return SIM.simular(3000, semilla=5)


@pytest.fixture(scope='session')
def meta():
    """The dictionary of the simulated KMC base (the snapshot of ``consumo.diccionario``)."""
    return BK.metadatos()


@pytest.fixture(scope='session')
def wide(meta):
    """The simulated KMC wide table that follows ``meta``."""
    return BK.tabla_ancha(meta)


@pytest.fixture(scope='session')
def particion(sev):
    return MA.dividir_por_tiempo(sev)


@pytest.fixture(scope='session')
def modelo(particion):
    tr, ca, _, _ = particion
    return MA.ModeloAnomalias(CONFIG_RAPIDA).ajustar(tr, ca)


@pytest.fixture(scope='session')
def sev_grande():
    """Layer 4 needs enough data per group and quarter: scored, not trained on."""
    return SIM.simular(10000, semilla=9)


@pytest.fixture(scope='module')
def puntuado(modelo, particion):
    _, _, te, _ = particion
    return te, modelo.puntuar(te)


# ------------------------------------------------------------ clinical fixtures

REGLA_SIMPLE = ('eg_semanas', 'peso_nacer')
CFG = AC.ConfigClinica(
    desenlaces=(
        AC.Desenlace('readm', 'readmisión antes de los 3 meses', '40 sem', 'mayor_que_cero', 'readm_3m',
                     comparar=REGLA_SIMPLE),
        AC.Desenlace('no_vuelve', 'no vuelve a los 3 meses', '40 sem', 'no_vuelve', comparar=REGLA_SIMPLE),
        AC.Desenlace('oxigeno', 'oxígeno a los 3 meses', '40 sem', 'en_codigos', 'oxigeno_3m', codigos=(1.0,),
                     comparar=REGLA_SIMPLE),
        AC.Desenlace('desarrollo', 'desarrollo bajo a los 6 meses', '3 m EC', 'percentil_bajo', 'desarrollo_6m',
                     comparar=REGLA_SIMPLE),
    ),
    sexo='sexo', codigos_sexo=(('M', 1), ('F', 2)),
    medidas=(CR.Medida('peso', 'peso', factor=0.001, restringido=True), CR.Medida('talla', 'talla'),
             CR.Medida('perimetro_cefalico', 'perimetro_cefalico')),
    etapas_crecimiento=('40 sem', '3 m EC', '6 m EC', '12 m EC'),
    rondas=150, min_casos=20,
)


def _con_desenlaces(sev):
    """Outcomes with a known cause on top of the simulated cohort: readmission depends on the
    household income and oxygen on the days in ICU (both known at 40 weeks, neither in the
    obvious rule), development on gestational age."""
    rng = np.random.default_rng(4)
    datos, _ = MA.preparar(sev)
    eg = sev.sujetos.set_index('sujeto').eg_semanas
    uci = datos[datos.variable == 'dias_uci'].set_index('sujeto').x
    ingreso = np.log(datos[datos.variable == 'ingreso_hogar'].set_index('sujeto').x)
    visita = datos[datos.etapa == '3 m EC'].groupby('sujeto')[['t', 'edad_dias']].first()
    visita6 = datos[datos.etapa == '6 m EC'].groupby('sujeto')[['t', 'edad_dias']].first()
    s = visita.index
    pobreza = -((ingreso - ingreso.mean()) / ingreso.std()).reindex(s).fillna(0).to_numpy()
    readm = rng.random(len(s)) < 1 / (1 + np.exp(-(-2.2 + 1.4 * pobreza)))
    oxi = rng.random(len(s)) < 1 / (1 + np.exp(-(-3.5 + 0.15 * uci.reindex(s).fillna(0).to_numpy())))
    desarrollo = 100 + 3 * (eg.reindex(visita6.index).to_numpy() - 33) + rng.normal(0, 6, len(visita6))
    filas = [
        (dict(variable='readm_3m', tipo='numeric', rol='medicion', etapa='3 m EC'), s, readm.astype(float), visita),
        (dict(variable='oxigeno_3m', tipo='categorical', rol='medicion', etapa='3 m EC',
              categorias='1=displasia broncopulmonar;9=sin diagnóstico'), s,
         np.where(oxi, 1.0, 9.0), visita),
        (dict(variable='desarrollo_6m', tipo='numeric', rol='medicion', etapa='6 m EC'), visita6.index,
         np.round(desarrollo), visita6),
    ]
    for fila, quien, valores, v in filas:
        nuevos = pd.DataFrame({'sujeto': quien, 'variable': fila['variable'], 'valor': valores,
                               'fecha': v.t.reindex(quien).to_numpy(), 'edad_dias': v.edad_dias.reindex(quien).to_numpy()})
        sev = sev.con_variable(fila, nuevos)
    return sev


@pytest.fixture(scope='session')
def clinico():
    sev = _con_desenlaces(SIM.simular(6000, semilla=21))
    tr, _, te, _ = MA.dividir_por_tiempo(sev, (0.85, 0.0, 0.15))
    modelo = AC.ModeloClinico(CFG).ajustar(tr)
    return sev, tr, None, te, modelo
