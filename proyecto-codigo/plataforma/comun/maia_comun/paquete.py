"""Paquete firmado de modelos: cómo viaja un modelo entrenado en el equipo local hasta la API (sección 4.8).

    paquete.tar.gz
    ├── manifest.json     versión, fuente, corte, modelos, requisitos, métricas, sha256 de cada archivo y firma
    ├── anomalias/        la carpeta de ``anomalias.operacion.guardar`` (modelo.pkl, ficha.json, máscara)
    ├── clinico/          la carpeta de ``clinico.modelo.guardar``
    ├── diccionario.xlsx  (solo base real) el diccionario con que se entrenó
    └── sevarti_base/     esquema, etapas y quiebres del corte de entrenamiento

Un pickle ejecuta código al leerse: ``verificar`` comprueba la firma HMAC-SHA256 (``MAIA_PAQUETE_CLAVE``), el
hash de cada archivo, la versión del código y de LightGBM y, si se pide, que la fuente sea ``simulado``, antes de
que ``cargar`` abra un solo pickle.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import shutil
import tarfile
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import lightgbm as lgb

from anomalias import modelo as MA
from anomalias import operacion as OP
from clinico import modelo as AC
from maia_comun.puntuacion import Modelos

FORMATO = 1
NOMBRE = 'paquete.tar.gz'


class PaqueteInvalido(ValueError):
    """El paquete no se puede usar; el mensaje dice por qué, para mostrarlo tal cual."""


def _canonico(manifest: dict) -> bytes:
    sin_firma = {k: v for k, v in manifest.items() if k != 'firma'}
    return json.dumps(sin_firma, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def firmar(manifest: dict, clave: str) -> str:
    return hmac.new(clave.encode('utf-8'), _canonico(manifest), hashlib.sha256).hexdigest()


def _sha256(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, 'rb') as f:
        for bloque in iter(lambda: f.read(1 << 20), b''):
            h.update(bloque)
    return h.hexdigest()


def _hashes(raiz: Path) -> dict[str, str]:
    return {p.relative_to(raiz).as_posix(): _sha256(p)
            for p in sorted(raiz.rglob('*')) if p.is_file() and p.name != 'manifest.json'}


def _version_nucleo() -> str:
    from importlib.metadata import PackageNotFoundError, version
    try:
        return version('maia-nucleo')
    except PackageNotFoundError:
        return 'desconocida'


@dataclass
class Contenido:
    manifest: dict
    carpeta: Path


def armar(destino: Path, carpeta_anomalias: Path, carpeta_clinico: Path, sevarti_base: Path, fuente: str,
          clave: str, modelos: dict, corte: str | None = None, diccionario: Path | None = None,
          metricas: dict | None = None, git_sha: str = 'desconocido') -> Path:
    """Arma, firma y comprime el paquete. ``modelos``: lo que se sabe del registro de cada modelo
    (``{'anomalias': {'registro': ..., 'version': ..., 'run_id': ...}, 'clinico': {...}}``)."""
    if not clave or clave == 'cambiar':
        raise PaqueteInvalido('Defina MAIA_PAQUETE_CLAVE: sin ella el paquete no se puede firmar.')
    ficha_a = json.loads((carpeta_anomalias / 'ficha.json').read_text(encoding='utf-8'))
    ficha_c = json.loads((carpeta_clinico / 'ficha.json').read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory() as tmp:
        raiz = Path(tmp) / 'paquete'
        shutil.copytree(carpeta_anomalias, raiz / 'anomalias')
        shutil.copytree(carpeta_clinico, raiz / 'clinico')
        shutil.copytree(sevarti_base, raiz / 'sevarti_base')
        if diccionario is not None:
            shutil.copy2(diccionario, raiz / 'diccionario.xlsx')
        hashes = _hashes(raiz)
        corto = hashlib.sha256(''.join(hashes.values()).encode()).hexdigest()[:6]
        ahora = datetime.now(UTC)
        modelos = {k: dict(v) for k, v in modelos.items()}
        modelos.setdefault('anomalias', {})
        modelos.setdefault('clinico', {})
        modelos['anomalias'] |= {'version_modelo': ficha_a['version'], 'version_codigo': ficha_a['version_codigo']}
        modelos['clinico'] |= {'version_modelo': ficha_c['version'], 'version_codigo': ficha_c['version_codigo']}
        manifest = {
            'formato': FORMATO,
            'version': f'{ahora:%Y-%m-%d}-{corto}',
            'fuente': fuente,
            'corte': corte or ficha_c.get('corte_datos'),
            'creado': ahora.isoformat(timespec='seconds').replace('+00:00', 'Z'),
            'git_sha': git_sha,
            'modelos': modelos,
            'requisitos': {'lightgbm': lgb.__version__, 'maia_nucleo': _version_nucleo(),
                           'python': '.'.join(map(str, __import__('sys').version_info[:2]))},
            'metricas': metricas or {},
            'sha256': hashes,
        }
        manifest['firma'] = firmar(manifest, clave)
        (raiz / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
        destino.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(destino, 'w:gz') as tar:
            for p in sorted(raiz.rglob('*')):
                tar.add(p, arcname=p.relative_to(raiz).as_posix(), recursive=False)
    return destino


def leer_manifest(ruta_tar: Path) -> dict:
    with tarfile.open(ruta_tar, 'r:gz') as tar:
        try:
            m = tar.extractfile('manifest.json')
        except KeyError:
            m = None
        if m is None:
            raise PaqueteInvalido('El paquete no trae manifest.json.')
        return json.loads(m.read().decode('utf-8'))


def verificar(ruta_tar: Path, clave: str, destino: Path, solo_simulado: bool = False) -> Contenido:
    """Extrae y verifica. Si algo no cuadra, lanza ``PaqueteInvalido`` y no deja nada usable en ``destino``."""
    if not clave or clave == 'cambiar':
        raise PaqueteInvalido('Defina MAIA_PAQUETE_CLAVE: sin ella no se puede verificar la firma.')
    try:
        manifest = leer_manifest(ruta_tar)
    except (tarfile.TarError, OSError, json.JSONDecodeError) as e:
        raise PaqueteInvalido(f'No es un paquete válido: {e}') from e
    if manifest.get('formato') != FORMATO:
        raise PaqueteInvalido(f'Formato de paquete {manifest.get("formato")} desconocido (se espera {FORMATO}).')
    if not hmac.compare_digest(str(manifest.get('firma', '')), firmar(manifest, clave)):
        raise PaqueteInvalido('La firma no coincide: el paquete fue alterado o se firmó con otra MAIA_PAQUETE_CLAVE.')
    if solo_simulado and manifest.get('fuente') != 'simulado':
        raise PaqueteInvalido(f'Este entorno solo acepta modelos entrenados con datos simulados '
                              f'(el paquete es de "{manifest.get("fuente")}").')
    if manifest.get('requisitos', {}).get('lightgbm') != lgb.__version__:
        raise PaqueteInvalido(f'El paquete se hizo con LightGBM {manifest.get("requisitos", {}).get("lightgbm")} y aquí '
                              f'está {lgb.__version__}: los modelos no cargarían igual.')
    codigos = {'anomalias': MA.VERSION_CODIGO, 'clinico': AC.VERSION_CODIGO}
    for nombre, esperado in codigos.items():
        tiene = str(manifest.get('modelos', {}).get(nombre, {}).get('version_codigo'))
        if tiene != esperado:
            raise PaqueteInvalido(f'El modelo {nombre} es de la versión {tiene} del código y aquí está la {esperado}: '
                                  f'hay que reentrenar.')
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)
    try:
        with tarfile.open(ruta_tar, 'r:gz') as tar:
            tar.extractall(destino, filter='data')
        reales = _hashes(destino)
        if reales != manifest.get('sha256'):
            faltan = set(manifest.get('sha256', {})) ^ set(reales)
            distintos = [k for k in reales if k in manifest.get('sha256', {}) and reales[k] != manifest['sha256'][k]]
            raise PaqueteInvalido('Los archivos no coinciden con el manifest'
                                  + (f' (sobran o faltan: {sorted(faltan)[:5]})' if faltan else '')
                                  + (f' (alterados: {distintos[:5]})' if distintos else '') + '.')
    except (PaqueteInvalido, tarfile.TarError, OSError) as e:
        shutil.rmtree(destino, ignore_errors=True)
        if isinstance(e, PaqueteInvalido):
            raise
        raise PaqueteInvalido(f'No se pudo extraer el paquete: {e}') from e
    return Contenido(manifest, destino)


def cargar(contenido: Contenido) -> Modelos:
    """Abre los pickles de un paquete ya verificado."""
    anom, ficha_a = OP.cargar(contenido.carpeta / 'anomalias')
    clin, ficha_c = AC.cargar(contenido.carpeta / 'clinico')
    return Modelos(anom, ficha_a, clin, ficha_c, origen=contenido.manifest['version'])
