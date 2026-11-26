"""La base de la Fundación (esquema ``consumo``, solo lectura) con consultas parametrizadas.

Reemplaza la lectura fija de ``sevarti.kmc`` (host y usuario en el código, ``select *`` sin filtros) sin tocar el
núcleo: la conexión sale de ``maia_comun.config`` (``KMC_*``), los valores van siempre como parámetros enlazados
(``%(x)s``) y el esquema, las tablas y las columnas como ``sql.Identifier``. La traducción a SEVARTI es la del
núcleo (``kmc.borrador``, ``diccionario.sincronizar``, ``kmc.to_sevarti``).

Semántica de los parámetros (detalle y ejemplos en ``docs/extraccion.md``):

* ``anio_desde``/``anio_hasta``: año de nacimiento (``anio_parto``), filtrado en el servidor.
* ``hasta`` y ``fecha_corte``: nada fechado después entra. Si la fecha de una visita es posterior, todos los datos de
  esa visita se descartan (también los que no tienen fecha propia) y los niños cuya primera fecha conocida es
  posterior no entran. ``fecha_corte`` además fija ``sev.corte`` y acota el año de nacimiento.
* ``desde``: solo entran los niños con alguna visita fechada entre ``desde`` y el tope; su historia anterior se
  conserva (los modelos necesitan la trayectoria).
* ``limite``: solo para pruebas; los primeros N niños por ``paciente_id``.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, replace
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg
from psycopg import sql

from anomalias.motor import parse_dates
from maia_comun.config import Configuracion, obtener
from sevarti import diccionario as D
from sevarti import kmc
from sevarti.contrato import Sevarti

TABLA_ANCHA = 'perfil_paciente'
COLUMNA_SUJETO = 'paciente_id'
COLUMNA_ANIO = kmc.ANIO                       # anio_parto: consumo ya no trae la fecha exacta de nacimiento
SIEMPRE_FUERA = frozenset({'iden_codigo'})    # además de lo que declare <esquema>.variable_restringida
BLOQUE = 2_000                                # filas por viaje del cursor de servidor
ANIO_MIN, ANIO_MAX = 1980, 2100
_NUMERICOS = {'smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision'}


@dataclass(frozen=True)
class ParametrosExtraccion:
    """Qué parte de la base se extrae. Sin nada, la base completa (como antes)."""
    fecha_corte: date | None = None
    anio_desde: int | None = None
    anio_hasta: int | None = None
    desde: date | None = None
    hasta: date | None = None
    limite: int | None = None

    def __post_init__(self) -> None:
        for n in ('fecha_corte', 'desde', 'hasta'):
            v = getattr(self, n)
            if v is not None and (not isinstance(v, date) or isinstance(v, datetime)):
                raise ValueError(f'{n} debe ser una fecha (AAAA-MM-DD), no {v!r}')
        for n in ('anio_desde', 'anio_hasta', 'limite'):
            v = getattr(self, n)
            if v is not None and (not isinstance(v, int) or isinstance(v, bool)):
                raise ValueError(f'{n} debe ser un número entero, no {v!r}')
        for n in ('anio_desde', 'anio_hasta'):
            v = getattr(self, n)
            if v is not None and not ANIO_MIN <= v <= ANIO_MAX:
                raise ValueError(f'{n}={v} fuera de {ANIO_MIN}-{ANIO_MAX}')
        if self.anio_desde is not None and self.anio_hasta is not None and self.anio_desde > self.anio_hasta:
            raise ValueError(f'anio_desde ({self.anio_desde}) es posterior a anio_hasta ({self.anio_hasta})')
        if self.desde and self.hasta and self.desde > self.hasta:
            raise ValueError(f'desde ({self.desde}) es posterior a hasta ({self.hasta})')
        if self.desde and self.fecha_corte and self.desde > self.fecha_corte:
            raise ValueError(f'desde ({self.desde}) es posterior a la fecha de corte ({self.fecha_corte})')
        if self.anio_desde is not None and self.fecha_corte and self.anio_desde > self.fecha_corte.year:
            raise ValueError(f'anio_desde ({self.anio_desde}) es posterior a la fecha de corte ({self.fecha_corte})')
        if self.limite is not None and self.limite < 1:
            raise ValueError('limite debe ser 1 o más')

    @classmethod
    def desde_textos(cls, fecha_corte: str | None = None, anio_desde: int | None = None,
                     anio_hasta: int | None = None, desde: str | None = None, hasta: str | None = None,
                     limite: int | None = None) -> ParametrosExtraccion:
        """Desde la CLI o un JSON: fechas como texto AAAA-MM-DD."""
        def f(nombre: str, valor: str | None) -> date | None:
            if valor in (None, ''):
                return None
            try:
                return date.fromisoformat(valor)
            except ValueError:
                raise ValueError(f'{nombre} debe ser AAAA-MM-DD, no {valor!r}') from None
        return cls(f('fecha_corte', fecha_corte), anio_desde, anio_hasta, f('desde', desde), f('hasta', hasta), limite)

    @property
    def tope(self) -> date | None:
        """La fecha después de la cual nada entra: la menor entre ``hasta`` y ``fecha_corte``."""
        fechas = [f for f in (self.hasta, self.fecha_corte) if f is not None]
        return min(fechas) if fechas else None

    @property
    def anio_maximo(self) -> int | None:
        """``anio_hasta`` acotado por el año del tope (nadie nacido después del corte)."""
        anios = [a for a in (self.anio_hasta, self.tope.year if self.tope else None) if a is not None]
        return min(anios) if anios else None

    @property
    def vacio(self) -> bool:
        return all(v is None for v in self.como_dict().values())

    def como_dict(self) -> dict[str, str | int | None]:
        return {'fecha_corte': _iso(self.fecha_corte), 'anio_desde': self.anio_desde, 'anio_hasta': self.anio_hasta,
                'desde': _iso(self.desde), 'hasta': _iso(self.hasta), 'limite': self.limite}


def _iso(f: date | None) -> str | None:
    return None if f is None else f.isoformat()


# ================================================================== consultas (texto con marcadores, sin valores)

Consulta = tuple[str, sql.Composable, dict]   # nombre, texto, valores


def _tabla(esquema: str, tabla: str) -> sql.Composed:
    return sql.SQL('{}.{}').format(sql.Identifier(esquema), sql.Identifier(tabla))


def consulta_existe(esquema: str, tabla: str) -> Consulta:
    return (f'existe_{tabla}', sql.SQL('SELECT EXISTS (SELECT 1 FROM information_schema.tables '
                                       'WHERE table_schema = %(esquema)s AND table_name = %(tabla)s)'),
            {'esquema': esquema, 'tabla': tabla})


def consulta_columnas(esquema: str) -> Consulta:
    return ('columnas', sql.SQL('SELECT column_name, data_type FROM information_schema.columns '
                                'WHERE table_schema = %(esquema)s AND table_name = %(tabla)s ORDER BY ordinal_position'),
            {'esquema': esquema, 'tabla': TABLA_ANCHA})


def consulta_restringidas(esquema: str) -> Consulta:
    return 'variable_restringida', sql.SQL('SELECT variable FROM {}').format(_tabla(esquema, 'variable_restringida')), {}


def consulta_diccionario(esquema: str) -> Consulta:
    return ('diccionario', sql.SQL('SELECT variable, nombre_corto, tipo, unidades, rango_min, rango_max, subtipo, '
                                   'origen, descripcion FROM {} ORDER BY variable').format(_tabla(esquema, 'diccionario')),
            {})


def consulta_categorias(esquema: str) -> Consulta:
    return ('categoria', sql.SQL('SELECT variable, codigo, etiqueta FROM {} WHERE NOT coalesce(es_missing, false) '
                                 'AND etiqueta IS NOT NULL ORDER BY variable, codigo').format(_tabla(esquema, 'categoria')),
            {})


def _anio(tipo: str | None) -> sql.Composable:
    col = sql.Identifier(COLUMNA_ANIO)
    if tipo in _NUMERICOS:
        return col
    return sql.SQL("CAST(NULLIF(btrim({}::text), '') AS numeric)").format(col)


def consulta_perfil(esquema: str, columnas: list[str], p: ParametrosExtraccion, tipo_anio: str | None) -> Consulta:
    """La tabla ancha, solo con ``columnas`` (sin las restringidas) y los filtros del servidor."""
    filtros, valores = [], {}
    if (p.anio_desde is not None or p.anio_maximo is not None) and tipo_anio is None:
        raise ValueError(f'{esquema}.{TABLA_ANCHA} no trae {COLUMNA_ANIO}: no se puede filtrar por año de nacimiento')
    if p.anio_desde is not None:
        filtros.append(sql.SQL('{} >= %(anio_desde)s').format(_anio(tipo_anio)))
        valores['anio_desde'] = p.anio_desde
    if p.anio_maximo is not None:
        filtros.append(sql.SQL('{} <= %(anio_hasta)s').format(_anio(tipo_anio)))
        valores['anio_hasta'] = p.anio_maximo
    q = sql.SQL('SELECT {} FROM {}').format(sql.SQL(', ').join(map(sql.Identifier, columnas)),
                                            _tabla(esquema, TABLA_ANCHA))
    if filtros:
        q += sql.SQL(' WHERE ') + sql.SQL(' AND ').join(filtros)
    q += sql.SQL(' ORDER BY {}').format(sql.Identifier(COLUMNA_SUJETO))
    if p.limite is not None:
        q += sql.SQL(' LIMIT %(limite)s')
        valores['limite'] = p.limite
    return 'perfil_paciente', q, valores


def texto(consulta: sql.Composable) -> str:
    return consulta.as_string(None)


def sha(texto_sql: str) -> str:
    return hashlib.sha256(texto_sql.encode('utf-8')).hexdigest()


# ================================================================== conexión y lectura

def conectar(cfg: Configuracion | None = None) -> psycopg.Connection:
    """Conexión de solo lectura: ``default_transaction_read_only`` en la sesión y ``read_only`` en psycopg."""
    cfg = cfg or obtener()
    if not (cfg.kmc_host and cfg.kmc_usuario):
        raise RuntimeError('Defina KMC_HOST y KMC_USUARIO (o guarde la conexión en Datos y modelos › Configuración).')
    if not cfg.kmc_pw:
        raise RuntimeError('Defina la variable de entorno KMC_PW con la clave de la base de la Fundación.')
    conn = psycopg.connect(host=cfg.kmc_host, port=cfg.kmc_port, dbname=cfg.kmc_db, user=cfg.kmc_usuario,
                           password=cfg.kmc_pw, sslmode=cfg.kmc_sslmode, connect_timeout=cfg.kmc_timeout,
                           application_name='maia-extraccion', autocommit=True)
    try:
        conn.execute('SET default_transaction_read_only = on')
        conn.autocommit = False
        conn.read_only = True
    except Exception:
        conn.close()
        raise
    return conn


class _Lector:
    """Ejecuta las consultas y guarda su texto (con marcadores, nunca con valores) para la trazabilidad."""

    def __init__(self, conn: psycopg.Connection) -> None:
        self.conn = conn
        self.consultas: list[tuple[str, str]] = []

    def _anotar(self, nombre: str, q: sql.Composable) -> None:
        self.consultas.append((nombre, texto(q)))

    def tabla(self, consulta: Consulta) -> pd.DataFrame:
        nombre, q, valores = consulta
        self._anotar(nombre, q)
        with self.conn.cursor() as cur:
            cur.execute(q, valores or None)
            columnas = [d.name for d in cur.description]
            return pd.DataFrame.from_records(cur.fetchall(), columns=columnas, coerce_float=True)

    def por_bloques(self, consulta: Consulta, bloque: int = BLOQUE) -> pd.DataFrame:
        """Cursor de servidor con nombre: la tabla ancha llega en bloques, no toda en una respuesta."""
        nombre, q, valores = consulta
        self._anotar(nombre, q)
        partes = []
        with self.conn.cursor(name=f'maia_{nombre}') as cur:
            cur.itersize = bloque
            cur.execute(q, valores or None)
            columnas = [d.name for d in cur.description]
            while filas := cur.fetchmany(bloque):
                partes.append(pd.DataFrame.from_records(filas, columns=columnas, coerce_float=True))
        if not partes:
            return pd.DataFrame(columns=columnas)
        return pd.concat(partes, ignore_index=True).infer_objects()


def _metadatos(lector: _Lector, esquema: str) -> pd.DataFrame:
    """Lo mismo que ``kmc.load_metadata``, con el esquema como identificador."""
    d = lector.tabla(consulta_diccionario(esquema))
    meta = pd.DataFrame({
        'variable': d.variable, 'label': d.nombre_corto, 'kind': d.tipo.map(kmc.KIND_BY_TYPE),
        'unit': d.unidades, 'range_min': pd.to_numeric(d.rango_min, errors='coerce').astype(float),
        'range_max': pd.to_numeric(d.rango_max, errors='coerce').astype(float),
        'source_type': d.tipo, 'subtype': d.subtipo, 'origin': d.origen, 'description': d.descripcion,
        'module': d.variable.str.extract(r'^([a-z]+)_', expand=False).fillna('seguimiento (v###)'),
    })
    c = lector.tabla(consulta_categorias(esquema))
    pares = c.codigo.astype(str).str.strip() + '=' + c.etiqueta.astype(str).str.replace(';', ',').str.strip()
    meta['categories'] = meta.variable.map(pares.groupby(c.variable).agg(';'.join)).fillna('')
    return meta[~meta.variable.isin(kmc.IDENTIFIERS)].reset_index(drop=True)


def _restringidas(lector: _Lector, esquema: str) -> set[str]:
    """Lo que la Fundación declaró reidentificable. Vacío si la tabla no existe (un consumo anterior)."""
    if not lector.tabla(consulta_existe(esquema, 'variable_restringida')).iloc[0, 0]:
        return set()
    return set(lector.tabla(consulta_restringidas(esquema)).variable.astype(str))


# ================================================================== fechas

def fechas_por_etapa(wide: pd.DataFrame, dic: D.Diccionario) -> dict[str, pd.Series]:
    """La fecha de cada visita del diccionario (la primera de sus ``fecha_variables`` que tenga dato)."""
    out = {}
    for r in dic.visitas.itertuples():
        columnas = [c for c in D.partes(r.fecha_variables) if c in wide]
        if not columnas:
            continue
        f = pd.Series(pd.NaT, index=wide.index, dtype='datetime64[ns]')
        for c in columnas:
            f = f.fillna(parse_dates(wide[c]).date)
        out[r.etapa] = f
    return out


def recortar_por_fechas(wide: pd.DataFrame, dic: D.Diccionario, p: ParametrosExtraccion) -> tuple[pd.DataFrame, int]:
    """Aplica ``desde``/``hasta``/``fecha_corte`` a la tabla ancha antes de pasarla a SEVARTI. Devuelve la tabla y
    cuántos niños salieron por fecha."""
    if p.tope is None and p.desde is None:
        return wide, 0
    fechas = fechas_por_etapa(wide, dic)
    if not fechas:
        return wide, 0
    todas = pd.concat(fechas.values(), axis=1)
    tope = pd.Timestamp(p.tope) if p.tope else None
    queda = pd.Series(True, index=wide.index)
    out = wide.copy()
    if tope is not None:
        visitas = dic.visitas.set_index('etapa')
        variables = dic.variables
        for etapa, f in fechas.items():
            despues = f > tope
            if not despues.any():
                continue
            edad = visitas.at[etapa, 'edad_variable']
            columnas = (set(variables.variable[variables.etapa == etapa]) | set(D.partes(visitas.at[etapa, 'fecha_variables']))
                        | ({edad} if pd.notna(edad) else set()))
            columnas = [c for c in columnas if c in out and c != COLUMNA_SUJETO]
            out.loc[despues, columnas] = np.nan
        queda &= ~(todas.min(axis=1) > tope)          # llegó después del corte
    if p.desde is not None:
        hasta = tope if tope is not None else pd.Timestamp.max
        queda &= todas.apply(lambda f: f.between(pd.Timestamp(p.desde), hasta)).any(axis=1)
    return out[queda].reset_index(drop=True), int((~queda).sum())


def _ajustar_corte(sev: Sevarti, p: ParametrosExtraccion) -> Sevarti:
    """Ninguna medición fechada después del tope (red de seguridad) y el corte que piden los parámetros."""
    if p.tope is None:
        return sev
    tope = pd.Timestamp(p.tope)
    m = sev.mediciones
    sev = replace(sev, mediciones=m[~(pd.to_datetime(m.fecha) > tope)].reset_index(drop=True))
    if p.fecha_corte is not None:
        return replace(sev, corte=pd.Timestamp(p.fecha_corte))
    if sev.corte is None or sev.corte > tope:
        return replace(sev, corte=tope)
    return sev


# ================================================================== extracción

def extraer(params: ParametrosExtraccion, ruta_diccionario: Path,
            cfg: Configuracion | None = None, bloque: int = BLOQUE) -> tuple[Sevarti, dict]:
    """La base pasada a SEVARTI según ``params`` y el diccionario de ``ruta_diccionario`` (se crea o se completa
    como en ``kmc.cargar_sevarti``). Los metadatos dicen qué se pidió y cómo, sin datos por niño ni claves."""
    cfg = cfg or obtener()
    esquema = cfg.kmc_esquema
    with conectar(cfg) as conn:
        lector = _Lector(conn)
        fuera = _restringidas(lector, esquema) | SIEMPRE_FUERA
        meta = _metadatos(lector, esquema)
        meta = meta[~meta.variable.isin(fuera)]
        tipos = dict(lector.tabla(consulta_columnas(esquema)).itertuples(index=False, name=None))
        if not tipos:
            raise RuntimeError(f'No existe {esquema}.{TABLA_ANCHA} o el usuario {cfg.kmc_usuario} no la ve.')
        if COLUMNA_SUJETO not in tipos or COLUMNA_SUJETO in fuera:
            raise RuntimeError(f'{esquema}.{TABLA_ANCHA} no trae {COLUMNA_SUJETO} (o está restringida).')
        columnas = [c for c in tipos if c not in fuera]
        wide = lector.por_bloques(consulta_perfil(esquema, columnas, params, tipos.get(COLUMNA_ANIO)), bloque)
    leidas = len(wide)
    wide = wide.drop(columns=[c for c in wide if c in fuera])   # por si acaso: no se pidieron
    dic = D.sincronizar(Path(ruta_diccionario), kmc.borrador(meta))
    wide, por_fecha = recortar_por_fechas(wide, dic, params)
    if wide.empty:
        raise ValueError(f'Ningún niño cumple los parámetros de extracción {params.como_dict()} '
                         f'({leidas} leídos, {por_fecha} fuera por fecha).')
    sev = _ajustar_corte(kmc.to_sevarti(dic, wide, restringidas=fuera), params)
    textos = [t for _, t in lector.consultas]
    metadatos = {
        'parametros': params.como_dict(),
        'consulta_sha': sha('\n;\n'.join(textos)),
        'consultas': [{'nombre': n, 'sha256': sha(t)} for n, t in lector.consultas],
        'origen': {'host': cfg.kmc_host, 'puerto': cfg.kmc_port, 'db': cfg.kmc_db, 'esquema': esquema},
        'columnas_excluidas': sorted(fuera & set(tipos)),
        'filas': {'perfil_paciente': leidas, 'excluidos_por_fecha': por_fecha,
                  'sujetos': int(sev.sujetos.sujeto.nunique()), 'mediciones': int(len(sev.mediciones))},
        'corte': None if sev.corte is None else str(pd.Timestamp(sev.corte).date()),
    }
    return sev, metadatos
