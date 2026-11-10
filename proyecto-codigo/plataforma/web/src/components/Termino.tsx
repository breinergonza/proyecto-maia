// Término técnico con su explicación breve: aparece al pasar el cursor, al enfocar con teclado o al tocar, y se cierra con Escape.
import { useId, useState, type ReactNode } from 'react'
import { GLOSARIO, type IdTermino } from '../lib/glosario'

export function Termino({ id, children }: { id: IdTermino; children: ReactNode }) {
  const idDef = useId()
  const [fijo, setFijo] = useState(false)      // abierto por clic
  const [pasando, setPasando] = useState(false) // cursor o foco encima
  const visible = fijo || pasando
  const cerrar = () => { setFijo(false); setPasando(false) }
  return (
    <span className="relative inline-block" onMouseEnter={() => setPasando(true)} onMouseLeave={() => setPasando(false)}>
      <button type="button" aria-describedby={idDef} aria-expanded={visible}
        className="cursor-help underline decoration-dotted underline-offset-2"
        onClick={() => setFijo((v) => !v)} onFocus={() => setPasando(true)}
        onBlur={() => { setPasando(false); setFijo(false) }}
        onKeyDown={(e) => { if (e.key === 'Escape') { cerrar(); e.stopPropagation() } }}>
        {children}<span className="sr-only"> (¿qué significa?)</span>
      </button>
      <span id={idDef} role="tooltip" hidden={!visible}
        className="absolute left-0 top-full z-20 mt-1 w-64 rounded-control border border-salvia/30 bg-white p-2 text-left text-xs font-normal leading-snug text-tinta shadow-lg">
        {GLOSARIO[id]}
      </span>
    </span>
  )
}
