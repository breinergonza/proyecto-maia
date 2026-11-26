"""Perfiles reales al nacer (versión de investigación, no conectada a pantallas).

Agrupa a los niños por sus covariables basales (numéricas y categóricas) con distancia de Gower y
k-medoides (PAM simple) sobre la matriz precomputada. El número de
perfiles k (2 a 6) se elige por silueta y se valida por remuestreo (acuerdo ARI > 0,7). Cada perfil
exige al menos 20 niños (D52). El resultado agregado no trae datos por niño.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.metrics import adjusted_rand_score, silhouette_score

MIN_PERFIL = 20       # D52
UMBRAL_ARI = 0.7
K_MIN, K_MAX = 2, 6
MAX_CATEGORIAS = 12   # más categorías que esto se considera texto libre y se descarta
MAX_AJUSTE = 1500     # tope de niños para la matriz de distancias (n^2)
REMUESTREOS = 10


@dataclass
class ModeloPerfiles:
    """Modelo ajustado. `medoides` guarda filas de covariables de referencia (uso interno de `asignar`);
    lo que se muestra o exporta es `resumen()`, que solo trae agregados."""
    variables: list[str]
    tipos: dict[str, str]                 # 'num' | 'cat'
    rangos: dict[str, float]              # rango de cada variable numérica, para la distancia de Gower
    medoides: list[dict]
    tamanos: list[int]
    k: int | None
    silueta: float | None
    ari: float | None
    estable: bool
    motivo: str | None = None
    candidatos: dict[int, float] = field(default_factory=dict)

    def resumen(self) -> dict:
        return {'k': self.k, 'silueta': self.silueta, 'ari': self.ari, 'estable': self.estable,
                'motivo': self.motivo, 'variables': self.variables,
                'perfiles': [{'id': i, 'n': n} for i, n in enumerate(self.tamanos)],
                'silueta_por_k': {str(k): v for k, v in self.candidatos.items()}}


def _tabla_basal(sev, variables: list[str] | None) -> tuple[pd.DataFrame, dict[str, str]]:
    """Una fila por niño: eg_semanas más las variables basales (o las pedidas)."""
    es = sev.esquema
    if variables is None:
        variables = list(es[es.rol == 'basal'].variable)
    tipo_esq = dict(zip(es.variable, es.tipo))
    base = sev.sujetos.set_index('sujeto')
    tabla = pd.DataFrame(index=base.index)
    tipos: dict[str, str] = {}
    if 'eg_semanas' in base:
        tabla['eg_semanas'] = pd.to_numeric(base.eg_semanas, errors='coerce')
        tipos['eg_semanas'] = 'num'
    med = sev.mediciones
    for v in variables:
        if v in tipos or v not in tipo_esq:
            continue
        sub = med[med.variable == v].drop_duplicates('sujeto').set_index('sujeto').valor
        if tipo_esq[v] == 'numeric':
            col = pd.to_numeric(sub, errors='coerce')
            tipo = 'num'
        else:
            col = sub.astype(object).where(sub.notna())
            if col.nunique() > MAX_CATEGORIAS:
                continue
            tipo = 'cat'
        if col.notna().mean() < 0.5 or (tipo == 'num' and col.nunique() < 2):
            continue  # muy incompleta o constante: no aporta
        tabla[v] = col.reindex(tabla.index)
        tipos[v] = tipo
    return tabla[list(tipos)], tipos


def _gower(a: pd.DataFrame, b: pd.DataFrame, tipos: dict[str, str], rangos: dict[str, float]) -> np.ndarray:
    """Distancia de Gower entre filas de `a` y de `b`; las variables faltantes en cualquiera se omiten."""
    num = np.zeros((len(a), len(b)))
    den = np.zeros((len(a), len(b)))
    for v, t in tipos.items():
        x, y = a[v].to_numpy(), b[v].to_numpy()
        ok = (~pd.isna(x))[:, None] & (~pd.isna(y))[None, :]
        if t == 'num':
            d = np.abs(x.astype(float)[:, None] - y.astype(float)[None, :]) / rangos[v]
        else:
            d = (x[:, None] != y[None, :]).astype(float)
        num += np.where(ok, d, 0.0)
        den += ok
    return np.where(den > 0, num / np.maximum(den, 1), 1.0)


def _agrupar(dist: np.ndarray, k: int) -> np.ndarray:
    """k-medoides simple (iteración tipo Voronoi, inicio BUILD determinista): da grupos más parejos que el
    enlace jerárquico, que tiende a aislar casos raros."""
    n = len(dist)
    med = [int(np.argmin(dist.sum(axis=1)))]
    while len(med) < k:  # BUILD: el siguiente medoide es el que más reduce la distancia total
        actual = dist[:, med].min(axis=1)
        ganancia = np.maximum(actual[:, None] - dist, 0).sum(axis=0)
        ganancia[med] = -1
        med.append(int(np.argmax(ganancia)))
    lab = np.argmin(dist[:, med], axis=1)
    for _ in range(50):
        nuevos = [_medoide(dist, np.flatnonzero(lab == c)) if (lab == c).any() else med[c] for c in range(k)]
        lab2 = np.argmin(dist[:, nuevos], axis=1)
        if nuevos == med and (lab2 == lab).all():
            break
        med, lab = nuevos, lab2
    return lab if len(np.unique(lab)) == k else np.zeros(n, dtype=int)


def _medoide(dist: np.ndarray, idx: np.ndarray) -> int:
    sub = dist[np.ix_(idx, idx)]
    return int(idx[np.argmin(sub.sum(axis=1))])


def perfil_al_nacer(sev, variables: list[str] | None = None, k: int | None = None, semilla: int = 0) -> ModeloPerfiles:
    """Ajusta los perfiles reales. Si `k` es None se elige por silueta entre 2 y 6.

    Solo se aceptan particiones con >= 20 niños en cada perfil. `estable` es True si el acuerdo medio (ARI)
    entre la partición completa y las de submuestras del 80 % supera 0,7.
    """
    rng = np.random.default_rng(semilla)
    tabla, tipos = _tabla_basal(sev, variables)
    vacio = dict(variables=list(tipos), tipos=tipos, rangos={}, medoides=[], tamanos=[], k=None, silueta=None,
                 ari=None, estable=False)
    if len(tabla) < 2 * MIN_PERFIL or not tipos:
        return ModeloPerfiles(**vacio, motivo='cohorte demasiado pequeña')
    if len(tabla) > MAX_AJUSTE:
        tabla = tabla.iloc[np.sort(rng.choice(len(tabla), MAX_AJUSTE, replace=False))]
    rangos = {v: float(tabla[v].max() - tabla[v].min()) or 1.0 for v, t in tipos.items() if t == 'num'}
    dist = _gower(tabla, tabla, tipos, rangos)
    np.fill_diagonal(dist, 0.0)

    ks = [k] if k else list(range(K_MIN, K_MAX + 1))
    candidatos: dict[int, float] = {}
    etiquetas: dict[int, np.ndarray] = {}
    for kk in ks:
        lab = _agrupar(dist, kk)
        if np.bincount(lab).min() < MIN_PERFIL:
            continue  # D52: ningún perfil con menos de 20 niños
        candidatos[kk] = float(silhouette_score(dist, lab, metric='precomputed'))
        etiquetas[kk] = lab
    vacio['rangos'] = rangos
    if not candidatos:
        return ModeloPerfiles(**vacio, motivo='ninguna partición con al menos 20 niños por perfil')
    mejor = max(candidatos, key=candidatos.get)
    lab = etiquetas[mejor]

    aris = []
    n = len(tabla)
    for _ in range(REMUESTREOS):
        sub = np.sort(rng.choice(n, int(0.8 * n), replace=False))
        aris.append(adjusted_rand_score(lab[sub], _agrupar(dist[np.ix_(sub, sub)], mejor)))
    ari = float(np.mean(aris))

    medoides, tamanos = [], []
    for c in range(mejor):
        idx = np.flatnonzero(lab == c)
        fila = tabla.iloc[_medoide(dist, idx)]
        medoides.append({v: (None if pd.isna(x) else (float(x) if tipos[v] == 'num' else x)) for v, x in fila.items()})
        tamanos.append(int(len(idx)))
    return ModeloPerfiles(variables=list(tipos), tipos=tipos, rangos=rangos, medoides=medoides, tamanos=tamanos,
                          k=mejor, silueta=candidatos[mejor], ari=ari, estable=bool(ari > UMBRAL_ARI),
                          candidatos=candidatos)


def asignar(modelo: ModeloPerfiles, nino: dict) -> dict:
    """Asigna un niño ({variable: valor}) al perfil de medoide más cercano.

    La probabilidad es aproximada: pesos proporcionales a 1/distancia² normalizados.
    """
    if not modelo.medoides:
        return {'perfil': None, 'distancia': None, 'probabilidad': None, 'probabilidades': []}
    fila = pd.DataFrame([{v: nino.get(v) for v in modelo.variables}])
    for v, t in modelo.tipos.items():
        if t == 'num':
            fila[v] = pd.to_numeric(fila[v], errors='coerce')
    ref = pd.DataFrame(modelo.medoides)
    d = _gower(fila, ref, modelo.tipos, modelo.rangos)[0]
    w = 1.0 / np.maximum(d, 1e-6) ** 2
    p = w / w.sum()
    i = int(np.argmin(d))
    return {'perfil': i, 'distancia': float(d[i]), 'probabilidad': float(p[i]),
            'probabilidades': [float(x) for x in p]}
