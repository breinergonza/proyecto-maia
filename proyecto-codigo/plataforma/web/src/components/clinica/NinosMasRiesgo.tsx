// «Niños del grupo con más riesgo»: los niños del grupo con el riesgo más alto en este desenlace, cada uno con su ficha,
// en una fila de una línea. El riesgo estimado se satura (muchos llegan a «más de 99,9 %») y no ordena a nadie, así que la
// fila dice su lugar entre los niños del grupo con riesgo calculado en esa visita («1.º de 95 · 3 m EC»): la API ya
// los manda ordenados por percentil y el denominador es el de «Riesgo estimado». Solo la ven los perfiles que pueden ver
// niños individuales: para los demás la API no manda la lista y la página no dibuja este panel.
import { Link } from 'react-router'
import type { NinoEnAlerta, RiesgoCorte } from '../../api/tipos'
import { dec, dec2, num, riesgo } from '../../lib/formato'
import { Panel, Tabla } from '../ui'
import { aMomento } from './RiesgoPorCorte'

/** Lugar de cada niño dentro de su visita de cálculo (los empates de percentil comparten lugar), con cuántos niños del
 *  grupo tienen riesgo calculado en esa visita cuando hay una sola fila de riesgo para ella. */
export function lugares(ninos: NinoEnAlerta[], filas: RiesgoCorte[]) {
  const previo = new Map<string, { vistos: number; percentil: number; lugar: number }>()
  return ninos.map((n) => {
    const p = previo.get(n.momento)
    const vistos = (p?.vistos ?? 0) + 1
    const lugar = p && p.percentil === n.percentil ? p.lugar : vistos
    previo.set(n.momento, { vistos, percentil: n.percentil, lugar })
    const delCorte = filas.filter((f) => f.momento === n.momento)
    return { lugar, de: delCorte.length === 1 ? delCorte[0].calculados : null }
  })
}

export function NinosMasRiesgo({ ninos, riesgos, medida, className }: {
  ninos: NinoEnAlerta[]
  /** Las filas de «Riesgo estimado»: dan cuántos niños del grupo tienen riesgo calculado en cada visita. */
  riesgos: RiesgoCorte[]
  medida: string
  className?: string
}) {
  const puestos = lugares(ninos, riesgos)
  return (
    <Panel llenar className={className} titulo="Niños del grupo con más riesgo"
      descripcion="Lugar: entre los del grupo con riesgo calculado en esa visita.">
      {ninos.length === 0 ? (
        <p className="text-sm">Ningún niño del grupo está en alerta con los cálculos de ahora.</p>
      ) : (
        // el encabezado queda fijo mientras la lista se desplaza dentro del panel; -top-4 descuenta el relleno del panel
        // (con top-0 quedaba una franja de 16 px por la que se veían pasar las filas)
        <Tabla densa apilar className="xl:overflow-visible [&_th]:sticky [&_th]:-top-4 [&_th]:z-10 [&_th]:bg-papel [&_th]:whitespace-normal!">
          <thead>
            <tr>
              <th>Niño</th>
              <th className="text-right">Edad gestacional</th>
              <th>Lugar en el grupo</th>
              <th className="text-right">{medida}</th>
            </tr>
          </thead>
          <tbody>
            {ninos.map((n, i) => {
              const { lugar, de } = puestos[i]
              const momento = aMomento(n.momento)
              const visita = n.momento.replace(' (edad corregida)', ' EC')
              return (
                <tr key={n.sujeto}>
                  <td>
                    <Link className="font-semibold text-teal underline-offset-2 hover:underline" to={`/ninos/${encodeURIComponent(n.sujeto)}`}>{n.sujeto}</Link>
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums">{n.semanas == null ? <span className="text-salvia">sin dato</span> : `${dec(n.semanas)} sem`}</td>
                  <td className="whitespace-nowrap tabular-nums"
                    title={`Riesgo estimado ${momento}: ${riesgo(n.riesgo)}${de == null ? '' : `; ${lugar}.º entre los ${num(de)} niños del grupo con riesgo calculado ${momento}`}.`}>
                    {lugar}.º{de == null ? '' : ` de ${num(de)}`} · {visita}
                  </td>
                  <td className="text-right tabular-nums">{n.ultima_z == null ? <span className="text-salvia">—</span> : dec2(n.ultima_z)}</td>
                </tr>
              )
            })}
          </tbody>
        </Tabla>
      )}
    </Panel>
  )
}
