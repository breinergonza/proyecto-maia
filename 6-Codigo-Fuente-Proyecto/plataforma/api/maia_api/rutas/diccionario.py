"""El diccionario de variables con versiones, para el experto en datos y administración (D77; nadie más entra).

Se edita con formularios (``/editar``): la web manda los cambios por fila y aquí se aplican a la vigente, se validan con
el núcleo y quedan como una versión nueva. El Excel queda para importar y exportar: se descarga, se edita y se sube, y
antes de confirmar se ve lo que cambia. Las variables nuevas que trae una actualización se clasifican aquí (Lista / No
usar).
"""
from __future__ import annotations

from collections.abc import Callable

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from maia_api.dependencias import DATOS, auditar, sesion
from maia_api.esquemas.diccionario import (
    BorradorDiccionario,
    Clasificacion,
    DiferenciasDiccionario,
    Edicion,
    PorClasificar,
    VersionDiccionarioSalida,
    VistaDiccionario,
)
from maia_comun import diccionarios as DIC
from maia_comun.modelos_db import Usuario, VersionDiccionario

ruta = APIRouter(prefix='/diccionario', tags=['diccionario'])
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def _salida(s: Session, v: VersionDiccionario) -> VersionDiccionarioSalida:
    autor = s.get(Usuario, v.creado_por) if v.creado_por else None
    return VersionDiccionarioSalida(id=v.id, version=v.version, estado=v.estado, origen=v.origen, nota=v.nota,
                                    sha256=v.sha256, tamano=len(v.archivo), creado_por=autor.nombre if autor else None,
                                    creado_en=v.creado_en)


def _version(s: Session, vid: int) -> VersionDiccionario:
    try:
        return DIC.obtener(s, vid)
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from None


def _invalido(e: DIC.DiccionarioInvalido) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e))


def _contenido(archivo: UploadFile) -> bytes:
    datos = archivo.file.read(DIC.MAX_BYTES + 1)
    if len(datos) > DIC.MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, 'El archivo pasa de 10 MB.')
    return datos


def _diferencias(s: Session, contenido: bytes, nombre: str | None = None) -> DiferenciasDiccionario:
    try:
        nuevo = DIC.leer(contenido, nombre)
    except DIC.DiccionarioInvalido as e:
        raise _invalido(e) from None
    actual = DIC.vigente(s)
    antes = DIC.leer(actual.archivo) if actual is not None else None
    return DiferenciasDiccionario(**DIC.diferencias(antes, nuevo), vigente=actual.version if actual else None)


def _excel(v: VersionDiccionario) -> Response:
    return Response(v.archivo, media_type=XLSX,
                    headers={'Content-Disposition': f'attachment; filename="diccionario_v{v.version}.xlsx"'})


@ruta.get('/versiones', response_model=list[VersionDiccionarioSalida])
def versiones(s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> list[VersionDiccionarioSalida]:
    filas = s.execute(select(VersionDiccionario.id, VersionDiccionario.version, VersionDiccionario.estado,
                             VersionDiccionario.origen, VersionDiccionario.nota, VersionDiccionario.sha256,
                             func.length(VersionDiccionario.archivo).label('tamano'),
                             Usuario.nombre.label('creado_por'), VersionDiccionario.creado_en)
                      .outerjoin(Usuario, Usuario.id == VersionDiccionario.creado_por)
                      .order_by(VersionDiccionario.version.desc())).mappings()
    return [VersionDiccionarioSalida(**f) for f in filas]


@ruta.get('/vigente/archivo', response_class=Response, responses={200: {'content': {XLSX: {}}}})
def descargar_vigente(s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> Response:
    v = DIC.vigente(s)
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Todavía no hay un diccionario vigente.')
    return _excel(v)


@ruta.get('/versiones/{vid}/archivo', response_class=Response, responses={200: {'content': {XLSX: {}}}})
def descargar(vid: int, s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> Response:
    return _excel(_version(s, vid))


@ruta.get('/versiones/{vid}/vista', response_model=VistaDiccionario)
def vista(vid: int, s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> VistaDiccionario:
    """Las hojas de esa versión como se ven en el Excel, para previsualizarla sin descargarla."""
    v = _version(s, vid)
    try:
        hojas = DIC.vista(DIC.leer(v.archivo))
    except DIC.DiccionarioInvalido as e:
        raise _invalido(e) from None
    return VistaDiccionario(version=_salida(s, v), hojas=hojas)


@ruta.post('/comparar', response_model=DiferenciasDiccionario)
def comparar(archivo: UploadFile = File(...), s: Session = Depends(sesion),
             u: Usuario = Depends(DATOS)) -> DiferenciasDiccionario:
    """Valida el archivo y dice qué cambia frente a la vigente, sin guardar nada."""
    return _diferencias(s, _contenido(archivo), archivo.filename)


@ruta.post('/versiones', response_model=VersionDiccionarioSalida, status_code=status.HTTP_201_CREATED)
def subir(archivo: UploadFile = File(...), nota: str | None = Form(None, max_length=500), borrador: bool = Form(False),
          s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> VersionDiccionarioSalida:
    """Guarda el archivo como versión nueva, vigente (o como borrador, si se pide; un campo ausente es «no»)."""
    contenido = _contenido(archivo)
    try:
        nuevo = DIC.leer(contenido, archivo.filename)
    except DIC.DiccionarioInvalido as e:
        raise _invalido(e) from None
    actual = DIC.vigente(s)
    if actual is not None and DIC.iguales(DIC.leer(actual.archivo), nuevo):
        raise HTTPException(status.HTTP_409_CONFLICT, 'El archivo es igual al diccionario vigente: no hay nada que guardar.')
    # ``guardar`` valida y guarda el libro regenerado desde las tablas (lo que se descarga después), no el archivo subido
    v = DIC.guardar(s, contenido, 'subido', estado='borrador' if borrador else 'vigente',
                    nota=(nota or '').strip() or None, usuario_id=u.id)
    auditar(s, u, 'subir_diccionario', f'diccionario v{v.version}', {'estado': v.estado, 'sha256': v.sha256})
    s.commit()
    return _salida(s, v)


@ruta.get('/versiones/{vid}/diferencias', response_model=DiferenciasDiccionario)
def diferencias(vid: int, s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> DiferenciasDiccionario:
    return _diferencias(s, _version(s, vid).archivo)


@ruta.post('/versiones/{vid}/activar', response_model=VersionDiccionarioSalida)
def activar(vid: int, s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> VersionDiccionarioSalida:
    """Deja vigente esa versión; también sirve para volver a una anterior."""
    _version(s, vid)
    try:
        v = DIC.activar(s, vid, u.id)
    except DIC.DiccionarioInvalido as e:
        raise _invalido(e) from None
    auditar(s, u, 'activar_diccionario', f'diccionario v{v.version}', {'origen': v.origen})
    s.commit()
    return _salida(s, v)


@ruta.get('/por-clasificar', response_model=PorClasificar)
def por_clasificar(s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> PorClasificar:
    """Las variables «Por clasificar» de la vigente y, si una actualización trajo variables nuevas, su borrador."""
    actual = DIC.vigente(s)
    variables = DIC.por_clasificar(DIC.leer(actual.archivo)) if actual is not None else []
    borrador = None
    if (b := DIC.borrador_pendiente(s)) is not None:
        try:
            nuevas = DIC.diferencias(DIC.leer(actual.archivo) if actual else None, DIC.leer(b.archivo))['nuevas']
        except DIC.DiccionarioInvalido:
            nuevas = []
        if nuevas:
            borrador = BorradorDiccionario(version=_salida(s, b), nuevas=nuevas)
    total = len(variables) + (len(borrador.nuevas) if borrador else 0)
    return PorClasificar(vigente=_salida(s, actual) if actual else None, variables=variables, borrador=borrador,
                         total=total)


@ruta.post('/clasificar', response_model=VersionDiccionarioSalida)
def clasificar(c: Clasificacion, s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> VersionDiccionarioSalida:
    """Marca rápido una variable como Lista o No usar: queda una versión nueva, vigente."""
    try:
        v = DIC.clasificar(s, c.variable, c.estado, u.id)
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from None
    except DIC.DiccionarioInvalido as e:
        raise _invalido(e) from None
    auditar(s, u, 'clasificar_variable', f'diccionario v{v.version}', {'variable': c.variable, 'estado': c.estado})
    s.commit()
    return _salida(s, v)


def _cambios(e: Edicion) -> list[dict]:
    return [c.model_dump() for c in e.cambios]


def _edicion[T](f: Callable[[], T]) -> T:
    """Los errores de editar con formularios, como respuestas en español."""
    try:
        return f()
    except (DIC.Desactualizado, DIC.SinCambios) as x:
        raise HTTPException(status.HTTP_409_CONFLICT, str(x)) from None
    except DIC.DiccionarioInvalido as x:
        raise _invalido(x) from None
    except LookupError as x:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(x)) from None


@ruta.post('/editar/revisar', response_model=DiferenciasDiccionario)
def revisar_edicion(e: Edicion, s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> DiferenciasDiccionario:
    """Valida los cambios de los formularios y dice qué cambia frente a la vigente, sin guardar nada."""
    return DiferenciasDiccionario(**_edicion(lambda: DIC.revisar(s, e.base, _cambios(e))))


@ruta.post('/editar', response_model=VersionDiccionarioSalida, status_code=status.HTTP_201_CREATED)
def editar(e: Edicion, s: Session = Depends(sesion), u: Usuario = Depends(DATOS)) -> VersionDiccionarioSalida:
    """Guarda los cambios de los formularios como una versión nueva, vigente."""
    v = _edicion(lambda: DIC.editar(s, e.base, _cambios(e), nota=e.nota, usuario_id=u.id))
    auditar(s, u, 'editar_diccionario', f'diccionario v{v.version}',
            {'cambios': len(e.cambios), 'hojas': sorted({c.hoja for c in e.cambios})})
    s.commit()
    return _salida(s, v)
