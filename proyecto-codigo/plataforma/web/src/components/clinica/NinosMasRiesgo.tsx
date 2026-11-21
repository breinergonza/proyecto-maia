// «Niños del grupo con más riesgo»: los niños del grupo con el riesgo más alto en este desenlace, cada uno con su ficha,
// en una fila de una línea con su riesgo estimado en porcentaje y la visita con que se calculó. La API los manda ordenados
// por su lugar frente a los demás niños de esa visita (el percentil), que es lo que los ordena cuando el porcentaje se
// satura («más de 99,9 %»): ese lugar queda al pasar el cursor, con el denominador de «Riesgo estimado». Con todos los
// niños como grupo, un enlace lleva a la lista de Niños con los que están en alerta en la visita más reciente (esa lista
// no filtra por grupo, así que con un grupo filtrado no se ofrece). Solo la ven los perfiles que pueden ver niños
// individuales: para los demás la API no manda la lista y la página no dibuja este panel.
import { ArrowRight } from 'lucide-react'
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

export function NinosMasRiesgo({ ninos, riesgos, medida, alertaPercentil, esPoblacion, className }: {
  ninos: NinoEnAlerta[]
  /** Las filas de «Riesgo estimado»: dan cuántos niños del grupo tienen riesgo calculado en cada visita. */
  riesgos: RiesgoCorte[]
  medida: string
  /** Un niño está en alerta desde este percentil: el filtro del enlace a la lista de Niños. */
  alertaPercentil: number
  /** El grupo son todos los niños: solo entonces la lista de Niños (que no filtra por grupo) muestra los mismos. */
  esPoblacion: boolean
  className?: string
}) {
  const puestos = lugares(ninos, riesgos)
  // la visita de cálculo más reciente con niños en alerta: a esos lleva el enlace
  const reciente = esPoblacion ? [...riesgos].reverse().find((f) => f.en_alerta > 0) : undefined
  return (
    <Panel llenar className={className} titulo="Niños del grupo con más riesgo"
      descripcion="Riesgo estimado con lo medido hasta la visita indicada. Van primero los que más se alejan de los demás niños de su visita.">
      {ninos.length === 0 ? (
        <p className="text-sm">Ningún niño del grupo está en alerta con los cálculos de ahora.</p>
      ) : (
        <>
          {/* el encabezado queda fijo mientras la lista se desplaza dentro del panel; -top-4 descuenta el relleno del panel
              (con top-0 quedaba una franja de 16 px por la que se veían pasar las filas) */}
          <Tabla densa apilar className="xl:overflow-visible [&_th]:sticky [&_th]:-top-4 [&_th]:z-10 [&_th]:bg-papel [&_th]:whitespace-normal!">
            <thead>
              <tr>
                <th>Niño</th>
                <th className="text-right">Edad gestacional</th>
                <th>Riesgo estimado</th>
                <th className="text-right">{medida}</th>
              </tr>
            </thead>
            <tbody>
              {ninos.map((n, i) => {
                const { lugar, de } = puestos[i]
                const visita = n.momento.replace(' (edad corregida)', ' EC')
                return (
                  <tr key={n.sujeto}>
                    <td>
                      <Link className="font-semibold text-teal underline-offset-2 hover:underline" to={`/ninos/${encodeURIComponent(n.sujeto)}`}>{n.sujeto}</Link>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{n.semanas == null ? <span className="text-salvia">sin dato</span> : `${dec(n.semanas)} sem`}</td>
                    <td className="whitespace-nowrap tabular-nums"
                      title={`${lugar}.º entre los ${de == null ? '' : `${num(de)} `}niños del grupo con riesgo calculado ${aMomento(n.momento)}.`}>
                      <span className="font-semibold">{riesgo(n.riesgo)}</span> · {visita}
                    </td>
                    <td className="text-right tabular-nums">{n.ultima_z == null ? <span className="text-salvia">—</span> : dec2(n.ultima_z)}</td>
                  </tr>
                )
              })}
            </tbody>
          </Tabla>
          {reciente && (
            <Link to={`/ninos?desenlace=${encodeURIComponent(reciente.clave)}&percentil_min=${alertaPercentil}`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal underline underline-offset-2">
              {reciente.en_alerta === 1 ? 'Ver el niño en alerta' : `Ver los ${num(reciente.en_alerta)} niños en alerta`} {aMomento(reciente.momento)}
              <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </>
      )}
    </Panel>
  )
}
