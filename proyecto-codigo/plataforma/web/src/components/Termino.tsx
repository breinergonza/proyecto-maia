// Término técnico con su explicación breve: aparece al pasar el cursor, al enfocar con teclado o al tocar, y se cierra con Escape.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { GLOSARIO, type IdTermino } from '../lib/glosario'

export function Termino({ id, children }: { id: IdTermino; children: ReactNode }) {
  const idDef = useId()
  const [fijo, setFijo] = useState(false)      // abierto por clic
  const [pasando, setPasando] = useState(false) // cursor o foco encima
  const visible = fijo || pasando
  const cerrar = () => { setFijo(false); setPasando(false) }
  // la definición se abre bajo el término, alineada a su izquierda; si así se sale de la pantalla (un término cerca
  // del borde, en el teléfono), se corre lo justo hacia adentro, dejando 8 px de margen
  const refDef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const def = refDef.current
    if (!def || !visible) return
    const margen = 8
    const izquierda = def.parentElement?.getBoundingClientRect().left ?? 0
    const sobra = izquierda + def.offsetWidth - (window.innerWidth - margen)
    const corrimiento = sobra > 0 ? Math.max(-sobra, margen - izquierda) : 0
    def.style.translate = corrimiento ? `${corrimiento}px 0` : ''
  }, [visible])
  return (
    <span className="relative inline-block" onMouseEnter={() => setPasando(true)} onMouseLeave={() => setPasando(false)}>
      <button type="button" aria-describedby={idDef} aria-expanded={visible}
        className="cursor-help underline decoration-dotted underline-offset-2"
        onClick={() => setFijo((v) => !v)} onFocus={() => setPasando(true)}
        onBlur={() => { setPasando(false); setFijo(false) }}
        onKeyDown={(e) => { if (e.key === 'Escape') { cerrar(); e.stopPropagation() } }}>
        {children}<span className="sr-only"> (¿qué significa?)</span>
      </button>
      <span ref={refDef} id={idDef} role="tooltip" hidden={!visible}
        className="absolute left-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-1rem)] rounded-control border border-salvia/30 bg-white p-2 text-left text-xs font-normal leading-snug text-tinta shadow-lg">
        {GLOSARIO[id]}
      </span>
    </span>
  )
}
