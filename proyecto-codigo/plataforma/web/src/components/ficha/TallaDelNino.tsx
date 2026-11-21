// «Talla para la edad, visita por visita» de un niño: su talla frente a la OMS en cada visita del programa, con el umbral de
// talla baja (−2) rotulado y, en gris, las visitas que aún no llegan. Va bajo el riesgo de talla baja a los 12 meses, para ver el
// riesgo junto a lo que se ha medido. Se dibuja un punto solo donde hay talla válida: una visita pasada sin talla queda como
// hueco («sin dato») y la línea no la cruza; una medida improbable no se grafica. El eje empieza en la primera visita con talla.
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PuntoCrecimiento, Visita } from '../../api/tipos'
import { dec } from '../../lib/formato'
import { Grafica } from '../grafica'
import { COLOR, SERIES_COLOR } from '../graficos'
import { GraficaNavegable, resumenDe } from '../graficos/navegacion'

const UMBRAL = -2
const TITULO = 'Talla para la edad, visita por visita'
const nombreVisita = (nombre: string) => nombre.replace(' (edad corregida)', '')
/** −1,2: con el signo menos tipográfico, como en el resto de la ficha. */
const zTexto = (z: number) => dec(z).replace('-', '−')

interface Fila {
  x: string
  z: number | null
  /** La visita aún no llega (va después de la última con datos): no es un dato que falte. */
  pendiente: boolean
}

/** Una visita tiene datos si tiene fecha, alguna medición con valor o algún riesgo calculado. */
const conDatos = (v: Visita) => v.fecha != null || v.riesgos.length > 0 || v.mediciones.some((m) => m.valor != null)

/** Las visitas del eje con la talla del niño en cada una, y su última visita con datos; nulo si no tiene ninguna talla válida. */
export function tallaPorVisita(visitas: Visita[], puntos: PuntoCrecimiento[] | undefined): { filas: Fila[]; ultima: string | null } | null {
  const z = new Map<string, number>()
  for (const p of puntos ?? []) if (p.etapa != null && p.z != null && !p.improbable) z.set(p.etapa, p.z)
  const ordenadas = [...visitas].sort((a, b) => a.orden - b.orden)
  const primera = ordenadas.findIndex((v) => z.has(v.etapa))
  if (primera < 0) return null
  const ultima = ordenadas.findLast(conDatos)
  return {
    ultima: ultima ? nombreVisita(ultima.nombre) : null,
    filas: ordenadas.slice(primera).map((v) => ({
      x: nombreVisita(v.nombre), z: z.get(v.etapa) ?? null, pendiente: ultima == null || v.orden > ultima.orden,
    })),
  }
}

const estado = (f: Fila) => (f.z != null ? zTexto(f.z) : f.pendiente ? 'aún sin medir' : 'sin dato')

function Globo({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Fila }> }) {
  const f = payload?.[0]?.payload
  if (!active || !f) return null
  return (
    <div role="status" aria-live="polite" className="max-w-64 rounded-control border border-linea bg-papel px-3 py-2 text-sm shadow-elevada">
      <p className="font-semibold">{f.x}</p>
      <p>{f.z != null ? `Talla frente a la OMS: ${zTexto(f.z)}${f.z < UMBRAL ? ' (talla baja)' : ''}` : f.pendiente ? 'Aún sin medir' : 'Sin dato de talla'}</p>
    </div>
  )
}

export function TallaDelNino({ visitas, puntos }: { visitas: Visita[]; puntos: PuntoCrecimiento[] | undefined }) {
  const datos = tallaPorVisita(visitas, puntos)
  if (!datos) return null
  const { filas, ultima } = datos
  const zs = filas.flatMap((f) => (f.z == null ? [] : [f.z]))
  const dominio: [number, number] = [Math.min(-3, Math.floor(Math.min(...zs))), Math.max(1, Math.ceil(Math.max(...zs)))]
  const marcas = Array.from({ length: dominio[1] - dominio[0] + 1 }, (_, i) => dominio[0] + i)
  const pendientes = filas.filter((f) => f.pendiente)
  const items = filas.map((f) => `${f.x}, ${estado(f)}`)
  return (
    <Grafica titulo={TITULO}
      descripcion={`Desviaciones estándar frente a la OMS en cada visita: 0 es lo esperado. Por debajo de −2 es talla baja.${pendientes.length ? ' En gris, las visitas que aún no llegan.' : ''}`}
      exportar={{ nombre: 'talla-del-nino-por-visita', filas: filas.map((f) => ({ Visita: f.x, 'Talla frente a la OMS': estado(f) })), columnas: ['Visita', 'Talla frente a la OMS'] }}>
      {ultima && <p className="mb-2 text-sm font-semibold text-teal">Última visita con datos: {ultima}.</p>}
      <GraficaNavegable etiqueta={`Talla para la edad de este niño en cada visita: ${items.join('; ')}`}
        resumen={resumenDe('Líneas', filas.length, ['visita', 'visitas'])} items={items} className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filas} margin={{ left: 0, right: 16, top: 12, bottom: 4 }}>
            <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
            {pendientes.length > 0 && (
              <ReferenceArea x1={pendientes[0].x} x2={pendientes[pendientes.length - 1].x} fill={COLOR.rejilla} fillOpacity={0.45} strokeOpacity={0}
                label={{ value: 'aún sin medir', position: 'insideBottom', fill: COLOR.eje, fontSize: 12 }} />
            )}
            <XAxis dataKey="x" stroke={COLOR.eje} fontSize={12} tickLine={false} interval={0} padding={{ left: 28, right: 28 }} />
            <YAxis domain={dominio} ticks={marcas} stroke={COLOR.eje} fontSize={12} width={48} tickLine={false} axisLine={false}
              tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`).replace('-', '−')}
              label={{ value: 'frente a la OMS', angle: -90, position: 'insideLeft', offset: 14, fill: COLOR.eje, fontSize: 12, style: { textAnchor: 'middle' } }} />
            <Tooltip cursor={{ stroke: COLOR.referencia, strokeDasharray: '3 3' }} content={(p) => <Globo {...p} />} />
            <ReferenceLine y={0} stroke={COLOR.referencia} />
            <ReferenceLine y={UMBRAL} stroke={COLOR.marca} strokeDasharray="5 4"
              label={{ value: '−2 · talla baja', position: 'insideBottomRight', fill: COLOR.marca, fontSize: 12 }} />
            <Line dataKey="z" stroke={SERIES_COLOR[0]} strokeWidth={2.5} isAnimationActive={false} connectNulls={false}
              dot={{ r: 4.5, fill: COLOR.papel, stroke: SERIES_COLOR[0], strokeWidth: 2 }} activeDot={{ r: 6, stroke: COLOR.papel, strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </GraficaNavegable>
    </Grafica>
  )
}
