"""Consultas que comparten varias rutas: la corrida de referencia, los nombres de las visitas y el esquema."""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from maia_comun.modelos_db import Corrida, Esquema, Etapa


def corrida_de(s: Session, corrida_id: int | None = None) -> Corrida:
    """La corrida pedida, o la última terminada sin errores."""
    if corrida_id is not None:
        c = s.get(Corrida, corrida_id)
        if c is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f'No existe la corrida {corrida_id}.')
        return c
    c = s.scalars(select(Corrida).where(Corrida.estado == 'ok').order_by(Corrida.id.desc())).first()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            'Todavía no hay resultados: ejecute una corrida (Administración > Corridas).')
    return c


def etapas(s: Session, corte_id: int | None) -> dict[str, dict]:
    """{etapa: {'nombre', 'orden', 'base'}} del corte (vacío si el corte ya no está en Postgres)."""
    if corte_id is None:
        return {}
    filas = s.scalars(select(Etapa).where(Etapa.corte_id == corte_id).order_by(Etapa.orden))
    return {e.etapa: {'nombre': e.nombre or e.etapa, 'orden': e.orden, 'base': e.base} for e in filas}


def nombre_etapa(mapa: dict[str, dict], etapa: str | None) -> str | None:
    if etapa is None:
        return None
    return mapa.get(etapa, {}).get('nombre', etapa)


def esquema(s: Session, corte_id: int | None) -> dict[str, dict]:
    if corte_id is None:
        return {}
    return {e.variable: e.datos for e in s.scalars(select(Esquema).where(Esquema.corte_id == corte_id))}


def sujeto_existe(s: Session, corte_id: int | None, sujeto: str) -> bool:
    if corte_id is None:
        return False
    return s.execute(text('SELECT 1 FROM sevarti.sujetos WHERE corte_id = :c AND sujeto = :s'),
                     {'c': corte_id, 's': sujeto}).first() is not None
