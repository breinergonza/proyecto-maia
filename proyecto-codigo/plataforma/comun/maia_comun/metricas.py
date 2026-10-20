"""Métricas agregadas de los modelos, con nombres válidos para MLflow y para la tabla resultados.metricas_modelo.

* Anomalías: detectados_pct__{tipo}__{capa}, falsas_por_1000__{capa}, alpha_{a}__{columna}...
* Clínico: auc__{clave}, auc_regla__{clave}, top10__{clave}, pr_auc__{clave}, calibracion__{clave}...
"""
from __future__ import annotations

import re

import pandas as pd


def nombre_metrica(texto: str) -> str:
    """MLflow acepta letras, números, '_', '-', '.', ' ', ':' y '/'."""
    t = texto.replace('%', 'pct').replace('(', '').replace(')', '').replace(',', '')
    t = re.sub(r'[^\w\-. :/]', '_', t)
    return re.sub(r' +', ' ', t).strip('_ ')


def _numero(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and abs(f) != float('inf') else None


def metricas_anomalias(validacion: dict | None) -> dict[str, float]:
    if not validacion:
        return {}
    m: dict[str, float] = {}
    for tipo, capas in (validacion.get('recall_pct') or {}).items():
        for capa, v in capas.items():
            m[nombre_metrica(f'detectados_pct__{tipo}__{capa}')] = v
    for capa, v in (validacion.get('alertas_por_1000_limpios') or {}).items():
        m[nombre_metrica(f'falsas_por_1000__{capa}')] = v
    for capa, v in (validacion.get('alertas_por_1000_prueba') or {}).items():
        m[nombre_metrica(f'alertas_por_1000_prueba__{capa}')] = v
    for alpha, fila in (validacion.get('curva_alpha') or {}).items():
        for col, v in fila.items():
            m[nombre_metrica(f'alpha_{alpha}__{col}')] = v
    if 'minutos_ajuste' in validacion:
        m['minutos_ajuste'] = validacion['minutos_ajuste']
    return {k: f for k, v in m.items() if (f := _numero(v)) is not None}


COLUMNAS_CLINICAS = {
    'AUC': 'auc', 'AUC regla simple': 'auc_regla', 'precisión promedio': 'pr_auc',
    'casos en el riesgo más alto (%)': 'top10', 'casos en el riesgo más alto, regla simple (%)': 'top10_regla',
    'del riesgo más alto, con el evento (%)': 'precision_top10', 'niños': 'ninos', 'casos': 'casos',
    '% casos': 'pct_casos',
}


def metricas_clinicas(tabla: pd.DataFrame | None, calibraciones: dict[str, pd.DataFrame] | None,
                      nombre_a_clave: dict[str, str]) -> dict[str, float]:
    """``auc__{clave}``, ``auc_regla__{clave}``, ``top10__{clave}``, ``pr_auc__{clave}``, ``calibracion__{clave}``..."""
    m: dict[str, float] = {}
    if tabla is not None and not tabla.empty:
        for nombre, fila in tabla.iterrows():
            clave = nombre_a_clave.get(str(nombre), str(nombre))
            for col, corto in COLUMNAS_CLINICAS.items():
                if col in fila and (v := _numero(fila[col])) is not None:
                    m[nombre_metrica(f'{corto}__{clave}')] = v
    for clave, cal in (calibraciones or {}).items():
        observado = float((cal.observado * cal.niños).sum() / max(cal.niños.sum(), 1))
        riesgo = float((cal.riesgo_medio * cal.niños).sum() / max(cal.niños.sum(), 1))
        if observado > 0:
            m[nombre_metrica(f'calibracion__{clave}')] = riesgo / observado
    if tabla is not None and not tabla.empty and 'AUC' in tabla and 'AUC regla simple' in tabla:
        m['desenlaces_que_superan_la_regla'] = float((tabla['AUC'] > tabla['AUC regla simple']).sum())
        m['desenlaces_validados'] = float(len(tabla))
    return m


def desde_ficha_clinica(ficha: dict) -> pd.DataFrame | None:
    """La tabla de validación que guarda clinico.modelo.guardar en la ficha (orient='index')."""
    v = ficha.get('validacion')
    return pd.DataFrame.from_dict(v, orient='index') if v else None


def filas_metricas(ficha_anomalias: dict | None, ficha_clinica: dict | None,
                   nombre_a_clave: dict[str, str]) -> list[dict]:
    """Filas para resultados.metricas_modelo: (modelo, version, clave, metrica, valor)."""
    filas = []
    if ficha_anomalias:
        for nombre, v in metricas_anomalias(ficha_anomalias.get('validacion')).items():
            metrica, _, clave = nombre.partition('__')
            filas.append(dict(modelo='anomalias', version=ficha_anomalias['version'], clave=clave or '-',
                              metrica=metrica, valor=v))
    if ficha_clinica:
        for nombre, v in metricas_clinicas(desde_ficha_clinica(ficha_clinica), None, nombre_a_clave).items():
            metrica, _, clave = nombre.partition('__')
            filas.append(dict(modelo='clinico', version=ficha_clinica['version'], clave=clave or '-',
                              metrica=metrica, valor=v))
    return filas
