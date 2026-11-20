// «Completitud por visita»: de los niños con alguna medida de crecimiento en cada visita, qué porcentaje tiene talla. Cada
// barra dice su porcentaje y su denominador; el eje va de 0 a 100 %.
import type { ResumenCalidad } from '../../api/calidad'
import { num, pct } from '../../lib/formato'
import { Grafica } from '../grafica'
import { NotaGrafica } from '../modelos/NotaGrafica'

type Visita = ResumenCalidad['completitud']['etapas'][number]
const nombre = (v: Visita) => v.etapa_nombre ?? v.etapa
const COLUMNAS = 'grid-cols-[3.75rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)_8rem]'

export function CompletitudPorVisita({ completitud }: { completitud: ResumenCalidad['completitud'] }) {
  const visitas = completitud.etapas
  const filas = visitas.map((v) => ({
    Visita: nombre(v), '% de niños con talla medida': v.pct, 'Niños con talla': v.con_dato, 'Niños con alguna medida': v.con_visita,
  }))
  return (
    <Grafica titulo="Completitud por visita"
      descripcion="Qué parte de los niños que tuvieron la visita tiene su talla medida."
      exportar={{ nombre: 'completitud-por-visita', filas }}>
      {visitas.length === 0 ? <p className="text-sm">Todavía no hay medidas de crecimiento para calcular la completitud.</p> : (
        <>
          <ul role="figure"
            aria-label={`Porcentaje de niños con talla medida por visita: ${visitas.map((v) => `${nombre(v)}, ${pct(v.pct)} (${num(v.con_dato)} de ${num(v.con_visita)})`).join('; ')}`}
            className="space-y-2">
            {visitas.map((v) => (
              <li key={v.etapa} className={`grid ${COLUMNAS} items-center gap-x-2 gap-y-0.5 text-sm`}>
                <span className="font-semibold">{nombre(v)}</span>
                <span className="h-3.5 rounded-sm bg-teal-tinte" aria-hidden>
                  <span className="block h-full rounded-sm bg-teal-medio" style={{ width: `${Math.min(100, v.pct)}%` }} />
                </span>
                <span className="col-start-2 tabular-nums sm:col-start-auto sm:text-right">
                  <b>{pct(v.pct)}</b> <span className="text-xs">({num(v.con_dato)} de {num(v.con_visita)})</span>
                </span>
              </li>
            ))}
          </ul>
          <div className={`mt-1 grid ${COLUMNAS} gap-x-2 text-xs`} aria-hidden>
            <span />
            <span className="flex justify-between border-t border-linea pt-0.5"><span>0 %</span><span>50 %</span><span>100 %</span></span>
          </div>
          <p className="mt-1 text-center text-xs font-semibold">% de niños con talla medida</p>
          <NotaGrafica className="mt-3 border-t border-linea/70 pt-3" datos={{
            variable: 'Talla medida (de ella sale la talla para la edad)',
            unidad: '% de niños',
            momento: 'Cada visita del programa: una barra por visita',
            poblacion: 'Niños con alguna medida de crecimiento (peso, talla o perímetro cefálico) en esa visita; quien no la tuvo no cuenta como faltante',
            validos: `${visitas.map((v) => `${nombre(v)}: ${num(v.con_visita)}`).join('; ')} niños`,
            porcentaje: 'Niños con talla medida entre niños con alguna medida en la visita; el denominador está junto a cada barra',
          }} />
        </>
      )}
    </Grafica>
  )
}
