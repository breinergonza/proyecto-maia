// Selector del desenlace a 12 meses (una pestaña por desenlace, como control segmentado) con su definición visible al
// lado. La elección vive en la dirección (?familia=), así que se puede enlazar y el grupo activo no se pierde al
// cambiarla. El contenido que controla la pestaña (cifras, gráfica y niños) lo envuelve la página en `PANEL_DESENLACE`.
import type { KeyboardEvent } from 'react'
import type { FamiliaClinica } from '../../api/tipos'
import { cn } from '../../lib/cn'

/** El id del panel que muestran las pestañas: la página lo pone en el contenido del desenlace elegido. */
export const PANEL_DESENLACE = 'panel-desenlace'
export const idPestana = (clave: string) => `pestana-desenlace-${clave}`

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
    document.getElementById(idPestana(siguiente.clave))?.focus()
  }
  const actual = familias.find((f) => f.clave === activa) ?? familias[0]
  return (
    <div className="flex flex-col gap-x-4 gap-y-1.5 lg:flex-row lg:items-center">
      <div role="tablist" aria-label="Desenlace a los 12 meses"
        className="grid shrink-0 grid-flow-col auto-cols-fr overflow-hidden rounded-control border border-teal lg:inline-grid lg:auto-cols-auto">
        {familias.map((f, i) => {
          const seleccionada = f.clave === actual?.clave
          return (
            <button key={f.clave} type="button" role="tab" id={idPestana(f.clave)} aria-selected={seleccionada}
              aria-controls={PANEL_DESENLACE} tabIndex={seleccionada ? 0 : -1}
              onClick={() => elegir(f.clave)} onKeyDown={(ev) => alTeclear(ev, i)}
              className={cn('min-h-9 px-3 py-1.5 text-sm font-semibold leading-tight transition-colors',
                seleccionada ? 'bg-teal text-white' : 'bg-papel text-teal hover:bg-teal-tinte')}>
              {f.nombre}
            </button>
          )
        })}
      </div>
      {actual && <p className="text-sm leading-snug">{actual.definicion}</p>}
    </div>
  )
}
