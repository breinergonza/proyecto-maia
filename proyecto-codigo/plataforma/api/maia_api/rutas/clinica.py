"""Vista clínica: un desenlace a 12 meses (una familia) para el grupo de niños que se elija con un filtro.

``POST /clinica/resumen`` junta lo que la pantalla pide de una vez: qué les pasó a los 12 meses (lo observado, que la
corrida guarda en ``resultados.desenlaces_observados``), la talla para la edad por visita frente a la población, el
riesgo estimado por corte y los niños con más riesgo. El grupo se elige igual que en Explorar y valen las mismas reglas
de privacidad (D46): menos de 20 niños no da cifras; una celda de 1 a 4 niños se da con su cifra y ninguna cifra se
redondea para ningún perfil (D64). Los niños individuales, con su código seudonimizado,
solo los ven el experto y el administrador, y cada lista queda en la auditoría."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from clinico import configuracion as CONFIG
from clinico import crecimiento as CR
from maia_api import poblacion as P
from maia_api.consultas import INDICADORES, corrida_de, crecimiento_por_nino, etapas, nombre_etapa
from maia_api.dependencias import CUALQUIERA, auditar, sesion
from maia_api.rutas.exploracion import Consulta, _definicion
from maia_comun import clinica as CL
from maia_comun import diccionarios as DIC
from maia_comun import muestra as M
from maia_comun.modelos_db import PERCENTIL_ALTO, Usuario
from sevarti import diccionario as D

ruta = APIRouter(prefix='/clinica', tags=['clinica'])

NINOS_LISTADOS = 25
INDICADOR_POR_DEFECTO = 'talla'
UNIDAD = 'puntaje z (desviaciones estándar)'
_SUFIJO = re.compile(r'\s*\(riesgo calculado a [^)]*\)\s*$')
_DESDE = r'\_desde\_%'


class ConsultaClinica(Consulta):
    familia: str | None = None
    indicador: str | None = None


@dataclass
class Dic:
    """Lo que dice el diccionario vigente de los desenlaces, el crecimiento y las visitas (vacío si no hay uno)."""
    desenlaces: pd.DataFrame = field(default_factory=pd.DataFrame)
    crecimiento: pd.DataFrame = field(default_factory=pd.DataFrame)
    visitas: dict[str, str] = field(default_factory=dict)

    def fila(self, familia: str) -> dict | None:
        """La fila base de la familia o, si no la hay, la primera de sus ``_desde_``."""
        if self.desenlaces.empty:
            return None
        d = self.desenlaces
        propias = d[d.clave.map(CL.familia_de) == familia].sort_values('clave', key=lambda c: c.ne(familia))
        return None if propias.empty else propias.iloc[0].to_dict()

    def visita_base(self, familia: str, mapa: dict[str, dict]) -> str | None:
        """La primera visita en que se calcula el riesgo de la familia (de sus filas que no están apagadas), con su
        nombre. Lo observado a los 12 meses se cuenta entre los niños que fueron a esa visita (es la población de la
        corrida, ``tabla_observados``), mientras la curva de talla cuenta a todos los que tienen dato en cada visita."""
        if self.desenlaces.empty:
            return None
        d = self.desenlaces
        propias = d[(d.clave.map(CL.familia_de) == familia) & (d.estado != D.APAGADO) & d.momento.notna()]
        if propias.empty:
            return None
        primera = min(propias.momento, key=lambda e: mapa.get(e, {}).get('orden', 99))
        return nombre_etapa(mapa, primera)

    def umbral(self, indicador: str) -> float:
        """El puntaje z bajo el cual el crecimiento se considera bajo (el del diccionario; si no, el de la OMS)."""
        if not self.crecimiento.empty:
            fila = self.crecimiento[self.crecimiento.indicador == indicador]
            if not fila.empty and pd.notna(fila.iloc[0].z_bajo):
                return float(fila.iloc[0].z_bajo)
        return CR.Z_BAJO


def diccionario_clinico(s: Session) -> Dic:
    v = DIC.vigente(s)
    if v is None:
        return Dic()
    try:
        d = DIC.leer(v.archivo)
    except DIC.DiccionarioInvalido:
        return Dic()
    return Dic(d.desenlaces, d.crecimiento, dict(zip(d.visitas.etapa, d.visitas.nombre, strict=False)))


def _texto(v: object) -> str | None:
    return v.strip() or None if isinstance(v, str) else None


def _mayuscula(texto: str) -> str:
    return texto[:1].upper() + texto[1:]


def _z(valor: float) -> str:
    return f'{valor:g}'.replace('-', '−').replace('.', ',')


def _describir(familia: str, dic: Dic, nombres: dict[str, str], claves: set[str]) -> dict:
    """Nombre, definición, estado e indicador de una familia, de lo que dice el diccionario (o, sin él, de lo que
    guardó la corrida). ``claves``: las que la corrida tiene en ``resultados.riesgos``. Una familia es «En uso» si su
    fila base lo es y «En prueba» si solo tiene filas ``_desde_``."""
    fila = dic.fila(familia)
    nombre = _mayuscula(_SUFIJO.sub('', _texto(fila and fila['nombre']) or nombres.get(familia) or familia))
    if fila is not None and fila['clave'] == familia:
        estado = str(fila['estado'])
    else:
        estado = D.EN_USO if fila is None and familia in claves else D.EN_PRUEBA
    indicador = None
    definicion = f'{nombre}.'
    if fila is not None and fila['regla'] == 'z_bajo' and _texto(fila['medida']):
        indicador = str(fila['medida'])
        visita = dic.visitas.get(fila['etapa'], fila['etapa'])
        definicion = (f'{INDICADORES.get(indicador, indicador)} con puntaje z menor que {_z(dic.umbral(indicador))} '
                      f'frente a la referencia de la OMS, medido a los {visita}.')
    elif fila is not None and fila['regla'] == 'percentil_bajo':
        pct = fila['percentil'] if pd.notna(fila['percentil']) else CONFIG.PERCENTIL
        definicion = (f'{nombre}: el {_z(float(pct))} % más bajo de los niños con que se entrenó el modelo '
                      f'(no hay un punto de corte clínico).')
        if nota := _texto(fila['nota']):
            definicion += f' {nota}'
    return {'clave': familia, 'nombre': nombre, 'definicion': definicion, 'estado': estado, 'indicador': indicador}


def familias_de(s: Session, corrida: int, dic: Dic) -> list[dict]:
    """Las familias priorizadas de las que la corrida tiene algo (lo observado o el riesgo de alguna de sus claves)."""
    claves = s.execute(text('SELECT DISTINCT clave, desenlace FROM resultados.riesgos WHERE corrida_id = :c'),
                       {'c': corrida}).all()
    observadas = {f for (f,) in s.execute(text('SELECT DISTINCT familia FROM resultados.desenlaces_observados '
                                               'WHERE corrida_id = :c'), {'c': corrida})}
    nombres = {CL.familia_de(clave): nombre for clave, nombre in sorted(claves, reverse=True)}
    hay = observadas | {CL.familia_de(clave) for clave, _ in claves}
    return [_describir(f, dic, nombres, {clave for clave, _ in claves}) for f in CL.FAMILIAS_PRIORIZADAS if f in hay]


def _filas(s: Session, sql: str, **p) -> list[dict]:
    return [dict(r._mapping) for r in s.execute(text(sql), p)]


def observado_de(s: Session, corrida: int, familia: str, ids: list[str] | None, n: int,
                 desde: str | None = None) -> dict | None:
    """Casos, niños con dato y sin dato de ``n`` niños (``ids``; ``None`` es todo el corte), el porcentaje de casos
    entre quienes tienen dato y el de niños sin dato entre los ``n``, de los mismos conteos. ``desde``: la visita entre
    cuyos asistentes se cuenta lo observado (``Dic.visita_base``). Sin niños con dato, nada."""
    de = ' AND sujeto = ANY(:ids)' if ids is not None else ''
    p = {'c': corrida, 'f': familia, **({'ids': ids} if ids is not None else {})}
    casos, con_dato = s.execute(text(f"""
        SELECT count(*) FILTER (WHERE valor), count(*) FROM resultados.desenlaces_observados
        WHERE corrida_id = :c AND familia = :f{de}"""), p).one()
    if not con_dato:
        return None
    sin_dato = max(n - con_dato, 0)
    return {'casos': int(casos), 'con_dato': int(con_dato),
            'sin_dato': int(sin_dato), 'pct': round(100 * casos / con_dato, 1),
            'pct_sin_dato': round(100 * sin_dato / n, 1) if n else None, 'desde': desde}


def trayectoria_de(s: Session, corrida: int, corte_id: int, indicador: str, ids: list[str] | None,
                 dic: Dic) -> dict:
    """Por visita (en orden clínico), la mediana y la mitad central del puntaje z del grupo y la mediana de la
    población, con los niños que tienen dato. Los datos improbables no cuentan. La mediana sale con cualquier número de
    niños; la mitad central (cuartiles) pide al menos 20 con dato en la visita, como toda distribución (D52): con
    menos, el cuarto y los tres cuartos dicen poco del grupo."""
    por = {'p': {'c': corrida, 'i': indicador}, 'g': {'c': corrida, 'i': indicador, 'ids': ids}}
    # una talla por niño y visita (la última válida): la mediana y los cuartiles son de niños, no de mediciones
    sql = """
        SELECT etapa, count(*) AS n, percentile_cont(0.25) WITHIN GROUP (ORDER BY z) AS p25,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY z) AS mediana,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY z) AS p75
        FROM {fuente} GROUP BY etapa"""
    propia = ' AND indicador = :i AND z IS NOT NULL'
    poblacion = {f['etapa']: f for f in _filas(s, sql.format(fuente=crecimiento_por_nino(propia)), **por['p'])}
    grupo = poblacion if ids is None else {f['etapa']: f for f in _filas(
        s, sql.format(fuente=crecimiento_por_nino(propia + ' AND sujeto = ANY(:ids)')), **por['g'])}
    mapa = etapas(s, corte_id)

    def celda(f: dict | None, completa: bool) -> dict | None:
        if f is None:
            return None
        n = int(f['n'])
        if not completa:
            return {'n': n, 'mediana': float(f['mediana'])}
        con_cuartiles = n >= P.MIN_NINOS
        return {'n': n, 'p25': float(f['p25']) if con_cuartiles else None, 'mediana': float(f['mediana']),
                'p75': float(f['p75']) if con_cuartiles else None}

    visitas = sorted(set(poblacion) | set(grupo), key=lambda e: (mapa.get(e, {}).get('orden', 99), str(e)))
    return {'indicador': indicador, 'nombre': INDICADORES[indicador], 'unidad': UNIDAD, 'referencia': 'OMS',
            'umbral': dic.umbral(indicador),
            'etapas': [{'etapa': e, 'etapa_nombre': nombre_etapa(mapa, e), 'grupo': celda(grupo.get(e), True),
                        'poblacion': celda(poblacion.get(e), False)} for e in visitas]}


def riesgo_de(s: Session, corrida: int, corte_id: int, familia: str, ids: list[str] | None, dic: Dic) -> list[dict]:
    """Por corte (visita desde la que se predice), cuántos niños del grupo tienen riesgo calculado y cuántos están en
    alerta (percentil de ``PERCENTIL_ALTO`` o más)."""
    de = ' AND sujeto = ANY(:ids)' if ids is not None else ''
    filas = _filas(s, f"""
        SELECT momento, clave, count(*) AS calculados, count(*) FILTER (WHERE percentil >= :alto) AS en_alerta
        FROM resultados.riesgos
        WHERE corrida_id = :c AND NOT silencio AND (clave = :f OR clave LIKE :l){de}
        GROUP BY momento, clave""", c=corrida, f=familia, l=familia.replace('_', r'\_') + _DESDE, alto=PERCENTIL_ALTO,
                   **({'ids': ids} if ids is not None else {}))
    mapa = etapas(s, corte_id)
    estados = dict(zip(dic.desenlaces.clave, dic.desenlaces.estado, strict=False)) if not dic.desenlaces.empty else {}
    filas.sort(key=lambda f: (mapa.get(f['momento'], {}).get('orden', 99), f['clave']))
    return [{'momento': f['momento'], 'momento_nombre': nombre_etapa(mapa, f['momento']), 'clave': f['clave'],
             'estado': estados.get(f['clave']) or CL.estado_de(f['clave']),
             'calculados': int(f['calculados']), 'en_alerta': int(f['en_alerta']),
             'pct_en_alerta': round(100 * f['en_alerta'] / f['calculados'], 1)}
            for f in filas]


def riesgo_con_modelo(s: Session, corrida: int, familia: str) -> bool:
    """¿La corrida calculó el riesgo de la familia para algún niño? Distingue «el paquete no la calcula» de «ningún niño
    del grupo tiene riesgo ahora» (se calcula solo para quienes siguen en seguimiento)."""
    return bool(_filas(s, """
        SELECT 1 AS hay FROM resultados.riesgos
        WHERE corrida_id = :c AND NOT silencio AND (clave = :f OR clave LIKE :l) LIMIT 1""",
                       c=corrida, f=familia, l=familia.replace('_', r'\_') + _DESDE))


def _ninos(s: Session, corrida: int, corte_id: int, familia: str, ids: list[str] | None, indicador: str) -> list[dict]:
    """Los ``NINOS_LISTADOS`` niños con el percentil más alto de la familia (el más alto de sus claves), con la edad
    gestacional y el último puntaje z del indicador."""
    de = ' AND sujeto = ANY(:ids)' if ids is not None else ''
    top = _filas(s, f"""
        SELECT * FROM (SELECT DISTINCT ON (sujeto) sujeto, momento, riesgo, percentil FROM resultados.riesgos
                       WHERE corrida_id = :c AND NOT silencio AND (clave = :f OR clave LIKE :l){de}
                       ORDER BY sujeto, percentil DESC) t
        ORDER BY percentil DESC, sujeto LIMIT :n""", c=corrida, f=familia, l=familia.replace('_', r'\_') + _DESDE,
                 n=NINOS_LISTADOS, **({'ids': ids} if ids is not None else {}))
    if not top:
        return []
    codigos = [f['sujeto'] for f in top]
    semanas = dict(s.execute(text('SELECT sujeto, eg_semanas FROM sevarti.sujetos WHERE corte_id = :k '
                                  'AND sujeto = ANY(:s)'), {'k': corte_id, 's': codigos}).all())
    mapa = etapas(s, corte_id)
    ultima: dict[str, tuple[int, float]] = {}
    for suj, etapa, z in s.execute(text("""
            SELECT sujeto, etapa, z FROM resultados.crecimiento WHERE corrida_id = :c AND indicador = :i
            AND z IS NOT NULL AND NOT improbable AND sujeto = ANY(:s)"""), {'c': corrida, 'i': indicador, 's': codigos}):
        orden = mapa.get(etapa, {}).get('orden', -1)
        if suj not in ultima or orden > ultima[suj][0]:
            ultima[suj] = (orden, float(z))
    return [{'sujeto': f['sujeto'], 'semanas': None if semanas.get(f['sujeto']) is None else float(semanas[f['sujeto']]),
             'momento': f['momento'], 'riesgo': float(f['riesgo']), 'percentil': float(f['percentil']),
             'ultima_z': ultima[f['sujeto']][1] if f['sujeto'] in ultima else None} for f in top]


@ruta.post('/resumen')
def resumen(consulta: ConsultaClinica, s: Session = Depends(sesion), u: Usuario = Depends(CUALQUIERA)) -> dict:
    corrida = corrida_de(s, consulta.corrida_id)
    if corrida.corte_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, 'Los datos de esa corrida ya no están en la base.')
    if consulta.indicador is not None and consulta.indicador not in INDICADORES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f'El indicador {consulta.indicador} no existe: {", ".join(INDICADORES)}.')
    dic = diccionario_clinico(s)
    familias = familias_de(s, corrida.id, dic)
    elegida = next((f for f in familias if f['clave'] == consulta.familia), None) if consulta.familia else \
        next(iter(familias), None)
    if consulta.familia and elegida is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f'No existe la familia de desenlaces {consulta.familia} en esa corrida.')
    ids = P.ids_de(s, corrida.corte_id, _definicion(s, consulta), muestreo=False)
    auditar(s, u, 'clinica.consultar', f'corrida:{corrida.id}',
            {'huella': M.huella(ids), 'n': len(ids), 'familia': elegida and elegida['clave']})
    s.commit()
    if not ids:   # un cero es un cero: ningún niño cumple, y la pantalla lo dice con esas palabras
        return {'insuficiente': True, 'vacio': True, 'ninos': 0, 'minimo': P.MIN_NINOS}
    if len(ids) < P.MIN_NINOS:
        return {'insuficiente': True, 'vacio': False, 'ninos': None, 'minimo': P.MIN_NINOS}
    total = P.n_base(s, corrida.corte_id)
    filtrado = not P.sin_filtros(_definicion(s, consulta))
    grupo = ids if filtrado else None
    familia = elegida['clave'] if elegida else None
    indicador = consulta.indicador or (elegida and elegida['indicador']) or INDICADOR_POR_DEFECTO
    ve_ninos = u.rol in ('admin', 'experto')
    desde = dic.visita_base(familia, etapas(s, corrida.corte_id)) if familia else None
    ninos = _ninos(s, corrida.id, corrida.corte_id, familia, grupo, indicador) if familia and ve_ninos else None
    if ninos is not None:
        auditar(s, u, 'clinica.ninos', f'corrida:{corrida.id}', {'familia': familia, 'ninos': len(ninos)})
        s.commit()
    return {
        'insuficiente': False, 'minimo': P.MIN_NINOS, 'corrida_id': corrida.id,
        'datos_al': (corrida.resumen or {}).get('corte') or (str(corrida.fecha_corte) if corrida.fecha_corte else None),
        'familias': familias, 'familia': familia, 'indicador': indicador,
        'grupo': {'n': int(len(ids)), 'n_total': int(total)},
        'observado': {'grupo': observado_de(s, corrida.id, familia, grupo, len(ids), desde) if familia else None,
                      'poblacion': observado_de(s, corrida.id, familia, None, total, desde) if familia else None,
                      'desde': desde},
        'trayectoria': trayectoria_de(s, corrida.id, corrida.corte_id, indicador, grupo, dic),
        'riesgo': riesgo_de(s, corrida.id, corrida.corte_id, familia, grupo, dic) if familia else [],
        'riesgo_con_modelo': riesgo_con_modelo(s, corrida.id, familia) if familia else False,
        'alerta_percentil': PERCENTIL_ALTO,
        'ninos': ninos,
    }
