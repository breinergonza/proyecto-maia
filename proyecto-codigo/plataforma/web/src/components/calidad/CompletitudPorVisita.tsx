// «Completitud por visita»: de los niños con alguna medida de crecimiento en cada visita, qué porcentaje tiene talla. Cada
// celda dice su porcentaje y su denominador; la barra va de 0 a 100 %.
import type { ResumenCalidad } from '../../api/calidad'
import { num, pct } from '../../lib/formato'
import { Grafica } from '../grafica'
import { NotaGrafica } from '../modelos/NotaGrafica'

type Visita = ResumenCalidad['completitud']['etapas'][number]
const nombre = (v: Visita) => v.etapa_nombre ?? v.etapa

export function CompletitudPorVisita({ completitud }: { completitud: ResumenCalidad['completitud'] }) {
  const visitas = completitud.etapas
  const filas = visitas.map((v) => ({
    Visita: nombre(v), '% de niños con talla medida': v.pct, 'Niños con talla': v.con_dato, 'Niños con alguna medida': v.con_visita,
  }))
  return (
    <Grafica llenar titulo="Completitud por visita"
      descripcion="% de niños con talla medida entre los niños con alguna medida de crecimiento en esa visita."
      exportar={{ nombre: 'completitud-por-visita', filas }}>
      {visitas.length === 0 ? <p className="text-sm">Todavía no hay medidas de crecimiento para calcular la completitud.</p> : (
        <>
          <ul role="figure"
            aria-label={`Porcentaje de niños con talla medida por visita: ${visitas.map((v) => `${nombre(v)}, ${pct(v.pct)} (${num(v.con_dato)} de ${num(v.con_visita)})`).join('; ')}`}
            className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-x-4 gap-y-2.5">
            {visitas.map((v) => (
              <li key={v.etapa} className="min-w-0 text-sm">
                <span className="block font-semibold leading-tight">{nombre(v)}</span>
                <span className="my-1 block h-2.5 rounded-sm bg-teal-tinte" aria-hidden>
                  <span className="block h-full rounded-sm bg-teal-medio" style={{ width: `${Math.min(100, v.pct)}%` }} />
                </span>
                <span className="tabular-nums"><b>{pct(v.pct)}</b> <span className="text-xs">({num(v.con_dato)} de {num(v.con_visita)})</span></span>
              </li>
            ))}
          </ul>
          <NotaGrafica className="mt-3 border-t border-linea/70 pt-3" apilada datos={{
            variable: 'Talla medida (de ella sale la talla para la edad)',
            unidad: '% de niños',
            momento: 'Cada visita del programa, una barra por visita',
            poblacion: 'Niños con alguna medida de crecimiento (peso, talla o perímetro cefálico) en esa visita; quien no la tuvo no cuenta como faltante',
            validos: 'Niños con alguna medida en cada visita: el número va junto a cada porcentaje',
            porcentaje: 'Niños con talla medida (n) entre niños con alguna medida en la visita (N): «n de N» junto a cada barra',
          }} />
        </>
      )}
    </Grafica>
  )
}
