"""Niños: lista filtrable con su riesgo más alto, y la línea temporal de un niño (visitas, mediciones, puntajes z
de la OMS, alertas de dato y riesgos). Los códigos son los seudonimizados de la base; nunca hay nombres.

Cada ruta es de experto y administración: quien solo consulta ve agregados, nunca un niño (D5, D65)."""
from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from collections.abc import Callable
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from clinico import crecimiento as CR
from clinico.modelo import Desenlace
from maia_api import estado as E
from maia_api.consultas import (
    corrida_de,
    esquema,
    etapas,
    medidas_numericas,
    motivo_legible,
    nombre_etapa,
    sujeto_existe,
    unidad_mostrada,
    unidades_crecimiento,
    valor_legible,
)
from maia_api.dependencias import EXPERTO, sesion
from maia_comun import clinica as CL
from maia_comun import puntuacion as PU
from maia_comun.modelos_db import PERCENTIL_ALTO, Usuario
from maia_comun.perfiles import VARIABLE_LUBCHENCO, perfil_provisional
from sevarti.contrato import Sevarti

ruta = APIRouter(prefix='/ninos', tags=['niños'])
registro = logging.getLogger(__name__)
MINIMO_COHORTE = 20   # con menos niños, los cuantiles dirían más de cada uno que del grupo

# Columnas por las que se puede ordenar la lista (lista cerrada: el nombre nunca llega al SQL sin pasar por aquí).
ORDENES = {
    'sujeto': 's.sujeto',
    'eg_semanas': 's.eg_semanas',
    'desenlace_max': 'r.desenlace_max',
    'percentil_max': 'r.percentil_max',
    'n_alertas': 'coalesce(a.n_alertas, 0)',
    'crecimiento': 'coalesce(g.n_bajo, 0) + coalesce(g.n_caida, 0)',
    'ultimo_control': 'u.orden',
}


@ruta.get('')
def listar(buscar: str | None = None, desenlace: str | None = None,
           percentil_min: float | None = Query(None, ge=0, le=100), pagina: int = Query(1, ge=1),
           tamano: int = Query(25, ge=1, le=200), corrida_id: int | None = None,
           orden: Literal['sujeto', 'eg_semanas', 'desenlace_max', 'percentil_max', 'n_alertas', 'crecimiento',
                          'ultimo_control'] | None = None,
           dir: Literal['asc', 'desc'] = 'desc',
           s: Session = Depends(sesion), _: Usuario = Depends(EXPERTO)) -> dict:
    c = corrida_de(s, corrida_id)
    if c.corte_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'Los datos de esa corrida ya no están cargados.')
    mapa = etapas(s, c.corte_id)
    # cada variable de visita con su visita y su orden: el último control es la última visita con algún dato, como en
    # la ficha (no solo las que tienen medidas de crecimiento)
    de_visita = [(v, d['etapa']) for v, d in esquema(s, c.corte_id).items() if d.get('etapa') in mapa]
    filtros_r = ['corrida_id = :c', 'NOT silencio']
    if desenlace:
        filtros_r.append('clave = :d')
    donde_r = ' AND '.join(filtros_r)
    con_riesgo = desenlace is not None or percentil_min is not None
    filtros = ['s.corte_id = :corte']
    if buscar:
        filtros.append('s.sujeto ILIKE :b')
    if percentil_min is not None:
        filtros.append('r.percentil_max >= :p')
    if con_riesgo:
        filtros.append('r.percentil_max IS NOT NULL')
    base = f"""
        FROM sevarti.sujetos s
        LEFT JOIN (
            SELECT DISTINCT ON (sujeto) sujeto, percentil AS percentil_max, riesgo AS riesgo_max,
                   desenlace AS desenlace_max, clave AS clave_max, count(*) OVER (PARTITION BY sujeto) AS n_riesgos
            FROM resultados.riesgos WHERE {donde_r}
            ORDER BY sujeto, percentil DESC
        ) r ON r.sujeto = s.sujeto
        LEFT JOIN (SELECT sujeto, count(*) AS n_alertas FROM resultados.alertas_dato WHERE corrida_id = :c GROUP BY sujeto)
            a ON a.sujeto = s.sujeto
        LEFT JOIN (SELECT sujeto, count(*) FILTER (WHERE bajo_2de) AS n_bajo, count(*) FILTER (WHERE caida_1de) AS n_caida,
                          count(*) FILTER (WHERE NOT improbable AND z IS NOT NULL) AS n_medidas
                   FROM resultados.crecimiento WHERE corrida_id = :c GROUP BY sujeto) g ON g.sujeto = s.sujeto
        -- el último control: la última visita con algún dato, su fecha y la edad corregida de ese día (si se calculó)
        LEFT JOIN (SELECT DISTINCT ON (sujeto) sujeto, etapa, orden, fecha FROM (
                       SELECT m.sujeto, ve.etapa, ve.orden, max(m.fecha) AS fecha FROM sevarti.mediciones m
                       JOIN unnest(CAST(:ve_v AS text[]), CAST(:ve_e AS text[]), CAST(:ve_o AS double precision[]))
                           AS ve(variable, etapa, orden) ON ve.variable = m.variable
                       WHERE m.corte_id = :corte GROUP BY m.sujeto, ve.etapa, ve.orden) x
                   ORDER BY sujeto, orden DESC) u ON u.sujeto = s.sujeto
        LEFT JOIN (SELECT sujeto, etapa, max(edad_corregida) AS edad_corregida FROM resultados.crecimiento
                   WHERE corrida_id = :c GROUP BY sujeto, etapa) ue ON ue.sujeto = u.sujeto AND ue.etapa = u.etapa
        WHERE {' AND '.join(filtros)}"""
    p = {'c': c.id, 'corte': c.corte_id, 'd': desenlace, 'b': f'%{buscar}%' if buscar else None, 'p': percentil_min,
         've_v': [v for v, _ in de_visita], 've_e': [e for _, e in de_visita],
         've_o': [float(mapa[e]['orden']) for _, e in de_visita]}
    total = s.execute(text(f'SELECT count(*) {base}'), p).scalar_one()
    orden_sql = f'{ORDENES[orden]} {dir.upper()} NULLS LAST, ' if orden else ''
    filas = s.execute(text(f"""
        SELECT s.sujeto, s.eg_semanas, s.grupo, r.percentil_max, r.riesgo_max, r.desenlace_max, r.clave_max,
               coalesce(r.n_riesgos, 0) AS n_riesgos, coalesce(a.n_alertas, 0) AS n_alertas,
               coalesce(g.n_bajo, 0) AS n_bajo_2de, coalesce(g.n_caida, 0) AS n_caida_1de,
               coalesce(g.n_medidas, 0) AS n_crecimiento, u.etapa AS ultima_etapa, u.fecha AS ultima_fecha,
               ue.edad_corregida AS ultima_edad_corregida
        {base}
        ORDER BY {orden_sql}r.percentil_max DESC NULLS LAST, a.n_alertas DESC NULLS LAST, s.sujeto
        LIMIT :lim OFFSET :off"""), {**p, 'lim': tamano, 'off': (pagina - 1) * tamano})
    items = []
    for f in filas:
        d = dict(f._mapping)
        d['ultima_visita'] = nombre_etapa(mapa, d.pop('ultima_etapa'))
        items.append(d)
    return {'total': total, 'pagina': pagina, 'tamano': tamano, 'items': items}


def unidad_crecimiento(esq: dict, unidades: dict, variable: str | None, indicador: str, etapa: str | None) -> str | None:
    """La unidad de un dato de crecimiento: la de su variable de origen (así el peso para la talla lleva la del peso que
    se midió) o, en las corridas viejas que no la guardaron, la que sale del indicador y la etapa."""
    if variable and variable in esq:
        return str(esq[variable].get('unidad') or '').strip() or None
    return unidades.get((indicador, etapa))


def _tabla(s: Session, sql: str, p: dict) -> pd.DataFrame:
    r = s.execute(text(sql), p)
    return pd.DataFrame(r.fetchall(), columns=list(r.keys()))


def _texto_motivos(m) -> list[str]:
    return list(m) if isinstance(m, list) else []


@ruta.get('/{sujeto}/linea-temporal')
def linea_temporal(sujeto: str, corrida_id: int | None = None, s: Session = Depends(sesion),
                   _: Usuario = Depends(EXPERTO)) -> dict:
    c = corrida_de(s, corrida_id)
    if not sujeto_existe(s, c.corte_id, sujeto):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No hay un niño {sujeto} en el corte de la corrida.')
    mapa = etapas(s, c.corte_id)
    esq = esquema(s, c.corte_id)
    datos_nino = s.execute(text('SELECT sujeto, grupo, eg_semanas, fecha_nacimiento, anio_nacimiento FROM sevarti.sujetos '
                                'WHERE corte_id = :c AND sujeto = :s'), {'c': c.corte_id, 's': sujeto}).one()._mapping
    meds = s.execute(text('SELECT variable, valor, fecha, edad_dias FROM sevarti.mediciones '
                          'WHERE corte_id = :c AND sujeto = :s ORDER BY fecha NULLS FIRST, id'),
                     {'c': c.corte_id, 's': sujeto})
    alertas = s.execute(text('SELECT id, variable, etiqueta, etapa, valor, esperado, rango_bajo, rango_alto, capas, motivo, '
                             'prioridad FROM resultados.alertas_dato WHERE corrida_id = :c AND sujeto = :s ORDER BY prioridad'),
                        {'c': c.id, 's': sujeto})
    # con el riesgo promedio de su desenlace en la corrida: un 3 % solo se entiende al lado de lo habitual
    riesgos = s.execute(text("""
        SELECT r.id, r.clave, r.desenlace, r.momento, r.riesgo, r.percentil, r.motivos, r.fecha_visita, m.riesgo_medio
        FROM resultados.riesgos r
        JOIN (SELECT clave, avg(riesgo) AS riesgo_medio FROM resultados.riesgos
              WHERE corrida_id = :c AND NOT silencio GROUP BY clave) m ON m.clave = r.clave
        WHERE r.corrida_id = :c AND r.sujeto = :s AND NOT r.silencio
        ORDER BY r.percentil DESC"""), {'c': c.id, 's': sujeto})
    crec = s.execute(text('SELECT etapa, indicador, variable, fecha, edad_corregida, valor, z, bajo_2de, caida_1de, improbable '
                          'FROM resultados.crecimiento WHERE corrida_id = :c AND sujeto = :s ORDER BY edad_corregida'),
                     {'c': c.id, 's': sujeto})

    lub = s.execute(text('SELECT valor FROM sevarti.mediciones WHERE corte_id = :c AND sujeto = :s AND variable = :v '
                         'AND valor IS NOT NULL ORDER BY fecha NULLS FIRST, id LIMIT 1'),
                    {'c': c.corte_id, 's': sujeto, 'v': VARIABLE_LUBCHENCO}).scalar()

    visitas: dict[str, dict] = {}
    sin_visita: list[dict] = []

    def visita(etapa: str) -> dict:
        if etapa not in visitas:
            info = mapa.get(etapa, {})
            visitas[etapa] = {'etapa': etapa, 'nombre': info.get('nombre', etapa), 'orden': info.get('orden', 99),
                              'fecha': None, 'edad_corregida': None, 'mediciones': [], 'z': {}, 'alertas_dato': [],
                              'riesgos': []}
        return visitas[etapa]

    for m in meds:
        d = esq.get(m.variable, {})
        # como lo diría el médico: «Sí», «1.500 g», no «1.0 SI/NO» ni «1500.0 GRAMOS» (igual que en la revisión)
        item = {'variable': m.variable, 'etiqueta': d.get('etiqueta') or m.variable,
                'valor': None if m.valor is None else valor_legible(d, m.valor),
                'unidad': unidad_mostrada(d), 'fecha': m.fecha, 'tema': d.get('tema')}
        etapa = d.get('etapa')
        if etapa:
            v = visita(etapa)
            v['mediciones'].append(item)
            if m.fecha and (v['fecha'] is None or m.fecha > v['fecha']):
                v['fecha'] = m.fecha
        else:
            sin_visita.append(item)
    for a in alertas:
        d = dict(a._mapping)
        d['capas'] = list(d['capas'] or [])
        if a.etapa:
            visita(a.etapa)['alertas_dato'].append(d)
        else:
            sin_visita.append({'variable': a.variable, 'etiqueta': a.etiqueta, 'valor': a.valor, 'alerta': d})
    for r in riesgos:
        d = dict(r._mapping)
        d['motivos'] = [motivo_legible(x, esq) for x in _texto_motivos(d['motivos'])]
        visita(r.momento)['riesgos'].append(d)
    serie = defaultdict(list)
    unidades = unidades_crecimiento(esq)
    for g in crec:
        d = dict(g._mapping)
        d['unidad'] = unidad_crecimiento(esq, unidades, g.variable, g.indicador, g.etapa)
        serie[g.indicador].append(d)
        if g.etapa:
            v = visita(g.etapa)
            v['z'][g.indicador] = g.z
            if g.edad_corregida is not None:
                v['edad_corregida'] = g.edad_corregida
    ordenadas = sorted(visitas.values(), key=lambda v: v['orden'])
    con_datos = [v for v in ordenadas if v['mediciones'] or v['riesgos'] or v['z']]
    actual = (con_datos or ordenadas or [None])[-1]
    return {
        'sujeto': sujeto, 'grupo': datos_nino['grupo'], 'eg_semanas': datos_nino['eg_semanas'],
        'perfil': perfil_provisional(datos_nino['eg_semanas'], lub, actual['nombre'] if actual else None),
        'anio_nacimiento': datos_nino['anio_nacimiento'] or (datos_nino['fecha_nacimiento'].year
                                                              if datos_nino['fecha_nacimiento'] else None),
        'corte': str(c.fecha_corte) if c.fecha_corte else None, 'corrida_id': c.id, 'modelo_clinico': c.modelo_clinico,
        'visitas': ordenadas,
        'contexto': sin_visita,
        'crecimiento': {k: v for k, v in serie.items()},
        'nombre_etapa': {k: nombre_etapa(mapa, k) for k in mapa},
    }


_INDICADOR_Z = {'talla': 'Talla para la edad', 'peso': 'Peso para la edad', 'perimetro_cefalico': 'Perímetro cefálico para la edad'}


def _nombre_familia(des: Desenlace) -> str:
    """El nombre del desenlace sin la visita desde la que se calcula: «… (riesgo calculado a 3 m EC)» -> «…»."""
    return re.sub(r'\s*\(riesgo calculado a [^()]*\)\s*$', '', des.nombre)


def _definicion(des: Desenlace, medidas: tuple[CR.Medida, ...]) -> str | None:
    """Qué cuenta como el desenlace, dicho para quien lee la ficha; None si la regla no se resume en una frase."""
    if des.regla == 'z_bajo' and des.concepto and des.etapa:
        limite = next((m.z_bajo for m in medidas if m.nombre == des.concepto), CR.Z_BAJO)
        nombre = _INDICADOR_Z.get(des.concepto, des.concepto.replace('_', ' ').capitalize())
        return f'{nombre} con z menor que {f"{limite:g}".replace("-", "−")} (OMS) en la visita de {des.etapa}.'
    if des.regla == 'percentil_bajo':
        return f'Resultado por debajo del percentil {round(100 * des.percentil)} de los niños del programa.'
    return None


def riesgo_por_corte(sev: Sevarti, modelos: PU.Modelos, manifest: dict, base: Path, sujeto: str, con_motivos: bool = False,
                     legible: Callable[[str], str] = str) -> dict:
    """El riesgo del niño en cada visita a la que fue, con el paquete activo: cada punto usa solo lo medido hasta su
    visita (``ModeloClinico.matriz`` descarta lo posterior). Además de los puntos, dice qué familias de desenlace tiene
    el paquete, desde qué visitas se calcula cada una, por qué falta el riesgo de un corte y con qué modelo se calculó.
    Lo comparten la ficha del niño y «Calcular un niño». La corrida no sirve de fuente: guarda solo la última visita."""
    clin = modelos.clinico
    p = clin.preparar(sev)
    bruto = clin.riesgos(p, solo_ultima_visita=False, con_motivos=con_motivos, solo_pendientes=False)
    tabla = PU.tabla_riesgos(bruto, 0, False)
    tabla = tabla[tabla.sujeto == sujeto]
    # el orden y el nombre de cada visita salen del mismo paquete que calculó el riesgo, no del corte de la corrida
    et = pd.read_parquet(base / 'etapas.parquet')
    mapa = {str(e): {'nombre': n if isinstance(n, str) and n else str(e), 'orden': int(o)}
            for e, n, o in zip(et.etapa, et.nombre if 'nombre' in et else et.etapa, et.orden)}
    puntos = []
    for f in tabla.itertuples():
        punto = {
            'clave': f.clave, 'desenlace': f.desenlace, 'momento': f.momento, 'estado': CL.estado_de(f.clave),
            'momento_nombre': nombre_etapa(mapa, f.momento), 'orden': mapa.get(f.momento, {}).get('orden', 99),
            'riesgo': float(f.riesgo), 'percentil': float(f.percentil),
            'fecha_visita': None if pd.isna(f.fecha_visita) else str(f.fecha_visita)[:10],
        }
        if con_motivos:
            punto['motivos'] = [legible(m) for m in _texto_motivos(json.loads(f.motivos))]
        puntos.append(punto)
    puntos.sort(key=lambda x: (x['orden'], x['desenlace']))
    # primera visita en que el niño llegó a riesgo alto, por desenlace (null si nunca)
    primera: dict[str, dict | None] = {x['clave']: None for x in puntos}
    for x in puntos:
        if primera[x['clave']] is None and x['percentil'] >= PERCENTIL_ALTO:
            primera[x['clave']] = {'momento': x['momento'], 'momento_nombre': x['momento_nombre'], 'orden': x['orden']}

    # las familias del paquete: todas las visitas desde las que se predice cada una, con o sin riesgo para este niño
    con_riesgo = {x['clave'] for x in puntos}
    sin_datos = clin.sin_datos(sev)
    asistio = {m: sujeto in set(clin.asistieron(p, m)) for m in {d.momento for d in clin.cfg.desenlaces}}

    def motivo_sin_riesgo(d: Desenlace) -> str | None:
        if d.clave in con_riesgo:
            return None
        if d.clave not in clin.modelos:
            return 'no_entrenado'
        if d.clave in sin_datos:
            return 'sin_datos'
        return 'fuera_de_poblacion' if asistio[d.momento] else 'no_asistio'

    por_familia: dict[str, list[Desenlace]] = defaultdict(list)
    for d in clin.cfg.desenlaces:
        por_familia[CL.familia_de(d.clave)].append(d)
    familias = []
    for clave, ds in por_familia.items():
        ds.sort(key=lambda d: mapa.get(d.momento, {}).get('orden', 99))
        propio = next((d for d in ds if d.clave == clave), ds[0])
        familias.append({
            'clave': clave, 'nombre': _nombre_familia(propio), 'definicion': _definicion(propio, clin.cfg.medidas),
            # «En uso» si existe la fila base de la familia; si solo hay filas _desde_, «En prueba»
            'estado': CL.estado_de(clave) if propio.clave == clave else 'en_prueba',
            'cortes': [{
                'clave': d.clave, 'momento': d.momento, 'momento_nombre': nombre_etapa(mapa, d.momento),
                'orden': mapa.get(d.momento, {}).get('orden', 99), 'estado': CL.estado_de(d.clave),
                'motivo_sin_riesgo': motivo_sin_riesgo(d),
                'calibrado_con': (clin.modelos[d.clave].calibrado_con or None) if d.clave in clin.modelos else None,
            } for d in ds],
        })
    ficha = modelos.ficha_clinica
    return {'paquete': manifest['version'], 'puntos': puntos, 'primera_alerta': primera, 'familias': familias,
            'modelo': {'version': clin.version, 'entrenado': ficha.get('entrenado'), 'corte_datos': ficha.get('corte_datos')}}


@ruta.get('/{sujeto}/historia-riesgo')
def historia_riesgo(sujeto: str, corrida_id: int | None = None, s: Session = Depends(sesion),
                    _: Usuario = Depends(EXPERTO), motivos: bool = False) -> dict:
    """El riesgo de cada desenlace en cada visita del niño, calculado ahora con el paquete activo: cada punto usa solo lo
    medido hasta su visita. La corrida guarda solo la última visita, así que esto no sale de ``resultados.riesgos``.
    Con ``motivos`` cada punto trae también lo que más pesó en su riesgo (es lo caro: por eso es opcional). Trae además
    las familias del paquete con sus cortes y el modelo con que se calculó (ver ``riesgo_por_corte``)."""
    c = corrida_de(s, corrida_id)
    if not sujeto_existe(s, c.corte_id, sujeto):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No hay un niño {sujeto} en el corte de la corrida.')
    activo = E.activo()
    if activo is None:
        raise HTTPException(status.HTTP_409_CONFLICT, 'No hay un paquete de modelos activo para calcular la historia.')
    modelos, manifest, carpeta = activo
    base = carpeta / 'sevarti_base'
    variables = list(pd.read_parquet(base / 'esquema.parquet', columns=['variable']).variable)
    p = {'c': c.corte_id, 's': sujeto}
    parcial = {
        'sujetos': _tabla(s, 'SELECT sujeto, grupo, fecha_nacimiento, eg_semanas, anio_nacimiento FROM sevarti.sujetos '
                             'WHERE corte_id = :c AND sujeto = :s', p),
        'mediciones': _tabla(s, 'SELECT sujeto, variable, valor, fecha, edad_dias FROM sevarti.mediciones '
                                'WHERE corte_id = :c AND sujeto = :s AND variable = ANY(:v)', {**p, 'v': variables}),
        'episodios': _tabla(s, 'SELECT sujeto, tipo, edad_inicio, edad_fin FROM sevarti.episodios '
                               'WHERE corte_id = :c AND sujeto = :s', p),
    }
    corte = pd.Timestamp(c.fecha_corte) if c.fecha_corte else None
    esq = esquema(s, c.corte_id)
    try:
        historia = riesgo_por_corte(PU.completar(parcial, base, corte), modelos, manifest, base, sujeto, motivos,
                                    lambda m: motivo_legible(m, esq))
    except (ValueError, KeyError) as e:
        registro.warning('No se pudo calcular la historia de riesgo de %s: %s: %s', sujeto, type(e).__name__, e,
                         exc_info=True)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            'No se pudo calcular el riesgo en las visitas anteriores de este niño.') from e
    return {**historia, 'paquete_corrida': c.paquete}


# Valores de cada variable del perfil (uno por niño), por corte y ordenados. Los datos de un corte no cambian: se leen
# una vez. Dos peticiones a la vez pueden leer lo mismo; el resultado es igual y la última escritura gana.
_COHORTE: dict[tuple[int, str], np.ndarray] = {}
def _valores_cohorte(s: Session, corte_id: int, variables: list[str], esq: dict) -> dict[str, np.ndarray]:
    faltan = [v for v in variables if (corte_id, v) not in _COHORTE]
    if faltan:
        leidos: dict[str, list[float]] = {v: [] for v in faltan}
        if 'eg_semanas' in leidos:
            leidos['eg_semanas'] = [r[0] for r in s.execute(text(
                'SELECT eg_semanas FROM sevarti.sujetos WHERE corte_id = :c AND eg_semanas IS NOT NULL'),
                {'c': corte_id})]
        otras = [v for v in faltan if v != 'eg_semanas']
        if otras:
            for _, variable, x in medidas_numericas(s, corte_id, otras, esq):
                leidos[variable].append(x)
        for v, valores in leidos.items():
            _COHORTE[(corte_id, v)] = np.sort(np.asarray(valores, dtype=float))
    return {v: _COHORTE[(corte_id, v)] for v in variables}


def _variables_perfil(esq: dict) -> list[str]:
    """Edad gestacional y las medidas al nacer: los datos basales numéricos que el diccionario une a un concepto de
    crecimiento (peso, talla, perímetro). Lo decide el diccionario, no el código."""
    al_nacer = sorted(v for v, d in esq.items()
                      if d.get('rol') == 'basal' and d.get('tipo') == 'numeric' and isinstance(d.get('concepto'), str)
                      and d['concepto'])
    return ['eg_semanas', *al_nacer]


@ruta.get('/{sujeto}/perfil')
def perfil(sujeto: str, corrida_id: int | None = None, s: Session = Depends(sesion),
           _: Usuario = Depends(EXPERTO)) -> dict:
    """Dónde queda el niño frente a los demás niños del corte en su edad gestacional y sus medidas al nacer. De la
    cohorte solo salen agregados (cuantiles y cuántos niños), nunca valores de otro niño."""
    c = corrida_de(s, corrida_id)
    if not sujeto_existe(s, c.corte_id, sujeto):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No hay un niño {sujeto} en el corte de la corrida.')
    esq = esquema(s, c.corte_id)
    variables = _variables_perfil(esq)
    cohorte = _valores_cohorte(s, c.corte_id, variables, esq)
    propios: dict[str, float] = {}
    eg = s.execute(text('SELECT eg_semanas FROM sevarti.sujetos WHERE corte_id = :c AND sujeto = :s'),
                   {'c': c.corte_id, 's': sujeto}).scalar()
    if eg is not None:
        propios['eg_semanas'] = float(eg)
    for _, variable, x in medidas_numericas(s, c.corte_id, variables[1:], esq, [sujeto]):
        propios[variable] = x
    filas = []
    for v in variables:
        valores = cohorte[v]
        if len(valores) < MINIMO_COHORTE:
            continue
        x = propios.get(v)
        d = esq.get(v, {})
        filas.append({
            'variable': v,
            'etiqueta': 'Edad gestacional' if v == 'eg_semanas' else d.get('etiqueta') or v,
            'unidad': 'semanas' if v == 'eg_semanas' else unidad_mostrada(d),
            'ninos': int(len(valores)),
            'cuantiles': dict(zip(('p5', 'p25', 'p50', 'p75', 'p95'),
                                  (float(q) for q in np.quantile(valores, [0.05, 0.25, 0.5, 0.75, 0.95])))),
            'valor': x,
            # porcentaje de niños con un valor estrictamente menor (lo que dice la web: «N de cada 100 tienen menos»)
            'posicion': None if x is None else float(100 * np.searchsorted(valores, x, 'left') / len(valores)),
        })
    return {'variables': filas}
