"""Uso diario del modelo de anomalías.

  python -m anomalias entrenar                  valida el modelo, lo entrena con todos los datos y lo guarda
  python -m anomalias revisar [--desde FECHA]   cola de revisión de los datos que entraron desde FECHA
  python -m anomalias modelos                   los modelos guardados, el más reciente primero

Los datos salen de la base de KMC (definir KMC_PW) o, con --sevarti CARPETA, de las seis
tablas SEVARTI que entregue la app (un Parquet por tabla). Los modelos quedan en
interno/anomalias/modelos/ y la cola de revisión en salidas/revision_de_datos/. Las carpetas
entradas/retroalimentacion, salidas e interno tienen datos por paciente y no se comparten (ver archivos/carpetas.py).
La hoja ciega para los expertos y su precisión no son parte de este flujo:
python -m retroalimentacion expertos | precision.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import warnings
from pathlib import Path

import pandas as pd

from anomalias import modelo as MA
from anomalias import operacion as OP
from archivos import carpetas as CA
from archivos import entregas as EN
from archivos import libros as LB
from archivos.pantalla import mostrar
from sevarti import cargar_datos
from sevarti import contrato as SV


def entrenar(args: argparse.Namespace) -> None:
    sev = cargar_datos(args.sevarti)
    cfg = MA.Config(**json.loads(Path(args.config).read_text(encoding='utf-8'))) if args.config else MA.Config()
    validacion = None
    if not args.sin_validacion:
        print('Validando (entrena con el pasado y mide con lo más reciente)...', flush=True)
        v = OP.validar(sev, cfg, progreso=True)
        validacion = v.metricas()
        mostrar('Errores inyectados encontrados (%)', v.recall.round(1))
        mostrar('Alertas por cada 1.000 datos limpios', v.falsas.round(2))
        mostrar('Carga y errores encontrados según alpha de la capa 2 (se cambia con --config)', v.curva.round(2))
    print('Entrenando el modelo de uso diario con todos los datos...', flush=True)
    t0 = time.time()
    modelo = OP.entrenar_produccion(sev, cfg, progreso=True)
    destino = OP.guardar(modelo, CA.PROYECTO.modelos_anomalias, sev, validacion)
    print(f'\nModelo {modelo.version} guardado en {CA.PROYECTO.relativa(destino)} ({(time.time() - t0) / 60:.0f} min).')


def revisar(args: argparse.Namespace) -> None:
    modelo, ficha = OP.en_uso(args.modelo)
    estado = CA.PROYECTO.interno_anomalias / 'estado.json'
    sev = cargar_datos(args.sevarti)
    desde = EN.periodo(estado, sev.corte, args.desde)
    print(f'Modelo {ficha["version"]} (entrenado {ficha["entrenado"]}); revisando desde '
          f'{desde.date() if desde is not None else "el principio"}...', flush=True)
    t0 = time.time()
    res = modelo.puntuar(sev)
    cola = OP.cola_revision(res, sev.esquema, modelo.cfg, desde)
    grupo = res.grupo
    if desde is not None:
        grupo = grupo[pd.to_datetime(grupo.periodo) >= desde.to_period(modelo.cfg.periodo).start_time]

    nombre = (sev.corte or pd.Timestamp.now()).strftime('%Y-%m-%d')
    ruta = CA.PROYECTO.revisiones / f'{nombre}.xlsx'
    etiqueta = sev.esquema.set_index('variable').etiqueta
    nombres = SV.nombres_etapa(sev.etapas)
    periodo = f'desde el {desde.date()}' if desde is not None else 'desde el principio de la base'
    LB.escribir(LB.REVISION, ruta, {
        'Datos': cola.assign(etapa=cola.etapa.replace(nombres)),
        'Grupos': OP.grupos_legibles(grupo, sev.esquema, modelo.cfg.periodo),
        'No usados': res.rechazos.assign(etiqueta=res.rechazos.variable.map(etiqueta).fillna(res.rechazos.variable)),
    }, notas=(f'Datos que entraron {periodo}, hasta el corte del {nombre}.',))
    print(f'Puntuado en {(time.time() - t0) / 60:.1f} min.')
    mostrar('Cola de revisión por capas', OP.resumen_cola(cola))
    mostrar('Alarmas por grupo y trimestre', grupo.groupby('senal').size().rename('alarmas').to_frame())
    mostrar('Datos rechazados por contrato', res.rechazos.groupby('motivo').size().rename('datos').to_frame())
    d = OP.deriva(res, ficha)
    mostrar('Alertas frente a la validación', d.round(2))
    if d.revisar.any():
        print('\nOjo: alguna capa alerta muy distinto de lo esperado. Los datos cambiaron: miren qué pasó y reentrenen.')
    print(f'\n{len(cola):,} datos para revisar en {CA.PROYECTO.relativa(ruta)}')
    CA.PROYECTO.interno_anomalias.mkdir(parents=True, exist_ok=True)
    OP.guardar_puntajes(res, CA.PROYECTO.interno_anomalias, ficha['version'], sev.corte)  # the expert sample reuses them
    EN.registrar(estado, sev.corte, desde, ficha['version'])


def modelos(args: argparse.Namespace) -> None:
    mostrar('Modelos guardados (el primero es el que se usa)',
            OP.fichas(CA.PROYECTO.modelos_anomalias).drop(columns='carpeta'))


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog='python -m anomalias', description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--sevarti', help='carpeta con las tablas SEVARTI en Parquet (si no, la base de KMC)')
    p.add_argument('--modelo', help='carpeta de un modelo guardado (si no, el más reciente de interno/anomalias/modelos/)')
    sub = p.add_subparsers(dest='orden', required=True)
    e = sub.add_parser('entrenar', help='validar, entrenar con todo y guardar')
    e.add_argument('--sin-validacion', action='store_true', help='solo entrenar (la ficha queda sin métricas)')
    e.add_argument('--config', help='JSON con los parámetros que cambian, por ejemplo {"alpha": 0.002}')
    e.set_defaults(f=entrenar)
    r = sub.add_parser('revisar', help='cola de revisión')
    r.add_argument('--desde', help='fecha AAAA-MM-DD (si no, desde el corte de la revisión anterior; el mismo corte repite su periodo)')
    r.set_defaults(f=revisar)
    sub.add_parser('modelos', help='modelos guardados').set_defaults(f=modelos)
    args = p.parse_args(argv)
    warnings.filterwarnings('ignore', category=RuntimeWarning)
    args.f(args)


if __name__ == '__main__':
    sys.exit(main())
