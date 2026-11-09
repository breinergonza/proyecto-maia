"""Entrenar, validar y registrar los dos modelos del núcleo. Repite lo que hacen ``python -m anomalias entrenar`` y
``python -m clinico entrenar`` (mismas funciones del núcleo, mismos modelos y fichas en ``MAIA_RAIZ/interno``) y
agrega el registro en MLflow."""
from __future__ import annotations

import json
import tempfile
import time
from dataclasses import dataclass, fields, replace
from pathlib import Path

import pandas as pd

from anomalias import modelo as MA
from anomalias import operacion as OP
from archivos import carpetas as CA
from clinico import modelo as AC
from maia_comun import hiperparametros as HP
from maia_entrenamiento import analitica_clinica as AL
from maia_entrenamiento import datos as D
from maia_entrenamiento import registro as R
from sevarti import contrato as SV
from sevarti.contrato import Sevarti


@dataclass
class Entrenado:
    tipo: str
    version_modelo: str          # hash del núcleo (carpeta interno/.../modelos/<version>)
    registro: str                # nombre en el Model Registry
    version_registro: str        # número de versión en el registro
    carpeta: Path
    metricas: dict[str, float]
    dispositivos: dict[str, list[str]]
    minutos: float


def _dispositivos() -> dict[str, list[str]]:
    return {obj: sorted(d) for obj, d in MA.DISPOSITIVOS_USADOS.items()}


def _etiquetas_dispositivo(pedido: str) -> dict[str, str]:
    usados = _dispositivos()
    reales = sorted({d for ds in usados.values() for d in ds})
    return {'dispositivo_pedido': pedido, 'dispositivo': '+'.join(reales) or pedido,
            'dispositivos_por_objetivo': json.dumps(usados)}


def _sevarti_base(sev: Sevarti, destino: Path) -> Path:
    """Esquema, etapas y quiebres del corte de entrenamiento: la API los necesita para la inferencia de un niño."""
    destino.mkdir(parents=True, exist_ok=True)
    for t in ('esquema', 'etapas', 'quiebres'):
        getattr(sev, t).to_parquet(destino / f'{t}.parquet', index=False)
    (destino / 'corte.json').write_text(json.dumps({'corte': None if sev.corte is None else str(sev.corte.date())}),
                                        encoding='utf-8')
    return destino


def _artefactos(sev: Sevarti, tmp: Path, fuente: str, muestra=None) -> dict[str, Path]:
    art = {'sevarti_base': _sevarti_base(sev, tmp / 'sevarti_base')}
    if muestra is not None:     # la definición y el embudo de la muestra con que se entrenó
        art.update(muestra.artefactos(tmp))
    if fuente == 'kmc' and (dic := D.ruta_diccionario()):
        art['diccionario'] = dic
    return art


def config_anomalias(config_json: str | None) -> MA.Config:
    """La configuración de anomalías con los cambios de ``--config``: los hiperparámetros que también ajusta la web
    se validan con sus mismos límites; el resto tiene que ser un campo del núcleo. Levanta ``ValueError``."""
    cambios = json.loads(Path(config_json).read_text(encoding='utf-8')) if config_json else {}
    campos = {f.name for f in fields(MA.Config)}
    if fuera := sorted(set(cambios) - campos):
        raise ValueError(f'{fuera[0]} no es un parámetro de anomalías')
    web = {c.nombre for c in HP.CAMPOS['anomalias']}
    validos = HP.validar('anomalias', {k: v for k, v in cambios.items() if k in web})
    return replace(MA.Config(), **{k: v for k, v in cambios.items() if k not in web}, **validos)


def _etiqueta_ajustes(ajustes: dict | None) -> dict[str, str]:
    """De dónde salen los hiperparámetros: los del núcleo o los que ajustó administración (los valores usados
    quedan además como ``cfg.*``)."""
    return {'hiperparametros': json.dumps(ajustes, sort_keys=True) if ajustes else 'nucleo'}


def entrenar_anomalias(sev: Sevarti, fuente: str, cfg: MA.Config, validar: bool = True,
                       registrar: bool = True, *, extraccion: dict[str, str] | None = None,
                       ajustes: dict | None = None, muestra=None) -> Entrenado:
    MA.DISPOSITIVOS_USADOS.clear()
    t0 = time.time()
    validacion = None
    if validar:
        print('Validando el modelo de anomalías (entrena con el pasado y mide con lo más reciente)...', flush=True)
        validacion = OP.validar(sev, cfg, progreso=True).metricas()
    print('Entrenando el modelo de anomalías con todos los datos...', flush=True)
    modelo = OP.entrenar_produccion(sev, cfg, progreso=True)
    carpeta = OP.guardar(modelo, CA.PROYECTO.modelos_anomalias, sev, validacion)
    metricas = R.metricas_anomalias(validacion)
    metricas['modelos_capa2'] = float(len(modelo.capa2))
    nombre = D.nombre_registro('anomalias', fuente)
    numero = ''
    if registrar:
        with tempfile.TemporaryDirectory() as tmp:
            mv = R.registrar('anomalias', fuente, carpeta, cfg, metricas,
                             {**_etiquetas_dispositivo(cfg.dispositivo), **_etiqueta_ajustes(ajustes),
                              **(muestra.etiquetas() if muestra else {})}, nombre,
                             _artefactos(sev, Path(tmp), fuente, muestra), extraccion=extraccion)
        numero = mv.version
    return Entrenado('anomalias', modelo.version, nombre, numero, carpeta, metricas, _dispositivos(),
                     (time.time() - t0) / 60)


def validar_clinico(sev: Sevarti, cfg: AC.ConfigClinica, tardias: list[str], retener: dict | None = None
                    ) -> tuple[pd.DataFrame, dict[str, pd.DataFrame], dict[str, str]]:
    """Entrena con los nacidos antes y mide con los más recientes (como ``python -m clinico entrenar``). Con
    ``retener`` deja ahí el modelo de validación y lo preparado, para la analítica."""
    tr, _, te, _ = MA.dividir_por_tiempo(sev, (0.85, 0.0, 0.15))
    modelo = AC.ModeloClinico(cfg).ajustar(tr, progreso=True, tardias=tardias)
    tabla, calibraciones, preparado = AC.evaluar(modelo, te)
    if retener is not None:
        retener.update(modelo=modelo, preparado=preparado)
    return tabla, calibraciones, modelo.omitidos


def entrenar_clinico(sev: Sevarti, fuente: str, cfg: AC.ConfigClinica, validar: bool = True,
                     registrar: bool = True, *, extraccion: dict[str, str] | None = None,
                     ajustes: dict | None = None, muestra=None) -> Entrenado:
    MA.DISPOSITIVOS_USADOS.clear()
    t0 = time.time()
    tardias = AC.ModeloClinico(cfg).detectar_tardias(sev)
    if tardias:
        print(f'Variables que la base llena con retraso (no se usan): {", ".join(tardias)}', flush=True)
    tabla = calibraciones = None
    retenido: dict = {}
    if validar:
        print('Validando las alertas clínicas (entrena con los nacidos antes y mide con los más recientes)...', flush=True)
        tabla, calibraciones, _ = validar_clinico(sev, cfg, tardias, retenido)
    print('Entrenando las alertas clínicas con todos los datos...', flush=True)
    modelo = AC.ModeloClinico(cfg).ajustar(sev, progreso=True, tardias=tardias)
    carpeta = AC.guardar(modelo, CA.PROYECTO.modelos_clinicos, sev, tabla)
    nombre_a_clave = {d.nombre: d.clave for d in cfg.desenlaces}
    metricas = R.metricas_clinicas(tabla, calibraciones, nombre_a_clave)
    metricas['desenlaces_con_modelo'] = float(len(modelo.modelos))
    nombre = D.nombre_registro('clinico', fuente)
    numero = ''
    if registrar:
        with tempfile.TemporaryDirectory() as tmp:
            mv = R.registrar('clinico', fuente, carpeta, cfg, metricas,
                             {**_etiquetas_dispositivo(getattr(cfg, 'dispositivo', 'cpu')), **_etiqueta_ajustes(ajustes),
                              'omitidos': json.dumps(modelo.omitidos, ensure_ascii=False)[:5000],
                              **(muestra.etiquetas() if muestra else {})},
                             nombre, _artefactos(sev, Path(tmp), fuente, muestra), extraccion=extraccion)
        numero = mv.version
    if retenido:   # analítica agregada de la validación (un fallo suyo no rompe el entrenamiento)
        AL.analizar_y_guardar(retenido['modelo'], retenido['preparado'],
                              {'fuente': fuente, 'registro': nombre, 'version_registro': str(numero),
                               'version_modelo': modelo.version, 'corte': None if sev.corte is None else str(sev.corte.date()),
                               **({'embudo': muestra.embudo} if muestra else {})})
    return Entrenado('clinico', modelo.version, nombre, numero, carpeta, metricas, _dispositivos(),
                     (time.time() - t0) / 60)


def experimento_desenlaces(sev: Sevarti, fuente: str) -> pd.DataFrame:
    """Valida los desenlaces "En uso" y "En prueba" (incluidos los de crecimiento a 12 meses) sin tocar el modelo
    en uso. La tabla (solo agregados) queda en MLflow y en ``interno/clinico/experimentos/``."""
    cfg = D.config_clinica(fuente, prueba=True)
    tardias = AC.ModeloClinico(cfg).detectar_tardias(sev)
    tabla, calibraciones, omitidos = validar_clinico(sev, cfg, tardias)
    nombres = {d.clave: d.nombre for d in cfg.desenlaces}
    sin_modelo = pd.DataFrame([(nombres.get(c, c), m) for c, m in omitidos.items()], columns=['desenlace', 'sin modelo'])
    salida = pd.concat([tabla.reset_index(), sin_modelo], ignore_index=True)
    CA.PROYECTO.experimentos.mkdir(parents=True, exist_ok=True)
    fecha = (sev.corte or pd.Timestamp.now()).strftime('%Y-%m-%d')
    ruta = CA.PROYECTO.experimentos / f'{fecha}.csv'
    salida.to_csv(ruta, index=False, encoding='utf-8-sig')
    R.experimento('experimentos')
    import mlflow
    with mlflow.start_run(run_name=f'desenlaces {fuente} {fecha}'):
        mlflow.set_tags({'fuente': fuente, 'corte': fecha})
        mlflow.log_params({'desenlaces': len(cfg.desenlaces), 'tardias': ','.join(tardias)[:500]})
        mlflow.log_metrics(R.metricas_clinicas(tabla, calibraciones, {d.nombre: d.clave for d in cfg.desenlaces}))
        mlflow.log_artifact(str(ruta), 'tabla')
    return salida


def guardar_corte_temporal(sev: Sevarti, tmp: Path) -> Path:
    return SV.guardar(sev, tmp / 'sevarti')
