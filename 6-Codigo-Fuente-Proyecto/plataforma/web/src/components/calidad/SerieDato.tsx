// El dato en su contexto: la serie del niño para ese concepto (p. ej. su peso en cada visita) con el rango esperado
// sombreado sobre el punto revisado o, si no hay serie, el valor frente a su rango esperado.
import type { DatoRevision } from '../../api/tipos'
import { aproximado, medida, unidad as unidadLegible } from '../../lib/formato'
import { escalaRedonda, MiniSerie, RangoEsperado, type PuntoSerie } from '../graficos'

export function SerieDato({ dato }: { dato: DatoRevision }) {
  // como se escribe en clínica, igual que en la fila de la cola: «GRAMOS» → «g»
  const unidad = dato.unidad ? ` ${unidadLegible(dato.unidad)}` : ''
  const nombre = dato.etiqueta ?? dato.variable
  const este = dato.serie.find((p) => p.es_este)
  const { rango_bajo: bajo, rango_alto: alto } = dato
  if (dato.serie.length >= 2) {
    const valores = [...dato.serie.map((p) => p.valor), ...(este && bajo != null ? [bajo] : []), ...(este && alto != null ? [alto] : [])]
    const [min, max] = [Math.min(...valores), Math.max(...valores)]
    const eje = escalaRedonda([min, max])
    const ordenes = dato.serie.map((p) => p.orden)
    const nombres = new Map(dato.serie.map((p) => [p.orden, p.etapa_nombre ?? '']))
    return (
      <MiniSerie
        alto={130}
        etiqueta={`${nombre} de este niño en cada visita: ${dato.serie.map((p) => `${p.etapa_nombre}, ${aproximado(p.valor)}${unidad}`).join('; ')}`}
        puntos={dato.serie.map((p): PuntoSerie => ({
          x: p.orden, y: p.valor, marcado: p.es_este,
          titulo: p.etapa_nombre ?? '',
          detalle: [`${aproximado(p.valor)}${unidad}`, ...(p.es_este ? ['El dato por revisar'] : [])],
        }))}
        dominioY={eje.dominio} ticksY={eje.ticks} formatoY={aproximado}
        dominioX={[ordenes[0], ordenes[ordenes.length - 1]]} ticksX={ordenes} formatoX={(v) => nombres.get(v) ?? ''}
        franjas={este && bajo != null && alto != null ? [{ desde: bajo, hasta: alto, x: [este.orden - 0.35, este.orden + 0.35] }] : []}
      />
    )
  }
  if (bajo == null || alto == null) return null
  const valor = Number(dato.valor)
  return (
    <div className="mt-2">
      <RangoEsperado bajo={bajo} alto={alto} esperado={dato.esperado} valor={Number.isFinite(valor) ? valor : null}
        etiqueta={`${nombre}: ${medida(dato.valor)}${unidad}; se esperaba entre ${aproximado(bajo)} y ${aproximado(alto)}`} />
    </div>
  )
}
