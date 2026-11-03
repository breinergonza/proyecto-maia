"""Anomaly model over SEVARTI input, trained on dirty data.

An anomaly is a datum far from what is expected for that case. Five layers, each
answering one question, all driven by the schema (no variable is named here):

0. Contrato: does the datum fulfil the schema? (type, known variable, placeable in time)
   A failure is a rejection, not an anomaly.
1. Valor: does the value make sense on its own? (median/MAD, placeholder codes, unit errors)
2. Contexto: does it make sense for this subject? One LightGBM quantile model per numeric
   variable, conformally calibrated, using stage, corrected age, baseline covariates,
   social context, active episodes and the other variables of the same stage.
3. Trayectoria: does it make sense with the subject's history? Variables that share a
   concept are chained across stages: stage windows, velocity against peers, decreases.
4. Grupo y tiempo: did a group start recording differently? Each group against its own
   recent past: residuals, missingness and rounding per period.

Training never imputes or corrects values and never touches the source. Each cell is
decided on its own: a cell excluded from training (placeholder code, unit error, beyond
``z_entrenamiento`` robust deviations, or worst residuals of the second pass) is dropped
as a target and becomes missing as an input. The exclusions form a versioned mask.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import zlib
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy import stats

from anomalias import motor as M
from sevarti.contrato import Sevarti, codigos_declarados, edad_corregida, nacimiento_referencia

VERSION_CODIGO = '4'  # bump when a saved model can no longer be read or scored the same way
TOLERANCIA_EDAD_DIAS = 14  # recorded age against the age computed from the date
SUFIJO_CODIGO = 'código especial'


@dataclass(frozen=True)
class Config:
    z_alerta: float = 3.5           # layers 1 and 3: robust deviations that raise an alert
    z_entrenamiento: float = 6.0    # beyond this a cell is excluded from training
    recorte: float = 0.01           # second pass drops at most this share of a variable...
    z_recorte: float = 3.5          # ...and only residuals beyond this (the cap)
    min_sujetos: int = 200          # layer 2 trains a variable once it has this many subjects
    min_valores_ref: int = 20       # layers 1 and 3 need this many values for a reference
    frecuente: float = 0.01         # layer 1: a value this common is not rare, whatever its z
    ceros: float = 0.3              # layer 1: with this share of zeros the scale comes from the rest
    alpha: float = 0.05             # layer 2 false-alert target per datum (50 per 1,000)
    cuantiles: tuple[float, float, float] = (0.25, 0.5, 0.75)
    min_nivel: int = 20             # categorical levels rarer than this become missing
    max_niveles: int = 64           # categorical inputs with more levels are dropped (free text)
    rondas: int = 300
    tasa: float = 0.08
    hojas: int = 31
    min_hoja: int = 40
    semilla: int = 7
    # 'cuda' needs a LightGBM build with CUDA; MAIA_LGBM_DEVICE sets it without touching code.
    # Whatever the device cannot train falls back to CPU (``entrenar_lgb``).
    dispositivo: str = field(default_factory=lambda: dispositivo_lgb())
    hilos: int = 8                  # per model: one variable has a few 10,000 rows, more threads only contend
    periodo: str = 'Q'
    base_periodos: int = 8          # layer 4 baseline: the group's previous periods
    min_n_grupo: int = 30
    efecto_proporcion: float = 0.10  # layer 4: smallest change in a share worth an alert
    cusum_h: float = 8.0            # layer 4: CUSUM limit; ~60 series (variable x group) share it


# ================================================================== LightGBM device

def dispositivo_lgb() -> str:
    """The device LightGBM is asked to train on: ``MAIA_LGBM_DEVICE`` (cpu, cuda or gpu), cpu by default."""
    return (os.environ.get('MAIA_LGBM_DEVICE') or 'cpu').strip().lower()


DISPOSITIVOS_USADOS: dict[str, set[str]] = {}   # objective -> devices it really trained on, this process
_AVISADOS: set[str] = set()


def entrenar_lgb(params: dict, X_tr: pd.DataFrame, y_tr, X_va: pd.DataFrame, y_va, cats: list[str],
                 **train_kwargs) -> lgb.Booster:
    """``lgb.train`` on the device in ``params``. If that device cannot train this model (an objective
    the CUDA learner lacks, or a LightGBM built without it), the same model is trained on CPU and the
    fallback is reported once per objective. The datasets are built here so a failed attempt on the
    device leaves nothing half-constructed for the CPU one."""
    def correr(p: dict) -> lgb.Booster:
        tr = lgb.Dataset(X_tr, y_tr, categorical_feature=cats, free_raw_data=False)
        va = lgb.Dataset(X_va, y_va, categorical_feature=cats, reference=tr, free_raw_data=False)
        return lgb.train(p, tr, valid_sets=[va], **train_kwargs)

    objetivo = str(params.get('objective'))
    dispositivo = str(params.get('device_type', 'cpu'))
    if dispositivo != 'cpu':
        try:
            modelo = correr(params)
            DISPOSITIVOS_USADOS.setdefault(objetivo, set()).add(dispositivo)
            return modelo
        except lgb.basic.LightGBMError as e:
            if objetivo not in _AVISADOS:
                _AVISADOS.add(objetivo)
                print(f'LightGBM no entrena "{objetivo}" en {dispositivo} ({str(e).splitlines()[0][:160]}); '
                      f'esos modelos se entrenan en CPU.', file=sys.stderr, flush=True)
    modelo = correr({**params, 'device_type': 'cpu'})
    DISPOSITIVOS_USADOS.setdefault(objetivo, set()).add('cpu')
    return modelo


# ============================================================== layer 0: contrato

def preparar(sev: Sevarti) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Typed long table of usable data plus the rejected data (layer 0).

    The index of the returned table is the index of ``sev.mediciones``, so every
    score can be traced back to the datum that produced it.
    """
    esq = sev.esquema.set_index('variable')
    suj = sev.sujetos.drop_duplicates('sujeto').set_index('sujeto')
    m = sev.mediciones[sev.mediciones.valor.notna()]
    rechazos: list[pd.DataFrame] = []

    def rechazar(mask: pd.Series, motivo: str) -> pd.DataFrame:
        if mask.any():
            rechazos.append(pd.DataFrame({'sujeto': m.sujeto[mask], 'variable': m.variable[mask],
                                          'capa': 0, 'motivo': motivo}))
        return m[~mask]

    m = rechazar(~m.variable.isin(esq.index), 'variable sin esquema')
    m = rechazar(~m.sujeto.isin(suj.index), 'sujeto desconocido')
    tipo = m.variable.map(esq.tipo)
    x = pd.to_numeric(m.valor, errors='coerce')
    m = rechazar(tipo.eq('numeric') & ~np.isfinite(x.astype(float)), 'no es un número')

    nacimiento = pd.to_datetime(m.sujeto.map(suj.fecha_nacimiento), errors='coerce')
    fecha = pd.to_datetime(m.fecha, errors='coerce')
    edad = pd.to_numeric(m.edad_dias, errors='coerce').astype(float)
    t = fecha.fillna(nacimiento + pd.to_timedelta(edad, unit='D'))
    edad_fecha = (fecha - nacimiento).dt.days.astype(float)
    incoherente = (edad - edad_fecha).abs() > TOLERANCIA_EDAD_DIAS
    edad = edad.fillna(edad_fecha)
    rol = m.variable.map(esq.rol)
    m = rechazar(rol.eq('medicion') & (edad < 0), 'fecha antes del nacimiento')
    if sev.corte is not None:
        m = rechazar(t.reindex(m.index) > sev.corte, 'fecha después del corte')

    idx = m.index
    eg = m.sujeto.map(suj.eg_semanas).astype(float)
    datos = pd.DataFrame({
        'sujeto': m.sujeto, 'variable': m.variable, 'valor': m.valor,
        'x': pd.to_numeric(m.valor, errors='coerce').astype(float),
        'tipo': m.variable.map(esq.tipo), 'rol': m.variable.map(esq.rol),
        'etapa': m.variable.map(esq.etapa), 'concepto': m.variable.map(esq.concepto),
        't': t.reindex(idx), 'edad_dias': edad.reindex(idx),
        'grupo': m.sujeto.map(suj.grupo), 'nacimiento': nacimiento.reindex(idx), 'eg_semanas': eg,
        'edad_incoherente': incoherente.reindex(idx).fillna(False).astype(bool),
    }, index=idx)
    datos['ec_dias'] = edad_corregida(datos.edad_dias, datos.eg_semanas)
    datos.loc[datos.tipo != 'numeric', 'x'] = np.nan
    rech = pd.concat(rechazos) if rechazos else pd.DataFrame(columns=['sujeto', 'variable', 'capa', 'motivo'])
    return datos, rech


# ================================================================= layer 1: valor

@dataclass(frozen=True)
class RefValor:
    log: bool
    mediana: float
    escala: float
    codigos: tuple[float, ...]
    resolucion: float
    n: int
    desplazamiento: float = 0.0               # log scale: log(x + desplazamiento), so zeros fit
    frecuentes: tuple[float, ...] = ()        # values too common to be rare


def _escala_robusta(s: pd.Series) -> tuple[float, float]:
    med = float(s.median())
    mad = float((s - med).abs().median() * 1.4826)
    if not mad > 0:
        # more than half the values tie (a count that is mostly 0): the MAD says nothing, and the
        # mean absolute deviation alone is tiny; the central 90% gives the spread that is left
        q05, q95 = s.quantile([0.05, 0.95])
        mad = max(float((s - med).abs().mean() * 1.2533), float(q95 - q05) / 3.29)
    return med, mad


def ref_valor(x: pd.Series, declarados: tuple[float, ...], cfg: Config) -> RefValor | None:
    """Reference of one variable. Placeholder codes are found before the scale is computed,
    so a code used in most rows (a -1 in 70% of a lab value) is not learned as normal."""
    x = x.dropna()
    if len(x) < cfg.min_valores_ref:
        return None
    candidatos = set(M.SENTINEL_CANDIDATES) | set(declarados)
    base = x[~x.isin(candidatos)]
    if len(base) < cfg.min_valores_ref:
        base = x
    lo, hi = base.quantile([0.005, 0.995])
    no_negativa = (base >= 0).mean() > 0.99
    conteo = x.value_counts()
    codigos = set(declarados)
    for v in M.SENTINEL_CANDIDATES:
        n = int(conteo.get(v, 0))
        if n >= max(5, 0.0005 * len(x)) and (v < lo or v > hi or (v < 0 and no_negativa)):
            codigos.add(v)
    limpio = x[~x.isin(codigos)]
    if len(limpio) < cfg.min_valores_ref:
        return None
    resolucion = M.resolution(limpio.to_numpy())
    # skewed and non-negative (days, counts, income): log scale; zeros are kept by shifting
    # one resolution step, so a single zero does not force a linear scale on the whole variable
    # many zeros (days in an incubator: 0 for term babies) is a mixture, not one spread:
    # zero is a common value of its own, and the scale is the one of the other values
    distintos = limpio[limpio != 0]
    if (limpio == 0).mean() >= cfg.ceros and len(distintos) >= cfg.min_valores_ref:
        escalar = distintos
    else:
        escalar = limpio
    log = bool((escalar >= 0).mean() > 0.99 and escalar.skew() > 1)
    desplazamiento = 0.0 if not log or (escalar > 0).all() else float(resolucion)
    med, esc = _escala_robusta(np.log(escalar.clip(lower=0) + desplazamiento) if log else escalar)
    if not esc > 0:
        return None
    frecuencia = limpio.value_counts(normalize=True)
    return RefValor(log=log, mediana=med, escala=esc, codigos=tuple(sorted(codigos)), resolucion=resolucion,
                    n=len(limpio), desplazamiento=desplazamiento,
                    frecuentes=tuple(sorted(frecuencia.index[frecuencia >= cfg.frecuente])))


def ajustar_valor(datos: pd.DataFrame, esquema: pd.DataFrame, cfg: Config) -> dict[str, RefValor]:
    declarados = esquema.set_index('variable').codigos_especiales.map(codigos_declarados)
    refs = {}
    for var, g in datos[datos.tipo == 'numeric'].groupby('variable'):
        ref = ref_valor(g.x, declarados.get(var, ()), cfg)
        if ref is not None:
            refs[var] = ref
    return refs


def _z(x: pd.Series | np.ndarray, ref: RefValor) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    if not ref.log:
        return (x - ref.mediana) / ref.escala
    t = x + ref.desplazamiento
    with np.errstate(divide='ignore', invalid='ignore'):
        z = (np.log(np.where(t > 0, t, np.nan)) - ref.mediana) / ref.escala
    # a log-scale variable does not go below its floor: anything under it is as atypical as it gets
    return np.where(np.isfinite(x) & (t <= 0), -np.inf, z)


def _desde_z(z: float, ref: RefValor) -> float:
    """The value that sits ``z`` robust deviations from the median."""
    s = ref.mediana + z * ref.escala
    return float(np.exp(s) - ref.desplazamiento) if ref.log else float(s)


def _en_resolucion(x: np.ndarray, resolucion: float) -> np.ndarray:
    pasos = x / resolucion
    return np.abs(pasos - np.round(pasos)) < 1e-6 * np.maximum(1, np.abs(pasos))


def puntuar_valor(datos: pd.DataFrame, refs: dict[str, RefValor], esquema: pd.DataFrame,
                  cfg: Config) -> pd.DataFrame:
    """Per numeric datum: robust z, placeholder code and unit error. Variables without a
    trained reference use the incoming data itself, so a new variable works from day one."""
    declarados = esquema.set_index('variable').codigos_especiales.map(codigos_declarados)
    partes = []
    for var, g in datos[datos.tipo == 'numeric'].groupby('variable'):
        ref = refs.get(var) or ref_valor(g.x, declarados.get(var, ()), cfg)
        out = pd.DataFrame(index=g.index)
        if ref is None:
            out['z1'] = np.nan
            out['codigo'] = g.x.isin(declarados.get(var, ()))
            out['unidad'] = False
        else:
            x = g.x.to_numpy()
            z = _z(x, ref)
            out['z1'] = z
            out['codigo'] = g.x.isin(ref.codigos)
            out['frecuente'] = g.x.isin(ref.frecuentes)
            # a unit error is far out (where training would drop it anyway) and lands, once
            # rescaled by a power of ten, on a typical value the variable can actually take
            fuera = (np.abs(z) > cfg.z_entrenamiento) & (x > 0) & ~out.codigo.to_numpy() & ~out.frecuente.to_numpy()
            unidad = np.zeros(len(g), dtype=bool)
            for k in (-3, -2, -1, 1, 2, 3):
                r = x * 10.0 ** k
                unidad |= fuera & (np.abs(_z(r, ref)) < 2) & _en_resolucion(r, ref.resolucion)
            out['unidad'] = unidad
        if 'frecuente' not in out:
            out['frecuente'] = False
        out['atipico'] = (out.z1.abs() > cfg.z_alerta) & ~out.codigo & ~out.unidad & ~out.frecuente
        partes.append(out)
    if not partes:
        return pd.DataFrame(columns=['z1', 'codigo', 'frecuente', 'unidad', 'atipico'])
    res = pd.concat(partes)
    # a known code means "not done": it is recorded and reported as a pattern, but it is not an alert
    res['alerta1'] = res.unidad | res.atipico
    res['motivo1'] = np.select([res.codigo, res.unidad, res.atipico],
                               [SUFIJO_CODIGO, 'posible error de unidad', 'valor atípico'], default='')
    return res


def patrones(datos: pd.DataFrame, refs: dict[str, RefValor]) -> pd.DataFrame:
    """Per variable: detected codes and rounding, the patterns a model would learn as normal."""
    filas = []
    for var, g in datos[datos.tipo == 'numeric'].groupby('variable'):
        ref = refs.get(var)
        if ref is None:
            continue
        x = g.x.dropna()
        h = M.heaping_index(x[~x.isin(ref.codigos)].to_numpy())
        filas.append(dict(variable=var, n=len(x), codigos=', '.join(f'{c:g}' for c in ref.codigos) or None,
                          pct_codigo=100 * x.isin(ref.codigos).mean(), resolucion=ref.resolucion,
                          pct_terminal_0=h['pct_terminal_0'], escala_log=ref.log,
                          frecuentes=len(ref.frecuentes)))
    return pd.DataFrame(filas).set_index('variable') if filas else pd.DataFrame()


def mascara_base(datos: pd.DataFrame, p1: pd.DataFrame, cfg: Config) -> pd.Series:
    """Training exclusions decided per cell from layer 1. Declared ranges are never used."""
    p = p1.reindex(datos.index)
    motivo = pd.Series(np.select(
        [p.codigo.fillna(False).astype(bool), p.unidad.fillna(False).astype(bool),
         (p.z1.abs() > cfg.z_entrenamiento) & ~p.frecuente.fillna(False).astype(bool)],
        [SUFIJO_CODIGO, 'error de unidad', f'más de {cfg.z_entrenamiento:g} MAD'], default=''),
        index=datos.index)
    return motivo[motivo != '']


# ============================================================= layer 2: contexto

def _nombre(c: str) -> str:
    return ''.join(ch if ch.isalnum() or ch == '_' else '_' for ch in str(c))


@dataclass
class Capa2Variable:
    variable: str
    columnas: list[str]
    modelos: list[lgb.Booster]
    escala_min: float
    cal: np.ndarray            # sorted |z| on the calibration split
    n_entrenamiento: int
    n_segunda_vuelta: int

    @property
    def calibrada(self) -> bool:
        return self.cal.size > 0


class Matriz:
    """Builds the feature matrix of layer 2 from SEVARTI data, the same way at fit and score.

    * subject level: group, gestational age, known breaks, baseline and context variables;
    * stage level: the other numeric variables measured in the same stage, and the
      episodes active at the stage time;
    * datum level: chronological and corrected age of the datum.
    Excluded cells enter as missing; categorical levels are frozen at fit time.
    """

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.niveles: dict[str, list[str]] = {}
        self.tipos_episodio: list[str] = []
        self.quiebres: list[tuple[str, pd.Timestamp]] = []

    def ajustar(self, datos: pd.DataFrame, sev: Sevarti) -> Matriz:
        cats = datos[datos.rol.isin(['basal', 'contexto']) & datos.tipo.isin(['categorical', 'boolean'])]
        for var, g in cats.groupby('variable'):
            vc = g.valor.astype(str).value_counts()
            vc = vc[vc >= self.cfg.min_nivel]
            if 1 < len(vc) <= self.cfg.max_niveles:
                self.niveles[var] = sorted(vc.index)
        grupos = sev.sujetos.grupo.dropna().astype(str).unique()
        self.niveles['grupo'] = sorted(grupos)
        self.tipos_episodio = sorted(sev.episodios.tipo.dropna().unique())
        self.quiebres = [(str(q), pd.Timestamp(f)) for q, f in zip(sev.quiebres.quiebre, sev.quiebres.fecha)]
        return self

    def sujeto(self, datos: pd.DataFrame, sev: Sevarti, x: pd.Series) -> pd.DataFrame:
        suj = sev.sujetos.drop_duplicates('sujeto').set_index('sujeto')
        out = pd.DataFrame(index=suj.index)
        out['grupo'] = pd.Categorical(suj.grupo.astype(str), categories=self.niveles['grupo'])
        out['eg_semanas'] = suj.eg_semanas.astype(float)
        nac = nacimiento_referencia(suj)
        for nombre, fecha in self.quiebres:
            out[f'quiebre_{_nombre(nombre)}'] = (nac >= fecha).astype(float).where(nac.notna())
        base = datos.rol.isin(['basal', 'contexto'])
        num = datos[base & (datos.tipo == 'numeric')].assign(x=x)
        if len(num):
            out = out.join(num.pivot_table(index='sujeto', columns='variable', values='x', aggfunc='first'))
        cat = datos[base & datos.variable.isin(list(self.niveles))]
        if len(cat):
            ancho = cat.assign(v=cat.valor.astype(str)).pivot_table(index='sujeto', columns='variable', values='v',
                                                                    aggfunc='first')
            for var in ancho:
                out[var] = pd.Categorical(ancho[var].reindex(out.index), categories=self.niveles[var])
        for var in self.niveles:
            if var not in out:
                out[var] = pd.Categorical([np.nan] * len(out), categories=self.niveles[var])
        return out

    def etapa(self, datos: pd.DataFrame, sev: Sevarti, x: pd.Series, etapa: str) -> pd.DataFrame:
        en = datos[(datos.etapa == etapa) & (datos.rol == 'medicion')]
        num = en[en.tipo == 'numeric'].assign(x=x.reindex(en.index))
        out = num.pivot_table(index='sujeto', columns='variable', values='x', aggfunc='first') \
            if len(num) else pd.DataFrame()
        edad = en.groupby('sujeto').edad_dias.median()
        out = out.reindex(out.index.union(edad.index))
        ep = sev.episodios.assign(edad_inicio=lambda d: pd.to_numeric(d.edad_inicio, errors='coerce').fillna(0.0),
                                  edad_fin=lambda d: pd.to_numeric(d.edad_fin, errors='coerce'))
        for tipo in self.tipos_episodio:
            j = ep[ep.tipo == tipo].merge(edad.rename('edad_etapa').reset_index(), on='sujeto')
            j = j[j.edad_inicio <= j.edad_etapa].sort_values('edad_inicio').groupby('sujeto').last()
            activo = pd.Series(np.where(j.edad_fin.isna(), np.nan, (j.edad_etapa <= j.edad_fin).astype(float)),
                               index=j.index)
            out[f'ep_{_nombre(tipo)}_activo'] = activo.reindex(out.index)
            out[f'ep_{_nombre(tipo)}_dias_desde_fin'] = (j.edad_etapa - j.edad_fin).reindex(out.index)
            out[f'ep_{_nombre(tipo)}_duracion'] = (j.edad_fin - j.edad_inicio).reindex(out.index)
        return out

    def construir(self, datos: pd.DataFrame, sev: Sevarti, x: pd.Series) -> dict[str | None, pd.DataFrame]:
        """Subject matrix (key None) and one matrix per stage."""
        out: dict[str | None, pd.DataFrame] = {None: self.sujeto(datos, sev, x)}
        for etapa in datos.loc[datos.rol == 'medicion', 'etapa'].dropna().unique():
            out[etapa] = self.etapa(datos, sev, x, etapa)
        return out

    @staticmethod
    def filas(d: pd.DataFrame, matrices: dict[str | None, pd.DataFrame], var: str) -> pd.DataFrame:
        """Feature rows for the data ``d`` of ``var`` (its rows only): its own value is never an input."""
        X = matrices[None].reindex(d.sujeto)
        etapa = d.etapa.iloc[0] if d.rol.iloc[0] == 'medicion' else None
        if etapa is not None and etapa in matrices:
            X = pd.concat([X.reset_index(drop=True), matrices[etapa].reindex(d.sujeto).reset_index(drop=True)], axis=1)
        X = X.reset_index(drop=True)
        X = X.drop(columns=[c for c in X if c == var])
        X['edad_dias'] = d.edad_dias.to_numpy()
        X['ec_dias'] = d.ec_dias.to_numpy()
        X.index = d.index
        X.columns = [_nombre(c) for c in X.columns]
        return X.loc[:, ~X.columns.duplicated()]


def _rng(cfg: Config, variable: str) -> np.random.Generator:
    """One stream per variable: the same model whether it is fitted with the rest or alone."""
    return np.random.default_rng([cfg.semilla, zlib.crc32(variable.encode())])


def _entrenar_variable(args: tuple) -> tuple[Capa2Variable, pd.Index]:
    """Layer 2 of one variable on its own data: fit, second pass, calibration. The result only
    depends on the variable, its data and the config."""
    var, X, y, Xc, yc, cfg, paso = args
    rng = _rng(cfg, var)
    _, esc = _escala_robusta(y)
    # a model is not more precise than the variable's own step (a count moves by 1)
    escala_min = max(0.05 * esc, paso / 2, 1e-9)
    m = Capa2Variable(var, list(X.columns), _entrenar(X, y, cfg, rng), escala_min, np.array([]), len(y), 0)
    z, _, _ = _residuo(m, X, y.to_numpy())
    peores = np.argsort(-np.abs(z))[:int(cfg.recorte * len(z))]
    peores = peores[np.abs(z[peores]) > cfg.z_recorte]
    quitadas = pd.Index([])
    if len(peores):
        quitar = np.zeros(len(y), dtype=bool)
        quitar[peores] = True
        quitadas = y.index[quitar]
        m.modelos = _entrenar(X[~quitar], y[~quitar], cfg, rng)
        m.n_entrenamiento, m.n_segunda_vuelta = int((~quitar).sum()), int(quitar.sum())
    if Xc is not None and len(yc) >= 1 / cfg.alpha:
        zc = np.sort(np.abs(_residuo(m, Xc, yc.to_numpy())[0]))
        # the calibration split is dirty too: drop its clear outliers (capped share)
        k = int(cfg.recorte * len(zc))
        k = int(np.sum(zc[len(zc) - k:] > cfg.z_entrenamiento)) if k else 0
        m.cal = zc[:len(zc) - k]
    return m, quitadas


def _entrenar(X: pd.DataFrame, y: pd.Series, cfg: Config, rng: np.random.Generator) -> list[lgb.Booster]:
    valid = rng.random(len(y)) < 0.15
    cats = [c for c in X if isinstance(X[c].dtype, pd.CategoricalDtype)]
    modelos = []
    for q in cfg.cuantiles:
        params = dict(objective='quantile', alpha=q, learning_rate=cfg.tasa, num_leaves=cfg.hojas,
                      min_data_in_leaf=cfg.min_hoja, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1,
                      max_bin=63, seed=cfg.semilla, verbose=-1, device_type=getattr(cfg, 'dispositivo', 'cpu'),
                      num_threads=cfg.hilos)
        modelos.append(entrenar_lgb(params, X[~valid], y[~valid], X[valid], y[valid], cats,
                                    num_boost_round=cfg.rondas, callbacks=[lgb.early_stopping(30, verbose=False)]))
    return modelos


def _predecir(m: Capa2Variable, X: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    X = X.reindex(columns=m.columnas)
    pred = np.sort(np.column_stack([b.predict(X, num_iteration=b.best_iteration) for b in m.modelos]), axis=1)
    escala = np.maximum((pred[:, 2] - pred[:, 0]) / 1.349, m.escala_min)
    return pred[:, 1], escala, pred


def _residuo(m: Capa2Variable, X: pd.DataFrame, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    esperado, escala, _ = _predecir(m, X)
    return (y - esperado) / escala, esperado, escala


# ============================================================ layer 3: trayectoria

def _pares(datos: pd.DataFrame, x: pd.Series, etapas: pd.DataFrame) -> pd.DataFrame:
    orden = etapas.set_index('etapa').orden
    c = datos[datos.concepto.notna()].assign(x=x).dropna(subset=['x', 'edad_dias'])
    c = c.assign(orden=c.etapa.map(orden)).sort_values(['sujeto', 'concepto', 'edad_dias', 'orden'])
    # consecutive data of the same subject and concept, in age order
    idx, suj, con = c.index.to_numpy(), c.sujeto.to_numpy(), c.concepto.to_numpy()
    seguido = (suj[1:] == suj[:-1]) & (con[1:] == con[:-1])
    a, b = idx[:-1][seguido], idx[1:][seguido]
    p = pd.DataFrame({'fila_a': a, 'fila_b': b})
    p['concepto'] = c.concepto.loc[a].to_numpy()
    p['variable_b'] = c.variable.loc[b].to_numpy()
    lugar = c.etapa.fillna(c.variable).astype(str)
    p['transicion'] = p.concepto + ': ' + lugar.loc[a].to_numpy() + ' → ' + lugar.loc[b].to_numpy()
    p['dias'] = c.edad_dias.loc[b].to_numpy() - c.edad_dias.loc[a].to_numpy()
    p['delta'] = c.x.loc[b].to_numpy() - c.x.loc[a].to_numpy()
    p['velocidad'] = np.where(p.dias > 0, p.delta / p.dias.where(p.dias > 0), np.nan)
    p['desorden'] = c.orden.loc[a].to_numpy() > c.orden.loc[b].to_numpy()
    return p


def _culpables(p: pd.DataFrame, malo: np.ndarray, valido: np.ndarray) -> pd.Index:
    """Which datum of an anomalous pair is to blame.

    A wrong datum spoils both pairs it belongs to, so the datum shared by two anomalous
    pairs is the culprit. When only one pair is anomalous, the datum whose other pair is
    normal is vouched for and the other one is blamed. Without evidence, both are marked.
    """
    estado = np.where(valido, malo.astype(float), np.nan)
    izquierda = pd.Series(estado, index=p.fila_b)  # the pair that ends at the datum
    derecha = pd.Series(estado, index=p.fila_a)    # the pair that starts at the datum
    m = p[malo]
    a_izq = m.fila_a.map(izquierda).to_numpy(dtype=float)  # nan: no usable pair on that side
    b_der = m.fila_b.map(derecha).to_numpy(dtype=float)
    culpa_a = ((a_izq == 1) & (b_der != 1)) | ((b_der == 0) & np.isnan(a_izq))
    culpa_b = ((b_der == 1) & (a_izq != 1)) | ((a_izq == 0) & np.isnan(b_der))
    ambos = ~culpa_a & ~culpa_b
    filas = np.concatenate([m.fila_a.to_numpy()[culpa_a | ambos], m.fila_b.to_numpy()[culpa_b | ambos]])
    return pd.Index(np.unique(filas))


@dataclass(frozen=True)
class RefTransicion:
    """Typical velocity of a transition and the spread of the change left once it is
    removed, as a function of the days between the two data: two weights taken the same
    day should match, two weights a month apart can differ by a lot more."""
    velocidad: float
    dias: tuple[float, ...]      # centre of each band of elapsed days
    escalas: tuple[float, ...]   # robust scale of the change in that band

    def escala(self, dias: np.ndarray) -> np.ndarray:
        return np.interp(dias, self.dias, self.escalas)


def _ref_transicion(g: pd.DataFrame, cfg: Config) -> RefTransicion | None:
    con_tiempo = g.velocidad[g.dias >= 7].dropna()  # a same-day pair says nothing about growth
    v = con_tiempo if len(con_tiempo) >= cfg.min_valores_ref else g.velocidad.dropna()
    if not len(v):
        return None
    vmed = float(v.median())
    resto = g.delta - vmed * g.dias
    bandas = min(5, len(g) // cfg.min_valores_ref)
    if bandas < 1:
        return None
    grupos = pd.qcut(g.dias.rank(method='first'), bandas, labels=False) if bandas > 1 else pd.Series(0, index=g.index)
    centros, escalas = [], []
    for _, idx in g.groupby(grupos).groups.items():
        _, esc = _escala_robusta(resto.loc[idx])
        if esc > 0:
            centros.append(float(g.dias.loc[idx].median()))
            escalas.append(esc)
    if not escalas:
        return None
    # the spread never shrinks as more days go by
    return RefTransicion(vmed, tuple(centros), tuple(np.maximum.accumulate(escalas)))


def ajustar_trayectoria(datos: pd.DataFrame, x: pd.Series, etapas: pd.DataFrame,
                        cfg: Config) -> dict[str, RefTransicion]:
    """Per transition: typical velocity and the spread of the change by elapsed days.
    Dividing by the days instead would turn two visits a few days apart into pure noise."""
    p = _pares(datos, x, etapas)
    refs = {}
    for tr, g in p[p.dias >= 0].groupby('transicion'):
        if len(g) >= cfg.min_valores_ref:
            ref = _ref_transicion(g, cfg)
            if ref is not None:
                refs[tr] = ref
    return refs


def puntuar_trayectoria(datos: pd.DataFrame, x: pd.Series, sev: Sevarti, refs: dict[str, RefTransicion],
                        cfg: Config) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Window, order, decrease and change alerts, and the pairs they were judged on.
    A pair alert goes to the datum to blame."""
    esq = sev.esquema.set_index('variable')
    et = sev.etapas.set_index('etapa')
    out = pd.DataFrame(index=datos.index, data={'z3': np.nan, 'motivo3': ''})
    numerico = datos.tipo == 'numeric'  # like layers 1 and 2: one alert per measured value, not per field of the visit
    out.loc[datos.edad_incoherente & numerico, 'motivo3'] = 'la edad anotada no coincide con la fecha'

    con_etapa = datos.etapa.notna() & datos.variable.map(esq.ventana).fillna(False).astype(bool)
    d = datos[con_etapa & (datos.rol == 'medicion') & numerico]
    edad = np.where(d.etapa.map(et.base) == 'corregida', d.ec_dias, d.edad_dias)
    lo, hi = d.etapa.map(et.edad_min).astype(float), d.etapa.map(et.edad_max).astype(float)
    fuera = (edad < lo) | (edad > hi)
    fuera = d.index[fuera.to_numpy()]
    out.loc[fuera[(out.loc[fuera, 'motivo3'] == '').to_numpy()], 'motivo3'] = 'fuera de la ventana de la etapa'

    p = _pares(datos, x, sev.etapas)
    propios = refs | {tr: r for tr, r in ajustar_trayectoria(datos, x, sev.etapas, cfg).items() if tr not in refs}
    dias = p.dias.clip(lower=0).to_numpy()
    med = np.full(len(p), np.nan)
    esc = np.full(len(p), np.nan)
    for tr, idx in p.groupby('transicion').indices.items():
        if tr in propios:
            med[idx] = propios[tr].velocidad
            esc[idx] = propios[tr].escala(dias[idx])
    p['z'] = (p.delta - med * dias) / esc
    no_dec = p.variable_b.map(esq.no_decreciente).fillna(False).astype(bool)
    tol = p.variable_b.map(esq.tolerancia).fillna(0).astype(float)
    todos = np.ones(len(p), dtype=bool)
    reglas = (('etapas en desorden', p.desorden.to_numpy(), todos),
              ('disminuye y no debería', (no_dec & (p.delta < -tol)).to_numpy(), todos),
              ('cambio atípico para el tiempo transcurrido', (p.z.abs() > cfg.z_alerta).to_numpy(), p.z.notna().to_numpy()))
    zpar = p.z.abs().to_numpy()
    zfila = pd.concat([pd.Series(zpar, index=p.fila_a), pd.Series(zpar, index=p.fila_b)]).groupby(level=0).max()
    for motivo, malo, valido in reglas:
        filas = _culpables(p, malo, valido)
        vacias = filas[(out.loc[filas, 'motivo3'] == '').to_numpy()]
        out.loc[vacias, 'motivo3'] = motivo
        out.loc[filas, 'z3'] = zfila.reindex(filas).to_numpy()
    out['alerta3'] = out.motivo3 != ''
    return out, p


# ========================================================== layer 4: grupo y tiempo

def _cambio_proporcion(tabla: pd.DataFrame, cfg: Config) -> pd.DataFrame:
    """Share per group and period against the median of the group's previous periods.

    The test is the exact binomial one: with small shares and a few dozen data per
    period, the normal approximation raises alarms for two or three extra cases."""
    t = tabla[tabla.n >= cfg.min_n_grupo].sort_values(['grupo', 'variable', 'periodo']).copy()
    t['p'] = t.k / t.n
    t['p_propio'] = t.groupby(['grupo', 'variable']).p.transform(
        lambda s: s.shift(1).rolling(cfg.base_periodos, min_periods=cfg.base_periodos // 2).median())
    p0 = t.p_propio.clip(0.01, 0.99)
    t['estadistico'] = (t.p - t.p_propio) / np.sqrt(p0 * (1 - p0) / t.n)
    cola = np.minimum(stats.binom.sf(t.k - 1, t.n, p0), stats.binom.cdf(t.k, t.n, p0))
    t['alarma'] = (2 * cola < 2 * stats.norm.sf(cfg.z_alerta)) & ((t.p - t.p_propio).abs() >= cfg.efecto_proporcion)
    return t


def puntuar_grupo(datos: pd.DataFrame, p1: pd.DataFrame, p2: pd.DataFrame, refs: dict[str, RefValor],
                  sev: Sevarti, cfg: Config) -> pd.DataFrame:
    """Three signals per group, period and variable, each against the group's own past:
    layer-2 residuals (with CUSUM), share of missing data and share of rounded values.

    Placeholder codes and unit errors are already layer-1 alerts: they are left out of
    the residuals and the rounding, and a code counts as a missing datum (it means "not done")."""
    d = datos.assign(periodo=datos.t.dt.to_period(cfg.periodo).dt.start_time)
    if sev.corte is not None:
        d = d[datos.t.dt.to_period(cfg.periodo).dt.end_time <= sev.corte]
    marcas = p1.reindex(d.index)
    codigo = marcas.codigo.fillna(False).astype(bool)
    sano = ~codigo & ~marcas.unidad.fillna(False).astype(bool)
    filas = []

    s = d[sano].join(p2[['z2']]).dropna(subset=['z2', 't'])
    for var, g in s.groupby('variable'):
        fam = pd.DataFrame({'group': g.grupo, 'date': g.t})
        if not (fam.groupby(['group', g.periodo]).size() >= cfg.min_n_grupo).any():
            continue
        dr = M.group_period_drift(fam, g.z2, freq=cfg.periodo, min_n=cfg.min_n_grupo, z_alarm=cfg.z_alerta,
                                  cusum_h=cfg.cusum_h, baseline=cfg.base_periodos, cutoff=sev.corte)
        for r in dr[dr.alarma_cambio | dr.alarma_cusum].itertuples():
            filas.append(dict(grupo=r.group, periodo=r.period, variable=var, senal='residuo del contexto',
                              valor=r.mediana_z, referencia=r.nivel_propio, estadistico=r.estadistico_cambio))

    med = d[(d.rol == 'medicion') & d.etapa.notna()]
    visitas = med.groupby(['sujeto', 'etapa']).agg(grupo=('grupo', 'first'), periodo=('periodo', 'min')).reset_index()
    num_med = med[(med.tipo == 'numeric') & ~codigo.reindex(med.index)]
    presentes = num_med.groupby(['sujeto', 'etapa']).variable.agg(set)
    por_etapa = med[med.tipo == 'numeric'].groupby('etapa').variable.unique()
    partes = []
    for etapa, variables in por_etapa.items():
        v = visitas[visitas.etapa == etapa]
        tiene = v.set_index(['sujeto', 'etapa']).index.map(lambda k: presentes.get(k, set()))
        for var in variables:
            partes.append(pd.DataFrame({'grupo': v.grupo.to_numpy(), 'periodo': v.periodo.to_numpy(), 'variable': var,
                                        'falta': [var not in s_ for s_ in tiene]}))
    if partes:
        falt = pd.concat(partes).groupby(['grupo', 'periodo', 'variable']).falta.agg(k='sum', n='size').reset_index()
        for r in _cambio_proporcion(falt, cfg).query('alarma').itertuples():
            filas.append(dict(grupo=r.grupo, periodo=r.periodo, variable=r.variable, senal='datos faltantes',
                              valor=r.p, referencia=r.p_propio, estadistico=r.estadistico))

    num = d[sano & (d.tipo == 'numeric') & d.variable.isin(list(refs))].dropna(subset=['x', 'periodo'])
    res = num.variable.map({v: r.resolucion for v, r in refs.items()})
    cero = np.isclose(np.mod(np.round(num.x.abs() / res), 10), 0)
    red = num.assign(r=cero).groupby(['grupo', 'periodo', 'variable']).r.agg(k='sum', n='size').reset_index()
    for r in _cambio_proporcion(red, cfg).query('alarma').itertuples():
        filas.append(dict(grupo=r.grupo, periodo=r.periodo, variable=r.variable, senal='redondeo',
                          valor=r.p, referencia=r.p_propio, estadistico=r.estadistico))
    cols = ['grupo', 'periodo', 'variable', 'senal', 'valor', 'referencia', 'estadistico']
    return pd.DataFrame(filas, columns=cols)


# ===================================================================== the model

@dataclass
class Resultado:
    datos: pd.DataFrame       # one row per usable datum, with every layer's score
    rechazos: pd.DataFrame    # layer 0
    grupo: pd.DataFrame       # layer 4 alarms
    pares: pd.DataFrame | None = None  # layer 3: consecutive data of a subject and concept

    def alertas(self) -> pd.DataFrame:
        """One row per alert: the shared output format."""
        d = self.datos
        partes = []
        for capa, col, motivo, puntaje in ((1, 'alerta1', 'motivo1', 'z1'), (2, 'alerta2', None, 'z2'),
                                           (3, 'alerta3', 'motivo3', 'z3')):
            a = d[d[col].fillna(False).astype(bool)]
            partes.append(pd.DataFrame({
                'sujeto': a.sujeto, 'variable': a.variable, 'etapa': a.etapa, 'capa': capa,
                'motivo': a[motivo] if motivo else 'lejos de lo esperado para este caso',
                'puntaje': a[puntaje].abs(), 'p_valor': a.p2 if capa == 2 else np.nan,
                'esperado': a.esperado if capa == 2 else np.nan,
                'rango_bajo': a.rango_bajo if capa == 2 else np.nan,
                'rango_alto': a.rango_alto if capa == 2 else np.nan,
            }))
        return pd.concat(partes)

    def resumen(self) -> pd.DataFrame:
        d = self.datos
        n = int(d.tipo.eq('numeric').sum())
        filas = [dict(capa='0. Contrato', alertas=len(self.rechazos))]
        for capa, col in (('1. Valor', 'alerta1'), ('2. Contexto', 'alerta2'), ('3. Trayectoria', 'alerta3')):
            k = int(d[col].fillna(False).astype(bool).sum())
            filas.append(dict(capa=capa, alertas=k, por_1000=1000 * k / max(n, 1)))
        filas.append(dict(capa='4. Grupo y tiempo', alertas=len(self.grupo)))
        return pd.DataFrame(filas).set_index('capa')


@dataclass
class ModeloAnomalias:
    cfg: Config = field(default_factory=Config)
    refs1: dict[str, RefValor] = field(default_factory=dict)
    refs3: dict[str, RefTransicion] = field(default_factory=dict)
    capa2: dict[str, Capa2Variable] = field(default_factory=dict)
    matriz: Matriz | None = None
    mascara: pd.DataFrame | None = None
    omitidas: dict[str, str] = field(default_factory=dict)
    version: str = ''

    # ---------------------------------------------------------------- training
    def _x_limpio(self, datos: pd.DataFrame, sev: Sevarti) -> tuple[pd.Series, pd.Series]:
        p1 = puntuar_valor(datos, self.refs1, sev.esquema, self.cfg)
        excl = mascara_base(datos, p1, self.cfg)
        return datos.x.where(~datos.index.isin(excl.index)), excl

    def ajustar(self, entrenamiento: Sevarti, calibracion: Sevarti, solo_nuevas: bool = False,
                progreso: bool = False) -> ModeloAnomalias:
        """Fit every layer on the training split and calibrate layer 2 on the calibration split.

        With ``solo_nuevas`` the existing layer-2 models are kept and only variables
        without a model are trained (a variable added by the experts)."""
        cfg = self.cfg
        datos, _ = preparar(entrenamiento)
        nuevas_refs = ajustar_valor(datos, entrenamiento.esquema, cfg)
        self.refs1 = (nuevas_refs | self.refs1) if solo_nuevas else nuevas_refs
        x, excl = self._x_limpio(datos, entrenamiento)
        self.refs3 = ajustar_trayectoria(datos, x, entrenamiento.etapas, cfg) | (self.refs3 if solo_nuevas else {})
        if self.matriz is None or not solo_nuevas:
            self.matriz = Matriz(cfg).ajustar(datos, entrenamiento)
        mats = self.matriz.construir(datos, entrenamiento, x)

        dcal, _ = preparar(calibracion)
        xcal, _ = self._x_limpio(dcal, calibracion)
        mats_cal = self.matriz.construir(dcal, calibracion, xcal)

        mascara = [pd.DataFrame({'fila': excl.index, 'motivo': excl.to_numpy()})]
        if not solo_nuevas:
            self.capa2, self.omitidas = {}, {}
        objetivos = datos[(datos.tipo == 'numeric')].groupby('variable').sujeto.nunique()
        pendientes = [(var, n) for var, n in objetivos.items() if var not in self.capa2]
        filas_var, filas_cal = datos.groupby('variable').indices, dcal.groupby('variable').indices

        def preparar_var(var: str, n_suj: int) -> tuple:
            if n_suj < cfg.min_sujetos:
                return var, f'{n_suj} sujetos (necesita {cfg.min_sujetos})', None
            X = Matriz.filas(datos.iloc[filas_var[var]], mats, var)
            y = x.reindex(X.index)
            ok = y.notna()
            X, y = X[ok], y[ok]
            if ok.sum() < cfg.min_sujetos:
                return var, f'{int(ok.sum())} valores limpios (necesita {cfg.min_sujetos})', None
            Xc = yc = None
            if var in filas_cal:
                Xc = Matriz.filas(dcal.iloc[filas_cal[var]], mats_cal, var)
                yc = xcal.reindex(Xc.index)
                okc = yc.notna()
                Xc, yc = Xc[okc], yc[okc]
            return var, '', (X, y, Xc, yc)

        # One variable at a time, in the main thread: LightGBM's training loop runs in Python round
        # by round, and measured here it is several times slower from worker threads.
        for i, (var, n_suj) in enumerate(pendientes, start=1):
            var, motivo, datos_var = preparar_var(var, n_suj)
            if datos_var is None:
                self.omitidas[var] = motivo
            else:
                paso = self.refs1[var].resolucion if var in self.refs1 else 0.0
                m, quitadas = _entrenar_variable((var, *datos_var, cfg, paso))
                self.capa2[var] = m
                if len(quitadas):
                    mascara.append(pd.DataFrame({'fila': quitadas, 'motivo': 'segunda vuelta'}))
            if progreso and (i % 20 == 0 or i == len(pendientes)):
                print(f'capa 2: {i}/{len(pendientes)} variables', flush=True)
        filas = pd.concat(mascara)
        filas = filas.assign(sujeto=datos.sujeto.reindex(filas.fila).to_numpy(),
                             variable=datos.variable.reindex(filas.fila).to_numpy())
        filas = filas[['sujeto', 'variable', 'motivo']]
        if solo_nuevas and self.mascara is not None:  # keep the second-pass exclusions of existing models
            filas = pd.concat([self.mascara, filas]).drop_duplicates()
        self.mascara = filas.reset_index(drop=True)
        self.version = self._version(entrenamiento)
        return self

    def sin_variable(self, variable: str) -> ModeloAnomalias:
        """Copy of the model that has never learned ``variable``: to check how a new one is handled."""
        return replace(self, refs1={k: v for k, v in self.refs1.items() if k != variable},
                       capa2={k: v for k, v in self.capa2.items() if k != variable},
                       omitidas=dict(self.omitidas))

    def _version(self, sev: Sevarti) -> str:
        h = hashlib.sha1()
        h.update(VERSION_CODIGO.encode())
        h.update(json.dumps(asdict(self.cfg), sort_keys=True, default=str).encode())
        h.update(pd.util.hash_pandas_object(sev.esquema.astype(str), index=False).values.tobytes())
        h.update(pd.util.hash_pandas_object(pd.Series(sorted(map(str, sev.sujetos.sujeto))), index=False)
                 .values.tobytes())
        h.update(pd.util.hash_pandas_object(self.mascara.astype(str), index=False).values.tobytes())
        return h.hexdigest()[:10]

    def guardar_mascara(self, carpeta: Path) -> Path:
        """The training exclusions, versioned. Pseudonymized ids and variable names only, never values."""
        carpeta.mkdir(parents=True, exist_ok=True)
        ruta = carpeta / f'mascara_{self.version}.csv.gz'
        self.mascara.to_csv(ruta, index=False)
        return ruta

    # ----------------------------------------------------------------- scoring
    def puntuar(self, sev: Sevarti) -> Resultado:
        cfg = self.cfg
        datos, rechazos = preparar(sev)
        p1 = puntuar_valor(datos, self.refs1, sev.esquema, cfg)
        excl = mascara_base(datos, p1, cfg)
        x = datos.x.where(~datos.index.isin(excl.index))
        mats = self.matriz.construir(datos, sev, x)
        codigo = p1.codigo.reindex(datos.index).fillna(False).astype(bool)

        y_todo = datos.x.where(~codigo)  # a known code means "not done": nothing to score
        filas_var = datos.groupby('variable').indices

        def preparar_var(var: str) -> tuple[pd.DataFrame, np.ndarray]:
            X = Matriz.filas(datos.iloc[filas_var[var]], mats, var)
            y = y_todo.reindex(X.index)
            ok = y.notna().to_numpy()
            return X[ok], y[ok].to_numpy()

        def puntuar_var(m: Capa2Variable, X: pd.DataFrame, y: np.ndarray) -> pd.DataFrame:
            z, esperado, escala = _residuo(m, X, y)
            if m.calibrada:
                n = m.cal.size
                p = (1 + n - np.searchsorted(m.cal, np.abs(z), side='left')) / (n + 1)
                umbral = float(np.quantile(m.cal, 1 - cfg.alpha))
                alerta = p <= cfg.alpha
            else:  # too few calibration data for the target rate: plain robust threshold
                p, umbral = np.full(len(z), np.nan), cfg.z_alerta
                alerta = np.abs(z) > cfg.z_alerta
            return pd.DataFrame({'z2': z, 'p2': p, 'alerta2': alerta, 'esperado': esperado, 'escala2': escala,
                                 'rango_bajo': esperado - umbral * escala,
                                 'rango_alto': esperado + umbral * escala}, index=X.index)

        partes = [puntuar_var(m, *preparar_var(var)) for var, m in self.capa2.items() if var in filas_var]
        p2 = pd.concat(partes) if partes else pd.DataFrame(
            columns=['z2', 'p2', 'alerta2', 'esperado', 'escala2', 'rango_bajo', 'rango_alto'])

        x3 = datos.x.where(~p1.reindex(datos.index)[['codigo', 'unidad']].fillna(False).any(axis=1))
        p3, pares = puntuar_trayectoria(datos, x3, sev, self.refs3, cfg)
        out = datos.join(p1).join(p2).join(p3)
        for col in ('alerta1', 'alerta2', 'alerta3'):
            out[col] = out[col].fillna(False).astype(bool)
        grupo = puntuar_grupo(datos, p1, p2, self.refs1, sev, cfg)
        return Resultado(out, rechazos, grupo, pares)

    # ---------------------------------------------------------------- reports
    def tabla_capa2(self) -> pd.DataFrame:
        filas = [dict(variable=v, n_entrenamiento=m.n_entrenamiento, quitados_segunda_vuelta=m.n_segunda_vuelta,
                      n_calibracion=m.cal.size,
                      umbral_z=float(np.quantile(m.cal, 1 - self.cfg.alpha)) if m.calibrada else np.nan,
                      arboles=int(np.mean([b.best_iteration or b.num_trees() for b in m.modelos])))
                 for v, m in self.capa2.items()]
        return pd.DataFrame(filas).set_index('variable')

    def estrechez(self, res: Resultado) -> pd.DataFrame:
        """How much the context narrows the expected range: layer-2 scale against the scale of
        the variable alone, on the data that pass the cleaning rules."""
        d = res.datos.loc[limpias(self, res.datos, res.datos)].dropna(subset=['escala2'])
        filas = []
        for var, g in d.groupby('variable'):
            _, sola = _escala_robusta(g.x)
            if sola > 0:
                filas.append(dict(variable=var, n=len(g), escala_sola=sola, escala_contexto=g.escala2.median(),
                                  pct_del_rango=100 * g.escala2.median() / sola))
        return pd.DataFrame(filas).set_index('variable')

    def importancia(self, variable: str, top: int = 12) -> pd.Series:
        m = self.capa2[variable]
        b = m.modelos[1]
        imp = pd.Series(b.feature_importance('gain'), index=b.feature_name())
        return (imp / imp.sum()).sort_values(ascending=False).head(top)


# ================================================================== evaluation

def dividir_por_tiempo(sev: Sevarti, fracciones: tuple[float, float, float] = (0.7, 0.15, 0.15)
                       ) -> tuple[Sevarti, Sevarti, Sevarti, pd.DataFrame]:
    """Train, calibration and test by birth date (or year), with no subject in two splits.

    The split is made inside each recording regime (between known breaks): the most
    recent births of every regime go to test and the ones before them to calibration.
    A plain cut by date would leave the newest regime out of training, and a break
    can only enter the model as a feature if training has data on both sides of it.
    """
    suj = sev.sujetos.drop_duplicates('sujeto')
    suj = suj.assign(nac=nacimiento_referencia(suj)).dropna(subset=['nac'])
    cortes = sorted(pd.to_datetime(sev.quiebres.fecha))
    regimen = np.searchsorted(np.array(cortes, dtype='datetime64[ns]'), suj.nac.to_numpy(), side='right')
    partes: list[list[pd.DataFrame]] = [[], [], []]
    for _, g in suj.groupby(regimen):
        # whole birth dates (or whole years, when only the year is known) go to one part, by where
        # the middle of their block falls in the regime's time order: ties never straddle a cut
        n = g.nac.value_counts().sort_index()
        medio = (n.cumsum() - n / 2) / n.sum()
        parte = np.select([medio < fracciones[0], medio < fracciones[0] + fracciones[1]], [0, 1], 2)
        cual = g.nac.map(pd.Series(parte, index=n.index))
        for i in range(3):
            partes[i].append(g[cual == i])
    unidas = [pd.concat(p) for p in partes]
    info = pd.DataFrame({
        'sujetos': [len(p) for p in unidas],
        'regimenes': [len(p) for p in partes],
    }, index=['entrenamiento', 'calibración', 'prueba'])
    tr, ca, te = (sev.subconjunto(p.sujeto) for p in unidas)
    return tr, ca, te, info


def limpias(modelo: ModeloAnomalias, datos: pd.DataFrame, p1: pd.DataFrame) -> pd.Index:
    """Numeric data that pass the training cleaning rules: the base for injected errors."""
    excl = mascara_base(datos, p1, modelo.cfg).index
    return datos.index[(datos.tipo == 'numeric') & ~datos.index.isin(excl) & datos.variable.isin(list(modelo.refs1))]


TIPOS_ERROR = ('unidad', 'código', 'dígitos', 'desvío de 3 DE', 'valor de otro sujeto', 'etapas intercambiadas')


def _digitos(v: float, rng: np.random.Generator) -> float:
    s = str(int(round(abs(v))))
    if len(s) < 2:
        return np.nan
    i = int(rng.integers(0, len(s) - 1))
    t = s[:i] + s[i + 1] + s[i] + s[i + 2:]
    out = float(t) * np.sign(v)
    return np.nan if out == round(v) else out


def inyectar_errores(modelo: ModeloAnomalias, sev: Sevarti, tasa: float = 0.02, semilla: int = 11
                     ) -> tuple[Sevarti, pd.DataFrame]:
    """Known errors on clean test data: about ``tasa`` of the clean numeric data, split
    evenly among the error types. Returns the modified data and the truth table (row, type)."""
    rng = np.random.default_rng(semilla)
    datos, _ = preparar(sev)
    p1 = puntuar_valor(datos, modelo.refs1, sev.esquema, modelo.cfg)
    sanas = limpias(modelo, datos, p1)
    med = sev.mediciones.copy()
    med['valor'] = med.valor.astype(object)
    usadas: set = set()
    verdad = []

    def elegir(pool: pd.Index, k: int) -> np.ndarray:
        pool = pool[~pool.isin(list(usadas))]
        out = rng.choice(pool, size=min(k, len(pool)), replace=False) if len(pool) else np.array([])
        usadas.update(out.tolist())
        return out

    d = datos.loc[sanas]
    por_tipo = max(1, int(tasa * len(d) / len(TIPOS_ERROR)))
    por_variable = {v: g.to_numpy() for v, g in d.groupby('variable').groups.items()}
    for tipo in TIPOS_ERROR[:-1]:
        for fila in elegir(d.index, por_tipo):
            v, var = d.x[fila], d.variable[fila]
            ref = modelo.refs1[var]
            if tipo == 'unidad':
                nuevo = v * rng.choice([10.0, 0.1] + ([0.001] if v > 500 else []))
            elif tipo == 'código':
                nuevo = float(rng.choice([-1.0, 999.0, 9999.0]))
            elif tipo == 'dígitos':
                nuevo = _digitos(v, rng)
            elif tipo == 'desvío de 3 DE':
                signo = rng.choice([-1, 1])
                nuevo = _desde_z(float(_z(np.array([v]), ref)[0]) + signo * 3, ref)
                nuevo = round(nuevo / ref.resolucion) * ref.resolucion  # a value the variable can take
            else:  # a random datum of the same variable; skipped when it is the same subject's
                otra = rng.choice(por_variable[var])
                nuevo = float(d.x[otra]) if d.sujeto[otra] != d.sujeto[fila] else np.nan
            if np.isfinite(nuevo) and nuevo != v:
                med.loc[fila, 'valor'] = nuevo
                verdad.append((fila, tipo))
    p = _pares(d, d.x, sev.etapas)
    p = p[(p.dias > 0) & (p.delta != 0) & ~p.fila_a.isin(list(usadas)) & ~p.fila_b.isin(list(usadas))]
    p = p.drop_duplicates('fila_a').drop_duplicates('fila_b')
    p = p[~p.fila_a.isin(p.fila_b)]
    for r in p.sample(min(max(1, por_tipo // 2), len(p)), random_state=semilla).itertuples():
        a, b = med.loc[r.fila_a, 'valor'], med.loc[r.fila_b, 'valor']
        med.loc[r.fila_a, 'valor'], med.loc[r.fila_b, 'valor'] = b, a
        verdad += [(r.fila_a, 'etapas intercambiadas'), (r.fila_b, 'etapas intercambiadas')]
        usadas.update([r.fila_a, r.fila_b])
    verdad = pd.DataFrame(verdad, columns=['fila', 'tipo']).set_index('fila')
    return replace(sev, mediciones=med), verdad


BASE_COMPARACION = 'rango del diccionario'


def fuera_de_rango(datos: pd.DataFrame, esquema: pd.DataFrame) -> pd.Series:
    """The check the source already runs: outside the declared range. The model never uses
    it; it is the baseline the model has to beat."""
    e = esquema.set_index('variable')
    lo = datos.variable.map(e.rango_min).astype(float)
    hi = datos.variable.map(e.rango_max).astype(float)
    return (datos.tipo == 'numeric') & ((datos.x < lo) | (datos.x > hi))


def _capas(d: pd.DataFrame, esquema: pd.DataFrame) -> pd.DataFrame:
    c = pd.DataFrame({'1. Valor': d.alerta1, '2. Contexto': d.alerta2, '3. Trayectoria': d.alerta3})
    c['cualquiera'] = c.any(axis=1)
    c[BASE_COMPARACION] = fuera_de_rango(d, esquema)
    return c


ALPHAS = (0.001, 0.002, 0.005, 0.01, 0.02, 0.05)


@dataclass
class Evaluacion:
    recall: pd.DataFrame   # % of injected errors found, per type and layer
    falsas: pd.DataFrame   # alerts per 1,000 clean data, per layer
    curva: pd.DataFrame    # per layer-2 alpha: workload against errors found
    base: Resultado        # score of the untouched test split


def _alerta2(d: pd.DataFrame, alpha: float) -> np.ndarray:
    """Layer-2 alert at another target rate. Uncalibrated variables keep their plain threshold."""
    return np.where(d.p2.notna(), d.p2 <= alpha, d.alerta2.fillna(False).astype(bool))


def _curva(sanas: pd.DataFrame, inyectadas: pd.DataFrame, alphas: tuple[float, ...]) -> pd.DataFrame:
    filas = []
    for a in alphas:
        limpias_alerta = sanas.alerta1 | _alerta2(sanas, a) | sanas.alerta3
        encontrados = inyectadas.alerta1 | _alerta2(inyectadas, a) | inyectadas.alerta3
        filas.append({'alpha': a, 'capa 2 por 1.000 limpios': 1000 * _alerta2(sanas, a).mean(),
                      'total por 1.000 limpios': 1000 * limpias_alerta.mean(),
                      'errores encontrados (%)': 100 * encontrados.mean()})
    return pd.DataFrame(filas).set_index('alpha')


def evaluar(modelo: ModeloAnomalias, prueba: Sevarti, rondas: int = 3, tasa: float = 0.02,
            base: Resultado | None = None, alphas: tuple[float, ...] = ALPHAS) -> Evaluacion:
    """Recall per error type and layer, and alerts per 1,000 clean data, next to the
    dictionary-range check as a baseline; plus how both move with the layer-2 target
    rate, read from the same scores (nothing is scored again).

    Alerts on clean data are measured on the test split as it is, without injected
    errors, so an injected error cannot spoil its neighbours' inputs. They are an upper
    bound of false alerts: the clean data still hold real errors nobody labelled.
    Recall pools several rounds of injected errors at a low rate (``tasa``). ``base`` is the
    score of the untouched test split, when it is already computed."""
    base = base if base is not None else modelo.puntuar(prueba)
    d = base.datos
    sanas = d.loc[limpias(modelo, d, d)]
    falsas = (1000 * _capas(sanas, prueba.esquema).mean()).to_frame('alertas por 1.000 datos limpios').T
    partes, puntajes = [], []
    for r in range(rondas):
        sucio, verdad = inyectar_errores(modelo, prueba, tasa=tasa, semilla=11 + r)
        res = modelo.puntuar(sucio)
        partes.append(verdad.join(_capas(res.datos, prueba.esquema), how='left').fillna(False))
        puntajes.append(verdad.join(res.datos[['alerta1', 'alerta2', 'alerta3', 'p2']], how='left'))
    v = pd.concat(partes)
    columnas = ['1. Valor', '2. Contexto', '3. Trayectoria', 'cualquiera', BASE_COMPARACION]
    recall = 100 * v.groupby('tipo')[columnas].mean()
    recall.insert(0, 'errores', v.groupby('tipo').size())
    recall = recall.reindex([t for t in TIPOS_ERROR if t in recall.index])
    inyectadas = pd.concat(puntajes)
    for c in ('alerta1', 'alerta2', 'alerta3'):
        inyectadas[c] = inyectadas[c].fillna(False).astype(bool)
    return Evaluacion(recall, falsas, _curva(sanas, inyectadas, alphas), base)


def inyectar_sesgo(sev: Sevarti, variable: str, grupo: object, desde: pd.Timestamp, sesgo: float) -> Sevarti:
    """A group's instrument starts adding ``sesgo`` to a variable from a date on."""
    med = sev.mediciones.copy()
    datos, _ = preparar(sev)
    filas = datos.index[(datos.variable == variable) & (datos.grupo == grupo) & (datos.t >= desde)]
    med['valor'] = med.valor.astype(object)
    med.loc[filas, 'valor'] = pd.to_numeric(med.loc[filas, 'valor']) + sesgo
    return replace(sev, mediciones=med)
