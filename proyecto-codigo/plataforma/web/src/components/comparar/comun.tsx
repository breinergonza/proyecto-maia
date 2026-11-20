// Piezas comunes de las preguntas de Comparar grupos: los dos lados con su color fijo, la ficha de lo que muestra cada
// gráfica (variable, unidad, momento, población y observaciones válidas) y las barras de lo observado.
import type { DesenlaceComparado, DiferenciaObservada, ObservadoLado } from '../../api/comparar'
import { num } from '../../lib/formato'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { SERIES_COLOR, type Serie } from '../graficos'

export const SERIE_A: Serie = { clave: 'a', nombre: 'Grupo A', color: 0 }
export const SERIE_B: Serie = { clave: 'b', nombre: 'Grupo B', color: 1 }
export const SERIES_AB = [SERIE_A, SERIE_B]

const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
/** 13,1 % */
export const porcentaje = (v: number) => `${nf1.format(v)} %`
const conSigno = (v: number) => (v < 0 ? `−${nf1.format(-v)}` : nf1.format(v))

/** «Menos de 5» se dice igual en toda la pantalla. */
export const MENOS_DE_5 = N_MENOR_QUE_5

/** Qué grupo tiene más y cuánto, en puntos porcentuales: «5,3 puntos más en B (intervalo del 95 %: −0,8 a 11,4)». */
export function textoDiferencia(d: DiferenciaObservada): string | null {
  if (d.valor == null) return null
  const cuanto = nf1.format(Math.abs(d.valor))
  const quien = d.valor > 0 ? `${cuanto} puntos más en B` : d.valor < 0 ? `${cuanto} puntos más en A` : 'sin diferencia entre A y B'
  const intervalo = d.ic_bajo != null && d.ic_alto != null ? ` (intervalo del 95 %: ${conSigno(d.ic_bajo)} a ${conSigno(d.ic_alto)})` : ''
  return `${quien}${intervalo}`
}

/** Qué dice el intervalo: si no incluye el cero, la diferencia es clara. */
export const claridad = (d: DiferenciaObservada): string | null =>
  d.clara == null ? null : d.clara ? 'La diferencia es clara: el intervalo no incluye 0.' : 'El intervalo incluye 0: la diferencia no es clara.'

/** La variable del desenlace como se dice en la ficha de la gráfica: «talla baja (z menor que −2, OMS)». */
export function variableDe(f: DesenlaceComparado, umbral: number): string {
  const base = f.nombre.replace(/ a los 12 meses$/, '').toLowerCase()
  return f.indicador ? `${base} (z menor que ${String(umbral).replace('-', '−')}, OMS)` : base
}

/** Lo que cada gráfica o tabla declara de sí misma (S6): variable, unidad, momento, población y observaciones válidas. */
export function FichaDelDato({ items }: { items: { variable: string; unidad: string; momento: string; poblacion: string; validos: string } }) {
  const filas = [
    `Variable: ${items.variable}`, `Unidad: ${items.unidad}`, `Momento: ${items.momento}`,
    `Población: ${items.poblacion}`, `Observaciones válidas: ${items.validos}`,
  ]
  return (
    <ul className="mt-3 space-y-0.5 border-t border-linea pt-3 text-xs">
      {filas.map((f) => <li key={f}>{f}</li>)}
    </ul>
  )
}

/** Cuántos niños: «498» o «menos de 5» si la cifra se ocultó. */
export const ninos = (n: number | null | undefined) => (n == null ? 'menos de 5' : num(n))

function FilaObservada({ serie, o, techo }: { serie: Serie; o: ObservadoLado | null; techo: number }) {
  return (
    <div className="grid gap-x-3 gap-y-1 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-start">
      <span className="text-sm font-semibold">{serie.nombre}</span>
      <div className="min-w-0">
        {o?.pct != null && (
          <div aria-hidden className="h-6 rounded-sm bg-fondo">
            <div className="h-full rounded-sm" style={{ width: `${Math.min(100, (100 * o.pct) / techo)}%`, background: SERIES_COLOR[serie.color] }} />
          </div>
        )}
        {o == null ? <p className="text-sm">Menos de 5 niños con dato: no se da cifra.</p> : (
          <p className="mt-1 text-sm">
            {o.pct != null && <strong className="mr-1.5 text-base">{porcentaje(o.pct)}</strong>}
            <span>{num(o.casos)} de {num(o.con_dato)} niños con dato · {num(o.sin_dato)} sin dato</span>
            {o.pct == null && <span className="block">Sin porcentaje: se necesitan 20 niños con dato.</span>}
          </p>
        )}
      </div>
    </div>
  )
}

/** Dos barras horizontales con el porcentaje de niños con el desenlace en cada grupo, entre quienes tienen dato. Las
 *  barras son solo visuales: lo que se lee está en el texto de cada fila. */
export function BarrasObservado({ a, b, etiqueta }: { a: ObservadoLado | null; b: ObservadoLado | null; etiqueta: string }) {
  const mayor = Math.max(0, a?.pct ?? 0, b?.pct ?? 0)
  const techo = Math.max(10, Math.ceil(mayor / 10) * 10)
  return (
    <div className="space-y-3">
      <FilaObservada serie={SERIE_A} o={a} techo={techo} />
      <FilaObservada serie={SERIE_B} o={b} techo={techo} />
      {(a?.pct != null || b?.pct != null) && (
        <div aria-hidden className="grid sm:grid-cols-[5.5rem_minmax(0,1fr)]">
          <span />
          <div>
            <div className="flex justify-between text-xs"><span>0 %</span><span>{techo / 2} %</span><span>{techo} %</span></div>
            <p className="mt-0.5 text-center text-xs">{etiqueta}</p>
          </div>
        </div>
      )}
    </div>
  )
}
