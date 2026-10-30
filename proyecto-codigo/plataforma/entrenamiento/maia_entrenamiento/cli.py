"""CLI ``maia``: todo lo que corre en el equipo local con GPU (sección 4.7 del plan).

    maia verificar-gpu                       ¿LightGBM entrena en CUDA? (y cuánto gana frente a CPU)
    maia extraer --fuente kmc [filtros]      base de la Fundación -> MinIO (necesita KMC_PW)
    maia simular --sujetos 5000              datos simulados -> MinIO
    maia cargar-corte --fuente F             último corte de MinIO -> Postgres (vigente)
    maia entrenar anomalias|clinico          valida, entrena y registra en MLflow (alias candidato)
    maia experimento-desenlaces              valida los desenlaces "En prueba" sin tocar el modelo en uso
    maia promover anomalias|clinico -v N     mueve el alias produccion a la versión N
    maia modelos                             modelos registrados y sus alias
    maia corrida [--silencio] [filtros]      la corrida semestral completa
    maia silencio-retrospectivo --corte F    riesgos calculados en una fecha pasada frente a lo que pasó
    maia exportar                            arma y firma el paquete de modelos para la API
    maia publicar --url URL --version V      sube un paquete a la API (Railway)
    maia programador                         ejecuta lo programado o pedido desde Administración (servicio)

Todas aceptan ``--fuente kmc|simulado`` (por defecto ``simulado``).

``extraer`` y ``corrida`` aceptan parámetros de extracción (consultas parametrizadas, ver docs/extraccion.md):

    --fecha-corte AAAA-MM-DD     nada fechado después entra; es la fecha del corte
    --anio-desde / --anio-hasta  año de nacimiento (anio_parto)
    --desde-visita AAAA-MM-DD    solo niños con alguna visita desde esa fecha (conservan su historia)
    --hasta-visita AAAA-MM-DD    ninguna visita posterior entra

(En ``corrida``, ``--desde`` sigue siendo el inicio del periodo de revisión, no un filtro de extracción.)
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import warnings
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path

import pandas as pd
import typer

os.environ.setdefault('MLFLOW_DISABLE_AGENT_HINT', '1')

app = typer.Typer(help=__doc__, no_args_is_help=True, add_completion=False, rich_markup_mode=None)


class Fuente(StrEnum):
    kmc = 'kmc'
    simulado = 'simulado'


class Tipo(StrEnum):
    anomalias = 'anomalias'
    clinico = 'clinico'


FUENTE = typer.Option(Fuente.simulado, '--fuente', '-f', help='kmc (base real) o simulado')
FECHA_CORTE = typer.Option(None, '--fecha-corte', help='AAAA-MM-DD: nada fechado después entra; fecha del corte')
ANIO_DESDE = typer.Option(None, '--anio-desde', help='año de nacimiento mínimo')
ANIO_HASTA = typer.Option(None, '--anio-hasta', help='año de nacimiento máximo')
DESDE_VISITA = typer.Option(None, '--desde-visita', help='AAAA-MM-DD: solo niños con alguna visita desde esa fecha')
HASTA_VISITA = typer.Option(None, '--hasta-visita', help='AAAA-MM-DD: ninguna visita posterior entra')


def _decir(texto: str) -> None:
    print(texto, flush=True)


def _tabla(titulo: str, df: pd.DataFrame) -> None:
    print(f'\n{titulo}\n{"-" * len(titulo)}')
    print(df.to_string() if not df.empty else '(vacío)', flush=True)


def _almacen():
    from maia_comun.almacen import Almacen
    a = Almacen.desde_config()
    a.asegurar_buckets()
    return a


def _motor():
    from maia_comun.db import motor
    return motor()


def _parametros(fecha_corte: str | None, anio_desde: int | None, anio_hasta: int | None, desde_visita: str | None,
                hasta_visita: str | None):
    from maia_entrenamiento.fuentes.kmc_postgres import ParametrosExtraccion
    try:
        return ParametrosExtraccion.desde_textos(fecha_corte, anio_desde, anio_hasta, desde_visita, hasta_visita)
    except ValueError as e:
        raise typer.BadParameter(str(e)) from None


def _subir_extraccion(sev, meta: dict, almacen):
    """Sube el corte extraído con su extraccion.json (parámetros, sha de las consultas, origen sin clave)."""
    from maia_comun import sevarti_db as SDB
    detalle = {k: meta[k] for k in ('origen', 'consultas', 'columnas_excluidas', 'filas')}
    return SDB.subir_corte(sev, 'kmc', almacen, meta['parametros'], meta['consulta_sha'], detalle)


@app.callback()
def _inicio() -> None:
    warnings.filterwarnings('ignore', category=RuntimeWarning)
    warnings.filterwarnings('ignore', category=FutureWarning, module='mlflow')


# ====================================================================== datos

@app.command('verificar-gpu')
def verificar_gpu(medir: bool = typer.Option(True, help='medir CPU frente a GPU')) -> None:
    """¿LightGBM entrena en la GPU? Imprime 'cuda' o 'cpu' y el motivo."""
    from maia_entrenamiento.gpu import verificar
    e = verificar(medir)
    _decir(e.dispositivo)
    _decir(f'Motivo: {e.motivo}')
    if e.tarjeta:
        _decir(f'GPU: {e.tarjeta} (driver {e.driver})')
    if e.segundos_cpu is not None:
        _decir(f'Modelo de prueba (60.000 filas, 300 rondas): CPU {e.segundos_cpu} s · GPU {e.segundos_gpu} s')
    _decir(f'MAIA_LGBM_DEVICE={os.environ.get("MAIA_LGBM_DEVICE", "cpu")}')


@app.command()
def extraer(fuente: Fuente = typer.Option(Fuente.kmc, '--fuente', '-f'),
            cargar: bool = typer.Option(False, help='también cargarlo en Postgres'),
            fecha_corte: str | None = FECHA_CORTE, anio_desde: int | None = ANIO_DESDE,
            anio_hasta: int | None = ANIO_HASTA, desde_visita: str | None = DESDE_VISITA,
            hasta_visita: str | None = HASTA_VISITA) -> None:
    """Lee la base de la Fundación (solo lectura, KMC_PW, consultas parametrizadas), la pasa a SEVARTI y la guarda
    en MinIO con los parámetros de la extracción."""
    if fuente != Fuente.kmc:
        raise typer.BadParameter('extraer es para la base real; para datos simulados use: maia simular')
    from maia_comun import sevarti_db as SDB
    from maia_entrenamiento import datos as D
    params = _parametros(fecha_corte, anio_desde, anio_hasta, desde_visita, hasta_visita)
    if not params.vacio:
        _decir(f'Parámetros de extracción: {json.dumps(params.como_dict())}')
    sev, meta = D.extraer_kmc(params)
    info = _subir_extraccion(sev, meta, _almacen())
    _decir(f'Corte {info.fecha} guardado en {info.ruta_minio} ({info.filas["mediciones"]:,} datos, sha {info.sha256[:12]}, '
           f'consultas {meta["consulta_sha"][:12]})')
    if cargar:
        cid = SDB.guardar_en_db(_motor(), sev, 'kmc', info.ruta_minio, info.sha256, info.parametros, info.consulta_sha)
        _decir(f'Cargado en Postgres como corte {cid} (vigente).')


@app.command()
def simular(sujetos: int = typer.Option(5000, '--sujetos', '-n'), semilla: int = typer.Option(3),
            corte: str = typer.Option('2026-06-30', help='fecha de corte AAAA-MM-DD'),
            cargar: bool = typer.Option(False, help='también cargarlo en Postgres')) -> None:
    """Genera una cohorte simulada (ningún dato real) y la guarda en MinIO."""
    from maia_comun import sevarti_db as SDB
    from maia_entrenamiento import datos as D
    sev = D.simular(sujetos, semilla, corte)
    info = SDB.subir_corte(sev, 'simulado', _almacen())
    _decir(f'Corte simulado {info.fecha}: {sujetos:,} niños, {info.filas["mediciones"]:,} datos -> {info.ruta_minio}')
    if cargar:
        cid = SDB.guardar_en_db(_motor(), sev, 'simulado', info.ruta_minio, info.sha256)
        _decir(f'Cargado en Postgres como corte {cid} (vigente).')


@app.command('cargar-corte')
def cargar_corte(fuente: Fuente = FUENTE, fecha: str | None = typer.Option(None, help='AAAA-MM-DD; por defecto el último')) -> None:
    """Baja un corte de MinIO y lo carga en Postgres (esquema sevarti) como vigente de su fuente."""
    from maia_comun import sevarti_db as SDB
    from maia_entrenamiento import datos as D
    sev, info, _ = D.corte_local(_almacen(), fuente.value, fecha)
    cid = SDB.guardar_en_db(_motor(), sev, fuente.value, info.ruta_minio, info.sha256, info.parametros,
                            info.consulta_sha)
    _decir(f'Corte {fuente.value}/{info.fecha} cargado en Postgres (id {cid}, vigente): '
           f'{info.filas["sujetos"]:,} niños, {info.filas["mediciones"]:,} datos.')


# ====================================================================== modelos

@app.command()
def entrenar(tipo: Tipo, fuente: Fuente = FUENTE,
             config: Path | None = typer.Option(None, help='JSON con parámetros que cambian, p. ej. {"alpha": 0.002}'),
             sin_validacion: bool = typer.Option(False, '--sin-validacion', help='solo entrenar (sin métricas)'),
             fecha: str | None = typer.Option(None, help='corte AAAA-MM-DD; por defecto el último'),
             sin_registro: bool = typer.Option(False, '--sin-registro', help='no registrar en MLflow'),
             hiperparametros: str | None = typer.Option(
                 None, help='JSON con los hiperparámetros de este entrenamiento (los de la web); mandan sobre los '
                            'guardados en Administración')) -> None:
    """Valida, entrena con todos los datos, guarda en MAIA_RAIZ/interno y registra en MLflow con alias candidato."""
    from maia_comun import hiperparametros as HP
    from maia_entrenamiento import datos as D
    from maia_entrenamiento import entrenar as E
    from maia_entrenamiento import registro as R
    sev, info, _ = D.corte_local(_almacen(), fuente.value, fecha)
    if not sin_registro:
        R.configurar()
    extraccion = R.params_extraccion(info.parametros, info.consulta_sha)
    pedidos = None
    if hiperparametros:
        try:
            pedidos = HP.validar(tipo.value, json.loads(hiperparametros))
        except (ValueError, TypeError) as e:
            raise typer.BadParameter(f'--hiperparametros: {e}') from None
    _decir(f'Corte {info.fecha} ({info.filas["sujetos"]:,} niños).')
    if tipo == Tipo.anomalias:
        if config:   # el archivo manda sobre los ajustes de administración
            cfg, ajustes = E.config_anomalias(str(config)), json.loads(config.read_text(encoding='utf-8'))
        elif pedidos is not None:
            cfg, ajustes = HP.aplicar(E.config_anomalias(None), pedidos), pedidos
        else:
            cfg, ajustes = HP.leer_y_aplicar(E.config_anomalias(None), 'anomalias')
        r = E.entrenar_anomalias(sev, fuente.value, cfg, validar=not sin_validacion, registrar=not sin_registro,
                                 extraccion=extraccion, ajustes=ajustes)
    else:
        if config:
            raise typer.BadParameter('La configuración clínica sale del diccionario de variables, no de --config.')
        if pedidos is not None:
            cfg, ajustes = HP.aplicar(D.config_clinica(fuente.value), pedidos), pedidos
        else:
            cfg, ajustes = HP.leer_y_aplicar(D.config_clinica(fuente.value), 'clinico')
        r = E.entrenar_clinico(sev, fuente.value, cfg, validar=not sin_validacion, registrar=not sin_registro,
                               extraccion=extraccion, ajustes=ajustes)
    if ajustes:
        _decir(f'Hiperparámetros ajustados: {json.dumps(ajustes)}')
    _decir(f'\nModelo {tipo.value} {r.version_modelo} ({r.minutos:.1f} min) en {r.carpeta}')
    _decir(f'Dispositivo por objetivo: {json.dumps(r.dispositivos)}')
    if r.version_registro:
        _decir(f'Registrado como {r.registro} v{r.version_registro} (alias candidato).')
    principales = {k: round(v, 3) for k, v in r.metricas.items()
                   if k.startswith(('auc__', 'top10__', 'falsas_por_1000__cualquiera', 'detectados_pct__'))}
    if principales:
        _tabla('Métricas principales', pd.Series(principales, name='valor').to_frame())


@app.command('experimento-desenlaces')
def experimento_desenlaces(fuente: Fuente = FUENTE, fecha: str | None = typer.Option(None)) -> None:
    """Valida los desenlaces "En uso" y "En prueba" (p. ej. crecimiento a 12 meses) sin tocar el modelo en uso."""
    from maia_entrenamiento import datos as D
    from maia_entrenamiento import entrenar as E
    from maia_entrenamiento import registro as R
    sev, _, _ = D.corte_local(_almacen(), fuente.value, fecha)
    R.configurar()
    _tabla('Validación por desenlace (experimento)', E.experimento_desenlaces(sev, fuente.value).round(2))


@app.command()
def promover(tipo: Tipo, version: str = typer.Option(..., '--version', '-v', help='número de versión del registro'),
             fuente: Fuente = FUENTE, alias: str = typer.Option('produccion')) -> None:
    """Mueve el alias (por defecto produccion) a una versión registrada."""
    from maia_entrenamiento import datos as D
    from maia_entrenamiento import registro as R
    R.configurar()
    nombre = D.nombre_registro(tipo.value, fuente.value)
    mv = R.promover(nombre, version, alias)
    _decir(f'{nombre} v{mv.version} ahora tiene el alias {alias}.')


@app.command()
def modelos() -> None:
    """Modelos registrados en MLflow, con sus alias."""
    from maia_entrenamiento import registro as R
    R.configurar()
    _tabla('Modelos registrados', R.modelos_registrados())


# ====================================================================== corrida

def _modelos_de_registro(fuente: str, alias_anomalias: str, alias_clinico: str, tmp: Path):
    from anomalias import operacion as OP
    from clinico import modelo as AC
    from maia_comun.puntuacion import Modelos
    from maia_entrenamiento import datos as D
    from maia_entrenamiento import registro as R
    mva, ca, run_a = R.descargar(D.nombre_registro('anomalias', fuente), alias_anomalias, tmp / 'a')
    mvc, cc, run_c = R.descargar(D.nombre_registro('clinico', fuente), alias_clinico, tmp / 'c')
    anom, fa = OP.cargar(ca)
    clin, fc = AC.cargar(cc)
    return Modelos(anom, fa, clin, fc, origen=f'registro a{mva.version}/c{mvc.version}'), (mva, ca, run_a), (mvc, cc, run_c)


def _silencio_previo(motor, modelos, sev) -> pd.DataFrame:
    """Riesgos guardados en silencio en corridas anteriores frente a lo que pasó (si hay)."""
    from sqlalchemy import text

    from clinico import modelo as AC
    with motor.connect() as cx:
        guardados = pd.read_sql_query(text(
            'SELECT r.sujeto, r.clave, r.riesgo FROM resultados.riesgos r JOIN resultados.corridas c ON c.id = r.corrida_id '
            "WHERE r.silencio AND c.estado = 'ok'"), cx)
    if guardados.empty:
        return pd.DataFrame()
    guardados = guardados.drop_duplicates(['sujeto', 'clave'])
    p = modelos.clinico.preparar(sev)
    return AC.comparar_silencio(modelos.clinico, p, guardados)


@app.command()
def corrida(fuente: Fuente = typer.Option(Fuente.kmc, '--fuente', '-f'),
            silencio: bool = typer.Option(False, '--silencio', help='guardar los riesgos sin entregarlos'),
            solo_si_nuevo: bool = typer.Option(False, '--solo-si-nuevo', help='terminar si la base no cambió'),
            sin_extraer: bool = typer.Option(False, '--sin-extraer', help='usar el último corte de MinIO'),
            sin_entrenar: bool = typer.Option(False, '--sin-entrenar', help='usar modelos ya registrados'),
            alias: str = typer.Option('candidato', help='alias de los modelos a usar con --sin-entrenar'),
            desde: str | None = typer.Option(None, help='AAAA-MM-DD: inicio del periodo de revisión; por defecto desde '
                                                        'el corte anterior (no filtra la extracción)'),
            fecha_corte: str | None = FECHA_CORTE, anio_desde: int | None = ANIO_DESDE,
            anio_hasta: int | None = ANIO_HASTA, desde_visita: str | None = DESDE_VISITA,
            hasta_visita: str | None = HASTA_VISITA) -> None:
    """La corrida semestral: extraer, cargar, entrenar ambos modelos, revisar, comparar el silencio y calcular riesgos.
    Los resultados quedan en Postgres, los Excel para la Fundación en MAIA_RAIZ/salidas y en MinIO (maia-salidas)."""
    from anomalias import operacion as OP
    from archivos import carpetas as CA
    from archivos import entregas as EN
    from clinico import modelo as AC
    from maia_comun import notificaciones as N
    from maia_comun import puntuacion as PU
    from maia_comun import sevarti_db as SDB
    from maia_comun.almacen import BUCKET_SALIDAS
    from maia_comun.puntuacion import Modelos
    from maia_entrenamiento import datos as D
    from maia_entrenamiento import entrenar as E
    from maia_entrenamiento import registro as R

    params = _parametros(fecha_corte, anio_desde, anio_hasta, desde_visita, hasta_visita)
    if not params.vacio and (fuente != Fuente.kmc or sin_extraer):
        raise typer.BadParameter('Los parámetros de extracción solo aplican a --fuente kmc sin --sin-extraer.')
    almacen, motor = _almacen(), _motor()
    f = fuente.value
    t0 = datetime.now(UTC)
    fecha_extraida = None
    if f == 'kmc' and not sin_extraer:
        _decir('=== 1. Extraer la base de la Fundación ===')
        if not params.vacio:
            _decir(f'Parámetros de extracción: {json.dumps(params.como_dict())}')
        nuevo, meta = D.extraer_kmc(params)
        fechas = SDB.cortes_en_minio(almacen, 'kmc')
        if solo_si_nuevo and fechas and SDB.fecha_corte(nuevo) <= fechas[-1]:
            _decir(f'La base no cambió (corte {SDB.fecha_corte(nuevo)}, último guardado {fechas[-1]}). Nada que hacer.')
            return
        fecha_extraida = _subir_extraccion(nuevo, meta, almacen).fecha
    elif solo_si_nuevo:
        _decir('--solo-si-nuevo solo aplica a la base real con extracción.')
    _decir('=== 2. Cargar el corte en Postgres ===')
    sev, info, _ = D.corte_local(almacen, f, fecha_extraida)   # el recién extraído (con --fecha-corte puede no ser el último)
    corte_id = SDB.guardar_en_db(motor, sev, f, info.ruta_minio, info.sha256, info.parametros, info.consulta_sha)
    extraccion = R.params_extraccion(info.parametros, info.consulta_sha)
    _decir(f'Corte {info.fecha} (id {corte_id}).')
    R.configurar()
    with tempfile.TemporaryDirectory() as tmp:
        if sin_entrenar:
            _decir(f'=== 3. Modelos registrados con alias {alias} ===')
            modelos, _, _ = _modelos_de_registro(f, alias, alias, Path(tmp))
        else:
            from maia_comun import hiperparametros as HP
            cfg_a, ajustes_a = HP.leer_y_aplicar(E.config_anomalias(None), 'anomalias', motor)
            cfg_c, ajustes_c = HP.leer_y_aplicar(D.config_clinica(f), 'clinico', motor)
            if ajustes_a or ajustes_c:
                _decir(f'Hiperparámetros ajustados: anomalías {json.dumps(ajustes_a)} · clínico {json.dumps(ajustes_c)}')
            _decir('=== 3. Entrenar el modelo de anomalías ===')
            ra = E.entrenar_anomalias(sev, f, cfg_a, extraccion=extraccion, ajustes=ajustes_a)
            _decir('=== 4. Entrenar las alertas clínicas ===')
            rc = E.entrenar_clinico(sev, f, cfg_c, extraccion=extraccion, ajustes=ajustes_c)
            _decir(f'Registrado en MLflow: {ra.registro} v{ra.version_registro} · {rc.registro} v{rc.version_registro} '
                   '(alias candidato)')
            anom, fa = OP.cargar(ra.carpeta)
            clin, fc = AC.cargar(rc.carpeta)
            modelos = Modelos(anom, fa, clin, fc, origen=f'registro a{ra.version_registro}/c{rc.version_registro}')
    _decir('=== 5. Riesgos guardados en silencio frente a lo que pasó ===')
    comparacion = _silencio_previo(motor, modelos, sev)
    _tabla('Silencio frente a lo que pasó', comparacion.round(3) if not comparacion.empty else comparacion)
    estado = CA.PROYECTO.raiz / 'interno' / 'plataforma' / f'estado_{f}.json'
    inicio = EN.periodo(estado, sev.corte, desde)
    _decir(f'=== 6. Revisión de datos y riesgos ({"desde " + str(inicio.date()) if inicio is not None else "toda la historia"}) ===')
    cid = PU.nueva_corrida(motor, 'completa', modelos, corte_id, f, sev.corte.date() if sev.corte is not None else None,
                           silencio, os.environ.get('MAIA_LGBM_DEVICE', 'cpu'))
    salidas = CA.PROYECTO.raiz / 'salidas' / 'corridas' / str(cid)
    resumen = PU.correr(motor, sev, modelos, cid, silencio=silencio, desde=inicio, carpeta_salidas=salidas,
                        notificar=lambda c: N.enviar_pendientes(motor, c), progreso=lambda t: _decir(f'  · {t}'))
    if not comparacion.empty:
        PU.marcar(motor, cid, resumen={**resumen, 'silencio_comparado': json.loads(comparacion.round(4).to_json(orient='index'))})
    for ruta in resumen.get('archivos', []):
        almacen.subir_archivo(Path(ruta), BUCKET_SALIDAS, f'corridas/{cid}/{Path(ruta).name}')
    if not silencio:
        EN.registrar(estado, sev.corte, inicio, modelos.ficha_clinica['version'])
    _tabla('Resumen de la corrida', pd.Series({k: v for k, v in resumen.items() if not isinstance(v, (dict, list))},
                                               name='valor').to_frame())
    _decir(f'\nCorrida {cid} terminada en {(datetime.now(UTC) - t0).total_seconds() / 60:.0f} min. '
           f'Excel en {salidas} y en s3://{BUCKET_SALIDAS}/corridas/{cid}/')


@app.command('silencio-retrospectivo')
def silencio_retrospectivo(corte: str = typer.Option(..., '--corte', help='fecha pasada AAAA-MM-DD'),
                           fuente: Fuente = FUENTE) -> None:
    """Entrena el modelo clínico con lo que se sabía en una fecha pasada, calcula los riesgos de los niños pendientes
    entonces y los compara con lo que pasó después. Registra las métricas en MLflow (maia-experimentos-desenlaces)."""
    import mlflow

    from archivos import carpetas as CA
    from maia_comun.metricas import nombre_metrica
    from maia_entrenamiento import datos as D
    from maia_entrenamiento import registro as R
    from maia_entrenamiento import silencio as S
    sev, info, _ = D.corte_local(_almacen(), fuente.value)
    fecha = pd.Timestamp(corte)
    if sev.corte is not None and fecha >= sev.corte:
        raise typer.BadParameter(f'La fecha debe ser anterior al corte de los datos ({sev.corte.date()}).')
    comparacion, predicciones, modelo = S.correr(sev, D.config_clinica(fuente.value), fecha)
    _tabla(f'Riesgos calculados el {fecha.date()} frente a lo que pasó hasta el {info.fecha}', comparacion.round(3))
    CA.PROYECTO.experimentos.mkdir(parents=True, exist_ok=True)
    ruta = CA.PROYECTO.experimentos / f'silencio_retrospectivo_{fuente.value}_{fecha.date()}.csv'
    comparacion.to_csv(ruta, encoding='utf-8-sig')
    R.configurar()
    R.experimento('experimentos')
    nombre_a_clave = {d.nombre: d.clave for d in modelo.cfg.desenlaces}
    with mlflow.start_run(run_name=f'silencio retrospectivo {fuente.value} {fecha.date()}'):
        mlflow.set_tags({'fuente': fuente.value, 'corte_pasado': str(fecha.date()), 'corte_datos': info.fecha,
                         'tipo': 'silencio_retrospectivo'})
        metricas = {}
        for nombre, fila in comparacion.iterrows():
            clave = nombre_a_clave.get(str(nombre), str(nombre))
            for col in ('AUC', 'riesgo_medio', 'observado', 'casos_en_riesgo_alto_pct', 'razon_riesgo_observado'):
                v = fila.get(col)
                if v is not None and pd.notna(v):
                    metricas[nombre_metrica(f'{col.lower()}__{clave}')] = float(v)
        if metricas:
            mlflow.log_metrics(metricas)
        mlflow.log_param('predicciones', len(predicciones))
        mlflow.log_artifact(str(ruta), 'tabla')
    _decir(f'\nTabla (solo agregados) en {ruta} y en MLflow.')


# ====================================================================== paquetes

@app.command()
def exportar(fuente: Fuente = FUENTE,
             modelo_anomalias: str = typer.Option('candidato', help='alias o número de versión'),
             modelo_clinico: str = typer.Option('candidato', help='alias o número de versión'),
             salida: Path | None = typer.Option(None, help='carpeta local para una copia del paquete')) -> None:
    """Arma y firma el paquete con los dos modelos y lo guarda en MinIO (maia-paquetes) y en MAIA_RAIZ/paquetes."""
    from archivos import carpetas as CA
    from maia_comun import paquete as PQ
    from maia_comun.almacen import BUCKET_PAQUETES
    from maia_comun.config import obtener
    from maia_comun.metricas import filas_metricas
    from maia_entrenamiento import registro as R
    R.configurar()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        modelos, (mva, ca, _), (mvc, cc, run_c) = _modelos_de_registro(fuente.value, modelo_anomalias,
                                                                         modelo_clinico, tmp)
        base = run_c / 'sevarti_base'
        if not base.exists():
            raise typer.BadParameter('El run del modelo clínico no trae sevarti_base: reentrene con esta versión de maia.')
        dic = next((run_c / 'diccionario').glob('*.xlsx'), None) if (run_c / 'diccionario').exists() else None
        metricas = {f'{f["metrica"]}__{f["clave"]}': round(f['valor'], 4)
                    for f in filas_metricas(None, modelos.ficha_clinica, modelos.nombre_a_clave)
                    if f['metrica'] in ('auc', 'auc_regla', 'top10', 'pr_auc')}
        ruta = PQ.armar(tmp / PQ.NOMBRE, ca, cc, base, fuente.value, obtener().maia_paquete_clave,
                        {'anomalias': {'registro': mva.name, 'version': str(mva.version), 'run_id': mva.run_id},
                         'clinico': {'registro': mvc.name, 'version': str(mvc.version), 'run_id': mvc.run_id}},
                        diccionario=dic, metricas=metricas, git_sha=R._git_sha())
        manifest = PQ.leer_manifest(ruta)
        version = manifest['version']
        almacen = _almacen()
        almacen.subir_archivo(ruta, BUCKET_PAQUETES, f'{fuente.value}/{version}/{PQ.NOMBRE}')
        local = (salida or CA.PROYECTO.raiz / 'paquetes') / fuente.value / version / PQ.NOMBRE
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(ruta.read_bytes())
    _decir(f'Paquete {version} ({fuente.value}) firmado.')
    _decir(f'  MinIO: s3://{BUCKET_PAQUETES}/{fuente.value}/{version}/{PQ.NOMBRE}')
    _decir(f'  Local: {local}')
    _decir(f'Para publicarlo: maia publicar --url https://<web>.up.railway.app --version {version}')


@app.command()
def publicar(url: str = typer.Option(..., help='URL pública del servicio web (Railway) o http://localhost:8080'),
             version: str | None = typer.Option(None, help='versión del paquete en MinIO (por defecto, la última)'),
             archivo: Path | None = typer.Option(None, help='o la ruta de un paquete.tar.gz'),
             fuente: Fuente = FUENTE,
             email: str = typer.Option(..., envvar='MAIA_ADMIN_EMAIL'),
             clave: str = typer.Option(..., envvar='MAIA_ADMIN_CLAVE', prompt=True, hide_input=True),
             activar: bool = typer.Option(True, help='activarlo después de subirlo')) -> None:
    """Sube un paquete a la API con una cuenta de administrador y (por defecto) lo activa."""
    import httpx

    from maia_comun import paquete as PQ
    from maia_comun.almacen import BUCKET_PAQUETES
    with tempfile.TemporaryDirectory() as tmp:
        if archivo is None:
            almacen = _almacen()
            if not version:   # el último exportado de esa fuente (las versiones empiezan por la fecha)
                claves = sorted(almacen.listar(BUCKET_PAQUETES, f'{fuente.value}/'))
                if not claves:
                    raise typer.BadParameter(f'No hay paquetes de "{fuente.value}" en MinIO. Primero: maia exportar')
                version = claves[-1].split('/')[1]
            archivo = almacen.bajar_archivo(BUCKET_PAQUETES, f'{fuente.value}/{version}/{PQ.NOMBRE}',
                                               Path(tmp) / PQ.NOMBRE)
        base = url.rstrip('/')
        with httpx.Client(timeout=httpx.Timeout(600, connect=20)) as h:
            r = h.post(f'{base}/api/auth/login', json={'email': email, 'clave': clave})
            if r.status_code != 200:
                raise typer.BadParameter(f'No se pudo ingresar ({r.status_code}): {r.text[:300]}')
            token = {'Authorization': f'Bearer {r.json()["acceso"]}'}
            with open(archivo, 'rb') as fh:
                r = h.post(f'{base}/api/modelos/paquetes', headers=token,
                           files={'archivo': (PQ.NOMBRE, fh, 'application/gzip')})
            if r.status_code != 200:
                raise typer.BadParameter(f'La API rechazó el paquete ({r.status_code}): {r.text[:500]}')
            subido = r.json()['version']
            _decir(f'Paquete {subido} subido.')
            if activar:
                r = h.post(f'{base}/api/modelos/paquetes/{subido}/activar', headers=token)
                if r.status_code != 200:
                    raise typer.BadParameter(f'No se pudo activar ({r.status_code}): {r.text[:300]}')
                _decir(f'Paquete {subido} activo. Ejecute la corrida de demostración desde /admin/corridas.')


# ====================================================================== programador

@app.command()
def programador(intervalo: int = typer.Option(30, min=5, help='segundos entre revisiones de la cola'),
                una_vez: bool = typer.Option(False, '--una-vez', help='atender lo pendiente una vez y salir')) -> None:
    """Servicio que ejecuta las corridas programadas o pedidas desde Administración y las aprobaciones de modelos
    (ver maia_entrenamiento/programador.py). En el servidor on-premise es el proceso del contenedor trainer."""
    from maia_entrenamiento.programador import Programador
    p = Programador(intervalo=intervalo)
    if una_vez:
        p.arrancar()
        while p.ciclo() is not None:
            pass
        return
    p.bucle()


def main() -> None:   # pragma: no cover
    sys.exit(app())


if __name__ == '__main__':   # pragma: no cover
    main()
