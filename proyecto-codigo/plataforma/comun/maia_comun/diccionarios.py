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

import pandas as pd
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from archivos import carpetas as CA
from maia_comun.modelos_db import VersionDiccionario
from sevarti import diccionario as D

SEMILLA = Path(CA.__file__).resolve().parent.parent / 'entradas' / 'diccionario.xlsx'
MAX_BYTES = 10 * 1024 * 1024
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
    """Una versión nueva (número siguiente). Si queda ``vigente``, la anterior pasa a ``archivado``."""
    if validar:
        leer(contenido)
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
                                  f'Descargue el diccionario, complete la fila y súbalo.\n{e}') from None
    return guardar(s, contenido, 'subido', estado='vigente', usuario_id=usuario_id, validar=False,
                   nota=f'«{variable}» marcada como «{estado}».')


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
