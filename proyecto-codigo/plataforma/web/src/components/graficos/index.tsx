// Gráficas compartidas: una serie pequeña con su franja esperada, varias series en líneas o barras apiladas, y barras
// de distribución con un marcador. Usan los tokens de color de estilos.css; el coral marca lo que hay que mirar y nunca
// es el color de una serie. Las series toman serie-1, serie-2 y serie-3 en ese orden fijo.
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis,
  YAxis } from 'recharts'
import { cn } from '../../lib/cn'

/** Los colores de serie en su orden fijo: el color sigue a la serie, no a su posición en una lista filtrada. */
export const SERIES_COLOR = ['var(--color-serie-1)', 'var(--color-serie-2)', 'var(--color-serie-3)', 'var(--color-serie-4)'] as const
export type ColorSerie = 0 | 1 | 2 | 3

export interface Serie {
  clave: string
  nombre: string
  /** El color fijo de la serie (su posición en SERIES_COLOR). */
  color: ColorSerie
}

/** Fila de una gráfica de varias series: la categoría del eje X y un valor por clave de serie. */
export type FilaSeries = { x: string } & Record<string, number | string | null>

/** La leyenda de varias series, escrita aparte para que el color nunca sea lo único que las distingue. */
export function LeyendaSeries({ series, marca = 'linea' }: { series: Serie[]; marca?: 'linea' | 'barra' }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden>
      {series.map((s) => (
        <li key={s.clave} className="inline-flex items-center gap-1.5">
          <span className={cn('inline-block shrink-0', marca === 'linea' ? 'h-0.5 w-4 rounded-full' : 'size-2.5 rounded-sm')}
            style={{ background: SERIES_COLOR[s.color] }} />
          {s.nombre}
        </li>
      ))}
    </ul>
  )
}

function TooltipSeries({ active, payload, label, series, formato }: {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown; payload?: FilaSeries }>
  label?: unknown
  series: Serie[]
  formato: (v: number, fila: FilaSeries, s: Serie) => string
}) {
  const fila = payload?.[0]?.payload
  if (!active || !fila) return null
  return (
    <div role="status" aria-live="polite" className="max-w-72 rounded-control border border-linea bg-papel px-3 py-2 text-sm shadow-elevada">
      <p className="font-semibold">{String(label ?? fila.x)}</p>
      {series.map((s) => {
        const v = fila[s.clave]
        return typeof v === 'number' ? (
          <p key={s.clave} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: SERIES_COLOR[s.color] }} />
            {s.nombre}: {formato(v, fila, s)}
          </p>
        ) : null
      })}
    </div>
  )
}

/** Varias series en líneas sobre categorías ordenadas (p. ej. visitas). */
export function LineasSeries({ filas, series, etiqueta, formatoY, dominioY, alto = 220, formatoTooltip }: {
  filas: FilaSeries[]
  series: Serie[]
  etiqueta: string
  formatoY: (v: number) => string
  dominioY?: [number, number]
  alto?: number
  formatoTooltip?: (v: number, fila: FilaSeries, s: Serie) => string
}) {
  return (
    <div style={{ height: alto }} role="figure" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filas} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
          <XAxis dataKey="x" stroke={COLOR.eje} fontSize={12} tickLine={false} interval="preserveStartEnd" padding={{ left: 12, right: 12 }} />
          <YAxis domain={dominioY ?? [0, 'auto']} tickFormatter={formatoY} stroke={COLOR.eje} fontSize={12} width={44}
            tickLine={false} axisLine={false} />
          <Tooltip cursor={{ stroke: COLOR.referencia, strokeDasharray: '3 3' }}
            content={(p) => <TooltipSeries {...p} series={series} formato={formatoTooltip ?? ((v) => formatoY(v))} />} />
          {series.map((s) => (
            <Line key={s.clave} dataKey={s.clave} name={s.nombre} stroke={SERIES_COLOR[s.color]} strokeWidth={2}
              isAnimationActive={false} connectNulls dot={{ r: 4, strokeWidth: 2, fill: COLOR.papel }}
              activeDot={{ r: 6, stroke: COLOR.papel, strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Conteos por periodo, apilados por serie (p. ej. alarmas por trimestre y tipo de señal). */
export function BarrasApiladas({ filas, series, etiqueta, formatoX, alto = 180 }: {
  filas: FilaSeries[]
  series: Serie[]
  etiqueta: string
  formatoX?: (x: string) => string
  alto?: number
}) {
  return (
    <div style={{ height: alto }} role="figure" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap={1}>
          <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
          <XAxis dataKey="x" stroke={COLOR.eje} fontSize={12} tickLine={false} interval={0} tickFormatter={formatoX} />
          <YAxis allowDecimals={false} stroke={COLOR.eje} fontSize={12} width={32} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: COLOR.franja }}
            content={(p) => <TooltipSeries {...p} series={series} formato={(v) => String(v)} />} />
          {series.map((s, i) => (
            <Bar key={s.clave} dataKey={s.clave} name={s.nombre} stackId="a" fill={SERIES_COLOR[s.color]} isAnimationActive={false}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export const COLOR = {
  serie: 'var(--color-teal-medio)',
  marca: 'var(--color-coral-hondo)',
  franja: 'var(--color-teal-tinte)',
  alerta: 'var(--color-coral-tinte)',
  referencia: 'var(--color-referencia)',
  rejilla: 'var(--color-linea)',
  eje: 'var(--color-salvia)',
  papel: 'var(--color-papel)',
} as const

export interface PuntoSerie {
  x: number
  y: number
  /** Punto que hay que mirar: se pinta en coral y más grande. */
  marcado?: boolean
  /** Primera línea del tooltip (p. ej. la visita o la edad). */
  titulo: string
  detalle?: string[]
}

export interface Franja {
  desde: number
  hasta: number
  /** `esperado`: el rango normal (teal claro). `alerta`: la zona que hay que mirar (coral claro). */
  tono?: 'esperado' | 'alerta'
  /** Solo en este tramo del eje X (p. ej. el rango esperado de un solo punto); sin él, a todo lo ancho. */
  x?: [number, number]
}

/** Una serie pequeña (un niño, un indicador) con franjas de referencia, líneas guía y puntos marcados. */
export function MiniSerie({ puntos, etiqueta, dominioY, ticksY, formatoY, ticksX, formatoX, dominioX, franjas = [], guias = [],
  alto = 150 }: {
  puntos: PuntoSerie[]
  /** Lo que muestra la gráfica, en una frase (para lectores de pantalla). */
  etiqueta: string
  dominioY: [number, number]
  ticksY?: number[]
  formatoY?: (v: number) => string
  ticksX?: number[]
  formatoX?: (v: number) => string
  dominioX?: [number, number]
  franjas?: Franja[]
  guias?: { y: number; punteada?: boolean }[]
  alto?: number
}) {
  return (
    <div style={{ height: alto }} role="figure" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={puntos} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
          {franjas.map((f) => (
            <ReferenceArea key={`${f.desde}-${f.hasta}-${f.x?.join('-')}`} y1={f.desde} y2={f.hasta} x1={f.x?.[0]} x2={f.x?.[1]}
              ifOverflow="hidden" strokeOpacity={0}
              fill={f.tono === 'alerta' ? COLOR.alerta : COLOR.franja} fillOpacity={1} />
          ))}
          {guias.map((g) => (
            <ReferenceLine key={g.y} y={g.y} stroke={COLOR.referencia} strokeDasharray={g.punteada ? '4 3' : undefined} />
          ))}
          <XAxis dataKey="x" type="number" domain={dominioX ?? ['dataMin', 'dataMax']} ticks={ticksX} tickFormatter={formatoX}
            stroke={COLOR.eje} fontSize={12} tickLine={false} interval="preserveStartEnd" padding={{ left: 10, right: 10 }} />
          <YAxis domain={dominioY} ticks={ticksY} tickFormatter={formatoY} allowDataOverflow interval={0}
            stroke={COLOR.eje} fontSize={12} width={40} tickLine={false} axisLine={false} />
          <Tooltip content={ContenidoTooltip} cursor={{ stroke: COLOR.referencia, strokeDasharray: '3 3' }} />
          <Line dataKey="y" stroke={COLOR.serie} strokeWidth={2} isAnimationActive={false} connectNulls
            dot={PuntoMarcado} activeDot={{ r: 6, stroke: COLOR.papel, strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function PuntoMarcado({ cx, cy, payload, index }: { cx?: number; cy?: number; payload?: PuntoSerie; index?: number }) {
  if (cx == null || cy == null) return <g key={index} />
  const marcado = payload?.marcado
  return (
    <circle key={index} cx={cx} cy={cy} r={marcado ? 5.5 : 4} fill={marcado ? COLOR.marca : COLOR.papel}
      stroke={marcado ? COLOR.papel : COLOR.serie} strokeWidth={2} />
  )
}

/** Recharts entrega en ``payload[0].payload`` el punto de datos original. */
function ContenidoTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: PuntoSerie }> }) {
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  return (
    <div role="status" aria-live="polite" className="max-w-64 rounded-control border border-linea bg-papel px-3 py-2 text-sm shadow-elevada">
      <p className="font-semibold">{p.titulo}</p>
      {p.detalle?.map((d) => <p key={d}>{d}</p>)}
    </div>
  )
}

/** Muestra de color para una leyenda escrita aparte de la gráfica. */
export function Muestra({ tipo, children }: { tipo: 'franja' | 'alerta' | 'punto' | 'marcado'; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('inline-block shrink-0',
        tipo === 'franja' && 'h-3 w-4 rounded-sm bg-teal-tinte ring-1 ring-teal/20',
        tipo === 'alerta' && 'h-3 w-4 rounded-sm bg-coral-tinte ring-1 ring-coral/30',
        tipo === 'punto' && 'size-2.5 rounded-full border-2 border-teal-medio bg-papel',
        tipo === 'marcado' && 'size-3 rounded-full bg-coral-hondo')} />
      {children}
    </span>
  )
}

export interface Cuantiles { p5: number; p25: number; p50: number; p75: number; p95: number }

/** Dónde cae un valor frente a un grupo: la línea va del 5 al 95 % del grupo, la barra del 25 al 75 %, la marca
 * vertical es la mediana y el rombo es el valor propio. */
export function Distribucion({ cuantiles: q, valor, formato, etiqueta }: {
  cuantiles: Cuantiles
  valor: number | null
  formato: (v: number) => string
  etiqueta: string
}) {
  const { x, ancho } = escala([q.p5, q.p95, valor])
  return (
    <div role="img" aria-label={etiqueta} title={`La mitad de los niños entre ${formato(q.p25)} y ${formato(q.p75)}; mediana ${formato(q.p50)}`}>
      <div className="relative h-6">
        <span aria-hidden className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-referencia/60"
          style={{ left: x(q.p5), width: ancho(q.p5, q.p95) }} />
        <span aria-hidden className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm bg-teal-tinte ring-1 ring-teal/25"
          style={{ left: x(q.p25), width: ancho(q.p25, q.p75) }} />
        <span aria-hidden className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-teal-medio"
          style={{ left: x(q.p50) }} />
        {valor != null && (
          <span aria-hidden className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-papel bg-coral-hondo shadow-suave"
            style={{ left: x(valor) }} />
        )}
      </div>
      <div className="relative h-4 text-xs text-salvia">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(q.p5) }}>{formato(q.p5)}</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: x(q.p95) }}>{formato(q.p95)}</span>
      </div>
    </div>
  )
}

/** Posición horizontal (en % del ancho) de los valores dados, con un margen para que nada quede pegado al borde. */
function escala(valores: (number | null)[]) {
  const vs = valores.filter((v): v is number => v != null)
  const bajo = Math.min(...vs)
  const alto = Math.max(...vs)
  const margen = (alto - bajo || Math.abs(alto) || 1) * 0.08
  const [d0, d1] = [bajo - margen, alto + margen]
  return {
    x: (v: number) => `${(100 * (v - d0)) / (d1 - d0)}%`,
    ancho: (a: number, b: number) => `${(100 * (b - a)) / (d1 - d0)}%`,
  }
}

/** Un valor frente a su rango esperado: la barra es el rango, la marca vertical lo más probable y el punto el valor. Las
 * cifras van en el texto que la acompaña (un valor muy lejano encimaría las etiquetas). */
export function RangoEsperado({ bajo, alto, esperado, valor, etiqueta }: {
  bajo: number
  alto: number
  esperado: number | null
  valor: number | null
  etiqueta: string
}) {
  const { x, ancho } = escala([bajo, alto, esperado, valor])
  return (
    <div role="img" aria-label={etiqueta}>
      <div className="relative h-6">
        <span aria-hidden className="absolute top-1/2 h-0.5 w-full -translate-y-1/2 bg-linea" />
        <span aria-hidden className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-teal-tinte ring-1 ring-teal/25"
          style={{ left: x(bajo), width: ancho(bajo, alto) }} />
        {esperado != null && (
          <span aria-hidden className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-teal-medio"
            style={{ left: x(esperado) }} />
        )}
        {valor != null && (
          <span aria-hidden className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-papel bg-coral-hondo shadow-suave"
            style={{ left: x(valor) }} />
        )}
      </div>
    </div>
  )
}

/** Marcas de eje enteras que siempre incluyen las líneas de referencia (p. ej. −2, 0 y 2 en un puntaje z). */
/** Un eje de valores redondos (pasos de 1, 2 o 5 por una potencia de 10) que cubre [a, b] con unas ``n`` marcas: el
 * dominio se abre hasta la marca redonda más cercana, así ninguna etiqueta queda en un valor raro ni pegada a otra. */
export function escalaRedonda([a, b]: [number, number], n = 4): { dominio: [number, number]; ticks: number[] } {
  // un rango por debajo de la precisión de coma flotante (1,001 frente a 1001 × 0,001) cuenta como un solo valor
  const ancho = b - a > Math.abs(b) * 1e-9 ? b - a : 0
  const bruto = (ancho || Math.abs(b) || 1) / n
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const paso = ([1, 2, 5, 10].find((m) => m * potencia >= bruto) ?? 10) * potencia
  // en pasos enteros, para no acumular ruido de coma flotante (0,1 × 3 no da 0,3)
  const redondo = (k: number) => Number((k * paso).toPrecision(12))
  let [k0, k1] = [Math.floor(a / paso), Math.ceil(b / paso)]
  if (k0 === k1) { k0 -= 1; k1 += 1 }   // un solo valor justo en una marca: igual hay un eje alrededor
  const ticks = Array.from({ length: k1 - k0 + 1 }, (_, i) => redondo(k0 + i))
  return { dominio: [redondo(k0), redondo(k1)], ticks }
}

export function ticksEnteros([a, b]: [number, number], obligatorios: number[] = []): number[] {
  const paso = b - a > 8 ? 2 : 1
  const desde = paso === 2 ? Math.ceil(a / 2) * 2 : Math.ceil(a)
  const ticks = new Set(obligatorios.filter((v) => v >= a && v <= b))
  for (let v = desde; v <= b; v += paso) ticks.add(v)
  return [...ticks].sort((m, n) => m - n)
}
