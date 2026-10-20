"""Tablero: resumen del programa, alarmas por grupo y trimestre, y desempeño de los modelos. Solo agregados."""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from maia_api.consultas import corrida_de, etapas, nombre_etapa
from maia_api.dependencias import CUALQUIERA, sesion
from maia_api.esquemas import CorridaSalida
from maia_comun.modelos_db import Usuario

ruta = APIRouter(prefix='/tablero', tags=['tablero'])


def _filas(s: Session, sql: str, **p) -> list[dict]:
    return [dict(r._mapping) for r in s.execute(text(sql), p)]


@ruta.get('/resumen')
def resumen(corrida_id: int | None = None, s: Session = Depends(sesion), _: Usuario = Depends(CUALQUIERA)) -> dict:
    c = corrida_de(s, corrida_id)
    mapa = etapas(s, c.corte_id)
    r = c.resumen or {}
    riesgos = _filas(s, """
        SELECT clave, desenlace, momento, count(*) AS ninos, count(*) FILTER (WHERE percentil >= 90) AS altos,
               avg(riesgo) AS riesgo_medio
        FROM resultados.riesgos WHERE corrida_id = :c AND NOT silencio
        GROUP BY clave, desenlace, momento ORDER BY desenlace""", c=c.id)
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


@ruta.get('/desempeno')
def desempeno(corrida_id: int | None = None, s: Session = Depends(sesion), _: Usuario = Depends(CUALQUIERA)) -> dict:
    """Validación de los modelos de la corrida: por desenlace (AUC del modelo y de la regla simple, casos en el 10 %
    de mayor riesgo, PR-AUC) y por tipo de error inyectado (porcentaje detectado)."""
    c = corrida_de(s, corrida_id)
    metricas = _filas(s, 'SELECT modelo, version, clave, metrica, valor FROM resultados.metricas_modelo WHERE corrida_id = :c',
                      c=c.id)
    nombres = {f['clave']: f['desenlace'] for f in _filas(
        s, 'SELECT DISTINCT clave, desenlace FROM resultados.riesgos WHERE corrida_id = :c', c=c.id)}
    clinico: dict[str, dict] = defaultdict(dict)
    anomalias: dict[str, dict] = defaultdict(dict)
    falsas: dict[str, float] = {}
    for m in metricas:
        if m['modelo'] == 'clinico' and m['clave'] != '-':
            clinico[m['clave']][m['metrica']] = m['valor']
        elif m['modelo'] == 'anomalias' and m['metrica'] == 'detectados_pct':
            tipo, _, capa = m['clave'].partition('__')
            anomalias[tipo][capa] = m['valor']
        elif m['modelo'] == 'anomalias' and m['metrica'] == 'falsas_por_1000':
            falsas[m['clave']] = m['valor']
    desenlaces = [{'clave': k, 'desenlace': nombres.get(k, k), **v} for k, v in sorted(clinico.items())]
    return {'desenlaces': desenlaces,
            'errores_detectados': [{'tipo': k, **v} for k, v in sorted(anomalias.items())],
            'falsas_por_1000': falsas,
            'modelo_clinico': c.modelo_clinico, 'modelo_anomalias': c.modelo_anomalias}
