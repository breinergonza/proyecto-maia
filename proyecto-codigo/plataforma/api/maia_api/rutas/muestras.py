"""Muestras de niños (filtros guardados): qué variables se pueden filtrar, cuántos niños da un filtro y guardarlo.

Una muestra guardada no se edita (D3): para cambiarla se duplica, con otro título y, si se quiere, otra definición.
Solo administración y expertos; quien solo consulta explora con ``/exploracion``."""
from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from maia_api import poblacion as P
from maia_api.dependencias import EXPERTO, auditar, sesion
from maia_comun import muestra as M
from maia_comun.modelos_db import Corte, Usuario
from maia_comun.modelos_muestras import Muestra

ruta = APIRouter(prefix='/muestras', tags=['muestras'])


class MuestraNueva(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    descripcion: str | None = Field(default=None, max_length=2000)
    muestra: dict


class MuestraDuplicada(BaseModel):
    titulo: str | None = Field(default=None, max_length=200)
    descripcion: str | None = Field(default=None, max_length=2000)
    muestra: dict | None = None   # otra definición; sin ella se repite la original


class MuestraSalida(BaseModel):
    id: int
    titulo: str
    descripcion: str | None
    fuente: str
    corte: str | None
    definicion: dict
    n_ninos: int
    n_base: int
    huella: str
    resumen: dict | None
    propietario: str | None
    propietario_id: uuid.UUID | None
    creada: datetime
    inmutable: bool


def _cuerpo(cuerpo: dict) -> dict:
    """La muestra del cuerpo: ``{"muestra": {...}}`` o la muestra misma."""
    m = cuerpo.get('muestra', cuerpo) if isinstance(cuerpo, dict) else None
    if not isinstance(m, dict):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Falta la muestra.')
    return m


def _extra(cuerpo: dict) -> list[dict]:
    """Las variables agregadas al panel (``"variables": [{"variable", "cuando"}]``), si vienen."""
    v = cuerpo.get('variables') if isinstance(cuerpo, dict) else None
    return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []


def _salida(s: Session, m: Muestra) -> dict:
    dueno = s.get(Usuario, m.propietario_id) if m.propietario_id else None
    corte = s.get(Corte, m.corte_id) if m.corte_id else None
    return MuestraSalida(
        id=m.id, titulo=m.titulo, descripcion=m.descripcion, fuente=m.fuente,
        corte=str(corte.fecha_corte) if corte else None, definicion=m.definicion, n_ninos=m.n_ninos,
        n_base=m.n_base, huella=m.huella, resumen=m.resumen, propietario=dueno.nombre if dueno else None,
        propietario_id=m.propietario_id, creada=m.creada, inmutable=bool(m.inmutable)).model_dump(mode='json')


def _muestra(s: Session, muestra_id: int) -> Muestra:
    m = s.get(Muestra, muestra_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No existe la muestra {muestra_id}.')
    return m


def _guardar(s: Session, u: Usuario, titulo: str, descripcion: str | None, definicion: dict) -> Muestra:
    corte = P.corte_actual(s)
    m = M.normalizar(definicion)
    ids = P.ids_de(s, corte.id, m)
    if len(ids) < P.MIN_NINOS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f'Con menos de {P.MIN_NINOS} niños no se guarda un filtro: este da {len(ids)}.')
    fila = Muestra(titulo=titulo.strip(), descripcion=(descripcion or '').strip() or None, fuente=corte.fuente,
                   corte_id=corte.id, definicion=m, n_ninos=len(ids), n_base=P.n_base(s, corte.id),
                   huella=M.huella(ids), resumen=P.resumen_poblacion(P.categorias_por_nino(s, corte.id), ids),
                   propietario_id=u.id, inmutable=True)
    s.add(fila)
    s.flush()
    auditar(s, u, 'muestras.guardar', str(fila.id), {'huella': fila.huella, 'n': fila.n_ninos})
    s.commit()
    return fila


@ruta.get('/variables')
def variables(s: Session = Depends(sesion), _: Usuario = Depends(EXPERTO)) -> dict:
    """Las variables que se ofrecen como filtro: tipo, opciones y la regla ``cuando`` que se sugiere."""
    corte = P.corte_actual(s)
    return {'corte': str(corte.fecha_corte), 'variables': P.variables_ofrecidas(s, corte.id)}


@ruta.post('/facetas')
def facetas(cuerpo: dict = Body(...), s: Session = Depends(sesion), _: Usuario = Depends(EXPERTO)) -> dict:
    """Niños por opción de cada variable con los demás filtros aplicados (el propio no)."""
    corte = P.corte_actual(s)
    try:
        r = P.facetas(s, corte.id, _cuerpo(cuerpo), extra=_extra(cuerpo))
    except M.MuestraInvalida as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, ' '.join(e.errores)) from None
    return {**r, 'n_base': P.n_base(s, corte.id), 'minimo': P.MIN_NINOS}


@ruta.post('/contar')
def contar(cuerpo: dict = Body(...), s: Session = Depends(sesion), _: Usuario = Depends(EXPERTO)) -> dict:
    corte = P.corte_actual(s)
    ids = P.ids_de(s, corte.id, _cuerpo(cuerpo))
    return {'n': len(ids), 'n_base': P.n_base(s, corte.id), 'minimo': P.MIN_NINOS, 'suficiente': len(ids) >= P.MIN_NINOS,
            'huella': M.huella(ids)}


@ruta.post('', status_code=status.HTTP_201_CREATED)
def guardar(cuerpo: MuestraNueva, s: Session = Depends(sesion), u: Usuario = Depends(EXPERTO)) -> dict:
    return _salida(s, _guardar(s, u, cuerpo.titulo, cuerpo.descripcion, cuerpo.muestra))


@ruta.get('')
def listar(s: Session = Depends(sesion), _: Usuario = Depends(EXPERTO)) -> list[dict]:
    return [_salida(s, m) for m in s.scalars(select(Muestra).order_by(Muestra.creada.desc(), Muestra.id.desc()))]


@ruta.get('/{muestra_id}')
def leer(muestra_id: int, s: Session = Depends(sesion), _: Usuario = Depends(EXPERTO)) -> dict:
    return _salida(s, _muestra(s, muestra_id))


@ruta.post('/{muestra_id}/duplicar', status_code=status.HTTP_201_CREATED)
def duplicar(muestra_id: int, cuerpo: MuestraDuplicada | None = None, s: Session = Depends(sesion),
             u: Usuario = Depends(EXPERTO)) -> dict:
    """Una muestra nueva con la definición de la original (o la que se envíe), calculada sobre el corte vigente."""
    origen = _muestra(s, muestra_id)
    cuerpo = cuerpo or MuestraDuplicada()
    fila = _guardar(s, u, cuerpo.titulo or f'Copia de {origen.titulo}',
                    cuerpo.descripcion if cuerpo.descripcion is not None else origen.descripcion,
                    cuerpo.muestra or origen.definicion)
    return _salida(s, fila)
