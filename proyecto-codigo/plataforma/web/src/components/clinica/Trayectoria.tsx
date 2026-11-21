// Trayectoria del grupo visita por visita: la mediana del grupo con su mitad central, la mediana de toda la población y,
// para las medidas en puntaje z, el umbral de crecimiento bajo (con su marca en el eje, como el 0). Se dibuja un punto
// solo donde hay dato: una visita sin dato queda como hueco, nunca como una línea que cruza sin medir. Bajo cada visita
// del eje, cuántos niños del grupo tienen dato en ella. Si el grupo es toda la población, la línea de la población sería
// la misma: no se dibuja y la leyenda lo dice.
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Termino } from '../Termino'
import type { EtapaClinica } from '../../api/tipos'
import { cn } from '../../lib/cn'
import { MINIMO_NINOS_DISTRIBUCION } from '../../lib/exportar'
import { dec2, indicador as nombreIndicador, num } from '../../lib/formato'
import { Grafica } from '../grafica'
import { COLOR, SERIES_COLOR } from '../graficos'
import { GraficaNavegable, resumenDe } from '../graficos/navegacion'

const UMBRAL_Z = -2
const nombreVisita = (etapa: string) => etapa.replace(' (edad corregida)', ' EC')
const esPuntajeZ = (unidad: string) => /(^|\s)z(\s|$)/i.test(unidad)

/** Una marca por cada entero del dominio: así el 0 y el umbral −2 siempre llevan número. */
export const marcasEnteras = ([desde, hasta]: [number, number]) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)

type Fila = {
  x: string
  n: number | null
  mediana: number | null
  /** Mitad central del grupo: del cuarto al tres cuartos de los niños. */
  banda: [number, number] | null
  /** Hay mediana, pero menos de 20 niños con dato: la mitad central no se calcula (D52). */
  sinBanda: boolean
  poblacion: number | null
  nPoblacion: number | null
}

function filasDe(etapas: EtapaClinica[]): Fila[] {
  return etapas.map((e) => ({
    x: nombreVisita(e.etapa),
    n: e.grupo?.n ?? null,
    mediana: e.grupo?.mediana ?? null,
    banda: e.grupo && e.grupo.p25 != null && e.grupo.p75 != null ? [e.grupo.p25, e.grupo.p75] : null,
    sinBanda: e.grupo?.mediana != null && (e.grupo.p25 == null || e.grupo.p75 == null),
    poblacion: e.poblacion?.mediana ?? null,
    nPoblacion: e.poblacion?.n ?? null,
  }))
}

function Leyenda({ umbral, conPoblacion, conBanda, sinBanda }: { umbral: string | null; conPoblacion: boolean; conBanda: boolean; sinBanda: boolean }) {
  return (
    <>
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <li className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: SERIES_COLOR[0] }} aria-hidden />Mediana del grupo
      </li>
      {conBanda && (
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm opacity-25" style={{ background: SERIES_COLOR[0] }} aria-hidden />Mitad central del grupo
        </li>
      )}
      {conPoblacion ? (
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: COLOR.referencia }} aria-hidden />Toda la población
        </li>
      ) : null}
      {umbral && (
        <li className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t-2 border-dashed border-coral-hondo" aria-hidden />
          <span>{umbral} de la <Termino id="oms">OMS</Termino> (<Termino id="de">−2</Termino>)</span>
        </li>
      )}
    </ul>
    {/* solo si alguna visita tiene mediana sin mitad central: explica el hueco de la banda */}
    {sinBanda && <p className="text-xs">Sin mitad central: pide al menos {MINIMO_NINOS_DISTRIBUCION} niños con dato en la visita.</p>}
    </>
  )
}

/** La visita y, debajo, cuántos niños del grupo tienen dato en ella (las observaciones válidas de ese punto). */
function MarcaVisita({ x, y, payload, filas }: { x?: number | string; y?: number | string; payload?: { value?: unknown }; filas: Fila[] }) {
  const visita = String(payload?.value ?? '')
  const n = filas.find((f) => f.x === visita)?.n
  return (
    <text x={Number(x ?? 0)} y={Number(y ?? 0)} textAnchor="middle" fill={COLOR.eje} fontSize={12}>
      <tspan x={Number(x ?? 0)} dy={12}>{visita}</tspan>
      <tspan x={Number(x ?? 0)} dy={15} fontSize={11}>{n == null ? 'sin dato' : `${num(n)} niños`}</tspan>
    </text>
  )
}

function Globo({ active, payload, unidad, conPoblacion }: {
  active?: boolean; payload?: ReadonlyArray<{ payload?: Fila }>; unidad: string; conPoblacion: boolean
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
            {f.sinBanda && <p>Sin mitad central: pide al menos {MINIMO_NINOS_DISTRIBUCION} niños con dato</p>}
          </>
        )}
      {conPoblacion && f.poblacion != null && <p>Toda la población: {dec2(f.poblacion)}</p>}
    </div>
  )
}

export function Trayectoria({ indicador, unidad, etapas, muestra, conPoblacion, className }: {
  indicador: string
  unidad: string
  etapas: EtapaClinica[]
  /** Quién es el grupo y cuántos niños son: va al pie y a la imagen que se descarga. */
  muestra: string
  /** Falso cuando el grupo es toda la población: su mediana sería la misma línea. */
  conPoblacion: boolean
  className?: string
}) {
  // «Crecimiento» y la medida: también en el desenlace de desarrollo se entiende que la gráfica es de talla
  const titulo = `Crecimiento: ${nombreIndicador(indicador).toLowerCase()}`
  const filas = filasDe(etapas).map((f) => (conPoblacion ? f : { ...f, poblacion: null, nPoblacion: null }))
  const z = esPuntajeZ(unidad)
  const umbral = z ? (indicador === 'talla' ? 'Umbral de talla baja' : 'Umbral de crecimiento bajo') : null
  const valores = filas.flatMap((f) => [f.mediana, f.poblacion, ...(f.banda ?? [])]).filter((v): v is number => v != null)
  if (umbral) valores.push(UMBRAL_Z, 0)
  const dominio: [number, number] = valores.length ? [Math.floor(Math.min(...valores) - 0.3), Math.ceil(Math.max(...valores) + 0.3)] : [-3, 1]
  const hayDatos = filas.some((f) => f.mediana != null)
  // la mitad central solo se nombra si alguna visita la tiene (20 niños o más con dato, D52)
  const conBanda = filas.some((f) => f.banda != null)
  const sinBanda = filas.some((f) => f.sinBanda)
  const medidas = conBanda ? 'Mediana y mitad central del grupo' : 'Mediana del grupo'

  const items = filas.map((f) => `${f.x}. ${f.mediana == null ? 'Sin dato del grupo' : `Mediana del grupo ${dec2(f.mediana)}, ${num(f.n)} niños con dato${f.sinBanda ? ', sin mitad central' : ''}`}${
    f.poblacion == null ? '' : `. Toda la población ${dec2(f.poblacion)}`}`)
  const partes = ['mediana del grupo', ...(conBanda ? ['mitad central del grupo'] : []), ...(conPoblacion ? ['mediana de toda la población'] : [])]
  const etiqueta = `${titulo}: ${partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}` : partes[0]}, en ${unidad}. ${items.join('; ')}`

  const tabla = filas.map((f) => ({
    Visita: f.x,
    'Niños con dato': f.n,
    'Mediana del grupo': f.mediana == null ? null : dec2(f.mediana),
    'Mitad central del grupo': f.banda ? `${dec2(f.banda[0])} a ${dec2(f.banda[1])}` : f.sinBanda ? 'sin cifra' : null,
    ...(conPoblacion ? { 'Mediana de la población': f.poblacion == null ? null : dec2(f.poblacion) } : {}),
  }))

  return (
    // en escritorio el cuerpo del panel se reparte en columna: la gráfica crece y el pie (grupo, unidad) queda abajo
    <Grafica llenar titulo={titulo} className={cn('xl:[&>div:last-child]:flex xl:[&>div:last-child]:flex-col xl:[&>div:last-child>div:first-child]:min-h-0 xl:[&>div:last-child>div:first-child]:flex-1', className)}
      descripcion={conPoblacion ? `${medidas} por visita, frente a la mediana de toda la población; sin dato no hay punto.`
        : `${medidas} por visita; sin dato no hay punto.`}
      exportar={{ nombre: 'vista-clinica-trayectoria', filas: tabla, columnas: Object.keys(tabla[0] ?? {}), muestra,
        unidad: `Unidad: ${unidad}${z ? ' frente a la OMS' : ''} · EC: edad corregida · bajo cada visita, los niños del grupo con dato` }}>
      {hayDatos ? (
        // en escritorio la gráfica toma la altura que le deja el panel (el panel la toma de la pantalla)
        <div className="flex flex-col gap-2 xl:h-full">
          <Leyenda umbral={umbral} conPoblacion={conPoblacion} conBanda={conBanda} sinBanda={sinBanda} />
          <GraficaNavegable etiqueta={etiqueta} resumen={resumenDe('Líneas', filas.length, ['visita', 'visitas'])} items={items}
            className="h-[280px] xl:h-auto xl:min-h-[11rem] xl:flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filas} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
                <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
                <XAxis dataKey="x" stroke={COLOR.eje} tickLine={false} interval={0} height={36} padding={{ left: 28, right: 28 }}
                  tick={(p) => <MarcaVisita {...p} filas={filas} />} />
                <YAxis domain={dominio} ticks={z ? marcasEnteras(dominio) : undefined} stroke={COLOR.eje} fontSize={12} width={52} tickLine={false} axisLine={false} allowDecimals={false}
                  label={{ value: z ? 'puntaje z' : unidad, angle: -90, position: 'insideLeft', offset: 14, fill: COLOR.eje, fontSize: 12, style: { textAnchor: 'middle' } }} />
                <Tooltip cursor={{ stroke: COLOR.referencia, strokeDasharray: '3 3' }} content={(p) => <Globo {...p} unidad={unidad} conPoblacion={conPoblacion} />} />
                {umbral && (
                  <ReferenceLine y={UMBRAL_Z} stroke={COLOR.marca} strokeDasharray="5 4"
                    label={{ value: indicador === 'talla' ? 'talla baja' : 'crecimiento bajo', position: 'insideBottomLeft', fill: COLOR.marca, fontSize: 11 }} />
                )}
                <Area dataKey="banda" stroke="none" fill={SERIES_COLOR[0]} fillOpacity={0.2} isAnimationActive={false} connectNulls={false} activeDot={false} />
                {conPoblacion && (
                  <Line dataKey="poblacion" stroke={COLOR.referencia} strokeWidth={2} isAnimationActive={false} connectNulls={false}
                    dot={{ r: 3, fill: COLOR.referencia, strokeWidth: 0 }} activeDot={false} />
                )}
                <Line dataKey="mediana" stroke={SERIES_COLOR[0]} strokeWidth={2.5} isAnimationActive={false} connectNulls={false}
                  dot={{ r: 4, fill: SERIES_COLOR[0], stroke: COLOR.papel, strokeWidth: 2 }} activeDot={{ r: 6, stroke: COLOR.papel, strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </GraficaNavegable>
        </div>
      ) : <p className="text-sm text-salvia">Ningún niño del grupo tiene esta medida en alguna visita.</p>}
    </Grafica>
  )
}
