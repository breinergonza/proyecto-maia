// Buscador del menú: filtra en el sitio las opciones del menú lateral (las que no coinciden se ocultan; los grupos
// con coincidencias se abren). Enter va a la primera coincidencia. Atajos "/" y Ctrl/Cmd+K (solo con `atajo`).
import { Search, X } from 'lucide-react'
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { cn } from '../lib/cn'

export type Destino = { a: string; texto: string; grupo?: string }

function escribiendo(el: EventTarget | null) {
  const e = el as HTMLElement | null
  return !!e && (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName) || e.isContentEditable)
}

/** Sin tildes ni mayúsculas ni espacios de más: «prediccion» encuentra «Predicción». */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** ¿Coinciden todas las palabras del filtro (ya normalizado) con el texto? Un filtro vacío coincide con todo. */
export const coincide = (texto: string, filtro: string) => {
  const t = normalizar(texto)
  return filtro.split(/\s+/).every((p) => t.includes(p))
}

export function BuscarMenu({ valor, alCambiar, primero, alElegir, atajo, className }: {
  valor: string; alCambiar: (v: string) => void; primero?: Destino; alElegir?: () => void; atajo?: boolean; className?: string
}) {
  const navegar = useNavigate()
  const id = useId()
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!atajo) return
    const alTeclear = (e: globalThis.KeyboardEvent) => {
      const ctrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
      const barra = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !escribiendo(e.target)
      if (!ctrlK && !barra) return
      e.preventDefault()
      entrada.current?.focus()
      entrada.current?.select()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [atajo])

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && primero) { e.preventDefault(); e.currentTarget.blur(); alCambiar(''); alElegir?.(); navegar(primero.a) }
    else if (e.key === 'Escape') { alCambiar(''); entrada.current?.blur() }
  }

  return (
    <div className={cn('relative', className)} role="search">
      <label htmlFor={`${id}-campo`} className="sr-only">Buscar en el menú</label>
      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-salvia" />
      <input
        id={`${id}-campo`} ref={entrada} type="search" autoComplete="off" spellCheck={false}
        placeholder={atajo ? 'Buscar en el menú (/)' : 'Buscar en el menú'}
        value={valor} onChange={(e) => alCambiar(e.target.value)} onKeyDown={alTeclear}
        className="h-10 w-full rounded-control border border-linea bg-papel pl-9 pr-9 text-sm text-tinta placeholder:text-salvia focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30 [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button type="button" onClick={() => { alCambiar(''); entrada.current?.focus() }} title="Borrar búsqueda"
          className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-control text-salvia hover:bg-fondo hover:text-tinta">
          <X size={15} aria-hidden /><span className="sr-only">Borrar búsqueda</span>
        </button>
      )}
    </div>
  )
}
