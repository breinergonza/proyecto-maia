"""La corrida completa, en orden: cada vez que la Fundación actualiza la base (cada 6 meses).

  python pipeline.py                 entrena y revisa con el modelo de anomalías, entrena el clínico,
                                     compara lo guardado en silencio y calcula los riesgos
  python pipeline.py --silencio      lo mismo, pero los riesgos se guardan sin entregarlos

El modelo de anomalías va primero: las alertas clínicas usan sus reglas de limpieza. Si un paso
falla, la corrida se detiene ahí y lo anterior queda guardado. Las entregas quedan en salidas/ y lo que solo usa el sistema en interno/.

Las hojas ciegas para los expertos y los médicos no son parte de la corrida. Cuando se les
va a preguntar: python -m retroalimentacion expertos | medicos.
"""
from __future__ import annotations

import argparse
import sys
import time

from anomalias import __main__ as anomalias
from archivos import carpetas as CA
from clinico import __main__ as clinico


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--sevarti', help='carpeta con las tablas SEVARTI en Parquet (si no, la base de KMC)')
    p.add_argument('--silencio', action='store_true', help='guardar los riesgos sin entregarlos (periodo en silencio)')
    args = p.parse_args(argv)
    fuente = ['--sevarti', args.sevarti] if args.sevarti else []

    pasos = [
        ('Modelo de anomalías: validar, entrenar y guardar', anomalias.main, ['entrenar']),
        ('Modelo de anomalías: cola de revisión', anomalias.main, ['revisar']),
        ('Alertas clínicas: validar, entrenar y guardar', clinico.main, ['entrenar']),
    ]
    if CA.PROYECTO.silencio.exists():
        pasos.append(('Alertas clínicas: lo guardado en silencio frente a lo que pasó', clinico.main, ['silencio']))
    pasos.append(('Alertas clínicas: riesgos', clinico.main, ['riesgos', *(['--silencio'] if args.silencio else [])]))

    t0 = time.time()
    for i, (titulo, correr, orden) in enumerate(pasos, start=1):
        print(f'\n=== {i}/{len(pasos)}. {titulo} ===', flush=True)
        t = time.time()
        correr([*fuente, *orden])
        print(f'({(time.time() - t) / 60:.0f} min)', flush=True)
    print(f'\nCorrida completa en {(time.time() - t0) / 60:.0f} min. Resultados en salidas/.')
    print('Para las hojas de retroalimentación (opcional): python -m retroalimentacion expertos | medicos')


if __name__ == '__main__':
    sys.exit(main())
