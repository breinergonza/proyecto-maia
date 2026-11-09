"""La cola de ejecuciones (``app.ejecuciones``) que llenan la web y los horarios, y vacía el programador.

* ``corrida``: ``maia corrida`` con la fuente y los filtros de la programación (extrae, entrena y registra en MLflow
  con alias ``candidato``, revisa y calcula riesgos).
* ``entrenamiento``: entrenar ya desde la web: trae datos de la fuente (``maia extraer`` o ``maia simular``) y
  entrena los modelos elegidos con los hiperparámetros escritos en el formulario (``maia entrenar
  --hiperparametros``); quedan en MLflow como ``candidato``. El avance va en ``resultado.paso``.
* ``aprobacion``: administración aprobó unas versiones candidatas; el programador las promueve a ``produccion``, arma
  y firma el paquete, y la API lo importa de MinIO y lo activa.

Una sola ejecución a la vez: el programador toma la más antigua pendiente con ``FOR UPDATE SKIP LOCKED``.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from maia_comun import calendario as CAL
from maia_comun.modelos_db import Corte, Ejecucion, Programacion
from maia_comun.modelos_muestras import Muestra

ACTIVAS = ('pendiente', 'en_curso')
VISIBILIDADES = ('personal', 'oficial')


def _claves_hiperparametros() -> frozenset[str]:
    from maia_comun import hiperparametros as HP
    return frozenset({c.nombre for campos in HP.CAMPOS.values() for c in campos} | {'hiperparametros', 'guardar'})


CLAVES_HIPERPARAMETROS = _claves_hiperparametros()
LINEAS_REGISTRO = 200


def ahora() -> datetime:
    return datetime.now(UTC)


# ------------------------------------------------------------------ parámetros de una programación

def validar_parametros(fuente: str, p: dict[str, Any], rol: str | None = None,
                       hiperparametros: dict | None = None) -> dict[str, Any]:
    """Los filtros que admite una corrida programada. ``ventana_meses`` se vuelve ``--desde-visita`` (hoy menos N
    meses) al lanzarla, para que cada ejecución tome su propia ventana. Un experto no cambia hiperparámetros (D40):
    cualquier clave de hiperparámetros, sea en ``p`` o en ``hiperparametros``, se rechaza."""
    if rol == 'experto':
        if any(v not in (None, '', {}) for v in (hiperparametros or {}).values()) or \
                set(p or {}) & CLAVES_HIPERPARAMETROS:
            raise ValueError('Los expertos no cambian los hiperparámetros: se entrena con los vigentes.')
    permitidos = {'anio_desde', 'anio_hasta', 'ventana_meses'}
    limpio = {k: v for k, v in (p or {}).items() if v not in (None, '')}
    if extra := set(limpio) - permitidos:
        raise ValueError(f'Parámetros desconocidos: {", ".join(sorted(extra))}')
    if limpio and fuente != 'kmc':
        raise ValueError('Los filtros de extracción solo aplican a la fuente kmc.')
    salida: dict[str, int] = {}
    for k, v in limpio.items():
        try:
            salida[k] = int(v)
        except (TypeError, ValueError):
            raise ValueError(f'{k} debe ser un número entero') from None
    for k in ('anio_desde', 'anio_hasta'):
        if k in salida and not 1990 <= salida[k] <= 2100:
            raise ValueError(f'{k} debe estar entre 1990 y 2100')
    if salida.get('anio_desde', 0) > salida.get('anio_hasta', 9999):
        raise ValueError('anio_desde no puede ser mayor que anio_hasta')
    if 'ventana_meses' in salida and not 1 <= salida['ventana_meses'] <= 240:
        raise ValueError('ventana_meses debe estar entre 1 y 240')
    return salida


def validar_muestra(s: Session, muestra_id: int, usuario_id, rol: str, fuente: str) -> Muestra:
    """La muestra con la que se entrena, o ``ValueError`` en español: tiene que existir, ser de la misma fuente,
    poder usarla quien entrena (su dueño o administración; las de otros solo se leen o se duplican) y ser del corte
    vigente (D18)."""
    m = s.get(Muestra, muestra_id)
    if m is None:
        raise ValueError(f'La muestra {muestra_id} no existe.')
    if rol != 'admin' and (m.propietario_id is None or m.propietario_id != usuario_id):
        raise ValueError(f'La muestra «{m.titulo}» es de otra persona: puede verla o duplicarla, pero no entrenar con ella.')
    if m.fuente != fuente:
        raise ValueError(f'La muestra «{m.titulo}» es de la fuente {m.fuente}, no de {fuente}.')
    vigente = s.scalars(select(Corte.id).where(Corte.fuente == fuente, Corte.vigente.is_(True))).first()
    if m.corte_id is None or m.corte_id != vigente:
        raise ValueError(f'La muestra «{m.titulo}» se armó con un corte que ya no es el vigente: duplíquela para '
                         'usarla con los datos actuales.')
    return m


def meses_atras(hoy: date, meses: int) -> date:
    total = hoy.year * 12 + hoy.month - 1 - meses
    anio, mes = divmod(total, 12)
    return date(anio, mes + 1, min(hoy.day, 28))


def argumentos_corrida(e: Ejecucion, hoy: date | None = None) -> list[str]:
    """Los argumentos de ``maia corrida`` para esta ejecución. Los riesgos salen siempre de los modelos aprobados
    (alias produccion); la programada además entrena y deja candidatos, la pedida a mano no entrena."""
    p = e.parametros or {}
    args = ['corrida', '--fuente', e.fuente, '--usar', 'produccion']
    if e.origen != 'programada':
        args.append('--sin-entrenar')
    if e.fuente == 'simulado':
        args.append('--sin-extraer')
    if p.get('silencio'):
        args.append('--silencio')
    if p.get('solo_si_nuevo') and e.fuente == 'kmc':
        args.append('--solo-si-nuevo')
    if 'anio_desde' in p:
        args += ['--anio-desde', str(p['anio_desde'])]
    if 'anio_hasta' in p:
        args += ['--anio-hasta', str(p['anio_hasta'])]
    if 'ventana_meses' in p:
        args += ['--desde-visita', meses_atras(hoy or ahora().date(), int(p['ventana_meses'])).isoformat()]
    return args


# ------------------------------------------------------------------ cola

def encolar(s: Session, tipo: str, fuente: str, origen: str, parametros: dict | None = None,
            programacion_id: int | None = None, usuario_id=None) -> Ejecucion:
    e = Ejecucion(tipo=tipo, fuente=fuente, origen=origen, parametros=parametros or {},
                  programacion_id=programacion_id, solicitada_por=usuario_id, estado='pendiente')
    s.add(e)
    s.flush()
    return e


def de_programacion(p: Programacion) -> dict[str, Any]:
    return {**(p.parametros or {}), 'silencio': p.silencio, 'solo_si_nuevo': p.solo_si_nuevo}


def recalcular(p: Programacion, desde: datetime | None = None) -> None:
    p.proxima = CAL.proxima(p.cron, desde or ahora(), p.zona) if p.activo else None


def vencer(s: Session, momento: datetime | None = None) -> list[Ejecucion]:
    """Encola las programaciones cuya hora ya pasó (una vez, aunque se hayan perdido varias) y calcula la próxima.
    Si la anterior de la misma programación sigue pendiente o en curso, esta vez se salta."""
    momento = momento or ahora()
    nuevas = []
    vencidas = s.scalars(select(Programacion).where(Programacion.activo.is_(True), Programacion.proxima <= momento)
                         .with_for_update(skip_locked=True)).all()
    for p in vencidas:
        ocupada = s.scalars(select(Ejecucion.id).where(Ejecucion.programacion_id == p.id,
                                                       Ejecucion.estado.in_(ACTIVAS))).first()
        if ocupada is None:
            nuevas.append(encolar(s, 'corrida', p.fuente, 'programada', de_programacion(p), p.id))
        p.ultima = momento
        recalcular(p, momento)
    return nuevas


def tomar(s: Session) -> Ejecucion | None:
    """La pendiente más antigua (cola FIFO), marcada en curso (nadie más la toma; una sola en curso a la vez)."""
    if s.scalars(select(Ejecucion.id).where(Ejecucion.estado == 'en_curso')).first() is not None:
        return None
    e = s.scalars(select(Ejecucion).where(Ejecucion.estado == 'pendiente').order_by(Ejecucion.id)
                  .limit(1).with_for_update(skip_locked=True)).first()
    if e is not None:
        e.estado, e.iniciada = 'en_curso', ahora()
    return e


def anotar(s: Session, eid: int, registro: list[str]) -> None:
    s.execute(update(Ejecucion).where(Ejecucion.id == eid)
              .values(registro='\n'.join(registro[-LINEAS_REGISTRO:])))


def marcar_paso(s: Session, eid: int, paso: str, hechos: list[str]) -> None:
    """El paso en curso y los terminados, para que la web muestre el avance mientras corre."""
    s.execute(update(Ejecucion).where(Ejecucion.id == eid).values(resultado={'paso': paso, 'hechos': hechos}))


def terminar(s: Session, eid: int, ok: bool, mensaje: str | None = None, resultado: dict | None = None,
             registro: list[str] | None = None) -> None:
    valores: dict[str, Any] = {'estado': 'ok' if ok else 'error', 'terminada': ahora(), 'mensaje': mensaje}
    if resultado is not None:
        valores['resultado'] = resultado
    if registro is not None:
        valores['registro'] = '\n'.join(registro[-LINEAS_REGISTRO:])
    s.execute(update(Ejecucion).where(Ejecucion.id == eid).values(**valores))


def cerrar_interrumpidas(s: Session) -> int:
    """Al arrancar el programador: las que quedaron en curso murieron con el proceso anterior."""
    filas = s.execute(update(Ejecucion).where(Ejecucion.estado == 'en_curso')
                      .values(estado='error', terminada=ahora(),
                              mensaje='Interrumpida: el programador se reinició durante la ejecución.'))
    return filas.rowcount or 0


# ------------------------------------------------------------------ cola de entrenamientos (Mis modelos)

def es_personal(e: Ejecucion) -> bool:
    return (e.parametros or {}).get('visibilidad') == 'personal'


def activas_de(s: Session, usuario_id) -> int:
    """Entrenamientos de esta persona que siguen en cola o en curso."""
    return len(s.scalars(select(Ejecucion.id).where(Ejecucion.tipo == 'entrenamiento', Ejecucion.estado.in_(ACTIVAS),
                                                    Ejecucion.solicitada_por == usuario_id)).all())


def personales_guardados(s: Session, usuario_id) -> int:
    """Modelos personales terminados bien y no descartados de esta persona."""
    filas = s.scalars(select(Ejecucion).where(Ejecucion.tipo == 'entrenamiento', Ejecucion.estado == 'ok',
                                              Ejecucion.solicitada_por == usuario_id)).all()
    return sum(1 for e in filas if es_personal(e) and not (e.parametros or {}).get('descartado'))


def posicion_en_cola(s: Session, e: Ejecucion) -> int | None:
    """0 si corre ahora; 1 si es la próxima; ``None`` si ya no está en la cola."""
    if e.estado == 'en_curso':
        return 0
    if e.estado != 'pendiente':
        return None
    delante = s.scalars(select(Ejecucion.id).where(Ejecucion.estado == 'pendiente', Ejecucion.id < e.id)).all()
    return len(delante) + 1


def promedio_minutos(s: Session, tipo: str = 'entrenamiento', ultimas: int = 5) -> float | None:
    """Promedio de duración de las últimas ejecuciones terminadas bien del mismo tipo; ``None`` sin historia."""
    filas = s.execute(select(Ejecucion.iniciada, Ejecucion.terminada).where(
        Ejecucion.tipo == tipo, Ejecucion.estado == 'ok', Ejecucion.iniciada.is_not(None),
        Ejecucion.terminada.is_not(None)).order_by(Ejecucion.id.desc()).limit(ultimas)).all()
    duraciones = [(f - i).total_seconds() / 60 for i, f in filas if f >= i]
    return round(sum(duraciones) / len(duraciones), 1) if duraciones else None


def cancelar(s: Session, eid: int, por: str) -> Ejecucion | None:
    """Cancela una pendiente (con bloqueo, para no pelear con ``tomar``). ``None`` si ya no está pendiente."""
    e = s.scalars(select(Ejecucion).where(Ejecucion.id == eid).with_for_update()).first()
    if e is None or e.estado != 'pendiente':
        return None
    e.estado, e.terminada, e.mensaje = 'error', ahora(), f'Cancelada por {por}.'
    e.parametros = {**(e.parametros or {}), 'cancelada': True}
    return e
