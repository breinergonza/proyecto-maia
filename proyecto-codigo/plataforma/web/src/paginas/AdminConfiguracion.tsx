// Configuración inicial (administración): lo que la solución necesita para correr sola, la conexión de solo lectura a
// la base de la entidad (la clave entra cifrada y nunca vuelve) y los hiperparámetros de los próximos entrenamientos.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle } from 'lucide-react'
import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { pedir } from '../api/cliente'
import type { Conexion, ConexionEntrada, Hiperparametros, PruebaConexion, ResumenAdministracion } from '../api/tipos'
import { CampoHiperparametro } from '../components/CampoHiperparametro'
import { useConfirmar } from '../components/Confirmar'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Panel, Selector } from '../components/ui'
import { conPunto, fechaHora, MODELOS } from '../lib/formato'

const SSL = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'] as const
type Datos = Omit<ConexionEntrada, 'clave' | 'borrar_clave'>

export default function AdminConfiguracion() {
  const resumen = useQuery({ queryKey: ['administracion', 'resumen'], queryFn: () => pedir<ResumenAdministracion>('/administracion/resumen') })
  return (
    <>
      <Encabezado titulo="Configuración inicial">
        Lo que la solución necesita para extraer los datos, entrenar los modelos en los horarios que se programen y
        usarlos. Los horarios y la cola están en Programación; lo entrenado, en Entrenamientos.
      </Encabezado>
      {resumen.isPending ? <Cargando /> : resumen.error ? <Aviso>{resumen.error.message}</Aviso> : <Pasos r={resumen.data} />}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <FormConexion soloSimulado={!!resumen.data?.solo_simulado} />
        <div className="flex flex-col gap-4">
          <FormHiperparametros />
        </div>
      </div>
    </>
  )
}

function Paso({ hecho, titulo, children }: { hecho: boolean; titulo: string; children: ReactNode }) {
  const Icono = hecho ? CheckCircle2 : Circle
  return (
    <li className="flex gap-3">
      <Icono size={20} aria-hidden className={hecho ? 'mt-0.5 shrink-0 text-teal' : 'mt-0.5 shrink-0 text-salvia'} />
      <div>
        <p className="font-semibold">{titulo} <span className="sr-only">{hecho ? '(listo)' : '(pendiente)'}</span></p>
        <p className="text-sm text-salvia">{children}</p>
      </div>
    </li>
  )
}

function Pasos({ r }: { r: ResumenAdministracion }) {
  return (
    <Panel titulo="Estado de la configuración">
      {r.solo_simulado && <div className="mb-3"><Aviso tono="teal">Este servicio solo trabaja con datos simulados: la base real se configura en el servidor on-premise.</Aviso></div>}
      <ol className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Paso hecho={r.cifrado_disponible} titulo="1. Llave de cifrado en el servidor">
          {r.cifrado_disponible ? 'MAIA_CIFRADO_CLAVE está definida: la clave de la base se guarda cifrada.'
            : 'Defina MAIA_CIFRADO_CLAVE (32 caracteres o más) en el entorno del servidor para guardar la clave desde aquí.'}
        </Paso>
        <Paso hecho={r.clave_disponible} titulo="2. Conexión a la base de la entidad">
          {r.clave_disponible ? (r.conexion_guardada ? 'Guardada y con clave.' : 'Con los valores y la clave del entorno del servidor (KMC_*).')
            : 'Escriba los datos de conexión y la clave, pruébela y guárdela.'}
        </Paso>
        <Paso hecho={r.programaciones_activas > 0} titulo="3. Horario de las ejecuciones">
          {r.programaciones_activas ? `${r.programaciones_activas} programación(es) activa(s).`
            : <>Sin horarios: <Link className="text-teal underline" to="/admin/programacion">programe la corrida</Link>.</>}
        </Paso>
        <Paso hecho={!!r.paquete_activo} titulo="4. Modelos aprobados en uso">
          {r.paquete_activo ? `Paquete ${r.paquete_activo}.`
            : <>Aún no hay modelos aprobados: <Link className="text-teal underline" to="/admin/entrenamientos">revise los entrenamientos</Link>.</>}
        </Paso>
      </ol>
      <p className="mt-4 text-sm text-salvia">
        Hiperparámetros: {r.hiperparametros_ajustados ? 'hay ajustes de administración.' : 'los del núcleo (sin ajustes).'}
        {' '}Zona horaria de los horarios: {r.zona_horaria}.
        {r.ultima_ejecucion && <> Última ejecución: n.º {r.ultima_ejecucion.id} ({r.ultima_ejecucion.estado}, {fechaHora(r.ultima_ejecucion.creada_en)}).</>}
      </p>
    </Panel>
  )
}

function FormConexion({ soloSimulado }: { soloSimulado: boolean }) {
  const cliente = useQueryClient()
  const actual = useQuery({ queryKey: ['administracion', 'conexion'], queryFn: () => pedir<Conexion>('/administracion/conexion') })
  const [d, setD] = useState<Datos>({ host: '', puerto: 5432, base: '', usuario: '', esquema: 'consumo', sslmode: 'require', timeout: 20 })
  const [clave, setClave] = useState('')
  const [borrar, setBorrar] = useState(false)
  useEffect(() => {
    if (actual.data) {
      const { host, puerto, base, usuario, esquema, sslmode, timeout } = actual.data
      setD({ host, puerto, base, usuario, esquema, sslmode: sslmode as ConexionEntrada['sslmode'], timeout })
    }
  }, [actual.data])
  const cuerpo = (): ConexionEntrada => ({ ...d, clave: clave || null, borrar_clave: borrar })
  const probar = useMutation({ mutationFn: () => pedir<PruebaConexion>('/administracion/conexion/probar', { cuerpo: cuerpo() }) })
  const guardar = useMutation({
    mutationFn: () => pedir<Conexion>('/administracion/conexion', { metodo: 'PUT', cuerpo: cuerpo() }),
    onSuccess: () => {
      setClave('')
      setBorrar(false)
      for (const k of ['conexion', 'resumen']) void cliente.invalidateQueries({ queryKey: ['administracion', k] })
    },
  })
  const cambio = (k: keyof Datos) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD({ ...d, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value })
  const origen = actual.data?.origen_clave
  const error = probar.error ?? guardar.error
  return (
    <Panel titulo="Base de datos de la entidad (origen)">
      {actual.isPending ? <Cargando /> : actual.error ? <Aviso>{actual.error.message}</Aviso> : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
          <p className="text-sm text-salvia">
            Postgres de la Fundación, en solo lectura. Las consultas usan valores enlazados y nunca piden las columnas
            restringidas. {actual.data.guardada ? `Guardada el ${conPunto(fechaHora(actual.data.actualizado_en))}` : 'Hoy se usan los valores del entorno del servidor (KMC_*).'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <Campo id="c-host" etiqueta="Servidor"><Entrada id="c-host" required value={d.host} onChange={cambio('host')} /></Campo>
            <Campo id="c-puerto" etiqueta="Puerto"><Entrada id="c-puerto" type="number" min={1} max={65535} value={d.puerto} onChange={cambio('puerto')} /></Campo>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo id="c-base" etiqueta="Base"><Entrada id="c-base" required value={d.base} onChange={cambio('base')} /></Campo>
            <Campo id="c-usuario" etiqueta="Usuario"><Entrada id="c-usuario" required autoComplete="off" value={d.usuario} onChange={cambio('usuario')} /></Campo>
            <Campo id="c-esquema" etiqueta="Esquema"><Entrada id="c-esquema" required value={d.esquema} onChange={cambio('esquema')} /></Campo>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo id="c-ssl" etiqueta="SSL"><Selector id="c-ssl" value={d.sslmode} onChange={cambio('sslmode')}>{SSL.map((s) => <option key={s}>{s}</option>)}</Selector></Campo>
            <Campo id="c-timeout" etiqueta="Espera al conectar (s)"><Entrada id="c-timeout" type="number" min={1} max={120} value={d.timeout} onChange={cambio('timeout')} /></Campo>
          </div>
          <Campo id="c-clave" etiqueta="Clave"
            ayuda={origen === 'guardada' ? 'Hay una clave guardada (cifrada): déjelo vacío para conservarla.'
              : origen === 'entorno' ? 'Hoy se usa KMC_PW del servidor. Escriba una para guardarla cifrada.' : 'Sin clave: escríbala para guardarla cifrada.'}>
            <Entrada id="c-clave" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)}
              placeholder={origen === 'guardada' ? '•••••••• (guardada)' : ''} />
          </Campo>
          {origen === 'guardada' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-teal" checked={borrar} onChange={(e) => setBorrar(e.target.checked)} />
              Borrar la clave guardada (volver a KMC_PW del servidor)
            </label>
          )}
          {!actual.data.cifrado_disponible && clave && <Aviso>El servidor no tiene MAIA_CIFRADO_CLAVE: la clave se puede probar, pero no guardar.</Aviso>}
          {probar.data && <Aviso tono={probar.data.ok ? 'teal' : 'coral'}>
            {probar.data.mensaje}{probar.data.ok && <> Postgres {probar.data.version_servidor}; {probar.data.tablas?.length ?? 0} tablas en {probar.data.esquema}.</>}
          </Aviso>}
          {error && <Aviso>{error.message}</Aviso>}
          {guardar.isSuccess && <Aviso tono="teal">Conexión guardada.</Aviso>}
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" disabled={soloSimulado || probar.isPending} onClick={() => probar.mutate()}>
              {probar.isPending ? 'Probando…' : 'Probar conexión'}
            </Boton>
            <Boton type="submit" disabled={soloSimulado || guardar.isPending}>Guardar</Boton>
          </div>
        </form>
      )}
    </Panel>
  )
}

function FormHiperparametros() {
  const lista = useQuery({ queryKey: ['administracion', 'hiperparametros'], queryFn: () => pedir<Hiperparametros[]>('/administracion/hiperparametros') })
  if (lista.isPending) return <Cargando />
  if (lista.error) return <Aviso>{lista.error.message}</Aviso>
  return <>{lista.data.map((h) => <PanelModelo key={`${h.modelo}-${h.actualizado_en ?? ''}`} h={h} />)}</>
}

function PanelModelo({ h }: { h: Hiperparametros }) {
  const cliente = useQueryClient()
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(h.campos.map((c) => [c.nombre, c.valor == null ? '' : String(c.valor)])))
  const guardar = useMutation({
    mutationFn: (valores: Record<string, string>) => pedir<Hiperparametros>(`/administracion/hiperparametros/${h.modelo}`, {
      metodo: 'PUT', cuerpo: { valores: Object.fromEntries(Object.entries(valores).map(([k, x]) => [k, x === '' ? null : Number(x)])) },
    }),
    onSuccess: () => {
      for (const k of ['hiperparametros', 'resumen']) void cliente.invalidateQueries({ queryKey: ['administracion', k] })
    },
  })
  // un valor guardado igual al del núcleo no es un ajuste
  const ajustados = h.campos.filter((c) => c.valor != null && c.valor !== c.defecto).length
  const { confirmar, dialogo } = useConfirmar()
  const volver = async () => {
    const ok = await confirmar({
      titulo: `Volver a los valores del núcleo en ${MODELOS[h.modelo]}`,
      mensaje: ajustados > 0 ? `Hoy hay ${ajustados} hiperparámetro(s) con un valor propio.` : 'Se borran los valores guardados para este modelo.',
      efecto: 'Se borran los ajustes guardados y el próximo entrenamiento de este modelo usa los valores del núcleo. Afecta a todo el equipo.',
      reversible: false, textoConfirmar: 'Volver a los del núcleo', tono: 'peligro',
    })
    if (ok) guardar.mutate(Object.fromEntries(h.campos.map((c) => [c.nombre, ''])))
  }
  return (
    <Panel titulo={<>Hiperparámetros · {MODELOS[h.modelo]} {ajustados > 0 && <Insignia tono="ocre" className="ml-1">{ajustados} ajustado(s)</Insignia>}</>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); guardar.mutate(v) }}>
        {dialogo}
        <p className="text-sm text-salvia">
          Vacío = el valor del núcleo (en gris). Aplican al próximo entrenamiento y MLflow registra los valores usados.
          {h.actualizado_en && <> Último cambio: {conPunto(fechaHora(h.actualizado_en))}</>}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {h.campos.map((c) => (
            <CampoHiperparametro key={c.nombre} c={c} id={`hp-${h.modelo}-${c.nombre}`} sugerirNucleo
              valor={v[c.nombre] ?? ''} cambiar={(x) => setV({ ...v, [c.nombre]: x })} />
          ))}
        </div>
        {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
        {guardar.isSuccess && <Aviso tono="teal">Guardado. Se usará en el próximo entrenamiento.</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" disabled={guardar.isPending}>Guardar</Boton>
          <Boton variante="fantasma" disabled={guardar.isPending || !h.campos.some((c) => c.valor != null)} onClick={volver}>
            Volver a los del núcleo
          </Boton>
        </div>
      </form>
    </Panel>
  )
}
