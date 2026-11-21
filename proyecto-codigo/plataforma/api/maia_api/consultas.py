"""Consultas que comparten varias rutas: la corrida de referencia, los nombres de las visitas y el esquema."""
from __future__ import annotations

import re
import unicodedata

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from maia_comun.modelos_db import Corrida, Esquema, Etapa
from sevarti import contrato as SV

# los indicadores de crecimiento OMS que muestra la aplicación, con su nombre para la gente
INDICADORES = {'peso': 'Peso para la edad', 'talla': 'Talla para la edad',
               'perimetro_cefalico': 'Perímetro cefálico para la edad', 'peso_para_talla': 'Peso para la talla'}


def corrida_de(s: Session, corrida_id: int | None = None) -> Corrida:
    """La corrida pedida, o la última terminada sin errores."""
    if corrida_id is not None:
        c = s.get(Corrida, corrida_id)
        if c is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f'No existe la corrida {corrida_id}.')
        return c
    c = s.scalars(select(Corrida).where(Corrida.estado == 'ok').order_by(Corrida.id.desc())).first()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            'Todavía no hay resultados: ejecute una corrida (Administración > Corridas).')
    return c


def etapas(s: Session, corte_id: int | None) -> dict[str, dict]:
    """{etapa: {'nombre', 'orden', 'base'}} del corte (vacío si el corte ya no está en Postgres)."""
    if corte_id is None:
        return {}
    filas = s.scalars(select(Etapa).where(Etapa.corte_id == corte_id).order_by(Etapa.orden))
    return {e.etapa: {'nombre': e.nombre or e.etapa, 'orden': e.orden, 'base': e.base} for e in filas}


def nombre_etapa(mapa: dict[str, dict], etapa: str | None) -> str | None:
    if etapa is None:
        return None
    return mapa.get(etapa, {}).get('nombre', etapa)


def esquema(s: Session, corte_id: int | None) -> dict[str, dict]:
    if corte_id is None:
        return {}
    return {e.variable: e.datos for e in s.scalars(select(Esquema).where(Esquema.corte_id == corte_id))}


def sujeto_existe(s: Session, corte_id: int | None, sujeto: str) -> bool:
    if corte_id is None:
        return False
    return s.execute(text('SELECT 1 FROM sevarti.sujetos WHERE corte_id = :c AND sujeto = :s'),
                     {'c': corte_id, 's': sujeto}).first() is not None


def opciones(texto: object) -> list[dict]:
    """``'1=displasia;9=sin diagnóstico'`` → ``[{'valor': '1', 'etiqueta': 'displasia'}, ...]``."""
    if not isinstance(texto, str) or not texto.strip():
        return []
    salida = []
    for parte in texto.split(';'):
        codigo, _, etiqueta = parte.partition('=')
        if codigo.strip():
            salida.append({'valor': codigo.strip(), 'etiqueta': (etiqueta or codigo).strip()})
    return salida


_NUMERO = re.compile(r'-?\d+(\.\d+)?')


def _numero(valor: str) -> str:
    """Un número de la base como se lee: sin ".0" ni ruido de coma flotante (hasta 3 decimales), con coma decimal."""
    if not _NUMERO.fullmatch(valor.strip()):
        return valor
    n = round(float(valor), 3)
    return str(int(n)) if n.is_integer() else str(n).replace('.', ',')


def valor_legible(d: dict, valor: str) -> str:
    """El valor de una medición como lo diría el médico: la etiqueta de su categoría en el diccionario, Sí/No para lo
    booleano y los números sin ".0". ``d`` es el esquema de la variable (``esquema()``)."""
    numero = _numero(valor)
    etiquetas = {_numero(o['valor']): o['etiqueta'] for o in opciones(d.get('categorias'))}
    if numero in etiquetas:
        return etiquetas[numero]
    if d.get('tipo') == 'boolean' and numero in ('0', '1'):
        return 'Sí' if numero == '1' else 'No'
    return numero


def _sin_tildes(texto: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', texto.lower()) if unicodedata.category(c) != 'Mn')


def unidades_crecimiento(esq: dict) -> dict[tuple[str, str | None], str | None]:
    """(concepto, etapa) → la unidad en que se registró esa medida de crecimiento. El crecimiento guarda el valor tal
    como se midió (p. ej. en kilos si el diccionario dice kg), así que su unidad sale de aquí y no de una tabla fija."""
    return {(d['concepto'], d.get('etapa')): (str(d.get('unidad') or '').strip() or None)
            for d in esq.values() if isinstance(d.get('concepto'), str) and d['concepto']}


def unidad_mostrada(d: dict) -> str | None:
    """La unidad que acompaña a un valor: ninguna para una categoría o un sí/no (su etiqueta ya lo dice), ni cuando la
    etiqueta de la variable ya la nombra ("Número de controles: 1", no "1 controles")."""
    unidad = (d.get('unidad') or '').strip()
    if not unidad or d.get('tipo') in ('categorical', 'boolean'):
        return None
    if re.search(rf'(?<!\w){re.escape(_sin_tildes(unidad))}(?!\w)', _sin_tildes(str(d.get('etiqueta') or ''))):
        return None
    return unidad


_MOTIVO = re.compile(r'^(?P<texto>.*\((?P<variable>\w+)\)) = (?P<valor>.*)$')


def motivo_legible(motivo: str, esq: dict) -> str:
    """Un motivo del modelo ("Etiqueta (variable) = valor") con el valor como lo diría el médico: "Sarampión = No",
    no "= 0"; "Peso al nacer = 1.372 g", con su unidad. El núcleo ya escribe los números como se leen aquí ("1.372",
    "44,4"), así que solo se traducen los códigos de una categoría o un sí/no. La web quita después el código de la
    variable."""
    m = _MOTIVO.match(motivo)
    if not m or m['variable'] not in esq:
        return motivo
    d = esq[m['variable']]
    valor = valor_legible(d, m['valor']) if d.get('tipo') in ('categorical', 'boolean') else m['valor']
    unidad = unidad_mostrada(d)
    return f"{m['texto']} = {valor}{f' {unidad}' if unidad else ''}"


_NUMERO_SQL = "valor ~ '^-?[0-9]+([.][0-9]+)?$'"


def medidas_numericas(s: Session, corte_id: int, variables: list[str], esq: dict, sujetos: list[str] | None = None):
    """(sujeto, variable, valor): el primer valor numérico de cada niño en cada variable, sin los códigos de «no se
    hizo» que declara el diccionario (un −1 no es un peso). Sin ``sujetos``, de toda la cohorte."""
    filtro = ' AND sujeto = ANY(:s)' if sujetos is not None else ''
    codigos = {v: SV.codigos_declarados(esq.get(v, {}).get('codigos_especiales')) for v in variables}
    vistos: set[tuple[str, str]] = set()
    for suj, variable, valor in s.execute(text(
            f'SELECT sujeto, variable, valor FROM sevarti.mediciones WHERE corte_id = :c AND variable = ANY(:v) '
            f'AND {_NUMERO_SQL}{filtro} ORDER BY sujeto, variable, id'), {'c': corte_id, 'v': variables, 's': sujetos}):
        x = float(valor)
        if (suj, variable) not in vistos and x not in codigos[variable]:
            vistos.add((suj, variable))
            yield suj, variable, x
