// «Riesgo estimado de …»: por cada visita en que se calcula, una línea con cuántos de los niños del grupo con riesgo
// calculado (solo los que siguen en seguimiento a esa visita: es el denominador) están en alerta. «En prueba» sale una
// sola vez, en el título, y dice qué cortes no lo están. Un desenlace sin modelo en el paquete activo no tiene filas: se
// dice en vez de dejar el panel vacío.
import type { RiesgoCorte } from '../../api/tipos'
import { num, pct } from '../../lib/formato'
import { definicionAlerta, sinRiesgoEstimado } from '../../lib/lenguaje'
import { Insignia, Panel } from '../ui'

/** «40 sem» → «las 40 semanas»; «3 m EC» → «los 3 meses»; «hospitalización» → «la hospitalización»; lo demás, tal cual. */
export function momentoTexto(momento: string): string {
  const semanas = /^(\d+)\s*sem/i.exec(momento)
  if (semanas) return `las ${semanas[1]} semanas`
  const meses = /^(\d+)\s*m(?:\b|$)/i.exec(momento)
  if (meses) return Number(meses[1]) === 1 ? '1 mes' : `los ${meses[1]} meses`
  if (/^hospitali/i.test(momento)) return `la ${momento.toLowerCase()}`
  return momento
}

/** «a las 40 semanas», «a los 3 meses», «en la hospitalización». */
export const aMomento = (momento: string) => {
  const texto = momentoTexto(momento)
  return /^hospitali/i.test(momento) ? `en ${texto}` : `a ${texto}`
}

/** Una sola marca para los cortes en prueba: «En prueba», o «En prueba, salvo a los 6 meses» si alguno está en uso. */
export function marcaEnPrueba(filas: RiesgoCorte[]): string | null {
  if (!filas.some((f) => f.estado === 'en_prueba')) return null
  const enUso = filas.filter((f) => f.estado !== 'en_prueba').map((f) => aMomento(f.momento))
  return enUso.length ? `En prueba, salvo ${enUso.join(' y ')}` : 'En prueba'
}

export function RiesgoPorCorte({ filas, conModelo, alertaPercentil, desenlace, className }: {
  filas: RiesgoCorte[]; conModelo: boolean; alertaPercentil: number
  /** El desenlace que se estima («Talla baja a los 12 meses»): va en el título. */
  desenlace?: string
  className?: string
}) {
  const marca = marcaEnPrueba(filas)
  const titulo = desenlace ? `Riesgo estimado de ${desenlace.charAt(0).toLowerCase()}${desenlace.slice(1)}` : 'Riesgo estimado'
  return (
    <Panel className={className} titulo={titulo} accion={marca && <Insignia tono="ocre">{marca}</Insignia>}
      descripcion={filas.length ? `Solo tienen riesgo calculado los niños del grupo que siguen en seguimiento. ${definicionAlerta(alertaPercentil)}` : undefined}>
      {filas.length === 0 ? (
        <p className="text-sm">{sinRiesgoEstimado(conModelo, 'del grupo')}</p>
      ) : (
        // en pantallas anchas cada momento es una columna: usa el ancho del panel en vez de dejarlo vacío
        <ul className="-my-1 divide-y divide-linea/70 text-sm 2xl:my-0 2xl:grid 2xl:auto-cols-fr 2xl:grid-flow-col 2xl:divide-x 2xl:divide-y-0">
          {filas.map((f) => (
            <li key={f.clave} className="py-1 tabular-nums 2xl:px-4 2xl:py-0 2xl:first:pl-0 2xl:last:pr-0">
              <span className="font-semibold 2xl:block">Calculado {aMomento(f.momento)}<span className="2xl:hidden">:</span></span>{' '}
              <strong className="text-teal 2xl:block 2xl:text-base">{num(f.en_alerta)} de {num(f.calculados)} niños en alerta ({pct(f.pct_en_alerta)})</strong>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
