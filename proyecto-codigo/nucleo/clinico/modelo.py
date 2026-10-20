"""Clinical early warning on SEVARTI data: who is heading to a bad outcome.

Everything programme-specific (which outcomes, at which visit, how each is read, which growth
measures, which codes mean what) comes in a ``ConfigClinica`` that ``configuracion.py`` reads from
the experts' variable dictionary; the engine knows none of it. It reuses the generic
pieces: SEVARTI as input, the anomaly model's cleaning rules (codes, unit errors and values
beyond 6 MAD enter as missing) and its time split.

Two kinds of signal:
* growth against an external reference (a clinical rule: it does not learn what is normal here);
* risk of an outcome: one LightGBM classifier per outcome, fitted on what is known at the
  visit where the risk is computed and nothing recorded later, with calibrated probabilities.

The model gives, for every child, the probability, its position among the children the model
was calibrated on, and the reasons. It never decides how many children are shown: that is up to
whoever presents the risks (the app).
"""
from __future__ import annotations

import hashlib
import json
import pickle
from dataclasses import asdict, dataclass, field
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from anomalias import modelo as MA
from archivos import carpetas as CA
from archivos.libros import valor_legible
from clinico import crecimiento as CR
from sevarti.contrato import Sevarti, etiquetas_categoria, nacimiento_referencia, nombres_etapa

VERSION_CODIGO = '4'
REGLAS = ('mayor_que_cero', 'en_codigos', 'percentil_bajo', 'no_vuelve', 'z_bajo')


@dataclass(frozen=True)
class Desenlace:
    clave: str             # short id, used in files and columns
    nombre: str            # what the alert says
    momento: str           # stage (visit) at which the risk is computed
    regla: str             # how the outcome is read from the data (REGLAS)
    variable: str | None = None
    codigos: tuple[float, ...] = ()   # en_codigos: values that mean the outcome happened
    negativos: tuple[float, ...] = () # en_codigos: values that mean it did not; any other ("no hay dato",
                                      # stray codes) is unknown. Empty: every other value is a no
                                      # (models saved before this field)
    percentil: float = 0.10           # percentil_bajo: below this share of the training data
    solo_desde: str | None = None     # a known break: only children born after it (the outcome
                                      # was recorded differently before)
    concepto: str | None = None       # z_bajo: growth measure (a Medida's nombre) under its z_bajo SD...
    etapa: str | None = None          # z_bajo: ...at this later visit
    comparar: tuple[str, ...] = ()    # the simple rule the model is measured against: these inputs only


@dataclass(frozen=True)
class ConfigClinica:
    desenlaces: tuple[Desenlace, ...]
    sexo: str                          # schema variable with the sex at birth
    codigos_sexo: tuple[tuple[str, int], ...]  # raw value -> 1 (male) / 2 (female) of the reference
    medidas: tuple[CR.Medida, ...]
    etapas_crecimiento: tuple[str, ...]  # stages where the external reference applies
    descartados: tuple[tuple[str, str], ...] = ()   # what the dictionary asks for and cannot be used, and why
    rondas: int = 600
    tasa: float = 0.05
    hojas: int = 31
    min_hoja: int = 50
    hilos: int = 8
    semilla: int = 11
    # 'cuda' with a CUDA build of LightGBM (MAIA_LGBM_DEVICE); what it cannot train falls back to CPU
    dispositivo: str = field(default_factory=lambda: MA.dispositivo_lgb())
    min_casos: int = 30                  # an outcome needs this many events to be modelled
    dias_recientes: int = 90             # visits this close to the cut tell which variables arrive late
    fraccion_calibracion: float = 0.15   # most recent children with a known outcome, to set the level
    fraccion_alta: float = 0.10          # measurement only: cases among this share with the highest risk
                                         # (model against the simple rule, clinicians' sheet); not an alert rule


# ======================================================================= metrics

def auc(y: np.ndarray, p: np.ndarray) -> float:
    y = np.asarray(y, dtype=bool)
    n1, n0 = int(y.sum()), int((~y).sum())
    if not n1 or not n0:
        return np.nan
    r = pd.Series(p).rank().to_numpy()
    return float((r[y].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def precision_promedio(y: np.ndarray, p: np.ndarray) -> float:
    y = np.asarray(y, dtype=bool)
    if not y.any():
        return np.nan
    orden = np.argsort(-np.asarray(p))
    aciertos = np.cumsum(y[orden])
    return float(np.mean((aciertos / np.arange(1, len(y) + 1))[y[orden]]))


def isotonica(p: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Isotonic calibration (pool adjacent violators): knots to read with ``np.interp``."""
    o = np.argsort(p)
    p, y = np.asarray(p, dtype=float)[o], np.asarray(y, dtype=float)[o]
    valores, pesos, lo, hi = [], [], [], []
    for pi, yi in zip(p, y):
        valores.append(yi), pesos.append(1.0), lo.append(pi), hi.append(pi)
        while len(valores) > 1 and valores[-2] > valores[-1]:
            w = pesos[-2] + pesos[-1]
            v = (valores[-2] * pesos[-2] + valores[-1] * pesos[-1]) / w
            valores[-2:], pesos[-2:], lo[-2:], hi[-2:] = [v], [w], [lo[-2]], [hi[-1]]
    xs = np.ravel(np.column_stack([lo, hi]))
    ys = np.repeat(valores, 2)
    return xs, ys


# ======================================================================== model

@dataclass
class ModeloDesenlace:
    desenlace: Desenlace
    columnas: list[str]
    modelo: lgb.Booster
    calibracion: tuple[np.ndarray, np.ndarray]
    columnas_base: list[str]
    base: lgb.Booster | None
    calibracion_base: tuple[np.ndarray, np.ndarray] | None
    puntajes_calibracion: np.ndarray   # the model's own score on the calibration children, sorted
    corte_variable: float    # percentil_bajo: value under which the outcome counts
    n_entrenamiento: int
    casos_entrenamiento: int
    calibrado_con: str = ''   # the children the level was set on

    def puntaje(self, X: pd.DataFrame) -> np.ndarray:
        return self.modelo.predict(X.reindex(columns=self.columnas))

    def riesgo(self, X: pd.DataFrame, base: bool = False) -> np.ndarray:
        if base:
            crudo = self.base.predict(X.reindex(columns=self.columnas_base))
            return np.interp(crudo, *self.calibracion_base)
        return np.interp(self.puntaje(X), *self.calibracion)

    def percentil(self, X: pd.DataFrame) -> np.ndarray:
        """Position (0-100) of each child among the calibration children, on the model's score.
        On the score, not on the calibrated risk: calibration is a step function and many
        children share a step, so the risk alone does not order them."""
        ref, s = self.puntajes_calibracion, self.puntaje(X)
        menores = np.searchsorted(ref, s, side='left') + np.searchsorted(ref, s, side='right')
        return 100 * menores / (2 * len(ref))


def _nombre(c: str) -> str:
    return MA._nombre(c)


@dataclass
class Preparado:
    """A SEVARTI set read once: cleaned long table, sex, growth z-scores."""
    sev: Sevarti
    datos: pd.DataFrame
    x: pd.Series
    sexo: pd.Series
    z: pd.DataFrame


@dataclass
class ModeloClinico:
    cfg: ConfigClinica
    refs1: dict = field(default_factory=dict)          # anomaly-model layer-1 references, for cleaning
    niveles: dict[str, list[str]] = field(default_factory=dict)
    modelos: dict[str, ModeloDesenlace] = field(default_factory=dict)
    omitidos: dict[str, str] = field(default_factory=dict)
    etiquetas: dict[str, str] = field(default_factory=dict)   # sanitized column -> readable name
    categorias: dict[str, dict[float, str]] = field(default_factory=dict)   # sanitized column -> code labels
    tardias: list[str] = field(default_factory=list)          # variables filled in late: not used
    version: str = ''

    # ------------------------------------------------------------ reading data
    def falta(self, sev: Sevarti, des: Desenlace, con_variable: bool = True) -> str | None:
        """What an outcome needs that ``sev`` does not bring, said for the experts who keep the
        variable dictionary: its visit, its break, and to learn it (``con_variable``) its variable."""
        if des.momento not in set(sev.etapas.etapa):
            return f'la visita "{des.momento}" no está en los datos (falta en la hoja Visitas del diccionario de variables)'
        if des.solo_desde is not None and des.solo_desde not in set(sev.quiebres.quiebre):
            return f'el quiebre "{des.solo_desde}" no está en los datos (falta en la hoja Quiebres del diccionario de variables)'
        if con_variable and des.variable and des.variable not in set(sev.esquema.variable):
            return f'la variable {des.variable} no está en los datos (en el diccionario de variables debe estar en estado "Lista")'
        if con_variable and des.regla == 'z_bajo':
            return self._falta_crecimiento(sev, des)
        return None

    def _falta_crecimiento(self, sev: Sevarti, des: Desenlace) -> str | None:
        if des.etapa not in set(sev.etapas.etapa):
            return f'la visita "{des.etapa}" no está en los datos (falta en la hoja Visitas del diccionario de variables)'
        orden = sev.etapas.set_index('etapa').orden
        if orden[des.momento] >= orden[des.etapa]:
            return f'el riesgo se calcula en "{des.momento}", que no es antes de "{des.etapa}"'
        medidas = {m.nombre: m for m in self.cfg.medidas}
        if des.concepto not in medidas or des.etapa not in self.cfg.etapas_crecimiento:
            return f'"{des.concepto}" en "{des.etapa}" no es una medida de crecimiento de la configuración'
        m = medidas[des.concepto]
        faltan = {m.concepto, m.por_talla} - {None} - set(sev.esquema.concepto.dropna())
        if faltan:
            return (f'ninguna variable mide {", ".join(sorted(faltan))} '
                    f'(columna "Qué mide" del diccionario de variables)')
        return None

    def sin_datos(self, sev: Sevarti) -> dict[str, str]:
        """The trained outcomes whose risk ``sev`` cannot give, with why."""
        return {c: r for c, m in self.modelos.items() if (r := self.falta(sev, m.desenlace, con_variable=False))}

    def preparar(self, sev: Sevarti) -> Preparado:
        if self.cfg.sexo not in set(sev.esquema.variable):
            raise ValueError(f'La variable de sexo {self.cfg.sexo} no está en los datos: sin ella no se calcula el '
                             f'crecimiento. En el diccionario de variables debe estar en estado "Lista".')
        datos, _ = MA.preparar(sev)
        cfg_a = MA.Config()
        refs = self.refs1 or MA.ajustar_valor(datos, sev.esquema, cfg_a)
        p1 = MA.puntuar_valor(datos, refs, sev.esquema, cfg_a)
        excl = MA.mascara_base(datos, p1, cfg_a)
        x = datos.x.where(~datos.index.isin(excl.index))
        mapa = dict(self.cfg.codigos_sexo)
        s = datos[datos.variable == self.cfg.sexo].drop_duplicates('sujeto').set_index('sujeto').valor
        sexo = s.astype(str).str.replace(r'\.0$', '', regex=True).map(mapa)
        z = CR.puntajes_z(datos, x, sexo, self.cfg.medidas, CR.leer_referencia(), set(self.cfg.etapas_crecimiento))
        return Preparado(sev, datos, x, sexo, z)

    def _variables_tardias(self, sev: Sevarti, datos: pd.DataFrame) -> list[str]:
        """Visit variables the source fills in late, months later or only when the child comes
        to the next visit: the recent visits (the last months', and the children still waiting
        for their next visit, the ones alerts are for) hold them in under half the share the
        earlier ones do, and that share would have put at least ``min_casos`` of them there.
        At alert time they are still missing, so a model that used them would read "missing"
        as a risk; when the source fills them at the next visit, their presence even gives
        the outcome away."""
        if sev.corte is None:
            return []
        tardias = []
        for etapa, d in datos[datos.etapa.notna()].groupby('etapa'):
            visita = d[d.t.notna()].groupby('sujeto').t.median()
            reciente = visita.index[(visita >= sev.corte - pd.Timedelta(days=self.cfg.dias_recientes)).to_numpy()]
            reciente = reciente.union(self._esperando(sev, datos, etapa))
            antes = visita.index.difference(reciente)
            if len(reciente) < 30 or len(antes) < 30:
                continue
            tiene = d.groupby('variable').sujeto.agg(lambda s: set(s))
            for var, quienes in tiene.items():
                p_antes = len(quienes & set(antes)) / len(antes)
                p_rec = len(quienes & set(reciente)) / len(reciente)
                if p_antes * len(reciente) >= self.cfg.min_casos and p_rec < 0.5 * p_antes:
                    tardias.append(var)
        return sorted(tardias)

    def detectar_tardias(self, sev: Sevarti) -> list[str]:
        """Late-filled variables, read on the whole base: it is a property of how the source
        records, not of the outcomes, and the latest visits may all sit in the test split."""
        datos, _ = MA.preparar(sev)
        return self._variables_tardias(sev, datos)

    def _orden(self, sev: Sevarti) -> pd.Series:
        return sev.etapas.set_index('etapa').orden

    def asistieron(self, p: Preparado, etapa: str) -> pd.Index:
        """Children who came to a visit: a datum of that stage with a known date. A source may
        fill a count with 0 for a visit that never happened; a dated datum is a visit."""
        d = p.datos
        return pd.Index(d.loc[(d.etapa == etapa) & d.t.notna(), 'sujeto'].unique())

    def matriz(self, p: Preparado, momento: str) -> pd.DataFrame:
        """One row per subject who attended ``momento``: everything known at that visit or
        before it (stages in schema order), growth z-scores up to it, and nothing later."""
        orden = self._orden(p.sev)
        hasta = orden[momento]
        d = p.datos[(p.datos.etapa.map(orden) <= hasta) | p.datos.etapa.isna()]
        sujetos = self.asistieron(p, momento)
        d = d[d.sujeto.isin(sujetos)]
        num = d[d.tipo == 'numeric'].assign(x=p.x.reindex(d.index))
        X = num.pivot_table(index='sujeto', columns='variable', values='x', aggfunc='first').reindex(sujetos)
        cat = d[d.variable.isin(list(self.niveles))]
        ancho = cat.assign(v=cat.valor.astype(str)).pivot_table(index='sujeto', columns='variable', values='v',
                                                                 aggfunc='first') if len(cat) else pd.DataFrame()
        visibles = {v for v, e in p.sev.esquema.set_index('variable').etapa.items()
                    if not isinstance(e, str) or orden.get(e, np.inf) <= hasta}
        for var in self.niveles:  # always the same categorical columns, even when a group lacks one
            if var in visibles:
                valores = ancho[var].reindex(X.index) if var in ancho else pd.Series(np.nan, index=X.index)
                X[var] = pd.Categorical(valores, categories=self.niveles[var])
        z = p.z[p.z.etapa.map(orden) <= hasta]
        if len(z):
            zz = z.assign(col='z_' + z.concepto + '_' + z.etapa).pivot_table(index='sujeto', columns='col',
                                                                              values='z', aggfunc='first')
            X = X.join(zz)
        suj = p.sev.sujetos.drop_duplicates('sujeto').set_index('sujeto')
        X['eg_semanas'] = suj.eg_semanas.reindex(X.index).astype(float)
        nac = nacimiento_referencia(suj).reindex(X.index)
        for nombre, fecha in zip(p.sev.quiebres.quiebre, p.sev.quiebres.fecha):
            X[f'quiebre_{nombre}'] = (nac >= pd.Timestamp(fecha)).astype(float).where(nac.notna())
        X.columns = [_nombre(c) for c in X.columns]
        return X.loc[:, ~X.columns.duplicated()]

    # ------------------------------------------------------------- outcomes
    def _poblacion(self, p: Preparado, des: Desenlace) -> pd.Index:
        sujetos = self.asistieron(p, des.momento)
        if des.solo_desde is not None:
            q = p.sev.quiebres.set_index('quiebre').fecha
            nac = nacimiento_referencia(p.sev.sujetos.drop_duplicates('sujeto').set_index('sujeto'))
            sujetos = sujetos[(nac.reindex(sujetos) >= pd.Timestamp(q[des.solo_desde])).to_numpy()]
        return sujetos

    def etiqueta(self, p: Preparado, des: Desenlace, corte_variable: float = np.nan) -> pd.Series:
        """1 / 0 per subject who attended the outcome's visit; missing when it is not known
        (the child did not come back, or the window to come back is still open)."""
        sujetos = self._poblacion(p, des)
        if des.regla == 'no_vuelve':
            return self._no_vuelve(p, des, sujetos)
        if des.regla == 'z_bajo':   # known for children measured at that visit; an implausible z is a data error
            z = p.z[(p.z.concepto == des.concepto) & (p.z.etapa == des.etapa) & (p.z.z.abs() <= CR.Z_IMPROBABLE)]
            z = z.groupby('sujeto').z.first()
            limite = next((m.z_bajo for m in self.cfg.medidas if m.nombre == des.concepto), CR.Z_BAJO)
            return (z < limite).astype(float).reindex(sujetos)
        d = p.datos[p.datos.variable == des.variable].drop_duplicates('sujeto').set_index('sujeto')
        # the outcome is known only for children who came to the visit where it is recorded
        etapa_var = p.sev.esquema.set_index('variable').etapa.get(des.variable)
        vino = self.asistieron(p, etapa_var) if isinstance(etapa_var, str) else d.index
        if des.regla == 'mayor_que_cero':
            v = p.x.reindex(p.datos.index[p.datos.variable == des.variable])
            v.index = p.datos.sujeto[v.index]
            v = v[~v.index.duplicated()]
            y = (v > 0).astype(float).where(v.notna())
        elif des.regla == 'en_codigos':
            v = pd.to_numeric(d.valor, errors='coerce')
            conocido = v.isin(des.codigos + des.negativos) if des.negativos else v.notna()
            y = v.isin(des.codigos).astype(float).where(conocido)
        elif des.regla == 'percentil_bajo':
            v = p.x.reindex(p.datos.index[p.datos.variable == des.variable])
            v.index = p.datos.sujeto[v.index]
            v = v[~v.index.duplicated()]
            y = (v < corte_variable).astype(float).where(v.notna())
        else:
            raise ValueError(f'Regla desconocida: {des.regla} (las que hay: {REGLAS})')
        return y[y.index.isin(vino)].reindex(sujetos)

    def _siguiente(self, sev: Sevarti, datos: pd.DataFrame, momento: str) -> tuple[pd.Series, pd.Series, pd.Series] | None:
        """Per child who came to ``momento``: the visit date, how many days are left until the next
        visit's window opens and until it closes (in the age that window is measured in)."""
        et = sev.etapas.sort_values('orden').reset_index(drop=True)
        i = int(et.index[et.etapa == momento][0])
        if i + 1 >= len(et):
            return None
        sig = et.iloc[i + 1]
        en = datos[(datos.etapa == momento) & datos.t.notna()].groupby('sujeto')
        ahora = en.ec_dias.median() if sig.base == 'corregida' else en.edad_dias.median()
        return en.t.median(), sig.edad_min - ahora, sig.edad_max - ahora

    def pendientes(self, p: Preparado, momento: str) -> pd.Index:
        """Children whose next visit window is still open at the cut: the ones an early alert is for.
        A child whose window already closed either came back or did not; warning now is late."""
        if self._siguiente(p.sev, p.datos, momento) is None or p.sev.corte is None:
            return self.asistieron(p, momento)
        return self._esperando(p.sev, p.datos, momento)

    def _esperando(self, sev: Sevarti, datos: pd.DataFrame, momento: str) -> pd.Index:
        s = self._siguiente(sev, datos, momento)
        if s is None or sev.corte is None:
            return pd.Index([])
        t, _, cierra = s
        abierta = (t + pd.to_timedelta(cierra, unit='D')) > sev.corte
        return pd.Index(abierta.index[abierta.to_numpy()])

    def _no_vuelve(self, p: Preparado, des: Desenlace, sujetos: pd.Index) -> pd.Series:
        s = self._siguiente(p.sev, p.datos, des.momento)
        if s is None:
            return pd.Series(np.nan, index=sujetos)
        t, abre, faltan = s
        et = p.sev.etapas.sort_values('orden').reset_index(drop=True)
        sig = et.iloc[int(et.index[et.etapa == des.momento][0]) + 1]
        cerrada = (t + pd.to_timedelta(faltan, unit='D')) <= (p.sev.corte or pd.Timestamp.max)
        # the next visit must still be ahead: a child already inside its window (an entry at 40
        # weeks is also the 40-week visit) or past it cannot miss it
        cerrada &= abre > 0
        volvio = pd.Series(True, index=self.asistieron(p, sig.etapa))
        y = (~volvio.reindex(t.index, fill_value=False)).astype(float).where(cerrada.reindex(t.index, fill_value=False))
        return y.reindex(sujetos)

    # --------------------------------------------------------------- fitting
    def _entrenar(self, X: pd.DataFrame, y: pd.Series, rng: np.random.Generator) -> lgb.Booster:
        cfg = self.cfg
        valid = rng.random(len(y)) < 0.15
        cats = [c for c in X if isinstance(X[c].dtype, pd.CategoricalDtype)]
        params = dict(objective='binary', learning_rate=cfg.tasa, num_leaves=cfg.hojas, min_data_in_leaf=cfg.min_hoja,
                      feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, max_bin=63,
                      seed=cfg.semilla, verbose=-1, num_threads=cfg.hilos,
                      device_type=getattr(cfg, 'dispositivo', 'cpu'))
        return MA.entrenar_lgb(params, X[~valid], y[~valid], X[valid], y[valid], cats,
                               num_boost_round=cfg.rondas, callbacks=[lgb.early_stopping(50, verbose=False)])

    def ajustar(self, sev: Sevarti, progreso: bool = False, tardias: list[str] | None = None) -> ModeloClinico:
        """Fit every outcome on ``sev``. Each outcome is calibrated on the most recent children
        whose outcome is already known, the closest to the ones alerts are for, and trained on
        the earlier ones. The split depends on the outcome: a late outcome is known only for
        children born longer ago. ``tardias``: late-filled variables found on the whole base
        (``detectar_tardias``); without it they are looked for in ``sev``."""
        cfg = self.cfg
        datos, _ = MA.preparar(sev)
        self.refs1 = MA.ajustar_valor(datos, sev.esquema, MA.Config())
        p = self.preparar(sev)
        cats = p.datos[p.datos.tipo.isin(['categorical', 'boolean'])]
        self.niveles = {}
        for var, g in cats.groupby('variable'):
            vc = g.valor.astype(str).value_counts()
            vc = vc[vc >= 20]
            if 1 < len(vc) <= 64:
                self.niveles[var] = sorted(vc.index)
        esq = sev.esquema.set_index('variable').etiqueta
        self.etiquetas = {_nombre(v): (f'{e} ({v})' if isinstance(e, str) and e else v) for v, e in esq.items()}
        self.etiquetas |= {'eg_semanas': 'edad gestacional (semanas)'}
        self.categorias = {_nombre(v): e for v, e in etiquetas_categoria(sev.esquema).items()}
        nombres = nombres_etapa(sev.etapas)
        self.etiquetas |= {_nombre(f'z_{m.nombre}_{et}'): f'{m.nombre.replace("_", " ")}, puntaje z a {nombres.get(et, et)}'
                           for m in cfg.medidas for et in cfg.etapas_crecimiento}
        self.modelos, self.omitidos = {}, dict(cfg.descartados)
        self.tardias = sorted(tardias) if tardias is not None else self._variables_tardias(sev, p.datos)
        tardias_col = {_nombre(v) for v in self.tardias}
        nac = nacimiento_referencia(sev.sujetos.drop_duplicates('sujeto').set_index('sujeto'))
        matrices: dict[str, pd.DataFrame] = {}
        for i, des in enumerate(cfg.desenlaces, start=1):
            if motivo := self.falta(sev, des):
                self.omitidos[des.clave] = motivo
                continue
            if des.momento not in matrices:
                matrices[des.momento] = self.matriz(p, des.momento)
            X = matrices[des.momento]
            corte = np.nan
            if des.regla == 'percentil_bajo':
                v = p.x[p.datos.variable == des.variable].dropna()
                corte = float(v.quantile(des.percentil)) if len(v) else np.nan
            y = self.etiqueta(p, des, corte).reindex(X.index).dropna()
            # most recent children with a known outcome calibrate; unknown births go to training
            orden = nac.reindex(y.index).sort_values(na_position='first').index
            ys = y.reindex(orden).to_numpy()
            k = max(int(round(cfg.fraccion_calibracion * len(ys))), 1)
            desde_el_final = np.cumsum(ys[::-1])
            if len(ys) and desde_el_final[min(k, len(ys)) - 1] < cfg.min_casos:
                alcanza = np.flatnonzero(desde_el_final >= cfg.min_casos)
                k = int(alcanza[0]) + 1 if len(alcanza) else len(ys)
            tr_idx, ca_idx = orden[:len(orden) - k], orden[len(orden) - k:]
            ytr, yca = y[tr_idx], y[ca_idx]
            if ytr.sum() < cfg.min_casos or yca.sum() < max(5, cfg.min_casos // 3) or k > len(ys) / 2:
                self.omitidos[des.clave] = (f'{int(y.sum())} casos entre {len(y)} niños: no alcanzan para entrenar '
                                            f'y calibrar con los más recientes')
                continue
            fuera = ({_nombre(des.variable)} if des.variable else set()) | tardias_col
            columnas = [c for c in X if c not in fuera]
            rng = np.random.default_rng(cfg.semilla + i)
            modelo = self._entrenar(X.loc[tr_idx, columnas], ytr, rng)
            puntajes = modelo.predict(X.loc[ca_idx, columnas])
            cal = isotonica(puntajes, yca.to_numpy())
            base_cols = [c for c in (_nombre(b) for b in des.comparar) if c in X]
            base = self._entrenar(X.loc[tr_idx, base_cols], ytr, rng) if base_cols else None
            cal_base = isotonica(base.predict(X.loc[ca_idx, base_cols]), yca.to_numpy()) if base else None
            anios = nac.reindex(ca_idx).dt.year.dropna()
            con = f'nacidos de {int(anios.min())} a {int(anios.max())}' if len(anios) else ''
            self.modelos[des.clave] = ModeloDesenlace(des, columnas, modelo, cal, base_cols, base, cal_base, np.sort(puntajes),
                                                      corte, len(ytr), int(ytr.sum()), con)
            if progreso:
                print(f'{i}/{len(cfg.desenlaces)} {des.nombre}: {int(ytr.sum())} casos de {len(ytr)}, '
                      f'calibrado con {con}', flush=True)
        h = hashlib.sha1()
        h.update(VERSION_CODIGO.encode())
        h.update(json.dumps(asdict(cfg), sort_keys=True, default=str).encode())
        h.update(json.dumps(self.tardias).encode())
        h.update(pd.util.hash_pandas_object(pd.Series(sorted(map(str, sev.sujetos.sujeto))),
                                            index=False).values.tobytes())
        self.version = h.hexdigest()[:10]
        return self

    # --------------------------------------------------------------- scoring
    def dato(self, col: str, valor: object) -> str:
        """One input of the child as people read it: its name and its value, a code shown as its label."""
        return f'{self.etiquetas.get(col, col)} = {valor_legible(valor, self.categorias.get(col))}'

    def motivos(self, m: ModeloDesenlace, X: pd.DataFrame, n: int = 3) -> list[str]:
        """The inputs that push each child's risk up the most, from LightGBM's contributions."""
        Xc = X.reindex(columns=m.columnas)
        contrib = m.modelo.predict(Xc, pred_contrib=True)[:, :-1]
        salida = []
        for fila, valores in zip(contrib, Xc.itertuples(index=False)):
            top = [j for j in np.argsort(-fila)[:n] if fila[j] > 0]
            partes = []
            for j in top:
                col, val = m.columnas[j], valores[j]
                partes.append(self.dato(col, val))
            salida.append('; '.join(partes))
        return salida

    def riesgos(self, p: Preparado, solo_ultima_visita: bool = True, con_motivos: bool = True,
                solo_pendientes: bool = True) -> pd.DataFrame:
        """Risk of every outcome for every child at its visit. With ``solo_ultima_visita`` a
        child only gets the outcomes predicted at the last visit it attended; with
        ``solo_pendientes``, only while its next visit window is still open (afterwards it is
        too late to act on it)."""
        orden = self._orden(p.sev)
        # the last visit the child really came to (dated): filled-in data of later visits do not count
        vino = p.datos[p.datos.etapa.notna() & p.datos.t.notna()]
        ultima = vino.assign(o=vino.etapa.map(orden)).groupby('sujeto').o.max()
        fecha = p.datos.groupby(['sujeto', 'etapa']).t.median()
        faltan = self.sin_datos(p.sev)
        modelos = {c: m for c, m in self.modelos.items() if c not in faltan}
        partes = []
        for momento in dict.fromkeys(m.desenlace.momento for m in modelos.values()):
            X = self.matriz(p, momento)
            if solo_ultima_visita:
                X = X[ultima.reindex(X.index) == orden[momento]]
            if solo_pendientes:
                X = X[X.index.isin(self.pendientes(p, momento))]
            if X.empty:
                continue
            for clave, m in modelos.items():
                if m.desenlace.momento != momento:
                    continue
                Xm = X[X.index.isin(self._poblacion(p, m.desenlace))]
                if Xm.empty:
                    continue
                fila = pd.DataFrame({'sujeto': Xm.index, 'desenlace': m.desenlace.nombre, 'clave': clave,
                                     'momento': momento, 'riesgo': m.riesgo(Xm), 'percentil': m.percentil(Xm)})
                fila['fecha_visita'] = [fecha.get((s, momento), pd.NaT) for s in Xm.index]
                fila['motivos'] = self.motivos(m, Xm) if con_motivos else ''
                partes.append(fila)
        cols = ['sujeto', 'desenlace', 'clave', 'momento', 'riesgo', 'percentil', 'fecha_visita', 'motivos']
        return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(columns=cols)

    def crecimiento(self, p: Preparado) -> pd.DataFrame:
        return CR.alertas_crecimiento(p.z, self.cfg.medidas)


# =================================================================== evaluation

def primeros(r: np.ndarray, tasa: float, semilla: int = 0) -> np.ndarray:
    """The ``tasa`` share with the highest values; equal values are ordered at random."""
    k = int(round(tasa * len(r)))
    azar = np.random.default_rng(semilla).random(len(r))
    orden = np.lexsort((azar, -np.asarray(r, dtype=float)))
    out = np.zeros(len(r), dtype=bool)
    out[orden[:k]] = True
    return out


def evaluar(modelo: ModeloClinico, prueba: Sevarti) -> tuple[pd.DataFrame, dict[str, pd.DataFrame], Preparado]:
    """Per outcome, on children the model never saw: how well risk ranks them and how many
    cases fall among the ``fraccion_alta`` share with the highest risk, against the simple rule
    (only the inputs the outcome names in ``comparar``, such as gestational age and weight). Also the calibration table of each outcome."""
    p = modelo.preparar(prueba)
    filas, calibraciones = [], {}
    matrices: dict[str, pd.DataFrame] = {}
    for clave, m in modelo.modelos.items():
        des = m.desenlace
        if des.momento not in matrices:
            matrices[des.momento] = modelo.matriz(p, des.momento)
        X = matrices[des.momento]
        y = modelo.etiqueta(p, des, m.corte_variable).reindex(X.index)
        ok = y.notna().to_numpy()
        if not ok.any() or y[ok].sum() == 0:
            continue
        yy = y[ok].to_numpy().astype(bool)
        r, rb = m.riesgo(X[ok]), (m.riesgo(X[ok], base=True) if m.base is not None else None)
        # the same number of children for the model and the rule, ties at random: a fair race
        alto = primeros(r, modelo.cfg.fraccion_alta)
        fila = {'desenlace': des.nombre, 'momento': des.momento, 'niños': int(ok.sum()), 'casos': int(yy.sum()),
                '% casos': 100 * yy.mean(), 'AUC': auc(yy, r), 'AUC regla simple': auc(yy, rb) if rb is not None else np.nan,
                'precisión promedio': precision_promedio(yy, r),
                'casos en el riesgo más alto (%)': 100 * (alto & yy).sum() / yy.sum(),
                'del riesgo más alto, con el evento (%)': 100 * (alto & yy).sum() / max(alto.sum(), 1)}
        if rb is not None:
            alto_b = primeros(rb, modelo.cfg.fraccion_alta)
            fila['casos en el riesgo más alto, regla simple (%)'] = 100 * (alto_b & yy).sum() / yy.sum()
        filas.append(fila)
        bins = pd.qcut(pd.Series(r).rank(method='first'), 10, labels=False)
        calibraciones[clave] = pd.DataFrame({'riesgo': r, 'evento': yy, 'decil': bins}).groupby('decil').agg(
            riesgo_medio=('riesgo', 'mean'), observado=('evento', 'mean'), niños=('evento', 'size'))
    return pd.DataFrame(filas).set_index('desenlace'), calibraciones, p


def por_grupo(modelo: ModeloClinico, p: Preparado, clave: str, grupos: pd.Series) -> pd.DataFrame:
    """Calibration of one outcome by group (gestational age band, income...): mean risk against
    what happened."""
    m = modelo.modelos[clave]
    X = modelo.matriz(p, m.desenlace.momento)
    y = modelo.etiqueta(p, m.desenlace, m.corte_variable).reindex(X.index)
    ok = y.notna()
    r = pd.Series(m.riesgo(X[ok]), index=X.index[ok])
    d = pd.DataFrame({'riesgo': r, 'evento': y[ok], 'grupo': grupos.reindex(r.index)})
    return d.groupby('grupo', observed=True).agg(
        niños=('evento', 'size'), casos=('evento', 'sum'), riesgo_medio=('riesgo', 'mean'),
        observado=('evento', 'mean'))


def importancia(m: ModeloDesenlace, etiquetas: dict[str, str], top: int = 10) -> pd.Series:
    imp = pd.Series(m.modelo.feature_importance('gain'), index=m.columnas)
    imp = (imp / imp.sum()).sort_values(ascending=False).head(top)
    return imp.rename(index=lambda c: etiquetas.get(c, c))


# ================================================================== saving

ARCHIVO_MODELO, ARCHIVO_FICHA = 'modelo.pkl', 'ficha.json'


def guardar(modelo: ModeloClinico, carpeta: Path, sev: Sevarti, validacion: pd.DataFrame | None) -> Path:
    destino = carpeta / modelo.version
    destino.mkdir(parents=True, exist_ok=True)
    with open(destino / ARCHIVO_MODELO, 'wb') as f:
        pickle.dump(modelo, f, protocol=pickle.HIGHEST_PROTOCOL)
    ficha = {
        'version': modelo.version, 'version_codigo': VERSION_CODIGO,
        'entrenado': pd.Timestamp.now().isoformat(timespec='seconds'),
        'corte_datos': None if sev.corte is None else str(pd.Timestamp(sev.corte).date()),
        'sujetos': int(sev.sujetos.sujeto.nunique()), 'config': asdict(modelo.cfg),
        'calibrado_con': {k: m.calibrado_con for k, m in modelo.modelos.items()},
        'omitidos': modelo.omitidos, 'variables_tardias': modelo.tardias,
        'validacion': None if validacion is None else json.loads(validacion.round(3).to_json(orient='index')),
    }
    (destino / ARCHIVO_FICHA).write_text(json.dumps(ficha, indent=2, ensure_ascii=False, default=str), encoding='utf-8')
    return destino


def cargar(carpeta: Path) -> tuple[ModeloClinico, dict]:
    """A model folder, or the folder of models (the most recent). Only load models this
    project wrote: a pickle runs code when it is read."""
    if not (carpeta / ARCHIVO_MODELO).exists():
        fichas = [(json.loads(f.read_text(encoding='utf-8'))['entrenado'], f.parent)
                  for f in carpeta.glob(f'*/{ARCHIVO_FICHA}')]
        if not fichas:
            raise FileNotFoundError(f'No hay modelos clínicos en {carpeta}. Primero: python -m clinico entrenar')
        carpeta = max(fichas)[1]
    ficha = json.loads((carpeta / ARCHIVO_FICHA).read_text(encoding='utf-8'))
    if ficha['version_codigo'] != VERSION_CODIGO:
        raise RuntimeError(f'El modelo clínico {ficha["version"]} es de otra versión del código: hay que reentrenar.')
    with open(carpeta / ARCHIVO_MODELO, 'rb') as f:
        return pickle.load(f), ficha


def en_uso(ruta: str | None) -> tuple[ModeloClinico, dict]:
    """The model asked for (a folder), or the most recent one saved in ``interno/``."""
    return cargar(Path(ruta) if ruta else CA.PROYECTO.modelos_clinicos)


# ================================================================ silence

def comparar_silencio(modelo: ModeloClinico, p: Preparado, predicciones: pd.DataFrame) -> pd.DataFrame:
    """Risks stored during the silent period against the outcomes known now: how well they
    ranked, whether the level held, and how many cases were among the highest risks."""
    filas = []
    for clave, g in predicciones.groupby('clave'):
        if clave not in modelo.modelos:
            continue
        m = modelo.modelos[clave]
        y = modelo.etiqueta(p, m.desenlace, m.corte_variable).reindex(g.sujeto).to_numpy()
        ok = ~np.isnan(y)
        if not ok.any():
            continue
        yy, r = y[ok].astype(bool), g.riesgo.to_numpy()[ok]
        alto = primeros(r, modelo.cfg.fraccion_alta)
        filas.append(dict(desenlace=m.desenlace.nombre, predicciones=len(g), con_desenlace_conocido=int(ok.sum()),
                          casos=int(yy.sum()), AUC=auc(yy, r), riesgo_medio=float(r.mean()), observado=float(yy.mean()),
                          casos_en_riesgo_alto_pct=100 * (alto & yy).sum() / max(yy.sum(), 1)))
    return pd.DataFrame(filas).set_index('desenlace') if filas else pd.DataFrame()


def crecimiento_desde(modelo: ModeloClinico, p: Preparado, desde: pd.Timestamp | None) -> pd.DataFrame:
    """Growth alerts of the data recorded since a date (all of them without one)."""
    c = modelo.crecimiento(p)
    c = c.join(p.datos[['t']])
    c = c[c.bajo | c.cae | c.improbable]
    if desde is not None:
        c = c[c.t >= desde]
    return c

