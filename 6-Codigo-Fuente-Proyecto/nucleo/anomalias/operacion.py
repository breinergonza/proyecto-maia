"""Running the anomaly model for real: validation, versioned models, the review queue and
the expert feedback loop.

Nothing here names a variable or an institution: it works on SEVARTI data and on the
model's ``Resultado``. Record-level outputs (the review queue, the expert sheet) carry
the source's own pseudonymous subject id and are written only to local files.
"""
from __future__ import annotations

import json
import pickle
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from anomalias import modelo as MA
from archivos import carpetas as CA
from archivos.libros import decimal
from sevarti.contrato import Sevarti

ARCHIVO_MODELO = 'modelo.pkl'
ARCHIVO_FICHA = 'ficha.json'
CAPAS = ('1. Valor', '2. Contexto', '3. Trayectoria')


# ================================================================== validation

@dataclass
class Validacion:
    """Everything the validation run produces; the notebook shows it, the card summarizes it."""
    modelo: MA.ModeloAnomalias
    entrenamiento: Sevarti
    calibracion: Sevarti
    prueba: Sevarti
    particion: pd.DataFrame
    base: MA.Resultado        # score of the untouched test split
    recall: pd.DataFrame
    falsas: pd.DataFrame
    curva: pd.DataFrame
    minutos_ajuste: float

    def metricas(self) -> dict:
        r = self.recall
        return {
            'sujetos': self.particion.sujetos.to_dict(),
            'recall_pct': {t: {c: round(float(v), 1) for c, v in fila.items() if c != 'errores'}
                           for t, fila in r.iterrows()},
            'alertas_por_1000_limpios': {c: round(float(v), 2) for c, v in self.falsas.iloc[0].items()},
            'alertas_por_1000_prueba': tasas_alerta(self.base),
            'curva_alpha': {str(a): {c: round(float(v), 2) for c, v in fila.items()} for a, fila in self.curva.iterrows()},
            'minutos_ajuste': round(self.minutos_ajuste, 1),
        }


def validar(sev: Sevarti, cfg: MA.Config, rondas: int = 3, progreso: bool = False) -> Validacion:
    """Fit on the past, calibrate, and measure on the most recent births of every regime."""
    tr, ca, te, info = MA.dividir_por_tiempo(sev)
    t0 = time.time()
    modelo = MA.ModeloAnomalias(cfg).ajustar(tr, ca, progreso=progreso)
    minutos = (time.time() - t0) / 60
    base = modelo.puntuar(te)
    ev = MA.evaluar(modelo, te, rondas=rondas, base=base)
    return Validacion(modelo, tr, ca, te, info, base, ev.recall, ev.falsas, ev.curva, minutos)


def entrenar_produccion(sev: Sevarti, cfg: MA.Config, progreso: bool = False) -> MA.ModeloAnomalias:
    """The model used day to day learns from every subject: 85% to fit and the most recent
    15% of each regime to calibrate. Its quality is the one measured by ``validar``."""
    tr, ca, _, _ = MA.dividir_por_tiempo(sev, (0.85, 0.15, 0.0))
    return MA.ModeloAnomalias(cfg).ajustar(tr, ca, progreso=progreso)


def tasas_alerta(res: MA.Resultado) -> dict[str, float]:
    d = res.datos
    n = max(int(d.tipo.eq('numeric').sum()), 1)
    tasas = {c: 1000 * int(d[f'alerta{i}'].sum()) / n for i, c in enumerate(CAPAS, start=1)}
    tasas['cualquiera'] = 1000 * int((d.alerta1 | d.alerta2 | d.alerta3).sum()) / n
    return {c: round(v, 2) for c, v in tasas.items()}


# ============================================================== versioned models

def guardar(modelo: MA.ModeloAnomalias, carpeta: Path, sev: Sevarti, validacion: dict | None) -> Path:
    """Model, training mask and model card in ``carpeta/<version>``. The card says what the
    model learned from and how good it was, so a run can be checked against it."""
    destino = carpeta / modelo.version
    destino.mkdir(parents=True, exist_ok=True)
    with open(destino / ARCHIVO_MODELO, 'wb') as f:
        pickle.dump(modelo, f, protocol=pickle.HIGHEST_PROTOCOL)
    modelo.guardar_mascara(destino)
    ficha = {
        'version': modelo.version, 'version_codigo': MA.VERSION_CODIGO,
        'entrenado': pd.Timestamp.now().isoformat(timespec='seconds'),
        'corte_datos': None if sev.corte is None else str(pd.Timestamp(sev.corte).date()),
        'sujetos': int(sev.sujetos.sujeto.nunique()), 'datos': int(len(sev.mediciones)),
        'variables_esquema': int(len(sev.esquema)),
        'modelos_capa2': len(modelo.capa2), 'omitidas_capa2': modelo.omitidas,
        'config': asdict(modelo.cfg), 'validacion': validacion,
    }
    (destino / ARCHIVO_FICHA).write_text(json.dumps(ficha, indent=2, ensure_ascii=False, default=str),
                                         encoding='utf-8')
    return destino


def fichas(carpeta: Path) -> pd.DataFrame:
    """Every saved model, newest first: what it learned from and how it did at validation."""
    filas = []
    for ruta in carpeta.glob(f'*/{ARCHIVO_FICHA}'):
        f = json.loads(ruta.read_text(encoding='utf-8'))
        v = f.get('validacion') or {}
        filas.append(dict(version=f['version'], entrenado=f['entrenado'], corte_datos=f['corte_datos'],
                          sujetos=f['sujetos'], modelos_capa2=f['modelos_capa2'],
                          alertas_por_1000=v.get('alertas_por_1000_prueba', {}).get('cualquiera'),
                          carpeta=ruta.parent))
    cols = ['version', 'entrenado', 'corte_datos', 'sujetos', 'modelos_capa2', 'alertas_por_1000', 'carpeta']
    return pd.DataFrame(filas, columns=cols).sort_values('entrenado', ascending=False).reset_index(drop=True)


def cargar(carpeta: Path) -> tuple[MA.ModeloAnomalias, dict]:
    """A model folder, or the folder of models (the most recently trained is taken).
    Only load models this project wrote: a pickle runs code when it is read."""
    if not (carpeta / ARCHIVO_MODELO).exists():
        todas = fichas(carpeta)
        if todas.empty:
            raise FileNotFoundError(f'No hay modelos en {carpeta}. Primero: python -m anomalias entrenar')
        carpeta = todas.carpeta.iloc[0]
    ficha = json.loads((carpeta / ARCHIVO_FICHA).read_text(encoding='utf-8'))
    if ficha['version_codigo'] != MA.VERSION_CODIGO:
        raise RuntimeError(f'El modelo {ficha["version"]} es de otra versión del código '
                           f'({ficha["version_codigo"]}, ahora {MA.VERSION_CODIGO}): hay que reentrenar.')
    with open(carpeta / ARCHIVO_MODELO, 'rb') as f:
        modelo = pickle.load(f)
    return modelo, ficha


def en_uso(ruta: str | None) -> tuple[MA.ModeloAnomalias, dict]:
    """The model asked for (a folder), or the most recent one saved in ``interno/``."""
    return cargar(Path(ruta) if ruta else CA.PROYECTO.modelos_anomalias)


def deriva(res: MA.Resultado, ficha: dict, factor: float = 2.0) -> pd.DataFrame:
    """Alert rates of this run against the ones measured at validation. A layer alerting
    ``factor`` times more (or less) than expected means the data changed: retrain or look."""
    esperadas = (ficha.get('validacion') or {}).get('alertas_por_1000_prueba', {})
    ahora = tasas_alerta(res)
    t = pd.DataFrame({'esperado_por_1000': pd.Series(esperadas, dtype=float),
                      'ahora_por_1000': pd.Series(ahora, dtype=float)})
    razon = t.ahora_por_1000 / t.esperado_por_1000
    t['revisar'] = (razon > factor) | (razon < 1 / factor)
    return t


# ================================================================ review queue

def _fuerza(d: pd.DataFrame, cfg: MA.Config) -> pd.Series:
    """How far past its own threshold each layer is (1 = at it). Rules without a score of
    their own (stages out of order, a length that decreases) count as 1."""
    f1 = d.z1.abs() / cfg.z_alerta
    f2 = d.z2.abs() * d.escala2 / (d.rango_alto - d.esperado)
    f3 = d.z3.abs() / cfg.z_alerta
    partes = [f.clip(lower=1.0).fillna(1.0).where(d[f'alerta{i}']) for i, f in enumerate((f1, f2, f3), start=1)]
    return pd.concat(partes, axis=1).max(axis=1).replace(np.inf, 99.0)


MOTIVO_VENTANA = MA.MOTIVO_VENTANA
EDAD_DE_LA_VISITA = 'Edad a la visita'


def _esperado(a: pd.DataFrame, pares: pd.DataFrame | None, refs1: dict[str, MA.RefValor],
              cfg: MA.Config) -> tuple[pd.Series, pd.Series, pd.Series]:
    """What was expected of each flagged datum, from the check that flagged it: the subject's
    other data (layer 2), else the neighbouring datum and the days between them (layer 3),
    else what is usual for the variable (layer 1). Empty when what was flagged is not the
    value itself (stages out of order, a decrease)."""
    esperado, bajo, alto = (pd.Series(np.nan, index=a.index) for _ in range(3))
    for var, idx in a[a.alerta1].groupby('variable').groups.items():
        ref = refs1.get(var)
        if ref is not None:
            esperado[idx] = MA._desde_z(0.0, ref)
            bajo[idx], alto[idx] = MA._desde_z(-cfg.z_alerta, ref), MA._desde_z(cfg.z_alerta, ref)
    cambio = a.index[(a.alerta3 & (a.motivo3 == MA.MOTIVO_CAMBIO)).to_numpy()]
    if len(cambio) and pares is not None and 'margen' in pares:
        # a datum blamed for a change is judged on its most atypical pair
        lados = pd.concat([pd.DataFrame({'fila': pares.fila_b, 'z': pares.z.abs(), 'e': pares.esperado_b, 'm': pares.margen}),
                           pd.DataFrame({'fila': pares.fila_a, 'z': pares.z.abs(), 'e': pares.esperado_a, 'm': pares.margen})])
        lados = lados.dropna(subset=['z']).sort_values('z', ascending=False).drop_duplicates('fila').set_index('fila')
        cambio = cambio.intersection(lados.index)
        esperado[cambio] = lados.e[cambio]
        bajo[cambio], alto[cambio] = lados.e[cambio] - lados.m[cambio], lados.e[cambio] + lados.m[cambio]
    dos = a.index[a.alerta2.to_numpy()]
    esperado[dos], bajo[dos], alto[dos] = a.esperado[dos], a.rango_bajo[dos], a.rango_alto[dos]
    return esperado, bajo, alto


def _una_fila_por_visita(out: pd.DataFrame, a: pd.DataFrame, etapas: pd.DataFrame) -> pd.DataFrame:
    """A visit outside its age window is one problem (the date or the age), not one per measure:
    the data flagged only for that become one row with the age at the visit and the window."""
    solo = (out.motivos == MOTIVO_VENTANA).to_numpy()
    if not solo.any():
        return out
    et = etapas.set_index('etapa')
    v = a[solo]
    edad = np.where(v.etapa.map(et.base) == 'corregida', v.ec_dias, v.edad_dias)
    g = out[solo].assign(edad=edad).groupby(['sujeto', 'etapa', 'fecha'], as_index=False, sort=False).agg(
        grupo=('grupo', 'first'), edad=('edad', 'first'), fuerza=('fuerza', 'max'))
    visitas = pd.DataFrame({
        'sujeto': g.sujeto, 'grupo': g.grupo, 'variable': '', 'etiqueta': EDAD_DE_LA_VISITA, 'unidad': 'días',
        'etapa': g.etapa, 'fecha': g.fecha, 'valor': g.edad.round(),
        'esperado': np.nan, 'rango_bajo': g.etapa.map(et.edad_min).astype(float),
        'rango_alto': g.etapa.map(et.edad_max).astype(float),
        'capas': '3', 'n_capas': 1, 'motivos': MOTIVO_VENTANA, 'fuerza': g.fuerza,
    })
    return pd.concat([out[~solo], visitas], ignore_index=True)


def cola_revision(res: MA.Resultado, sev: Sevarti, modelo: MA.ModeloAnomalias,
                  desde: pd.Timestamp | None = None) -> pd.DataFrame:
    """One row per datum to review, whatever layers flagged it, most urgent first: data
    flagged by more layers, then data further past their threshold. A visit outside its
    age window is one row."""
    cfg = modelo.cfg
    d = res.datos
    alerta = d.alerta1 | d.alerta2 | d.alerta3
    if desde is not None:
        alerta &= d.t >= desde
    a = d[alerta]
    capas = pd.DataFrame({i: a[f'alerta{i}'] for i in (1, 2, 3)})
    motivo2 = np.where(a.alerta2, 'lejos de lo esperado para este caso', '')
    motivos = pd.DataFrame({'1': a.motivo1.where(a.alerta1, ''), '2': motivo2, '3': a.motivo3.where(a.alerta3, '')})
    esq = sev.esquema.set_index('variable')
    etiqueta = esq.etiqueta
    # nothing expected goes past what the variable can hold (a weight below zero)
    lo = a.variable.map(esq.rango_min).astype(float)
    hi = a.variable.map(esq.rango_max).astype(float)
    esperado, bajo, alto = (s.clip(lower=lo, upper=hi) for s in _esperado(a, res.pares, modelo.refs1, cfg))
    out = pd.DataFrame({
        'sujeto': a.sujeto, 'grupo': a.grupo, 'variable': a.variable, 'etiqueta': a.variable.map(etiqueta).fillna(a.variable),
        'unidad': a.variable.map(esq.unidad),
        'etapa': a.etapa, 'fecha': a.t.dt.date, 'valor': a.valor,
        'esperado': esperado, 'rango_bajo': bajo, 'rango_alto': alto,
        'capas': [', '.join(str(i) for i, v in zip((1, 2, 3), fila) if v) for fila in capas.to_numpy()],
        'n_capas': capas.sum(axis=1),
        'motivos': ['; '.join(m for m in fila if m) for fila in motivos.to_numpy()],
        'fuerza': _fuerza(a, cfg).round(2),
    })
    out = _una_fila_por_visita(out, a, sev.etapas)
    out = out.sort_values(['n_capas', 'fuerza'], ascending=False)
    out.insert(0, 'prioridad', np.arange(1, len(out) + 1))
    return out.reset_index(drop=True)


def resumen_cola(cola: pd.DataFrame) -> pd.DataFrame:
    """Aggregated view of the queue, safe to show."""
    if cola.empty:
        return pd.DataFrame(columns=['datos', 'sujetos'])
    return (cola.groupby('capas').agg(datos=('variable', 'size'), sujetos=('sujeto', 'nunique'))
            .sort_values('datos', ascending=False))


def grupos_legibles(grupo: pd.DataFrame, esquema: pd.DataFrame, periodo: str) -> pd.DataFrame:
    """Layer-4 alarms as a sentence each: what changed in the period against the group's own past."""
    def frase(r) -> str:
        if r.senal == 'datos faltantes':
            return f'Faltó el dato en el {r.valor:.0%} de las visitas; lo habitual del grupo es {r.referencia:.0%}.'
        if r.senal == 'redondeo':
            return f'El {r.valor:.0%} de los valores están redondeados; lo habitual del grupo es {r.referencia:.0%}.'
        return (f'Los valores se alejaron de lo esperado para cada paciente: mediana de {decimal(r.valor)} desviaciones; '
                f'lo habitual del grupo es {decimal(r.referencia)}.')
    return pd.DataFrame({
        'grupo': grupo.grupo,
        'periodo': pd.to_datetime(grupo.periodo).dt.to_period(periodo).astype(str).str.replace('Q', ' T'),
        'variable': grupo.variable, 'etiqueta': grupo.variable.map(esquema.set_index('variable').etiqueta).fillna(grupo.variable),
        'que_paso': [frase(r) for r in grupo.itertuples()],
    })


# ================================================================ saved scores
# Scoring the whole base takes a while; the sample for the experts reuses the scores of the
# last review when they come from the same model and the same data cut.

COLUMNAS_PUNTAJES = ['sujeto', 'variable', 'valor', 'x', 'tipo', 'etapa', 'concepto', 't', 'edad_dias',
                     'eg_semanas', 'alerta1', 'alerta2', 'alerta3']


def _ruta_puntajes(carpeta: Path, version: str, corte: pd.Timestamp | None) -> Path:
    return carpeta / f'puntajes_{version}_{"sin-corte" if corte is None else corte.date()}.parquet'


def guardar_puntajes(res: MA.Resultado, carpeta: Path, version: str, corte: pd.Timestamp | None) -> Path:
    d = res.datos[COLUMNAS_PUNTAJES]
    ruta = _ruta_puntajes(carpeta, version, corte)
    d.assign(valor=d.valor.map(lambda v: None if pd.isna(v) else str(v))).to_parquet(ruta, index=True)
    return ruta


def leer_puntajes(carpeta: Path, version: str, corte: pd.Timestamp | None) -> pd.DataFrame | None:
    ruta = _ruta_puntajes(carpeta, version, corte)
    return pd.read_parquet(ruta) if ruta.exists() else None
