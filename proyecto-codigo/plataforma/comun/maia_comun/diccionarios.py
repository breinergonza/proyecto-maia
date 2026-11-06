"""El diccionario de variables con versiones (``app.diccionarios``).

El Excel sigue siendo el formato de trabajo de los expertos (listas desplegables y validaciones); aquí queda guardado
con versiones, en Postgres (pesa poco y la API en Railway no tiene MinIO). Una sola versión ``vigente`` a la vez.

* ``subido``: un experto lo subió desde la web (o clasificó una variable, que genera una versión nueva).
* ``corrida``: la corrida agregó variables nuevas de la base como «Por clasificar»; queda como ``borrador`` hasta que
  alguien lo active.
* ``semilla``: el de ``nucleo/entradas/diccionario.xlsx``, cuando todavía no hay ninguna versión.

Se lee y valida con ``sevarti.diccionario`` sobre archivos temporales: el núcleo es la única fuente de las reglas.
"""
from __future__ import annotations

import hashlib
import io
import re
import tempfile
import zipfile
from dataclasses import replace
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from archivos import carpetas as CA
from archivos import libros as LB
from maia_comun.modelos_db import VersionDiccionario
from sevarti import diccionario as D

SEMILLA = Path(CA.__file__).resolve().parent.parent / 'entradas' / 'diccionario.xlsx'
MAX_BYTES = 10 * 1024 * 1024
MAX_DESCOMPRIMIDO = 50 * 1024 * 1024   # lo que pesan juntos los archivos de dentro del .xlsx (un zip chico puede expandirse a GB)
MAX_MIEMBROS = 200                     # un .xlsx de este diccionario trae unas pocas decenas
LISTA, POR_CLASIFICAR, NO_USAR = D.LISTA, D.POR_CLASIFICAR, D.NO_USAR
_NO_EXCEL = 'El archivo no es un Excel (.xlsx) que se pueda leer. Guárdelo como libro de Excel y vuelva a intentarlo.'
_CACHE: dict[str, D.Diccionario] = {}   # lo leído, por sha (cada lectura del Excel toma un momento)


class DiccionarioInvalido(ValueError):
    """El archivo no es un diccionario válido; el mensaje, en español, dice hoja y fila cuando se puede."""


def huella(contenido: bytes) -> str:
    return hashlib.sha256(contenido).hexdigest()


def _nombre_seguro(nombre: str | None) -> str:
    base = re.sub(r'[^\w.\- ]', '_', Path(nombre or '').name).strip() or 'diccionario.xlsx'
    return base if base.lower().endswith('.xlsx') else f'{base}.xlsx'


def _revisar_zip(contenido: bytes) -> None:
    """Un .xlsx es un zip: se mira su índice, sin descomprimir nada, antes de que alguien lo abra."""
    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as z:
            miembros = z.infolist()
    except zipfile.BadZipFile:
        raise DiccionarioInvalido(_NO_EXCEL) from None
    if len(miembros) > MAX_MIEMBROS:
        raise DiccionarioInvalido('El archivo trae demasiados archivos por dentro: no parece un diccionario de variables.')
    if sum(m.file_size for m in miembros) > MAX_DESCOMPRIMIDO:
        raise DiccionarioInvalido('El archivo descomprimido pasa de 50 MB: no parece un diccionario de variables.')


def leer(contenido: bytes, nombre: str | None = None) -> D.Diccionario:
    """El diccionario de un .xlsx, validado con el núcleo. Levanta ``DiccionarioInvalido`` sin traza."""
    sha = huella(contenido)
    if sha in _CACHE:
        return _CACHE[sha]
    if not contenido:
        raise DiccionarioInvalido('El archivo está vacío.')
    if len(contenido) > MAX_BYTES:
        raise DiccionarioInvalido('El archivo pasa de 10 MB: no parece un diccionario de variables.')
    if not zipfile.is_zipfile(io.BytesIO(contenido)):   # un .xlsx es un zip; si no, pandas responde en inglés
        raise DiccionarioInvalido(_NO_EXCEL)
    _revisar_zip(contenido)
    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / _nombre_seguro(nombre)
        ruta.write_bytes(contenido)
        try:
            dic = D.leer(ruta)
        except ValueError as e:
            raise DiccionarioInvalido(str(e)) from None
        except Exception:   # no es un Excel, está dañado o protegido con clave
            raise DiccionarioInvalido(_NO_EXCEL) from None
    if len(_CACHE) > 16:
        _CACHE.clear()
    _CACHE[sha] = dic
    return dic


def escribir(dic: D.Diccionario) -> bytes:
    """El .xlsx de un diccionario, con el formato del núcleo (listas desplegables, instrucciones)."""
    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / 'diccionario.xlsx'
        D.escribir(dic, ruta)
        return ruta.read_bytes()


def normalizar(contenido: bytes, nombre: str | None = None) -> bytes:
    """El libro regenerado desde las tablas que se leyeron del .xlsx subido. Es lo único que se guarda y se sirve de un
    archivo de afuera: fórmulas, vínculos, hojas extra o cualquier otra cosa que traiga no pasan."""
    return escribir(leer(contenido, nombre))


def iguales(a: D.Diccionario, b: D.Diccionario) -> bool:
    """Si dos diccionarios dicen lo mismo, sin importar cómo vengan empaquetados los bytes."""
    ta, tb = D.mostradas(a), D.mostradas(b)
    return ta.keys() == tb.keys() and all(ta[n].equals(tb[n]) for n in ta)


# ------------------------------------------------------------------ versiones

def vigente(s: Session) -> VersionDiccionario | None:
    return s.scalars(select(VersionDiccionario).where(VersionDiccionario.estado == 'vigente')).first()


def obtener(s: Session, vid: int) -> VersionDiccionario:
    v = s.get(VersionDiccionario, vid)
    if v is None:
        raise LookupError(f'No existe la versión {vid} del diccionario.')
    return v


def guardar(s: Session, contenido: bytes, origen: str, *, estado: str = 'borrador', nota: str | None = None,
            usuario_id=None, validar: bool = True) -> VersionDiccionario:
    """Una versión nueva (número siguiente). Si queda ``vigente``, la anterior pasa a ``archivado``.

    Con ``validar`` el archivo viene de afuera: se lee y lo que queda guardado (y la ``sha256``) es el libro regenerado
    desde sus tablas. Sin ``validar``, el llamador ya trae un libro que generó este sistema."""
    if validar:
        contenido = normalizar(contenido)
    s.execute(text('LOCK TABLE app.diccionarios IN SHARE ROW EXCLUSIVE MODE'))   # el número de versión, sin choques
    numero = (s.scalar(select(func.max(VersionDiccionario.version))) or 0) + 1
    if estado == 'vigente':
        _archivar_vigente(s)
    v = VersionDiccionario(version=numero, archivo=contenido, sha256=huella(contenido), estado=estado, origen=origen,
                           nota=nota, creado_por=usuario_id)
    s.add(v)
    s.flush()
    return v


def _archivar_vigente(s: Session) -> None:
    s.execute(update(VersionDiccionario).where(VersionDiccionario.estado == 'vigente').values(estado='archivado'))
    s.flush()


def activar(s: Session, vid: int, usuario_id=None) -> VersionDiccionario:
    """Deja vigente esa versión (también sirve para volver a una anterior).

    Un borrador de una corrida no reemplaza la vigente: se le suman sus variables nuevas, para no deshacer lo que los
    expertos clasificaron mientras tanto. Devuelve la versión que quedó vigente."""
    v = obtener(s, vid)
    actual = vigente(s)
    if v.estado == 'borrador' and v.origen == 'corrida' and actual is not None:
        dic, traido = leer(actual.archivo), leer(v.archivo)
        nuevas = traido.variables[~traido.variables.variable.isin(dic.variables.variable)]
        v.estado = 'archivado'
        if nuevas.empty:
            s.flush()
            return actual
        contenido = escribir(replace(dic, variables=pd.concat([dic.variables, nuevas], ignore_index=True)))
        leer(contenido)
        return guardar(s, contenido, 'corrida', estado='vigente', nota=v.nota, usuario_id=usuario_id, validar=False)
    if v.estado != 'vigente':
        leer(v.archivo)
        _archivar_vigente(s)
        v.estado = 'vigente'
        s.flush()
    return v


def sembrar(s: Session, ruta: Path = SEMILLA) -> bool:
    """Si no hay ninguna versión, la del núcleo queda vigente (origen ``semilla``). Sin archivo, no hace nada."""
    if s.scalar(select(func.count()).select_from(VersionDiccionario)) or not Path(ruta).exists():
        return False
    guardar(s, Path(ruta).read_bytes(), 'semilla', estado='vigente',
            nota='Diccionario inicial que trae el sistema.', validar=False)
    return True


# ------------------------------------------------------------------ lo que cambia entre dos versiones

def _texto(v: Any) -> str | None:
    return None if v is None or (not isinstance(v, str) and pd.isna(v)) else str(v)


def _visitas(dic: D.Diccionario) -> dict[str, str]:
    return {str(e): _texto(n) or str(e) for e, n in zip(dic.visitas.etapa, dic.visitas.nombre)}


def _variable(fila: dict, visitas: dict[str, str]) -> dict[str, Any]:
    etapa = _texto(fila.get('etapa'))
    return {'variable': str(fila['variable']), 'etiqueta': _texto(fila.get('etiqueta')), 'estado': _texto(fila.get('estado')),
            'tema': _texto(fila.get('tema')), 'etapa': etapa, 'visita': visitas.get(etapa, etapa) if etapa else None,
            'nota': _texto(fila.get('nota'))}


def _estado_clinico(v: Any) -> str | None:
    t = _texto(v)
    return D.mostrado('Desenlaces', 'estado', t) if t else None


def diferencias(antes: D.Diccionario | None, despues: D.Diccionario) -> dict[str, Any]:
    """Variables nuevas o quitadas, estados cambiados y desenlaces activados o apagados (de ``antes`` a ``despues``)."""
    visitas = _visitas(despues)
    va = {} if antes is None else {str(f['variable']): f for f in antes.variables.to_dict('records')}
    vd = {str(f['variable']): f for f in despues.variables.to_dict('records')}
    nuevas = [_variable(vd[k], visitas) for k in vd if k not in va]
    quitadas = [_variable(va[k], _visitas(antes)) for k in va if k not in vd] if antes is not None else []
    estados = [{**_variable(vd[k], visitas), 'antes': _texto(va[k].get('estado')), 'despues': _texto(vd[k].get('estado'))}
               for k in vd if k in va and _texto(va[k].get('estado')) != _texto(vd[k].get('estado'))]
    da = {} if antes is None else {str(f['clave']): f for f in antes.desenlaces.to_dict('records')}
    dd = {str(f['clave']): f for f in despues.desenlaces.to_dict('records')}
    activados, apagados = [], []
    for clave in dict.fromkeys([*da, *dd]):
        ea, ed = _texto((da.get(clave) or {}).get('estado')), _texto((dd.get(clave) or {}).get('estado'))
        if ea == ed:
            continue
        fila = dd.get(clave) or da[clave]
        cambio = {'clave': clave, 'nombre': _texto(fila.get('nombre')), 'antes': _estado_clinico(ea),
                  'despues': _estado_clinico(ed)}
        if ed == D.EN_USO:
            activados.append(cambio)
        elif ea == D.EN_USO:
            apagados.append(cambio)
    return {'nuevas': nuevas, 'quitadas': quitadas, 'estados': estados, 'desenlaces_activados': activados,
            'desenlaces_apagados': apagados,
            'sin_cambios': not (nuevas or quitadas or estados or activados or apagados)}


def _celda(v: Any) -> str | None:
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if hasattr(v, 'isoformat'):
        return v.isoformat()[:10]
    return str(v)


def _tipo(hoja: str, clave: str) -> str:
    r = D.reglas(hoja)
    return 'numero' if clave in r['numeros'] else 'fecha' if clave in r['fechas'] else 'texto'


def _columna(hoja: str, c: LB.Columna) -> dict[str, Any]:
    """Lo que el formulario necesita de una columna: el título y la ayuda del Excel, las respuestas de su lista
    desplegable (``opciones``) o la hoja de la que salen (``lista``), y si es obligatoria, un número o una fecha."""
    return {'clave': c.clave, 'titulo': c.titulo, 'explica': c.explica, 'opciones': list(c.opciones),
            'lista': c.lista.split('!')[0].strip("'") if c.lista else None, 'largo': c.largo,
            'tipo': _tipo(hoja, c.clave), 'obligatoria': c.clave in D.reglas(hoja)['obligatorias']}


def vista(dic: D.Diccionario) -> list[dict[str, Any]]:
    """Las hojas del Excel como se ven en él (títulos de columna y respuestas en español), para previsualizarlo y para
    los formularios que lo editan. ``clave`` es la columna que nombra cada fila."""
    hojas = []
    for nombre, tabla in D.mostradas(dic).items():
        hoja = D.LIBRO.hoja(nombre)
        columnas = [c for c in hoja.columnas if c.clave in tabla.columns]
        filas = [[_celda(f[c.clave]) for c in columnas] for f in tabla.to_dict('records')]
        hojas.append({'nombre': nombre, 'describe': hoja.describe, 'clave': hoja.columnas[0].clave,
                      'agregar': nombre not in _SIN_FILAS_NUEVAS,
                      'columnas': [_columna(nombre, c) for c in columnas], 'filas': filas})
    return hojas


def por_clasificar(dic: D.Diccionario) -> list[dict[str, Any]]:
    visitas = _visitas(dic)
    v = dic.variables
    return [_variable(f, visitas) for f in v[v.estado == POR_CLASIFICAR].to_dict('records')]


def clasificar(s: Session, variable: str, estado: str, usuario_id=None) -> VersionDiccionario:
    """Marca una variable de la vigente como «Lista» o «No usar»: genera una versión nueva, vigente."""
    if estado not in (LISTA, NO_USAR):
        raise DiccionarioInvalido(f'El estado debe ser «{LISTA}» o «{NO_USAR}».')
    actual = vigente(s)
    if actual is None:
        raise LookupError('Todavía no hay un diccionario vigente.')
    dic = leer(actual.archivo)
    variables = dic.variables.copy()
    filas = variables.index[variables.variable == variable]
    if not len(filas):
        raise LookupError(f'La variable «{variable}» no está en el diccionario vigente.')
    variables.loc[filas, 'estado'] = estado
    contenido = escribir(replace(dic, variables=variables))
    try:
        leer(contenido)
    except DiccionarioInvalido as e:
        raise DiccionarioInvalido(f'No se pudo marcar «{variable}» como «{estado}» porque le falta información. '
                                  f'Use «Completar» para llenar lo que falta.\n{e}') from None
    return guardar(s, contenido, 'subido', estado='vigente', usuario_id=usuario_id, validar=False,
                   nota=f'«{variable}» marcada como «{estado}».')


# ------------------------------------------------------------------ editar con formularios

_SIN_FILAS_NUEVAS = ('Variables', 'Curva OMS')   # las variables las trae la base; la curva es una sola fila
_FILA = re.compile(r'^- hoja "(?P<hoja>[^"]+)", fila (?P<fila>\d+): ', re.M)


class Desactualizado(Exception):
    """Mientras se editaba, alguien guardó otra versión: los cambios se revisan otra vez sobre la nueva."""


class SinCambios(ValueError):
    """Los cambios dejan el diccionario igual al vigente."""


def _hoja(nombre: str) -> LB.Hoja:
    if nombre not in {h.nombre for h in D.LIBRO.hojas}:
        raise DiccionarioInvalido(f'El diccionario no tiene la hoja «{nombre}».')
    return D.LIBRO.hoja(nombre)


def _valor(tipo: str, v: str | None) -> Any:
    """Lo escrito en el formulario como lo guarda el Excel. Un número admite coma decimal; si no es un número queda
    como texto, para que el núcleo diga cuál está mal."""
    texto = (v or '').strip()
    if not texto:
        return np.nan
    if tipo == 'numero':
        try:
            return float(texto.replace(',', '.'))
        except ValueError:
            return texto
    return texto


def _aplicar(tablas: dict[str, pd.DataFrame], cambio: dict[str, Any]) -> None:
    nombre, accion, fila, valores = cambio['hoja'], cambio['accion'], cambio.get('clave'), cambio.get('valores') or {}
    hoja = _hoja(nombre)
    clave = hoja.columnas[0].clave
    titulos = {c.clave: c.titulo for c in hoja.columnas}
    if desconocidas := sorted(set(valores) - set(titulos)):
        raise DiccionarioInvalido(f'La hoja «{nombre}» no tiene la columna {", ".join(desconocidas)}.')
    t = tablas[nombre]
    if accion == 'agregar':
        if nombre in _SIN_FILAS_NUEVAS:
            raise DiccionarioInvalido(f'En la hoja «{nombre}» no se agregan filas.')
        nueva = pd.DataFrame([{k: _valor(_tipo(nombre, k), v) for k, v in valores.items()}])
        tablas[nombre] = pd.concat([t.astype(object), nueva.astype(object)], ignore_index=True)
        return
    filas = t.index[t[clave].map(_celda) == fila]
    if not len(filas):
        raise LookupError(f'«{fila}» ya no está en la hoja «{nombre}».')
    if accion == 'borrar':
        if nombre in _SIN_FILAS_NUEVAS:
            raise DiccionarioInvalido('Las variables no se borran: la base las sigue trayendo. Márquela «No usar».'
                                      if nombre == 'Variables' else f'En la hoja «{nombre}» no se borran filas.')
        tablas[nombre] = t.drop(filas).reset_index(drop=True)
        return
    if clave in valores and (valores[clave] or '').strip() != fila:
        raise DiccionarioInvalido(f'{titulos[clave]} no se cambia: es como el sistema reconoce la fila «{fila}».')
    t = t.copy()
    for k, v in valores.items():
        t[k] = t[k].astype(object)
        t.loc[filas, k] = _valor(_tipo(nombre, k), v)
    tablas[nombre] = t


def _por_fila(mensaje: str, tablas: dict[str, pd.DataFrame]) -> str:
    """El error del núcleo, que cuenta filas del Excel, nombrando cada fila por su código como la ve el formulario."""
    def nombre(m: re.Match[str]) -> str:
        hoja, i = m['hoja'], int(m['fila']) - 2
        t = tablas.get(hoja)
        if t is None or not 0 <= i < len(t):
            return m[0]
        return f'- {hoja} · {_celda(t.iloc[i][D.LIBRO.hoja(hoja).columnas[0].clave]) or "fila nueva"}: '
    return re.sub(r'^El diccionario \S+ tiene', 'El diccionario tiene', _FILA.sub(nombre, mensaje))


def _editado(s: Session, base: int, cambios: list[dict[str, Any]]) -> tuple[VersionDiccionario, D.Diccionario, bytes]:
    """La vigente (que debe ser ``base``), lo que tenía y el .xlsx con los cambios, ya validado con el núcleo."""
    actual = vigente(s)
    if actual is None:
        raise LookupError('Todavía no hay un diccionario vigente.')
    if actual.id != base:
        raise Desactualizado(f'Mientras editaba se guardó la versión {actual.version}. Sus cambios siguen aquí: '
                             'revíselos otra vez sobre la versión nueva.')
    antes = leer(actual.archivo)
    tablas = {n: t.copy() for n, t in D.mostradas(antes).items()}
    for c in cambios:
        _aplicar(tablas, c)
    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / 'diccionario.xlsx'
        LB.escribir(D.LIBRO, ruta, tablas)
        contenido = ruta.read_bytes()
    try:
        despues = leer(contenido)
    except DiccionarioInvalido as e:
        raise DiccionarioInvalido(_por_fila(str(e), tablas)) from None
    previas = D.mostradas(antes)
    if all(t.equals(previas[n]) for n, t in D.mostradas(despues).items()):
        raise SinCambios('Los cambios dejan el diccionario igual al vigente: no hay nada que guardar.')
    return actual, antes, contenido


def revisar(s: Session, base: int, cambios: list[dict[str, Any]]) -> dict[str, Any]:
    """Valida los cambios de los formularios y dice qué cambia frente a la vigente, sin guardar nada."""
    actual, antes, contenido = _editado(s, base, cambios)
    return {**diferencias(antes, leer(contenido)), 'vigente': actual.version}


def _nota(cambios: list[dict[str, Any]]) -> str:
    hojas = list(dict.fromkeys(c['hoja'] for c in cambios))
    lista = hojas[0] if len(hojas) == 1 else f'{", ".join(hojas[:-1])} y {hojas[-1]}'
    n = len(cambios)
    return f'Editado en la web: {n} cambio{"" if n == 1 else "s"} en {lista}.'


def editar(s: Session, base: int, cambios: list[dict[str, Any]], *, nota: str | None = None,
           usuario_id=None) -> VersionDiccionario:
    """Aplica los cambios de los formularios a la vigente (``base``) y los guarda como una versión nueva, vigente.

    Cada cambio es ``{'hoja', 'accion': 'editar' | 'agregar' | 'borrar', 'clave': la fila, 'valores': {columna: texto}}``,
    con las respuestas como se ven en el Excel. El núcleo valida el resultado igual que un archivo subido."""
    _, _, contenido = _editado(s, base, cambios)
    return guardar(s, contenido, 'subido', estado='vigente', nota=(nota or '').strip() or _nota(cambios),
                   usuario_id=usuario_id, validar=False)


# ------------------------------------------------------------------ el programador

def bajar_vigente(s: Session, ruta: Path) -> VersionDiccionario | None:
    """Escribe la vigente en ``ruta`` (solo si cambió). Sin versiones, deja el archivo como esté."""
    v = vigente(s)
    if v is None:
        return None
    ruta = Path(ruta)
    if not ruta.exists() or huella(ruta.read_bytes()) != v.sha256:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        temporal = ruta.with_name(f'{ruta.stem}.bajando{ruta.suffix}')
        temporal.write_bytes(v.archivo)
        temporal.replace(ruta)
    return v


def guardar_de_corrida(s: Session, base: VersionDiccionario | None, ruta: Path,
                       ejecucion_id: int | None = None) -> tuple[VersionDiccionario | None, list[str]]:
    """Después de una corrida: si el archivo cambió (agregó variables nuevas), un borrador con ellas. Los borradores
    anteriores de corridas quedan archivados (el nuevo ya trae lo de la vigente más lo nuevo)."""
    ruta = Path(ruta)
    if base is None or not ruta.exists():
        return None, []
    contenido = ruta.read_bytes()
    if huella(contenido) == base.sha256:
        return None, []
    try:
        nuevo = leer(contenido)
    except DiccionarioInvalido:
        return None, []
    nuevas = [n['variable'] for n in diferencias(leer(base.archivo), nuevo)['nuevas']]
    s.execute(update(VersionDiccionario).where(VersionDiccionario.estado == 'borrador',
                                               VersionDiccionario.origen == 'corrida').values(estado='archivado'))
    cuantas = f'{len(nuevas)} variable nueva' if len(nuevas) == 1 else f'{len(nuevas)} variables nuevas'
    nota = f'Actualización con {cuantas} de la base' if nuevas else 'Actualización del sistema'
    if ejecucion_id is not None:
        nota += f' (ejecución {ejecucion_id})'
    v = guardar(s, contenido, 'corrida', nota=nota + '.', validar=False)
    return v, nuevas


def borrador_pendiente(s: Session) -> VersionDiccionario | None:
    """El borrador más reciente que dejó una corrida, si es posterior a la vigente."""
    actual = vigente(s)
    q = select(VersionDiccionario).where(VersionDiccionario.estado == 'borrador', VersionDiccionario.origen == 'corrida')
    if actual is not None:
        q = q.where(VersionDiccionario.version > actual.version)
    return s.scalars(q.order_by(VersionDiccionario.version.desc()).limit(1)).first()
