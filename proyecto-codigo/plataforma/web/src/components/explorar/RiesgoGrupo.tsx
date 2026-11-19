// Riesgo del grupo elegido: por desenlace, cuántos niños tienen riesgo alto y cuántos no.
import type { RiesgoDesenlace } from '../../api/tipos'
import { num } from '../../lib/formato'
import { BarrasApiladas, LeyendaSeries, type FilaSeries, type Serie } from '../graficos'
import { Tabla } from '../ui'

const SERIES: Serie[] = [
  { clave: 'alto', nombre: 'Riesgo alto', color: 1 },
  { clave: 'resto', nombre: 'Sin riesgo alto', color: 0 },
]

export function RiesgoGrupo({ filas }: { filas: RiesgoDesenlace[] }) {
  if (filas.length === 0) {
    return <p className="text-sm text-salvia">Ningún niño de este grupo tiene riesgo calculado con estos datos.</p>
  }
  const datos: FilaSeries[] = filas.map((d) => ({ x: d.desenlace, alto: d.altos, resto: Math.max(0, d.ninos - d.altos) }))
  return (
    <>
      <LeyendaSeries series={SERIES} marca="barra" />
      <BarrasApiladas filas={datos} series={SERIES} alto={200}
        etiqueta={`Niños del grupo por desenlace: ${filas.map((d) => `${d.desenlace}, ${num(d.altos)} con riesgo alto de ${num(d.ninos)}`).join('; ')}`} />
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-teal">Ver la tabla</summary>
        <Tabla densa>
          <thead><tr><th>Desenlace</th><th className="text-right">Niños</th><th className="text-right">Riesgo alto</th></tr></thead>
          <tbody>
            {filas.map((d) => (
              <tr key={d.clave}>
                <td><span className="font-semibold">{d.desenlace}</span><span className="block text-xs text-salvia">Visita: {d.momento_nombre}</span></td>
                <td className="text-right">{num(d.ninos)}</td>
                <td className="text-right">{num(d.altos)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </details>
    </>
  )
}
