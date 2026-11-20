// Lo que cada gráfica dice de sí misma (S6): variable, unidad, momento clínico, población, observaciones válidas, porcentaje
// y denominador. Se escribe junto a la gráfica, en el mismo orden en todas, para que se pueda leer sin adivinar.
import { Fragment } from 'react'
import { cn } from '../../lib/cn'

export interface DatosNota {
  variable: string
  unidad: string
  momento: string
  poblacion: string
  /** Observaciones válidas (con cuántos niños o mediciones se dibuja). */
  validos: string
  /** Cómo se calcula el porcentaje y contra qué denominador. */
  porcentaje: string
}

const ROTULOS: [keyof DatosNota, string][] = [
  ['variable', 'Variable'], ['unidad', 'Unidad'], ['momento', 'Momento'], ['poblacion', 'Población'],
  ['validos', 'Datos válidos'], ['porcentaje', 'Porcentaje y denominador'],
]

export function NotaGrafica({ datos, className }: { datos: DatosNota; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-tinta/80', className)}>
      {ROTULOS.map(([clave, rotulo]) => (
        <Fragment key={clave}>
          <dt className="font-semibold text-tinta">{rotulo}</dt>
          <dd>{datos[clave]}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
