"""Correr los dos modelos sobre un ``Sevarti`` y dejar los resultados en Postgres (sección 4.9 del plan).

Lo usan la CLI (corrida semestral en el equipo local) y la API (corrida de demostración e inferencia de un niño).
Las funciones del núcleo hacen todo el cálculo; aquí solo se traduce a las tablas del esquema ``resultados``:

* ``alertas_dato``   la cola de revisión de ``anomalias.operacion.cola_revision`` (en su orden de prioridad)
* ``alarmas_grupo``  las alarmas de la capa 4, con su frase legible
* ``riesgos``        ``clinico.modelo.ModeloClinico.riesgos``, con los tres motivos como lista
* ``crecimiento``    todos los puntajes z de la OMS, con las banderas de -2 DE, caída de 1 DE y dato improbable
* ``metricas_modelo`` las métricas de validación de las fichas
"""
from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import Engine, insert, update
from sqlalchemy.orm import Session

from anomalias import modelo as MA
from anomalias import operacion as OP
from archivos import libros as LB
from clinico import modelo as AC
from maia_comun.metricas import filas_metricas
from maia_comun.modelos_db import Corrida, MetricaModelo
from maia_comun.sevarti_db import copiar
from sevarti import contrato as SV
from sevarti.contrato import Sevarti


@dataclass
class Modelos:
    anomalias: MA.ModeloAnomalias
    ficha_anomalias: dict
    clinico: AC.ModeloClinico
    ficha_clinica: dict
    origen: str = ''            # versión del paquete o "registro vN", para la corrida

    @property
    def nombre_a_clave(self) -> dict[str, str]:
        return {m.desenlace.nombre: c for c, m in self.clinico.modelos.items()}


# ================================================================ corridas

def nueva_corrida(motor: Engine, tipo: str, modelos: Modelos | None = None, corte_id: int | None = None,
                  fuente: str | None = None, fecha_corte=None, silencio: bool = False, dispositivo: str | None = None,
                  paquete: str | None = None) -> int:
    with Session(motor) as s, s.begin():
        c = Corrida(tipo=tipo, estado='en_curso', corte_id=corte_id, fuente=fuente, fecha_corte=fecha_corte,
                    silencio=silencio, dispositivo=dispositivo, paquete=paquete, paso='iniciando',
                    modelo_anomalias=modelos.ficha_anomalias['version'] if modelos else None,
                    modelo_clinico=modelos.ficha_clinica['version'] if modelos else None)
        s.add(c)
        s.flush()
        return c.id


def marcar(motor: Engine, corrida_id: int, estado: str | None = None, paso: str | None = None,
           mensaje: str | None = None, resumen: dict | None = None) -> None:
    valores: dict = {}
    if estado:
        valores['estado'] = estado
        if estado in ('ok', 'error'):
            valores['terminada'] = datetime.now(UTC)
    if paso is not None:
        valores['paso'] = paso
    if mensaje is not None:
        valores['mensaje'] = mensaje[:4000]
    if resumen is not None:
        valores['resumen'] = resumen
    with Session(motor) as s, s.begin():
        s.execute(update(Corrida).where(Corrida.id == corrida_id).values(**valores))


# ================================================================ conversiones

def _texto(v) -> str | None:
    if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NA or v is pd.NaT:
        return None
    return str(v)


def _fecha(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, errors='coerce').dt.date


def _arreglo_pg(capas: str) -> str:
    partes = [c.strip() for c in str(capas).split(',') if c.strip()]
    return '{' + ','.join(partes) + '}'


def _motivos(texto) -> str:
    import json
    lista = [m.strip() for m in str(texto or '').split(';') if m.strip()]
    return json.dumps(lista, ensure_ascii=False)


def tabla_alertas(cola: pd.DataFrame, corrida_id: int) -> pd.DataFrame:
    return pd.DataFrame({
        'corrida_id': corrida_id, 'sujeto': cola.sujeto.astype(str), 'variable': cola.variable.astype(str),
        'etiqueta': cola.etiqueta.map(_texto), 'unidad': cola.unidad.map(_texto), 'etapa': cola.etapa.map(_texto),
        'fecha': _fecha(cola.fecha), 'valor': cola.valor.map(_texto),
        'esperado': pd.to_numeric(cola.esperado, errors='coerce'),
        'rango_bajo': pd.to_numeric(cola.rango_bajo, errors='coerce'),
        'rango_alto': pd.to_numeric(cola.rango_alto, errors='coerce'),
        'capas': cola.capas.map(_arreglo_pg), 'motivo': cola.motivos.map(_texto),
        'fuerza': pd.to_numeric(cola.fuerza, errors='coerce'), 'prioridad': cola.prioridad.astype(int),
    })


def tabla_riesgos(riesgos: pd.DataFrame, corrida_id: int, silencio: bool) -> pd.DataFrame:
    return pd.DataFrame({
        'corrida_id': corrida_id, 'sujeto': riesgos.sujeto.astype(str), 'clave': riesgos.clave.astype(str),
        'desenlace': riesgos.desenlace.astype(str), 'momento': riesgos.momento.astype(str),
        'riesgo': riesgos.riesgo.astype(float), 'percentil': riesgos.percentil.astype(float),
        'motivos': riesgos.motivos.map(_motivos), 'fecha_visita': _fecha(riesgos.fecha_visita),
        'silencio': silencio,
    })


def tabla_crecimiento(c: pd.DataFrame, p: AC.Preparado, corrida_id: int) -> pd.DataFrame:
    c = c.join(p.datos[['t']], how='left')
    return pd.DataFrame({
        'corrida_id': corrida_id, 'sujeto': c.sujeto.astype(str), 'etapa': c.etapa.map(_texto),
        'indicador': c.concepto.astype(str), 'variable': c.variable.map(_texto), 'fecha': _fecha(c.t), 'edad_corregida': pd.to_numeric(c.ec_dias),
        'valor': pd.to_numeric(p.x.reindex(c.index), errors='coerce'), 'z': pd.to_numeric(c.z),
        'bajo_2de': c.bajo.fillna(False).astype(bool), 'caida_1de': c.cae.fillna(False).astype(bool),
        'improbable': c.improbable.fillna(False).astype(bool),
    })


def tabla_grupos(res: MA.Resultado, sev: Sevarti, cfg: MA.Config, corrida_id: int,
                 desde: pd.Timestamp | None) -> pd.DataFrame:
    grupo = res.grupo
    if desde is not None and not grupo.empty:
        grupo = grupo[pd.to_datetime(grupo.periodo) >= desde.to_period(cfg.periodo).start_time]
    if grupo.empty:
        return pd.DataFrame()
    legibles = OP.grupos_legibles(grupo, sev.esquema, cfg.periodo).reset_index(drop=True)
    g = grupo.reset_index(drop=True)
    return pd.DataFrame({
        'corrida_id': corrida_id, 'grupo': g.grupo.map(_texto), 'periodo': legibles.periodo,
        'variable': g.variable.astype(str), 'etiqueta': legibles.etiqueta.map(_texto), 'senal': g.senal.astype(str),
        'valor': pd.to_numeric(g.valor, errors='coerce'), 'referencia': pd.to_numeric(g.referencia, errors='coerce'),
        'estadistico': pd.to_numeric(g.estadistico, errors='coerce'), 'que_paso': legibles.que_paso,
    })


def _guardar(motor: Engine, tabla: str, df: pd.DataFrame) -> None:
    if df.empty:
        return
    with motor.begin() as cx:
        copiar(cx.connection.driver_connection, tabla, list(df.columns), df)


# ================================================================ corrida

def correr(motor: Engine, sev: Sevarti, modelos: Modelos, corrida_id: int, silencio: bool = False,
           desde: pd.Timestamp | None = None, carpeta_salidas: Path | None = None,
           notificar: Callable[[int], dict] | None = None,
           progreso: Callable[[str], None] | None = None) -> dict:
    """Puntúa ``sev``, guarda todo bajo ``corrida_id`` y devuelve el resumen (solo agregados).
    Con ``carpeta_salidas`` escribe además los dos libros Excel de la Fundación (revisión de datos y riesgos)."""
    def paso(texto: str) -> None:
        marcar(motor, corrida_id, paso=texto)
        if progreso:
            progreso(texto)

    t0 = time.time()
    try:
        paso('modelo de anomalías')
        res = modelos.anomalias.puntuar(sev)
        cola = OP.cola_revision(res, sev.esquema, modelos.anomalias.cfg, desde)
        _guardar(motor, 'resultados.alertas_dato', tabla_alertas(cola, corrida_id))
        grupos = tabla_grupos(res, sev, modelos.anomalias.cfg, corrida_id, desde)
        _guardar(motor, 'resultados.alarmas_grupo', grupos)

        paso('alertas clínicas')
        p = modelos.clinico.preparar(sev)
        riesgos = modelos.clinico.riesgos(p, con_motivos=True)
        if desde is not None and not riesgos.empty:
            riesgos = riesgos[pd.to_datetime(riesgos.fecha_visita) >= desde]
        _guardar(motor, 'resultados.riesgos', tabla_riesgos(riesgos, corrida_id, silencio))
        crec = modelos.clinico.crecimiento(p)
        _guardar(motor, 'resultados.crecimiento', tabla_crecimiento(crec, p, corrida_id))

        filas = filas_metricas(modelos.ficha_anomalias, modelos.ficha_clinica, modelos.nombre_a_clave)
        if filas:
            with Session(motor) as s, s.begin():
                s.execute(insert(MetricaModelo), [dict(f, corrida_id=corrida_id) for f in filas])

        n_num = max(int(res.datos.tipo.eq('numeric').sum()), 1)
        resumen = {
            'ninos': int(sev.sujetos.sujeto.nunique()), 'datos': int(len(sev.mediciones)),
            'datos_revisar': int(len(cola)), 'ninos_revisar': int(cola.sujeto.nunique()) if len(cola) else 0,
            'alertas_por_1000': round(1000 * len(cola) / n_num, 2),
            'alertas_por_capa': {str(i): int(res.datos[f'alerta{i}'].sum()) for i in (1, 2, 3)},
            'alarmas_grupo': int(len(grupos)), 'rechazados': int(len(res.rechazos)),
            'riesgos': int(len(riesgos)), 'ninos_con_riesgo': int(riesgos.sujeto.nunique()) if len(riesgos) else 0,
            'datos_crecimiento': int(len(crec)),
            'crecimiento_bajo_2de': int(crec.bajo.fillna(False).sum()) if len(crec) else 0,
            'crecimiento_caida_1de': int(crec.cae.fillna(False).sum()) if len(crec) else 0,
            'crecimiento_improbable': int(crec.improbable.fillna(False).sum()) if len(crec) else 0,
            'desde': None if desde is None else str(desde.date()), 'silencio': silencio,
            'corte': None if sev.corte is None else str(pd.Timestamp(sev.corte).date()),
        }
        if carpeta_salidas is not None and not silencio:
            paso('archivos para la Fundación')
            resumen['archivos'] = [str(r) for r in escribir_libros(sev, modelos, res, cola, riesgos, crec, p, desde,
                                                                   carpeta_salidas)]
        if notificar and not silencio:
            paso('notificaciones')
            resumen['notificaciones'] = notificar(corrida_id)
        resumen['minutos'] = round((time.time() - t0) / 60, 2)
        marcar(motor, corrida_id, estado='ok', paso='terminada', resumen=resumen)
        return resumen
    except Exception as e:
        marcar(motor, corrida_id, estado='error', mensaje=f'{type(e).__name__}: {e}')
        raise


def escribir_libros(sev: Sevarti, modelos: Modelos, res: MA.Resultado, cola: pd.DataFrame, riesgos: pd.DataFrame,
                    crec: pd.DataFrame, p: AC.Preparado, desde: pd.Timestamp | None, carpeta: Path) -> list[Path]:
    """Los mismos dos libros que escriben ``python -m anomalias revisar`` y ``python -m clinico riesgos``."""
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = (sev.corte or pd.Timestamp.now()).strftime('%Y-%m-%d')
    nombres = SV.nombres_etapa(sev.etapas)
    etiqueta = sev.esquema.set_index('variable').etiqueta
    periodo = f'desde el {desde.date()}' if desde is not None else 'desde el principio de la base'
    grupo = res.grupo
    if desde is not None and not grupo.empty:
        grupo = grupo[pd.to_datetime(grupo.periodo) >= desde.to_period(modelos.anomalias.cfg.periodo).start_time]
    ruta_rev = LB.escribir(LB.REVISION, carpeta / f'revision_de_datos_{nombre}.xlsx', {
        'Datos': cola.assign(etapa=cola.etapa.replace(nombres)),
        'Grupos': OP.grupos_legibles(grupo, sev.esquema, modelos.anomalias.cfg.periodo),
        'No usados': res.rechazos.assign(etiqueta=res.rechazos.variable.map(etiqueta).fillna(res.rechazos.variable)),
    }, notas=(f'Datos que entraron {periodo}, hasta el corte del {nombre}. Modelo {modelos.ficha_anomalias["version"]}.',))
    c = crec.join(p.datos[['t']])
    c = c[c.bajo | c.cae | c.improbable]
    if desde is not None:
        c = c[c.t >= desde]
    tabla = riesgos.sort_values(['desenlace', 'riesgo'], ascending=[True, False])
    resumen = tabla.groupby('desenlace').agg(niños=('sujeto', 'size'), riesgo_medio=('riesgo', 'mean'),
                                             riesgo_mediano=('riesgo', 'median'))
    ruta_rie = LB.escribir(LB.RIESGOS, carpeta / f'riesgos_{nombre}.xlsx', {
        'Riesgo': tabla.assign(riesgo=100 * tabla.riesgo, momento=tabla.momento.replace(nombres),
                               fecha_visita=pd.to_datetime(tabla.fecha_visita).dt.date,
                               motivos=tabla.motivos.str.replace('; ', '\n')),
        'Crecimiento': c.assign(etapa=c.etapa.replace(nombres), concepto=c.concepto.str.replace('_', ' ')),
        'Resumen': (100 * resumen[['riesgo_medio', 'riesgo_mediano']]).assign(niños=resumen.niños).reset_index(),
    }, notas=(f'Corte del {nombre}, {"visitas " + periodo}. Modelo clínico {modelos.ficha_clinica["version"]}.',))
    return [ruta_rev, ruta_rie]


# ================================================================ inferencia

def completar(parcial: dict[str, pd.DataFrame], base: Path, corte: pd.Timestamp | None) -> Sevarti:
    """Un ``Sevarti`` de unos pocos niños: sujetos, mediciones y episodios vienen en la petición; esquema, etapas y
    quiebres, del corte con que se entrenaron los modelos (``sevarti_base`` del paquete)."""
    tablas = {t: pd.read_parquet(base / f'{t}.parquet') for t in ('esquema', 'etapas', 'quiebres')}
    sujetos = parcial['sujetos'].copy()
    for c in SV.COLUMNAS['sujetos']:
        if c not in sujetos:
            sujetos[c] = None
    sujetos['fecha_nacimiento'] = pd.to_datetime(sujetos.fecha_nacimiento, errors='coerce')
    med = parcial['mediciones'].copy()
    med['fecha'] = pd.to_datetime(med.fecha, errors='coerce')
    med['valor'] = med.valor.astype(object)
    epi = parcial.get('episodios')
    if epi is None or epi.empty:
        epi = pd.DataFrame(columns=list(SV.COLUMNAS['episodios']))
    if corte is None:
        corte = pd.Timestamp(datetime.now(UTC).date())
    return Sevarti(esquema=tablas['esquema'], etapas=tablas['etapas'], sujetos=sujetos, mediciones=med,
                   episodios=epi, quiebres=tablas['quiebres'], corte=corte)


def inferir(sev: Sevarti, modelos: Modelos) -> dict[str, pd.DataFrame]:
    """Sin guardar nada y sin capa 4 (necesita la historia de todo el programa). Los riesgos son los de la última
    visita de cada niño, esté o no abierta la ventana de la siguiente."""
    res = modelos.anomalias.puntuar(sev)
    cola = OP.cola_revision(res, sev.esquema, modelos.anomalias.cfg)
    p = modelos.clinico.preparar(sev)
    riesgos = modelos.clinico.riesgos(p, con_motivos=True, solo_pendientes=False)
    crec = modelos.clinico.crecimiento(p)
    return {'alertas_dato': tabla_alertas(cola, 0).drop(columns='corrida_id'),
            'riesgos': tabla_riesgos(riesgos, 0, False).drop(columns=['corrida_id', 'silencio']),
            'crecimiento': tabla_crecimiento(crec, p, 0).drop(columns='corrida_id')}


def historia_riesgo(sev: Sevarti, modelos: Modelos) -> pd.DataFrame:
    """El riesgo de cada desenlace en cada visita a la que fue el niño, cada uno con lo medido hasta su visita: la
    trayectoria de la ficha. La corrida guarda solo la última visita; esto no se guarda. Sin motivos (lo caro)."""
    p = modelos.clinico.preparar(sev)
    riesgos = modelos.clinico.riesgos(p, solo_ultima_visita=False, con_motivos=False, solo_pendientes=False)
    return tabla_riesgos(riesgos, 0, False).drop(columns=['corrida_id', 'silencio', 'motivos'])
