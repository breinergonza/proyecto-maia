"""Riesgo de algunos niños visita por visita y la primera visita en que se encendió la alerta (D12, D19).

``GET /analitica/riesgo-por-visita?desenlace=readm_6m`` lo usan Anticipación (tres niños de ejemplo) y Predicción (los
niños que la pantalla elija con ``sujetos``). Cada punto es el percentil de riesgo del niño en una visita, calculado
ahora con el paquete activo y solo con lo medido hasta esa visita (``ninos.historia_riesgo``). Para una familia de
anticipación junta la fila base y las filas ``_desde_``.

Son niños individuales, aunque solo se identifican por su código seudonimizado: solo el experto y el administrador (como
las trayectorias individuales), hasta ``MAX_NINOS`` por petición, y cada consulta queda en la auditoría.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from maia_api.consultas import corrida_de
from maia_api.dependencias import EXPERTO, auditar, sesion
from maia_api.rutas import ninos
from maia_comun import riesgo_visita as RV
from maia_comun.modelos_db import PERCENTIL_ALTO, Usuario

ruta = APIRouter(prefix='/riesgo-por-visita', tags=['analitica'])

MAX_NINOS = 30
POR_DEFECTO = 3


def _mas_riesgosos(s: Session, corrida: int, desenlace: str, n: int) -> list[str]:
    """Los ``n`` niños con el percentil de riesgo más alto del desenlace (o de su familia) en la corrida."""
    filas = s.execute(text(
        r"SELECT sujeto, max(percentil) AS p FROM resultados.riesgos WHERE corrida_id = :c AND NOT silencio "
        r"AND (clave = :d OR clave LIKE :f) GROUP BY sujeto ORDER BY p DESC, sujeto LIMIT :n"),
        {'c': corrida, 'd': desenlace, 'f': desenlace.replace('_', r'\_') + r'\_desde\_%', 'n': n}).fetchall()
    return [f[0] for f in filas]


@ruta.get('')
def riesgo_por_visita(desenlace: str = Query(..., min_length=1, max_length=80),
                      sujetos: str | None = Query(None, description='códigos separados por coma; sin pedir, los de más riesgo'),
                      n: int = Query(POR_DEFECTO, ge=1, le=MAX_NINOS), corrida_id: int | None = Query(None),
                      s: Session = Depends(sesion), u: Usuario = Depends(EXPERTO)) -> dict:
    """Por niño, sus puntos de riesgo en cada visita para el desenlace pedido y la primera visita con alerta
    (``percentil >= umbral``). Un niño que no está en el corte sale con ``error`` y los demás se calculan."""
    c = corrida_de(s, corrida_id)
    pedidos = [x.strip() for x in (sujetos or '').split(',') if x.strip()]
    if len(pedidos) > MAX_NINOS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f'Se pueden pedir hasta {MAX_NINOS} niños a la vez.')
    elegidos = pedidos or _mas_riesgosos(s, c.id, desenlace, n)
    salida = []
    for sujeto in elegidos:
        try:
            h = ninos.historia_riesgo(sujeto, c.id, s, u)
        except HTTPException as e:
            if e.status_code != status.HTTP_404_NOT_FOUND:
                raise
            salida.append({'sujeto': sujeto, 'error': e.detail})
            continue
        salida.append({'sujeto': sujeto, **RV.por_desenlace(h['puntos'], PERCENTIL_ALTO, desenlace)})
    auditar(s, u, 'analitica.riesgo_por_visita', f'corrida:{c.id}', {'desenlace': desenlace, 'ninos': len(salida)})
    return {'corrida_id': c.id, 'desenlace': desenlace, 'umbral_percentil': PERCENTIL_ALTO,
            'elegidos_por': 'pedido' if pedidos else 'mayor_riesgo', 'ninos': salida}
