// Diálogo de confirmación propio y accesible: reemplaza a window.confirm. Dice qué cambia, a quién afecta y si se puede
// deshacer; el botón de acción nombra lo que hace (nunca «Aceptar»). Escape y clic fuera cancelan y el foco vuelve al
// elemento que lo abrió.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { Boton } from './ui'

export interface OpcionesConfirmar {
  titulo: string
  mensaje: ReactNode
  /** Qué cambia al confirmar. */
  efecto?: string
  /** Si se puede deshacer; si se indica, el diálogo lo dice. */
  reversible?: boolean
  textoConfirmar?: string
  tono?: 'normal' | 'peligro'
}

interface Abierto { opciones: OpcionesConfirmar; resolver: (ok: boolean) => void }

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Dialogo({ opciones, cerrar }: { opciones: OpcionesConfirmar; cerrar: (ok: boolean) => void }) {
  const { titulo, mensaje, efecto, reversible, textoConfirmar = 'Confirmar', tono = 'normal' } = opciones
  const id = useId()
  const caja = useRef<HTMLDivElement>(null)
  const cancelar = useRef<HTMLButtonElement>(null)
  const aceptar = useRef<HTMLButtonElement>(null)
  const peligro = tono === 'peligro'

  useEffect(() => {
    (peligro ? cancelar : aceptar).current?.focus()
  }, [peligro])

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      cerrar(false)
      return
    }
    if (e.key !== 'Tab') return
    const lista = Array.from(caja.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? [])
    if (!lista.length) return
    const primero = lista[0], ultimo = lista[lista.length - 1]
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(false) }}>
      <div ref={caja} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} onKeyDown={teclas}
        className={cn('w-full max-w-md rounded-panel border bg-papel p-5 shadow-elevada', peligro ? 'border-coral-hondo/40' : 'border-linea')}>
        <h2 id={`${id}-t`} className={cn('text-base font-semibold', peligro && 'text-coral-hondo')}>{titulo}</h2>
        <div id={`${id}-d`} className="mt-2 space-y-2 text-sm">
          <div>{mensaje}</div>
          {efecto && <p><strong>Qué cambia:</strong> {efecto}</p>}
          {reversible !== undefined && (
            <p className={cn('font-semibold', reversible ? 'text-teal' : 'text-coral-hondo')}>{reversible ? 'Se puede deshacer' : 'No se puede deshacer'}</p>
          )}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Boton ref={cancelar} variante="secundario" onClick={() => cerrar(false)}>Cancelar</Boton>
          <Boton ref={aceptar} variante={peligro ? 'atencion' : 'primario'} onClick={() => cerrar(true)}>{textoConfirmar}</Boton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** `const { confirmar, dialogo } = useConfirmar()`; render `{dialogo}` en la página y `await confirmar({...})` en el manejador. */
export function useConfirmar() {
  const [abierto, setAbierto] = useState<Abierto | null>(null)
  const origen = useRef<HTMLElement | null>(null)
  const actual = useRef<Abierto | null>(null)
  actual.current = abierto

  const confirmar = useCallback((opciones: OpcionesConfirmar) => new Promise<boolean>((resolver) => {
    actual.current?.resolver(false)
    origen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setAbierto({ opciones, resolver })
  }), [])

  const cerrar = useCallback((ok: boolean) => {
    actual.current?.resolver(ok)
    setAbierto(null)
    const el = origen.current
    origen.current = null
    if (el?.isConnected) setTimeout(() => el.focus(), 0)
  }, [])

  useEffect(() => () => actual.current?.resolver(false), [])

  return { confirmar, dialogo: abierto ? <Dialogo opciones={abierto.opciones} cerrar={cerrar} /> : null }
}
