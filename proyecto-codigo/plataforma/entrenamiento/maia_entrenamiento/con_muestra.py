"""Entrenar con una muestra de niños (D18): recorta el corte a los niños de la muestra guardada y deja lo que MLflow
y la analítica anotan (qué muestra, cuántos niños, el embudo). Sin muestra nada cambia: se entrena con todos."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.orm import Session

from maia_comun import muestra as MU
from maia_comun.modelos_db import Corte
from maia_comun.modelos_muestras import Muestra
from sevarti.contrato import Sevarti

MINIMO_NINOS = 200


class MuestraNoUsable(ValueError):
    """La muestra no existe, es de otro corte o quedó vacía: se dice en español y el entrenamiento no arranca."""


@dataclass
class UsoMuestra:
    id: int
    titulo: str
    definicion: dict
    n_base: int
    n: int
    avisos: list[str] = field(default_factory=list)

    @property
    def embudo(self) -> dict:
        return {'muestra_id': self.id, 'titulo': self.titulo, 'n_base': self.n_base, 'n_muestra': self.n}

    def etiquetas(self) -> dict[str, str]:
        return {'muestra_id': str(self.id), 'muestra_titulo': self.titulo[:250], 'muestra_n': str(self.n),
                'muestra_n_base': str(self.n_base)}

    def artefactos(self, tmp: Path) -> dict[str, Path]:
        """Carpeta ``muestra`` en MLflow: la definición y el embudo."""
        carpeta = tmp / 'muestra'
        carpeta.mkdir(parents=True, exist_ok=True)
        (carpeta / 'definicion.json').write_text(json.dumps(self.definicion, ensure_ascii=False, indent=2), encoding='utf-8')
        (carpeta / 'embudo.json').write_text(json.dumps(self.embudo, ensure_ascii=False, indent=2), encoding='utf-8')
        return {'muestra': carpeta}


def aplicar(motor, muestra_id: int, sev: Sevarti, fuente: str, fecha_corte: str) -> tuple[Sevarti, UsoMuestra]:
    """El corte recortado a la muestra. Levanta ``MuestraNoUsable`` si no existe, es de otro corte o queda vacía."""
    with Session(motor) as s:
        m = s.get(Muestra, muestra_id)
        if m is None:
            raise MuestraNoUsable(f'La muestra {muestra_id} no existe.')
        corte = s.get(Corte, m.corte_id) if m.corte_id else None
        titulo, definicion, fuente_m = m.titulo, dict(m.definicion), m.fuente
        fecha_m = str(corte.fecha_corte) if corte else None
    if fuente_m != fuente:
        raise MuestraNoUsable(f'La muestra «{titulo}» es de la fuente {fuente_m}, no de {fuente}.')
    if fecha_m != str(fecha_corte):
        raise MuestraNoUsable(f'La muestra «{titulo}» se armó con el corte {fecha_m or "desconocido"} y se entrena con '
                              f'el {fecha_corte}: duplíquela para usarla con estos datos.')
    n_base = int(sev.sujetos.sujeto.nunique())
    try:
        recortado = MU.aplicar(sev, definicion)
    except MU.MuestraInvalida as e:
        raise MuestraNoUsable(f'La muestra «{titulo}» ya no es válida con estos datos: {"; ".join(e.errores)}') from e
    n = int(recortado.sujetos.sujeto.nunique())
    if n == 0:
        raise MuestraNoUsable(f'La muestra «{titulo}» no tiene ningún niño con estos datos: no hay con qué entrenar.')
    uso = UsoMuestra(muestra_id, titulo, definicion, n_base, n)
    if n < MINIMO_NINOS:
        uso.avisos.append(f'Aviso: la muestra «{titulo}» tiene {n} niños (menos de {MINIMO_NINOS}): los modelos pueden '
                          'salir poco confiables y algunos desenlaces quedar sin modelo por pocos eventos.')
    return recortado, uso
