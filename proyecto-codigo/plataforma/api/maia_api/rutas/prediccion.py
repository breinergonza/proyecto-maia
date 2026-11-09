"""Predicción (funcionalidad 7): el riesgo de una muestra, de todo el universo o de un niño nuevo, con el modelo que se elija.

Nada de lo que se calcula aquí se guarda por niño (D7): ni en ``resultados.*`` ni en otra tabla. Las cifras salen de la
memoria de la petición y el CSV por niño (D36) se arma al vuelo, solo para administración y auditado sin su contenido.

* ``GET  /prediccion/modelos``        versiones que se pueden usar (oficial o personal, con aviso de «corte anterior»).
* ``POST /prediccion/muestra``        agregados (distribución, niveles, por desenlace) y la tabla por niño.
* ``GET  /prediccion/muestra/csv``    el mismo cálculo, un renglón por niño y desenlace (solo administración).
* ``GET  /prediccion/ejemplos``       biblioteca de niños de ejemplo con los valores típicos del subgrupo.
* ``POST /prediccion/nino``           un niño nuevo (ejemplo + cambios): riesgo, perfil provisional y visita por visita.

Universos grandes: se procesan por lotes de ``LOTE`` niños y el resultado completo sale en la misma petición. No hay
infraestructura de tareas asíncronas dentro de la API (las ``Ejecucion`` las toma el programador, que no puntúa), así
que el tiempo crece con el número de niños; para cortes de decenas de miles use el CSV o la corrida semestral.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import threading
from collections import Counter
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from maia_api import estado as E
from maia_api.consultas import esquema as esquema_db
from maia_api.consultas import motivo_legible
from maia_api.dependencias import ADMIN, EXPERTO, auditar, configuracion, sesion
from maia_api.poblacion import MIN_NINOS, corte_actual, ids_de
from maia_api.rutas import inferencia as INF
from maia_comun import db
from maia_comun import muestra as M
from maia_comun import paquete as PQ
from maia_comun import perfiles as PF
from maia_comun import puntuacion as PU
from maia_comun.config import Configuracion
from maia_comun.modelos_db import PERCENTIL_ALTO, PERCENTIL_MUY_ALTO, Ejecucion, Paquete, Usuario
from maia_comun.modelos_muestras import Muestra
from sevarti import contrato as SV

ruta = APIRouter(prefix='/prediccion', tags=['predicción'])
registro = logging.getLogger(__name__)

LOTE = 1500            # niños por lote al puntuar un universo grande
LIMITE_TABLA = 200     # filas por página de la tabla por niño
CATEGORIAS_PERFIL = (*PF.ETIQUETAS_EG, *PF.ETIQUETAS_LUBCHENCO)
EG_POR_DEFECTO = {'extremo': 26.0, 'muy_prematuro': 30.0, 'moderado_tardio': 34.0, 'a_termino': 39.0}
EG_RANGOS = {'extremo': (None, 28.0), 'muy_prematuro': (28.0, 32.0), 'moderado_tardio': (32.0, 37.0),
             'a_termino': (37.0, None)}
NOTA_NO_GUARDA = 'Este cálculo no se guarda: el niño nuevo y su riesgo existen solo en esta respuesta.'


# ================================================================ carga de modelos

_CACHE: dict[str, tuple] = {}
_LOCK = threading.RLock()
_MAX_CACHE = 3


def _fecha_corte_vigente(s: Session) -> str | None:
    c = corte_actual(s)
    return str(c.fecha_corte)[:10] if c.fecha_corte else None


def cargar_modelo(s: Session, cfg: Configuracion, version: str | None = None) -> tuple:
    """(modelos, manifest, carpeta) de la versión pedida: el paquete activo por omisión, o cualquier paquete registrado.

    Un paquete que no es el activo se verifica (firma, hashes, versiones) y se extrae aparte, en ``prediccion/`` dentro de
    su carpeta, para no pisar la del activo; queda en memoria (hasta ``_MAX_CACHE`` a la vez)."""
    activo = E.activo()
    if version is None or (activo is not None and activo[1]['version'] == version):
        if activo is None:
            raise HTTPException(status.HTTP_409_CONFLICT, 'No hay un paquete de modelos activo.')
        return activo
    with _LOCK:
        if version in _CACHE:
            return _CACHE[version]
        p = s.get(Paquete, version)
        if p is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f'No hay un modelo {version}.')
        try:
            contenido = PQ.verificar(Path(p.ruta), cfg.maia_paquete_clave,
                                     E.carpeta_paquete(cfg, version) / 'prediccion',
                                     solo_simulado=cfg.maia_solo_simulado)
            modelos = PQ.cargar(contenido)
        except (PQ.PaqueteInvalido, OSError) as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f'No se pudo abrir el modelo {version}: {e}') from e
        while len(_CACHE) >= _MAX_CACHE:
            _CACHE.pop(next(iter(_CACHE)))
        _CACHE[version] = (modelos, contenido.manifest, contenido.carpeta)
        return _CACHE[version]


def limpiar_cache() -> None:
    with _LOCK:
        _CACHE.clear()


def _version_activa() -> str | None:
    activo = E.activo()
    return activo[1]['version'] if activo else None


@ruta.get('/modelos')
def modelos_usables(s: Session = Depends(sesion), _: Usuario = Depends(EXPERTO)) -> dict:
    """Los modelos que se pueden usar para predecir: los paquetes oficiales y los personales empaquetados. Un modelo cuyo
    corte no es el vigente se ofrece con aviso: sus niños y variables pueden no corresponder."""
    vigente = _fecha_corte_vigente(s)
    activa = _version_activa()
    personales = {}
    for e in s.scalars(select(Ejecucion).where(Ejecucion.tipo == 'entrenamiento', Ejecucion.estado == 'ok')):
        par = e.parametros or {}
        v = (e.resultado or {}).get('paquete')
        if par.get('visibilidad') == 'personal' and not par.get('descartado') and v:
            dueno = s.get(Usuario, e.solicitada_por) if e.solicitada_por else None
            personales[v] = dueno.nombre if dueno else None
    salida = []
    for p in s.scalars(select(Paquete).order_by(Paquete.subido_en.desc())):
        corte = str((p.manifest or {}).get('corte') or '')[:10] or None
        anterior = bool(vigente and corte and corte != vigente)
        salida.append({
            'version': p.version, 'origen': 'personal' if p.version in personales else 'oficial',
            'dueno': personales.get(p.version), 'activo': p.version == activa, 'fuente': p.fuente, 'corte': corte,
            'creado': (p.manifest or {}).get('creado'), 'corte_anterior': anterior,
            'aviso': f'Este modelo se entrenó con el corte del {corte}; el vigente es el del {vigente}.' if anterior else None})
    return {'corte_vigente': vigente, 'activo': activa, 'modelos': salida}


# ================================================================ lectura de niños y cálculo

def _leer(cx, sql: str, p: dict) -> pd.DataFrame:
    return pd.read_sql_query(text(sql), cx, params=p)


def _parcial(corte_id: int, ids: list[str], variables: list[str]) -> dict[str, pd.DataFrame]:
    """Sujetos, mediciones (solo las variables del paquete) y episodios de unos niños del corte, como los espera
    ``PU.completar``."""
    p = {'c': corte_id, 's': ids}
    with db.motor().connect() as cx:
        return {
            'sujetos': _leer(cx, 'SELECT sujeto, grupo, fecha_nacimiento, eg_semanas, anio_nacimiento FROM sevarti.sujetos '
                                 'WHERE corte_id = :c AND sujeto = ANY(:s)', p),
            'mediciones': _leer(cx, 'SELECT sujeto, variable, valor, fecha, edad_dias FROM sevarti.mediciones '
                                    'WHERE corte_id = :c AND sujeto = ANY(:s) AND variable = ANY(:v)', {**p, 'v': variables}),
            'episodios': _leer(cx, 'SELECT sujeto, tipo, edad_inicio, edad_fin FROM sevarti.episodios '
                                   'WHERE corte_id = :c AND sujeto = ANY(:s)', p)}


class Contexto:
    """El modelo elegido y el corte sobre el que se puntúa."""

    def __init__(self, s: Session, cfg: Configuracion, version: str | None):
        self.modelos, self.manifest, self.carpeta = cargar_modelo(s, cfg, version)
        self.base = self.carpeta / 'sevarti_base'
        self.version = self.manifest['version']
        self.variables = list(pd.read_parquet(self.base / 'esquema.parquet', columns=['variable']).variable)
        et = pd.read_parquet(self.base / 'etapas.parquet').sort_values('orden')
        self.orden = {str(e): int(o) for e, o in zip(et.etapa, et.orden)}
        self.nombres = SV.nombres_etapa(et)
        c = corte_actual(s)
        self.corte_id = c.id
        self.corte = pd.Timestamp(c.fecha_corte) if c.fecha_corte else None
        self.corte_texto = str(c.fecha_corte)[:10] if c.fecha_corte else None
        corte_modelo = str(self.manifest.get('corte') or '')[:10] or None
        self.corte_modelo = corte_modelo
        self.corte_anterior = bool(self.corte_texto and corte_modelo and corte_modelo != self.corte_texto)

    def sevarti(self, ids: list[str]) -> SV.Sevarti:
        return PU.completar(_parcial(self.corte_id, ids, self.variables), self.base, self.corte)

    def riesgos(self, ids: list[str], ultima: bool, motivos: bool) -> tuple[pd.DataFrame, SV.Sevarti]:
        try:
            sev = self.sevarti(ids)
            p = self.modelos.clinico.preparar(sev)
            r = self.modelos.clinico.riesgos(p, solo_ultima_visita=ultima, con_motivos=motivos, solo_pendientes=False)
        except (ValueError, KeyError) as e:
            registro.warning('No se pudo calcular el riesgo: %s: %s', type(e).__name__, e, exc_info=True)
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                                'No se pudo calcular el riesgo de estos niños con el modelo elegido.') from e
        return r.drop(columns=['fecha_visita']), sev


def _lotes(ids: list[str]) -> Iterator[list[str]]:
    for i in range(0, len(ids), LOTE):
        yield ids[i:i + LOTE]


def _puntuar(ctx: Contexto, ids: list[str], visita: str | None) -> pd.DataFrame:
    """Una fila por niño y desenlace en la visita pedida (o, sin visita, la última a la que fue cada niño)."""
    partes = []
    for lote in _lotes(ids):
        r, _ = ctx.riesgos(lote, ultima=visita is None, motivos=False)
        partes.append(r if visita is None else r[r.momento == visita])
    return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()


def _nivel(percentil: float) -> str:
    return 'muy_alto' if percentil >= PERCENTIL_MUY_ALTO else 'alto' if percentil >= PERCENTIL_ALTO else 'resto'


def _primera_alerta(hist: pd.DataFrame, ctx: Contexto) -> dict[tuple[str, str], str]:
    """{(niño, desenlace): nombre de la primera visita en que llegó a riesgo alto}."""
    alto = hist[hist.percentil >= PERCENTIL_ALTO].assign(o=lambda d: d.momento.map(ctx.orden)).sort_values('o')
    primera = alto.drop_duplicates(['sujeto', 'clave'])
    return {(a.sujeto, a.clave): ctx.nombres.get(a.momento, a.momento) for a in primera.itertuples()}


def _lista_motivos(texto) -> list[str]:
    return [m.strip() for m in str(texto or '').split(';') if m.strip()]


def _detalle(ctx: Contexto, ids: list[str], mostrados: pd.DataFrame, esq: dict) -> pd.DataFrame:
    """Para unos niños ya puntuados: motivos legibles, perfil provisional y primera alerta, con una segunda pasada completa
    (todas las visitas, con motivos). Devuelve una fila por niño, desenlace y visita de ``mostrados``."""
    partes, perfiles, primeras = [], {}, {}
    for lote in _lotes(ids):
        hist, sev = ctx.riesgos(lote, ultima=False, motivos=True)
        partes.append(hist)
        perfiles |= PF.perfiles_por_ninos(sev)
        primeras |= _primera_alerta(hist, ctx)
    hist = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(columns=['sujeto', 'clave', 'momento', 'motivos'])
    clave = mostrados.loc[mostrados.sujeto.isin(ids), ['sujeto', 'clave', 'momento']]
    d = clave.merge(hist[['sujeto', 'clave', 'momento', 'motivos']], on=['sujeto', 'clave', 'momento'], how='left')
    d['motivos'] = [[motivo_legible(m, esq) for m in _lista_motivos(x)] for x in d.motivos]
    d['perfil'] = d.sujeto.map(lambda s: perfiles.get(s, {}).get('etiqueta_corta'))
    d['primera_alerta'] = [primeras.get((a.sujeto, a.clave)) for a in d.itertuples()]
    return d


# ================================================================ la muestra

class PeticionMuestra(BaseModel):
    modelo: str | None = None
    muestra: dict | None = None
    muestra_id: int | None = None
    excluir_entrenamiento: bool = False
    visita: str | None = None
    pagina: int = Field(1, ge=1)
    limite: int = Field(LIMITE_TABLA, ge=1, le=LIMITE_TABLA)


def _definicion(s: Session, muestra: dict | None, muestra_id: int | None) -> dict | None:
    if muestra_id is None:
        return muestra
    m = s.get(Muestra, muestra_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'No existe esa muestra guardada.')
    return m.definicion


def _ninos(s: Session, ctx: Contexto, muestra: dict | None, excluir: bool) -> tuple[list[str], dict]:
    """Los niños del filtro (sin los del entrenamiento, si se pide y el paquete trae esa lista) y lo que se sabe de la
    fuga: cuántos estaban en el entrenamiento, o ``fuga_no_verificable`` si el paquete no trae la lista."""
    ids = ids_de(s, ctx.corte_id, muestra)
    lista = ctx.manifest.get('ninos_entrenamiento')
    fuga: dict[str, Any] = {'fuga_no_verificable': lista is None, 'en_entrenamiento': None, 'excluidos': 0,
                            'aviso_corte': None}
    if lista is not None:
        entrenados = set(map(str, lista))
        fuga['en_entrenamiento'] = sum(1 for i in ids if i in entrenados)
        if excluir:
            ids = [i for i in ids if i not in entrenados]
            fuga['excluidos'] = fuga['en_entrenamiento']
    if ctx.corte_anterior:
        fuga['aviso_corte'] = (f'Corte anterior: el modelo se entrenó con el corte del {ctx.corte_modelo} y los niños son '
                               f'los del {ctx.corte_texto}.')
    elif ctx.corte_modelo and fuga['fuga_no_verificable']:
        fuga['aviso_corte'] = ('El modelo se entrenó con este mismo corte y no trae la lista de niños con que se entrenó: '
                               'parte de estos niños pudo estar en el entrenamiento y el riesgo se vería mejor de lo que '
                               'será con niños nuevos.')
    return ids, fuga


def _agregados(r: pd.DataFrame, ctx: Contexto) -> dict:
    por_nino = _filas_nino(r)
    pct = por_nino.percentil.to_numpy(float)
    riesgo = por_nino.riesgo.to_numpy(float)
    histograma = np.histogram(pct, bins=np.arange(0, 101, 10))[0]
    niveles = Counter(_nivel(x) for x in pct)
    desenlaces = []
    for (clave, nombre), g in r.groupby(['clave', 'desenlace']):
        momento = str(g.momento.iloc[0])
        desenlaces.append({'clave': clave, 'desenlace': nombre, 'momento': momento,
                           'momento_nombre': ctx.nombres.get(momento, momento),
                           'n': int(len(g)), 'riesgo_mediano': float(g.riesgo.median()),
                           'altos': int((g.percentil >= PERCENTIL_ALTO).sum()),
                           'muy_altos': int((g.percentil >= PERCENTIL_MUY_ALTO).sum())})
    return {
        'n_puntuados': int(len(por_nino)),
        'deciles': [float(x) for x in np.quantile(riesgo, np.arange(0.1, 1.0, 0.1))],
        'histograma': [{'desde': 10 * i, 'hasta': 10 * (i + 1), 'n': int(n)} for i, n in enumerate(histograma)],
        'niveles': {'muy_alto': niveles['muy_alto'], 'alto': niveles['alto'], 'resto': niveles['resto'],
                    'percentil_alto': PERCENTIL_ALTO, 'percentil_muy_alto': PERCENTIL_MUY_ALTO},
        'por_desenlace': sorted(desenlaces, key=lambda d: -d['muy_altos'])}


def _filas_nino(r: pd.DataFrame) -> pd.DataFrame:
    """El desenlace de mayor percentil de cada niño, de mayor a menor."""
    return r.sort_values(['percentil', 'sujeto'], ascending=[False, True]).drop_duplicates('sujeto')


def _resumen_modelo(ctx: Contexto) -> dict:
    return {'version': ctx.version, 'corte': ctx.corte_modelo, 'corte_anterior': ctx.corte_anterior,
            'corte_vigente': ctx.corte_texto}


@ruta.post('/muestra')
def predecir_muestra(p: PeticionMuestra, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
                     u: Usuario = Depends(EXPERTO)) -> dict:
    """El riesgo de los niños del filtro con el modelo elegido. Con menos de 20 niños no hay cifras (D46). La tabla por
    niño, solo para administración y experto; nada se guarda."""
    ctx = Contexto(s, cfg, p.modelo)
    if p.visita is not None and p.visita not in ctx.orden:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f'No existe la visita {p.visita} en ese modelo.')
    ids, fuga = _ninos(s, ctx, _definicion(s, p.muestra, p.muestra_id), p.excluir_entrenamiento)
    base = {'modelo': _resumen_modelo(ctx), 'visita': p.visita,
            'visita_nombre': ctx.nombres.get(p.visita) if p.visita else None, 'n_filtro': len(ids), **fuga}
    if len(ids) < MIN_NINOS:
        return base | {'insuficiente': True, 'minimo': MIN_NINOS,
                       'mensaje': f'Con menos de {MIN_NINOS} niños no se muestran cifras.'}
    r = _puntuar(ctx, ids, p.visita)
    if r.empty or r.sujeto.nunique() < MIN_NINOS:
        return base | {'insuficiente': True, 'minimo': MIN_NINOS,
                       'mensaje': f'Menos de {MIN_NINOS} niños tienen riesgo calculado en esa visita.'}
    tabla = _filas_nino(r)
    pagina = tabla.iloc[(p.pagina - 1) * p.limite: p.pagina * p.limite]
    d = _detalle(ctx, list(pagina.sujeto), pagina, esquema_db(s, ctx.corte_id))
    d = d.set_index(['sujeto', 'clave'])
    filas = []
    for f in pagina.itertuples():
        x = d.loc[(f.sujeto, f.clave)] if (f.sujeto, f.clave) in d.index else None
        filas.append({'sujeto': f.sujeto, 'clave': f.clave, 'desenlace': f.desenlace, 'momento': f.momento,
                      'momento_nombre': ctx.nombres.get(f.momento, f.momento), 'riesgo': float(f.riesgo),
                      'percentil': float(f.percentil), 'nivel': _nivel(float(f.percentil)),
                      'perfil': None if x is None else x['perfil'],
                      'primera_alerta': None if x is None else x['primera_alerta'],
                      'motivos': [] if x is None else list(x['motivos'])})
    auditar(s, u, 'prediccion.muestra', ctx.version,
            {'n': len(ids), 'huella': M.huella(ids), 'visita': p.visita, 'excluir': p.excluir_entrenamiento})
    s.commit()
    return base | {'insuficiente': False, 'guardado': False, 'agregados': _agregados(r, ctx),
                   'tabla': {'total': int(len(tabla)), 'pagina': p.pagina, 'limite': p.limite, 'filas': filas}}


COLUMNAS_CSV = ['sujeto', 'desenlace', 'visita', 'riesgo', 'percentil', 'nivel', 'perfil', 'primera_alerta', 'motivos']


def _renglones(ctx: Contexto, ids: list[str], visita: str | None, esq: dict) -> Iterator[str]:
    """El CSV por lotes: cada lote se puntúa, se escribe y se descarta."""
    def linea(valores: list) -> str:
        b = io.StringIO()
        csv.writer(b).writerow(valores)
        return b.getvalue()

    yield '﻿' + linea(COLUMNAS_CSV)
    for lote in _lotes(ids):
        r, _ = ctx.riesgos(lote, ultima=visita is None, motivos=False)
        r = r if visita is None else r[r.momento == visita]
        if r.empty:
            continue
        d = _detalle(ctx, lote, r, esq).set_index(['sujeto', 'clave', 'momento'])
        for f in r.sort_values(['sujeto', 'clave']).itertuples():
            x = d.loc[(f.sujeto, f.clave, f.momento)] if (f.sujeto, f.clave, f.momento) in d.index else None
            yield linea([f.sujeto, f.desenlace, ctx.nombres.get(f.momento, f.momento), f'{float(f.riesgo):.4f}',
                         f'{float(f.percentil):.1f}', _nivel(float(f.percentil)),
                         '' if x is None else x['perfil'] or '', '' if x is None else x['primera_alerta'] or '',
                         '' if x is None else ' | '.join(x['motivos'])])


@ruta.get('/muestra/csv')
def csv_muestra(modelo: str | None = None, muestra: str | None = Query(None, description='Definición JSON de la muestra'),
                muestra_id: int | None = None, visita: str | None = None, excluir_entrenamiento: bool = False,
                s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
                admin: Usuario = Depends(ADMIN)) -> StreamingResponse:
    """CSV por niño (D36), solo administración. No se guarda en el servidor y la auditoría lleva la huella de la lista y
    cuántos niños, nunca el contenido."""
    try:
        definicion = json.loads(muestra) if muestra else None
    except json.JSONDecodeError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, 'La muestra no es un JSON válido.') from None
    ctx = Contexto(s, cfg, modelo)
    if visita is not None and visita not in ctx.orden:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f'No existe la visita {visita} en ese modelo.')
    ids, _ = _ninos(s, ctx, _definicion(s, definicion, muestra_id), excluir_entrenamiento)
    if len(ids) < MIN_NINOS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f'Con menos de {MIN_NINOS} niños no se exporta (D46).')
    esq = esquema_db(s, ctx.corte_id)
    auditar(s, admin, 'prediccion.csv', ctx.version, {'n': len(ids), 'huella': M.huella(ids), 'visita': visita})
    s.commit()
    return StreamingResponse(_renglones(ctx, ids, visita, esq), media_type='text/csv; charset=utf-8',
                             headers={'Content-Disposition': 'attachment; filename="prediccion.csv"',
                                      'Cache-Control': 'no-store'})


# ================================================================ ejemplos (valores típicos del subgrupo)

def _categoria_perfil(eg: float | None, perfil: str | None) -> str | None:
    if perfil is not None and perfil not in CATEGORIAS_PERFIL:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f'Perfil desconocido: {perfil}.')
    return perfil or (PF.categoria_eg(eg) if eg is not None else None)


def _ids_subgrupo(s: Session, corte_id: int, perfil: str | None) -> list[str]:
    if perfil in EG_RANGOS:
        lo, hi = EG_RANGOS[perfil]
        filas = s.execute(text('SELECT sujeto FROM sevarti.sujetos WHERE corte_id = :c AND eg_semanas IS NOT NULL '
                               'AND (CAST(:lo AS float8) IS NULL OR eg_semanas >= :lo) '
                               'AND (CAST(:hi AS float8) IS NULL OR eg_semanas < :hi)'), {'c': corte_id, 'lo': lo, 'hi': hi})
        return [r[0] for r in filas]
    if perfil in PF.ETIQUETAS_LUBCHENCO:
        filas = s.execute(text('SELECT sujeto, valor FROM sevarti.atributos_sujeto WHERE corte_id = :c AND variable = :v'),
                          {'c': corte_id, 'v': PF.VARIABLE_LUBCHENCO})
        return [r[0] for r in filas if PF.categoria_lubchenco(r[1]) == perfil]
    return [r[0] for r in s.execute(text('SELECT sujeto FROM sevarti.sujetos WHERE corte_id = :c'), {'c': corte_id})]


def _tipico(tipo: str, filas: list[tuple[str, float | None]]) -> Any:
    """La mediana de un número o la moda de una lista / sí-no."""
    if tipo == 'numero':
        nums = [n for _, n in filas if n is not None]
        if not nums:
            return None
        m = float(np.median(nums))
        return round(m) if abs(m) >= 100 else round(m, 2)
    if not filas:
        return None
    valor = Counter(v for v, _ in filas).most_common(1)[0][0]
    try:
        f = float(valor)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return valor


def _vidas(etapas_visita: list[str], etapas: pd.DataFrame, eg: float) -> dict[str, float]:
    """Días de vida del niño de ejemplo en cada visita: a la mitad de su ventana (la edad corregida cuenta desde las 40
    semanas), sin pasar de donde abre la siguiente y siempre en orden."""
    et = etapas.set_index('etapa')
    hasta_40 = (40 - eg) * 7
    ventanas = []
    for etapa in etapas_visita:
        e = et.loc[etapa]
        corr = hasta_40 if e.base == 'corregida' else 0.0
        lo = None if pd.isna(e.edad_min) else float(e.edad_min) + corr
        hi = None if pd.isna(e.edad_max) else float(e.edad_max) + corr
        ventanas.append((lo, hi))
    vidas: dict[str, float] = {}
    previa = 0.0
    for i, etapa in enumerate(etapas_visita):
        lo, hi = ventanas[i]
        vida = (lo + hi) / 2 if lo is not None and hi is not None else (lo if lo is not None else 0.0)
        siguiente = next((x for x, _ in ventanas[i + 1:] if x is not None), None)
        if siguiente is not None and vida >= siguiente:
            vida = max(siguiente - 1, lo or 0.0)
        vida = max(vida, previa)
        vidas[etapa] = previa = vida
    return vidas


def _ejemplo(s: Session, ctx: Contexto, u: Usuario, visita: str, perfil: str | None, eg: float | None) -> dict:
    """Los valores típicos del subgrupo, de las variables generales y de las visitas hasta ``visita``. Los campos son los
    del formulario del paquete activo (los mismos de «Calcular el riesgo»)."""
    form = INF.formulario(u)
    tope = next((x['orden'] for x in form['visitas'] if x['etapa'] == visita), None)
    if tope is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f'No existe la visita {visita}.')
    visitas = [v for v in form['visitas'] if v['orden'] <= tope]
    categoria = _categoria_perfil(eg, perfil)
    ids = _ids_subgrupo(s, ctx.corte_id, categoria)
    base = {'visita': visita, 'visita_nombre': ctx.nombres.get(visita, visita), 'perfil': categoria,
            'perfil_etiqueta': PF.ETIQUETAS_EG.get(categoria) or PF.ETIQUETAS_LUBCHENCO.get(categoria) or 'Todos los niños',
            'n': len(ids)}
    if len(ids) < MIN_NINOS:
        return base | {'insuficiente': True, 'minimo': MIN_NINOS}
    campos = [(None, c) for c in form['generales']] + [(v['etapa'], c) for v in visitas for c in v['campos']]
    filas: dict[str, list[tuple[str, float | None]]] = {}
    for _, variable, valor, num in s.execute(text(
            'SELECT sujeto, variable, valor, valor_num FROM sevarti.atributos_sujeto WHERE corte_id = :c '
            'AND sujeto = ANY(:i) AND variable = ANY(:v)'),
            {'c': ctx.corte_id, 'i': ids, 'v': [c['variable'] for _, c in campos]}):
        filas.setdefault(variable, []).append((valor, num))
    egs = [r[0] for r in s.execute(text('SELECT eg_semanas FROM sevarti.sujetos WHERE corte_id = :c AND sujeto = ANY(:i) '
                                        'AND eg_semanas IS NOT NULL'), {'c': ctx.corte_id, 'i': ids})]
    eg_tipica = float(eg) if eg is not None else (round(float(np.median(egs)), 1) if egs
                                                 else EG_POR_DEFECTO.get(categoria, 32.0))
    salida = []
    for etapa, c in campos:
        datos = filas.get(c['variable'], [])
        if len(datos) < MIN_NINOS:
            continue                   # D46: no se da un «típico» que salga de menos de 20 niños
        valor = _tipico(c['tipo'], datos)
        if valor is None:
            continue
        salida.append({**{k: c[k] for k in ('variable', 'etiqueta', 'tipo', 'unidad', 'opciones', 'minimo', 'maximo',
                                           'principal', 'peso')},
                       'etapa': etapa, 'valor': valor, 'n': len(datos), 'tipico': True})
    return base | {'insuficiente': False, 'eg_semanas': eg_tipica, 'campos': salida,
                   'visitas': [{'etapa': v['etapa'], 'nombre': v['nombre'], 'orden': v['orden']} for v in visitas]}


@ruta.get('/ejemplos')
def ejemplos(visita: str | None = None, perfil: str | None = None, eg_semanas: float | None = Query(None, ge=22, le=45),
             modelo: str | None = None, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
             u: Usuario = Depends(EXPERTO)) -> dict:
    """Sin ``visita``: la biblioteca (visitas reales y perfiles, con cuántos niños tiene cada subgrupo). Con ``visita``
    y ``perfil`` (o ``eg_semanas``): el niño de ejemplo, con la mediana o la moda de cada variable en ese subgrupo del
    corte vigente en lugar del punto medio del Diccionario."""
    ctx = Contexto(s, cfg, modelo)
    if visita is None:
        form = INF.formulario(u)
        perfiles = []
        for cat in CATEGORIAS_PERFIL:
            n = len(_ids_subgrupo(s, ctx.corte_id, cat))
            perfiles.append({'perfil': cat, 'etiqueta': PF.ETIQUETAS_EG.get(cat) or PF.ETIQUETAS_LUBCHENCO[cat],
                             'grupo': 'eg' if cat in PF.ETIQUETAS_EG else 'lubchenco', 'n': n,
                             'insuficiente': n < MIN_NINOS})
        return {'modelo': _resumen_modelo(ctx),
                'visitas': [{'etapa': v['etapa'], 'nombre': v['nombre'], 'orden': v['orden']} for v in form['visitas']],
                'perfiles': perfiles}
    return {'modelo': _resumen_modelo(ctx)} | _ejemplo(s, ctx, u, visita, perfil, eg_semanas)


# ================================================================ niño nuevo

class PeticionNino(BaseModel):
    modelo: str | None = None
    visita: str
    perfil: str | None = None
    eg_semanas: float | None = Field(None, ge=22, le=45)
    cambios: dict[str, Any] = Field(default_factory=dict, description='variable → valor nuevo (null la quita)')


def _peticion(ej: dict, cambios: dict[str, Any], ctx: Contexto, u: Usuario) -> tuple[dict, list[str]]:
    """Las tablas del niño nuevo: el ejemplo con los cambios, fechadas según su visita."""
    form = INF.formulario(u)
    et = pd.read_parquet(ctx.base / 'etapas.parquet').sort_values('orden')
    eg = float(ej['eg_semanas'])
    vidas = _vidas([v['etapa'] for v in ej['visitas']], et, eg)
    etapa_de = {c['variable']: c['etapa'] for c in ej['campos']}
    valores = {c['variable']: c['valor'] for c in ej['campos']}
    permitidas = {c['variable']: None for c in form['generales']}
    permitidas |= {c['variable']: v['etapa'] for v in form['visitas'] if v['etapa'] in vidas for c in v['campos']}
    cambiados = []
    for variable, valor in cambios.items():
        if variable not in permitidas:
            continue
        etapa_de.setdefault(variable, permitidas[variable])
        if valor is None or valor == '':
            valores.pop(variable, None)
        else:
            valores[variable] = valor
        cambiados.append(variable)
    datos = {k: (vidas.get(etapa_de.get(k) or '', 0.0), v) for k, v in valores.items()}
    nacimiento = date.today() - timedelta(days=round(max((x for x, _ in datos.values()), default=0.0)) + 30)
    return {'sujetos': [{'sujeto': 'nuevo-1', 'grupo': None, 'fecha_nacimiento': nacimiento.isoformat(), 'eg_semanas': eg}],
            'mediciones': [{'sujeto': 'nuevo-1', 'variable': k, 'valor': v,
                            'fecha': (nacimiento + timedelta(days=round(vida))).isoformat(), 'edad_dias': round(vida)}
                           for k, (vida, v) in datos.items() if k in ctx.variables],
            'episodios': []}, cambiados


@ruta.post('/nino')
def predecir_nino(p: PeticionNino, s: Session = Depends(sesion), cfg: Configuracion = Depends(configuracion),
                  u: Usuario = Depends(EXPERTO)) -> dict:
    """Un niño nuevo: el ejemplo típico del subgrupo con los campos que el usuario cambió. Devuelve el riesgo por
    desenlace con sus motivos, el perfil provisional y el riesgo visita por visita con la línea de alerta. No se guarda."""
    ctx = Contexto(s, cfg, p.modelo)
    ej = _ejemplo(s, ctx, u, p.visita, p.perfil, p.eg_semanas)
    base = {'modelo': _resumen_modelo(ctx), 'visita': p.visita, 'guardado': False, 'nota': NOTA_NO_GUARDA}
    if ej['insuficiente']:
        return base | {'insuficiente': True, 'minimo': MIN_NINOS, 'n': ej['n'],
                       'mensaje': f'Con menos de {MIN_NINOS} niños en ese subgrupo no hay un ejemplo típico.'}
    peticion, cambiados = _peticion(ej, p.cambios, ctx, u)
    parcial = {'sujetos': pd.DataFrame(peticion['sujetos']), 'mediciones': pd.DataFrame(peticion['mediciones']),
               'episodios': pd.DataFrame(peticion['episodios'])}
    if parcial['mediciones'].empty:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, 'Ningún valor del niño está en el esquema del modelo.')
    try:
        sev = PU.completar(parcial, ctx.base, None)
        # solo el modelo clínico: el de anomalías revisa datos, no calcula riesgo
        p_clinico = ctx.modelos.clinico.preparar(sev)
        actual = ctx.modelos.clinico.riesgos(p_clinico, con_motivos=True, solo_pendientes=False)
        hist = PU.historia_riesgo(sev, ctx.modelos)
    except (ValueError, KeyError) as e:
        registro.warning('No se pudo calcular el niño nuevo: %s: %s', type(e).__name__, e, exc_info=True)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            'No se pudo calcular el riesgo con estos valores. Revise lo que cambió e intente de nuevo.') from e
    esq = pd.read_parquet(ctx.base / 'esquema.parquet').set_index('variable').to_dict('index')
    riesgos = []
    for r in actual.to_dict('records'):
        riesgos.append({'clave': r['clave'], 'desenlace': r['desenlace'], 'momento': r['momento'],
                        'momento_nombre': ctx.nombres.get(r['momento'], r['momento']), 'riesgo': float(r['riesgo']),
                        'percentil': float(r['percentil']), 'nivel': _nivel(float(r['percentil'])),
                        'motivos': [motivo_legible(m, esq) for m in _lista_motivos(r['motivos'])]})
    trayectoria = sorted(({'clave': r.clave, 'desenlace': r.desenlace, 'momento': r.momento,
                           'momento_nombre': ctx.nombres.get(r.momento, r.momento), 'orden': ctx.orden.get(r.momento, 99),
                           'riesgo': float(r.riesgo), 'percentil': float(r.percentil)} for r in hist.itertuples()),
                         key=lambda x: (x['orden'], x['desenlace']))
    lub = next((m['valor'] for m in peticion['mediciones'] if m['variable'] == PF.VARIABLE_LUBCHENCO), None)
    auditar(s, u, 'prediccion.nino', ctx.version, {'visita': p.visita, 'perfil': ej['perfil'], 'cambios': len(cambiados)})
    s.commit()
    return base | {'insuficiente': False, 'n': ej['n'], 'perfil_ejemplo': ej['perfil_etiqueta'],
                   'eg_semanas': ej['eg_semanas'], 'perfil': PF.perfil_provisional(ej['eg_semanas'], lub, p.visita),
                   'riesgos': riesgos, 'trayectoria': trayectoria, 'linea_alerta': PERCENTIL_ALTO,
                   'cambiados': cambiados}
