"""Datos simulados para la demostración y las pruebas de la plataforma. Ningún dato viene de pacientes reales.

Es una copia del simulador del núcleo (nucleo/pruebas/simulador_sevarti.py), con los problemas que tiene la
base real a propósito (códigos especiales, errores de unidad, redondeo desde el cambio de 2022...), más:

* etiquetas legibles para cada variable, para que el tablero no muestre códigos;
* tres desenlaces con causa conocida (readmisión, oxígeno y desarrollo), como en nucleo/pruebas/conftest.py, más el
  desarrollo a los 12 meses;
* CONFIG_CLINICA_DEMO: la configuración clínica de esos desenlaces, que en la base real sale del diccionario;
* EN_PRUEBA_DEMO: la talla baja a los 12 meses calculada desde visitas anteriores, «En prueba» como en el
  Diccionario: solo se entrena con la anticipación (``MAIA_ANTICIPACION=1``).

simular(n, semilla) es lo único que usan el trainer (maia simular) y la API (semillas de la demo).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from anomalias import modelo as MA
from clinico import crecimiento as CR
from clinico import modelo as AC
from sevarti.contrato import Sevarti

ETAPAS = pd.DataFrame([
    ('prenatal', 0, np.nan, np.nan, 'cronologica'),
    ('nacimiento', 1, 0, 3, 'cronologica'),
    ('hospitalización', 2, 0, 200, 'cronologica'),
    ('40 sem', 3, -21, 35, 'corregida'),
    ('3 m EC', 4, 45, 135, 'corregida'),
    ('6 m EC', 5, 135, 225, 'corregida'),
    ('12 m EC', 6, 315, 450, 'corregida'),
], columns=['etapa', 'orden', 'edad_min', 'edad_max', 'base'])

# stage, mean corrected age at the visit (days), probability of attending
VISITAS = (('40 sem', 0, 0.9), ('3 m EC', 91, 0.75), ('6 m EC', 182, 0.65), ('12 m EC', 365, 0.55))


def _esquema() -> pd.DataFrame:
    filas = [
        dict(variable='sexo', tipo='categorical', rol='basal', etapa='nacimiento', tema='nacimiento'),
        dict(variable='otras_enfermedades', tipo='categorical', rol='basal', etapa='nacimiento', tema='nacimiento'),
        dict(variable='peso_nacer', tipo='numeric', unidad='g', rol='basal', etapa='nacimiento', concepto='peso',
             tema='antropometría'),
        dict(variable='talla_nacer', tipo='numeric', unidad='cm', rol='basal', etapa='nacimiento',
             tema='antropometría'),
        dict(variable='edad_madre', tipo='numeric', unidad='años', rol='basal', etapa='prenatal', tema='prenatal'),
        dict(variable='controles_prenatales', tipo='numeric', rol='basal', etapa='prenatal', tema='prenatal'),
        dict(variable='ingreso_hogar', tipo='numeric', unidad='COP', rol='contexto', tema='socioeconómico'),
        dict(variable='personas_hogar', tipo='numeric', rol='contexto', tema='socioeconómico'),
        dict(variable='hematocrito', tipo='numeric', unidad='%', rol='medicion', etapa='hospitalización',
             tema='laboratorio'),
        dict(variable='dias_uci', tipo='numeric', unidad='días', rol='medicion', etapa='hospitalización',
             tema='hospitalización'),
        dict(variable='peso_salida', tipo='numeric', unidad='g', rol='medicion', etapa='hospitalización',
             concepto='peso', ventana=False, tema='antropometría'),
    ]
    for etapa, sufijo in (('40 sem', '40'), ('3 m EC', '3m'), ('6 m EC', '6m'), ('12 m EC', '12m')):
        filas += [
            dict(variable=f'peso_{sufijo}', tipo='numeric', unidad='g', rol='medicion', etapa=etapa,
                 concepto='peso', tema='antropometría'),
            dict(variable=f'talla_{sufijo}', tipo='numeric', unidad='cm', rol='medicion', etapa=etapa,
                 concepto='talla', no_decreciente=True, tolerancia=1.0, tema='antropometría'),
            dict(variable=f'pc_{sufijo}', tipo='numeric', unidad='cm', rol='medicion', etapa=etapa,
                 concepto='perimetro_cefalico', no_decreciente=True, tolerancia=1.0, tema='antropometría'),
        ]
    return pd.DataFrame(filas)


def peso_esperado(ec: np.ndarray) -> np.ndarray:
    return 3100 * (1 + 0.95 * (1 - np.exp(-ec / 110)) + 0.0025 * ec)


def _simular_base(n: int, semilla: int, corte: str) -> Sevarti:
    rng = np.random.default_rng(semilla)
    sujeto = np.array([f's{i:05d}' for i in range(n)])
    grupo = rng.choice([1, 2, 3], size=n, p=[0.45, 0.2, 0.35])
    # births in the 14 years before the extraction date, as in the real base: the youngest children are still
    # waiting for their next visit, so the run has risks calculated at 40 weeks
    nac = pd.Timestamp(corte) - pd.Timedelta(days=365 * 14) + pd.to_timedelta(rng.integers(0, 365 * 14, n), unit='D')
    eg = np.clip(np.round(rng.normal(33, 3, n)), 24, 40)
    sexo = rng.choice(['M', 'F'], n)
    ingreso = np.exp(rng.normal(np.log(1.2e6) + np.select([grupo == 2], [0.5], 0), 0.5))
    personas = rng.poisson(3, n) + 1
    factor = rng.normal(1, 0.08, n) * (1 + 0.03 * (np.log(ingreso) - np.log(1.2e6)))
    factor *= np.where(sexo == 'M', 1.03, 0.97)
    filas: list[tuple] = []

    def agregar(var: str, valores: np.ndarray, quien: np.ndarray, fecha=None, edad=None) -> None:
        f = fecha if fecha is not None else [pd.NaT] * len(quien)
        e = edad if edad is not None else [np.nan] * len(quien)
        filas.extend(zip(sujeto[quien], [var] * len(quien), valores, f, e))

    todos = np.arange(n)
    agregar('sexo', sexo, todos, nac, np.zeros(n))
    texto = np.array([f'texto libre {i}' for i in rng.integers(0, 5000, n)])
    agregar('otras_enfermedades', texto, todos, nac, np.zeros(n))
    peso_nacer = np.round((1000 + 160 * (eg - 26)) * rng.normal(1, 0.1, n))
    agregar('peso_nacer', peso_nacer, todos, nac, np.zeros(n))
    agregar('talla_nacer', np.round(35 + 0.9 * (eg - 26) + 1.5 + rng.normal(0, 1.5, n), 1), todos, nac, np.zeros(n))
    agregar('edad_madre', np.round(rng.normal(26, 6, n)).clip(14, 48), todos, nac)
    agregar('controles_prenatales', rng.poisson(5, n), todos, nac)
    agregar('ingreso_hogar', np.round(ingreso, -3), todos, nac)
    agregar('personas_hogar', personas, todos, nac)

    estancia = np.maximum(3, np.round((37 - eg) * 7 * rng.uniform(0.6, 1.4, n)))
    estancia = np.minimum(estancia, np.maximum(3, (40 - eg) * 7 - 10))  # discharged before 40 weeks
    salida = nac + pd.to_timedelta(estancia, unit='D')
    hecho = rng.random(n) < 0.35  # the lab value is mostly not done, recorded as -1
    agregar('hematocrito', np.where(hecho, np.round(rng.normal(45, 6, n), 1), -1.0), todos, salida, estancia)
    agregar('dias_uci', rng.poisson(np.maximum(0, 33 - eg) * 3), todos, salida, estancia)
    peso_salida = np.round(peso_nacer * (1 + 0.012 * np.maximum(estancia - 10, 0)) * rng.normal(1, 0.03, n))
    agregar('peso_salida', peso_salida, todos, salida, estancia)

    for etapa, ec_media, asiste in VISITAS:
        va = np.flatnonzero(rng.random(n) < asiste)
        ec = rng.normal(ec_media, 12 if ec_media else 7, len(va))
        ec[rng.random(len(va)) < 0.01] += rng.choice([-120, 150])  # a few visits far from their window
        edad = np.maximum(1, np.round(ec + (40 - eg[va]) * 7))
        fecha = nac[va] + pd.to_timedelta(edad, unit='D')
        antes = fecha <= pd.Timestamp(corte)  # no visit after the extraction date
        va, edad, fecha = va[antes], edad[antes], fecha[antes]
        ec = edad - (40 - eg[va]) * 7
        sufijo = {'40 sem': '40', '3 m EC': '3m', '6 m EC': '6m', '12 m EC': '12m'}[etapa]
        f = factor[va]
        peso = np.round(peso_esperado(ec) * f * rng.normal(1, 0.015, len(va)))
        talla = np.round((50 + 25 * (1 - np.exp(-ec / 200))) * (1 + 0.4 * (f - 1)) + rng.normal(0, 0.6, len(va)), 1)
        pc = np.round((35 + 11 * (1 - np.exp(-ec / 150))) * (1 + 0.3 * (f - 1)) + rng.normal(0, 0.4, len(va)), 1)
        nuevo = nac[va] >= pd.Timestamp('2022-01-01')
        redondea = nuevo & (rng.random(len(va)) < 0.3)  # the 2022 system rounds part of the weights
        peso = np.where(redondea, np.round(peso, -2), peso)
        for var, val, p in ((f'peso_{sufijo}', peso, 0.95), (f'talla_{sufijo}', talla, 0.9), (f'pc_{sufijo}', pc, 0.85)):
            k = rng.random(len(va)) < p
            agregar(var, val[k], va[k], fecha[k], edad[k])

    med = pd.DataFrame(filas, columns=['sujeto', 'variable', 'valor', 'fecha', 'edad_dias'])
    med['valor'] = med.valor.astype(object)
    pesos = med.index[med.variable.str.startswith('peso_')]
    sucios = rng.choice(pesos, size=int(0.006 * len(pesos)), replace=False)
    tercio = len(sucios) // 3
    med.loc[sucios[:tercio], 'valor'] = med.loc[sucios[:tercio], 'valor'].astype(float) / 1000  # grams typed as kg
    med.loc[sucios[tercio:2 * tercio], 'valor'] = 9999.0
    med.loc[sucios[2 * tercio:], 'valor'] = med.loc[sucios[2 * tercio:], 'valor'].astype(float) * 1.6

    episodios = pd.DataFrame({
        'sujeto': np.concatenate([sujeto, sujeto]),
        'tipo': ['hospitalización'] * n + ['posición canguro'] * n,
        'edad_inicio': np.concatenate([np.zeros(n), np.full(n, np.nan)]),  # days of life; kangaroo start unknown
        'edad_fin': np.concatenate([estancia, np.round((40 - eg) * 7 + rng.normal(10, 10, n))]),
    })
    sujetos = pd.DataFrame({'sujeto': sujeto, 'grupo': grupo, 'fecha_nacimiento': nac, 'eg_semanas': eg})
    quiebres = pd.DataFrame({'quiebre': ['cambio de sistema 2022'], 'fecha': [pd.Timestamp('2022-01-01')]})
    return Sevarti(esquema=_esquema(), etapas=ETAPAS, sujetos=sujetos, mediciones=med, episodios=episodios,
                   quiebres=quiebres, corte=pd.Timestamp(corte))


# ------------------------------------------------------------------ lo que agrega la plataforma

ETIQUETAS = {
    'sexo': 'Sexo', 'otras_enfermedades': 'Otras enfermedades (texto)', 'peso_nacer': 'Peso al nacer',
    'talla_nacer': 'Talla al nacer', 'edad_madre': 'Edad de la madre', 'controles_prenatales': 'Controles prenatales',
    'ingreso_hogar': 'Ingreso del hogar', 'personas_hogar': 'Personas en el hogar', 'hematocrito': 'Hematocrito',
    'dias_uci': 'Días en UCI', 'peso_salida': 'Peso a la salida del hospital',
    'readm_3m': 'Readmisiones 40 sem - 3 meses', 'oxigeno_3m': 'Oxígeno a los 3 meses',
    'desarrollo_6m': 'Puntaje de desarrollo a los 6 meses', 'desarrollo_12m': 'Puntaje de desarrollo a los 12 meses',
}
for _etapa, _suf in (('40 sem', '40'), ('3 m EC', '3m'), ('6 m EC', '6m'), ('12 m EC', '12m')):
    ETIQUETAS |= {f'peso_{_suf}': f'Peso a {_etapa}', f'talla_{_suf}': f'Talla a {_etapa}',
                  f'pc_{_suf}': f'Perímetro cefálico a {_etapa}'}
NOMBRES_ETAPA = {'prenatal': 'Prenatal', 'nacimiento': 'Nacimiento', 'hospitalización': 'Hospitalización',
                 '40 sem': '40 semanas', '3 m EC': '3 meses (edad corregida)', '6 m EC': '6 meses (edad corregida)',
                 '12 m EC': '12 meses (edad corregida)'}

REGLA_SIMPLE = ('eg_semanas', 'peso_nacer')
CONFIG_CLINICA_DEMO = AC.ConfigClinica(
    desenlaces=(
        AC.Desenlace('readm_3m', 'readmisión entre las 40 semanas y los 3 meses', '40 sem', 'mayor_que_cero',
                     'readm_3m', comparar=REGLA_SIMPLE),
        AC.Desenlace('no_vuelve_3m', 'no vuelve a la visita de 3 meses', '40 sem', 'no_vuelve', comparar=REGLA_SIMPLE),
        AC.Desenlace('oxigeno_3m', 'oxigenodependencia a los 3 meses', '40 sem', 'en_codigos', 'oxigeno_3m',
                     codigos=(1.0,), negativos=(9.0,), comparar=REGLA_SIMPLE),
        AC.Desenlace('desarrollo_6m', 'desarrollo psicomotor bajo a los 6 meses', '3 m EC', 'percentil_bajo',
                     'desarrollo_6m', comparar=REGLA_SIMPLE),
        AC.Desenlace('desarrollo_12m', 'desarrollo psicomotor bajo a los 12 meses', '6 m EC', 'percentil_bajo',
                     'desarrollo_12m', comparar=REGLA_SIMPLE),
    ),
    sexo='sexo', codigos_sexo=(('M', 1), ('F', 2)),
    medidas=(CR.Medida('peso', 'peso', factor=0.001, restringido=True), CR.Medida('talla', 'talla'),
             CR.Medida('perimetro_cefalico', 'perimetro_cefalico')),
    etapas_crecimiento=('40 sem', '3 m EC', '6 m EC', '12 m EC'),
    rondas=300, min_casos=20,
)

# The Fundación's growth question (talla baja a los 12 meses, z < -2 OMS), predicted from earlier visits. As in the
# Diccionario it has only «_desde_» rows and is «En prueba», so it is trained only with anticipation.
EN_PRUEBA_DEMO = tuple(
    AC.Desenlace(f'talla_baja_12m_desde_{momento.split()[0]}',
                 f'talla baja para la edad a los 12 meses (riesgo calculado a {momento})', momento, 'z_bajo',
                 concepto='talla', etapa='12 m EC', comparar=REGLA_SIMPLE)
    for momento in ('40 sem', '3 m EC', '6 m EC'))


def _con_desenlaces(sev: Sevarti, semilla: int) -> Sevarti:
    """Desenlaces con causa conocida: la readmisión depende del ingreso del hogar, el oxígeno de los días en UCI
    (los dos se saben a las 40 semanas y ninguno está en la regla simple) y el desarrollo de la edad gestacional."""
    rng = np.random.default_rng(semilla + 1000)
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
    # its own generator, so the earlier outcomes keep the values they always had
    rng12 = np.random.default_rng(semilla + 2000)
    visita12 = datos[datos.etapa == '12 m EC'].groupby('sujeto')[['t', 'edad_dias']].first()
    desarrollo12 = 100 + 3 * (eg.reindex(visita12.index).to_numpy() - 33) + rng12.normal(0, 6, len(visita12))
    filas = [
        (dict(variable='readm_3m', tipo='numeric', rol='medicion', etapa='3 m EC'), s, readm.astype(float), visita),
        (dict(variable='oxigeno_3m', tipo='categorical', rol='medicion', etapa='3 m EC',
              categorias='1=displasia broncopulmonar;9=sin diagnóstico'), s, np.where(oxi, 1.0, 9.0), visita),
        (dict(variable='desarrollo_6m', tipo='numeric', rol='medicion', etapa='6 m EC'), visita6.index,
         np.round(desarrollo), visita6),
        (dict(variable='desarrollo_12m', tipo='numeric', rol='medicion', etapa='12 m EC'), visita12.index,
         np.round(desarrollo12), visita12),
    ]
    for fila, quien, valores, v in filas:
        nuevos = pd.DataFrame({'sujeto': quien, 'variable': fila['variable'], 'valor': valores,
                               'fecha': v.t.reindex(quien).to_numpy(), 'edad_dias': v.edad_dias.reindex(quien).to_numpy()})
        sev = sev.con_variable(fila, nuevos)
    return sev


def simular(n: int = 5000, semilla: int = 3, corte: str = '2026-06-30') -> Sevarti:
    """Una cohorte simulada completa, con etiquetas, nombres de visita y desenlaces."""
    sev = _con_desenlaces(_simular_base(n, semilla, corte), semilla)
    esquema = sev.esquema.assign(etiqueta=sev.esquema.variable.map(ETIQUETAS).fillna(sev.esquema.variable))
    etapas = sev.etapas.assign(nombre=sev.etapas.etapa.map(NOMBRES_ETAPA))
    mediciones = sev.mediciones.assign(valor=sev.mediciones.valor.astype(object))
    return Sevarti(esquema=esquema, etapas=etapas, sujetos=sev.sujetos, mediciones=mediciones,
                   episodios=sev.episodios, quiebres=sev.quiebres, corte=sev.corte)
