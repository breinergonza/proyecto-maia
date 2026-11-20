// Predicción: una sola entrada con dos pestañas, «Un niño» y «Un grupo de niños». La pestaña vive en la URL
// (/prediccion y /prediccion?vista=grupo), así que se puede enlazar y el botón Atrás la respeta.
import { lazy, Suspense, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Cargando } from '../components/ui'
import { cn } from '../lib/cn'

const Inferencia = lazy(() => import('./Inferencia'))
const Prediccion = lazy(() => import('./Prediccion'))

const VISTAS = [
  { id: 'nino', texto: 'Un niño' },
  { id: 'grupo', texto: 'Un grupo de niños' },
] as const
type Vista = (typeof VISTAS)[number]['id']

export default function PrediccionMarco() {
  const [params, setParams] = useSearchParams()
  const vista: Vista = params.get('vista') === 'grupo' ? 'grupo' : 'nino'
  const elegir = (v: Vista) => setParams(v === 'grupo' ? { vista: 'grupo' } : {}, { replace: false })
  const alTeclear = (ev: KeyboardEvent, i: number) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return
    ev.preventDefault()
    const siguiente = VISTAS[(i + (ev.key === 'ArrowRight' ? 1 : VISTAS.length - 1)) % VISTAS.length]
    elegir(siguiente.id)
    document.getElementById(`pestana-prediccion-${siguiente.id}`)?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label="Qué desea predecir" className="mb-3 flex gap-1 border-b border-linea">
        {VISTAS.map((v, i) => {
          const activa = v.id === vista
          return (
            <button key={v.id} type="button" role="tab" id={`pestana-prediccion-${v.id}`} aria-selected={activa}
              aria-controls="panel-prediccion" tabIndex={activa ? 0 : -1}
              onClick={() => elegir(v.id)} onKeyDown={(ev) => alTeclear(ev, i)}
              className={cn('-mb-px rounded-t-control border-b-2 px-4 py-2.5 text-[0.95rem] transition-colors',
                activa ? 'border-teal font-semibold text-teal' : 'border-transparent text-tinta/70 hover:text-tinta')}>
              {v.texto}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id="panel-prediccion" aria-labelledby={`pestana-prediccion-${vista}`}>
        <Suspense fallback={<Cargando />}>{vista === 'grupo' ? <Prediccion /> : <Inferencia />}</Suspense>
      </div>
    </div>
  )
}
