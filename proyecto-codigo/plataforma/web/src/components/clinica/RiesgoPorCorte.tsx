// «Riesgo estimado de …»: por cada momento en que se calcula, cuántos niños del grupo tienen cálculo y cuántos están en
// alerta. Un desenlace sin modelo en el paquete activo no tiene filas: se dice en vez de dejar el panel vacío.
import type { RiesgoCorte } from '../../api/tipos'
import { num, pct } from '../../lib/formato'
import { sinRiesgoEstimado } from '../../lib/lenguaje'
import { Insignia, Panel } from '../ui'

/** «40 sem» → «las 40 semanas»; «3 m EC» → «los 3 meses»; lo que no se reconoce se deja como llega. */
export function momentoTexto(momento: string): string {
  const semanas = /^(\d+)\s*sem/i.exec(momento)
  if (semanas) return `las ${semanas[1]} semanas`
  const meses = /^(\d+)\s*m(?:\b|$)/i.exec(momento)
  if (meses) return Number(meses[1]) === 1 ? '1 mes' : `los ${meses[1]} meses`
  return momento
}

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

export function RiesgoPorCorte({ nombre, filas, conModelo, alertaPercentil }: {
  nombre: string; filas: RiesgoCorte[]; conModelo: boolean; alertaPercentil: number
}) {
  const enPrueba = filas.some((f) => f.estado === 'en_prueba')
  return (
    <Panel titulo={`Riesgo estimado de ${minuscula(nombre)}`}
      descripcion="Niños del grupo en alerta, según el riesgo calculado con lo medido hasta cada visita.">
      {filas.length === 0 ? (
        <p className="text-sm">{sinRiesgoEstimado(conModelo, 'del grupo')}</p>
      ) : (
        <>
          {enPrueba && <p className="mb-3 text-sm font-semibold text-ocre-hondo">En prueba: este modelo aún no está validado.</p>}
          <ul className="divide-y divide-linea">
            {filas.map((f) => (
              <li key={f.clave} className="py-3 first:pt-0">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  Calculado a {momentoTexto(f.momento)}:
                  {f.estado === 'en_prueba' && <Insignia tono="ocre">En prueba</Insignia>}
                </p>
                <p className="mt-0.5 text-lg font-semibold text-teal">
                  {num(f.en_alerta)} de {num(f.calculados)} niños en alerta ({pct(f.pct_en_alerta)})
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-salvia">
            En alerta: entre el {100 - alertaPercentil} % de los niños con más riesgo para este desenlace. Apoyo a la decisión, no diagnóstico.
          </p>
        </>
      )}
    </Panel>
  )
}
