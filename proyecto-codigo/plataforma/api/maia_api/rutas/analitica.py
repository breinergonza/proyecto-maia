"""Analítica de los modelos (cualquier perfil): lee los artefactos agregados que el entrenamiento dejó en
``resultados.analitica``. No recalcula nada (D32): un entrenamiento anterior, sin artefactos, da ``sin_artefactos``.
Solo agregados (D7); las celdas con menos de 5 niños ya vienen omitidas (D4)."""
from __future__ import annotations

from types import SimpleNamespace
from typing import Literal

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from maia_api.consultas import corrida_de, esquema, etapas, medidas_numericas
from maia_api.dependencias import CUALQUIERA, sesion
from maia_api.poblacion import VARIABLES_SEXO
from maia_api.rutas import analitica_anticipacion as anticipacion
from maia_api.rutas import analitica_comparar as comparar
from maia_api.rutas.ninos import _variables_perfil, unidad_crecimiento
from maia_comun import analitica as AN
from maia_comun import analitica_interpretabilidad as AI
from maia_comun import perfiles as PF
from maia_comun.modelos_analitica import Analitica
from maia_comun.modelos_db import PERCENTIL_ALTO, Usuario

ruta = APIRouter(prefix='/analitica', tags=['analitica'])
ruta.include_router(comparar.ruta)   # /analitica/comparar (entrenamientos y grupos de niños)
ruta.include_router(anticipacion.ruta)   # /analitica/riesgo-por-visita (niños de ejemplo; Anticipación y Predicción)

# submódulo -> fila que lo alimenta; ``None`` = pendiente (aún no se calcula)
TIPOS = {'rendimiento': 'rendimiento', 'calibracion': 'calibracion', 'poblacion': 'poblacion', 'equidad': 'equidad',
         'estabilidad': 'estabilidad', 'interpretabilidad': 'interpretabilidad', 'resumen': 'chequeos',
         'anticipacion': 'anticipacion', 'trayectorias': None, 'perfiles': None}
ORDEN = tuple(TIPOS)
# artefactos que acompañan al principal de un submódulo (otras filas de ``resultados.analitica`` del mismo desenlace)
EXTRAS = {'calibracion': ('hist_riesgo',), 'poblacion': ('distribuciones_muestra_universo',),
          'anticipacion': ('metricas_por_visita', 'primera_alerta')}
EN_VIVO = ('trayectorias', 'perfiles')   # se calculan al pedirlos (de crecimiento y riesgos), no son artefactos guardados
INDICADORES = {'peso': 'Peso para la edad', 'talla': 'Talla para la edad',
               'perimetro_cefalico': 'Perímetro cefálico para la edad', 'peso_para_talla': 'Peso para la talla'}
# el sexo viene como 1/2 en la base de la Fundación (ern_sexo) y como M/F en los datos simulados (sexo)
SEXOS = {'1': 'masculino', '2': 'femenino', 'm': 'masculino', 'f': 'femenino', 'masculino': 'masculino', 'femenino': 'femenino'}
MSG_SIN_RIESGO = ('La última corrida no calculó el riesgo de este desenlace: el riesgo se calcula solo para los niños que '
                  'siguen en seguimiento. Agrupe por sexo o por perfil, o elija otro desenlace.')
AL_TOP = 10   # el grupo «Riesgo alto» guardado por el entrenamiento (TOP_RIESGO_ALTO de analitica_clinica)
MSG_SIN_ANTICIPACION = ('Este entrenamiento no incluye desenlaces predichos desde varias visitas, que son los que permiten medir '
                        'con cuánta ventaja avisa la alerta. Vuelva a entrenar con la anticipación activada para verlos.')


def _metas(s: Session, entrenamiento: int | None = None) -> list[Analitica]:
    q = select(Analitica).where(Analitica.tipo == 'meta').order_by(Analitica.creada.desc(), Analitica.id.desc())
    if entrenamiento is not None:
        q = q.where(Analitica.entrenamiento_id == entrenamiento)
    return list(s.scalars(q))


def _submodulos(meta: dict) -> list[dict]:
    listos = meta.get('submodulos') or {}
    return [{'id': m, 'estado': 'ok' if listos.get(m) == 'ok' or m in EN_VIVO else 'pendiente'} for m in ORDEN]


def _resumen_meta(a: Analitica) -> dict:
    m = a.datos or {}
    return {'entrenamiento': a.entrenamiento_id, 'ejecucion': a.ejecucion_id, 'modelo': a.modelo,
            'fuente': m.get('fuente'), 'registro': m.get('registro'), 'version_registro': m.get('version_registro'),
            'version_modelo': m.get('version_modelo'), 'corte': m.get('corte'), 'creada': a.creada,
            'desenlaces': m.get('desenlaces', []), 'submodulos': _submodulos(m)}


@ruta.get('/entrenamientos')
def entrenamientos(limite: int = Query(30, ge=1, le=200), s: Session = Depends(sesion),
                   _: Usuario = Depends(CUALQUIERA)) -> dict:
    """Los entrenamientos con analítica, el más reciente primero, y los submódulos de cada uno."""
    return {'entrenamientos': [_resumen_meta(a) for a in _metas(s)[:limite]]}


@ruta.get('/contexto')
def contexto(entrenamiento: int | None = Query(None), s: Session = Depends(sesion),
             _: Usuario = Depends(CUALQUIERA)) -> dict:
    """Qué se puede mirar: modelos, versiones y desenlaces (En uso / En prueba) del entrenamiento pedido o, sin
    pedir, del más reciente."""
    metas = _metas(s, entrenamiento)
    if not metas:
        return {'estado': 'sin_artefactos', 'entrenamiento': entrenamiento, 'modelos': [], 'desenlaces': [],
                'submodulos': [], 'entrenamientos': []}
    a = metas[0]
    r = _resumen_meta(a)
    return {'estado': 'ok', 'entrenamiento': a.entrenamiento_id,
            'modelos': [{'modelo': a.modelo, 'registro': r['registro'], 'version_registro': r['version_registro'],
                         'version_modelo': r['version_modelo'], 'fuente': r['fuente'], 'corte': r['corte']}],
            'desenlaces': [{**d, 'etiqueta': d.get('etiqueta', 'En uso')} for d in r['desenlaces']],
            'submodulos': r['submodulos'],
            'entrenamientos': [{'entrenamiento': x.entrenamiento_id, 'creada': x.creada,
                                'version_registro': (x.datos or {}).get('version_registro')} for x in _metas(s)[:30]]}


def sexo_legible(valor: object) -> str | None:
    """«masculino» o «femenino» desde 1/2 (base de la Fundación, también «1.0»), M/F (datos simulados) o el texto."""
    return None if valor is None else SEXOS.get(str(valor).split('.')[0].strip().lower())


def _ninos(s: Session, corte_id: int | None) -> pd.DataFrame:
    """Un niño por fila: sede, edad gestacional, nacimiento, sexo y Lubchenco (códigos seudonimizados)."""
    cols = ['sujeto', 'sede', 'eg_semanas', 'fecha_nacimiento', 'sexo', 'lubchenco']
    if corte_id is None:
        return pd.DataFrame(columns=cols)
    f = s.execute(text('SELECT sujeto, grupo AS sede, eg_semanas, fecha_nacimiento FROM sevarti.sujetos '
                       'WHERE corte_id = :c'), {'c': corte_id})
    df = pd.DataFrame(f.fetchall(), columns=['sujeto', 'sede', 'eg_semanas', 'fecha_nacimiento'])
    primero = {}
    for variables, nombre in ((VARIABLES_SEXO, 'sexo'), ((PF.VARIABLE_LUBCHENCO,), 'lubchenco')):
        primero[nombre] = {}
        for suj, valor in s.execute(text('SELECT sujeto, valor FROM sevarti.mediciones WHERE corte_id = :c AND '
                                         'variable = ANY(:v) AND valor IS NOT NULL ORDER BY fecha NULLS FIRST, id'),
                                    {'c': corte_id, 'v': list(variables)}):
            primero[nombre].setdefault(suj, valor)
    df['sexo'] = df.sujeto.map(lambda x: sexo_legible(primero['sexo'].get(x)))
    df['lubchenco'] = df.sujeto.map(primero['lubchenco'])
    return df[cols]


def _riesgo_max(s: Session, corrida: int, desenlace: str | None) -> pd.Series:
    """Percentil de riesgo más alto de cada niño en la corrida (de un desenlace, si se pide)."""
    sql = 'SELECT sujeto, max(percentil) AS p FROM resultados.riesgos WHERE corrida_id = :c AND NOT silencio'
    sql += ' AND clave = :d' if desenlace else ''
    sql += ' GROUP BY sujeto'
    filas = s.execute(text(sql), {'c': corrida, 'd': desenlace}).fetchall()
    return pd.Series({f[0]: f[1] for f in filas}, dtype=float)


def _guardado(s: Session, entrenamiento: int, desenlace: str | None, tipo: str) -> dict | None:
    """Un artefacto agregado que guardó el entrenamiento para un desenlace (``trayectorias_riesgo``, ``perfiles``)."""
    if not desenlace:
        return None
    a = s.scalars(select(Analitica).where(Analitica.entrenamiento_id == entrenamiento, Analitica.desenlace == desenlace,
                                          Analitica.tipo == tipo).order_by(Analitica.id.desc())).first()
    return a.datos if a is not None else None


def _sin_datos(base: dict, mensaje: str) -> dict:
    return {'estado': 'pendiente', **base, 'mensaje': mensaje, 'grupos': []}


@ruta.get('/{entrenamiento}/trayectorias')
def trayectorias(entrenamiento: int, indicador: Literal['peso', 'talla', 'perimetro_cefalico', 'peso_para_talla'] = 'peso',
                 agrupar: Literal['riesgo', 'sexo', 'perfil', 'sede'] = 'riesgo',
                 eje: Literal['edad_corregida', 'cronologica'] = 'edad_corregida', desenlace: str | None = Query(None),
                 corrida_id: int | None = Query(None), s: Session = Depends(sesion),
                 u: Usuario = Depends(CUALQUIERA)) -> dict:
    """Puntaje z de crecimiento por grupo y visita frente a la OMS, de la corrida pedida o la más reciente. Solo
    agregados (D7): celdas de menos de 5 niños omitidas, desvíos con 20 o más. Los niños individuales (hasta 30, con su
    código seudonimizado) solo los ven el experto y el administrador."""
    if not _metas(s, entrenamiento):
        return {'estado': 'sin_artefactos', 'entrenamiento': entrenamiento, 'submodulo': 'trayectorias'}
    base = {'entrenamiento': entrenamiento, 'submodulo': 'trayectorias', 'indicador': indicador, 'agrupar': agrupar,
            'eje': eje, 'etiqueta_indicador': INDICADORES[indicador],
            'etiqueta': 'En prueba' if indicador == 'peso_para_talla' else 'En uso',
            'referencia': 'OMS (z = 0)', 'minimo_ninos': AN.MIN_CELDA}
    # por riesgo, lo guardado por el entrenamiento con los niños de validación (la corrida solo tiene el riesgo de los
    # niños en seguimiento); con el eje de edad cronológica o sin ese artefacto, se calcula en vivo como antes
    if agrupar == 'riesgo' and eje == 'edad_corregida':
        guardado = (_guardado(s, entrenamiento, desenlace, 'trayectorias_riesgo') or {}).get(indicador)
        if guardado and guardado.get('grupos'):
            return {'estado': 'ok', **base, **guardado, 'fuente': 'validacion', 'individuales_visibles': False,
                    'individuales': [],
                    'nota': f'Niños de validación del entrenamiento: «Riesgo alto» es el {AL_TOP} % con más riesgo.'}
    try:
        c = corrida_de(s, corrida_id)
    except HTTPException:
        return _sin_datos(base, 'Todavía no hay una corrida con datos de crecimiento.')
    base['corrida_id'] = c.id
    filas = s.execute(text('SELECT sujeto, etapa, variable, fecha, edad_corregida, valor, z FROM resultados.crecimiento '
                           'WHERE corrida_id = :c AND indicador = :i AND z IS NOT NULL AND NOT improbable'),
                      {'c': c.id, 'i': indicador}).fetchall()
    if not filas:
        return _sin_datos(base, 'La corrida no tiene datos de crecimiento para este indicador.')
    df = pd.DataFrame(filas, columns=['sujeto', 'etapa', 'variable', 'fecha', 'edad_corregida', 'valor', 'z'])
    ninos = _ninos(s, c.corte_id).set_index('sujeto')
    if eje == 'cronologica':
        nac = pd.to_datetime(df.sujeto.map(ninos.fecha_nacimiento), errors='coerce')
        df['x'] = (pd.to_datetime(df.fecha, errors='coerce') - nac).dt.days / AN.DIAS_POR_MES
    else:
        df['x'] = pd.to_numeric(df.edad_corregida, errors='coerce') / AN.DIAS_POR_MES
    if agrupar == 'riesgo':
        p = _riesgo_max(s, c.id, desenlace)
        if p.empty:
            return _sin_datos(base, MSG_SIN_RIESGO) | {'motivo': 'sin_riesgo'}
        df['p'] = df.sujeto.map(p)
        df = df[df.p.notna()]
        df['grupo'] = df.p.map(lambda v: 'Riesgo alto' if v >= PERCENTIL_ALTO else 'Resto')
    elif agrupar == 'sexo':
        df['grupo'] = df.sujeto.map(ninos.sexo)
    elif agrupar == 'sede':
        if ninos.sede.nunique() < 2:
            return _sin_datos(base, 'Hay una sola sede: no hay con qué comparar.')
        df['grupo'] = df.sujeto.map(ninos.sede)
    else:
        etiqueta = {x: PF.perfil_provisional(ninos.eg_semanas[x], ninos.lubchenco[x])['etiqueta_corta']
                    for x in ninos.index}
        df['grupo'] = df.sujeto.map(etiqueta)
    df = df[df.grupo.notna() & (df.grupo != 'Sin clasificar')]
    mapa = etapas(s, c.corte_id)
    orden = {e: v['orden'] for e, v in mapa.items()}
    nombres = {e: v['nombre'] for e, v in mapa.items()}
    esq = esquema(s, c.corte_id)
    unidades = {}
    for d in esq.values():
        if isinstance(d.get('concepto'), str) and d['concepto']:
            unidades[(d['concepto'], d.get('etapa'))] = str(d.get('unidad') or '').strip() or None
    r = AN.trayectorias(df, orden, nombres, lambda variable, etapa: unidad_crecimiento(esq, unidades, variable,
                                                                                    indicador, etapa))
    ver_ninos = u.rol in ('admin', 'experto')
    out = {'estado': 'ok' if r['grupos'] else 'pendiente', **base, **r,
           'individuales_visibles': ver_ninos,
           'individuales': AN.trayectorias_individuales(df, orden, nombres) if ver_ninos else []}
    if not r['grupos']:
        out['mensaje'] = 'Ningún grupo reúne 5 o más niños con este indicador.'
    return out


@ruta.get('/{entrenamiento}/perfiles')
def perfiles(entrenamiento: int, desenlace: str | None = Query(None), corrida_id: int | None = Query(None),
             s: Session = Depends(sesion), _: Usuario = Depends(CUALQUIERA)) -> dict:
    """Perfiles provisionales (edad gestacional y Lubchenco): niños por categoría (oculta si hay menos de 5), la tasa de
    riesgo alto del desenlace elegido (percentil >= PERCENTIL_ALTO) y qué los distingue (edad gestacional y peso al nacer
    medios). No son perfiles reales: ningún experto los ha aprobado todavía."""
    if not _metas(s, entrenamiento):
        return {'estado': 'sin_artefactos', 'entrenamiento': entrenamiento, 'submodulo': 'perfiles'}
    confianza = {'minimo_ninos': AN.MIN_CELDA, 'aprobacion': 'pendiente',
                 'texto': 'Perfiles provisionales por edad gestacional y Lubchenco. Aún no hay perfiles reales '
                          'aprobados por expertos.'}
    base = {'entrenamiento': entrenamiento, 'submodulo': 'perfiles', 'desenlace': desenlace, 'confianza': confianza,
            'tasa_significa': f'proporción de niños con riesgo alto (percentil {PERCENTIL_ALTO} o más)'}
    guardado = _guardado(s, entrenamiento, desenlace, 'perfiles')
    if guardado:
        # de los niños de validación: tasa observada del desenlace y proporción en riesgo alto, guardadas al entrenar
        filas = {k: [{**f, 'tasa': f.get('tasa_riesgo_alto')} for f in guardado.get(k, [])] for k in ('eg', 'lubchenco')}
        return {'estado': 'ok', **base, 'fuente': 'validacion', 'ninos': guardado.get('ninos'), 'casos': guardado.get('casos'),
                'categorias_ocultas': sum(1 for k in filas for f in filas[k] if f.get('oculto')), 'unidad_peso': None,
                'riesgo_disponible': True, 'n_con_riesgo': guardado.get('ninos'), **filas,
                'tasa_significa': f'proporción de niños de validación en el {AL_TOP} % con más riesgo'}
    try:
        c = corrida_de(s, corrida_id)
    except HTTPException:
        return _sin_datos(base, 'Todavía no hay una corrida de la que resumir los perfiles.') | {'eg': [], 'lubchenco': []}
    ninos = _ninos(s, c.corte_id)
    if ninos.empty:
        return _sin_datos(base, 'El corte de la corrida ya no está en la base.') | {'eg': [], 'lubchenco': []}
    sev = SimpleNamespace(
        sujetos=ninos[['sujeto', 'eg_semanas']],
        mediciones=pd.DataFrame({'sujeto': ninos.sujeto, 'variable': PF.VARIABLE_LUBCHENCO,
                                 'valor': ninos.lubchenco})[ninos.lubchenco.notna()])
    p = _riesgo_max(s, c.id, desenlace)
    riesgos = pd.DataFrame({'sujeto': p.index, 'evento': (p >= PERCENTIL_ALTO).astype(int).to_numpy()})
    esq = esquema(s, c.corte_id)
    pesos = [v for v in _variables_perfil(esq)[1:] if esq[v].get('concepto') == 'peso']
    medidas, unidad = {}, None
    if pesos:
        unidad = str(esq[pesos[0]].get('unidad') or '').strip() or None
        medidas = {suj: x for suj, _, x in medidas_numericas(s, c.corte_id, pesos[:1], esq)}
    res = AN.resumen_perfiles_ampliado(sev, riesgos if len(riesgos) else None, medidas)
    ocultos = sum(1 for k in ('eg', 'lubchenco') for f in res[k] if f['oculto'])
    # sin riesgo calculado para el desenlace, la tasa no es «n < 5»: no existe; la web lo dice así
    sin_riesgo = {'riesgo_disponible': len(riesgos) > 0, 'n_con_riesgo': int(len(riesgos))}
    if not len(riesgos):
        sin_riesgo['mensaje_riesgo'] = MSG_SIN_RIESGO.replace(' Agrupe por sexo o por perfil, o elija otro desenlace.', '')
    return {'estado': 'ok', **base, 'corrida_id': c.id, 'ninos': int(len(ninos)), 'categorias_ocultas': ocultos,
            'unidad_peso': unidad, **sin_riesgo, **res}


@ruta.get('/{entrenamiento}/{submodulo}')
def submodulo(entrenamiento: int, submodulo: str, desenlace: str | None = Query(None),
              s: Session = Depends(sesion), _: Usuario = Depends(CUALQUIERA)) -> dict:
    """Los artefactos de un submódulo, por desenlace (``desenlaces[clave]``). Estados: ``ok``, ``pendiente`` (aún no
    se calcula) o ``sin_artefactos`` (entrenamiento anterior a la analítica: no se recalcula)."""
    if submodulo not in TIPOS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Ese submódulo no existe.')
    metas = _metas(s, entrenamiento)
    if not metas:
        return {'estado': 'sin_artefactos', 'entrenamiento': entrenamiento, 'submodulo': submodulo}
    meta = _resumen_meta(metas[0])
    base = {'entrenamiento': entrenamiento, 'submodulo': submodulo, 'meta': meta}
    tipo = TIPOS[submodulo]
    if tipo is None or (metas[0].datos.get('submodulos') or {}).get(submodulo) != 'ok':
        msg = {'mensaje': MSG_SIN_ANTICIPACION} if submodulo == 'anticipacion' else {}
        return {'estado': 'pendiente', **base, **msg, 'desenlaces': {}}
    tipos = [tipo, 'rendimiento'] if submodulo == 'resumen' else [tipo, *EXTRAS.get(submodulo, ())]
    q = select(Analitica).where(Analitica.entrenamiento_id == entrenamiento, Analitica.tipo.in_(tipos),
                                Analitica.desenlace.is_not(None))
    if desenlace:
        q = q.where(Analitica.desenlace == desenlace)
    filas: dict[str, dict] = {}
    auc: dict[str, dict] = {}
    extras: dict[str, dict] = {}
    for a in s.scalars(q.order_by(Analitica.id)):
        if a.tipo in EXTRAS.get(submodulo, ()):
            extras.setdefault(a.desenlace, {})[a.tipo] = a.datos
        elif submodulo == 'resumen' and a.tipo == 'rendimiento':
            ref = ((a.datos or {}).get('referencia') or {}).get('auc_desenlace') or {}
            auc[a.desenlace] = {**((a.datos or {}).get('auc_desenlace') or {}), 'auc_ref': ref.get('auc')}
        else:
            filas[a.desenlace] = AI.sanear(a.datos) if submodulo == 'interpretabilidad' else a.datos
    for c, ex in extras.items():      # entrenamientos anteriores no los traen: la pantalla lo avisa
        if c in filas:
            filas[c] = {**filas[c], **ex}
    if submodulo == 'resumen':
        # semáforos + AUC con IC y tamaño de cada desenlace (lo que muestra la portada de la analítica)
        filas = {c: {'auc': auc.get(c, {}).get('auc'), 'ic_bajo': auc.get(c, {}).get('ic_bajo'),
                     'ic_alto': auc.get(c, {}).get('ic_alto'), 'n': auc.get(c, {}).get('n'),
                     'casos': auc.get(c, {}).get('casos'), 'auc_ref': auc.get(c, {}).get('auc_ref'),
                     **(filas.get(c) or {})}
                 for c in sorted(set(filas) | set(auc))}
    return {'estado': 'ok', **base, 'desenlaces': filas}
