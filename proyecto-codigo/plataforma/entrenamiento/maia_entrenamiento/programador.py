"""El programador: corre en el servidor con GPU (servicio ``trainer`` on-premise, ``make programador`` en local) y
ejecuta lo que administración programó o pidió desde la web.

Cada ``intervalo`` segundos:

1. encola las programaciones vencidas (``maia_comun.ejecuciones.vencer``);
2. toma la ejecución pendiente más antigua y la lanza como un proceso ``maia`` aparte:
   * ``corrida``: ``maia corrida`` con la fuente y los filtros; para la base real recibe ``KMC_*`` de la conexión
     guardada en la web (la clave descifrada solo en el entorno de ese proceso) o, si no hay, del entorno propio;
   * ``aprobacion``: ``maia promover`` de las dos versiones y ``maia exportar``; la API importa el paquete y lo activa.
3. guarda en la ejecución las últimas líneas de la salida, el resultado (corrida, versiones registradas, paquete) o
   el error.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import threading
import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from maia_comun import conexion_origen as CO
from maia_comun import db
from maia_comun import ejecuciones as EJ
from maia_comun.config import Configuracion, obtener
from maia_comun.modelos_db import Ejecucion

CADA_ANOTAR = 5.0   # segundos entre escrituras del registro mientras corre

Lanzador = Callable[[list[str], dict[str, str], Callable[[str], None]], int]


class FalloEjecucion(RuntimeError):
    pass


def lanzar_maia(args: list[str], entorno: dict[str, str], al_linea: Callable[[str], None]) -> int:
    """``python -m maia_entrenamiento.cli <args>`` con la salida línea por línea."""
    p = subprocess.Popen([sys.executable, '-m', 'maia_entrenamiento.cli', *args], env=entorno, text=True,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1)
    assert p.stdout is not None
    for linea in p.stdout:
        al_linea(linea.rstrip('\n'))
    return p.wait()


@dataclass
class Programador:
    motor: Engine | None = None
    lanzar: Lanzador = lanzar_maia
    cfg: Configuracion = field(default_factory=obtener)
    intervalo: float = 30.0

    def __post_init__(self) -> None:
        self.motor = self.motor or db.motor()

    # ------------------------------------------------------------ ciclo

    def arrancar(self) -> int:
        with Session(self.motor) as s:
            n = EJ.cerrar_interrumpidas(s)
            s.commit()
        return n

    def ciclo(self) -> int | None:
        """Encola lo vencido y ejecuta una pendiente. Devuelve el id de la ejecución atendida, si hubo."""
        with Session(self.motor) as s:
            for e in EJ.vencer(s):
                print(f'Programación {e.programacion_id}: ejecución {e.id} encolada.', flush=True)
            s.commit()
        with Session(self.motor, expire_on_commit=False) as s:
            e = EJ.tomar(s)
            s.commit()
            if e is None:
                return None
        print(f'Ejecución {e.id} ({e.tipo}, {e.fuente}) iniciada.', flush=True)
        self.atender(e)
        return e.id

    def bucle(self, parar: threading.Event | None = None) -> None:
        parar = parar or threading.Event()
        n = self.arrancar()
        print(f'Programador listo (cada {self.intervalo:g} s{f"; {n} interrumpidas cerradas" if n else ""}).', flush=True)
        while not parar.is_set():
            try:
                atendida = self.ciclo()
            except Exception:   # la base caída un momento no debe matar el servicio
                traceback.print_exc()
                atendida = None
            if atendida is None:
                parar.wait(self.intervalo)

    # ------------------------------------------------------------ una ejecución

    def atender(self, e: Ejecucion) -> None:
        lineas: list[str] = []
        ultimo = [time.monotonic()]

        def al_linea(linea: str) -> None:
            print(f'  [{e.id}] {linea}', flush=True)
            lineas.append(linea)
            if time.monotonic() - ultimo[0] >= CADA_ANOTAR:
                ultimo[0] = time.monotonic()
                with Session(self.motor) as s:
                    EJ.anotar(s, e.id, lineas)
                    s.commit()

        try:
            atender = {'corrida': self._corrida, 'aprobacion': self._aprobacion, 'entrenamiento': self._entrenamiento}
            resultado = atender[e.tipo](e, al_linea)
            ok, mensaje = True, resultado.pop('mensaje', None)
        except Exception as ex:
            ok, mensaje, resultado = False, f'{type(ex).__name__}: {ex}'[:1000], None
        with Session(self.motor) as s:
            EJ.terminar(s, e.id, ok, mensaje, resultado, lineas)
            s.commit()
        print(f'Ejecución {e.id} {"terminada" if ok else "con error"}{": " + mensaje if mensaje else ""}', flush=True)

    def _entorno(self, e: Ejecucion) -> dict[str, str]:
        env = {k: v for k, v in os.environ.items() if not k.startswith('KMC_')}
        env.update({'MAIA_EJECUCION_ID': str(e.id), 'PYTHONUNBUFFERED': '1'})
        if e.programacion_id:
            env['MAIA_PROGRAMACION_ID'] = str(e.programacion_id)
        extrae = e.tipo == 'corrida' or (e.tipo == 'entrenamiento' and (e.parametros or {}).get('extraer'))
        if e.fuente == 'kmc' and extrae:
            with Session(self.motor) as s:
                c = CO.guardada(s)
                datos, clave = CO.datos_de(c, self.cfg), CO.clave(c, self.cfg)
            if not clave:
                raise FalloEjecucion('No hay clave de la base de la entidad: guárdela en Administración › '
                                     'Configuración o defina KMC_PW en el servidor.')
            if not (datos.host and datos.usuario):
                raise FalloEjecucion('Falta el servidor o el usuario de la base de la entidad: guárdelos en '
                                     'Administración › Configuración o defina KMC_HOST y KMC_USUARIO.')
            env.update(CO.entorno(datos, clave))
        return env

    def _maia(self, args: list[str], env: dict[str, str], al_linea: Callable[[str], None]) -> list[str]:
        salida: list[str] = []

        def anotar(linea: str) -> None:
            salida.append(linea)
            al_linea(linea)

        al_linea(f'$ maia {" ".join(args)}')
        codigo = self.lanzar(args, env, anotar)
        if codigo != 0:
            ultima = next((x for x in reversed(salida) if x.strip()), '')
            raise FalloEjecucion(f'maia {args[0]} terminó con código {codigo}. {ultima}'[:1000])
        return salida

    def _corrida(self, e: Ejecucion, al_linea: Callable[[str], None]) -> dict:
        salida = '\n'.join(self._maia(EJ.argumentos_corrida(e), self._entorno(e), al_linea))
        if 'La base no cambió' in salida:
            return {'sin_cambios': True, 'mensaje': 'La base no cambió desde el último corte: no se entrenó.'}
        r: dict = {}
        if m := re.search(r'Registrado en MLflow: (\S+) v(\d+) · (\S+) v(\d+)', salida):
            r['modelos'] = {'anomalias': {'registro': m[1], 'version': m[2]},
                            'clinico': {'registro': m[3], 'version': m[4]}}
        if m := re.search(r'Corrida (\d+) terminada', salida):
            r['corrida'] = int(m[1])
        if m := re.search(r'Corte (\d{4}-\d{2}-\d{2}) \(id (\d+)\)', salida):
            r['corte'], r['corte_id'] = m[1], int(m[2])
        if 'modelos' in r:
            r['mensaje'] = ('Modelos registrados como candidatos: apruébelos en Administración › Entrenamientos para '
                            'usarlos en la solución.')
        return r

    def _paso(self, eid: int, paso: str, hechos: list[str]) -> None:
        with Session(self.motor) as s:
            EJ.marcar_paso(s, eid, paso, hechos)
            s.commit()

    def _entrenamiento(self, e: Ejecucion, al_linea: Callable[[str], None]) -> dict:
        """Entrenar ya: datos nuevos de la fuente (si se pidió) y cada modelo con los hiperparámetros de la web."""
        p, env = e.parametros or {}, self._entorno(e)
        hechos: list[str] = []
        fecha = None
        if p.get('extraer'):
            self._paso(e.id, 'extrayendo', hechos)
            if e.fuente == 'kmc':
                f = p.get('filtros') or {}
                args = ['extraer', '--fuente', 'kmc']
                for k, opcion in (('anio_desde', '--anio-desde'), ('anio_hasta', '--anio-hasta')):
                    if f.get(k) is not None:
                        args += [opcion, str(f[k])]
                if f.get('ventana_meses'):
                    args += ['--desde-visita', EJ.meses_atras(EJ.ahora().date(), int(f['ventana_meses'])).isoformat()]
                salida = '\n'.join(self._maia(args, env, al_linea))
                m = re.search(r'Corte (\d{4}-\d{2}-\d{2}) guardado', salida)
            else:
                salida = '\n'.join(self._maia(['simular', '--sujetos', str(p.get('sujetos') or 5000)], env, al_linea))
                m = re.search(r'Corte simulado (\d{4}-\d{2}-\d{2})', salida)
            fecha = m[1] if m else None
            hechos.append('extrayendo')
        modelos: dict[str, dict] = {}
        for tipo in p.get('modelos') or ['anomalias', 'clinico']:
            paso = f'entrenando_{tipo}'
            self._paso(e.id, paso, hechos)
            args = ['entrenar', tipo, '--fuente', e.fuente]
            if fecha:
                args += ['--fecha', fecha]
            hp = (p.get('hiperparametros') or {}).get(tipo)
            if hp:
                args += ['--hiperparametros', json.dumps(hp, sort_keys=True)]
            salida = '\n'.join(self._maia(args, env, al_linea))
            if m := re.search(r'Registrado como (\S+) v(\d+)', salida):
                modelos[tipo] = {'registro': m[1], 'version': m[2]}
            if fecha is None and (m := re.search(r'Corte (\d{4}-\d{2}-\d{2}) \(', salida)):
                fecha = m[1]
            hechos.append(paso)
        versiones = ' · '.join(f'{t} v{v["version"]}' for t, v in modelos.items())
        return {'paso': 'entrenado', 'hechos': hechos, 'modelos': modelos, 'corte': fecha,
                'mensaje': f'Entrenado ({versiones}); quedó como candidato en MLflow. Apruébelo para usarlo.'}

    def _aprobacion(self, e: Ejecucion, al_linea: Callable[[str], None]) -> dict:
        p, env = e.parametros or {}, self._entorno(e)
        a, c = str(p['anomalias']), str(p['clinico'])
        self._maia(['promover', 'anomalias', '--version', a, '--fuente', e.fuente], env, al_linea)
        self._maia(['promover', 'clinico', '--version', c, '--fuente', e.fuente], env, al_linea)
        salida = '\n'.join(self._maia(['exportar', '--fuente', e.fuente, '--modelo-anomalias', a,
                                       '--modelo-clinico', c], env, al_linea))
        m = re.search(r'Paquete (\S+) \((\w+)\) firmado', salida)
        if not m:
            raise FalloEjecucion('maia exportar no informó la versión del paquete.')
        return {'modelos': {'anomalias': a, 'clinico': c}, 'paquete': m[1],
                'mensaje': f'Versiones en producción; paquete {m[1]} armado (la API lo activa en unos segundos).'}
