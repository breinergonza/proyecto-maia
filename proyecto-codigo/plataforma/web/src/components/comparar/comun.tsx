// Piezas comunes de las preguntas de Comparar grupos: los dos lados con su color fijo, la ficha de lo que muestra cada
// gráfica (variable, unidad, momento, población y observaciones válidas), el veredicto de la diferencia, las barras de lo
// observado y la celda «porcentaje y conteo» de las tablas.
import type { DesenlaceComparado, DiferenciaObservada, GruposClinicoOk, ObservadoLado } from '../../api/comparar'
import type { FilaCsv } from '../../lib/exportar'
import { num, numero } from '../../lib/formato'
import { cn } from '../../lib/cn'
import { SIN_CIFRA } from '../../lib/lenguaje'
import { SERIES_COLOR, type Serie } from '../graficos'

export const SERIE_A: Serie = { clave: 'a', nombre: 'Grupo A', color: 0 }
export const SERIE_B: Serie = { clave: 'b', nombre: 'Grupo B', color: 1 }
export const SERIES_AB = [SERIE_A, SERIE_B]

export const COLUMNAS_COMPARACION = ['Sección', 'Dato', 'Valor']

/** Las cifras de la comparación como filas de un CSV (sección, dato, valor): los dos grupos, lo observado a los 12 meses de
 *  cada desenlace con la diferencia de B frente a A y su intervalo, y la talla por visita con los niños con dato y el
 *  porcentaje sin dato de cada lado. Lo que la pantalla no muestra (un porcentaje con menos de 20 niños) tampoco sale. */
export function filasDeLaComparacion(r: GruposClinicoOk): FilaCsv[] {
  const filas: FilaCsv[] = []
  const agregar = (seccion: string, dato: string, valor: string | number | null | undefined) => {
    if (valor != null) filas.push({ Sección: seccion, Dato: dato, Valor: valor })
  }
  const lados = [{ serie: SERIE_A, lado: 'a' }, { serie: SERIE_B, lado: 'b' }] as const
  for (const { serie, lado } of lados) agregar('Grupos', `${serie.nombre}: niños elegibles`, r[lado].n)
  agregar('Grupos', 'Niños elegibles en total', r.a.n_total)

  for (const d of r.desenlaces) {
    const seccion = `Observado a los 12 meses: ${d.nombre}`
    for (const { serie, lado } of lados) {
      const o = d[lado]
      if (!o) continue
      if (o.pct != null) agregar(seccion, `${serie.nombre}: % con el desenlace`, numero(o.pct))
      agregar(seccion, `${serie.nombre}: casos`, o.casos)
      agregar(seccion, `${serie.nombre}: niños con dato`, o.con_dato)
      agregar(seccion, `${serie.nombre}: niños sin dato`, o.sin_dato)
    }
    if (d.dif.valor != null) agregar(seccion, 'Diferencia de B frente a A (puntos)', numero(d.dif.valor))
    if (d.dif.ic_bajo != null && d.dif.ic_alto != null) {
      agregar(seccion, 'Intervalo del 95 % de la diferencia', `${numero(d.dif.ic_bajo)} a ${numero(d.dif.ic_alto)}`)
    }
  }

  const talla = `${r.trayectoria.nombre} por visita (puntaje z)`
  for (const e of r.trayectoria.etapas) {
    for (const { serie, lado } of lados) {
      const c = e[lado]
      if (!c) continue
      agregar(talla, `${e.etapa}: ${serie.nombre}: mediana`, numero(c.mediana))
      agregar(talla, `${e.etapa}: ${serie.nombre}: niños con dato`, c.n)
      agregar(talla, `${e.etapa}: ${serie.nombre}: % sin dato`, numero(c.pct_sin_dato))
    }
  }
  return filas
}

const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
/** 13,1 % */
export const porcentaje = (v: number) => `${nf1.format(v)} %`
const conSigno = (v: number) => (v < 0 ? `−${nf1.format(-v)}` : nf1.format(v))

/** Lo que dice una celda donde ningún niño tiene el dato: un cero verdadero, no una cifra oculta. */
export const NINGUN_NINO = 'Ningún niño con dato'

/** Cuántos niños: «498», o «sin cifra» si el servidor no la dio. */
export const ninos = (n: number | null | undefined) => (n == null ? SIN_CIFRA : num(n))

/** La población de cada gráfica: los niños elegibles de cada grupo, dicha igual en todas. */
export const poblacionAB = (a: number | null, b: number | null) => `niños elegibles de A (${ninos(a)}) y de B (${ninos(b)})`

/** La diferencia de B frente a A en una sola frase, con su intervalo y lo que este dice: «No se ve una diferencia clara:
 *  5,3 puntos más en B; el intervalo del 95 % va de −0,8 a 11,4 puntos e incluye el 0.» */
export function Veredicto({ d }: { d: DiferenciaObservada }) {
  if (d.valor == null) return <p>No se compara: cada lado necesita 20 niños con dato.</p>
  const cuanto = nf1.format(Math.abs(d.valor))
  const quien = d.valor > 0 ? `${cuanto} puntos más en B` : d.valor < 0 ? `${cuanto} puntos más en A` : 'la misma proporción en A y en B'
  // el intervalo es de B frente a A; cuando hay más en A se da de A frente a B, en la misma dirección que la frase
  const [bajo, alto] = d.ic_bajo == null || d.ic_alto == null ? [null, null]
    : d.valor < 0 ? [-d.ic_alto, -d.ic_bajo] : [d.ic_bajo, d.ic_alto]
  const intervalo = bajo != null && alto != null ? `el intervalo del 95 % va de ${conSigno(bajo)} a ${conSigno(alto)} puntos` : null
  const titular = d.clara === true ? 'Diferencia clara' : d.clara === false ? 'No se ve una diferencia clara' : 'Diferencia'
  const cierre = !intervalo ? '.' : d.clara === false ? `; ${intervalo} e incluye el 0.` : `; ${intervalo}.`
  return <p><strong>{titular}:</strong> {quien}{cierre}</p>
}

export interface Ficha { variable: string; unidad: string; momento: string; poblacion: string; validos: string }

/** Lo que cada gráfica o tabla declara de sí misma (S6): variable, unidad, momento, población y observaciones válidas.
 *  Es un pie a la vista, no un desplegable: quien lee la cifra ve de qué es sin abrir nada. Va en letra de pie de
 *  gráfica, como el pie de ``Grafica``. */
export function FichaDelDato({ items }: { items: Ficha }) {
  const campos = [
    `Variable: ${items.variable}`, `Unidad: ${items.unidad}`, `Momento: ${items.momento}`,
    `Población: ${items.poblacion}`, `Observaciones válidas: ${items.validos}`,
  ]
  return (
    <p className="mt-3 border-t border-linea pt-2 text-xs leading-snug">
      {campos.map((c, i) => (
        <span key={c}>{i > 0 && <span aria-hidden className="mx-1.5 text-linea">·</span>}<span>{c}</span></span>
      ))}
    </p>
  )
}

/** Una cifra de tabla que no se parte: «5,2 %» y, al lado (debajo si no cabe), de cuántos niños («26 de 498»). */
export function PctDe({ pct, x, de }: { pct: number; x: number | null; de: number | null }) {
  return (
    <span className="tabular-nums">
      <strong className="whitespace-nowrap">{porcentaje(pct)}</strong> <span className="whitespace-nowrap">{num(x)} de {num(de)}</span>
    </span>
  )
}

/** Una barra de 0 a ``techo`` %, solo visual: la cifra se lee en el texto de al lado. */
export function Barra({ pct, techo, serie, className }: { pct: number; techo: number; serie: Serie; className?: string }) {
  return (
    <span aria-hidden className={cn('block h-2.5 shrink-0 rounded-sm bg-fondo', className)}>
      <span className="block h-full rounded-sm" style={{ width: `${Math.min(100, (100 * pct) / techo)}%`, background: SERIES_COLOR[serie.color] }} />
    </span>
  )
}

/** El tope de una escala de porcentajes: la decena que cubre el mayor (10 % como mínimo). */
export const techoDe = (valores: (number | null | undefined)[]) =>
  Math.max(10, Math.ceil(Math.max(0, ...valores.filter((v): v is number => v != null)) / 10) * 10)

/** La variable del desenlace como se dice en la ficha de la gráfica: «talla baja (z menor que −2, OMS)». */
export function variableDe(f: DesenlaceComparado, umbral: number): string {
  const base = f.nombre.replace(/ a los 12 meses$/, '').toLowerCase()
  return f.indicador ? `${base} (z menor que ${String(umbral).replace('-', '−')}, OMS)` : base
}

function FilaObservada({ serie, o, techo }: { serie: Serie; o: ObservadoLado | null; techo: number }) {
  return (
    <div className="grid gap-x-3 gap-y-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-start">
      <span className="text-sm font-semibold">{serie.nombre}</span>
      <div className="min-w-0">
        {o?.pct != null && (
          <div aria-hidden className="h-6 rounded-sm bg-fondo">
            <div className="h-full rounded-sm" style={{ width: `${Math.min(100, (100 * o.pct) / techo)}%`, background: SERIES_COLOR[serie.color] }} />
          </div>
        )}
        {o == null ? <p className="text-sm">{NINGUN_NINO}.</p> : (
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

/** Dos barras horizontales con el porcentaje de niños con el desenlace en cada grupo, entre quienes tienen dato, sobre
 *  una escala común. Las barras son solo visuales: lo que se lee está en el texto de cada fila. */
export function BarrasObservado({ a, b }: { a: ObservadoLado | null; b: ObservadoLado | null }) {
  const techo = techoDe([a?.pct, b?.pct])
  return (
    <div className="space-y-3">
      <FilaObservada serie={SERIE_A} o={a} techo={techo} />
      <FilaObservada serie={SERIE_B} o={b} techo={techo} />
      {(a?.pct != null || b?.pct != null) && (
        <div aria-hidden className="grid text-xs sm:grid-cols-[4.5rem_minmax(0,1fr)]">
          <span />
          <div className="flex justify-between"><span>0 %</span><span>{techo / 2} %</span><span>{techo} %</span></div>
        </div>
      )}
    </div>
  )
}
