"""Perfiles provisionales al nacer (D15): edad gestacional y clasificación de Lubchenco.

Son etiquetas para chips y correos. Nunca llevan valores clínicos numéricos (D10). Los resúmenes agregados dan
la cifra de cada grupo, también cuando son de 1 a 4 niños.
"""
from __future__ import annotations

import math
import re

import pandas as pd

VARIABLE_LUBCHENCO = 'ern_lubchencofenton'

ETIQUETAS_EG = {
    'extremo': 'Prematuro extremo',
    'muy_prematuro': 'Muy prematuro',
    'moderado_tardio': 'Prematuro moderado a tardío',
    'a_termino': 'A término',
}
ETIQUETAS_LUBCHENCO = {'adecuado': 'Peso adecuado', 'pequeno': 'Pequeño para la edad', 'grande': 'Grande para la edad'}

#: Cómo se leen las siglas de Lubchenco en pantalla: el texto completo y, al final, la sigla.
ETIQUETA_VARIABLE_LUBCHENCO = 'Clasificación de Lubchenco según la edad gestacional y el peso al nacer'
LUBCHENCO_COMPLETO = {
    'PTAEG': 'Pretérmino, adecuado para la edad gestacional (PTAEG)',
    'PTPEG': 'Pretérmino, pequeño para la edad gestacional (PTPEG)',
    'PTGEG': 'Pretérmino, grande para la edad gestacional (PTGEG)',
    'ATAEG': 'A término, adecuado para la edad gestacional (ATAEG)',
    'ATPEG': 'A término, pequeño para la edad gestacional (ATPEG)',
    'ATGEG': 'A término, grande para la edad gestacional (ATGEG)',
    'ATBPN': 'A término, bajo peso al nacer (ATBPN)',
    'POSTTPEG': 'Postérmino, pequeño para la edad gestacional (PostTPEG)',
    'POSTTAEG': 'Postérmino, adecuado para la edad gestacional (PostTAEG)',
    'POSTTGEG': 'Postérmino, grande para la edad gestacional (PostTGEG)',
}


def lubchenco_completo(etiqueta: str) -> str:
    """La etiqueta de una categoría de Lubchenco con su texto completo; las que no son una sigla conocida quedan igual."""
    return LUBCHENCO_COMPLETO.get(str(etiqueta).strip().upper(), etiqueta)


# Códigos del diccionario: 1=PTAEG;2=PTPEG;3=PTGEG;4=ATPEG;5=ATBPN;7=PostTPEG (el 6 se toma como A término adecuado).
_CODIGOS_LUBCHENCO = {1: 'adecuado', 2: 'pequeno', 3: 'grande', 4: 'pequeno', 5: 'pequeno', 6: 'adecuado', 7: 'pequeno'}


def _es_nulo(v) -> bool:
    if v is None:
        return True
    try:
        return bool(pd.isna(v))
    except (TypeError, ValueError):
        return False


def categoria_eg(eg_semanas) -> str | None:
    """Categoría por semanas de gestación; None si falta o no es un número."""
    if _es_nulo(eg_semanas):
        return None
    try:
        eg = float(eg_semanas)
    except (TypeError, ValueError):
        return None
    if math.isnan(eg):
        return None
    if eg < 28:
        return 'extremo'
    if eg < 32:
        return 'muy_prematuro'
    if eg < 37:
        return 'moderado_tardio'
    return 'a_termino'


def categoria_lubchenco(valor) -> str | None:
    """Normaliza el código (numérico o sigla) a 'adecuado' | 'pequeno' | 'grande'; None si falta o no se reconoce."""
    if _es_nulo(valor):
        return None
    if isinstance(valor, str):
        t = valor.strip().upper()
        if re.fullmatch(r'\d+(\.0+)?', t):
            return _CODIGOS_LUBCHENCO.get(int(float(t)))
        if t in ('ADECUADO', 'AEG'):
            return 'adecuado'
        if t in ('PEQUENO', 'PEQUEÑO', 'PEG', 'BPN'):
            return 'pequeno'
        if t in ('GRANDE', 'GEG'):
            return 'grande'
        if t.endswith('PEG') or t.endswith('BPN'):
            return 'pequeno'
        if t.endswith('GEG'):
            return 'grande'
        if t.endswith('AEG'):
            return 'adecuado'
        return None
    try:
        return _CODIGOS_LUBCHENCO.get(int(float(valor)))
    except (TypeError, ValueError):
        return None


def perfil_provisional(eg_semanas, lubchenco, visita: str | None = None) -> dict:
    """Etiqueta de perfil para chips y correo. `etiqueta_corta` no lleva números clínicos (D10)."""
    eg = categoria_eg(eg_semanas)
    lub = categoria_lubchenco(lubchenco)
    partes = [p for p in (ETIQUETAS_EG.get(eg), ETIQUETAS_LUBCHENCO.get(lub)) if p]
    return {
        'eg': eg, 'eg_etiqueta': ETIQUETAS_EG.get(eg),
        'lubchenco': lub, 'lubchenco_etiqueta': ETIQUETAS_LUBCHENCO.get(lub),
        'visita': visita,
        'etiqueta_corta': ' · '.join(partes) if partes else 'Sin clasificar',
    }


def _lubchenco_por_sujeto(sev) -> dict:
    med = sev.mediciones
    sub = med[med.variable == VARIABLE_LUBCHENCO]
    return dict(zip(sub.sujeto, sub.valor)) if len(sub) else {}


def perfiles_por_ninos(sev, visita: str | None = None) -> dict[str, dict]:
    """{sujeto: perfil_provisional} para todos los niños de un Sevarti."""
    lub = _lubchenco_por_sujeto(sev)
    return {s: perfil_provisional(eg, lub.get(s), visita) for s, eg in zip(sev.sujetos.sujeto, sev.sujetos.eg_semanas)}


def resumen_perfiles(sev, riesgos: pd.DataFrame | None = None) -> dict:
    """Conteo agregado por categoría y, si se pasa `riesgos` (columnas `sujeto` y `evento` 0/1), tasa de eventos.

    Cada grupo sale con su `n`, también si son pocos niños; la `tasa` es `None` si ninguno tiene el dato.
    """
    perfiles = pd.DataFrame.from_dict(perfiles_por_ninos(sev), orient='index', columns=['eg', 'lubchenco'])
    if riesgos is not None and len(riesgos):
        evento = riesgos.drop_duplicates('sujeto').set_index('sujeto')['evento'].astype(float)
        perfiles['evento'] = evento.reindex(perfiles.index)

    def bloque(col: str, etiquetas: dict) -> list[dict]:
        filas = []
        for cat, etiqueta in etiquetas.items():
            g = perfiles[perfiles[col] == cat] if len(perfiles) else perfiles
            tasa = float(g.evento.mean()) if 'evento' in g and g.evento.notna().any() else None
            filas.append({'categoria': cat, 'etiqueta': etiqueta, 'n': len(g), 'tasa': tasa})
        return filas

    return {'eg': bloque('eg', ETIQUETAS_EG), 'lubchenco': bloque('lubchenco', ETIQUETAS_LUBCHENCO)}
