// Navegación por teclado de las gráficas: el contenedor recibe foco, las flechas izquierda y derecha (y Inicio y Fin)
// recorren los puntos o las barras, y el valor se anuncia en una región aria-live="polite" fuera de pantalla.
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

const AYUDA = 'Con el teclado, use las flechas izquierda y derecha para recorrer los valores.'

/** Contenedor de una gráfica: figura con nombre y resumen, enfocable, con anuncio del valor al recorrerla. */
export function GraficaNavegable({ etiqueta, resumen, items, children, className, style }: {
  etiqueta: string
  /** Una frase de resumen, p. ej. «Barras: 5 categorías». */
  resumen?: string
  /** Un texto por punto o barra, en el orden de lectura. */
  items: string[]
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const [i, setI] = useState(-1)
  const n = items.length
  const mover = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0 || e.target !== e.currentTarget) return
    let sig: number | null = null
    if (e.key === 'ArrowRight') sig = Math.min(n - 1, i + 1)
    else if (e.key === 'ArrowLeft') sig = Math.max(0, i < 0 ? 0 : i - 1)
    else if (e.key === 'Home') sig = 0
    else if (e.key === 'End') sig = n - 1
    if (sig == null) return
    e.preventDefault()
    setI(sig)
  }
  const descripcion = [resumen, n > 0 ? AYUDA : null].filter(Boolean).join('. ').replace(/\.\./g, '.')
  return (
    <div role="figure" aria-label={etiqueta} aria-description={descripcion || undefined} tabIndex={n > 0 ? 0 : undefined}
      onKeyDown={mover} onBlur={() => setI(-1)} style={style}
      className={cn('rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-medio', className)}>
      {children}
      <p role="status" aria-live="polite" className="sr-only">
        {i >= 0 && i < n ? `${i + 1} de ${n}. ${items[i]}` : ''}
      </p>
    </div>
  )
}

/** «Barras: 5 categorías» y similares, con el singular cuando hay una sola. */
export function resumenDe(tipo: string, n: number, unidad: [string, string]): string {
  return `${tipo}: ${n} ${n === 1 ? unidad[0] : unidad[1]}`
}
