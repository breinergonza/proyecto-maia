"""Adapter for the KMC Observatory (Fundación Canguro) read-only ``consumo`` schema.

This is the only institution-specific piece. It translates the source into the
generic engine contract: a normalized metadata table, a wide entity table and a
``DatasetSpec``. Supporting another source means writing another adapter like
this one; the engine and the report stay the same.

Connection: set the environment variable ``KMC_PW`` (the password shared by the
Observatory through a private channel). Every session is opened read-only.
"""
from __future__ import annotations

import os
import re
import warnings
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg

from anomalias.motor import DatasetSpec, Family, Stage, parse_dates
from sevarti import diccionario as D
from sevarti.contrato import Sevarti, edad_corregida

USER = 'kmc_estudiante.rfmxvnfbmbdpkjmhenrz'
HOST = 'aws-1-us-east-1.pooler.supabase.com'
DOCUMENTED = dict(pacientes=15_641, variables=337, mediciones=4_521_712)

KIND_BY_TYPE = {'FLOAT': 'numeric', 'INTEGER': 'numeric', 'CATEGORIC': 'categorical',
                'BOOLEAN': 'boolean', 'DATE': 'date', 'TEXT': 'text'}

# Roles that must never be profiled as clinical variables.
IDENTIFIERS = ('paciente_id', 'iden_codigo')
GROUP, ANCHOR = 'iden_sede', 'iden_fechaparto'
EDAD_GESTACIONAL = 'eg_semanas'  # the Fundación's canonical gestational age (weeks), as they asked

# Months of corrected age per follow-up stage. Chronological age at a corrected-age
# visit is at most ~17 weeks larger (a 23-week preterm), hence the 120-day margin.
_MARGIN = 120


def _stage(key: str, value: str, date: str | None, age: str | None, months_ec: float | None) -> Stage:
    nominal = None if months_ec is None else months_ec * 30.44 + _MARGIN
    return Stage(key=key, value=value, date=date, age=age, nominal_age_days=nominal)


def _family(concept: str, unit: str, cols: tuple[str, ...], non_decreasing: bool, tol: float) -> Family:
    birth, entry, w40, m3, m6, m9, m12 = cols
    stages = (
        _stage('nacimiento', birth, ANCHOR, None, 0),
        _stage('entrada PMC', entry, 'v195a', None, None),
        _stage('40 sem', w40, 'v215', 'v216', 0),
        _stage('3 m EC', m3, 'v259', 'v260', 3),
        _stage('6 m EC', m6, 'v302', 'v303', 6),
        _stage('9 m EC', m9, 'v345', 'v346', 9),
        _stage('12 m EC', m12, 'v387', 'v388', 12),
    )
    return Family(concept=concept, unit=unit, stages=stages, non_decreasing=non_decreasing,
                  decrease_tolerance=tol)


FAMILIES = (
    _family('peso', 'g', ('ern_peso', 'v196a', 'v218', 'v261', 'v304', 'v347', 'v389'), False, 0),
    _family('talla', 'cm', ('ern_talla', 'v196b', 'v219', 'v262', 'v305', 'v348', 'v390'), True, 1.0),
    _family('perimetro_cefalico', 'cm', ('ern_pc', 'v196c', 'v220', 'v263', 'v306', 'v349', 'v391'), True, 1.0),
)


def connect() -> psycopg.Connection:
    password = os.environ.get('KMC_PW')
    if not password:
        raise RuntimeError('Define la variable de entorno KMC_PW con la clave de kmc_estudiante.')
    conn = psycopg.connect(host=HOST, port=5432, dbname='postgres', user=USER, password=password,
                           sslmode='require', connect_timeout=20)
    conn.read_only = True
    return conn


def _query(conn: psycopg.Connection, sql: str) -> pd.DataFrame:
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', UserWarning)  # pandas prefers SQLAlchemy; psycopg works
        return pd.read_sql(sql, conn)


def load_metadata(conn: psycopg.Connection) -> pd.DataFrame:
    d = _query(conn, 'select * from consumo.diccionario order by variable')
    meta = pd.DataFrame({
        'variable': d.variable, 'label': d.nombre_corto, 'kind': d.tipo.map(KIND_BY_TYPE),
        'unit': d.unidades, 'range_min': d.rango_min.astype(float), 'range_max': d.rango_max.astype(float),
        'source_type': d.tipo, 'subtype': d.subtipo, 'origin': d.origen, 'description': d.descripcion,
        'module': d.variable.str.extract(r'^([a-z]+)_', expand=False).fillna('seguimiento (v###)'),
    })
    meta['categories'] = meta.variable.map(_categorias(conn)).fillna('')
    return meta[~meta.variable.isin(IDENTIFIERS)].reset_index(drop=True)


def _categorias(conn: psycopg.Connection) -> pd.Series:
    """The label of each code, from the base's own category table, as SEVARTI writes them
    ('1=buena;2=regular'). Codes that only mean "missing" carry no label and are left out."""
    c = _query(conn, 'select variable, codigo, etiqueta from consumo.categoria '
                     'where not coalesce(es_missing, false) and etiqueta is not null order by variable, codigo')
    pares = c.codigo.astype(str).str.strip() + '=' + c.etiqueta.astype(str).str.replace(';', ',').str.strip()
    return pares.groupby(c.variable).agg(';'.join)


def load_wide(conn: psycopg.Connection) -> pd.DataFrame:
    return _query(conn, 'select * from consumo.perfil_paciente')


def load_flags(conn: psycopg.Connection) -> pd.DataFrame:
    """Quality flags of the long table, aggregated per variable (no patient rows leave the server)."""
    return _query(conn, """
        select variable, origen, count(*) as n,
               count(*) filter (where tipo_ok is false)       as tipo_invalido,
               count(*) filter (where en_dominio is false)    as fuera_dominio,
               count(*) filter (where en_rango is false)      as fuera_rango,
               count(*) filter (where en_rango is null)       as rango_no_evaluado,
               count(*) filter (where temporal_no_ubicable)   as no_ubicable,
               count(*) filter (where etapa is not null)      as con_etapa,
               count(*) filter (where en_dominio is false
                                  and valor_texto ~ '\\S+\\s+\\S+\\s+\\S+') as texto_libre_fuera_dominio
        from consumo.medicion group by 1, 2""")


def load_stage_locations(conn: psycopg.Connection) -> pd.DataFrame:
    return _query(conn, """
        select coalesce(etapa, '(sin etapa)') as etapa, temporal_no_ubicable, count(*) as n
        from consumo.medicion group by 1, 2 order by 3 desc""")


def prepare(wide: pd.DataFrame) -> pd.DataFrame:
    """Derived columns used as covariates. Raw columns are never modified."""
    out = wide.copy()
    ga = pd.to_numeric(out[EDAD_GESTACIONAL], errors='coerce')
    out['ga_semanas'] = np.floor(ga.where(ga.between(22, 44))).clip(24, 42)
    out['sexo'] = out.ern_sexo
    out['anio_parto'] = parse_dates(out[ANCHOR]).date.dt.year
    return out


VISIT_DATES = ('v215', 'v259', 'v302', 'v345', 'v387')


def estimate_extraction_date(wide: pd.DataFrame, today: pd.Timestamp | None = None,
                             columnas: tuple[str, ...] = VISIT_DATES) -> pd.Timestamp:
    """Latest plausible visit date not after today: the source has no extraction timestamp."""
    today = today or pd.Timestamp.today().normalize()
    dates = pd.concat([parse_dates(wide[c]).date for c in columnas])
    return dates[dates <= today].max()


def build_spec(wide: pd.DataFrame) -> DatasetSpec:
    return DatasetSpec(
        entity='paciente_id', group=GROUP, anchor_date=ANCHOR,
        covariates=('ga_semanas', 'sexo'), families=FAMILIES,
        cutoff=estimate_extraction_date(wide), pre_anchor_dates=('ern_fum',),
    )


# ------------------------------------------------------------------ SEVARTI export
# The KMC base is the production source: this turns it into the six SEVARTI tables the models
# read. Any other source (the app, for example) hands the same tables in Parquet instead. The
# gestational age is EG_Semanas, as the Fundación asked.
#
# Every definition (variables, visits, episodes, breaks) comes from the dictionary the experts own
# (``entradas/diccionario.xlsx``, see ``sevarti.diccionario``). The rules below only write its first
# draft and suggest the classification of a variable the dictionary does not know yet.
#
# Since 2026-10-15 consumo no longer carries the exact birth date, the site, the patient key
# or the exact hospital dates (consumo.variable_restringida: they allow re-identification).
# The export never rebuilds them: birth is known to the year, each datum carries the age the
# form recorded, stays come from their durations, and the whole programme is one group.

ETAPAS_SEVARTI = pd.DataFrame([  # draft only
    ('prenatal', 0, np.nan, np.nan, 'cronologica', 'prenatal'),
    ('nacimiento', 1, 0, 3, 'cronologica', 'nacimiento'),
    ('hospitalización', 2, 0, 200, 'cronologica', 'hospitalización'),
    ('entrada PMC', 3, 0, 200, 'cronologica', 'entrada al programa canguro'),
    ('40 sem', 4, -21, 35, 'corregida', '40 semanas'),
    ('3 m EC', 5, 45, 135, 'corregida', '3 meses (edad corregida)'),
    ('6 m EC', 6, 135, 225, 'corregida', '6 meses (edad corregida)'),
    ('9 m EC', 7, 225, 315, 'corregida', '9 meses (edad corregida)'),
    ('12 m EC', 8, 315, 450, 'corregida', '12 meses (edad corregida)'),
], columns=['etapa', 'orden', 'edad_min', 'edad_max', 'base', 'nombre'])

# The follow-up form is numbered by visit: a v### variable belongs to the visit block it falls in.
BLOQUES_VISITA = ((215, '40 sem'), (259, '3 m EC'), (302, '6 m EC'), (345, '9 m EC'), (387, '12 m EC'))
FECHA_ETAPA = {'hospitalización': ('v195',), 'entrada PMC': ('v195a',), '40 sem': ('v215',),
               '3 m EC': ('v259',), '6 m EC': ('v302',), '9 m EC': ('v345',), '12 m EC': ('v387',)}
# Age in days of life recorded by the form at each stage.
EDAD_ETAPA = {'hospitalización': 'v196', '40 sem': 'v216', '3 m EC': 'v260', '6 m EC': 'v303',
              '9 m EC': 'v346', '12 m EC': 'v388'}
# Every datum of these visits has the same age (days of life), though no date or age was recorded.
EDAD_FIJA = {'nacimiento': 0.0}
ANIO = 'anio_parto'
GRUPO_UNICO = 'todo el programa'  # consumo no longer says the site
ROL_POR_MODULO = {'ern': 'basal', 'pa': 'basal', 'cp': 'basal', 'csp': 'contexto'}
ETAPA_POR_MODULO = {'ern': 'nacimiento', 'pa': 'nacimiento', 'cp': 'prenatal', 'hd': 'hospitalización',
                    'ac': 'hospitalización'}
# Weights measured at their own age inside a visit block (value -> age in days of life).
EDAD_PROPIA = {'v234': 'v233'}
# The other extra weights (v273, v275g, v317g, v360g, v402g) have a "dias" field that is not the
# age (its median is 27 to 140 days at visits of 3 to 12 months): they stay at their visit date
# and are not chained with the trajectory.
# Birth length and head circumference drop at entry far too often: probably another instrument,
# so they are not chained with the programme measurements.
NO_ENCADENAR = ('ern_talla', 'ern_pc')
# Stays as days of life from birth, from their durations (the Fundación: "no resten fechas").
# Kangaroo position at home is bounded by gestational age with variables not loaded yet.
EPISODIOS = (('hospitalización URN', ('hd_diasurn',)),
             ('hospitalización total', ('hd_totaldiashospital', 'v196')))
QUIEBRES = pd.DataFrame({'quiebre': ['cambio de sistema 2022'], 'fecha': [pd.Timestamp('2022-01-01')]})

# ---------------------------------------------------------------- open decisions (a) and (b)
# Both are off unless switched on, so the export stays as described above. ``to_sevarti`` takes them
# as arguments; left as None, it reads these environment variables ('1', 'true', 'si'... switch on).
#
# a. Each corrected-age visit window is the real range of the base: p1 to p99 of the corrected age in
#    days of the subjects seen at that visit, recomputed on every run. A visit with fewer than
#    VENTANA_MIN_SUJETOS subjects keeps the dictionary window. ``etapas.ventana_fuente`` says which
#    window each visit got.
# b. The site is the group and the delivery date the birth date, when the base brings them and the
#    Fundación has not restricted them (consumo.variable_restringida). Otherwise, as above. The patient
#    key (iden_codigo) is never read, whatever is declared.
ENV_VENTANAS_REALES = 'MAIA_VENTANAS_REALES'
ENV_USAR_SEDE_FECHA = 'MAIA_USAR_SEDE_FECHA'
VENTANA_PERCENTILES = (1.0, 99.0)
VENTANA_MIN_SUJETOS = 200
SIN_SEDE = 'sin sede'
NUNCA = frozenset({'iden_codigo'})
_SI = {'1', 'true', 'si', 'sí', 'yes', 'on'}


def opcion(valor: bool | None, variable: str) -> bool:
    """An explicit argument wins; None reads the environment variable (off when unset)."""
    if valor is not None:
        return bool(valor)
    return os.environ.get(variable, '').strip().lower() in _SI


def ventanas_de_la_base(etapas: pd.DataFrame, edades: dict[str, pd.Series], eg_semanas: pd.Series,
                        min_sujetos: int | None = None) -> pd.DataFrame:
    """Decision (a): ``etapas`` with each corrected-age visit window replaced by p1 to p99 of the
    corrected age of the subjects seen at it. Visits with too few subjects, or with no age, keep the
    dictionary window; ``ventana_fuente`` records which one each visit got."""
    minimo = VENTANA_MIN_SUJETOS if min_sujetos is None else min_sujetos
    lo_p, hi_p = (p / 100 for p in VENTANA_PERCENTILES)
    out = etapas.copy()
    out['edad_min'] = out.edad_min.astype(float)
    out['edad_max'] = out.edad_max.astype(float)
    out['ventana_fuente'] = 'diccionario'
    for i, r in out.iterrows():
        if r.base != 'corregida' or r.etapa not in edades:
            continue
        ec = edad_corregida(edades[r.etapa], eg_semanas).dropna()
        if len(ec) < minimo:
            out.at[i, 'ventana_fuente'] = f'diccionario (solo {len(ec)} sujetos)'
            continue
        lo, hi = ec.quantile([lo_p, hi_p])
        out.at[i, 'edad_min'], out.at[i, 'edad_max'] = float(np.floor(lo)), float(np.ceil(hi))
        out.at[i, 'ventana_fuente'] = f'base p{VENTANA_PERCENTILES[0]:g}-p{VENTANA_PERCENTILES[1]:g} (n={len(ec)})'
    return out


def sede_y_fecha(wide: pd.DataFrame, restringidas: set[str] | frozenset[str] = frozenset()
                 ) -> tuple[pd.Series | None, pd.Series | None]:
    """Decision (b): the site and the delivery date of each subject, each None when the base does not
    bring it (or it is empty) or it is restricted."""
    fuera = set(restringidas) | NUNCA
    sede = fecha = None
    if GROUP in wide and GROUP not in fuera and wide[GROUP].notna().any():
        texto = wide[GROUP].astype('string').str.strip()
        sede = texto.where(texto.notna() & texto.ne(''), SIN_SEDE).astype(object)
    if ANCHOR in wide and ANCHOR not in fuera:
        fecha = parse_dates(wide[ANCHOR]).date.astype('datetime64[ns]')
        if fecha.isna().all():
            fecha = None
    return sede, fecha


def _etapa_kmc(variable: str) -> str | None:
    if variable in ('v195', 'v196'):
        return 'hospitalización'
    num = re.match(r'^v(\d+)', variable)
    if num:
        etapa = 'entrada PMC'
        for inicio, nombre in BLOQUES_VISITA:
            if int(num[1]) >= inicio:
                etapa = nombre
        return etapa
    ec = re.match(r'^ec_(\d+)m$', variable)
    if ec:
        return f'{ec[1]} m EC'
    return ETAPA_POR_MODULO.get(variable.split('_')[0])


def esquema_sevarti(meta: pd.DataFrame) -> pd.DataFrame:
    """Dictionary rows translated into SEVARTI schema rows."""
    concepto, regla = {}, {}
    for fam in FAMILIES:
        for st in fam.stages:
            if st.value not in NO_ENCADENAR:
                concepto[st.value] = fam.concept
                regla[st.value] = (fam.non_decreasing, fam.decrease_tolerance)
    for v in (*EDAD_PROPIA, 'hd_pesosalida'):
        concepto[v], regla[v] = 'peso', (False, 0.0)
    m = meta[~meta.variable.isin((*IDENTIFIERS, GROUP, ANCHOR, ANIO)) & meta.kind.isin(['numeric', 'categorical', 'boolean'])]
    modulo = m.variable.str.split('_').str[0]
    rol = modulo.map(ROL_POR_MODULO).fillna('medicion')
    out = pd.DataFrame({
        'variable': m.variable, 'etiqueta': m.label, 'tema': m.module, 'tipo': m.kind, 'unidad': m.unit, 'rol': rol,
        'etapa': m.variable.map(_etapa_kmc), 'concepto': m.variable.map(concepto),
        'ventana': ~m.variable.isin(list(EDAD_PROPIA)),
        'no_decreciente': m.variable.map(lambda v: regla.get(v, (False, 0.0))[0]),
        'tolerancia': m.variable.map(lambda v: regla.get(v, (False, 0.0))[1]),
        'rango_min': m.range_min, 'rango_max': m.range_max,
        'categorias': m['categories'] if 'categories' in m else '',
    })
    out.loc[out.rol == 'contexto', 'etapa'] = None
    # every numeric, categorical and boolean variable travels: the anomaly model scores the
    # numeric ones, and the clinical module reads outcomes such as a diagnosis code
    return out.reset_index(drop=True)


def borrador(meta: pd.DataFrame) -> D.Diccionario:
    """The first dictionary, and the suggestion for each variable the source brings: today's rules
    written as dictionary rows, all marked "Lista"."""
    esq = esquema_sevarti(meta)
    variables = esq.assign(estado=D.LISTA, edad_variable=esq.variable.map(EDAD_PROPIA), nota=np.nan)
    visitas = ETAPAS_SEVARTI.assign(
        fecha_variables=ETAPAS_SEVARTI.etapa.map(lambda e: ';'.join(FECHA_ETAPA.get(e, ()))),
        edad_variable=ETAPAS_SEVARTI.etapa.map(EDAD_ETAPA), edad_fija=ETAPAS_SEVARTI.etapa.map(EDAD_FIJA))
    episodios = pd.DataFrame([(tipo, ';'.join(duraciones)) for tipo, duraciones in EPISODIOS],
                             columns=['tipo', 'duracion_variables'])
    return replace(borrador_clinico(), variables=variables, visitas=visitas, episodios=episodios, quiebres=QUIEBRES)


# ---------------------------------------------------------------- clinical draft
# The first content of the dictionary's clinical sheets: the outcomes, growth measures and WHO curve
# the system started with. From then on the experts own them in the dictionary.
_COMPARAR = f'{EDAD_GESTACIONAL};ern_peso;v196a'   # gestational age, birth weight, weight at entry
_CAMBIO_2022 = 'cambio de sistema 2022'
_ANTERIOR = {'40 sem': 'entrada PMC', '3 m EC': '40 sem', '6 m EC': '3 m EC', '9 m EC': '6 m EC', '12 m EC': '9 m EC'}
_MESES = {'3 m EC': '3 meses', '6 m EC': '6 meses', '9 m EC': '9 meses', '12 m EC': '12 meses'}


def _desenlace(clave: str, nombre: str, estado: str, regla: str, momento: str, variable: str | None = None,
               codigos: str | None = None, negativos: str | None = None, percentil: float | None = None,
               medida: str | None = None, etapa: str | None = None, solo_desde: str | None = None,
               nota: str | None = None) -> dict:
    return dict(clave=clave, nombre=nombre, estado=estado, regla=regla, momento=momento, variable=variable,
                codigos=codigos, negativos=negativos, percentil=percentil, medida=medida, etapa=etapa,
                solo_desde=solo_desde, comparar=_COMPARAR, nota=nota)


def _evento(clave: str, nombre: str, etapa: str, variable: str, codigos: str = '1', negativos: str = '2',
            cambio_2022: bool = False, momento: str | None = None) -> dict:
    """A negative event recorded at a visit (1 sí, 2 no, 9 no hay dato), predicted at the visit before."""
    nota = ('Desde el sistema de 2022 la proporción de "sí" cayó entre 4 y 30 veces: solo los nacidos desde '
            'entonces.' if cambio_2022 else None)
    return _desenlace(clave, nombre, D.EN_PRUEBA, 'en_codigos', momento or _ANTERIOR[etapa], variable, codigos,
                      negativos, solo_desde=_CAMBIO_2022 if cambio_2022 else None, nota=nota)


def _desenlaces() -> pd.DataFrame:
    uso = D.EN_USO
    filas = [
        _desenlace('readm_40s', 'readmisión antes de las 40 semanas', uso, 'mayor_que_cero', 'entrada PMC', 'v237'),
        _desenlace('readm_3m', 'readmisión entre las 40 semanas y los 3 meses', uso, 'mayor_que_cero', '40 sem', 'v276'),
        _desenlace('readm_6m', 'readmisión entre los 3 y los 6 meses', uso, 'mayor_que_cero', '3 m EC', 'v318'),
        _desenlace('readm_9m', 'readmisión entre los 6 y los 9 meses', uso, 'mayor_que_cero', '6 m EC', 'v361'),
        _desenlace('readm_12m', 'readmisión entre los 9 y los 12 meses', uso, 'mayor_que_cero', '9 m EC', 'v403'),
        *(_desenlace(f'no_vuelve_{c}', f'no vuelve a la visita de {n}', uso, 'no_vuelve', m)
          for c, n, m in (('40s', '40 semanas', 'entrada PMC'), ('3m', '3 meses', '40 sem'), ('6m', '6 meses', '3 m EC'),
                          ('9m', '9 meses', '6 m EC'), ('12m', '12 meses', '9 m EC'))),
        _desenlace('oxigeno_3m', 'oxigenodependencia con diagnóstico a los 3 meses', uso, 'en_codigos', 'entrada PMC',
                   'v275e', '1;2', '3;9', nota='1 displasia broncopulmonar, 2 hipertensión pulmonar; 3 y 9 sin '
                   'diagnóstico (el sistema anterior a 2022 usaba el 3, el actual el 9).'),
        _desenlace('oxigeno_12m', 'oxigenodependencia con diagnóstico a los 12 meses', uso, 'en_codigos', '40 sem',
                   'v402e', '1;2', '3;9'),
        _desenlace('desarrollo_6m', 'desarrollo psicomotor bajo a los 6 meses', uso, 'percentil_bajo', '3 m EC', 'v344b',
                   percentil=10.0, nota='El diccionario no nombra el test: "bajo" es el 10% más bajo de los niños de '
                   'entrenamiento, sin depender de la escala ni del corte del test.'),
        _desenlace('desarrollo_12m', 'desarrollo psicomotor bajo a los 12 meses', uso, 'percentil_bajo', '6 m EC',
                   'v430b', percentil=10.0),
        _evento('infeccion_40s', 'enfermedad infecciosa antes de las 40 semanas', '40 sem', 'v239'),
        _evento('ictericia_40s', 'ictericia antes de las 40 semanas', '40 sem', 'v244a'),
        _evento('apnea_40s', 'apnea antes de las 40 semanas', '40 sem', 'v244b'),
        _evento('infeccion_pulmonar_40s', 'infección pulmonar antes de las 40 semanas', '40 sem', 'v244c'),
        _evento('falla_crecimiento_40s', 'falla en el crecimiento antes de las 40 semanas', '40 sem', 'v243',
                cambio_2022=True),
        _evento('tono_40s', 'tono anormal a las 40 semanas', '40 sem', 'v246', '1;2;3', '4', cambio_2022=True),
        *(_evento(f'respiratoria_{e.split()[0]}m', f'enfermedad respiratoria aguda antes de los {_MESES[e]}', e, v)
          for e, v in (('3 m EC', 'v278'), ('6 m EC', 'v320'), ('9 m EC', 'v363'), ('12 m EC', 'v405'))),
        *(_evento(f'gastrointestinal_{e.split()[0]}m', f'enfermedad gastrointestinal aguda antes de los {_MESES[e]}',
                  e, v, cambio_2022=True)
          for e, v in (('3 m EC', 'v279'), ('6 m EC', 'v321'), ('9 m EC', 'v364'), ('12 m EC', 'v406'))),
        *(_evento(f'neurologico_{e.split()[0]}m', f'examen neurológico anormal a los {_MESES[e]}', e, v,
                  cambio_2022=True)
          for e, v in (('3 m EC', 'v282'), ('6 m EC', 'v324'), ('9 m EC', 'v367'), ('12 m EC', 'v409'))),
        _evento('oxigeno_ambulatorio_6m', 'oxígeno ambulatorio a los 6 meses', '6 m EC', 'v317d'),
        _evento('oxigeno_ambulatorio_9m', 'oxígeno ambulatorio a los 9 meses', '9 m EC', 'v360d'),
        _evento('caderas_12m', 'displasia de caderas a los 12 meses', '12 m EC', 'v429a', cambio_2022=True,
                momento='40 sem'),
        _evento('paralisis_12m', 'riesgo de parálisis cerebral a los 12 meses', '12 m EC', 'v430', cambio_2022=True,
                momento='40 sem'),
        # growth at 12 months under the WHO curve (the Fundación's question), predicted at every earlier visit
        *(_desenlace(f'{clave}_12m_desde_{momento.split()[0]}', f'{nombre} a los 12 meses (riesgo calculado a {momento})',
                     D.EN_PRUEBA, 'z_bajo', momento, medida=medida, etapa='12 m EC')
          for medida, clave, nombre in (('talla', 'talla_baja', 'talla baja para la edad'),
                                        ('peso', 'peso_bajo', 'peso bajo para la edad'),
                                        ('peso_para_talla', 'desnutricion_aguda', 'desnutrición aguda (peso bajo para la talla)'),
                                        ('perimetro_cefalico', 'perimetro_bajo', 'perímetro cefálico bajo para la edad'))
          for momento in ('40 sem', '3 m EC', '6 m EC', '9 m EC')),
    ]
    return pd.DataFrame(filas)


def borrador_clinico() -> D.Diccionario:
    """Only the clinical sheets of the draft: what a dictionary made before them is completed with."""
    crecimiento = pd.DataFrame([
        dict(indicador='peso', concepto='peso', unidad='g', estado=D.EN_USO),
        dict(indicador='talla', concepto='talla', unidad='cm', estado=D.EN_USO),
        dict(indicador='perimetro_cefalico', concepto='perimetro_cefalico', unidad='cm', estado=D.EN_USO),
        dict(indicador='peso_para_talla', concepto='peso', unidad='g', por_talla='talla', estado=D.EN_PRUEBA),
    ])
    curva = pd.DataFrame([dict(sexo='ern_sexo', codigo_nino='1', codigo_nina='2',
                               etapas='40 sem;3 m EC;6 m EC;9 m EC;12 m EC')])
    return D.Diccionario(desenlaces=_desenlaces(), crecimiento=crecimiento, curva=curva)


def _primera_fecha(wide: pd.DataFrame, columnas: tuple[str, ...]) -> pd.Series:
    out = pd.Series(pd.NaT, index=wide.index, dtype='datetime64[ns]')
    for c in columnas:
        if c in wide:
            out = out.fillna(parse_dates(wide[c]).date)
    return out


def _primer_valor(wide: pd.DataFrame, columnas: tuple[str, ...]) -> pd.Series:
    out = pd.Series(np.nan, index=wide.index)
    for c in columnas:
        if c in wide:
            out = out.fillna(pd.to_numeric(wide[c], errors='coerce'))
    return out


def _edades_por_etapa(wide: pd.DataFrame, fechas: dict[str, pd.Series], columnas_edad: dict[str, str],
                      orden: pd.Series) -> dict[str, pd.Series]:
    """Age in days of life at each dated stage: the one the form recorded (``columnas_edad``) or, when
    it is missing, the recorded age of the nearest other stage plus the days between both visits (an
    interval, never a birth date)."""
    anotada = {e: pd.to_numeric(wide[c], errors='coerce') if c in wide else pd.Series(np.nan, index=wide.index)
               for e, c in columnas_edad.items()}
    edades = {}
    for etapa, fecha in fechas.items():
        edad = anotada.get(etapa, pd.Series(np.nan, index=wide.index)).copy()
        for otra in sorted(anotada, key=lambda o: abs(orden[o] - orden[etapa])):
            if otra != etapa and otra in fechas:  # an interval needs the other visit's date
                edad = edad.fillna(anotada[otra] + (fecha - fechas[otra]).dt.days)
        edades[etapa] = edad.where(edad >= 0)
    return edades


def to_sevarti(dic: D.Diccionario, wide: pd.DataFrame, *, ventanas_reales: bool | None = None,
               usar_sede_fecha: bool | None = None, restringidas: set[str] | None = None) -> Sevarti:
    """The KMC wide table as SEVARTI tables, defined by the dictionary: only its "Lista" variables
    travel. Restricted fields are never read (see above).

    ``ventanas_reales`` and ``usar_sede_fecha`` switch on the open decisions (a) and (b); None reads
    ``MAIA_VENTANAS_REALES`` and ``MAIA_USAR_SEDE_FECHA``. ``restringidas`` are the fields declared
    restricted, which (b) never uses even if ``wide`` still carries them."""
    esquema = D.esquema(dic)
    etapas = D.etapas(dic)
    visitas = dic.visitas.set_index('etapa')
    ga = pd.to_numeric(wide[EDAD_GESTACIONAL], errors='coerce')
    sujetos = pd.DataFrame({'sujeto': wide.paciente_id, 'grupo': GRUPO_UNICO,
                            'fecha_nacimiento': pd.NaT, 'anio_nacimiento': pd.to_numeric(wide[ANIO], errors='coerce') if ANIO in wide else np.nan,
                            'eg_semanas': ga.where(ga.between(22, 44))})
    if opcion(usar_sede_fecha, ENV_USAR_SEDE_FECHA):
        sede, nacimiento = sede_y_fecha(wide, restringidas or frozenset())
        if sede is not None:
            sujetos['grupo'] = sede
        if nacimiento is not None:
            sujetos['fecha_nacimiento'] = nacimiento
            sujetos['anio_nacimiento'] = sujetos.anio_nacimiento.fillna(nacimiento.dt.year)
        print(f'Sede como grupo: {"sí" if sede is not None else "no"}; fecha de parto como nacimiento: '
              f'{"sí" if nacimiento is not None else "no"} ({ENV_USAR_SEDE_FECHA})', flush=True)
    fechas = {e: _primera_fecha(wide, cols) for e in etapas.etapa if (cols := D.partes(visitas.at[e, 'fecha_variables']))}
    edades = _edades_por_etapa(wide, fechas, {e: visitas.at[e, 'edad_variable'] for e in etapas.etapa
                                              if pd.notna(visitas.at[e, 'edad_variable'])},
                               etapas.set_index('etapa').orden)
    if opcion(ventanas_reales, ENV_VENTANAS_REALES):
        etapas = ventanas_de_la_base(etapas, edades, sujetos.eg_semanas)
        usadas = etapas[etapas.base == 'corregida']
        print('Ventanas de visita (' + ENV_VENTANAS_REALES + '): ' + '; '.join(
            f'{r.etapa} {r.edad_min:g} a {r.edad_max:g} [{r.ventana_fuente}]' for r in usadas.itertuples()), flush=True)
    edad_fija = visitas.edad_fija.dropna().to_dict()
    edad_propia = D.en_uso(dic).set_index('variable').edad_variable.dropna().to_dict()
    nada = pd.Series(np.nan, index=wide.index)
    sin_fecha = pd.Series(pd.NaT, index=wide.index, dtype='datetime64[ns]')
    partes = []
    for r in esquema.itertuples():
        if r.variable not in wide:
            continue
        col = wide[r.variable]
        ok = col.notna()
        if not ok.any():
            continue
        if r.variable in edad_propia:
            fecha, edad = sin_fecha, _primer_valor(wide, (edad_propia[r.variable],))
        elif r.etapa in fechas:
            fecha, edad = fechas[r.etapa], edades[r.etapa]
        elif r.etapa in edad_fija:
            fecha, edad = sin_fecha, pd.Series(edad_fija[r.etapa], index=wide.index)
        else:  # prenatal and social context: no time of their own
            fecha, edad = sin_fecha, nada
        partes.append(pd.DataFrame({'sujeto': wide.paciente_id[ok], 'variable': r.variable,
                                    'valor': col[ok].astype(object), 'fecha': fecha[ok], 'edad_dias': edad[ok]}))
    mediciones = pd.concat(partes, ignore_index=True)
    episodios = []
    for e in dic.episodios.itertuples():
        fin = _primer_valor(wide, D.partes(e.duracion_variables))
        ep = pd.DataFrame({'sujeto': wide.paciente_id, 'tipo': e.tipo, 'edad_inicio': 0.0, 'edad_fin': fin})
        episodios.append(ep[ep.edad_fin.notna()])
    # the extraction date: the latest date of the scheduled (corrected age) visits, as nothing is dated after it
    programadas = tuple(c for e in etapas[etapas.base == 'corregida'].etapa for c in D.partes(visitas.at[e, 'fecha_variables'])
                        if c in wide)
    return Sevarti(esquema=esquema, etapas=etapas, sujetos=sujetos, mediciones=mediciones,
                   episodios=pd.concat(episodios, ignore_index=True), quiebres=D.quiebres(dic),
                   corte=estimate_extraction_date(wide, columnas=programadas) if programadas else None)


def load_restricted(conn: psycopg.Connection) -> set[str]:
    """Fields the Fundación declared re-identifying. Empty when the table does not exist."""
    try:
        return set(_query(conn, 'select variable from consumo.variable_restringida').variable)
    except Exception:  # an older consumo without the declaration
        conn.rollback()
        return set()


def _fuente(conn: psycopg.Connection) -> tuple[pd.DataFrame, set[str]]:
    """The variables the base brings, without the restricted ones, and those restricted fields."""
    meta = load_metadata(conn)
    fuera = load_restricted(conn) | {'iden_codigo'}
    return meta[~meta.variable.isin(fuera)], fuera


def cargar_sevarti(ruta_diccionario: Path) -> Sevarti:
    """Reads the base (read-only) and returns it in SEVARTI form, as the dictionary at
    ``ruta_diccionario`` defines it (created from the rules if it does not exist yet). The patient
    key and every field declared restricted are dropped before anything else touches the table,
    even if the view still carried them."""
    with connect() as conn:
        meta, fuera = _fuente(conn)
        wide = load_wide(conn)
    wide = wide.drop(columns=[c for c in wide if c in fuera])
    return to_sevarti(D.sincronizar(ruta_diccionario, borrador(meta)), wide, restringidas=fuera)


def actualizar_diccionario(ruta_diccionario: Path) -> None:
    """Creates the dictionary from the base, or adds the variables it does not know yet, without
    loading any patient data."""
    with connect() as conn:
        meta, _ = _fuente(conn)
    D.sincronizar(ruta_diccionario, borrador(meta))
