// Cajón lateral: un diálogo modal pegado al borde derecho (pantalla completa en el teléfono) para un formulario que no cabe
// ni debe ocupar el ancho de la página. Tiene encabezado y pie fijos y se desplaza por dentro; la página de atrás ni se
// mueve ni se desplaza. Escape y el botón de cerrar lo cierran; el foco entra al abrir y vuelve a quien lo abrió.
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { Boton } from '.'

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function CajonAbierto({ titulo, acciones, pie, alCerrar, children }: {
  titulo: string; acciones?: ReactNode; pie?: ReactNode; alCerrar: () => void; children: ReactNode
}) {
  const idTitulo = useId()
  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useRef(alCerrar)
  cerrar.current = alCerrar

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'   // la página de atrás no se desplaza
    caja.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [])

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); cerrar.current(); return }
    if (e.key !== 'Tab' || !caja.current) return
    // el foco no sale del cajón: Tab desde el último vuelve al primero y Mayús+Tab, al revés
    const lista = [...caja.current.querySelectorAll<HTMLElement>(ENFOCABLES)]
    const primero = lista[0]
    const ultimo = lista.at(-1)
    if (!primero || !ultimo) return
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === caja.current)) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
  }

  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={alTeclear}>
      <div className="absolute inset-0 bg-tinta/30" onClick={() => cerrar.current()} aria-hidden />
      <div ref={caja} role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1}
        className={cn('absolute inset-y-0 right-0 flex h-dvh w-full flex-col bg-papel shadow-elevada outline-none',
          'sm:w-[25rem] sm:border-l sm:border-linea min-[1700px]:w-[27.5rem]')}>
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-linea px-4 py-3 sm:px-5">
          <h2 id={idTitulo} className="text-base">{titulo}</h2>
          <div className="flex items-center gap-1">
            {acciones}
            <button type="button" aria-label="Cerrar" onClick={() => cerrar.current()}
              className="grid size-9 place-items-center rounded-control text-salvia hover:bg-teal-tinte hover:text-teal">
              <X aria-hidden className="size-5" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {pie && (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-linea px-4 py-3 sm:px-5">{pie}</footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** El cajón solo existe mientras está abierto: al cerrarse devuelve el foco y la página queda como estaba. */
export function Cajon({ abierto, ...resto }: {
  abierto: boolean; titulo: string; alCerrar: () => void
  /** Botones junto al de cerrar (por ejemplo «Quitar todos»). */
  acciones?: ReactNode
  /** Lo que queda a la vista abajo: el resultado y el botón «Listo». */
  pie?: ReactNode; children: ReactNode
}) {
  return abierto ? <CajonAbierto {...resto} /> : null
}

/** El pie habitual de un cajón con filtros: el resultado vivo a la izquierda y «Listo» a la derecha. */
export function PieListo({ resultado, alCerrar }: { resultado: ReactNode; alCerrar: () => void }) {
  return (
    <>
      <p className="min-w-0 text-sm" aria-live="polite">{resultado}</p>
      <Boton onClick={alCerrar}>Listo</Boton>
    </>
  )
}
