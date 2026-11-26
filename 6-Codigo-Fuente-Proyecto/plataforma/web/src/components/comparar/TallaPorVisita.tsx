// Talla para la edad visita por visita, un grupo frente al otro: la mediana del puntaje z con el umbral de talla baja y,
// bajo cada visita del eje, cuántos niños de cada grupo tienen dato en ella. Se dibuja un punto solo donde hay dato (1
// niño o más): una visita sin dato queda como hueco y la línea no la cruza, así no se inventa una medición que no existe.
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GruposClinicoOk, VisitaComparada } from '../../api/comparar'
import { dec2, num } from '../../lib/formato'
import { Grafica } from '../grafica'
import { COLOR, LeyendaSeries, SERIES_COLOR } from '../graficos'
import { GraficaNavegable, resumenDe } from '../graficos/navegacion'
import { FichaDelDato, poblacionAB, SERIES_AB, SERIE_A, SERIE_B } from './comun'

/** Alto de la línea: el que deja la pantalla bajo el resto de la pregunta, para que Comparar grupos quepa sin desplazarse
 *  y, en una pantalla grande, la gráfica la aproveche. ``alta``: la gráfica va debajo de lo observado a los 12 meses. */
const ALTO = { lado: 'h-[280px] xl:h-[clamp(230px,calc(100dvh-34rem),560px)]', debajo: 'h-[clamp(300px,calc(100dvh-46rem),520px)]' }

type Fila = { x: string; a: number | null; b: number | null; nA: number | null; nB: number | null }

const filasDe = (etapas: VisitaComparada[]): Fila[] =>
  etapas.map((e) => ({ x: e.etapa, a: e.a?.mediana ?? null, b: e.b?.mediana ?? null, nA: e.a?.n ?? null, nB: e.b?.n ?? null }))

function Globo({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Fila }> }) {
  const f = payload?.[0]?.payload
  if (!active || !f) return null
  return (
    <div role="status" aria-live="polite" className="max-w-72 rounded-control border border-linea bg-papel px-3 py-2 text-sm shadow-elevada">
      <p className="font-semibold">{f.x}</p>
      {[{ s: SERIE_A, v: f.a, n: f.nA }, { s: SERIE_B, v: f.b, n: f.nB }].map(({ s, v, n }) => (
        <p key={s.clave}>{s.nombre}: {v == null ? 'sin dato en esta visita' : `mediana ${dec2(v)}, ${num(n)} niños con dato`}</p>
      ))}
    </div>
  )
}

/** La visita en el eje y, debajo, cuántos niños de cada grupo tienen dato en ella: el denominador de cada mediana. */
function MarcaVisita({ x, y, payload, filas }: { x?: number | string; y?: number | string; payload?: { value?: unknown }; filas: Fila[] }) {
  const visita = String(payload?.value ?? '')
  const f = filas.find((fila) => fila.x === visita)
  const cx = Number(x ?? 0)
  return (
    <text x={cx} y={Number(y ?? 0)} textAnchor="middle" fill={COLOR.eje} fontSize={12}>
      <tspan x={cx} dy={12}>{visita}</tspan>
      {[{ s: SERIE_A, n: f?.nA }, { s: SERIE_B, n: f?.nB }].map(({ s, n }) => (
        <tspan key={s.clave} x={cx} dy={14} fontSize={11}>{s.nombre.slice(-1)}: {n == null ? '0' : num(n)}</tspan>
      ))}
    </text>
  )
}

export function TallaPorVisita({ r, alta = false }: { r: GruposClinicoOk; alta?: boolean }) {
  const { trayectoria: t } = r
  const filas = filasDe(t.etapas)
  const umbral = String(t.umbral).replace('-', '−')
  const valores = filas.flatMap((f) => [f.a, f.b]).filter((v): v is number => v != null)
  const dominio: [number, number] = [Math.floor(Math.min(t.umbral, ...valores) - 0.3), Math.ceil(Math.max(t.umbral, ...valores) + 0.3)]
  const hayDatos = valores.length > 0

  const items = filas.map((f) => `${f.x}. ${[{ s: SERIE_A, v: f.a, n: f.nA }, { s: SERIE_B, v: f.b, n: f.nB }].map(({ s, v, n }) =>
    `${s.nombre}: ${v == null ? 'sin dato' : `mediana ${dec2(v)}, ${num(n)} niños con dato`}`).join('; ')}`)
  const etiqueta = `${t.nombre} por visita: mediana del ${t.unidad} de cada grupo frente al umbral de ${umbral}. ${items.join('. ')}`
  const tabla = filas.map((f) => ({
    Visita: f.x, 'Grupo A: niños con dato': f.nA, 'Grupo A: mediana': f.a == null ? null : dec2(f.a),
    'Grupo B: niños con dato': f.nB, 'Grupo B: mediana': f.b == null ? null : dec2(f.b),
  }))

  return (
    <Grafica titulo={`${t.nombre}, visita por visita`}
      descripcion="Mediana de cada grupo en cada visita; solo hay punto donde algún niño tiene dato."
      exportar={{ nombre: 'comparar-grupos-talla-por-visita', filas: tabla, columnas: Object.keys(tabla[0] ?? {}) }}>
      {hayDatos ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <LeyendaSeries series={SERIES_AB.map((s) => ({ ...s, nombre: `${s.nombre} · mediana` }))} />
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden>
              <li className="inline-flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed border-coral-hondo" />Umbral de talla baja ({umbral})
              </li>
              <li>Bajo cada visita: niños con dato de A y de B</li>
            </ul>
          </div>
          <GraficaNavegable etiqueta={etiqueta} resumen={resumenDe('Líneas', filas.length, ['visita', 'visitas'])} items={items} className={alta ? ALTO.debajo : ALTO.lado}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filas} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
                <XAxis dataKey="x" stroke={COLOR.eje} tickLine={false} interval={0} height={50} padding={{ left: 28, right: 28 }}
                  tick={(p) => <MarcaVisita {...p} filas={filas} />} />
                <YAxis domain={dominio} stroke={COLOR.eje} fontSize={12} width={48} tickLine={false} axisLine={false} allowDecimals={false}
                  label={{ value: 'Puntaje z de talla', angle: -90, position: 'insideLeft', offset: 14, fill: COLOR.eje, fontSize: 12, style: { textAnchor: 'middle' } }} />
                <Tooltip cursor={{ stroke: COLOR.referencia, strokeDasharray: '3 3' }} content={(p) => <Globo {...p} />} />
                <ReferenceLine y={t.umbral} stroke={COLOR.marca} strokeDasharray="5 4" />
                {SERIES_AB.map((s) => (
                  <Line key={s.clave} dataKey={s.clave} stroke={SERIES_COLOR[s.color]} strokeWidth={2.5} isAnimationActive={false} connectNulls={false}
                    dot={{ r: 4, fill: SERIES_COLOR[s.color], stroke: COLOR.papel, strokeWidth: 2 }} activeDot={{ r: 6, stroke: COLOR.papel, strokeWidth: 2 }} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </GraficaNavegable>
        </div>
      ) : <p className="text-sm">Ningún grupo tiene niños con dato de talla en una visita.</p>}
      <FichaDelDato items={{
        variable: `${t.nombre.toLowerCase()} (puntaje z, referencia ${t.referencia})`, unidad: t.unidad,
        momento: 'cada visita, en edad corregida', poblacion: poblacionAB(r.a.n, r.b.n),
        validos: 'niños con dato, bajo cada visita',
      }} />
    </Grafica>
  )
}
