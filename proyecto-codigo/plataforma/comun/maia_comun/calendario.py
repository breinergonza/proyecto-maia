"""Expresiones cron de cinco campos (minuto hora día-del-mes mes día-de-la-semana) para programar ejecuciones.

Acepta ``*``, listas (``1,7``), rangos (``1-5``) y pasos (``*/15``, ``0-30/10``). El domingo es 0 (o 7). Si se
restringen a la vez el día del mes y el de la semana, basta con que se cumpla uno (como cron). Las horas se leen en
la zona horaria de la programación (por defecto ``MAIA_ZONA_HORARIA``, America/Bogota).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

LIMITES = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))
NOMBRES = ('minuto', 'hora', 'día del mes', 'mes', 'día de la semana')
DIAS = ('domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado')
MESES = ('enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
         'noviembre', 'diciembre')


class CronInvalido(ValueError):
    pass


def _campo(texto: str, i: int) -> frozenset[int]:
    lo, hi = LIMITES[i]
    valores: set[int] = set()
    for parte in texto.split(','):
        rango, _, paso_txt = parte.partition('/')
        try:
            paso = int(paso_txt) if paso_txt else 1
            if rango == '*':
                a, b = lo, hi
            elif '-' in rango:
                a, b = (int(x) for x in rango.split('-', 1))
            else:
                a = b = int(rango)
                if paso_txt:
                    b = hi
        except ValueError:
            raise CronInvalido(f'{NOMBRES[i]}: "{parte}" no es válido') from None
        if paso < 1 or not (lo <= a <= b <= hi):
            raise CronInvalido(f'{NOMBRES[i]}: "{parte}" debe estar entre {lo} y {hi}')
        valores.update(range(a, b + 1, paso))
    if i == 4 and 7 in valores:
        valores = (valores - {7}) | {0}
    return frozenset(valores)


@dataclass(frozen=True)
class Cron:
    texto: str
    minutos: frozenset[int]
    horas: frozenset[int]
    dias: frozenset[int]
    meses: frozenset[int]
    semana: frozenset[int]
    dias_libres: bool
    semana_libre: bool

    @classmethod
    def leer(cls, texto: str) -> Cron:
        partes = (texto or '').split()
        if len(partes) != 5:
            raise CronInvalido('Escriba cinco campos: minuto hora día-del-mes mes día-de-la-semana (p. ej. "0 2 1 1,7 *").')
        c = [_campo(p, i) for i, p in enumerate(partes)]
        return cls(' '.join(partes), *c, dias_libres=partes[2] == '*', semana_libre=partes[4] == '*')

    def _dia(self, d: datetime) -> bool:
        if d.month not in self.meses:
            return False
        en_mes, en_semana = d.day in self.dias, (d.isoweekday() % 7) in self.semana
        if self.dias_libres or self.semana_libre:
            return en_mes and en_semana
        return en_mes or en_semana

    def siguiente(self, desde: datetime) -> datetime:
        """El primer momento estrictamente posterior a ``desde`` (con zona horaria) que cumple la expresión."""
        if desde.tzinfo is None:
            raise ValueError('desde necesita zona horaria')
        t = desde.replace(second=0, microsecond=0) + timedelta(minutes=1)
        dia = t.replace(hour=0, minute=0)
        for _ in range(366 * 5):
            if self._dia(dia):
                for h in sorted(self.horas):
                    for m in sorted(self.minutos):
                        c = dia.replace(hour=h, minute=m)
                        if c >= t:
                            return c
            dia = (dia + timedelta(days=1)).replace(hour=0, minute=0)
        raise CronInvalido(f'"{self.texto}" no ocurre en los próximos cinco años.')


def zona(nombre: str) -> ZoneInfo:
    try:
        return ZoneInfo(nombre)
    except (ZoneInfoNotFoundError, ValueError):
        raise CronInvalido(f'Zona horaria desconocida: {nombre}') from None


def proxima(texto: str, desde: datetime, zona_horaria: str) -> datetime:
    return Cron.leer(texto).siguiente(desde.astimezone(zona(zona_horaria)))


def _lista(valores: frozenset[int], nombres: tuple[str, ...] | None = None, base: int = 0) -> str:
    v = sorted(valores)
    textos = [nombres[x - base] if nombres else str(x) for x in v]
    return textos[0] if len(textos) == 1 else ', '.join(textos[:-1]) + ' y ' + textos[-1]


def describir(texto: str) -> str:
    """Una lectura en español de la expresión, para mostrarla junto al campo."""
    c = Cron.leer(texto)
    if len(c.horas) == 1 and len(c.minutos) == 1:
        hora = f'a las {next(iter(c.horas)):02d}:{next(iter(c.minutos)):02d}'
    else:
        hora = f'minuto {_lista(c.minutos)} de las horas {_lista(c.horas)}'
    partes = []
    if not c.dias_libres:
        partes.append(f'el día {_lista(c.dias)}')
    if not c.semana_libre:
        partes.append(('o ' if partes else '') + f'los {_lista(c.semana, DIAS)}')
    if len(c.meses) < 12:
        partes.append(f'de {_lista(c.meses, MESES, 1)}')
    cuando = ' '.join(partes) if partes else 'todos los días'
    return f'{cuando[0].upper()}{cuando[1:]}, {hora}'
