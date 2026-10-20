"""¿Entrena LightGBM en la GPU? Una prueba real (entrenar un modelo pequeño), no solo ver si hay tarjeta."""
from __future__ import annotations

import shutil
import subprocess
import time
from dataclasses import dataclass

import lightgbm as lgb
import numpy as np


@dataclass
class EstadoGPU:
    dispositivo: str             # 'cuda' si LightGBM entrena en CUDA, si no 'cpu'
    motivo: str
    tarjeta: str | None = None
    driver: str | None = None
    segundos_cpu: float | None = None
    segundos_gpu: float | None = None


def _nvidia_smi() -> tuple[str | None, str | None]:
    if not shutil.which('nvidia-smi'):
        return None, None
    try:
        salida = subprocess.run(['nvidia-smi', '--query-gpu=name,driver_version', '--format=csv,noheader'],
                                capture_output=True, text=True, timeout=20, check=True).stdout.strip().splitlines()
        if salida:
            nombre, _, driver = salida[0].partition(',')
            return nombre.strip(), driver.strip()
    except (subprocess.SubprocessError, OSError):
        pass
    return None, None


def _entrenar(dispositivo: str, X: np.ndarray, y: np.ndarray, rondas: int) -> float:
    t0 = time.perf_counter()
    lgb.train(dict(objective='binary', device_type=dispositivo, verbose=-1, max_bin=63, num_leaves=31, seed=1),
              lgb.Dataset(X, y), num_boost_round=rondas)
    return time.perf_counter() - t0


def verificar(medir: bool = True) -> EstadoGPU:
    """Entrena un modelo binario corto en CUDA. Si funciona, mide además CPU frente a GPU con un tamaño parecido
    a los modelos del proyecto (decenas de miles de filas), para decidir si la GPU vale la pena."""
    tarjeta, driver = _nvidia_smi()
    rng = np.random.default_rng(0)
    X = rng.normal(size=(2_000, 10))
    y = (X[:, 0] + rng.normal(scale=0.5, size=len(X)) > 0).astype(float)
    try:
        _entrenar('cuda', X, y, 5)
    except lgb.basic.LightGBMError as e:
        motivo = str(e).splitlines()[0][:200]
        if tarjeta is None:
            motivo = f'no hay GPU NVIDIA visible (nvidia-smi); {motivo}'
        return EstadoGPU('cpu', motivo, tarjeta, driver)
    estado = EstadoGPU('cuda', 'LightGBM entrena en CUDA', tarjeta, driver)
    if medir:
        X = rng.normal(size=(60_000, 40))
        y = (X[:, :3].sum(axis=1) + rng.normal(size=len(X)) > 0).astype(float)
        estado.segundos_cpu = round(_entrenar('cpu', X, y, 300), 2)
        estado.segundos_gpu = round(_entrenar('cuda', X, y, 300), 2)
    return estado
