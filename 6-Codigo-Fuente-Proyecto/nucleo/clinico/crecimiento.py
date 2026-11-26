"""Growth against an external reference, so a deficit common in the population still shows.

Z-scores by the LMS method (WHO Child Growth Standards, 2006) at the corrected age of each
datum. The reference table lives in ``oms_lms.csv`` (weekly values for the first
13 weeks, monthly up to 24 months; WHO tables as distributed by pygrowup 0.8.2, BSD). Before
term (corrected age < 0) WHO does not apply, and growth is not evaluated there.
Weight-for-length runs on the length measured at the same visit instead of age:
``oms_peso_talla.csv`` (45 to 110 cm every 0.5 cm, same source, identical to WHO's anthro tables).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

REFERENCIA_OMS = Path(__file__).with_name('oms_lms.csv')
REFERENCIA_PESO_TALLA = Path(__file__).with_name('oms_peso_talla.csv')

# WHO facts, not choices: what each indicator measures, the unit its table is in, and which ones
# use the restricted z beyond +-3 SD. The experts choose which indicators, variables and units.
INDICADORES = ('peso', 'talla', 'perimetro_cefalico', 'peso_para_talla')
MAGNITUD = {'peso': 'peso', 'peso_para_talla': 'peso', 'talla': 'longitud', 'perimetro_cefalico': 'longitud'}
UNIDADES = {'g': ('peso', 0.001), 'kg': ('peso', 1.0), 'cm': ('longitud', 1.0), 'mm': ('longitud', 0.1)}
RESTRINGIDOS = frozenset({'peso', 'peso_para_talla'})
Z_BAJO, CAIDA = -2.0, 1.0   # defaults: WHO's "low" is under -2 SD
# WHO's flags for biologically implausible z-scores, per indicator (a z strictly beyond them is a datum to
# check, not a finding): length/height-for-age < -6 or > +6, weight-for-age < -6 or > +5, weight-for-length
# and head circumference-for-age < -5 or > +5 (BMI-for-age, not used here, is also -5 / +5). Source: WHO Anthro
# Software and its macros (igrowup; R package ``anthro``, ``anthro_zscores``: flen, fwei, fwfl, fhc) and
# WHO/UNICEF, Recommendations for data collection, analysis and reporting on anthropometric indicators in
# children under 5 years old (2019), section on flagging implausible z-scores.
Z_IMPROBABLE = 6.0  # the widest flag: a concept that is no WHO indicator is implausible beyond +-6 SD
Z_IMPROBABLES = {'talla': (-6.0, 6.0), 'peso': (-6.0, 5.0), 'peso_para_talla': (-5.0, 5.0),
                 'perimetro_cefalico': (-5.0, 5.0)}


@dataclass(frozen=True)
class Medida:
    concepto: str        # SEVARTI concept of the measures (peso, talla, ...)
    indicador: str       # indicator in the reference table
    factor: float = 1.0  # from the variable's unit to the reference unit (grams -> kg: 0.001)
    restringido: bool = False  # WHO's restricted z beyond +-3 SD (weight-type indicators)
    por_talla: str | None = None  # weight-for-length: concept of the length measured at the same visit
    z_bajo: float = Z_BAJO   # growth alert and outcome: under this z
    caida: float = CAIDA     # growth alert: this many SD lower than the previous visit
    z_improbable_min: float | None = None   # implausible under this z; None is WHO's flag for the indicator
    z_improbable_max: float | None = None   # implausible over this z; None is WHO's flag for the indicator

    @property
    def nombre(self) -> str:
        """What its z-scores are called: the concept for an indicator by age, else the indicator."""
        return self.indicador if self.por_talla else self.concepto

    @property
    def improbable(self) -> tuple[float, float]:
        """The z-scores outside which a datum is implausible: the experts' limits, else WHO's flags.
        Read with ``getattr`` so a measure pickled before these fields existed still answers."""
        lo, hi = Z_IMPROBABLES.get(self.indicador, (-Z_IMPROBABLE, Z_IMPROBABLE))
        minimo, maximo = getattr(self, 'z_improbable_min', None), getattr(self, 'z_improbable_max', None)
        return (lo if minimo is None else float(minimo), hi if maximo is None else float(maximo))


def leer_referencia(ruta: Path = REFERENCIA_OMS, peso_talla: Path = REFERENCIA_PESO_TALLA) -> pd.DataFrame:
    """Both WHO tables in one, on a common axis ``eje``: age in days, or length in cm for
    weight-for-length."""
    por_edad = pd.read_csv(ruta)
    por_talla = pd.read_csv(peso_talla).assign(indicador='peso_para_talla')
    return pd.concat([por_edad.assign(eje=por_edad.edad_dias), por_talla.assign(eje=por_talla.talla_cm)],
                     ignore_index=True)


def _lms(ref: pd.DataFrame, indicador: str, sexo: np.ndarray, eje: np.ndarray) -> tuple[np.ndarray, ...]:
    """L, M and S at each age (or length), linearly interpolated within the table; NaN outside it."""
    L, M, S = (np.full(len(eje), np.nan) for _ in range(3))
    for s in (1, 2):
        t = ref[(ref.indicador == indicador) & (ref.sexo == s)].sort_values('eje')
        cual = (sexo == s) & (eje >= t.eje.min()) & (eje <= t.eje.max())
        for destino, col in ((L, 'L'), (M, 'M'), (S, 'S')):
            destino[cual] = np.interp(eje[cual], t.eje, t[col])
    return L, M, S


def puntaje_z(y: np.ndarray, L: np.ndarray, M: np.ndarray, S: np.ndarray, restringido: bool) -> np.ndarray:
    """LMS z-score. With ``restringido``, beyond +-3 SD the distance is measured in units of the
    last SD band, as WHO does for weight, so a skewed tail does not inflate extreme values."""
    y, L, M, S = (np.asarray(v, dtype=float) for v in (y, L, M, S))
    with np.errstate(divide='ignore', invalid='ignore'):
        z = np.where(np.abs(L) > 1e-9, ((y / M) ** L - 1) / (L * S), np.log(y / M) / S)
        if restringido:
            def sd(k: float) -> np.ndarray:
                return M * (1 + L * S * k) ** (1 / L)
            arriba = 3 + (y - sd(3)) / (sd(3) - sd(2))
            abajo = -3 + (y - sd(-3)) / (sd(-2) - sd(-3))
            z = np.where(z > 3, arriba, np.where(z < -3, abajo, z))
    return np.where(y > 0, z, np.nan)


def puntajes_z(datos: pd.DataFrame, x: pd.Series, sexo: pd.Series, medidas: tuple[Medida, ...],
               ref: pd.DataFrame, etapas_validas: set[str], etapas: pd.DataFrame | None = None) -> pd.DataFrame:
    """One row per subject, stage and measure: concept, corrected age and z-score.
    ``datos`` is the prepared long table (it carries ``concepto``, ``ec_dias``); ``x`` the
    values to use (data errors already blanked); ``sexo`` is 1 or 2 per subject. With the
    stages table, ``en_ventana`` says whether the datum's age falls in its stage's age window
    (a 12-month visit recorded at age 0 does not). When the dictionary gives a stage two
    variables of the same measure, the stage keeps one: in its window first, then the latest."""
    partes = []
    for med in medidas:
        d = datos[(datos.concepto == med.concepto) & datos.etapa.isin(etapas_validas)]
        if d.empty:
            continue
        edad = d.ec_dias.to_numpy(dtype=float)
        s = d.sujeto.map(sexo).to_numpy(dtype=float)
        eje = edad
        if med.por_talla:   # the length of the same child at the same visit
            t = datos[(datos.concepto == med.por_talla) & datos.etapa.isin(etapas_validas)]
            talla = pd.DataFrame({'sujeto': t.sujeto, 'etapa': t.etapa, 'talla': x.reindex(t.index)}).dropna()
            talla = talla.groupby(['sujeto', 'etapa']).talla.first()
            eje = talla.reindex(pd.MultiIndex.from_arrays([d.sujeto, d.etapa])).to_numpy(dtype=float)
        L, M, S = _lms(ref, med.indicador, s, eje)
        z = puntaje_z(x.reindex(d.index).to_numpy(dtype=float) * med.factor, L, M, S, med.restringido)
        partes.append(pd.DataFrame({'sujeto': d.sujeto, 'variable': d.variable, 'etapa': d.etapa,
                                    'concepto': med.nombre, 'ec_dias': edad, 'z': z}, index=d.index))
    cols = ['sujeto', 'variable', 'etapa', 'concepto', 'ec_dias', 'z']
    out = pd.concat(partes) if partes else pd.DataFrame(columns=cols)
    out = out.dropna(subset=['z'])
    out['en_ventana'] = True
    if etapas is not None and len(out):
        et = etapas.set_index('etapa')
        edad = np.where(out.etapa.map(et.base) == 'corregida', out.ec_dias,
                        datos.edad_dias.reindex(out.index) if 'edad_dias' in datos else out.ec_dias)
        lo, hi = out.etapa.map(et.edad_min).astype(float), out.etapa.map(et.edad_max).astype(float)
        out['en_ventana'] = ~((edad < lo) | (edad > hi)).to_numpy()
    out = out.sort_values(['en_ventana', 'ec_dias'], kind='stable')
    return out[~out.duplicated(['sujeto', 'etapa', 'concepto'], keep='last')].sort_index()


def limites_improbable(concepto: str, medidas: tuple[Medida, ...] = (),
                       z_improbable: float = Z_IMPROBABLE) -> tuple[float, float]:
    """The implausible limits of a concept's z-scores: those of the measure that names it, else WHO's
    flags when the concept is an indicator's name, else +-``z_improbable``."""
    for m in medidas:
        if m.nombre == concepto:
            return m.improbable
    return Z_IMPROBABLES.get(concepto, (-z_improbable, z_improbable))


def alertas_crecimiento(z: pd.DataFrame, medidas: tuple[Medida, ...] = (),
                        z_improbable: float = Z_IMPROBABLE) -> pd.DataFrame:
    """Per growth datum: below its measure's ``z_bajo`` SD, or ``caida`` SD lower than the subject's
    previous datum of the same concept (WHO's -2 and 1 for a concept no measure names). A value beyond
    its measure's implausible limits (WHO's flags per indicator, ``limites_improbable``), or one whose age
    is outside its visit's window (``en_ventana`` False), is not a clinical alert but a datum to check
    (``revisar``); it is left out of the next visit's drop too."""
    z = z.sort_values(['sujeto', 'concepto', 'ec_dias'])
    umbral = {m.nombre: (m.z_bajo, m.caida) for m in medidas}
    bajo_de = z.concepto.map(lambda c: umbral.get(c, (Z_BAJO, CAIDA))[0]).astype(float)
    caida_de = z.concepto.map(lambda c: umbral.get(c, (Z_BAJO, CAIDA))[1]).astype(float)
    limites = {c: limites_improbable(c, medidas, z_improbable) for c in z.concepto.unique()}
    lo_de = z.concepto.map(lambda c: limites[c][0]).astype(float)
    hi_de = z.concepto.map(lambda c: limites[c][1]).astype(float)
    improbable = (z.z < lo_de) | (z.z > hi_de)
    otra_edad = ~z.en_ventana.astype(bool) if 'en_ventana' in z else pd.Series(False, index=z.index)
    revisar = improbable | otra_edad
    creible = z.z.where(~revisar)
    previo = creible.groupby([z.sujeto, z.concepto]).shift()
    out = z.assign(z_previo=previo, improbable=improbable, revisar=revisar,
                   bajo=creible < bajo_de, cae=(previo - creible) > caida_de)
    out['motivo'] = [
        (f'menos de {lo:g} DE: revisar el dato' if v < lo else f'más de {hi:+g} DE: revisar el dato') if i else
        'la edad no corresponde a la visita: revisar el dato' if o else
        f'por debajo de {b:g} DE y cayó más de {c:g} DE' if es_bajo and cae else
        f'por debajo de {b:g} DE' if es_bajo else
        f'cayó más de {c:g} DE desde la visita anterior' if cae else ''
        for v, lo, hi, i, o, es_bajo, cae, b, c in zip(out.z, lo_de, hi_de, out.improbable, otra_edad, out.bajo,
                                                        out.cae, bajo_de, caida_de)]
    return out
