// Barras agrupadas por categoría (muestra frente a universo, grupo A frente a B) e histograma de dos grupos con la misma
// escala (% de cada grupo, para que se comparen formas y no tamaños). Colores de serie fijos; el coral nunca es una serie.
// Un valor nulo (menos de 5 niños) queda sin barra. Cada gráfica es una figura con su etiqueta y un solo <svg>, para el PNG.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { COLOR, LeyendaSeries, SERIES_COLOR, textoSeries, type FilaSeries, type Serie } from './index'
import { GraficaNavegable, resumenDe } from './navegacion'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'

export function BarrasAgrupadas({ filas, series, etiqueta, formatoY = (v) => `${v} %`, alto = 220, dominioY }: {
  filas: FilaSeries[]; series: Serie[]; etiqueta: string; formatoY?: (v: number) => string; alto?: number; dominioY?: [number, number | 'auto']
}) {
  const items = filas.map((f) => `${f.x}. ${textoSeries(f, series, (v) => formatoY(v), N_MENOR_QUE_5)}`)
  return (
    <div>
      <LeyendaSeries series={series} marca="barra" />
      <GraficaNavegable etiqueta={etiqueta} resumen={resumenDe('Barras', filas.length, ['categoría', 'categorías'])} items={items} style={{ height: alto }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
            <XAxis dataKey="x" stroke={COLOR.eje} fontSize={12} tickLine={false} interval={0} />
            <YAxis stroke={COLOR.eje} fontSize={12} width={44} tickLine={false} axisLine={false} tickFormatter={formatoY} domain={dominioY} />
            <Tooltip cursor={{ fill: COLOR.franja }} formatter={(v, nombre) => [typeof v === 'number' ? formatoY(v) : String(v), String(nombre)]} />
            {series.map((s) => (
              <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={SERIES_COLOR[s.color]} isAnimationActive={false} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </GraficaNavegable>
    </div>
  )
}

export interface TramoDosGrupos { desde: number | null; hasta: number | null; con: number | null; sin: number | null }

/** Riesgo de los niños con y sin el desenlace, cada grupo en % de sus propios niños. */
export function HistogramaDosGrupos({ tramos, casos, total, etiqueta, nombres, formatoX = (v) => String(v), alto = 220 }: {
  tramos: TramoDosGrupos[]; casos: number; total: number; etiqueta: string; nombres: [string, string]
  formatoX?: (v: number) => string; alto?: number
}) {
  const sinCasos = Math.max(total - casos, 1)
  const filas: FilaSeries[] = tramos.map((t) => ({
    x: t.desde != null ? formatoX(t.desde) : '',
    con: t.con != null ? Math.round((1000 * t.con) / Math.max(casos, 1)) / 10 : null,
    sin: t.sin != null ? Math.round((1000 * t.sin) / sinCasos) / 10 : null,
  }))
  const series: Serie[] = [{ clave: 'con', nombre: nombres[0], color: 2 }, { clave: 'sin', nombre: nombres[1], color: 0 }]
  const items = filas.map((f, i) => `${f.x || `Tramo ${i + 1}`}. ${textoSeries(f, series, (v) => `${v} %`, N_MENOR_QUE_5)}`)
  return (
    <div>
      <LeyendaSeries series={series} marca="barra" />
      <GraficaNavegable etiqueta={etiqueta} resumen={resumenDe('Barras', filas.length, ['tramo', 'tramos'])} items={items} style={{ height: alto }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barGap={0} barCategoryGap={1}>
            <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
            <XAxis dataKey="x" stroke={COLOR.eje} fontSize={12} tickLine={false} interval="preserveStartEnd" />
            <YAxis stroke={COLOR.eje} fontSize={12} width={44} tickLine={false} axisLine={false} tickFormatter={(v) => `${v} %`} />
            <Tooltip cursor={{ fill: COLOR.franja }} formatter={(v, nombre) => [typeof v === 'number' ? `${v} %` : 'n menor que 5', String(nombre)]} />
            {series.map((s) => <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={SERIES_COLOR[s.color]} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </GraficaNavegable>
    </div>
  )
}
