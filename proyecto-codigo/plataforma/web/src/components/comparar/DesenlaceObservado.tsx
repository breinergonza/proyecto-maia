// Un desenlace a los 12 meses en los dos grupos: lo observado (con «x de n con dato», los que no tienen dato y la
// diferencia de B frente a A con su intervalo) y el riesgo que estima el modelo en cada corte, rotulado como estimado. Lo
// observado es lo que pasó; el riesgo estimado no, y no se mezclan. En un portátil las dos son vistas que se alternan en
// el mismo lugar; en una pantalla alta van una debajo de la otra.
import { useId } from 'react'
import type { DesenlaceComparado, GruposClinicoOk, RiesgoDeCorte } from '../../api/comparar'
import { cn } from '../../lib/cn'
import { num } from '../../lib/formato'
import { definicionAlerta, sinRiesgoEstimado } from '../../lib/lenguaje'
import { Insignia, Panel, Tabla } from '../ui'
import { BarrasObservado, FichaDelDato, MENOS_DE_5, poblacionAB, porcentaje, variableDe, Veredicto } from './comun'

export type Vista = 'observado' | 'riesgo'
/** La vista de la dirección (``?vista=``); sin ella, lo observado. */
export const vistaDe = (v: string | null): Vista => (v === 'riesgo' ? 'riesgo' : 'observado')

const ESTADO = { en_prueba: { texto: 'En prueba', tono: 'ocre' }, en_uso: { texto: 'En uso', tono: 'teal' } } as const

const explicaRiesgo = (alerta: number) =>
  `lo estima el modelo con los datos hasta cada corte; no es lo que pasó a los 12 meses. ${definicionAlerta(alerta)}`

/** El conmutador «Observado | Riesgo estimado» de «¿Les pasa algo distinto?», con lo que muestra la vista elegida. */
export function ElegirVista({ vista, elegir, alerta }: { vista: Vista; elegir: (v: Vista) => void; alerta: number }) {
  const nombre = useId()
  const opciones = [
    { clave: 'observado', texto: 'Observado', explica: 'Lo que pasó a los 12 meses en los niños de cada grupo con dato.' },
    { clave: 'riesgo', texto: 'Riesgo estimado', explica: `Riesgo estimado: ${explicaRiesgo(alerta)}` },
  ] as const
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div role="radiogroup" aria-label="Qué se muestra" className="inline-flex shrink-0 rounded-control border border-linea bg-fondo p-0.5">
        {opciones.map((o) => (
          <label key={o.clave} className={cn('min-h-9 cursor-pointer content-center rounded-control px-3 text-sm font-semibold transition-colors',
            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-teal',
            vista === o.clave ? 'bg-papel text-teal shadow-suave' : 'hover:text-teal')}>
            <input type="radio" name={nombre} value={o.clave} checked={vista === o.clave} onChange={() => elegir(o.clave)} className="sr-only" />
            {o.texto}
          </label>
        ))}
      </div>
      <p className="min-w-0 flex-1 basis-80 text-sm">{opciones.find((o) => o.clave === vista)?.explica}</p>
    </div>
  )
}

/** En una pantalla alta no hay conmutador: lo observado y el riesgo estimado van juntos, y esto dice una vez qué es cada uno. */
export function AmbasVistas({ alerta }: { alerta: number }) {
  return (
    <p className="text-sm">
      Arriba, lo que pasó a los 12 meses en los niños de cada grupo con dato. Debajo, el riesgo estimado: {explicaRiesgo(alerta)}
    </p>
  )
}

function celdaRiesgo(r: RiesgoDeCorte | null): string {
  if (r?.calculados == null || r.en_alerta == null || r.pct_en_alerta == null) return MENOS_DE_5
  return `${porcentaje(r.pct_en_alerta)} (${num(r.en_alerta)} de ${num(r.calculados)})`
}

function RiesgoEstimado({ d }: { d: DesenlaceComparado }) {
  if (d.riesgo.length === 0) return <p className="text-sm">{sinRiesgoEstimado(d.riesgo_con_modelo, 'de estos grupos')}</p>
  return (
    <Tabla densa apilar>
      <caption className="sr-only">Riesgo estimado de {d.nombre.toLowerCase()} por corte</caption>
      <thead><tr><th>Calculado a</th><th>Grupo A en alerta</th><th>Grupo B en alerta</th><th>Modelo</th></tr></thead>
      <tbody>
        {d.riesgo.map((f) => (
          <tr key={f.clave}>
            <td className="whitespace-nowrap font-semibold" title={f.momento_nombre}>{f.momento.charAt(0).toUpperCase() + f.momento.slice(1)}</td>
            <td className="whitespace-nowrap tabular-nums">{celdaRiesgo(f.a)}</td>
            <td className="whitespace-nowrap tabular-nums">{celdaRiesgo(f.b)}</td>
            <td><Insignia tono={ESTADO[f.estado].tono}>{ESTADO[f.estado].texto}</Insignia></td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  )
}

/** ``vista``: una de las dos, o ``ambas`` (una debajo de la otra). ``ancho``: el panel ocupa toda la fila, y lo observado
 *  se lee a la izquierda con la diferencia y la ficha a la derecha. */
export function DesenlaceObservado({ d, r, vista = 'observado', ancho = false }: {
  d: DesenlaceComparado; r: GruposClinicoOk; vista?: Vista | 'ambas'; ancho?: boolean
}) {
  const poblacion = poblacionAB(r.a.n, r.b.n)
  const observado = (
    <div className={cn(ancho && 'grid items-start gap-x-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
      <BarrasObservado a={d.a} b={d.b} />
      <div>
        <div className={cn('text-sm', !ancho && 'mt-3')}><Veredicto d={d.dif} /></div>
        <FichaDelDato items={{
          variable: variableDe(d, r.trayectoria.umbral), unidad: '% de niños con dato',
          momento: '12 meses de edad corregida', poblacion,
          validos: 'los niños con dato de cada fila (el denominador)',
        }} />
      </div>
    </div>
  )
  const riesgo = (
    <>
      <RiesgoEstimado d={d} />
      <FichaDelDato items={{
        variable: `riesgo estimado de ${variableDe(d, r.trayectoria.umbral)} a los 12 meses`,
        unidad: `% en alerta (riesgo entre el ${100 - r.alerta_percentil} % más alto de los niños con que se calibró el modelo)`,
        momento: 'cada corte, con los datos hasta esa visita', poblacion,
        validos: 'niños con riesgo calculado en cada corte (el denominador)',
      }} />
    </>
  )
  return (
    <Panel titulo={d.nombre} descripcion={d.definicion}>
      {vista === 'ambas' ? (
        <>
          {observado}
          <h3 className="mt-5 border-t border-linea pt-3 text-sm font-semibold">Riesgo estimado por el modelo (no es lo observado)</h3>
          <div className="mt-1">{riesgo}</div>
        </>
      ) : vista === 'riesgo' ? riesgo : observado}
    </Panel>
  )
}
