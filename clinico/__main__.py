"""Alertas clínicas tempranas del programa canguro.

  python -m clinico entrenar                  valida, entrena y guarda en interno/clinico/modelos/
  python -m clinico riesgos [--desde FECHA]   riesgo de cada desenlace de los niños cuya siguiente visita
                                              aún no pasa, con su porqué, y crecimiento de lo medido desde FECHA
  python -m clinico riesgos --silencio        calcula y guarda los riesgos sin entregarlos (periodo en silencio)
  python -m clinico silencio                  compara lo guardado en silencio con lo que pasó después
  python -m clinico experimento               valida los desenlaces "En uso" y "En prueba" sin tocar el
                                              modelo en uso; la tabla queda en interno/clinico/experimentos/

El modelo da el riesgo de cada niño (probabilidad, posición frente a los demás y porqué). A
cuántos se les muestra lo decide quien lo presenta (la app), no el modelo.
Lo clínico (desenlaces, cómo se lee cada uno, medidas de crecimiento, curva OMS) lo configuran los expertos
en las hojas Desenlaces, Crecimiento y Curva OMS de entradas/diccionario.xlsx.
Los riesgos quedan en salidas/riesgos/. Tienen datos por niño y no se comparten (ver
archivos/carpetas.py). La hoja ciega para los médicos y su revisión no son parte de este flujo:
python -m retroalimentacion medicos | revision.
"""
from __future__ import annotations

import argparse
import sys
import time
import warnings

import pandas as pd

from anomalias import modelo as MA
from archivos import carpetas as CA
from archivos import entregas as EN
from archivos import libros as LB
from archivos.pantalla import mostrar
from clinico import configuracion as CF
from clinico import modelo as AC
from sevarti import cargar_datos
from sevarti import contrato as SV


def _tardias(sev: SV.Sevarti, cfg: AC.ConfigClinica) -> list[str]:
    tardias = AC.ModeloClinico(cfg).detectar_tardias(sev)
    if tardias:
        print(f'Variables que la base llena con retraso (no se usan): {", ".join(tardias)}', flush=True)
    return tardias


def _validar(sev: SV.Sevarti, cfg: AC.ConfigClinica, tardias: list[str]) -> tuple[pd.DataFrame, dict[str, str]]:
    """Trains on the children born earlier and measures on the most recent ones; nothing is saved."""
    print('Validando (entrena con los nacidos antes y mide con los más recientes)...', flush=True)
    tr, _, te, _ = MA.dividir_por_tiempo(sev, (0.85, 0.0, 0.15))
    modelo = AC.ModeloClinico(cfg).ajustar(tr, progreso=True, tardias=tardias)
    validacion, _, _ = AC.evaluar(modelo, te)
    return validacion, modelo.omitidos


def entrenar(args: argparse.Namespace) -> None:
    sev = cargar_datos(args.sevarti)   # first: it adds to the dictionary what it lacks
    cfg = CF.cargar()
    tardias = _tardias(sev, cfg)
    validacion = None
    if not args.sin_validacion:
        validacion, _ = _validar(sev, cfg, tardias)
        mostrar('Validación por desenlace', validacion.round(2))
    print('Entrenando con todos los datos...', flush=True)
    t0 = time.time()
    modelo = AC.ModeloClinico(cfg).ajustar(sev, progreso=True, tardias=tardias)
    destino = AC.guardar(modelo, CA.PROYECTO.modelos_clinicos, sev, validacion)
    if modelo.omitidos:
        mostrar('Desenlaces sin modelo', pd.Series(modelo.omitidos).to_frame('motivo'))
    print(f'\nModelo clínico {modelo.version} guardado en {CA.PROYECTO.relativa(destino)} ({(time.time() - t0) / 60:.0f} min).')


def riesgos(args: argparse.Namespace) -> None:
    modelo, ficha = AC.en_uso(args.modelo)
    estado = CA.PROYECTO.interno_clinico / 'estado.json'
    sev = cargar_datos(args.sevarti)
    desde = EN.periodo(estado, sev.corte, args.desde) if args.desde or not args.silencio else None
    p = modelo.preparar(sev)
    if faltan := modelo.sin_datos(sev):
        mostrar('Desenlaces sin riesgo en esta entrega', pd.Series(faltan).to_frame('motivo'))
    tabla = modelo.riesgos(p, con_motivos=not args.silencio)
    if desde is not None:
        tabla = tabla[pd.to_datetime(tabla.fecha_visita) >= desde]
    nombre = (sev.corte or pd.Timestamp.now()).strftime('%Y-%m-%d')
    CA.PROYECTO.interno_clinico.mkdir(parents=True, exist_ok=True)
    resumen = tabla.groupby('desenlace').agg(niños=('sujeto', 'size'), riesgo_medio=('riesgo', 'mean'),
                                             riesgo_mediano=('riesgo', 'median'))
    if args.silencio:
        carpeta = CA.PROYECTO.silencio
        carpeta.mkdir(exist_ok=True)
        ruta = carpeta / f'{ficha["version"]}_{nombre}.parquet'
        tabla.drop(columns='motivos').to_parquet(ruta, index=False)
        mostrar('Periodo en silencio: guardado, no se entrega', resumen.round(3))
        print(f'\nGuardado en {CA.PROYECTO.relativa(ruta)}. Con "python -m clinico silencio" se compara después.')
        return
    crecimiento = AC.crecimiento_desde(modelo, p, desde)
    tabla = tabla.sort_values(['desenlace', 'riesgo'], ascending=[True, False])
    ruta = CA.PROYECTO.riesgos / f'{nombre}.xlsx'
    periodo = f'visitas desde el {desde.date()}' if desde is not None else 'todas las visitas'
    nombres = SV.nombres_etapa(sev.etapas)
    LB.escribir(LB.RIESGOS, ruta, {
        'Riesgo': tabla.assign(riesgo=100 * tabla.riesgo, momento=tabla.momento.replace(nombres),
                               fecha_visita=pd.to_datetime(tabla.fecha_visita).dt.date,
                               motivos=tabla.motivos.str.replace('; ', '\n')),
        'Crecimiento': crecimiento.assign(etapa=crecimiento.etapa.replace(nombres),
                                          concepto=crecimiento.concepto.str.replace('_', ' ')),
        'Resumen': (100 * resumen[['riesgo_medio', 'riesgo_mediano']]).assign(niños=resumen.niños).reset_index(),
    }, notas=(f'Corte del {nombre}, {periodo}. Modelo clínico {ficha["version"]}.',))
    mostrar('Riesgo por desenlace', resumen.round(3))
    mostrar('Crecimiento fuera de la curva', crecimiento.groupby(['concepto', 'motivo']).size().rename('datos').to_frame())
    print(f'\n{tabla.sujeto.nunique():,} niños con riesgo calculado en {CA.PROYECTO.relativa(ruta)}')
    EN.registrar(estado, sev.corte, desde, ficha['version'])


def silencio(args: argparse.Namespace) -> None:
    modelo, _ = AC.en_uso(args.modelo)
    archivos = sorted(CA.PROYECTO.silencio.glob('*.parquet'))
    if not archivos:
        print('No hay riesgos guardados en silencio. Primero: python -m clinico riesgos --silencio')
        return
    guardados = pd.concat([pd.read_parquet(a) for a in archivos]).drop_duplicates(['sujeto', 'clave'])
    p = modelo.preparar(cargar_datos(args.sevarti))
    mostrar('Riesgos guardados en silencio frente a lo que pasó', AC.comparar_silencio(modelo, p, guardados).round(2))


def experimento(args: argparse.Namespace) -> None:
    sev = cargar_datos(args.sevarti)
    cfg = CF.cargar(prueba=True)
    validacion, omitidos = _validar(sev, cfg, _tardias(sev, cfg))
    mostrar('Validación por desenlace (experimento)', validacion.round(2))
    if omitidos:
        mostrar('Desenlaces sin modelo', pd.Series(omitidos).to_frame('motivo'))
    nombres = {d.clave: d.nombre for d in cfg.desenlaces}
    sin_modelo = [(nombres.get(clave, clave), motivo) for clave, motivo in omitidos.items()]
    tabla = pd.concat([validacion.reset_index(), pd.DataFrame(sin_modelo, columns=['desenlace', 'sin modelo'])],
                      ignore_index=True)
    CA.PROYECTO.experimentos.mkdir(parents=True, exist_ok=True)
    ruta = CA.PROYECTO.experimentos / f'{(sev.corte or pd.Timestamp.now()).strftime("%Y-%m-%d")}.csv'
    tabla.to_csv(ruta, index=False, encoding='utf-8-sig')   # aggregates only: no child is in it
    print(f'\nLa tabla quedó en {CA.PROYECTO.relativa(ruta)}. El modelo en uso no cambió.')


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog='python -m clinico', description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--sevarti', help='carpeta con las tablas SEVARTI en Parquet (si no, la base de KMC)')
    p.add_argument('--modelo', help='carpeta de un modelo clínico (si no, el más reciente)')
    sub = p.add_subparsers(dest='orden', required=True)
    e = sub.add_parser('entrenar', help='validar, entrenar con todo y guardar')
    e.add_argument('--sin-validacion', action='store_true')
    e.set_defaults(f=entrenar)
    a = sub.add_parser('riesgos', help='riesgo de los niños que esperan su siguiente visita')
    a.add_argument('--desde', help='fecha AAAA-MM-DD de la visita (si no, desde el corte de la entrega anterior; el mismo corte repite su periodo)')
    a.add_argument('--silencio', action='store_true', help='guardar sin entregar, para compararlo después')
    a.set_defaults(f=riesgos)
    sub.add_parser('silencio', help='comparar lo guardado en silencio con lo que pasó').set_defaults(f=silencio)
    sub.add_parser('experimento', help='validar los desenlaces en prueba sin tocar el modelo en uso').set_defaults(f=experimento)
    args = p.parse_args(argv)
    warnings.filterwarnings('ignore', category=RuntimeWarning)
    args.f(args)


if __name__ == '__main__':
    sys.exit(main())
