// Gráficas compartidas: una serie pequeña con su franja esperada y una barra de distribución con un marcador. Usan los
// tokens de color de estilos.css; el coral marca lo que hay que mirar y nunca es el color de una serie.
import type { ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '../../lib/cn'

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
    <div style={{ height: alto }} role="img" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={puntos} margin={{ left: 0, right: 12, top: 8, bottom: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
          {franjas.map((f) => (
            <ReferenceArea key={`${f.desde}-${f.hasta}`} y1={f.desde} y2={f.hasta} ifOverflow="hidden" strokeOpacity={0}
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
    <div className="max-w-64 rounded-control border border-linea bg-papel px-3 py-2 text-sm shadow-elevada">
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
  const bajo = Math.min(q.p5, valor ?? q.p5)
  const alto = Math.max(q.p95, valor ?? q.p95)
  const margen = (alto - bajo || 1) * 0.06
  const [d0, d1] = [bajo - margen, alto + margen]
  const x = (v: number) => `${(100 * (v - d0)) / (d1 - d0)}%`
  const ancho = (a: number, b: number) => `${(100 * (b - a)) / (d1 - d0)}%`
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

/** Marcas de eje enteras que siempre incluyen las líneas de referencia (p. ej. −2, 0 y 2 en un puntaje z). */
export function ticksEnteros([a, b]: [number, number], obligatorios: number[] = []): number[] {
  const paso = b - a > 8 ? 2 : 1
  const desde = paso === 2 ? Math.ceil(a / 2) * 2 : Math.ceil(a)
  const ticks = new Set(obligatorios.filter((v) => v >= a && v <= b))
  for (let v = desde; v <= b; v += paso) ticks.add(v)
  return [...ticks].sort((m, n) => m - n)
}
