"""Tablero: resumen del programa y alarmas por grupo y trimestre. Solo agregados.

La validación técnica de los modelos (AUC y demás) no pasa por aquí: está en Administración › Modelos y en MLflow."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from maia_api.consultas import corrida_de, etapas, nombre_etapa
from maia_api.dependencias import CUALQUIERA, sesion
from maia_api.esquemas import CorridaSalida
from maia_comun.modelos_db import PERCENTIL_ALTO, Usuario

ruta = APIRouter(prefix='/tablero', tags=['tablero'])


def _filas(s: Session, sql: str, **p) -> list[dict]:
    return [dict(r._mapping) for r in s.execute(text(sql), p)]


@ruta.get('/resumen')
def resumen(corrida_id: int | None = None, s: Session = Depends(sesion), _: Usuario = Depends(CUALQUIERA)) -> dict:
    c = corrida_de(s, corrida_id)
    mapa = etapas(s, c.corte_id)
    r = c.resumen or {}
    riesgos = _filas(s, """
        SELECT clave, desenlace, momento, count(*) AS ninos, count(*) FILTER (WHERE percentil >= :alto) AS altos,
               avg(riesgo) AS riesgo_medio
        FROM resultados.riesgos WHERE corrida_id = :c AND NOT silencio
        GROUP BY clave, desenlace, momento ORDER BY desenlace""", c=c.id, alto=PERCENTIL_ALTO)
    # un niño con riesgo alto en tres desenlaces es un niño, no tres
    ninos_alto = s.execute(text("""
        SELECT count(DISTINCT sujeto) FROM resultados.riesgos
        WHERE corrida_id = :c AND NOT silencio AND percentil >= :alto"""), {'c': c.id, 'alto': PERCENTIL_ALTO}).scalar_one()
    for f in riesgos:
        f['momento_nombre'] = nombre_etapa(mapa, f['momento'])
    crec = _filas(s, """
        SELECT etapa, indicador, count(*) AS datos,
               100.0 * avg(CASE WHEN bajo_2de THEN 1 ELSE 0 END) AS pct_bajo,
               100.0 * avg(CASE WHEN caida_1de THEN 1 ELSE 0 END) AS pct_caida,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY z) AS z_mediano
        FROM resultados.crecimiento WHERE corrida_id = :c AND NOT improbable
        GROUP BY etapa, indicador""", c=c.id)
    for f in crec:
        f['etapa_nombre'] = nombre_etapa(mapa, f['etapa'])
        f['orden'] = mapa.get(f['etapa'], {}).get('orden', 99)
    crec.sort(key=lambda f: (f['orden'], f['indicador']))
    revisados = s.execute(text("""
        SELECT count(DISTINCT r.alerta_id) FROM resultados.revision_datos r
        JOIN resultados.alertas_dato a ON a.id = r.alerta_id WHERE a.corrida_id = :c"""), {'c': c.id}).scalar_one()
    return {
        'corrida': CorridaSalida.model_validate(c).model_dump(mode='json'),
        'corte': r.get('corte') or (str(c.fecha_corte) if c.fecha_corte else None),
        'fuente': c.fuente, 'paquete': c.paquete,
        'ninos': r.get('ninos'), 'datos': r.get('datos'),
        'datos_revisar': r.get('datos_revisar'), 'ninos_revisar': r.get('ninos_revisar'),
        'datos_revisados': revisados, 'alertas_por_1000': r.get('alertas_por_1000'),
        'alertas_por_capa': r.get('alertas_por_capa', {}), 'alarmas_grupo': r.get('alarmas_grupo'),
        'ninos_con_riesgo': r.get('ninos_con_riesgo'),
        'ninos_riesgo_alto': ninos_alto, 'riesgos_altos': sum(f['altos'] for f in riesgos),
        'percentil_alto': PERCENTIL_ALTO,
        'riesgos_por_desenlace': riesgos, 'crecimiento_por_etapa': crec,
    }


@ruta.get('/alarmas-grupo')
def alarmas_grupo(variable: str | None = None, corrida_id: int | None = None, s: Session = Depends(sesion),
                  _: Usuario = Depends(CUALQUIERA)) -> list[dict]:
    c = corrida_de(s, corrida_id)
    filtro = ' AND variable = :v' if variable else ''
    return _filas(s, f"""
        SELECT grupo, periodo, variable, etiqueta, senal, valor, referencia, estadistico, que_paso
        FROM resultados.alarmas_grupo WHERE corrida_id = :c{filtro}
        ORDER BY periodo DESC, abs(estadistico) DESC NULLS LAST LIMIT 500""", c=c.id, v=variable)
