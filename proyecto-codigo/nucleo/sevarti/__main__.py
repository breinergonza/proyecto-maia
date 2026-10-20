"""El diccionario de variables de SEVARTI.

  python -m sevarti diccionario    crea entradas/diccionario.xlsx desde la base o le agrega las variables
                                   nuevas (en estado "Por clasificar"), sin entrenar nada

Así los expertos pueden trabajar el diccionario antes de una corrida. Lee la base de KMC (definir
KMC_PW); no trae datos de pacientes. Qué significa cada hoja y columna está en las instrucciones
del propio archivo y en el README.
"""
from __future__ import annotations

import argparse
import sys

from archivos import carpetas as CA


def diccionario(args: argparse.Namespace) -> None:
    from sevarti import kmc  # needs the database driver and KMC_PW: only when it is used
    kmc.actualizar_diccionario(CA.PROYECTO.diccionario)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog='python -m sevarti', description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='orden', required=True)
    sub.add_parser('diccionario', help='crear o actualizar entradas/diccionario.xlsx desde la base').set_defaults(f=diccionario)
    args = p.parse_args(argv)
    args.f(args)


if __name__ == '__main__':
    sys.exit(main())
