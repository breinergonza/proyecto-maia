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

El diccionario de variables vive con versiones en Postgres (``maia_comun.diccionarios``). Antes de cada ``corrida`` o
``entrenamiento`` se baja la versión vigente a ``MAIA_RAIZ/entradas/diccionario.xlsx``; si al terminar el archivo
cambió (la corrida agregó variables nuevas de la base como «Por clasificar»), queda un borrador para que los expertos
lo revisen en la web y la ejecución anota ``resultado.variables_nuevas``. Al arrancar, si no hay ninguna versión, se
siembra la del núcleo.
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
from pathlib import Path

from sqlalchemy import Engine
from sqlalchemy.orm import Session

from archivos import carpetas as CA
from maia_comun import conexion_origen as CO
from maia_comun import db
from maia_comun import diccionarios as DIC
from maia_comun import ejecuciones as EJ
from maia_comun.config import Configuracion, obtener
from maia_comun.modelos_db import Ejecucion, VersionDiccionario

CADA_ANOTAR = 5.0   # segundos entre escrituras del registro mientras corre
USAN_DICCIONARIO = ('corrida', 'entrenamiento')
NOMBRES_MODELO = {'anomalias': 'anomalías', 'clinico': 'clínico'}   # en los mensajes de la web

Lanzador = Callable[[list[str], dict[str, str], Callable[[str], None]], int]


class FalloEjecucion(RuntimeError):
    """Un fallo que el programador ya explica en español (sin clave, sin servidor, ``maia`` terminó con error)."""


# Fallos conocidos: lo que se busca en la salida y lo que se le dice a administración. El texto original queda en el
# registro, bajo «Detalle técnico».
_CONOCIDOS: tuple[tuple[str, str], ...] = (
    (r'(AccessDenied|Access Denied|403 Forbidden).*(Bucket|bucket|S3|s3)|(CreateBucket|PutObject|GetObject).*AccessDenied',
     'MinIO no le dio permiso al servicio para leer o escribir los archivos. Revise los usuarios de MinIO (minio-init) '
     'o avise a quien administra el servidor.'),
    (r'EndpointConnectionError|Could not connect to the endpoint URL',
     'No se pudo conectar con MinIO, el almacén de archivos. Revise que el servicio esté encendido.'),
    (r'(?i)mlflow.*(connection refused|max retries exceeded|connectionerror)|(connection refused|max retries exceeded).*:5000',
     'No se pudo conectar con MLflow. Revise que el servicio esté encendido.'),
    (r'(?i)password authentication failed',
     'La base de la entidad rechazó el usuario o la clave. Revíselos en Administración › Configuración.'),
    (r'(?i)could not translate host name|name or service not known|nodename nor servname',
     'No se encontró el servidor de la base de la entidad. Revise el nombre en Administración › Configuración.'),
    (r'(?i)connection refused|connection timed out|timeout expired|could not connect to server',
     'No se pudo conectar con la base de datos: revise el servidor, el puerto y que la red lo permita.'),
    (r'(?i)no hay cortes',
     'Todavía no hay datos guardados de esta fuente. Marque «Traer datos nuevos» o ejecute primero una corrida.'),
    (r'No hay modelos con alias produccion',
     'Todavía no hay modelos aprobados: entrene y apruebe una versión de cada modelo en Administración › '
     'Entrenamientos antes de la corrida.'),
    (r'(?i)no space left on device', 'El servidor se quedó sin espacio en disco.'),
    (r'(?i)cuda.*out of memory|out of memory.*cuda', 'La GPU se quedó sin memoria durante el entrenamiento.'),
    (r'MemoryError|código -9\b|código 137\b', 'El servidor se quedó sin memoria durante la ejecución.'),
)


def explicar(ex: Exception, salida: str = '') -> str:
    """El mensaje para la web: un fallo conocido en palabras claras; si no, qué paso falló y dónde ver el detalle."""
    texto = f'{salida}\n{type(ex).__name__}: {ex}'
    for patron, mensaje in _CONOCIDOS:
        if re.search(patron, texto):
            return mensaje
    if isinstance(ex, FalloEjecucion):
        if m := re.match(r'maia (\S+) terminó con código', str(ex)):
            return (f'Falló el paso «maia {m[1]}». Abra «Ver detalle técnico» y compártalo con quien administra el '
                    'servidor.')
        return str(ex)[:1000]
    return ('La ejecución se detuvo por un error inesperado. Abra «Ver detalle técnico» y compártalo con quien '
            'administra el servidor.')


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
    diccionario: Path | None = None   # donde lo lee maia; por defecto MAIA_RAIZ/entradas/diccionario.xlsx

    def __post_init__(self) -> None:
        self.motor = self.motor or db.motor()
        self.diccionario = Path(self.diccionario or CA.PROYECTO.diccionario)

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
        self.sembrar_diccionario()
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

        base = self._bajar_diccionario(al_linea) if e.tipo in USAN_DICCIONARIO else None
        try:
            atender = {'corrida': self._corrida, 'aprobacion': self._aprobacion, 'entrenamiento': self._entrenamiento}
            resultado = atender[e.tipo](e, al_linea)
            ok, mensaje = True, resultado.pop('mensaje', None)
        except Exception as ex:
            ok, mensaje, resultado = False, explicar(ex, '\n'.join(lineas[-80:])), None
            lineas += ['', '--- Detalle técnico ---', f'{type(ex).__name__}: {ex}'[:2000]]
            if not isinstance(ex, FalloEjecucion):
                lineas += traceback.format_exc().splitlines()[-30:]
        # aunque la ejecución falle después, las variables nuevas ya quedaron en el archivo: no se pierden
        nuevas = self._borrador_diccionario(base, e.id, lineas.append) if base is not None else []
        if ok and nuevas and resultado is not None:
            resultado['variables_nuevas'] = nuevas
            aviso = (f'La base trajo {len(nuevas)} variable{"s" if len(nuevas) != 1 else ""} nueva'
                     f'{"s" if len(nuevas) != 1 else ""}: revísela{"s" if len(nuevas) != 1 else ""} en Diccionario.')
            mensaje = f'{mensaje} {aviso}' if mensaje else aviso
        with Session(self.motor) as s:
            EJ.terminar(s, e.id, ok, mensaje, resultado, lineas)
            s.commit()
        print(f'Ejecución {e.id} {"terminada" if ok else "con error"}{": " + mensaje if mensaje else ""}', flush=True)

    # ------------------------------------------------------------ el diccionario de variables

    def sembrar_diccionario(self) -> bool:
        """Si la base no tiene ninguna versión, la del núcleo queda vigente (reemplaza el antiguo ``cp -f``)."""
        try:
            with Session(self.motor) as s:
                hecho = DIC.sembrar(s)
                s.commit()
        except Exception:   # sin la migración 0005 o sin archivo: se sigue con el diccionario que haya en disco
            traceback.print_exc()
            return False
        if hecho:
            print('Diccionario: se guardó el del núcleo como versión vigente.', flush=True)
        return hecho

    def _bajar_diccionario(self, al_linea: Callable[[str], None]) -> VersionDiccionario | None:
        """La versión vigente al archivo que lee ``maia``. Sin versiones (o si falla), queda el archivo que haya."""
        try:
            with Session(self.motor, expire_on_commit=False) as s:
                v = DIC.bajar_vigente(s, self.diccionario)
        except Exception as ex:
            al_linea(f'No se pudo bajar el diccionario vigente ({type(ex).__name__}); se usa el que haya en disco.')
            return None
        if v is not None:
            al_linea(f'Diccionario de variables: versión {v.version}.')
        return v

    def _borrador_diccionario(self, base: VersionDiccionario, eid: int, anotar: Callable[[str], None]) -> list[str]:
        """Si el archivo cambió durante la ejecución, un borrador con las variables nuevas. Nunca hace fallar."""
        try:
            with Session(self.motor, expire_on_commit=False) as s:
                v, nuevas = DIC.guardar_de_corrida(s, base, self.diccionario, eid)
                s.commit()
        except Exception as ex:
            anotar(f'No se pudo guardar el diccionario actualizado ({type(ex).__name__}: {ex})'[:500])
            return []
        if v is not None:
            anotar(f'Diccionario: borrador versión {v.version} con {len(nuevas)} variable(s) nueva(s).')
        return nuevas

    def _entorno(self, e: Ejecucion) -> dict[str, str]:
        env = {k: v for k, v in os.environ.items() if not k.startswith('KMC_')}
        env.update({'MAIA_EJECUCION_ID': str(e.id), 'PYTHONUNBUFFERED': '1'})
        if e.programacion_id:
            env['MAIA_PROGRAMACION_ID'] = str(e.programacion_id)
        if e.tipo == 'entrenamiento':       # dueño y etiqueta Personal/Oficial: quedan como tags en MLflow
            env['MAIA_VISIBILIDAD'] = (e.parametros or {}).get('visibilidad') or 'oficial'
            if e.solicitada_por:
                env['MAIA_PROPIETARIO'] = str(e.solicitada_por)
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
        if m := re.search(r'Riesgos con los modelos produccion: anomalías v(\d+) · clínico v(\d+)', salida):
            r['modelos_riesgos'] = {'anomalias': m[1], 'clinico': m[2]}
        if m := re.search(r'Corrida (\d+) terminada', salida):
            r['corrida'] = int(m[1])
        if m := re.search(r'Corte (\d{4}-\d{2}-\d{2}) \(id (\d+)\)', salida):
            r['corte'], r['corte_id'] = m[1], int(m[2])
        aprobados = r.get('modelos_riesgos')
        con = f'anomalías v{aprobados["anomalias"]} · clínico v{aprobados["clinico"]}' if aprobados else ''
        if 'modelos' in r:
            r['mensaje'] = ((f'Riesgos calculados con los modelos aprobados ({con}). ' if con else '') +
                            'Los recién entrenados quedaron como candidatos: apruébelos en Administración › '
                            'Entrenamientos para usarlos en la solución.')
        elif con:
            r['mensaje'] = f'Riesgos calculados con los modelos aprobados ({con}).'
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
            if p.get('muestra_id'):
                args += ['--muestra', str(p['muestra_id'])]
            hp = (p.get('hiperparametros') or {}).get(tipo)
            if hp:
                args += ['--hiperparametros', json.dumps(hp, sort_keys=True)]
            salida = '\n'.join(self._maia(args, env, al_linea))
            if m := re.search(r'Registrado como (\S+) v(\d+)', salida):
                modelos[tipo] = {'registro': m[1], 'version': m[2]}
            if fecha is None and (m := re.search(r'Corte (\d{4}-\d{2}-\d{2}) \(', salida)):
                fecha = m[1]
            hechos.append(paso)
        versiones = ' · '.join(f'{NOMBRES_MODELO.get(t, t)} v{v["version"]}' for t, v in modelos.items())
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
