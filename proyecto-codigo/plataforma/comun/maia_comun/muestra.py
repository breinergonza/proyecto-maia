"""Muestras de niños: una gramática JSON versionada y el motor que la aplica a un ``Sevarti`` en memoria.

    {"version": 2,
     "y": [{"variable": "sexo", "tipo": "lista", "op": "en", "valores": ["M"], "cuando": "primera"},
           {"variable": "peso_nacer", "tipo": "numero", "op": "entre", "valores": [1000, 1500], "cuando": "primera"},
           {"variable": "oxigeno_3m", "tipo": "si_no", "op": "es", "valores": [true], "cuando": "ultima"}],
     "tiempo": {"fecha": "fecha_nacimiento", "modo": "periodo", "desde": "2018-01-01", "hasta": "2022-12-31"},
     "muestreo": {"modo": "estratificado", "por": "sede", "maximo_por_categoria": 200, "semilla": 7}}

* ``y``: filtros que se combinan con Y. ``tipo``/``op``: ``lista``/``en`` (el valor está entre ``valores``),
  ``si_no``/``es`` (``valores`` es ``[true]`` o ``[false]``) y ``numero``/``entre`` (``[mínimo, máximo]``, cualquiera
  puede ser ``null``; extremos incluidos). ``cuando`` dice qué medición del niño se mira (D1) y es obligatorio para las
  variables de rol ``medicion``, que se miden en cada visita: ``primera`` y ``ultima`` (la primera/última medición
  válida), ``alguna`` (alguna medición cumple) o ``etapa:<nombre>`` (la primera medición dentro de esa etapa).
  Los códigos especiales que declara el diccionario (un −1 no es un peso) nunca cuentan como dato.
* Variables que no están en el esquema y se pueden filtrar: ``sede`` (el ``grupo`` del niño) y ``eg_semanas``.
* ``tiempo``: ``fecha`` es ``fecha_nacimiento``, ``anio_nacimiento`` o ``fecha_visita`` (alguna medición en el
  periodo). Si el niño no trae fecha de parto cae al año de nacimiento (D34). ``modo`` ``periodo`` usa ``desde``/
  ``hasta`` (``AAAA``, ``AAAA-MM`` o ``AAAA-MM-DD``); ``ultimos_meses`` usa ``desde`` (o ``meses``) como número de
  meses hacia atrás desde la fecha del corte.
* ``muestreo``: ``todos`` o ``estratificado`` (a lo más ``maximo_por_categoria`` niños de cada categoría de ``por``,
  elegidos al azar con ``semilla``).

``facetas`` cuenta, para cada variable marcada como faceta, los niños de cada opción aplicando todos los filtros
menos el de esa misma variable (D35), para que la pantalla muestre qué pasaría al cambiarlo.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Sequence

import numpy as np
import pandas as pd

from sevarti import contrato as SV
from sevarti.contrato import Sevarti

VERSION = 2
TIPOS_Y = ('lista', 'si_no', 'numero')
OPERADOR = {'lista': 'en', 'si_no': 'es', 'numero': 'entre'}
CUANDO_SIMPLE = ('primera', 'ultima', 'alguna')
CAMPOS_FECHA = ('fecha_nacimiento', 'anio_nacimiento', 'fecha_visita')
MODOS_TIEMPO = ('periodo', 'ultimos_meses')
MODOS_MUESTREO = ('todos', 'estratificado')
VIRTUALES = {'sede': ('lista', 'Sede'), 'eg_semanas': ('numero', 'Edad gestacional (semanas)'),
             'eg_categoria': ('lista', 'Edad gestacional (categoría)')}
#: categorías por semanas de gestación: (nombre, desde incluido, hasta excluido). Cada una es una opción por sí sola:
#: elegir «muy prematuro» y «a término» NO incluye a los moderados (no es un rango continuo).
CATEGORIAS_EG = (('extremo', None, 28.0), ('muy_prematuro', 28.0, 32.0), ('moderado_tardio', 32.0, 37.0),
                 ('a_termino', 37.0, None))
NOMBRES_EG = tuple(c[0] for c in CATEGORIAS_EG)
SUFIJO_ULTIMA = '@ultima'
SIN_DATO = '(sin dato)'
MAX_BINS = 10

#: lo mismo que reconoce Postgres como número en ``atributos_sujeto`` y en ``consultas.medidas_numericas``
RE_NUMERO = r'^-?[0-9]+([.][0-9]+)?$'
_NUMERO = re.compile(RE_NUMERO)
# respuestas de sí/no tal como se escriben en las fuentes (en minúsculas)
SI = (frozenset({1.0}), frozenset({'si', 'sí', 'true', 's', 'yes', 'verdadero'}))
NO = (frozenset({0.0}), frozenset({'no', 'false', 'n', 'falso'}))


class MuestraInvalida(ValueError):
    def __init__(self, errores: Sequence[str]):
        self.errores = list(errores)
        super().__init__('La muestra no es válida: ' + '; '.join(self.errores))


# ================================================================== utilidades compartidas con filtros_sql

def es_numero(v: object) -> bool:
    return isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, (bool, np.bool_)) \
        and bool(np.isfinite(v))


def texto_numerico(v: object) -> float | None:
    """El número de un texto con la forma que reconoce la base (``-3``, ``12.5``); si no, ``None``."""
    return float(v) if isinstance(v, str) and _NUMERO.match(v) else None


def partir_valores(valores: Iterable) -> tuple[list[float], list[str]]:
    """Separa los valores de una lista en números y textos: un valor coincide si su número o su texto está en ellos."""
    nums: list[float] = []
    strs: list[str] = []
    for v in valores:
        if es_numero(v):
            nums.append(float(v))
        elif (x := texto_numerico(v)) is not None:
            nums.append(x)
        else:
            strs.append(str(v))
    return nums, strs


def respuesta_si_no(valores: Sequence) -> bool | None:
    """True/False para ``[true]``, ``[1]``, ``['si']``...; ``None`` si no se entiende."""
    if len(valores) != 1:
        return None
    v = valores[0]
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    if es_numero(v) and float(v) in (0.0, 1.0):
        return bool(v)
    if isinstance(v, str):
        t = v.strip().lower()
        if t in SI[1] or t == '1':
            return True
        if t in NO[1] or t == '0':
            return False
    return None


def canonico(texto: object, num: object = None) -> str:
    """El nombre de una opción: ``1.0`` y ``1`` son la misma opción (``1``)."""
    if num is None or (isinstance(num, float) and np.isnan(num)):
        num = texto_numerico(texto) if isinstance(texto, str) else None
    if num is not None and not (isinstance(num, float) and np.isnan(num)):
        return str(int(num)) if float(num).is_integer() else repr(float(num))
    return str(texto)


def categoria_eg(semanas: object) -> str | None:
    """La categoría por semanas de gestación (``CATEGORIAS_EG``); ``None`` si falta o no es un número."""
    try:
        eg = float(semanas)   # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not np.isfinite(eg):
        return None
    return next(n for n, lo, hi in CATEGORIAS_EG if (lo is None or eg >= lo) and (hi is None or eg < hi))


def huella(sujetos: Iterable[object]) -> str:
    """Hash estable de la lista de niños (sin importar el orden ni repeticiones)."""
    h = hashlib.sha256()
    for s in sorted({str(x) for x in sujetos}):
        h.update(s.encode('utf-8'))
        h.update(b'\n')
    return h.hexdigest()


def parse_fecha(valor: object, fin: bool = False) -> pd.Timestamp | None:
    """``AAAA``, ``AAAA-MM`` o ``AAAA-MM-DD``; el extremo final (``fin``) es el último día del periodo nombrado."""
    if valor is None or valor == '':
        return None
    t = str(valor).strip()
    try:
        if re.fullmatch(r'\d{4}', t):
            return pd.Timestamp(f'{t}-12-31' if fin else f'{t}-01-01')
        if re.fullmatch(r'\d{4}-\d{2}', t):
            d = pd.Timestamp(f'{t}-01')
            return d + pd.offsets.MonthEnd(0) if fin else d
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', t):
            return pd.Timestamp(t)
    except ValueError:
        pass
    raise ValueError(f'fecha no válida: {valor!r} (use AAAA, AAAA-MM o AAAA-MM-DD)')


def rango_tiempo(tiempo: dict, corte: object = None) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
    """(desde, hasta) del bloque ``tiempo``; sin extremo, ``None``."""
    if tiempo.get('modo') == 'ultimos_meses':
        c = pd.Timestamp(corte).normalize() if corte is not None else pd.Timestamp.today().normalize()
        return c - pd.DateOffset(months=int(tiempo.get('meses', tiempo.get('desde')))), c
    return parse_fecha(tiempo.get('desde')), parse_fecha(tiempo.get('hasta'), fin=True)


# ================================================================== normalizar y validar

def normalizar(muestra: dict | None) -> dict:
    """La muestra con todos sus bloques (sin filtros, sin tiempo, todos los niños si falta alguno)."""
    m = dict(muestra or {})
    m.setdefault('version', VERSION)
    m['y'] = [dict(e) for e in (m.get('y') or [])]
    m['tiempo'] = dict(m['tiempo']) if m.get('tiempo') else None
    m['muestreo'] = dict(m.get('muestreo') or {'modo': 'todos'})
    return m


def _filas_esquema(esquema: pd.DataFrame) -> dict[str, dict]:
    return {str(r['variable']): r for r in esquema.to_dict('records')}


def validar(muestra: dict, esquema: pd.DataFrame) -> list[str]:
    """Los problemas de la muestra, en español; lista vacía si es válida."""
    if not isinstance(muestra, dict):
        return ['La muestra debe ser un objeto JSON']
    errores: list[str] = []
    if muestra.get('version') != VERSION:
        errores.append(f'La versión de la muestra debe ser {VERSION} (trae {muestra.get("version")!r})')
    filas = _filas_esquema(esquema)
    y = muestra.get('y') or []
    if not isinstance(y, list):
        errores.append('"y" debe ser una lista de filtros')
        y = []
    for i, e in enumerate(y, 1):
        errores += [f'Filtro {i}: {t}' for t in _errores_filtro(e, filas)]
    t = muestra.get('tiempo')
    if t:
        errores += _errores_tiempo(t)
    errores += _errores_muestreo(muestra.get('muestreo') or {'modo': 'todos'}, filas)
    return errores


def exigir(muestra: dict, esquema: pd.DataFrame) -> dict:
    """La muestra normalizada, o ``MuestraInvalida`` con todos sus problemas."""
    m = normalizar(muestra)
    errores = validar(m, esquema)
    if errores:
        raise MuestraInvalida(errores)
    return m


def _errores_filtro(e: object, filas: dict[str, dict]) -> list[str]:
    if not isinstance(e, dict):
        return ['debe ser un objeto con variable, tipo, op y valores']
    v = e.get('variable')
    tipo = e.get('tipo')
    if v not in filas and v not in VIRTUALES:
        return [f'la variable "{v}" no existe en el diccionario']
    if tipo not in TIPOS_Y:
        return [f'"{v}": el tipo debe ser uno de {", ".join(TIPOS_Y)} (trae {tipo!r})']
    errores: list[str] = []
    if e.get('op') != OPERADOR[tipo]:
        errores.append(f'"{v}": con tipo {tipo} el operador debe ser "{OPERADOR[tipo]}" (trae {e.get("op")!r})')
    valores = e.get('valores')
    if not isinstance(valores, list):
        return errores + [f'"{v}": "valores" debe ser una lista']
    if tipo == 'lista' and not valores:
        errores.append(f'"{v}": elija al menos una opción')
    if tipo == 'si_no' and respuesta_si_no(valores) is None:
        errores.append(f'"{v}": para sí/no use "valores": [true] o [false]')
    if tipo == 'numero':
        if len(valores) != 2 or not all(x is None or es_numero(x) for x in valores):
            errores.append(f'"{v}": para un rango use "valores": [mínimo, máximo] (cualquiera puede ser null)')
        elif valores[0] is None and valores[1] is None:
            errores.append(f'"{v}": el rango necesita al menos un extremo')
        elif None not in valores and valores[0] > valores[1]:
            errores.append(f'"{v}": el mínimo ({valores[0]}) es mayor que el máximo ({valores[1]})')
    if v in VIRTUALES:
        if tipo != VIRTUALES[v][0]:
            errores.append(f'"{v}" se filtra con tipo {VIRTUALES[v][0]}')
        elif v == 'eg_categoria' and (malas := [x for x in valores if x not in NOMBRES_EG]):
            errores.append(f'"{v}": {malas[0]!r} no es una categoría; use {", ".join(NOMBRES_EG)}')
        return errores
    fila = filas[v]
    if fila['tipo'] in ('date', 'text'):
        errores.append(f'"{v}" es de tipo {fila["tipo"]}: no se puede filtrar')
    elif tipo == 'numero' and fila['tipo'] != 'numeric':
        errores.append(f'"{v}" no es numérica: use lista o sí/no')
    cuando = e.get('cuando')
    if cuando is None:
        if fila['rol'] == 'medicion':
            errores.append(f'"{v}" se mide en cada visita: diga cuándo mirarla ("cuando": primera, ultima, alguna o '
                           f'etapa:<nombre>)')
    elif not (cuando in CUANDO_SIMPLE or (isinstance(cuando, str) and cuando.startswith('etapa:')
                                          and cuando[6:].strip())):
        errores.append(f'"{v}": "cuando" debe ser primera, ultima, alguna o etapa:<nombre> (trae {cuando!r})')
    return errores


def _errores_tiempo(t: object) -> list[str]:
    if not isinstance(t, dict):
        return ['"tiempo" debe ser un objeto']
    errores = []
    if t.get('fecha') not in CAMPOS_FECHA:
        errores.append(f'Tiempo: "fecha" debe ser {", ".join(CAMPOS_FECHA)} (trae {t.get("fecha")!r})')
    if t.get('modo') not in MODOS_TIEMPO:
        errores.append(f'Tiempo: "modo" debe ser {" o ".join(MODOS_TIEMPO)} (trae {t.get("modo")!r})')
    elif t['modo'] == 'ultimos_meses':
        n = t.get('meses', t.get('desde'))
        if not (es_numero(n) and float(n) == int(n) and n > 0):
            errores.append('Tiempo: "ultimos_meses" necesita un número entero de meses mayor que cero en "desde"')
    else:
        try:
            d, h = parse_fecha(t.get('desde')), parse_fecha(t.get('hasta'), fin=True)
        except ValueError as ex:
            return errores + [f'Tiempo: {ex}']
        if d is None and h is None:
            errores.append('Tiempo: el periodo necesita "desde" o "hasta"')
        elif d is not None and h is not None and d > h:
            errores.append(f'Tiempo: "desde" ({t.get("desde")}) es posterior a "hasta" ({t.get("hasta")})')
    return errores


def _errores_muestreo(mu: object, filas: dict[str, dict]) -> list[str]:
    if not isinstance(mu, dict):
        return ['"muestreo" debe ser un objeto']
    if mu.get('modo', 'todos') not in MODOS_MUESTREO:
        return [f'Muestreo: "modo" debe ser {" o ".join(MODOS_MUESTREO)} (trae {mu.get("modo")!r})']
    if mu.get('modo', 'todos') == 'todos':
        return []
    errores = []
    por = mu.get('por')
    if por not in ('sede', 'eg_categoria') and (por not in filas or filas[por]['tipo'] not in ('categorical', 'boolean')):
        errores.append(f'Muestreo: "por" debe ser "sede", "eg_categoria" o una variable categórica (trae {por!r})')
    m = mu.get('maximo_por_categoria')
    if not (isinstance(m, int) and not isinstance(m, bool) and m >= 1):
        errores.append('Muestreo: "maximo_por_categoria" debe ser un entero mayor que cero')
    s = mu.get('semilla', 0)
    if not (isinstance(s, int) and not isinstance(s, bool)):
        errores.append('Muestreo: "semilla" debe ser un entero')
    return errores


# ================================================================== motor en memoria

class _Motor:
    """Evalúa los filtros sobre un ``Sevarti``; guarda lo ya calculado para reusarlo entre facetas."""

    def __init__(self, sev: Sevarti):
        self.sev = sev
        self.filas = _filas_esquema(sev.esquema)
        self.sujetos = sev.sujetos.drop_duplicates('sujeto').assign(sujeto=lambda d: d.sujeto.astype(str))
        self.todos: set[str] = set(self.sujetos.sujeto)
        self._validas: dict[str, pd.DataFrame] = {}
        self._cumple: dict[str, set[str]] = {}
        self._tiempo: dict[str, set[str]] = {}

    # -- filas válidas de una variable, en el orden de la tabla (el de ``ORDER BY id`` en Postgres)
    def validas(self, variable: str) -> pd.DataFrame:
        if variable not in self._validas:
            fila = self.filas[variable]
            m = self.sev.mediciones
            m = m[(m.variable == variable) & m.valor.notna()]
            txt = m.valor.map(str)
            num = txt.map(texto_numerico).astype(float)
            ok = pd.Series(True, index=m.index)
            if fila['tipo'] == 'numeric':
                ok &= num.notna()
            codigos = SV.codigos_declarados(fila.get('codigos_especiales'))
            if codigos:
                ok &= ~num.isin(codigos)
            self._validas[variable] = pd.DataFrame({'sujeto': m.sujeto.astype(str), 'txt': txt, 'num': num,
                                                    'edad_dias': pd.to_numeric(m.edad_dias, errors='coerce')})[ok]
        return self._validas[variable]

    def _en_etapa(self, df: pd.DataFrame, etapa: str) -> pd.DataFrame:
        et = self.sev.etapas[self.sev.etapas.etapa == etapa]
        if et.empty:
            raise MuestraInvalida([f'La etapa "{etapa}" no existe en este corte'])
        e = et.iloc[0]
        edad = df.edad_dias
        if e.base == 'corregida':
            eg = df.sujeto.map(self.sujetos.set_index('sujeto').eg_semanas)
            edad = SV.edad_corregida(edad, pd.to_numeric(eg, errors='coerce'))
        ok = edad.notna()
        if pd.notna(e.edad_min):
            ok &= edad >= e.edad_min
        if pd.notna(e.edad_max):
            ok &= edad <= e.edad_max
        return df[ok]

    def tabla(self, variable: str, cuando: str = 'primera') -> pd.DataFrame:
        """Un valor por niño (``txt``, ``num``), indexado por sujeto; ``alguna`` se trata como ``primera``."""
        if variable == 'sede':
            g = self.sujetos.set_index('sujeto').grupo.dropna()
            txt = g.map(canonico)
            return pd.DataFrame({'txt': txt, 'num': txt.map(texto_numerico).astype(float)})
        if variable == 'eg_semanas':
            eg = pd.to_numeric(self.sujetos.set_index('sujeto').eg_semanas, errors='coerce').dropna()
            return pd.DataFrame({'txt': eg.map(str), 'num': eg})
        if variable == 'eg_categoria':
            eg = pd.to_numeric(self.sujetos.set_index('sujeto').eg_semanas, errors='coerce').dropna()
            return pd.DataFrame({'txt': eg.map(categoria_eg), 'num': np.nan}, index=eg.index)
        df = self.validas(variable)
        if cuando.startswith('etapa:'):
            df = self._en_etapa(df, cuando[6:].strip())
        df = df.drop_duplicates('sujeto', keep='last' if cuando == 'ultima' else 'first')
        return df.set_index('sujeto')[['txt', 'num']]

    def cumple_filtro(self, e: dict) -> set[str]:
        clave = json.dumps(e, sort_keys=True, default=str)
        if clave not in self._cumple:
            self._cumple[clave] = self._evaluar(e)
        return self._cumple[clave]

    def _evaluar(self, e: dict) -> set[str]:
        v, tipo, valores = e['variable'], e['tipo'], e['valores']
        cuando = e.get('cuando') or 'primera'
        if cuando == 'alguna' and v not in VIRTUALES:
            df = self.validas(v)
            return set(df.sujeto[_coincide(df, tipo, valores)])
        t = self.tabla(v, cuando)
        return set(t.index[_coincide(t, tipo, valores)])

    def cumple_tiempo(self, t: dict) -> set[str]:
        clave = json.dumps(t, sort_keys=True, default=str)
        if clave not in self._tiempo:
            self._tiempo[clave] = self._evaluar_tiempo(t)
        return self._tiempo[clave]

    def _evaluar_tiempo(self, t: dict) -> set[str]:
        desde, hasta = rango_tiempo(t, self.sev.corte)
        if t['fecha'] == 'fecha_visita':
            f = pd.to_datetime(self.sev.mediciones.fecha, errors='coerce').dt.normalize()
            ok = _en_rango(f, desde, hasta)
            return set(self.sev.mediciones.sujeto[ok].astype(str))
        fecha = pd.to_datetime(self.sujetos.fecha_nacimiento, errors='coerce')
        anio = pd.to_numeric(self.sujetos['anio_nacimiento'], errors='coerce') if 'anio_nacimiento' in self.sujetos \
            else pd.Series(np.nan, index=self.sujetos.index)
        y0, y1 = (desde.year if desde is not None else None), (hasta.year if hasta is not None else None)
        if t['fecha'] == 'anio_nacimiento':
            ok = _en_rango(anio.fillna(fecha.dt.year), y0, y1)
        else:   # con fecha de parto se compara el día; sin ella, el año (D34)
            ok = (fecha.notna() & _en_rango(fecha.dt.normalize(), desde, hasta)) | \
                 (fecha.isna() & _en_rango(anio, y0, y1))
        return set(self.sujetos.sujeto[ok])

    def ids_filtrados(self, y: Sequence[dict], tiempo: dict | None) -> set[str]:
        ids = set(self.todos)
        for e in y:
            ids &= self.cumple_filtro(e)
        if tiempo:
            ids &= self.cumple_tiempo(tiempo)
        return ids

    def categoria(self, variable: str) -> pd.Series:
        """La categoría de cada niño (primera medición válida) para el muestreo estratificado."""
        t = self.tabla(variable, 'primera')
        cat = pd.Series([canonico(a, b) for a, b in zip(t.txt, t.num)], index=t.index, dtype=object)
        return cat.reindex(sorted(self.todos)).fillna(SIN_DATO)


def _en_rango(s: pd.Series, lo: object, hi: object) -> pd.Series:
    ok = s.notna()
    if lo is not None:
        ok &= s >= lo
    if hi is not None:
        ok &= s <= hi
    return ok


def _coincide(df: pd.DataFrame, tipo: str, valores: list) -> pd.Series:
    """Máscara de filas (``txt``, ``num``) que cumplen el filtro."""
    if tipo == 'numero':
        lo, hi = valores
        return _en_rango(df.num, lo, hi)
    if tipo == 'si_no':
        nums, strs = SI if respuesta_si_no(valores) else NO
        return df.num.isin(nums) | df.txt.str.lower().isin(strs)
    nums, strs = partir_valores(valores)
    return df.num.isin(nums) | df.txt.isin(strs)


def muestrear(categoria: pd.Series, maximo: int, semilla: int) -> list[str]:
    """A lo más ``maximo`` niños por categoría, al azar pero reproducible: mismas entradas, mismos niños.
    ``categoria`` es una serie indexada por sujeto."""
    rng = np.random.default_rng(semilla)
    elegidos: list[str] = []
    for cat in sorted(categoria.unique(), key=str):
        suj = sorted(categoria.index[categoria == cat])
        if len(suj) > maximo:
            suj = [suj[i] for i in sorted(rng.choice(len(suj), size=maximo, replace=False))]
        elegidos += suj
    return sorted(elegidos)


# ================================================================== API pública

def ids(sev: Sevarti, muestra: dict, muestreo: bool = True) -> list[str]:
    """Los sujetos de la muestra, ordenados. Con ``muestreo=False`` no se aplica el tope por categoría."""
    m = exigir(muestra, sev.esquema)
    motor = _Motor(sev)
    elegidos = motor.ids_filtrados(m['y'], m['tiempo'])
    mu = m['muestreo']
    if muestreo and mu.get('modo') == 'estratificado' and elegidos:
        cat = motor.categoria(mu['por'])
        elegidos = set(muestrear(cat[cat.index.isin(elegidos)], mu['maximo_por_categoria'], mu.get('semilla', 0)))
    return sorted(elegidos)


def aplicar(sev: Sevarti, muestra: dict, muestreo: bool = True) -> Sevarti:
    """El ``Sevarti`` recortado a los niños de la muestra: sus sujetos, mediciones y episodios."""
    lista = ids(sev, muestra, muestreo)
    return sev.subconjunto(lista)


def contar(sev: Sevarti, muestra: dict, muestreo: bool = True) -> int:
    """Cuántos niños tiene la muestra (igual a los sujetos de ``aplicar``)."""
    return len(ids(sev, muestra, muestreo))


def sedes(sev: Sevarti) -> list[str]:
    g = sev.sujetos.grupo.dropna().map(canonico)
    return sorted(g.unique(), key=lambda x: (len(x), x))


def facetas(sev: Sevarti, muestra: dict, variables: Sequence[str] | None = None) -> dict[str, dict]:
    """Conteos por opción de cada faceta aplicando los demás filtros pero no el propio (D35).

    ``variables``: las variables marcadas como faceta en el diccionario (categóricas, sí/no o numéricas);
    ``sede`` se agrega sola si el corte tiene más de un grupo. Devuelve, por variable,
    ``{"etiqueta", "tipo": "lista"|"numero", "opciones": [{"valor", "etiqueta", "n"}]}``; las numéricas traen
    ``"n"``, ``"min"``, ``"max"`` y ``"bins"`` (``desde``, ``hasta``, ``n``) en vez de opciones. ``n`` es siempre
    de niños; las opciones sin niños salen con 0. El muestreo no se aplica."""
    m = exigir(muestra, sev.esquema)
    motor = _Motor(sev)
    etiquetas = SV.etiquetas_categoria(sev.esquema)
    candidatas = (['sede'] if len(sedes(sev)) > 1 else []) + [v for v in (variables or []) if v != 'sede']
    salida: dict[str, dict] = {}
    for v in candidatas:
        if v not in motor.filas and v not in VIRTUALES:
            raise MuestraInvalida([f'La faceta "{v}" no existe en el diccionario'])
        propio = next((e for e in m['y'] if e['variable'] == v), None)
        cuando = (propio or {}).get('cuando') or 'primera'
        if cuando == 'alguna':
            cuando = 'primera'
        cumplen = motor.ids_filtrados([e for e in m['y'] if e['variable'] != v], m['tiempo'])
        t = motor.tabla(v, cuando)
        numerica = VIRTUALES[v][0] == 'numero' if v in VIRTUALES else motor.filas[v]['tipo'] == 'numeric'
        etiqueta = VIRTUALES[v][1] if v in VIRTUALES else (motor.filas[v].get('etiqueta') or v)
        etiqueta = etiqueta if isinstance(etiqueta, str) and etiqueta else v
        if numerica:
            salida[v] = {'etiqueta': etiqueta, 'tipo': 'numero', **_numerica(t.num[t.index.isin(cumplen)].dropna())}
            continue
        canon = pd.Series([canonico(a, b) for a, b in zip(t.txt, t.num)], index=t.index, dtype=object)
        nombres = etiquetas.get(v, {})
        conteo = canon[canon.index.isin(cumplen)].value_counts()
        opciones = []
        for valor in sorted(canon.unique(), key=lambda x: (len(x), x)):
            num = texto_numerico(valor)
            entero = num is not None and num.is_integer()
            opciones.append({'valor': int(num) if entero else (num if num is not None else valor),
                             'etiqueta': nombres.get(num, valor) if num is not None else valor,
                             'n': int(conteo.get(valor, 0))})
        salida[v] = {'etiqueta': etiqueta, 'tipo': 'lista', 'opciones': opciones}
    return salida


def _numerica(x: pd.Series) -> dict:
    if x.empty:
        return {'n': 0, 'min': None, 'max': None, 'bins': []}
    lo, hi = float(x.min()), float(x.max())
    if lo == hi:
        return {'n': int(len(x)), 'min': lo, 'max': hi, 'bins': [{'desde': lo, 'hasta': hi, 'n': int(len(x))}]}
    bordes = np.linspace(lo, hi, MAX_BINS + 1)
    cuenta, _ = np.histogram(x, bins=bordes)
    return {'n': int(len(x)), 'min': lo, 'max': hi,
            'bins': [{'desde': float(a), 'hasta': float(b), 'n': int(c)}
                     for a, b, c in zip(bordes[:-1], bordes[1:], cuenta)]}
