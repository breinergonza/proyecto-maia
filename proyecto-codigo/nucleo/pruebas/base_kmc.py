"""A fake KMC base: the dictionary snapshot of ``consumo.diccionario`` and a small wide table that follows it.

Shared by the adapter and dictionary tests so both read the same simulated base."""
from pathlib import Path

import numpy as np
import pandas as pd

CARPETA = Path(__file__).resolve().parents[1]


def metadatos() -> pd.DataFrame:
    m = pd.read_csv(CARPETA / 'informes' / 'diccionario_snapshot.csv')
    m['module'] = m.variable.str.extract(r'^([a-z]+)_', expand=False).fillna('seguimiento (v###)')
    return m


def tabla_ancha(meta: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(1)
    n = 60
    columnas: dict[str, object] = {'paciente_id': [f'p{i}' for i in range(n)], 'iden_codigo': ['NO_USAR'] * n}
    nac = pd.Timestamp('2020-01-01') + pd.to_timedelta(rng.integers(0, 900, n), unit='D')
    for r in meta.itertuples():
        if r.kind == 'numeric':
            lo, hi = (r.range_min, r.range_max) if np.isfinite(r.range_min) and np.isfinite(r.range_max) else (0, 10)
            columnas[r.variable] = rng.uniform(lo, hi, n).round(1)
        elif r.kind == 'date':
            columnas[r.variable] = (nac + pd.to_timedelta(rng.integers(0, 400, n), unit='D')).strftime('%Y-%m-%d')
        else:
            columnas[r.variable] = rng.choice(['1', '2', '3'], n)
    # restricted fields a stale view could still carry: the export must never use them
    columnas['iden_fechaparto'] = ['NO_USAR'] * n
    columnas['iden_sede'] = ['NO_USAR'] * n
    columnas['anio_parto'] = nac.year
    columnas['ern_ballard'] = rng.integers(26, 40, n)
    columnas['eg_semanas'] = rng.integers(26, 40, n) + 0.5      # the Fundación's canonical gestational age
    columnas['v195'] = (nac + pd.to_timedelta(30, unit='D')).strftime('%Y-%m-%d')   # discharge
    columnas['v196'] = 30.0                                                            # age at discharge
    columnas['v195a'] = (nac + pd.to_timedelta(33, unit='D')).strftime('%Y-%m-%d')  # programme entry
    w = pd.DataFrame(columnas)
    w.loc[:5, 'v261'] = np.nan
    w.loc[:9, 'hd_diasurn'] = np.nan
    return w
