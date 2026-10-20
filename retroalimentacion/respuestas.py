"""What both sheets (experts and clinicians) share: how an answer is read and how sure a share is."""
from __future__ import annotations

import numpy as np

RESPUESTAS = {'sí': 1, 'si': 1, 's': 1, '1': 1, 'no': 0, 'n': 0, '0': 0}


def wilson(k: float, n: float, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return np.nan, np.nan
    p = k / n
    c = z * np.sqrt(p * (1 - p) / n + z ** 2 / (4 * n ** 2)) / (1 + z ** 2 / n)
    centro = (p + z ** 2 / (2 * n)) / (1 + z ** 2 / n)
    return 100 * (centro - c), 100 * (centro + c)
