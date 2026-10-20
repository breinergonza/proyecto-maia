"""Retroalimentación de expertos y médicos. Es opcional y no es parte de la corrida del semestre
(pipeline.py): se hace cuando se les va a preguntar.

  python -m retroalimentacion expertos         hoja ciega para que los expertos marquen qué datos son errores
  python -m retroalimentacion precision [HOJA] qué tan seguido acierta cada capa, con la hoja ya respondida
  python -m retroalimentacion medicos          hoja ciega para que los médicos digan qué niños les preocupan
  python -m retroalimentacion revision [HOJA]  si los niños de riesgo alto les preocupan más que el resto

Las hojas salen de los modelos ya guardados (primero, la corrida del semestre) y quedan en
entradas/retroalimentacion/, donde se dejan respondidas. La clave de cada hoja, que dice
cuáles tienen alerta, queda aparte, en interno/claves/: no se le pasa a quien responde.
Los datos salen de la base de KMC (definir KMC_PW) o, con --sevarti CARPETA, de las tablas SEVARTI.
"""
from __future__ import annotations

import argparse
import sys
import warnings
from pathlib import Path

import pandas as pd

from anomalias import operacion as OP
from archivos import carpetas as CA
from archivos import libros as LB
from archivos.pantalla import mostrar
from clinico import modelo as AC
from retroalimentacion import expertos, medicos
from sevarti import cargar_datos
from sevarti import contrato as SV


def _hoja_expertos(version: str) -> Path:
    return CA.PROYECTO.para_llenar / f'expertos_{version}.xlsx'


def _clave_expertos(version: str) -> Path:
    return CA.PROYECTO.claves / f'expertos_{version}.csv'


def _hoja_medicos(version: str) -> Path:
    return CA.PROYECTO.para_llenar / f'medicos_{version}.xlsx'


def _clave_medicos(version: str) -> Path:
    return CA.PROYECTO.claves / f'medicos_{version}.csv'


def _guardar_clave(clave: pd.DataFrame, ruta: Path) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    clave.to_csv(ruta, index=False)


def muestra_expertos(args: argparse.Namespace) -> None:
    modelo, ficha = OP.en_uso(args.modelo)
    sev = cargar_datos(args.sevarti)
    datos = OP.leer_puntajes(CA.PROYECTO.interno_anomalias, ficha['version'], sev.corte)
    if datos is None:
        print('No hay puntajes de una revisión con este modelo y estos datos: puntuando...', flush=True)
        datos = modelo.puntuar(sev).datos
    else:
        print('Usando los puntajes de la última revisión (mismo modelo, mismos datos).', flush=True)
    nombres = SV.nombres_etapa(sev.etapas)
    hoja, clave = expertos.muestra_expertos(datos, sev.esquema, args.por_capa, args.control, args.semilla, nombres)
    ruta = _hoja_expertos(ficha['version'])
    LB.escribir(LB.EXPERTOS, ruta, {'Datos': hoja.assign(etapa=hoja.etapa.replace(nombres))})
    clave_ruta = _clave_expertos(ficha['version'])
    _guardar_clave(clave, clave_ruta)
    print(f'{len(hoja)} datos en {CA.PROYECTO.relativa(ruta)}. Los expertos responden "¿Es un error?" sin saber cuáles '
          f'alertaron; el archivo respondido se deja en el mismo lugar. La clave queda aparte, en '
          f'{CA.PROYECTO.relativa(clave_ruta.parent)}.')


def precision(args: argparse.Namespace) -> None:
    if args.hoja:
        hoja_ruta = Path(args.hoja)
        version = hoja_ruta.stem.removeprefix('expertos_')
    else:
        _, ficha = OP.en_uso(args.modelo)
        version = ficha['version']
        hoja_ruta = _hoja_expertos(version)
    clave = pd.read_csv(_clave_expertos(version))
    tabla = expertos.medir_precision(LB.leer(LB.EXPERTOS, hoja_ruta, 'Datos'), clave)
    mostrar('Porcentaje de datos que los expertos marcaron como error', tabla.round(1))


def muestra_medicos(args: argparse.Namespace) -> None:
    modelo, ficha = AC.en_uso(args.modelo)
    sev = cargar_datos(args.sevarti)
    p = modelo.preparar(sev)
    hoja, clave = medicos.muestra_medicos(modelo, p, modelo.riesgos(p, con_motivos=False), args.por_grupo, args.semilla)
    ruta = _hoja_medicos(ficha['version'])
    LB.escribir(LB.MEDICOS, ruta, {'Niños': hoja.assign(visita=hoja.visita.replace(SV.nombres_etapa(sev.etapas)),
                                                        datos_del_nino=hoja.datos_del_nino.str.replace('; ', '\n'))})
    clave_ruta = _clave_medicos(ficha['version'])
    _guardar_clave(clave, clave_ruta)
    print(f'{len(hoja)} filas en {CA.PROYECTO.relativa(ruta)}. Los médicos responden "¿Le preocupa?" sin saber cuáles '
          f'niños tienen riesgo alto; el archivo respondido se deja en el mismo lugar. La clave queda aparte, en '
          f'{CA.PROYECTO.relativa(clave_ruta.parent)}.')


def revision(args: argparse.Namespace) -> None:
    if args.hoja:
        hoja_ruta = Path(args.hoja)
        version = hoja_ruta.stem.removeprefix('medicos_')
    else:
        _, ficha = AC.en_uso(args.modelo)
        version = ficha['version']
        hoja_ruta = _hoja_medicos(version)
    clave = pd.read_csv(_clave_medicos(version))
    tabla = medicos.medir_revision(LB.leer(LB.MEDICOS, hoja_ruta, 'Niños'), clave)
    mostrar('Niños que preocuparon a los médicos (%)', tabla.round(1))


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog='python -m retroalimentacion', description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--sevarti', help='carpeta con las tablas SEVARTI en Parquet (si no, la base de KMC)')
    sub = p.add_subparsers(dest='orden', required=True)

    def con_modelo(parser: argparse.ArgumentParser, cual: str, donde: str) -> argparse.ArgumentParser:
        parser.add_argument('--modelo', help=f'carpeta de un modelo {cual} (si no, el más reciente de {donde})')
        return parser

    de_anomalias, clinico = 'de anomalías', 'clínico'
    e = con_modelo(sub.add_parser('expertos', help='hoja ciega para expertos'), de_anomalias, 'interno/anomalias/modelos/')
    e.add_argument('--por-capa', type=int, default=60)
    e.add_argument('--control', type=int, default=120, help='datos sin alerta en la muestra')
    e.add_argument('--semilla', type=int, default=0)
    e.set_defaults(f=muestra_expertos)
    c = con_modelo(sub.add_parser('precision', help='medir la precisión con la hoja marcada'),
                   de_anomalias, 'interno/anomalias/modelos/')
    c.add_argument('hoja', nargs='?', help='la hoja respondida (si no, la del modelo en uso en entradas/retroalimentacion/)')
    c.set_defaults(f=precision)
    m = con_modelo(sub.add_parser('medicos', help='hoja ciega para médicos'), clinico, 'interno/clinico/modelos/')
    m.add_argument('--por-grupo', type=int, default=20, help='niños de riesgo alto y del resto por desenlace')
    m.add_argument('--semilla', type=int, default=0)
    m.set_defaults(f=muestra_medicos)
    r = con_modelo(sub.add_parser('revision', help='medir la hoja marcada por los médicos'),
                   clinico, 'interno/clinico/modelos/')
    r.add_argument('hoja', nargs='?', help='la hoja respondida (si no, la del modelo en uso en entradas/retroalimentacion/)')
    r.set_defaults(f=revision)
    args = p.parse_args(argv)
    warnings.filterwarnings('ignore', category=RuntimeWarning)
    args.f(args)


if __name__ == '__main__':
    sys.exit(main())
