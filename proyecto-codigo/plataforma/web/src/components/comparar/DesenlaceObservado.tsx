// Un desenlace a los 12 meses en los dos grupos: lo observado (con «x de n con dato», los que no tienen dato y la
// diferencia de B frente a A con su intervalo) y, aparte y rotulado como estimado, el riesgo que calcula el modelo en
// cada corte. Lo observado es lo que pasó; el riesgo estimado no, y no se mezclan.
import type { DesenlaceComparado, GruposClinicoOk, RiesgoDeCorte } from '../../api/comparar'
import { num } from '../../lib/formato'
import { Panel, Tabla } from '../ui'
import { BarrasObservado, claridad, FichaDelDato, MENOS_DE_5, ninos, porcentaje, textoDiferencia, variableDe } from './comun'

const ESTADO = { en_prueba: 'En prueba', en_uso: 'En uso' } as const

function celdaRiesgo(r: RiesgoDeCorte | null): string {
  if (r?.calculados == null || r.en_alerta == null) return MENOS_DE_5
  return `${num(r.en_alerta)} de ${num(r.calculados)} en alerta (${porcentaje((100 * r.en_alerta) / r.calculados)})`
}

function RiesgoEstimado({ d, alerta }: { d: DesenlaceComparado; alerta: number }) {
  return (
    <section className="mt-5 border-t border-linea pt-4">
      <h3 className="text-sm">Riesgo estimado por el modelo: no es lo observado</h3>
      <p className="mt-1 text-sm">
        Niños de cada grupo en alerta (entre el {100 - alerta} % con más riesgo) en cada corte. Lo calcula el modelo con los datos
        hasta esa visita; no es lo que ocurrió a los 12 meses.
      </p>
      {d.riesgo.length === 0 ? (
        <p className="mt-2 text-sm">El paquete de modelos activo no calcula este desenlace para estos grupos.</p>
      ) : (
        <div className="mt-2">
          <Tabla densa apilar>
            <caption className="sr-only">Riesgo estimado de {d.nombre.toLowerCase()} por corte</caption>
            <thead><tr><th>Calculado a</th><th>Grupo A</th><th>Grupo B</th><th>Estado del modelo</th></tr></thead>
            <tbody>
              {d.riesgo.map((f) => (
                <tr key={f.clave}>
                  <td>{f.momento_nombre}</td><td>{celdaRiesgo(f.a)}</td><td>{celdaRiesgo(f.b)}</td><td>{ESTADO[f.estado]}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      )}
    </section>
  )
}

export function DesenlaceObservado({ d, r, conRiesgo }: { d: DesenlaceComparado; r: GruposClinicoOk; conRiesgo: boolean }) {
  const texto = textoDiferencia(d.dif)
  const aclaracion = claridad(d.dif)
  return (
    <Panel titulo={d.nombre} descripcion={d.definicion}>
      <BarrasObservado a={d.a} b={d.b} etiqueta="Niños con el desenlace entre los que tienen dato a los 12 meses (%)" />
      <div className="mt-4 border-t border-linea pt-3 text-sm">
        {texto ? (
          <>
            <p><strong>Diferencia:</strong> {texto}</p>
            {aclaracion && <p className="mt-0.5">{aclaracion}</p>}
          </>
        ) : <p>No se compara: cada lado necesita 20 niños con dato.</p>}
      </div>
      <FichaDelDato items={{
        variable: variableDe(d, r.trayectoria.umbral), unidad: '% de niños con dato', momento: '12 meses de edad corregida',
        poblacion: `niños de cada grupo con el dato a los 12 meses (Grupo A: ${ninos(r.a.n)} elegibles; Grupo B: ${ninos(r.b.n)} elegibles)`,
        validos: `Grupo A: ${ninos(d.a?.con_dato)}; Grupo B: ${ninos(d.b?.con_dato)} niños con dato (denominador del porcentaje)`,
      }} />
      {conRiesgo && <RiesgoEstimado d={d} alerta={r.alerta_percentil} />}
    </Panel>
  )
}
