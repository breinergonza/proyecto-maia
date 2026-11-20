// Las tres preguntas de Comparar grupos como pestañas (una por pregunta) y el enlace al rendimiento del modelo, que vive
// en Modelos: en esta pantalla se comparan grupos de niños, no entrenamientos.
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn'

export const PREGUNTAS = [
  { clave: 'crecen', texto: '¿Crecen distinto?' },
  { clave: 'pasa', texto: '¿Les pasa algo distinto?' },
  { clave: 'faltan', texto: '¿Faltan datos distintos?' },
] as const
export type Pregunta = (typeof PREGUNTAS)[number]['clave']

/** La pregunta de la dirección (``?pregunta=``); sin ella o con una que no existe, la primera. */
export const preguntaDe = (v: string | null): Pregunta => PREGUNTAS.find((p) => p.clave === v)?.clave ?? PREGUNTAS[0].clave

export const idPestana = (p: Pregunta) => `pestana-pregunta-${p}`
export const ID_PANEL = 'panel-pregunta'

export function Preguntas({ activa, elegir }: { activa: Pregunta; elegir: (p: Pregunta) => void }) {
  const alTeclear = (ev: KeyboardEvent, i: number) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return
    ev.preventDefault()
    const siguiente = PREGUNTAS[(i + (ev.key === 'ArrowRight' ? 1 : PREGUNTAS.length - 1)) % PREGUNTAS.length]
    elegir(siguiente.clave)
    document.getElementById(idPestana(siguiente.clave))?.focus()
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-linea">
      <div role="tablist" aria-label="Pregunta" className="-mb-px flex flex-wrap">
        {PREGUNTAS.map((p, i) => {
          const seleccionada = p.clave === activa
          return (
            <button key={p.clave} type="button" role="tab" id={idPestana(p.clave)} aria-selected={seleccionada} aria-controls={ID_PANEL}
              tabIndex={seleccionada ? 0 : -1} onClick={() => elegir(p.clave)} onKeyDown={(ev) => alTeclear(ev, i)}
              className={cn('min-h-11 border-b-2 px-3 py-2 text-left text-sm font-semibold transition-colors sm:text-base',
                seleccionada ? 'border-teal text-teal' : 'border-transparent hover:text-teal')}>
              {p.texto}
            </button>
          )
        })}
      </div>
      <Link to="/analitica/comparar" className="pb-2 text-sm font-semibold text-teal underline underline-offset-2">¿El modelo funciona distinto? → Modelos</Link>
    </div>
  )
}
