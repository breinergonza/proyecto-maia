"""Explorar: las cifras del Tablero para el grupo de niños que se elija con un filtro.

Sin filtros da lo mismo que ``/tablero/resumen`` (riesgo por desenlace y crecimiento por visita); con filtro, solo los
niños del grupo. D46: con menos de 20 niños no se devuelve ninguna cifra, y para quien solo consulta los conteos
menores de 100 se redondean a múltiplos de 5. Cada consulta queda en la auditoría con la huella de la muestra y el
número de niños, sin valores clínicos."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from maia_api import poblacion as P
from maia_api.consultas import corrida_de, etapas, nombre_etapa
from maia_api.dependencias import CUALQUIERA, auditar, sesion
from maia_api.esquemas import CorridaSalida
from maia_comun import muestra as M
from maia_comun.modelos_db import PERCENTIL_ALTO, Usuario
from maia_comun.modelos_muestras import Muestra

ruta = APIRouter(prefix='/exploracion', tags=['exploracion'])


class VariableExtra(BaseModel):
    """Una variable que se agregó al panel de filtros y la regla con que se lee (D1)."""
    variable: str
    cuando: str | None = None


class Consulta(BaseModel):
    muestra: dict | None = None
    muestra_id: int | None = None
    corrida_id: int | None = None
    variables: list[VariableExtra] | None = None   # solo para /facetas: variables agregadas sin filtro todavía


def _definicion(s: Session, c: Consulta) -> dict:
    if c.muestra_id is not None:
        fila = s.get(Muestra, c.muestra_id)
        if fila is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f'No existe la muestra {c.muestra_id}.')
        return fila.definicion
    return c.muestra or {'version': M.VERSION}


def _filas(s: Session, sql: str, **p) -> list[dict]:
    return [dict(r._mapping) for r in s.execute(text(sql), p)]


def _muestreo(s: Session, corte_id: int, defn: dict, redondear: bool) -> dict | None:
    """Si la muestra trae tope por categoría: con cuántos niños se entrenaría. Las cifras de Explorar son las del
    grupo completo; el tope se aplica al entrenar."""
    mu = M.normalizar(defn)['muestreo']
    if mu.get('modo') != 'estratificado':
        return None
    con = len(P.ids_de(s, corte_id, defn, muestreo=True))
    return {'modo': 'estratificado', 'por': mu.get('por'), 'maximo_por_categoria': mu.get('maximo_por_categoria'),
            'ninos': P.proteger(con, redondear) if con >= P.MIN_NINOS else None}


def _datos(s: Session, corrida, ids: list[str] | None) -> int:
    """«Datos leídos» con la misma definición que el Tablero (todas las filas de mediciones del corte, ``len(sev.
    mediciones)``): sin filtro es la cifra de la corrida; con filtro, las filas de esos niños."""
    if ids is None and (corrida.resumen or {}).get('datos') is not None:
        return int(corrida.resumen['datos'])
    return int(s.execute(text('SELECT count(*) FROM sevarti.mediciones WHERE corte_id = :k'
                              + (' AND sujeto = ANY(:ids)' if ids is not None else '')),
                         {'k': corrida.corte_id, **({'ids': ids} if ids is not None else {})}).scalar_one())


@ruta.post('/resumen')
def resumen(consulta: Consulta, s: Session = Depends(sesion), u: Usuario = Depends(CUALQUIERA)) -> dict:
    corrida = corrida_de(s, consulta.corrida_id)
    if corrida.corte_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Los datos de esa corrida ya no están en la base.')
    defn = _definicion(s, consulta)
    ids = P.ids_de(s, corrida.corte_id, defn, muestreo=False)
    auditar(s, u, 'exploracion.consultar', f'corrida:{corrida.id}', {'huella': M.huella(ids), 'n': len(ids)})
    s.commit()
    if not ids:   # un cero es un cero: ningún niño cumple, y la pantalla lo dice con esas palabras
        return {'insuficiente': True, 'vacio': True, 'ninos': 0, 'minimo': P.MIN_NINOS}
    if len(ids) < P.MIN_NINOS:
        return {'insuficiente': True, 'vacio': False, 'ninos': None, 'minimo': P.MIN_NINOS}
    red = u.rol == 'visualizador'
    filtrado = not P.sin_filtros(defn)
    de = ' AND sujeto = ANY(:ids)' if filtrado else ''
    p = {'c': corrida.id, 'ids': ids} if filtrado else {'c': corrida.id}
    mapa = etapas(s, corrida.corte_id)

    riesgos = _filas(s, f"""
        SELECT clave, desenlace, momento, count(*) AS ninos, count(*) FILTER (WHERE percentil >= :alto) AS altos,
               avg(riesgo) AS riesgo_medio
        FROM resultados.riesgos WHERE corrida_id = :c AND NOT silencio{de}
        GROUP BY clave, desenlace, momento ORDER BY desenlace""", alto=PERCENTIL_ALTO, **p)
    ninos_alto = s.execute(text(f"""
        SELECT count(DISTINCT sujeto) FROM resultados.riesgos
        WHERE corrida_id = :c AND NOT silencio AND percentil >= :alto{de}"""), {**p, 'alto': PERCENTIL_ALTO}).scalar_one()
    crec = _filas(s, f"""
        SELECT etapa, indicador, count(*) AS datos,
               100.0 * avg(CASE WHEN bajo_2de THEN 1 ELSE 0 END) AS pct_bajo,
               100.0 * avg(CASE WHEN caida_1de THEN 1 ELSE 0 END) AS pct_caida,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY z) AS z_mediano
        FROM resultados.crecimiento WHERE corrida_id = :c AND NOT improbable{de}
        GROUP BY etapa, indicador""", **p)
    pct_bajo = s.execute(text(f"""
        SELECT 100.0 * avg(CASE WHEN bajo_2de THEN 1 ELSE 0 END) FROM resultados.crecimiento
        WHERE corrida_id = :c AND NOT improbable{de}"""), p).scalar_one()
    datos = _datos(s, corrida, ids if filtrado else None)

    if filtrado:   # D4: ningún desenlace ni visita con menos de 5 niños o datos
        riesgos = [f for f in riesgos if f['ninos'] >= P.MIN_OPCION]
        crec = [f for f in crec if f['datos'] >= P.MIN_OPCION]
    altos_total = sum(f['altos'] for f in riesgos)
    for f in riesgos:
        f['momento_nombre'] = nombre_etapa(mapa, f['momento'])
        f['ninos'], f['altos'] = P.proteger(f['ninos'], red), P.proteger(f['altos'], red)
    for f in crec:
        f['etapa_nombre'] = nombre_etapa(mapa, f['etapa'])
        f['orden'] = mapa.get(f['etapa'], {}).get('orden', 99)
        f['datos'] = P.proteger(f['datos'], red)
    crec.sort(key=lambda f: (f['orden'], f['indicador']))
    cat = P.categorias_por_nino(s, corrida.corte_id)
    return {
        'insuficiente': False, 'minimo': P.MIN_NINOS,
        'corrida': CorridaSalida.model_validate(corrida).model_dump(mode='json'),
        'corte': (corrida.resumen or {}).get('corte') or (str(corrida.fecha_corte) if corrida.fecha_corte else None),
        'filtrado': filtrado,
        'ninos': P.proteger(len(ids), red), 'ninos_total': P.proteger(len(cat), red),
        'datos': P.proteger(int(datos), red),
        'ninos_riesgo_alto': P.proteger(ninos_alto, red), 'riesgos_altos': P.proteger(altos_total, red),
        'percentil_alto': PERCENTIL_ALTO,
        'riesgos_por_desenlace': riesgos, 'crecimiento_por_etapa': crec,
        'pct_crecimiento_bajo': float(pct_bajo) if pct_bajo is not None else None,
        'distribuciones': P.distribuciones(cat, ids),
        'muestreo': _muestreo(s, corrida.corte_id, defn, red),
    }


@ruta.post('/facetas')
def facetas(consulta: Consulta, s: Session = Depends(sesion), u: Usuario = Depends(CUALQUIERA)) -> dict:
    """Las opciones de filtro con cuántos niños tendría cada una (los demás filtros puestos). Con menos de 20 niños en
    el grupo no se dan cifras: quedan las opciones para poder quitar o cambiar filtros. Con 0 niños se dice (``vacio``)."""
    try:
        corte = corrida_de(s, consulta.corrida_id).corte_id
    except HTTPException:
        corte = None
    if corte is None:
        corte = P.corte_actual(s).id
    red = u.rol == 'visualizador'
    try:
        r = P.facetas(s, corte, _definicion(s, consulta), redondear=red,
                      extra=[v.model_dump() for v in consulta.variables or []])
    except M.MuestraInvalida as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, ' '.join(e.errores)) from None
    vacio = r['n'] == 0
    insuficiente = r['n'] < P.MIN_NINOS
    if insuficiente:
        for f in r['facetas'].values():
            for o in f.get('opciones', []):
                o['n'], o['texto'] = None, '—'
            f.pop('bins', None)
            f.pop('cifra', None)
        r['n'] = 0 if vacio else None
    else:
        r['n'] = P.proteger(r['n'], red)
    return {**r, 'insuficiente': insuficiente, 'vacio': vacio, 'minimo': P.MIN_NINOS}
