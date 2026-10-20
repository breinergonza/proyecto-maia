"""Simulated SEVARTI data shaped like a kangaroo-care follow-up, for tests and dry runs.

It has the problems we found in the real data, on purpose: a placeholder code used in
most rows of a lab value, unit errors, digit typos, rounding that starts with a system
change, birth length measured with another instrument, dates outside their stage window
and groups that serve different populations. Nothing here comes from real patients.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

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


def simular(n: int = 4000, semilla: int = 3, corte: str = '2026-06-30') -> Sevarti:
    rng = np.random.default_rng(semilla)
    sujeto = np.array([f's{i:05d}' for i in range(n)])
    grupo = rng.choice([1, 2, 3], size=n, p=[0.45, 0.2, 0.35])
    nac = pd.Timestamp('2012-01-01') + pd.to_timedelta(rng.integers(0, 365 * 14, n), unit='D')
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
