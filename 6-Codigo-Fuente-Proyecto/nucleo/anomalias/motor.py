"""Generic, metadata-driven data-quality and anomaly profiling engine.

Nothing in this module knows about a particular institution. Every check is
driven by two inputs:

* a metadata table with one row per variable (name, label, kind, unit and
  declared range), so a variable added tomorrow is profiled without code changes;
* a ``DatasetSpec`` that names the roles a few columns play (entity, group,
  anchor date, covariates) and the repeated-measure families.

The engine reports three layers of anomalies, matching the observatory design:
measurement (a single value), entity (a trajectory) and group (a site and period).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

Kind = Literal['numeric', 'categorical', 'boolean', 'date', 'text']
METADATA_COLUMNS = ('variable', 'label', 'kind', 'unit', 'range_min', 'range_max')
SENTINEL_CANDIDATES = (-999.0, -99.0, -9.0, -1.0, 9.0, 99.0, 999.0, 9999.0, 99999.0)
SENTINEL_DATES = (pd.Timestamp('1900-01-01'), pd.Timestamp('1970-01-01'))
MAX_PANDAS_YEAR = 2262  # pandas datetime64[ns] upper bound


# --------------------------------------------------------------------------- spec

@dataclass(frozen=True)
class Stage:
    """One occasion of a repeated measure (e.g. the 3-month visit)."""
    key: str
    value: str
    date: str | None = None
    age: str | None = None              # recorded age at the occasion, in days
    nominal_age_days: float | None = None  # expected age, used for eligibility


@dataclass(frozen=True)
class Family:
    """A concept measured repeatedly over ordered stages (e.g. weight)."""
    concept: str
    unit: str
    stages: tuple[Stage, ...]
    non_decreasing: bool = False        # cumulative growth measures
    decrease_tolerance: float = 0.0     # allowed measurement noise, in `unit`


@dataclass(frozen=True)
class DatasetSpec:
    entity: str
    group: str | None = None
    anchor_date: str | None = None
    covariates: tuple[str, ...] = ()
    families: tuple[Family, ...] = ()
    cutoff: pd.Timestamp | None = None   # extraction date, for eligibility and future dates
    pre_anchor_dates: tuple[str, ...] = ()  # date variables expected before the anchor
    plausible_dates: tuple[str, str] = ('1990-01-01', '2100-01-01')
    min_cell: int = 30                  # minimum cell size for conditional references

    def family(self, concept: str) -> Family:
        return next(f for f in self.families if f.concept == concept)


# ---------------------------------------------------------------------- helpers

def robust_z(x: pd.Series) -> pd.Series:
    """Median/MAD z-score; NaN when the spread is degenerate."""
    med = x.median()
    mad = (x - med).abs().median() * 1.4826
    return (x - med) / mad if mad and np.isfinite(mad) else pd.Series(np.nan, index=x.index)


def parse_dates(raw: pd.Series) -> pd.DataFrame:
    """Parse mixed-format date strings, keeping why a value could not be used.

    Returns columns ``date`` (Timestamp or NaT), ``format`` and ``year``.
    Years beyond the pandas range are kept as integers so impossible dates stay
    countable instead of silently disappearing.
    """
    s = raw.dropna().astype(str).str.strip()
    parts = s.str.extract(r'^(\d{4})-(\d{2})-(\d{2})(T.*)?$')
    fmt = np.select(
        [parts[0].isna(), parts[3].notna()],
        ['no reconocido', 'fecha y hora ISO (UTC)'],
        default='AAAA-MM-DD')
    year = pd.to_numeric(parts[0], errors='coerce')
    ok = parts[0].notna() & year.between(1678, MAX_PANDAS_YEAR - 1)
    iso = parts[0].str.cat([parts[1], parts[2]], sep='-')
    date = pd.to_datetime(iso.where(ok), errors='coerce', format='%Y-%m-%d')
    out = pd.DataFrame({'date': date, 'format': fmt, 'year': year}, index=s.index)
    return out.reindex(raw.index)


def resolution(values: np.ndarray) -> float:
    """Recording resolution: the largest power of ten that (almost) all values are multiples of."""
    v = np.abs(values[np.isfinite(values)])
    if v.size == 0:
        return 1.0
    q = 1e-3
    while q < 1e4 and np.mean(np.isclose(np.mod(np.round(v / q), 10), 0)) > 0.95:
        q *= 10
    return q


def terminal_digits(values: np.ndarray) -> tuple[float, np.ndarray]:
    """Last informative digit of each value at its recording resolution."""
    q = resolution(values)
    v = np.abs(values[np.isfinite(values)])
    return q, np.mod(np.round(v / q), 10).astype(int)


def heaping_index(values: np.ndarray) -> dict[str, float]:
    """Digit preference: share of terminal 0 (expected 10%) and of 0 or 5 (expected 20%)."""
    q, d = terminal_digits(values)
    if d.size < 50:
        return dict(resolucion=q, pct_terminal_0=np.nan, pct_terminal_0_5=np.nan, indice_preferencia=np.nan,
                    pct_multiplo_100q=np.nan)
    p0 = float(np.mean(d == 0))
    p05 = float(np.mean(np.isin(d, (0, 5))))
    v = np.abs(values[np.isfinite(values)])
    p100 = float(np.mean(np.isclose(np.mod(np.round(v / q), 100), 0)))
    return dict(resolucion=q, pct_terminal_0=100 * p0, pct_terminal_0_5=100 * p05, indice_preferencia=p0 / 0.10,
                pct_multiplo_100q=100 * p100)


# -------------------------------------------------------------- metadata layer

def audit_metadata(meta: pd.DataFrame, data: pd.DataFrame, entity: str) -> pd.DataFrame:
    """Contract checks between the dictionary and the data it describes."""
    issues: list[dict[str, object]] = []

    def add(variable: str, check: str, detail: str) -> None:
        issues.append(dict(variable=variable, chequeo=check, detalle=detail))

    in_data = set(data.columns) - {entity}
    for v in sorted(set(meta.variable) - in_data):
        add(v, 'En el diccionario pero no en los datos', 'la variable no se puede analizar')
    for v in sorted(in_data - set(meta.variable)):
        add(v, 'En los datos pero no en el diccionario', 'sin tipo, unidad ni rango declarados')
    dup = meta[meta.label.duplicated(keep=False) & meta.label.notna()]
    for label, grp in dup.groupby('label'):
        add(', '.join(grp.variable), 'Etiqueta duplicada', f'"{label}" describe variables distintas')
    numeric = meta[meta.kind == 'numeric']
    for r in numeric[numeric.range_min.isna() | numeric.range_max.isna()].itertuples():
        add(r.variable, 'Numérica sin rango declarado', 'no se puede validar el valor contra el diccionario')
    for r in numeric[numeric.range_min >= numeric.range_max].itertuples():
        add(r.variable, 'Rango inválido', f'mínimo {r.range_min} >= máximo {r.range_max}')
    for r in numeric[numeric.unit.isna()].itertuples():
        add(r.variable, 'Numérica sin unidad', 'no se puede detectar un error de unidad con certeza')
    for r in numeric[numeric.variable.isin(in_data) & numeric.range_min.notna() & numeric.range_max.notna()].itertuples():
        x = pd.to_numeric(data[r.variable], errors='coerce').dropna()
        if len(x) < 50:
            continue
        if np.isclose(x.min(), r.range_min) and np.isclose(x.max(), r.range_max):
            add(r.variable, 'Rango igual al mínimo y máximo observados',
                f'[{r.range_min:g}, {r.range_max:g}]: el rango parece calculado de los datos, no definido clínicamente')
        mode = x.mode().iloc[0]
        share = float((x == mode).mean())
        if share >= 0.2 and not (r.range_min <= mode <= r.range_max):
            add(r.variable, 'Rango excluye el valor más frecuente',
                f'{mode:g} ({100 * share:.0f}% de los registros) queda fuera de [{r.range_min:g}, {r.range_max:g}]')
    for r in meta[meta.variable.isin(in_data)].itertuples():
        col = data[r.variable]
        if r.kind in ('numeric', 'boolean') and not pd.api.types.is_numeric_dtype(col):
            add(r.variable, 'Tipo declarado distinto al almacenado', f'{r.kind} guardada como texto')
        if r.kind == 'date' and pd.api.types.is_numeric_dtype(col) and col.notna().any():
            add(r.variable, 'Tipo declarado distinto al almacenado', 'date guardada como número')
    return pd.DataFrame(issues, columns=['variable', 'chequeo', 'detalle'])


def diff_metadata(meta: pd.DataFrame, snapshot: pd.DataFrame | None) -> pd.DataFrame:
    """Variables added, removed or redefined since a previous metadata snapshot."""
    cols = list(METADATA_COLUMNS)
    if snapshot is None:
        return pd.DataFrame(columns=['variable', 'cambio'])
    a, b = snapshot[cols].set_index('variable'), meta[cols].set_index('variable')
    changes = [(v, 'nueva') for v in b.index.difference(a.index)]
    changes += [(v, 'eliminada') for v in a.index.difference(b.index)]
    common = a.index.intersection(b.index)
    def normalized(df: pd.DataFrame) -> pd.DataFrame:
        # A CSV round trip turns None into NaN and 5 into 5.0: compare values, not their spelling.
        out = df.loc[common].copy()
        for c in ('range_min', 'range_max'):
            out[c] = pd.to_numeric(out[c], errors='coerce')
        return out
    old, new = normalized(a), normalized(b)
    redefined = ((old != new) & ~(old.isna() & new.isna())).any(axis=1)
    changes += [(v, 'redefinida') for v in common[redefined.to_numpy()]]
    return pd.DataFrame(changes, columns=['variable', 'cambio'])


# ----------------------------------------------------------- measurement layer

def sentinel_values(x: pd.Series, rmin: float, rmax: float) -> dict[float, int]:
    """Placeholder codes (999, -1, ...) that appear as a frequency spike outside the plausible range."""
    counts = x.value_counts()
    lo, hi = (rmin, rmax) if np.isfinite(rmin) and np.isfinite(rmax) else x.quantile([0.005, 0.995])
    found: dict[float, int] = {}
    for v in SENTINEL_CANDIDATES:
        n = int(counts.get(v, 0))
        if n >= max(5, 0.0005 * len(x)) and not (lo <= v <= hi):
            found[v] = n
    return found


def unit_error_candidates(x: pd.Series, rmin: float, rmax: float) -> int:
    """Out-of-range values that land in range after a power-of-ten rescale (g vs kg, mm vs cm)."""
    if not (np.isfinite(rmin) and np.isfinite(rmax)) or rmin < 0:
        return 0
    med = x.median()
    if not med > 0:  # a power-of-ten rescale needs a positive scale
        return 0
    out = x[((x < rmin) | (x > rmax)) & ((x >= 5 * med) | (x <= med / 5))]
    out = out[out > 0]
    if out.empty:
        return 0
    rescaled = np.outer(out.to_numpy(), [1e-3, 1e-2, 1e-1, 10, 100, 1000])
    return int(((rescaled >= rmin) & (rescaled <= rmax)).any(axis=1).sum())


def profile_numeric(x: pd.Series, rmin: float, rmax: float, has_unit: bool = True) -> dict[str, object]:
    x = x.dropna().astype(float)
    if x.empty:
        return {}
    sentinels = sentinel_values(x, rmin, rmax)
    clean = x[~x.isin(list(sentinels))]
    declared = np.isfinite(rmin) and np.isfinite(rmax)
    out_of_range = int(((clean < rmin) | (clean > rmax)).sum()) if declared else 0
    base = clean[(clean >= rmin) & (clean <= rmax)] if declared else clean
    scale = np.log(base[base > 0]) if (base > 0).all() and base.skew() > 1 else base
    z = robust_z(scale)
    return dict(
        minimo=x.min(), p01=x.quantile(0.01), mediana=x.median(), p99=x.quantile(0.99), maximo=x.max(),
        n_centinela=sum(sentinels.values()), centinelas=', '.join(f'{v:g}' for v in sentinels) or None,
        n_fuera_rango=out_of_range, n_error_unidad=unit_error_candidates(clean, rmin, rmax) if has_unit else 0,
        n_atipico_robusto=int((z.abs() > 5).sum()),
        **heaping_index(clean.to_numpy()),
    )


def profile_categorical(x: pd.Series) -> dict[str, object]:
    x = x.dropna()
    if x.empty:
        return {}
    shares = x.value_counts(normalize=True)
    return dict(n_categorias=int(shares.size), pct_moda=100 * float(shares.iloc[0]),
                n_categorias_raras=int((shares < 0.001).sum()))


def profile_dates(raw: pd.Series, anchor: pd.Series | None, spec: DatasetSpec) -> dict[str, object]:
    p = parse_dates(raw).dropna(subset=['format'])
    if p.empty:
        return {}
    lo, hi = (pd.Timestamp(d) for d in spec.plausible_dates)
    sentinel = p.date.isin(SENTINEL_DATES)
    impossible = (p.year.notna() & ~p.year.between(lo.year, hi.year)) | sentinel
    future = (p.date > spec.cutoff) & ~impossible if spec.cutoff is not None else pd.Series(False, index=p.index)
    before_anchor = 0
    if anchor is not None:
        a = anchor.reindex(p.index)
        before_anchor = int(((p.date - a).dt.days < -1).sum())
    formats = p.format.value_counts()
    return dict(n_formatos=int(formats.size), formato_principal=formats.index[0],
                pct_formato_principal=100 * float(formats.iloc[0] / formats.sum()),
                n_fecha_imposible=int(impossible.sum()), n_fecha_centinela=int(sentinel.sum()),
                n_fecha_futura=int(future.sum()),
                n_antes_de_anclaje=before_anchor,
                minimo=p.date.min(), maximo=p.date.max())


def profile_variables(meta: pd.DataFrame, data: pd.DataFrame, spec: DatasetSpec) -> pd.DataFrame:
    """One row per variable; columns depend on the declared kind."""
    anchor = parse_dates(data[spec.anchor_date]).date if spec.anchor_date else None
    rows = []
    n = len(data)
    for r in meta.itertuples():
        if r.variable not in data:
            continue
        col = data[r.variable]
        base = dict(variable=r.variable, etiqueta=r.label, tipo=r.kind, unidad=r.unit,
                    n=int(col.notna().sum()), pct_cobertura=100 * col.notna().mean())
        if r.kind == 'numeric' and pd.api.types.is_numeric_dtype(col):
            base |= profile_numeric(col, r.range_min, r.range_max, has_unit=pd.notna(r.unit))
        elif r.kind in ('categorical', 'boolean'):
            base |= profile_categorical(col)
        elif r.kind == 'date':
            skip_anchor = r.variable == spec.anchor_date or r.variable in spec.pre_anchor_dates
            base |= profile_dates(col, None if skip_anchor else anchor, spec)
        rows.append(base)
    out = pd.DataFrame(rows)
    out['n_hallazgos'] = out.reindex(columns=[
        'n_centinela', 'n_fuera_rango', 'n_error_unidad', 'n_fecha_imposible', 'n_fecha_futura',
        'n_antes_de_anclaje']).fillna(0).sum(axis=1)
    out['pct_hallazgos'] = 100 * out.n_hallazgos / out.n.where(out.n > 0)
    return out.set_index('variable')


# ----------------------------------------------------------------- entity layer

def long_family(data: pd.DataFrame, family: Family, spec: DatasetSpec) -> pd.DataFrame:
    """Stack a family into one row per (entity, stage) with value, date and recorded age."""
    anchor = parse_dates(data[spec.anchor_date]).date if spec.anchor_date else pd.Series(pd.NaT, index=data.index)
    frames = []
    for order, st in enumerate(family.stages):
        f = pd.DataFrame({
            'entity': data[spec.entity], 'stage': st.key, 'order': order,
            'value': pd.to_numeric(data[st.value], errors='coerce'),
            'date': parse_dates(data[st.date]).date if st.date else pd.NaT,
            'age': pd.to_numeric(data[st.age], errors='coerce') if st.age else np.nan,
            'nominal_age': st.nominal_age_days, 'anchor': anchor,
            'group': data[spec.group] if spec.group else 'all',
        })
        for c in spec.covariates:
            f[c] = data[c]
        frames.append(f)
    out = pd.concat(frames, ignore_index=True)
    out['age_from_dates'] = (out.date - out.anchor).dt.days
    age = out.age.fillna(out.age_from_dates)
    out['age_bin'] = (age.where(age.between(0, 1000)) // 7).astype('Int64')  # weeks since anchor
    return out


def eligible_coverage(fam: pd.DataFrame, spec: DatasetSpec, grace_days: int = 60) -> pd.DataFrame:
    """Coverage per stage counting only entities old enough to have reached it."""
    rows = []
    for (order, stage), g in fam.groupby(['order', 'stage'], sort=True):
        nominal = g.nominal_age.iloc[0]
        has_anchor = g.anchor.notna()
        if spec.cutoff is not None and pd.notna(nominal):
            due = g.anchor + pd.to_timedelta(nominal + grace_days, unit='D')
            eligible = has_anchor & (due <= spec.cutoff)
        else:
            eligible = has_anchor
        rows.append(dict(etapa=stage, orden=order, con_dato=int(g.value.notna().sum()),
                         elegibles=int(eligible.sum()),
                         con_dato_elegibles=int((g.value.notna() & eligible).sum())))
    out = pd.DataFrame(rows)
    out['pct_cobertura_elegibles'] = 100 * out.con_dato_elegibles / out.elegibles
    return out


def trajectory_checks(fam: pd.DataFrame, family: Family, z_threshold: float = 4.0) -> pd.DataFrame:
    """Per consecutive observed stages: date order, age consistency, decreases and velocity outliers."""
    obs = fam.dropna(subset=['value']).sort_values(['entity', 'order'])
    nxt = obs.groupby('entity').shift(-1)
    pair = obs.assign(next_stage=nxt.stage, next_value=nxt.value, next_date=nxt.date).dropna(subset=['next_value'])
    pair['delta'] = pair.next_value - pair.value
    pair['days'] = (pair.next_date - pair.date).dt.days
    pair['velocity'] = pair.delta / pair.days.where(pair.days > 0)
    pair['transition'] = pair.stage + ' -> ' + pair.next_stage
    pair['z_velocity'] = pair.groupby('transition').velocity.transform(robust_z)
    pair['flag_date_order'] = pair.days < 0
    pair['flag_same_day'] = pair.days == 0
    pair['flag_decrease'] = family.non_decreasing & (pair.delta < -family.decrease_tolerance)
    pair['flag_velocity'] = pair.z_velocity.abs() > z_threshold
    return pair


def summarize_trajectories(pair: pd.DataFrame) -> pd.DataFrame:
    g = pair.groupby('transition', sort=False)
    out = pd.DataFrame({
        'pares': g.size(),
        'con_fechas': g.days.count(),
        'fechas_invertidas': g.flag_date_order.sum(),
        'mismo_dia': g.flag_same_day.sum(),
        'disminuciones': g.flag_decrease.sum(),
        'velocidad_atipica': g.flag_velocity.sum(),
        'mediana_dias': g.days.median(),
        'mediana_cambio': g.delta.median(),
    })
    return out


def age_consistency(fam: pd.DataFrame, tolerance_days: int = 14) -> pd.DataFrame:
    """Recorded age versus age computed from the stage date and the anchor date."""
    f = fam.dropna(subset=['age', 'age_from_dates'])
    diff = f.age - f.age_from_dates
    return (f.assign(diff=diff, off=diff.abs() > tolerance_days)
             .groupby('stage', sort=False)
             .agg(n=('diff', 'size'), mediana_diferencia=('diff', 'median'), pct_discrepante=('off', 'mean'))
             .assign(pct_discrepante=lambda d: 100 * d.pct_discrepante))


# ----------------------------------------------------- conditional reference

def conditional_z(fam: pd.DataFrame, covariates: list[str], min_cell: int) -> pd.Series:
    """Robust z of each value against comparable entities (same stage and covariate cell).

    Cells smaller than ``min_cell`` fall back to coarser cells by dropping covariates
    from the right, so every value gets the most specific reference available.
    """
    z = pd.Series(np.nan, index=fam.index)
    pending = fam.value.notna()
    for k in range(len(covariates), -1, -1):
        keys = ['stage', *covariates[:k]]
        grp = fam[pending].groupby(keys, dropna=True, observed=True).value
        size = grp.transform('size')
        med = grp.transform('median')
        mad = grp.transform(lambda s: (s - s.median()).abs().median() * 1.4826)
        ok = (size >= min_cell) & (mad > 0)
        idx = ok[ok].index
        z.loc[idx] = (fam.value[idx] - med[idx]) / mad[idx]
        pending &= z.isna()
    return z


# ------------------------------------------------------------------ group layer

def group_period_drift(fam: pd.DataFrame, z: pd.Series, freq: str = 'Q',
                       min_n: int = 30, z_alarm: float = 3.0, min_effect: float = 0.2,
                       cusum_h: float = 5.0, baseline: int = 8,
                       cutoff: pd.Timestamp | None = None) -> pd.DataFrame:
    """Median conditional z per group and period, read in two ways.

    * level: the period against the pooled reference of all groups. A persistent
      level difference points to case mix or protocol, not to a broken instrument.
    * change: the period against the group's own recent past (median of the
      previous ``baseline`` periods). A change that starts at some date and
      persists is the signature of a calibration drift; slow secular trends are
      absorbed by the moving baseline.

    The standard error of a median is about 1.2533 * sigma / sqrt(n); robust z has
    sigma ~ 1, so ``stat = deviation / (1.2533 / sqrt(n))``. An alarm needs the
    deviation to be both statistically clear and practically large (``min_effect``).
    Periods that had not ended by ``cutoff`` (the extraction date) are dropped: an
    incomplete period holds a biased subset of visits.
    """
    f = fam.assign(z=z).dropna(subset=['z', 'date'])
    f = f[f.date.dt.year.between(1990, 2100)]
    f['period'] = f.date.dt.to_period(freq).dt.start_time
    if cutoff is not None:
        f = f[f.date.dt.to_period(freq).dt.end_time <= cutoff]
    out = f.groupby(['group', 'period']).z.agg(n='size', mediana_z='median').reset_index()
    out = out[out.n >= min_n].copy()
    se = 1.2533 / np.sqrt(out.n)
    out['estadistico_nivel'] = out.mediana_z / se
    out['alarma_nivel'] = (out.estadistico_nivel.abs() > z_alarm) & (out.mediana_z.abs() >= min_effect)
    out = out.sort_values(['group', 'period'])
    out['nivel_propio'] = out.groupby('group').mediana_z.transform(
        lambda s: s.shift(1).rolling(baseline, min_periods=baseline // 2).median())
    out['desvio_propio'] = out.mediana_z - out.nivel_propio
    out['estadistico_cambio'] = out.desvio_propio / se
    out['alarma_cambio'] = (out.estadistico_cambio.abs() > z_alarm) & (out.desvio_propio.abs() >= min_effect)
    cus = out.groupby('group', group_keys=False).estadistico_cambio.apply(lambda s: cusum(s, h=cusum_h))
    out = out.join(cus)
    return out


def cusum(stat: pd.Series, k: float = 0.5, h: float = 5.0) -> pd.DataFrame:
    """Two-sided CUSUM of a standardized series, reset after each alarm.

    Sustained moderate deviations accumulate until they cross ``h``; the reset makes
    each alarm a discrete event instead of a run of consecutive flags.
    """
    up = down = 0.0
    rows = []
    for x in stat.fillna(0).to_numpy():
        up, down = max(0.0, up + x - k), max(0.0, down - x - k)
        alarm = up > h or down > h
        rows.append((up, down, alarm))
        if alarm:
            up = down = 0.0
    return pd.DataFrame(rows, index=stat.index, columns=['cusum_sube', 'cusum_baja', 'alarma_cusum'])


def first_alarm_after(drift: pd.DataFrame, group: object, start: pd.Timestamp, column: str) -> pd.Timestamp | None:
    hits = drift[(drift.group == group) & (drift.period >= start) & drift[column]]
    return hits.period.min() if not hits.empty else None


def group_casemix(data: pd.DataFrame, group: str, columns: dict[str, str]) -> pd.DataFrame:
    """Median of each descriptor per group (descriptors are named by the caller)."""
    return data.groupby(group).agg(**{name: (col, 'median') for name, col in columns.items()}) \
               .join(data.groupby(group).size().rename('n'))


def heaping_by(data: pd.DataFrame, value: str, by: list[str], min_n: int = 100) -> pd.DataFrame:
    rows = []
    for key, g in data.dropna(subset=[value]).groupby(by):
        if len(g) >= min_n:
            rows.append(dict(zip(by, key if isinstance(key, tuple) else (key,)), n=len(g),
                             **heaping_index(g[value].to_numpy(dtype=float))))
    return pd.DataFrame(rows)


# ------------------------------------------------------------- synthetic check

def inject_shift(fam: pd.DataFrame, group: object, start: pd.Timestamp, stage: str, shift: float,
                 seed: int = 7) -> pd.DataFrame:
    """Copy of a family with a known calibration bias added to one group from a date on."""
    out = fam.copy()
    mask = (out.group == group) & (out.date >= start) & (out.stage == stage) & out.value.notna()
    out.loc[mask, 'value'] = out.loc[mask, 'value'] + shift
    out.attrs['injected'] = int(mask.sum())
    return out


def inject_unit_errors(x: pd.Series, share: float, factor: float, seed: int = 7) -> tuple[pd.Series, pd.Index]:
    rng = np.random.default_rng(seed)
    obs = x.dropna().index
    hit = pd.Index(rng.choice(obs, size=max(1, int(share * len(obs))), replace=False))
    out = x.copy()
    out.loc[hit] = out.loc[hit] * factor
    return out, hit


def flag_unit_errors(x: pd.Series, rmin: float, rmax: float) -> pd.Series:
    """Element-wise version of ``unit_error_candidates``."""
    med = x.median()
    if not med > 0:
        return pd.Series(False, index=x.index)
    out = ((x < rmin) | (x > rmax)) & ((x >= 5 * med) | (x <= med / 5))
    pos = x.where(out & (x > 0))
    factors = np.array([1e-3, 1e-2, 1e-1, 10, 100, 1000])
    rescaled = np.outer(pos.fillna(-1).to_numpy(), factors)
    return pd.Series(((rescaled >= rmin) & (rescaled <= rmax)).any(axis=1), index=x.index)

