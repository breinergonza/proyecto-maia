"""Anticipación (D12, D19, D20, D50): qué tan temprano avisa el modelo. Un mismo desenlace se predice desde varias
visitas (claves ``<familia>_desde_<visita>``; en readmisión, oxigenodependencia y desarrollo bajo, además, la fila
base de la familia cuenta como una visita de partida) y se comparan.

Por familia con al menos dos visitas de partida deja tres artefactos, solo agregados (D7; celdas de menos de 5 niños
omitidas, cuantiles con 20 o más):

* ``anticipacion``: por visita de partida los casos detectados y las alertas acertadas con el ``top_pct`` % de mayor
  riesgo, y qué parte de los casos se avisó al menos una visita antes (la meta de D12).
* ``metricas_por_visita``: lo mismo para los cinco porcentajes de alerta (5, 10, 20, 30 y 40 %) y el AUC de cada visita.
* ``primera_alerta``: de los casos, la primera visita en que cada niño entró al porcentaje de mayor riesgo y cuántas
  visitas de ventaja le dio; los que nunca entraron, aparte.

La alerta es por percentil dentro de cada visita (D19): el número de alertas por visita es constante; lo que cambia es
cuántos casos se detectan y cuántos se avisan antes.
"""
from __future__ import annotations

import numpy as np

from maia_comun import analitica as AN

META = 'D12: avisar al menos una visita antes del desenlace'
TOP_POR_DEFECTO = 10


def _nombre(des) -> str:
    return str(des.nombre).split(' (riesgo')[0]


def familias(preds: dict[str, dict]) -> dict[str, list[tuple[str, dict, bool]]]:
    """Familia -> [(clave, predicciones, es_la_fila_base)]. Una clave sin ``_desde_`` es de la familia si hay otras
    filas ``<clave>_desde_<visita>``; así readmisión desde la visita anterior y desde las más lejanas se comparan."""
    sal: dict[str, list[tuple[str, dict, bool]]] = {}
    for clave, d in preds.items():
        f = AN.familia_desde(clave)
        if f is not None:
            sal.setdefault(f[0], []).append((clave, d, False))
    for clave, d in preds.items():
        if AN.familia_desde(clave) is None and clave in sal:
            sal[clave].append((clave, d, True))
    return sal


def _evento(des, etapa_de_variable: dict[str, str]) -> str | None:
    """La visita en que se registra el desenlace: la «visita del desenlace» (crecimiento) o la visita de su variable."""
    etapa = getattr(des, 'etapa', None)
    if isinstance(etapa, str) and etapa:
        return etapa
    return etapa_de_variable.get(getattr(des, 'variable', None) or '')


def _miembros(partes, orden: dict[str, int], etapa_de_variable: dict[str, str]):
    """Las visitas de partida de una familia en orden de tiempo, con su visita de desenlace y ventaja."""
    evento = next((e for _, d, _ in partes if (e := _evento(d['desenlace'], etapa_de_variable))), None)
    if evento is None or evento not in orden:
        return None, []
    salida = []
    for clave, d, base in partes:
        momento = d['desenlace'].momento
        if momento not in orden:
            continue
        salida.append({'clave': clave, 'd': d, 'base': base, 'desde': momento,
                       'ventaja': int(orden[evento] - orden[momento])})
    salida.sort(key=lambda m: orden[m['desde']])
    return evento, salida


def _alerta(r: np.ndarray, top_pct: int) -> np.ndarray:
    k = max(1, int(round(len(r) * top_pct / 100)))
    alerta = np.zeros(len(r), dtype=bool)
    alerta[AN._orden(r)[:k]] = True
    return alerta


def _celda(n: int) -> int | None:
    return n if n >= AN.MIN_CELDA else None


def artefactos(preds: dict[str, dict], orden: dict[str, int], top_pct: int = TOP_POR_DEFECTO,
               etapa_de_variable: dict[str, str] | None = None) -> dict[str, dict[str, dict]]:
    """``{familia: {'anticipacion': ..., 'metricas_por_visita': ..., 'primera_alerta': ...}}`` de lo que dan
    ``analitica_clinica.predicciones`` (en memoria) y el orden de las visitas. ``etapa_de_variable`` dice en qué visita
    se registra cada variable de desenlace (el esquema); sin ella solo valen los de crecimiento, que traen su visita."""
    etapa_de_variable = etapa_de_variable or {}
    sal: dict[str, dict[str, dict]] = {}
    for familia, partes in familias(preds).items():
        evento, miembros = _miembros(partes, orden, etapa_de_variable)
        if len(miembros) < 2:      # una sola visita de partida no es una anticipación
            continue
        base = next((m for m in miembros if m['base']), None)
        nombre = _nombre((base or miembros[0])['d']['desenlace'])
        etiqueta = 'En uso' if base else 'En prueba'
        visitas, metricas, casos, avisados = [], [], set(), set()
        alertas: list[tuple[dict, set]] = []
        for m in miembros:
            d = m['d']
            y, r = np.asarray(d['y'], dtype=bool), np.asarray(d['r'], dtype=float)
            ninos = np.asarray(d['variables'].index)
            alerta = _alerta(r, top_pct)
            casos |= set(ninos[y])
            ya = set(ninos[y & alerta])
            alertas.append((m, ya))
            if m['ventaja'] >= 1:
                avisados |= ya
            comun = {'clave': m['clave'], 'desde': m['desde'], 'etapa': evento, 'ventaja_visitas': m['ventaja']}
            visitas.append({**comun, **AN.anticipacion_visita(y, r, top_pct)})
            tops = AN.metricas_top(y, AN._orden(r))[0]
            n_casos = int(y.sum())
            metricas.append({**comun, 'n': _celda(len(y)), 'casos': _celda(n_casos),
                             'auc': AN._r(AN.auc(y, r), 4) if n_casos >= AN.MIN_CELDA else None,
                             'por_top': [{k: t[k] for k in ('top_pct', 'alertas', 'casos_detectados_pct',
                                                            'alertas_acertadas_pct')} for t in tops]})
        n_casos, n_av = len(casos), len(avisados)
        ok = n_casos >= AN.MIN_CELDA
        sal[familia] = {
            'anticipacion': {
                'familia': familia, 'nombre': nombre, 'top_pct': top_pct, 'etiqueta': etiqueta, 'visitas': visitas,
                'avisados_antes': {'casos': n_casos if ok else None, 'avisados': n_av if n_av >= AN.MIN_CELDA else None,
                                   'pct': AN._r(100 * n_av / n_casos, 2) if ok else None, 'meta': META}},
            'metricas_por_visita': {'familia': familia, 'nombre': nombre, 'etiqueta': etiqueta, 'tops': list(AN.TOPS),
                                    'visitas': metricas},
            'primera_alerta': _primera_alerta(familia, nombre, etiqueta, top_pct, casos, alertas),
        }
    return AN.limpio(sal)


def _primera_alerta(familia: str, nombre: str, etiqueta: str, top_pct: int, casos: set, alertas) -> dict:
    """De cada caso, la primera visita de partida (la más temprana) en que entró al ``top_pct`` % de mayor riesgo."""
    primera: dict = {}
    for m, ya in alertas:                       # ya están en orden de tiempo
        for nino in ya:
            primera.setdefault(nino, m)
    n = len(casos)
    ok = n >= AN.MIN_CELDA
    por_visita: dict[str, int] = {}
    for nino in casos:
        m = primera.get(nino)
        if m is not None:
            por_visita[m['desde']] = por_visita.get(m['desde'], 0) + 1
    distribucion = [{'desde': m['desde'], 'ventaja_visitas': m['ventaja'],
                     'casos': _celda(por_visita.get(m['desde'], 0)) if ok else None,
                     'pct': AN._r(100 * por_visita[m['desde']] / n, 2)
                     if ok and por_visita.get(m['desde'], 0) >= AN.MIN_CELDA else None}
                    for m, _ in alertas]
    sin = n - sum(por_visita.values())
    ventajas = np.array([primera[x]['ventaja'] for x in casos if x in primera], dtype=float)
    estable = n >= AN.MIN_DISTRIBUCION and len(ventajas) >= AN.MIN_DISTRIBUCION     # D52: cuantiles con 20 o más
    return {'familia': familia, 'nombre': nombre, 'etiqueta': etiqueta, 'top_pct': top_pct,
            'casos': n if ok else None, 'distribucion': distribucion,
            'sin_alerta': {'casos': _celda(sin) if ok else None,
                           'pct': AN._r(100 * sin / n, 2) if ok and sin >= AN.MIN_CELDA else None},
            'ventaja_visitas': {'media': AN._r(float(ventajas.mean()), 2) if estable else None,
                                'mediana': AN._r(float(np.median(ventajas)), 2) if estable else None},
            'meta': META}
