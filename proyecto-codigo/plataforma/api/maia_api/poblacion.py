"""Lo que comparten /muestras y /exploracion: el corte con el que se trabaja, los niños de una muestra, las facetas
(conteos por opción) y la reserva de cifras pequeñas (D4, D46). Todo se calcula en Postgres sobre
``sevarti.atributos_sujeto``; no se leen las mediciones."""
from __future__ import annotations

from collections.abc import Sequence

import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from maia_api.consultas import etapas
from maia_comun import muestra as M
from maia_comun import perfiles as PF
from maia_comun.filtros_sql import esquema_de_db, ids_muestra, lecturas
from maia_comun.modelos_db import Corte
from maia_comun.sevarti_db import corte_vigente
from sevarti import contrato as SV

#: Variables que se ofrecen como filtro rápido además de las de rol basal. Si el Diccionario marca alguna variable con
#: «Usar como filtro» (parche 11 del núcleo), decide ella y esta constante solo aporta las del niño (sede, edad
#: gestacional); sin marcas, vale tal cual.
FACETAS_POR_DEFECTO = ('sede', 'ern_sexo', 'eg_categoria', 'eg_semanas', 'ern_lubchencofenton')
VARIABLES_SEXO = ('ern_sexo', 'sexo')
MIN_NINOS = 20          # D46: con menos niños no se muestran cifras ni se guarda un filtro
MIN_OPCION = PF.MIN_GRUPO   # D4: una opción con menos niños se muestra como «<5»
MAX_OPCIONES = 30       # una variable con más opciones distintas es texto libre, no una faceta
TOPE_REDONDEO = 100     # D46: para el rol visualizador, los conteos menores se redondean a múltiplos de 5
TIPOS_FILTRABLES = {'categorical': 'lista', 'boolean': 'si_no', 'numeric': 'numero'}
# categorías por semanas de gestación: (categoría, desde incluido, hasta excluido); cada una es una opción por sí sola
CATEGORIAS_EG = M.CATEGORIAS_EG
REGLAS = ('primera', 'ultima', 'alguna')   # D1; además ``etapa:<nombre>``
ETIQUETAS_REGLA = {'primera': 'Primera medición', 'ultima': 'Última medición', 'alguna': 'En alguna visita'}


def corte_actual(s: Session) -> Corte:
    c = corte_vigente(s)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Todavía no hay datos cargados para filtrar.')
    return c


def n_base(s: Session, corte_id: int) -> int:
    return s.execute(text('SELECT count(*) FROM sevarti.sujetos WHERE corte_id = :c'), {'c': corte_id}).scalar_one()


def ids_de(s: Session, corte_id: int, muestra: dict | None, muestreo: bool = True) -> list[str]:
    """Los niños de la muestra; una muestra mal armada es un 422 con todos sus problemas."""
    try:
        return ids_muestra(s, corte_id, muestra or {'version': M.VERSION}, muestreo=muestreo)
    except M.MuestraInvalida as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, ' '.join(e.errores)) from None


def sin_filtros(muestra: dict | None) -> bool:
    m = M.normalizar(muestra)
    return not m['y'] and not m['tiempo']


def proteger(n: int, redondear: bool = False) -> int:
    """D46: un conteo menor de 100 se redondea a múltiplos de 5 para quien solo consulta."""
    return int(n / 5 + 0.5) * 5 if redondear and n < TOPE_REDONDEO else int(n)


def cifra(n: int, redondear: bool = False, ocultar: bool = True) -> dict:
    """Un conteo de opción: ``n`` y ``texto``. D4: de 1 a 4 niños no se da la cifra (``n`` nulo, texto «<5»)."""
    if ocultar and 0 < n < MIN_OPCION:
        return {'n': None, 'texto': f'<{MIN_OPCION}'}
    v = proteger(n, redondear)
    return {'n': v, 'texto': str(v)}


# ---------------------------------------------------------------- qué variables se ofrecen

def sedes(s: Session, corte_id: int) -> list[str]:
    filas = s.execute(text('SELECT DISTINCT grupo FROM sevarti.sujetos WHERE corte_id = :c AND grupo IS NOT NULL'),
                      {'c': corte_id}).all()
    return sorted((M.canonico(g) for (g,) in filas), key=lambda x: (len(x), x))


def _marcada(fila: dict) -> bool:
    """La marca «Usar como filtro» del Diccionario (D35), si el corte ya trae esa columna."""
    v = fila.get('usar_como_filtro')
    return str(v).strip().lower() in ('1', '1.0', 'true', 'si', 'sí', 'x', 'verdadero') if v is not None else False


def _filtrable(filas: dict, v: str) -> bool:
    return v in M.VIRTUALES or (v in filas and filas[v]['tipo'] in TIPOS_FILTRABLES)


def elegir_facetas(esquema: pd.DataFrame, hay_sedes: bool, extra: Sequence[str] = ()) -> list[str]:
    """Las variables que se ofrecen con sus conteos: las de ``FACETAS_POR_DEFECTO`` que existan, las de rol basal y
    las marcadas «usar como filtro» en el Diccionario (D35, también las de medición) que se puedan filtrar, y las
    ``extra`` que se pidieron (las que ya están en el filtro o que se agregaron). ``sede`` solo si hay más de un grupo."""
    filas = {str(r['variable']): r for r in esquema.to_dict('records')}
    marcadas = [v for v, f in filas.items() if f['tipo'] in TIPOS_FILTRABLES and _marcada(f)]
    if marcadas:   # el Diccionario decide las variables (D35); la sede y la edad gestacional son del niño y siempre van
        elegidas = [v for v in FACETAS_POR_DEFECTO if v in M.VIRTUALES and (v != 'sede' or hay_sedes)]
        elegidas += [v for v in marcadas if v not in elegidas]
    else:           # ninguna marcada (un corte anterior a la columna): las de siempre
        elegidas = [v for v in FACETAS_POR_DEFECTO if (v != 'sede' or hay_sedes) and _filtrable(filas, v)]
        elegidas += [v for v, f in filas.items() if v not in elegidas and f['tipo'] in TIPOS_FILTRABLES
                     and (f['rol'] == 'basal' or _marcada(f))]
    elegidas += [v for v in dict.fromkeys(extra) if v not in elegidas and (v != 'sede' or hay_sedes) and _filtrable(filas, v)]
    return elegidas


def etiqueta_de(filas: dict, v: str) -> str:
    if v in M.VIRTUALES:
        return M.VIRTUALES[v][1]
    e = filas[v].get('etiqueta')
    return e if isinstance(e, str) and e.strip() else v.replace('_', ' ')


def tipo_de(filas: dict, v: str) -> str:
    return 'lista' if v == 'sede' else M.VIRTUALES[v][0] if v in M.VIRTUALES else TIPOS_FILTRABLES[filas[v]['tipo']]


def regla_por_defecto(filas: dict, v: str) -> str | None:
    """La regla de lectura con que se estrena una variable (D1): ninguna para las de la ficha del niño, ``primera``
    para las basales y ``alguna`` para las que se miden en cada visita (el niño «tuvo» oxígeno en alguna)."""
    if v in M.VIRTUALES:
        return None
    return 'alguna' if filas[v].get('rol') == 'medicion' else 'primera'


def reglas_de(filas: dict, v: str) -> list[str]:
    """Las reglas de lectura que tiene sentido ofrecer: solo las variables que se miden en cada visita las eligen."""
    return [] if v in M.VIRTUALES or filas[v].get('rol') != 'medicion' else list(REGLAS)


def _opciones_de(s: Session, corte_id: int, filas: dict, etiquetas: dict, v: str, tipo: str) -> list[dict]:
    if v == 'sede':
        return [{'valor': g, 'etiqueta': g} for g in sedes(s, corte_id)]
    if v == 'eg_categoria':
        return [{'valor': c, 'etiqueta': PF.ETIQUETAS_EG[c], 'rango': [lo, hi]} for c, lo, hi in CATEGORIAS_EG]
    if tipo == 'si_no':
        return [{'valor': True, 'etiqueta': 'Sí'}, {'valor': False, 'etiqueta': 'No'}]
    if v in etiquetas:
        return [{'valor': int(k) if float(k).is_integer() else k, 'etiqueta': e} for k, e in etiquetas[v].items()]
    return []


def variables_ofrecidas(s: Session, corte_id: int) -> list[dict]:
    """Para el selector «+ Agregar variable»: tipo, opciones del diccionario y la regla ``cuando`` sugerida (con las
    ``reglas`` que se pueden elegir)."""
    esq = esquema_de_db(s, corte_id)
    filas = {str(r['variable']): r for r in esq.to_dict('records')}
    etiquetas = SV.etiquetas_categoria(esq)
    salida = []
    for v in elegir_facetas(esq, len(sedes(s, corte_id)) > 1):
        tipo = tipo_de(filas, v)
        salida.append({'variable': v, 'etiqueta': etiqueta_de(filas, v), 'tipo': tipo,
                       'cuando': regla_por_defecto(filas, v), 'reglas': reglas_de(filas, v),
                       'opciones': _opciones_de(s, corte_id, filas, etiquetas, v, tipo)})
    return salida


def disponibles(esquema: pd.DataFrame, ofrecidas: Sequence[str]) -> list[dict]:
    """Las demás variables que se pueden agregar como filtro (sin conteos hasta que se agregan)."""
    filas = {str(r['variable']): r for r in esquema.to_dict('records')}
    return [{'variable': v, 'etiqueta': etiqueta_de(filas, v), 'tipo': tipo_de(filas, v),
             'cuando': regla_por_defecto(filas, v), 'reglas': reglas_de(filas, v)}
            for v in sorted(filas, key=lambda x: etiqueta_de(filas, x).lower())
            if v not in ofrecidas and filas[v]['tipo'] in TIPOS_FILTRABLES]


# ---------------------------------------------------------------- facetas

def _lista_sede(s: Session, c: int, ids: list[str]) -> dict:
    filas = s.execute(text('SELECT grupo, count(*) FILTER (WHERE sujeto = ANY(:i)) AS n '
                           'FROM sevarti.sujetos WHERE corte_id = :c AND grupo IS NOT NULL GROUP BY grupo'),
                      {'c': c, 'i': ids}).all()
    return {'opciones': sorted(({'valor': M.canonico(g), 'etiqueta': M.canonico(g), 'n': n} for g, n in filas),
                               key=lambda o: (len(o['valor']), o['valor']))}


def _semanas(s: Session, c: int, ids: list[str]) -> list[float]:
    return [float(eg) for (eg,) in s.execute(text('SELECT eg_semanas FROM sevarti.sujetos WHERE corte_id = :c '
                                                  'AND sujeto = ANY(:i) AND eg_semanas IS NOT NULL'), {'c': c, 'i': ids})]


def _lista_eg(s: Session, c: int, ids: list[str]) -> dict:
    cuenta: dict[str, int] = {}
    for eg in _semanas(s, c, ids):
        cat = M.categoria_eg(eg)
        cuenta[cat] = cuenta.get(cat, 0) + 1
    return {'opciones': [{'valor': cat, 'etiqueta': PF.ETIQUETAS_EG[cat], 'rango': [lo, hi], 'n': cuenta.get(cat, 0)}
                         for cat, lo, hi in CATEGORIAS_EG]}


def _lista_atributo(s: Session, c: int, v: str, nombre: str, ids: list[str], tipo: str, etiquetas: dict,
                    lect: pd.DataFrame | None = None) -> dict | None:
    """Conteos por opción. Con ``lect`` (las lecturas de ``alguna`` o de una etapa) se cuenta cada niño una vez por
    opción; sin ella, se cuenta en Postgres sobre ``atributos_sujeto`` (primera o última medición)."""
    if lect is None:
        filas = s.execute(text('SELECT valor, valor_num, count(*) FILTER (WHERE sujeto = ANY(:i)) AS n '
                               'FROM sevarti.atributos_sujeto WHERE corte_id = :c AND variable = :v '
                               'GROUP BY valor, valor_num'), {'c': c, 'v': nombre, 'i': ids}).all()
    else:
        g = lect.drop_duplicates(['sujeto', 'txt']).groupby(['txt', 'num'], dropna=False).size()
        filas = [(txt, None if pd.isna(num) else float(num), int(n)) for (txt, num), n in g.items()]
    if tipo == 'si_no':
        si_no = {True: 0, False: 0}
        for valor, num, n in filas:
            r = M.respuesta_si_no([num if num is not None else valor])
            if r is not None:
                si_no[r] += n
        return {'opciones': [{'valor': True, 'etiqueta': 'Sí', 'n': si_no[True]},
                             {'valor': False, 'etiqueta': 'No', 'n': si_no[False]}]}
    cuenta: dict[str, int] = {}
    for valor, num, n in filas:
        k = M.canonico(valor, num)
        cuenta[k] = cuenta.get(k, 0) + n
    if len(cuenta) > MAX_OPCIONES:
        return None
    opciones = []
    for k in sorted(cuenta, key=lambda x: (len(x), x)):
        num = M.texto_numerico(k)
        entero = num is not None and num.is_integer()
        opciones.append({'valor': int(num) if entero else (num if num is not None else k),
                         'etiqueta': etiquetas.get(v, {}).get(num, k) if num is not None else k, 'n': cuenta[k]})
    return {'opciones': opciones}


def _resumen_numerico(valores: list[float], ninos: int, redondear: bool) -> dict:
    r = M._numerica(pd.Series(valores, dtype=float))
    return {'cifra': cifra(ninos, redondear), 'min': r['min'], 'max': r['max'],
            'bins': [{'desde': b['desde'], 'hasta': b['hasta'], **cifra(b['n'], redondear)} for b in r['bins']]}


def _numerica(s: Session, c: int, nombre: str, ids: list[str], redondear: bool, lect: pd.DataFrame | None = None) -> dict:
    if lect is not None:
        v = lect.dropna(subset=['num'])
        return _resumen_numerico(list(v.num.astype(float)), int(v.sujeto.nunique()), redondear)
    valores = [x for (x,) in s.execute(text('SELECT valor_num FROM sevarti.atributos_sujeto WHERE corte_id = :c '
                                            'AND variable = :v AND valor_num IS NOT NULL AND sujeto = ANY(:i)'),
                                       {'c': c, 'v': nombre, 'i': ids})]
    return _resumen_numerico(valores, len(valores), redondear)


def _regla_de(filas: dict, v: str, entrada: dict | None, pedidas: dict[str, str]) -> str | None:
    """La regla de lectura con que se cuenta ``v``: la del filtro puesto, la pedida al agregarla o la de siempre."""
    if v in M.VIRTUALES:
        return None
    return (entrada or {}).get('cuando') or pedidas.get(v) or regla_por_defecto(filas, v)


def facetas(s: Session, corte_id: int, muestra: dict | None, redondear: bool = False,
            extra: Sequence[dict] | None = None) -> dict:
    """Conteos por opción de cada faceta aplicando los demás filtros pero no el propio (D35). D4: opciones con 1 a 4
    niños salen como «<5»; con ``redondear`` (visualizador) los conteos menores de 100 van de 5 en 5 (D46). Una opción
    sin niños sale con ``n`` 0 y texto «0»: es un cero real, no un dato oculto. ``extra``: variables que se pidieron
    además de las de siempre, ``[{"variable", "cuando"}]``; las que ya están en el filtro se agregan solas."""
    esq = esquema_de_db(s, corte_id)
    filas = {str(r['variable']): r for r in esq.to_dict('records')}
    etiquetas = SV.etiquetas_categoria(esq)
    m = M.exigir(muestra or {'version': M.VERSION}, esq)
    por_variable = {e['variable']: e for e in m['y']}
    pedidas = {str(e['variable']): e['cuando'] for e in (extra or []) if e.get('variable') and e.get('cuando')}
    # edad gestacional en categorías y en semanas son la misma dimensión: elegir una no quita las opciones de la otra
    misma = {'eg_semanas': 'eg_categoria', 'eg_categoria': 'eg_semanas'}
    cache: dict[str | None, list[str]] = {}

    def cumplen(excluidas: tuple[str, ...]) -> list[str]:
        clave = excluidas or None
        if clave not in cache:
            y = [e for e in m['y'] if e['variable'] not in excluidas]
            cache[clave] = ids_de(s, corte_id, {**m, 'y': y}, muestreo=False)
        return cache[clave]

    salida: dict[str, dict] = {}
    pedir = list(dict.fromkeys([*por_variable, *(str(e['variable']) for e in (extra or []) if e.get('variable'))]))
    for v in elegir_facetas(esq, len(sedes(s, corte_id)) > 1, pedir):
        ids = cumplen((v, misma[v]) if v in misma and (v in por_variable or misma[v] in por_variable) else
                      (v,) if v in por_variable else ())
        tipo = tipo_de(filas, v)
        cuando = _regla_de(filas, v, por_variable.get(v), pedidas)
        nombre = v + (M.SUFIJO_ULTIMA if cuando == 'ultima' else '')
        lect = None
        if cuando not in (None, 'primera', 'ultima'):   # alguna / etapa:<x>: no están en atributos_sujeto
            try:
                lect = lecturas(s, corte_id, v, cuando, ids)
            except M.MuestraInvalida as e:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, ' '.join(e.errores)) from None
        if v == 'sede':
            r = _lista_sede(s, corte_id, ids)
        elif v == 'eg_categoria':
            r = _lista_eg(s, corte_id, ids)
        elif v == 'eg_semanas':
            sem = _semanas(s, corte_id, ids)
            r = _resumen_numerico(sem, len(sem), redondear)
        elif tipo == 'numero':
            r = _numerica(s, corte_id, nombre, ids, redondear, lect)
        else:
            r = _lista_atributo(s, corte_id, v, nombre, ids, tipo, etiquetas, lect)
            if r is None:
                continue
        for o in r.get('opciones', []):
            o.update(cifra(o['n'], redondear))
        salida[v] = {'etiqueta': etiqueta_de(filas, v), 'tipo': tipo, 'cuando': cuando, 'reglas': reglas_de(filas, v),
                     'destacada': v in FACETAS_POR_DEFECTO or (v in filas and _marcada(filas[v])), **r}
    return {'n': len(cumplen(())), 'facetas': salida, **meta(s, corte_id, esq, filas, list(salida))}


def meta(s: Session, corte_id: int, esq: pd.DataFrame, filas: dict, mostradas: list[str]) -> dict:
    """Lo que la pantalla necesita para el tiempo, el muestreo y la regla de lectura (D1, D34): qué fechas trae el
    corte, por qué categorías se puede estratificar, las visitas y las demás variables que se pueden agregar."""
    f = s.execute(text('SELECT count(fecha_nacimiento), min(fecha_nacimiento), max(fecha_nacimiento), '
                       'min(anio_nacimiento), max(anio_nacimiento) FROM sevarti.sujetos WHERE corte_id = :c'),
                  {'c': corte_id}).one()
    corte = s.get(Corte, corte_id)
    con_fecha = f[0] > 0
    campos = ([{'valor': 'fecha_nacimiento', 'etiqueta': 'Fecha de nacimiento'}] if con_fecha else []) \
        + [{'valor': 'anio_nacimiento', 'etiqueta': 'Año de nacimiento'}, {'valor': 'fecha_visita', 'etiqueta': 'Fecha de visita'}]
    anios = [x for x in (f[3], f[4], f[1].year if f[1] else None, f[2].year if f[2] else None) if x is not None]
    por = [{'valor': v, 'etiqueta': etiqueta_de(filas, v)} for v in mostradas
           if v not in ('eg_semanas',) and tipo_de(filas, v) == 'lista']
    return {
        'tiempo': {'campos': campos, 'defecto': campos[0]['valor'], 'hay_fecha_nacimiento': con_fecha,
                   'desde': min(anios) if anios else None, 'hasta': max(anios) if anios else None,
                   'corte': str(corte.fecha_corte) if corte else None},
        'muestreo': {'por': por},
        'etapas': [{'etapa': k, 'nombre': e['nombre']} for k, e in sorted(
            etapas(s, corte_id).items(), key=lambda kv: kv[1]['orden'])],
        'disponibles': disponibles(esq, mostradas),
    }


# ---------------------------------------------------------------- quiénes son (sexo, edad gestacional, Lubchenco, sede)

def categorias_por_nino(s: Session, corte_id: int) -> pd.DataFrame:
    """Una fila por niño del corte con su categoría de sexo, edad gestacional, Lubchenco y sede (nulo si falta)."""
    esq = esquema_de_db(s, corte_id)
    nombres = set(esq.variable.astype(str))
    base = pd.DataFrame(s.execute(text('SELECT sujeto, grupo, eg_semanas FROM sevarti.sujetos WHERE corte_id = :c'),
                                  {'c': corte_id}).all(), columns=['sujeto', 'grupo', 'eg_semanas']).set_index('sujeto')
    sexo_v = next((v for v in VARIABLES_SEXO if v in nombres), None)

    def primera(v: str | None) -> pd.DataFrame:
        if v is None:
            return pd.DataFrame(columns=['valor', 'valor_num'])
        f = s.execute(text('SELECT sujeto, valor, valor_num FROM sevarti.atributos_sujeto '
                           'WHERE corte_id = :c AND variable = :v'), {'c': corte_id, 'v': v}).all()
        return pd.DataFrame(f, columns=['sujeto', 'valor', 'valor_num']).set_index('sujeto')

    sexo = primera(sexo_v)
    etiquetas = SV.etiquetas_categoria(esq).get(sexo_v or '', {})
    lub = primera(PF.VARIABLE_LUBCHENCO if PF.VARIABLE_LUBCHENCO in nombres else None)
    out = pd.DataFrame(index=base.index)
    # sin fila de atributo, reindex deja NaN (no None): ese niño no tiene el dato, no la opción «nan»
    out['sexo'] = [None if pd.isna(n) and (v is None or pd.isna(v)) else etiquetas.get(n, M.canonico(v, n))
                   for v, n in zip(sexo.valor.reindex(base.index), sexo.valor_num.reindex(base.index))]
    out['eg'] = base.eg_semanas.map(PF.categoria_eg)
    out['lubchenco'] = lub.valor.reindex(base.index).map(PF.categoria_lubchenco)
    out['sede'] = base.grupo.map(lambda g: None if g is None else M.canonico(g))
    return out


_ORDEN = {'eg': (list(PF.ETIQUETAS_EG), PF.ETIQUETAS_EG), 'lubchenco': (list(PF.ETIQUETAS_LUBCHENCO), PF.ETIQUETAS_LUBCHENCO)}
_TITULOS = {'sexo': 'Sexo', 'eg': 'Edad gestacional', 'lubchenco': 'Peso para la edad gestacional', 'sede': 'Sede'}


def distribuciones(cat: pd.DataFrame, ids: list[str]) -> dict:
    """Reparto en % del grupo frente a todos los niños; los que no tienen el dato no cuentan en el porcentaje."""
    grupo = cat[cat.index.isin(ids)]
    salida: dict[str, dict] = {}
    for col, titulo in _TITULOS.items():
        todos_c, grupo_c = cat[col].dropna(), grupo[col].dropna()
        if col == 'sede' and todos_c.nunique() < 2:
            continue
        if todos_c.empty:
            continue
        orden, nombres = _ORDEN.get(col, (sorted(todos_c.unique(), key=lambda x: (len(x), x)), {}))
        filas = []
        for c in orden:
            filas.append({'categoria': c, 'etiqueta': nombres.get(c, c),
                          'grupo': round(100.0 * (grupo_c == c).sum() / len(grupo_c), 1) if len(grupo_c) else None,
                          'todos': round(100.0 * (todos_c == c).sum() / len(todos_c), 1)})
        salida[col] = {'etiqueta': titulo, 'categorias': filas}
    return salida


def resumen_poblacion(cat: pd.DataFrame, ids: list[str]) -> dict:
    """Cuántos niños de la muestra hay en cada categoría, para guardar con ella; D4: de 1 a 4 niños no se anota."""
    grupo = cat[cat.index.isin(ids)]
    salida: dict[str, dict] = {}
    for col in _TITULOS:
        cuenta = grupo[col].dropna().value_counts()
        if cuenta.empty or (col == 'sede' and cat[col].dropna().nunique() < 2):
            continue
        salida[col] = {str(k): (int(n) if n >= MIN_OPCION else None) for k, n in cuenta.items()}
    return salida
