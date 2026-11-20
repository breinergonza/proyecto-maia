// «Niños del grupo con más riesgo»: los niños del grupo con el riesgo más alto en este desenlace, cada uno con su ficha.
// Solo la ven los perfiles que pueden ver niños individuales: para los demás la API no manda la lista y la página no
// dibuja este panel.
import { Link } from 'react-router'
import type { NinoEnAlerta } from '../../api/tipos'
import { dec, dec2, riesgo } from '../../lib/formato'
import { Panel, Tabla } from '../ui'
import { momentoTexto } from './RiesgoPorCorte'

export function NinosMasRiesgo({ ninos, medida }: { ninos: NinoEnAlerta[]; medida: string }) {
  return (
    <Panel titulo="Niños del grupo con más riesgo" descripcion="Cada niño con su riesgo más reciente; el nombre lleva a su ficha.">
      {ninos.length === 0 ? (
        <p className="text-sm">Ningún niño del grupo está en alerta con los cálculos de ahora.</p>
      ) : (
        <Tabla densa>
          <thead>
            <tr>
              <th>Niño</th>
              <th>Edad gestacional</th>
              <th>Riesgo</th>
              <th className="text-right">{medida}</th>
            </tr>
          </thead>
          <tbody>
            {ninos.map((n) => (
              <tr key={n.sujeto}>
                <td><Link className="font-semibold text-teal underline-offset-2 hover:underline" to={`/ninos/${encodeURIComponent(n.sujeto)}`}>{n.sujeto}</Link></td>
                <td className="whitespace-nowrap">{n.semanas == null ? <span className="text-salvia">Sin dato</span> : `${dec(n.semanas)} sem`}</td>
                <td className="whitespace-nowrap">
                  {riesgo(n.riesgo)}
                  <span className="block text-xs text-salvia">a {momentoTexto(n.momento)}</span>
                </td>
                <td className="text-right tabular-nums">{n.ultima_z == null ? <span className="text-salvia">—</span> : dec2(n.ultima_z)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Panel>
  )
}
