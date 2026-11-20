// Selector del desenlace a 12 meses (una pestaña por desenlace) con su definición debajo. La elección vive en la
// dirección (?familia=), así que se puede enlazar y el grupo activo no se pierde al cambiarla.
import type { KeyboardEvent } from 'react'
import type { FamiliaClinica } from '../../api/tipos'
import { cn } from '../../lib/cn'

export function SelectorDesenlace({ familias, activa, elegir }: {
  familias: FamiliaClinica[]
  activa: string
  elegir: (clave: string) => void
}) {
  const alTeclear = (ev: KeyboardEvent, i: number) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return
    ev.preventDefault()
    const siguiente = familias[(i + (ev.key === 'ArrowRight' ? 1 : familias.length - 1)) % familias.length]
    elegir(siguiente.clave)
    document.getElementById(`pestana-desenlace-${siguiente.clave}`)?.focus()
  }
  const actual = familias.find((f) => f.clave === activa) ?? familias[0]
  return (
    <div>
      <div role="tablist" aria-label="Desenlace a los 12 meses" className="grid grid-flow-col auto-cols-fr overflow-hidden rounded-control border border-teal">
        {familias.map((f, i) => {
          const seleccionada = f.clave === actual?.clave
          return (
            <button key={f.clave} type="button" role="tab" id={`pestana-desenlace-${f.clave}`} aria-selected={seleccionada}
              aria-controls="panel-desenlace" tabIndex={seleccionada ? 0 : -1}
              onClick={() => elegir(f.clave)} onKeyDown={(ev) => alTeclear(ev, i)}
              className={cn('min-h-11 px-3 py-2 text-sm font-semibold leading-tight transition-colors sm:text-base',
                seleccionada ? 'bg-teal text-white' : 'bg-papel text-teal hover:bg-teal-tinte')}>
              {f.nombre}
            </button>
          )
        })}
      </div>
      {actual && <p id="panel-desenlace" role="tabpanel" aria-labelledby={`pestana-desenlace-${actual.clave}`} className="mt-2 text-sm">{actual.definicion}</p>}
    </div>
  )
}
