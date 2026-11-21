// «Resultados observados a los 12 meses»: el porcentaje de niños del grupo que tuvo el desenlace, entre los que tienen dato a los
// 12 meses (con su numerador, su denominador y cuántos no tienen dato), y la población completa como referencia. Si el
// grupo es toda la población, una línea corta lo dice en vez de repetir la misma cifra.
import type { ObservadoClinico } from '../../api/tipos'
import { num, pct } from '../../lib/formato'
import { Panel } from '../ui'

export function Observado({ grupo, poblacion, esPoblacion, className }: {
  grupo: ObservadoClinico | null; poblacion: ObservadoClinico | null
  /** El grupo son todos los niños: la referencia sería la misma cifra. */
  esPoblacion: boolean
  className?: string
}) {
  return (
    <Panel className={className} titulo="Resultados observados a los 12 meses">
      {grupo ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-3xl font-bold leading-none tracking-tight text-teal">{pct(grupo.pct)}</p>
          <p className="text-sm">
            {num(grupo.casos)} de {num(grupo.con_dato)} niños con dato a los 12 meses · {num(grupo.sin_dato)} sin dato
          </p>
        </div>
      ) : (
        <p className="text-sm">Ningún niño del grupo elegido tiene dato a los 12 meses.</p>
      )}
      {esPoblacion ? (
        <p className="mt-2 text-sm">Referencia: el grupo es toda la población.</p>
      ) : poblacion && (
        <p className="mt-2 text-sm">
          Toda la población (referencia): <strong className="text-tinta">{pct(poblacion.pct)}</strong> · {num(poblacion.casos)} de {num(poblacion.con_dato)} niños con dato
        </p>
      )}
    </Panel>
  )
}
