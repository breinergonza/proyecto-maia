// Pestañas de una página: lo que no cabe en una pantalla de escritorio se reparte en pestañas en vez de apilarse hacia
// abajo. Flechas, Inicio y Fin cambian de pestaña (patrón de pestañas de WAI-ARIA, con activación automática). La pestaña
// elegida puede vivir en la dirección (`usePestanaEnUrl`), para enlazarla y conservarla al recargar.
import type { KeyboardEvent, ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { cn } from '../../lib/cn'

export interface Pestana<K extends string> {
  clave: K
  texto: ReactNode
}

export const idPestana = (prefijo: string, clave: string) => `${prefijo}-${clave}`
export const idPanel = (prefijo: string) => `${prefijo}-panel`

export function Pestanas<K extends string>({ prefijo, etiqueta, pestanas, activa, elegir, className }: {
  /** Prefijo único en la página para los ids de las pestañas y del panel. */
  prefijo: string
  /** Nombre accesible de la lista de pestañas. */
  etiqueta: string
  pestanas: readonly Pestana<K>[]
  activa: K
  elegir: (clave: K) => void
  className?: string
}) {
  const ir = (i: number) => {
    const destino = pestanas[(i + pestanas.length) % pestanas.length]
    elegir(destino.clave)
    document.getElementById(idPestana(prefijo, destino.clave))?.focus()
  }
  const alTeclear = (ev: KeyboardEvent, i: number) => {
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanas.length - 1 }[ev.key]
    if (destino === undefined) return
    ev.preventDefault()
    ir(destino)
  }
  return (
    // max-w-full: junto a otros controles en una fila, sin él la lista mide todas las pestañas en una línea y en un
    // teléfono se sale de la pantalla en vez de pasar a la línea siguiente
    <div role="tablist" aria-label={etiqueta} className={cn('flex max-w-full shrink-0 flex-wrap border-b border-linea', className)}>
      {pestanas.map((p, i) => {
        const seleccionada = p.clave === activa
        return (
          <button key={p.clave} type="button" role="tab" id={idPestana(prefijo, p.clave)} aria-selected={seleccionada}
            aria-controls={idPanel(prefijo)} tabIndex={seleccionada ? 0 : -1} onClick={() => elegir(p.clave)} onKeyDown={(ev) => alTeclear(ev, i)}
            className={cn('-mb-px min-h-11 border-b-2 px-3 py-2 text-left text-sm font-semibold transition-colors sm:text-base',
              seleccionada ? 'border-teal text-teal' : 'border-transparent hover:text-teal')}>
            {p.texto}
          </button>
        )
      })}
    </div>
  )
}

/** El contenido de la pestaña elegida. `ocupado` avisa a los lectores de pantalla mientras llega su información. */
export function PanelPestana({ prefijo, activa, children, className, ocupado }: {
  prefijo: string
  activa: string
  children: ReactNode
  className?: string
  ocupado?: boolean
}) {
  return (
    <div role="tabpanel" id={idPanel(prefijo)} aria-labelledby={idPestana(prefijo, activa)} aria-busy={ocupado || undefined} className={className}>
      {children}
    </div>
  )
}

/** Los paneles de unas pestañas, todos montados: lo que se abrió o se escribió en uno sobrevive al cambiar de pestaña, y
 *  al imprimir salen todos, no solo el de la pestaña elegida. En pantalla se ve uno; solo ese lleva el rol y el id que
 *  enlazan con su pestaña. Un panel que cambia de elegido a no elegido sigue siendo el mismo elemento. */
export function PanelesPestana<K extends string>({ prefijo, activa, paneles, className }: {
  prefijo: string
  activa: K
  paneles: readonly { clave: K; contenido: ReactNode }[]
  /** Clases de cada panel (los no elegidos suman `hidden print:block`). */
  className?: string
}) {
  return paneles.map((p) => {
    const elegido = p.clave === activa
    return (
      <div key={p.clave} role={elegido ? 'tabpanel' : undefined} id={elegido ? idPanel(prefijo) : undefined}
        aria-labelledby={elegido ? idPestana(prefijo, p.clave) : undefined}
        className={cn(className, !elegido && 'hidden print:block')}>
        {p.contenido}
      </div>
    )
  })
}

/** La pestaña elegida en `?<param>=`: sin el parámetro o con uno que no existe, la primera. Cambiarla reemplaza la
 *  entrada del historial (Atrás vuelve a la página anterior, no a la pestaña anterior) y conserva los demás parámetros. */
export function usePestanaEnUrl<K extends string>(param: string, claves: readonly K[]) {
  const [params, setParams] = useSearchParams()
  const valor = params.get(param)
  const activa = claves.find((c) => c === valor) ?? claves[0]
  const elegir = (clave: K) => setParams((previo) => {
    const nuevo = new URLSearchParams(previo)
    nuevo.set(param, clave)
    return nuevo
  }, { replace: true })
  return [activa, elegir] as const
}
