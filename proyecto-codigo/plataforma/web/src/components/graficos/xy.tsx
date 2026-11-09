// Curvas con ejes numéricos (ROC, PR, calibración, beneficio) e histograma. Colores de serie fijos, el coral nunca es
// una serie; cada gráfica es una figura con su etiqueta para lectores de pantalla.
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { COLOR, LeyendaSeries, SERIES_COLOR, type ColorSerie } from './index'

export interface SerieXY {
  clave: string
  nombre: string
  color: ColorSerie
  puntos: [number, number | null][]
  /** Sin puntos marcados (curvas con muchos puntos). */
  sinPuntos?: boolean
}

type FilaXY = { x: number } & Record<string, number | null>

function unir(series: SerieXY[]): FilaXY[] {
  const filas = new Map<number, FilaXY>()
  for (const s of series) {
    for (const [x, y] of s.puntos) {
      const f = filas.get(x) ?? ({ x } as FilaXY)
      f[s.clave] = y
      filas.set(x, f)
    }
  }
  return [...filas.values()].sort((a, b) => a.x - b.x)
}

export function CurvaXY({ series, etiqueta, ejeX, ejeY, formatoX = (v) => String(v), formatoY = (v) => String(v), dominioX = [0, 1], dominioY = [0, 1],
  diagonal, referenciaY, alto = 280 }: {
  series: SerieXY[]; etiqueta: string; ejeX: string; ejeY: string
  formatoX?: (v: number) => string; formatoY?: (v: number) => string
  dominioX?: [number, number]; dominioY?: [number, number | 'auto']
  /** Dibuja la diagonal (azar o calibración perfecta). */
  diagonal?: boolean
  /** Línea horizontal de referencia (p. ej. la prevalencia). */
  referenciaY?: number | null
  alto?: number
}) {
  const filas = unir(series)
  return (
    <div>
      <LeyendaSeries series={series.map((s) => ({ clave: s.clave, nombre: s.nombre, color: s.color }))} />
      <div style={{ height: alto }} role="figure" aria-label={etiqueta} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filas} margin={{ left: 0, right: 12, top: 8, bottom: 18 }}>
            <CartesianGrid stroke={COLOR.rejilla} />
            <XAxis type="number" dataKey="x" domain={dominioX} tickFormatter={formatoX} stroke={COLOR.eje} fontSize={12} tickLine={false}
              label={{ value: ejeX, position: 'insideBottom', offset: -10, fontSize: 12, fill: 'var(--color-salvia)' }} />
            <YAxis type="number" domain={dominioY} tickFormatter={formatoY} stroke={COLOR.eje} fontSize={12} width={48} tickLine={false} axisLine={false}
              label={{ value: ejeY, angle: -90, position: 'insideLeft', offset: 14, fontSize: 12, fill: 'var(--color-salvia)', style: { textAnchor: 'middle' } }} />
            <Tooltip formatter={(v) => (typeof v === 'number' ? formatoY(v) : String(v))} labelFormatter={(x) => `${ejeX}: ${formatoX(Number(x))}`} />
            {diagonal && <ReferenceLine segment={[{ x: dominioX[0], y: dominioY[0] as number }, { x: dominioX[1], y: Number(dominioY[1]) }]}
              stroke={COLOR.referencia} strokeDasharray="4 4" ifOverflow="extendDomain" />}
            {referenciaY != null && <ReferenceLine y={referenciaY} stroke={COLOR.referencia} strokeDasharray="4 4" />}
            {series.map((s) => (
              <Line key={s.clave} dataKey={s.clave} name={s.nombre} type="monotone" stroke={SERIES_COLOR[s.color]} strokeWidth={2}
                isAnimationActive={false} connectNulls dot={s.sinPuntos ? false : { r: 3, fill: COLOR.papel, strokeWidth: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Barras verticales de conteos por tramo. Un tramo con `n` nulo (menos de 5 niños) queda vacío. */
export function Histograma({ tramos, etiqueta, formatoX = (v) => String(v), alto = 200 }: {
  tramos: { desde: number | null; hasta: number | null; n: number | null }[]; etiqueta: string; formatoX?: (v: number) => string; alto?: number
}) {
  const filas = tramos.map((t) => ({ x: t.desde != null ? formatoX(t.desde) : '', n: t.n ?? 0 }))
  return (
    <div style={{ height: alto }} role="figure" aria-label={etiqueta}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
          <XAxis dataKey="x" stroke={COLOR.eje} fontSize={11} tickLine={false} interval="preserveStartEnd" />
          <YAxis stroke={COLOR.eje} fontSize={12} width={40} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="n" name="Niños" fill={SERIES_COLOR[0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
