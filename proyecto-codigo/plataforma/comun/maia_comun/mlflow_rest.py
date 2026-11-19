"""Lectura de MLflow por su API REST (sin instalar mlflow en la API): los entrenamientos con sus hiperparámetros,
métricas, etiquetas y la versión registrada con sus alias (``candidato``, ``produccion``).

Solo se lee: promover y exportar lo hace el programador con el cliente de MLflow.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx

EXPERIMENTOS = {'anomalias': 'maia-anomalias', 'clinico': 'maia-clinico'}
SUFIJO = {'kmc': '', 'simulado': '-demo'}
ETIQUETAS = ('fuente', 'corte', 'version_modelo', 'n_sujetos', 'dispositivo', 'git_sha', 'consulta_sha',
             'hiperparametros', 'ejecucion', 'programacion', 'propietario', 'visibilidad', 'mlflow.runName')


class MlflowNoDisponible(RuntimeError):
    pass


def nombre_registro(tipo: str, fuente: str) -> str:
    return f'{EXPERIMENTOS[tipo]}{SUFIJO[fuente]}'


def _ms(v) -> datetime | None:
    return datetime.fromtimestamp(int(v) / 1000, UTC) if v else None


class Lector:
    def __init__(self, uri: str, usuario: str | None = None, clave: str | None = None, timeout: float = 10.0,
                 cliente: httpx.Client | None = None) -> None:
        self.base = uri.rstrip('/') + '/api/2.0/mlflow'
        self.h = cliente or httpx.Client(timeout=timeout, auth=(usuario, clave or '') if usuario else None)

    def _pedir(self, metodo: str, ruta: str, **kw) -> dict:
        try:
            r = self.h.request(metodo, self.base + ruta, **kw)
        except httpx.HTTPError as e:
            raise MlflowNoDisponible(f'MLflow no responde ({type(e).__name__}).') from e
        if r.status_code == 404 or (r.status_code == 400 and 'RESOURCE_DOES_NOT_EXIST' in r.text):
            return {}
        if r.status_code in (401, 403):
            raise MlflowNoDisponible('MLflow rechazó las credenciales (revise MLFLOW_TRACKING_USERNAME / MLFLOW_TRACKING_PASSWORD).')
        if r.status_code >= 400:
            raise MlflowNoDisponible(f'MLflow respondió {r.status_code}: {r.text[:200]}')
        return r.json()

    def experimento(self, nombre: str) -> str | None:
        d = self._pedir('GET', '/experiments/get-by-name', params={'experiment_name': nombre})
        return (d.get('experiment') or {}).get('experiment_id')

    def versiones(self, registro: str) -> dict[str, dict]:
        """run_id -> versión registrada y sus alias."""
        alias_de: dict[str, list[str]] = {}
        rm = self._pedir('GET', '/registered-models/get', params={'name': registro}).get('registered_model') or {}
        for a in rm.get('aliases') or []:
            alias_de.setdefault(str(a['version']), []).append(a['alias'])
        d = self._pedir('GET', '/model-versions/search', params={'filter': f"name='{registro}'", 'max_results': 500})
        return {mv['run_id']: {'registro': registro, 'version': str(mv['version']),
                               'alias': sorted(alias_de.get(str(mv['version']), []))}
                for mv in d.get('model_versions') or [] if mv.get('run_id')}

    def version(self, registro: str, numero: str) -> dict[str, Any]:
        """Una versión registrada: sus alias y etiquetas (``propietario``, ``visibilidad``). Vacío si no existe."""
        mv = self._pedir('GET', '/model-versions/get', params={'name': registro, 'version': numero}).get('model_version')
        if not mv:
            return {}
        rm = self._pedir('GET', '/registered-models/get', params={'name': registro}).get('registered_model') or {}
        alias = sorted(a['alias'] for a in rm.get('aliases') or [] if str(a['version']) == str(numero))
        return {'registro': registro, 'version': str(numero), 'alias': alias,
                'etiquetas': {t['key']: t['value'] for t in mv.get('tags') or []}}

    def entrenamientos(self, tipo: str, fuente: str | None = None, limite: int = 50,
                       propietario: str | None = None, visibilidad: str | None = None) -> list[dict[str, Any]]:
        eid = self.experimento(EXPERIMENTOS[tipo])
        if eid is None:
            return []
        cuerpo: dict[str, Any] = {'experiment_ids': [eid], 'max_results': limite,
                                  'order_by': ['attributes.start_time DESC']}
        filtros = [f"tags.{k} = '{v}'" for k, v in (('fuente', fuente), ('propietario', propietario),
                                                    ('visibilidad', visibilidad)) if v]
        if filtros:
            cuerpo['filter'] = ' and '.join(filtros)
        runs = self._pedir('POST', '/runs/search', json=cuerpo).get('runs') or []
        versiones: dict[str, dict] = {}
        for f in ([fuente] if fuente else list(SUFIJO)):
            versiones.update(self.versiones(nombre_registro(tipo, f)))
        salida = []
        for r in runs:
            info, datos = r['info'], r.get('data') or {}
            params = {p['key']: p['value'] for p in datos.get('params') or []}
            tags = {t['key']: t['value'] for t in datos.get('tags') or []}
            salida.append({
                'run_id': info['run_id'], 'experimento_id': eid, 'tipo': tipo,
                'nombre': tags.get('mlflow.runName') or info.get('run_name'), 'estado': info.get('status'),
                'inicio': _ms(info.get('start_time')), 'fin': _ms(info.get('end_time')),
                'fuente': tags.get('fuente'), 'corte': tags.get('corte'),
                'hiperparametros': {k[4:]: v for k, v in params.items()
                                    if k.startswith('cfg.') and k[4:] not in ('desenlaces', 'medidas', 'descartados')},
                'extraccion': {k[11:]: v for k, v in params.items() if k.startswith('extraccion.')},
                'metricas': {m['key']: m['value'] for m in datos.get('metrics') or []},
                'etiquetas': {k: v for k, v in tags.items() if k in ETIQUETAS},
                'modelo': versiones.get(info['run_id']),
            })
        return salida
