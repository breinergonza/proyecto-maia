// «Qué les pasó a los 12 meses»: el porcentaje de niños del grupo que tuvo el desenlace, entre los que tienen dato a los
// 12 meses (con su numerador, su denominador y cuántos no tienen dato), y la población completa como referencia.
import type { ObservadoClinico } from '../../api/tipos'
import { num, pct } from '../../lib/formato'
import { Panel } from '../ui'

export function Observado({ grupo, poblacion }: { grupo: ObservadoClinico | null; poblacion: ObservadoClinico | null }) {
  return (
    <Panel titulo="Qué les pasó a los 12 meses"
      descripcion="Porcentaje de niños que tuvo el desenlace, entre los que tienen dato a los 12 meses.">
      {grupo ? (
        <div>
          <p className="text-sm font-semibold">Observado en el grupo</p>
          <p className="mt-1 text-4xl font-bold leading-none tracking-tight text-teal">{pct(grupo.pct)}</p>
          <p className="mt-2 text-sm">
            {num(grupo.casos)} de {num(grupo.con_dato)} niños con dato a los 12 meses · {num(grupo.sin_dato)} sin dato
          </p>
        </div>
      ) : (
        <p className="text-sm">Con el grupo elegido hay muy pocos niños con dato a los 12 meses para dar una cifra.</p>
      )}
      {poblacion && (
        <div className="mt-4 border-t border-linea pt-3">
          <p className="text-sm">Toda la población (referencia):</p>
          <p className="mt-0.5 text-sm">
            <strong className="text-lg text-tinta">{pct(poblacion.pct)}</strong> · {num(poblacion.casos)} de {num(poblacion.con_dato)} niños con dato
          </p>
        </div>
      )}
    </Panel>
  )
}
