// Trayectoria del grupo visita por visita: la mediana del grupo con su mitad central, la mediana de toda la población y,
// para las medidas en puntaje z, el umbral de crecimiento bajo. Se dibuja un punto solo donde hay dato: una visita sin
// dato queda como hueco, nunca como una línea que cruza sin medir. Debajo, cuántos niños tienen dato en cada visita.
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { EtapaClinica } from '../../api/tipos'
import { dec2, indicador as nombreIndicador, num } from '../../lib/formato'
import { Grafica } from '../grafica'
import { COLOR, SERIES_COLOR } from '../graficos'
import { GraficaNavegable, resumenDe } from '../graficos/navegacion'

const UMBRAL_Z = -2
const nombreVisita = (etapa: string) => etapa.replace(' (edad corregida)', ' EC')
const esPuntajeZ = (unidad: string) => /(^|\s)z(\s|$)/i.test(unidad)

type Fila = {
  x: string
  n: number | null
  mediana: number | null
  /** Mitad central del grupo: del cuarto al tres cuartos de los niños. */
  banda: [number, number] | null
  poblacion: number | null
  nPoblacion: number | null
}

function filasDe(etapas: EtapaClinica[]): Fila[] {
  return etapas.map((e) => ({
    x: nombreVisita(e.etapa),
    n: e.grupo?.n ?? null,
    mediana: e.grupo?.mediana ?? null,
    banda: e.grupo && e.grupo.p25 != null && e.grupo.p75 != null ? [e.grupo.p25, e.grupo.p75] : null,
    poblacion: e.poblacion?.mediana ?? null,
    nPoblacion: e.poblacion?.n ?? null,
  }))
}

function Leyenda({ umbral }: { umbral: string | null }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden>
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: SERIES_COLOR[0] }} />Mediana del grupo
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm opacity-25" style={{ background: SERIES_COLOR[0] }} />Mitad central del grupo
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: COLOR.referencia }} />Toda la población
      </li>
      {umbral && (
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-coral-hondo" />{umbral}
        </li>
      )}
    </ul>
  )
}

function Globo({ active, payload, unidad }: {
  active?: boolean; payload?: ReadonlyArray<{ payload?: Fila }>; unidad: string
}) {
  const f = payload?.[0]?.payload
  if (!active || !f) return null
  return (
    <div role="status" aria-live="polite" className="max-w-72 rounded-control border border-linea bg-papel px-3 py-2 text-sm shadow-elevada">
      <p className="font-semibold">{f.x}</p>
      {f.mediana == null
        ? <p>Sin dato del grupo en esta visita</p>
        : (
          <>
            <p>Mediana del grupo: {dec2(f.mediana)} ({unidad}), {num(f.n)} niños con dato</p>
            {f.banda && <p>Mitad central: {dec2(f.banda[0])} a {dec2(f.banda[1])}</p>}
          </>
        )}
      {f.poblacion != null && <p>Toda la población: {dec2(f.poblacion)}</p>}
    </div>
  )
}

export function Trayectoria({ indicador, unidad, etapas, muestra }: {
  indicador: string
  unidad: string
  etapas: EtapaClinica[]
  /** Quién es el grupo y cuántos niños son: va al pie y a la imagen que se descarga. */
  muestra: string
}) {
  const titulo = `${nombreIndicador(indicador)}, visita por visita`
  const filas = filasDe(etapas)
  const medida = nombreIndicador(indicador).toLowerCase()
  const umbral = esPuntajeZ(unidad) ? (indicador === 'talla' ? 'Umbral de talla baja (−2)' : 'Umbral de crecimiento bajo (−2)') : null
  const valores = filas.flatMap((f) => [f.mediana, f.poblacion, ...(f.banda ?? [])]).filter((v): v is number => v != null)
  if (umbral) valores.push(UMBRAL_Z)
  const dominio: [number, number] = valores.length ? [Math.floor(Math.min(...valores) - 0.3), Math.ceil(Math.max(...valores) + 0.3)] : [-3, 1]
  const hayDatos = filas.some((f) => f.mediana != null)

  const items = filas.map((f) => `${f.x}. ${f.mediana == null ? 'Sin dato del grupo' : `Mediana del grupo ${dec2(f.mediana)}, ${num(f.n)} niños con dato`}${
    f.poblacion == null ? '' : `. Toda la población ${dec2(f.poblacion)}`}`)
  const etiqueta = `${titulo}: mediana del grupo, mitad central del grupo y mediana de toda la población, en ${unidad}. ${items.join('; ')}`

  const tabla = filas.map((f) => ({
    Visita: f.x,
    'Niños con dato': f.n,
    'Mediana del grupo': f.mediana == null ? null : dec2(f.mediana),
    'Mitad central del grupo': f.banda ? `${dec2(f.banda[0])} a ${dec2(f.banda[1])}` : null,
    'Mediana de la población': f.poblacion == null ? null : dec2(f.poblacion),
  }))

  return (
    <Grafica titulo={titulo}
      descripcion={`Mediana de ${medida} del grupo en cada visita, con la mitad central de los niños, frente a toda la población. Solo hay punto donde hay dato.`}
      exportar={{ nombre: 'vista-clinica-trayectoria', filas: tabla, columnas: Object.keys(tabla[0] ?? {}), muestra, unidad: `Unidad: ${unidad}` }}>
      {hayDatos ? (
        <div className="space-y-2">
          <Leyenda umbral={umbral} />
          <GraficaNavegable etiqueta={etiqueta} resumen={resumenDe('Líneas', filas.length, ['visita', 'visitas'])} items={items} style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filas} margin={{ left: 0, right: 12, top: 8, bottom: 16 }}>
                <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
                <XAxis dataKey="x" stroke={COLOR.eje} fontSize={12} tickLine={false} interval="preserveStartEnd" padding={{ left: 14, right: 14 }}
                  label={{ value: 'Edad corregida', position: 'insideBottom', offset: -12, fill: COLOR.eje, fontSize: 12 }} />
                <YAxis domain={dominio} stroke={COLOR.eje} fontSize={12} width={48} tickLine={false} axisLine={false} allowDecimals={false}
                  label={{ value: unidad, angle: -90, position: 'insideLeft', offset: 14, fill: COLOR.eje, fontSize: 12, style: { textAnchor: 'middle' } }} />
                <Tooltip cursor={{ stroke: COLOR.referencia, strokeDasharray: '3 3' }} content={(p) => <Globo {...p} unidad={unidad} />} />
                {umbral && <ReferenceLine y={UMBRAL_Z} stroke={COLOR.marca} strokeDasharray="5 4" />}
                <Area dataKey="banda" stroke="none" fill={SERIES_COLOR[0]} fillOpacity={0.2} isAnimationActive={false} connectNulls={false} activeDot={false} />
                <Line dataKey="poblacion" stroke={COLOR.referencia} strokeWidth={2} isAnimationActive={false} connectNulls={false}
                  dot={{ r: 3, fill: COLOR.referencia, strokeWidth: 0 }} activeDot={false} />
                <Line dataKey="mediana" stroke={SERIES_COLOR[0]} strokeWidth={2.5} isAnimationActive={false} connectNulls={false}
                  dot={{ r: 4, fill: SERIES_COLOR[0], stroke: COLOR.papel, strokeWidth: 2 }} activeDot={{ r: 6, stroke: COLOR.papel, strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </GraficaNavegable>
          <div>
            <p className="text-xs font-semibold text-salvia">Niños del grupo con dato en cada visita</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm tabular-nums">
              {filas.map((f) => (
                <li key={f.x}><span className="text-salvia">{f.x}:</span> <span className="font-semibold">{f.n == null ? 'sin dato' : num(f.n)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      ) : <p className="text-sm text-salvia">El grupo no tiene datos en ninguna visita, o son muy pocos niños para mostrarlos.</p>}
    </Grafica>
  )
}
