"""Los hiperparámetros que administración puede ajustar para los próximos entrenamientos (``app.hiperparametros``).

Solo los de esta lista y dentro de sus límites. Los valores por defecto son los del núcleo (``anomalias.modelo.Config``
y ``clinico.modelo.ConfigClinica``); lo guardado en la base los reemplaza en ``maia entrenar`` y ``maia corrida``.
MLflow registra los valores usados como ``cfg.*`` y el origen en la etiqueta ``hiperparametros``.
"""
from __future__ import annotations

from dataclasses import MISSING, dataclass, fields, replace
from typing import Any

from sqlalchemy.orm import Session

from anomalias import modelo as MA
from clinico import modelo as AC
from maia_comun.modelos_db import Hiperparametro

TIPOS = ('anomalias', 'clinico')


@dataclass(frozen=True)
class Campo:
    nombre: str
    etiqueta: str
    tipo: type
    minimo: float
    maximo: float
    ayuda: str


_LGBM = (
    Campo('rondas', 'Rondas de boosting (máximo)', int, 20, 5000, 'Árboles por modelo; la parada temprana corta antes.'),
    Campo('tasa', 'Tasa de aprendizaje', float, 0.005, 0.5, 'Más baja aprende más despacio y necesita más rondas.'),
    Campo('hojas', 'Hojas por árbol', int, 4, 255, 'num_leaves de LightGBM.'),
    Campo('min_hoja', 'Datos mínimos por hoja', int, 5, 1000, 'min_data_in_leaf: más alto, árboles más simples.'),
    Campo('semilla', 'Semilla', int, 0, 2**31 - 1, 'Fija el azar para repetir el entrenamiento.'),
)
CAMPOS: dict[str, tuple[Campo, ...]] = {
    'anomalias': _LGBM + (
        Campo('z_alerta', 'Desvío robusto que alerta (capas 1 y 3)', float, 2.0, 10.0, 'z robusto desde el que un dato se revisa.'),
        Campo('alpha', 'Meta de falsas alertas por dato (capa 2)', float, 0.0005, 0.05, '0,005 = 5 por cada 1.000 datos.'),
        Campo('min_sujetos', 'Niños mínimos para modelar una variable', int, 50, 5000, 'Con menos, la capa 2 no la modela.'),
    ),
    'clinico': _LGBM + (
        Campo('min_casos', 'Casos mínimos para modelar un desenlace', int, 10, 1000, 'Con menos eventos no hay modelo.'),
    ),
}
_CLASES = {'anomalias': MA.Config, 'clinico': AC.ConfigClinica}


def por_defecto(tipo: str) -> dict[str, Any]:
    d = {f.name: f.default for f in fields(_CLASES[tipo]) if f.default is not MISSING}
    return {c.nombre: d[c.nombre] for c in CAMPOS[tipo]}


def validar(tipo: str, valores: dict[str, Any]) -> dict[str, Any]:
    """Los valores limpios (solo campos conocidos, del tipo y dentro de los límites). Vacío o ``None`` quita el ajuste."""
    if tipo not in CAMPOS:
        raise ValueError(f'Modelo desconocido: {tipo}')
    campos = {c.nombre: c for c in CAMPOS[tipo]}
    salida: dict[str, Any] = {}
    for k, v in valores.items():
        if k not in campos:
            raise ValueError(f'{k} no es un hiperparámetro ajustable de {tipo}')
        if v is None or v == '':
            continue
        c = campos[k]
        try:
            n = c.tipo(v)
        except (TypeError, ValueError):
            raise ValueError(f'{c.etiqueta}: "{v}" no es un número') from None
        if c.tipo is int and float(v) != n:
            raise ValueError(f'{c.etiqueta}: debe ser un número entero')
        if not c.minimo <= n <= c.maximo:
            raise ValueError(f'{c.etiqueta}: debe estar entre {c.minimo:g} y {c.maximo:g}')
        salida[k] = n
    return salida


def guardados(s: Session, tipo: str) -> dict[str, Any]:
    h = s.get(Hiperparametro, tipo)
    return dict(h.valores) if h else {}


def aplicar(cfg, valores: dict[str, Any]):
    """La configuración del núcleo con los ajustes de administración."""
    return replace(cfg, **valores) if valores else cfg


def leer_y_aplicar(cfg, tipo: str, motor=None) -> tuple[Any, dict[str, Any]]:
    """Para el entrenamiento: lee los ajustes de la base (sin base, ninguno) y los aplica a ``cfg``."""
    from sqlalchemy.exc import SQLAlchemyError

    from maia_comun import db
    try:
        with Session(motor or db.motor()) as s:
            valores = validar(tipo, guardados(s, tipo))
    except SQLAlchemyError as e:
        print(f'Sin ajustes de hiperparámetros ({type(e).__name__}); se usan los del núcleo.', flush=True)
        valores = {}
    return aplicar(cfg, valores), valores

