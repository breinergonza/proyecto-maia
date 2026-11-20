// «Comparación técnica»: el modelo completo frente a la regla de referencia (edad gestacional y pesos al nacer), con el mismo
// conjunto de prueba. Solo se dibuja si el entrenamiento guardó la referencia; los anteriores no la traen y no se inventa.
import type { DatosRendimiento } from '../../api/tipos'
import { dec2 } from '../../lib/formato'
import { Panel, Tabla } from '../ui'

const intervalo = (a: { ic_bajo: number | null; ic_alto: number | null }) =>
  a.ic_bajo != null && a.ic_alto != null ? `(${dec2(a.ic_bajo)} a ${dec2(a.ic_alto)})` : ''

const signo = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dec2(Math.abs(v))}`

export function ComparacionTecnica({ rend }: { rend: DatosRendimiento }) {
  const completo = rend.auc_desenlace
  const referencia = rend.referencia?.auc_desenlace
  if (referencia?.auc == null || completo.auc == null) return null
  return (
    <Panel titulo="Comparación técnica"
      descripcion="¿Sirve más que una regla simple? Se mide con los mismos niños de la prueba.">
      <Tabla>
        <thead>
          <tr><th>Modelo</th><th className="text-right">AUROC</th><th className="text-right">Diferencia</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Modelo de referencia<span className="block text-xs">(solo edad gestacional y pesos al nacer)</span></td>
            <td className="text-right tabular-nums"><b>{dec2(referencia.auc)}</b><span className="block text-xs">{intervalo(referencia)}</span></td>
            <td />
          </tr>
          <tr>
            <td className="font-semibold">Modelo completo</td>
            <td className="text-right tabular-nums"><b>{dec2(completo.auc)}</b><span className="block text-xs">{intervalo(completo)}</span></td>
            <td className="text-right font-semibold tabular-nums">{signo(completo.auc - referencia.auc)}</td>
          </tr>
        </tbody>
      </Tabla>
      <p className="mt-3 text-sm">
        La diferencia es cuánto mejor ordena el modelo completo que la regla de referencia; si los intervalos se montan, la ventaja
        puede ser casualidad.
      </p>
    </Panel>
  )
}
