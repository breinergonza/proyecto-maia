// Revisión ciega y simple (D14): un niño por pantalla, una sola pregunta (¿le preocupa?), tres respuestas, un motivo
// opcional y el avance. No muestra el riesgo ni la posición, para que la opinión sea independiente; al comparar con el
// modelo se sabe si los niños de riesgo alto preocupan más que el resto. La administración ve además el resumen.
// En escritorio la página no se desplaza: lo que se desplaza es la evidencia (datos y crecimiento) y las respuestas quedan fijas.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'
import { pedir } from '../api/cliente'
import type { Respuesta, ResumenRevision, RiesgoRevision } from '../api/tipos'
import { useSesion, puede } from '../auth/sesion'
import { CrecimientoOms } from '../components/ficha'
import { Aviso, Boton, Cargando, Encabezado, Panel, Tabla, Texto, Vacio } from '../components/ui'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { cn } from '../lib/cn'
import { fecha, num, pct } from '../lib/formato'
import { alerta, ayudaAlerta } from '../lib/lenguaje'

/** Tamaño de la ventana: las gráficas de crecimiento aprovechan el alto que hay (la página no se desplaza en escritorio). */
const alVentana = (avisar: () => void) => {
  window.addEventListener('resize', avisar)
  return () => window.removeEventListener('resize', avisar)
}
const ventana = () => `${window.innerWidth}x${window.innerHeight}`

/** Columnas de gráficas: tres solo donde cada una conserva más de ~400 px, y nunca más que medidas (sin columnas vacías). */
const columnasGraficas = (ancho: number, medidas: number): 1 | 2 | 3 =>
  medidas >= 3 && ancho >= 1700 ? 3 : medidas >= 2 ? 2 : 1

// Clases estáticas: Tailwind solo genera las que ve escritas completas.
const GRILLA = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' } as const

/** Alto de cada gráfica según la ventana y cuántas medidas hay; sin valor (el de siempre) bajo el ancho de escritorio. */
export function altoGraficas(ancho: number, alto: number, medidas: number): number | undefined {
  if (ancho < 1024) return undefined
  const columnas = columnasGraficas(ancho, medidas)
  const filas = Math.max(1, Math.ceil(medidas / columnas))
  // lo que no son gráficas (encabezado, datos del niño, título y leyenda de la tarjeta, rótulo de cada fila) ronda los 520 px
  return Math.round(Math.min(460, Math.max(130, (alto - 520) / filas - 40)))
}

const OPCIONES: { valor: Respuesta; texto: string }[] = [
  { valor: 'si', texto: 'Sí, me preocupa' },
  { valor: 'no', texto: 'No me preocupa' },
  { valor: 'no_se', texto: 'No lo sé' },
]

export default function RevisionRiesgos() {
  const { usuario } = useSesion()
  const admin = puede(usuario, ['admin'])
  const q = useQuery({ queryKey: ['revision', 'riesgos'], queryFn: () => pedir<{ corrida_id: number; items: RiesgoRevision[] }>('/revision/riesgos') })
  const [elegido, setElegido] = useState<number | null>(null)
  const items = q.data?.items ?? []
  const total = items.length
  const respondidas = items.filter((i) => i.preocupa).length
  const primeroPendiente = items.findIndex((i) => !i.preocupa)
  const [ancho, altoVentana] = useSyncExternalStore(alVentana, ventana).split('x').map(Number)
  const actual = Math.min(elegido ?? Math.max(primeroPendiente, 0), Math.max(total - 1, 0))
  const terminado = total > 0 && respondidas === total

  // tras responder, pasa al siguiente niño sin responder (o al siguiente, si ya respondió todos)
  const siguiente = () => {
    const despues = items.findIndex((i, k) => k > actual && !i.preocupa)
    setElegido(despues >= 0 ? despues : Math.min(actual + 1, total - 1))
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 lg:h-full lg:max-w-none">
      <Encabezado titulo="Revisión de riesgos"
        accion={total > 0 && (
          <div className="w-full sm:w-56">
            <div className="flex justify-between text-xs text-salvia"><span>Respondidos</span><span>{respondidas} de {total}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-linea" role="progressbar" aria-label="Avance de la revisión"
              aria-valuemin={0} aria-valuemax={total} aria-valuenow={respondidas}>
              <div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${(respondidas / total) * 100}%` }} />
            </div>
          </div>
        )}>
        Diga si el niño le preocupa, con su criterio clínico. No se muestra el riesgo calculado, a propósito, para que su
        opinión sea independiente.
      </Encabezado>
      {q.isPending ? <Cargando /> : q.error ? <ErrorConReintento error={q.error} que="los niños por revisar" reintentando={q.isFetching} reintentar={() => void q.refetch()} /> : total === 0 ? (
        <Vacio titulo="No hay niños con riesgo calculado con los datos más recientes" />
      ) : (
        <>
          {terminado && <Aviso tono="teal">Respondió a todos los niños. Gracias; puede volver a cualquiera para cambiar su respuesta.</Aviso>}
          <Caso key={items[actual].id} caso={items[actual]} numero={actual + 1} total={total} alResponder={siguiente} claseAlto={admin ? 'lg:min-h-[32rem] lg:flex-none' : 'lg:min-h-0 lg:flex-initial'}
            ancho={ancho} altoGrafica={(c) => altoGraficas(ancho, altoVentana, c)} />
          <nav className="flex shrink-0 justify-between lg:mt-auto" aria-label="Moverse entre niños">
            <Boton chico variante="secundario" disabled={actual === 0} onClick={() => setElegido(actual - 1)}>Anterior</Boton>
            <Boton chico variante="secundario" disabled={actual >= total - 1} onClick={() => setElegido(actual + 1)}>Siguiente</Boton>
          </nav>
        </>
      )}
      {admin && <Resultados />}
    </div>
  )
}

// El motivo a medio escribir se guarda en la pestaña (clave por id del riesgo, nunca el código del niño) para no
// perderlo si la sesión vence o se cambia de caso; se borra al responder.
const claveBorrador = (id: number) => `maia.revision.motivo.${id}`
function leerBorrador(id: number): string | null {
  try {
    return window.sessionStorage.getItem(claveBorrador(id))
  } catch {
    return null
  }
}
function guardarBorrador(id: number, texto: string) {
  try {
    if (texto) window.sessionStorage.setItem(claveBorrador(id), texto)
    else window.sessionStorage.removeItem(claveBorrador(id))
  } catch {
    /* sin almacenamiento: no hay borrador */
  }
}

/** «Peso a 40 sem (40 semanas): 3514 g» → «Peso a 40 sem: 3514 g»: la visita ya la dice el encabezado del caso. */
const sinVisita = (linea: string, visita: string | null) => (visita ? linea.replace(` (${visita}):`, ':') : linea)

function Caso({ caso, numero, total, alResponder, claseAlto, ancho, altoGrafica }: {
  caso: RiesgoRevision; numero: number; total: number; alResponder: () => void; claseAlto: string; ancho: number; altoGrafica: (medidas: number) => number | undefined
}) {
  const cliente = useQueryClient()
  const medidas = Object.keys(caso.crecimiento ?? {}).length
  const [motivo, setMotivo] = useState(() => leerBorrador(caso.id) ?? caso.comentario ?? '')
  const m = useMutation({
    mutationFn: (preocupa: Respuesta) =>
      pedir(`/revision/riesgos/${caso.id}`, { cuerpo: { preocupa, comentario: motivo.trim() || null } }),
    onSuccess: async () => {
      guardarBorrador(caso.id, '')
      await cliente.invalidateQueries({ queryKey: ['revision'] })
      alResponder()
    },
  })
  return (
    <section className={cn('grid grid-cols-1 gap-4 rounded-panel border bg-papel p-5 shadow-suave lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-x-6 lg:p-4', claseAlto, caso.preocupa ? 'border-teal/30' : 'border-linea/80')}
      aria-label={`Niño ${numero} de ${total}`}>
      <div className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-auto lg:pr-2">
        <div className="min-w-0">
          <p className="text-xs text-salvia">Niño {numero} de {total} · {caso.sujeto} · {caso.momento_nombre} ({fecha(caso.fecha_visita)})</p>
          <h2 className="mt-1 text-base">{caso.desenlace}</h2>
          <ul className="mt-2 grid grid-cols-1 gap-x-5 gap-y-0.5 text-sm sm:grid-cols-2">{caso.resumen.map((l) => <li key={l}>{sinVisita(l, caso.momento_nombre)}</li>)}</ul>
        </div>
        <CrecimientoOms crecimiento={caso.crecimiento ?? {}} grilla={GRILLA[columnasGraficas(ancho, medidas)]}
          alto={altoGrafica(medidas)} />
      </div>
      <fieldset className="min-w-0 self-start border-t border-linea/70 pt-4 lg:sticky lg:top-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <legend className="pb-2 text-sm font-semibold">¿Le preocupa este niño?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          {OPCIONES.map((o) => (
            <Boton key={o.valor} variante={caso.preocupa === o.valor ? 'primario' : 'secundario'} aria-pressed={caso.preocupa === o.valor}
              disabled={m.isPending} onClick={() => m.mutate(o.valor)}>{o.texto}</Boton>
          ))}
        </div>
        <label className="mt-3 block text-xs text-salvia" htmlFor={`cr-${caso.id}`}>Motivo (opcional, escríbalo antes de responder)</label>
        <Texto id={`cr-${caso.id}`} rows={2} maxLength={2000} className="mt-1 resize-y text-sm"
          value={motivo} onChange={(e) => { setMotivo(e.target.value); guardarBorrador(caso.id, e.target.value) }} />
        {m.error && <p className="mt-1 text-xs text-coral-hondo" role="alert">{m.error.message}</p>}
      </fieldset>
    </section>
  )
}

function Resultados() {
  const q = useQuery({ queryKey: ['revision', 'resumen'], queryFn: () => pedir<ResumenRevision>('/revision/resumen') })
  const vacio = !q.data || (!q.data.datos_por_capa.length && !q.data.riesgos_por_grupo.length)
  return (
    <Panel llenar titulo="Lo que va de la revisión" className="xl:self-stretch"
      accion={<span className="text-xs text-salvia">todos los expertos</span>}>
      {q.isPending ? <Cargando /> : vacio ? (
        <p className="text-sm text-salvia">Todavía no hay respuestas. Aquí verá qué parte de lo marcado era un error y si el riesgo alto preocupa más.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-1 text-sm">Datos raros que eran errores, por tipo de alerta</h3>
            <Tabla>
              <thead><tr><th>Alerta</th><th className="text-right">Resp.</th><th className="text-right">Error</th></tr></thead>
              <tbody>{q.data!.datos_por_capa.map((c) => (
                <tr key={c.capa}><td title={ayudaAlerta(c.capa)}>{alerta(c.capa)}</td><td className="text-right">{num(c.respuestas)}</td><td className="text-right">{pct(c.precision_pct)}</td></tr>
              ))}</tbody>
            </Tabla>
          </div>
          <div>
            <h3 className="mb-1 text-sm">Niños que preocuparon</h3>
            <Tabla>
              <thead><tr><th>Grupo</th><th className="text-right">Resp.</th><th className="text-right">Preocupan</th></tr></thead>
              <tbody>{q.data!.riesgos_por_grupo.map((g) => (
                <tr key={g.grupo}><td>{g.grupo === 'riesgo alto' ? 'Riesgo alto' : 'Resto'}</td><td className="text-right">{num(g.respuestas)}</td><td className="text-right">{pct(g.preocupa_pct)}</td></tr>
              ))}</tbody>
            </Tabla>
            <p className="mt-2 text-xs text-salvia">Si el modelo ordena bien, el riesgo alto debería preocupar más que el resto.</p>
          </div>
        </div>
      )}
    </Panel>
  )
}
