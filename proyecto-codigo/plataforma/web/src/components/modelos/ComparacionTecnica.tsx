// «Comparación técnica»: el modelo completo frente a la regla de referencia (un modelo reducido con los datos que el Diccionario
// nombra en «Comparar con»: la talla que el niño ya tiene, o la edad gestacional y los pesos al nacer), con el mismo conjunto de
// prueba. Solo se dibuja si el entrenamiento guardó la referencia; los anteriores no la traen y no se inventa. Un entrenamiento
// nuevo dice con qué datos se calcula la regla y da la diferencia con su intervalo del 95 %.
import type { DatosRendimiento } from '../../api/tipos'
import { dec2 } from '../../lib/formato'
import { Panel, Tabla } from '../ui'

/** −0,03: el signo menos tipográfico, también en los extremos de un intervalo. */
const conSigno = (v: number) => `${v < 0 ? '−' : ''}${dec2(Math.abs(v))}`
const intervalo = (a: { ic_bajo: number | null; ic_alto: number | null }) =>
  a.ic_bajo != null && a.ic_alto != null ? `(${conSigno(a.ic_bajo)} a ${conSigno(a.ic_alto)})` : ''

const signo = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dec2(Math.abs(v))}`

/** Los entrenamientos anteriores no guardaron con qué datos se calcula la regla: era siempre esta. */
const REGLA_DE_ANTES = 'edad gestacional y pesos al nacer'

export function ComparacionTecnica({ rend }: { rend: DatosRendimiento }) {
  const completo = rend.auc_desenlace
  const referencia = rend.referencia?.auc_desenlace
  if (referencia?.auc == null || completo.auc == null) return null
  const entradas = rend.referencia?.entradas?.length ? rend.referencia.entradas.join(', ') : REGLA_DE_ANTES
  const dif = rend.referencia?.diferencia
  const conIntervalo = dif?.ic_bajo != null && dif.ic_alto != null
  return (
    <Panel titulo="Comparación técnica"
      descripcion="¿Sirve más que una regla simple? Se mide con los mismos niños de la prueba.">
      <Tabla>
        <thead>
          <tr><th>Modelo</th><th className="text-right">AUROC</th><th className="text-right">Diferencia</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Modelo de referencia<span className="block text-xs">(solo {entradas})</span></td>
            <td className="text-right tabular-nums"><b>{dec2(referencia.auc)}</b><span className="block text-xs">{intervalo(referencia)}</span></td>
            <td />
          </tr>
          <tr>
            <td className="font-semibold">Modelo completo</td>
            <td className="text-right tabular-nums"><b>{dec2(completo.auc)}</b><span className="block text-xs">{intervalo(completo)}</span></td>
            <td className="text-right font-semibold tabular-nums">
              {signo(dif?.valor ?? completo.auc - referencia.auc)}
              {dif && conIntervalo && <span className="block text-xs font-normal">{intervalo(dif)}</span>}
            </td>
          </tr>
        </tbody>
      </Tabla>
      <p className="mt-3 text-sm">
        La diferencia es cuánto mejor ordena el modelo completo que la regla de referencia
        {dif && conIntervalo
          ? (dif.ic_bajo as number) > 0
            ? '. El intervalo de la diferencia no incluye el 0: la ventaja del modelo completo no es casualidad.'
            : (dif.ic_alto as number) < 0
              ? '. El intervalo de la diferencia no incluye el 0: la regla de referencia ordena mejor que el modelo completo.'
              : '. El intervalo de la diferencia incluye el 0: la ventaja puede ser casualidad.'
          : '; si los intervalos se montan, la ventaja puede ser casualidad.'}
      </p>
    </Panel>
  )
}
