// Crecimiento del grupo visita por visita, en dos pestañas de caja y bigotes (D79). «Desviación estándar»: la caja va
// del promedio menos una DE al promedio más una y los bigotes llegan a ±2 DE. «Varianza»: la caja de cuartiles (la
// mitad central, la raya en la mediana, los bigotes en el valor más bajo y más alto que no es atípico) con la varianza
// bajo cada visita; la varianza va en unidades al cuadrado y no se puede dibujar sobre el eje del puntaje. Una visita con
// menos de 20 niños con dato no tiene caja (D52): queda su mediana como punto. Para las medidas en puntaje z, el umbral de
// crecimiento bajo. Los puntos son niños: en cada visita en que se calcula el riesgo, los niños en alerta que más se
// alejan del promedio, coloreados por su riesgo; solo los ven los perfiles que ven niños uno por uno, y al tocar uno se
// abre su resumen con el enlace a su ficha. Si el grupo es toda la población, su línea sería la misma: no se dibuja.
// El globo es corto (cabe en una pantalla pequeña): al pasar por una visita, su resumen; al pasar por un punto, ese niño.
// Con la tarjeta angosta, la leyenda pasa bajo la gráfica en una línea y la gráfica usa todo el ancho.
import type { KeyboardEvent } from 'react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { Termino } from '../Termino'
import type { EtapaClinica, ExtremoClinico } from '../../api/tipos'
import { cn } from '../../lib/cn'
import { MINIMO_NINOS_DISTRIBUCION } from '../../lib/exportar'
import { dec, dec2, indicador as nombreIndicador, ninos, num, pct, riesgo as textoRiesgo } from '../../lib/formato'
import { Grafica } from '../grafica'
import { COLOR, SERIES_COLOR } from '../graficos'
import { GraficaNavegable, resumenDe } from '../graficos/navegacion'
import { PanelPestana, Pestanas } from '../ui/Pestanas'

const UMBRAL_Z = -2
const nombreVisita = (etapa: string) => etapa.replace(' (edad corregida)', ' EC')
const esPuntajeZ = (unidad: string) => /(^|\s)z(\s|$)/i.test(unidad)
/** «talla baja» o «crecimiento bajo»: lo que cuenta el umbral −2; ``null`` si la medida no va en puntaje z. */
export const nombreBajo = (indicador: string, unidad: string) =>
  esPuntajeZ(unidad) ? (indicador === 'talla' ? 'talla baja' : 'crecimiento bajo') : null
/** «más de 99,9 %»: el riesgo que se pinta en coral lleno. */
const esRiesgoMaximo = (r: number) => 100 * r >= 99.95
/** Los puntos de una visita se reparten a izquierda y derecha de la caja para no taparse. */
const DESPLAZAMIENTOS = [-13, 13, -13, 13, 0]

export type ClavePestana = 'de' | 'var'
const PESTANAS = [{ clave: 'de', texto: 'Desviación estándar' }, { clave: 'var', texto: 'Varianza' }] as const

/** Una marca por cada entero del dominio: así el 0 y el umbral −2 siempre llevan número. */
export const marcasEnteras = ([desde, hasta]: [number, number]) =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)

type Fila = {
  x: string
  n: number | null
  mediana: number | null
  media: number | null
  de: number | null
  varianza: number | null
  q1: number | null
  q3: number | null
  bajo: number | null
  alto: number | null
  /** El porcentaje de los niños con dato con crecimiento bajo (z < −2); como la caja, pide 20 niños o más. */
  pctBajo: number | null
  /** Con 20 niños o más con dato: hay caja en las dos pestañas. */
  conCaja: boolean
  /** Hay mediana, pero menos de 20 niños con dato: sin caja (D52). */
  sinCaja: boolean
  poblacion: number | null
  poblacionMedia: number | null
}

/** Lo que dibuja una pestaña en una visita: el alto de los bigotes, la caja y su raya; sin caja, la mediana suelta. */
export type FilaDibujo = Fila & {
  rango: [number, number] | null
  caja: [number, number] | null
  centro: number | null
  suelto: number | null
  referencia: number | null
}

/** Un niño de los puntos: dónde va, su dato y su riesgo. ``distancia``: cuántas DE se aleja del promedio de su visita. */
export interface Punto {
  sujeto: string
  x: string
  z: number
  riesgo: number
  fuerte: boolean
  dx: number
  /** El más alejado de su visita lleva su código escrito al lado. */
  rotulo: boolean
  distancia: number | null
  /** En la pestaña de cuartiles: queda por fuera de los bigotes. */
  atipico?: boolean
}

export function filasDe(etapas: EtapaClinica[]): Fila[] {
  return etapas.map((e) => {
    const g = e.grupo
    const conCaja = !!g && g.media != null && g.de != null && g.p25 != null && g.p75 != null && g.bigote_bajo != null && g.bigote_alto != null
    return {
      x: nombreVisita(e.etapa),
      n: g?.n ?? null,
      mediana: g?.mediana ?? null,
      media: g?.media ?? null,
      de: g?.de ?? null,
      varianza: g?.varianza ?? null,
      q1: g?.p25 ?? null,
      q3: g?.p75 ?? null,
      bajo: g?.bigote_bajo ?? null,
      alto: g?.bigote_alto ?? null,
      pctBajo: g?.pct_bajo ?? null,
      conCaja,
      sinCaja: g?.mediana != null && !conCaja,
      poblacion: e.poblacion?.mediana ?? null,
      poblacionMedia: e.poblacion?.media ?? null,
    }
  })
}

export function dibujoDe(f: Fila, pestana: ClavePestana): FilaDibujo {
  const referencia = pestana === 'de' ? f.poblacionMedia : f.poblacion
  if (!f.conCaja) return { ...f, rango: null, caja: null, centro: null, suelto: f.mediana, referencia }
  if (pestana === 'de') {
    const m = f.media!, d = f.de!
    return { ...f, rango: [m - 2 * d, m + 2 * d], caja: [m - d, m + d], centro: m, suelto: null, referencia }
  }
  return { ...f, rango: [f.bajo!, f.alto!], caja: [f.q1!, f.q3!], centro: f.mediana, suelto: null, referencia }
}

function puntosDe(extremos: ExtremoClinico[], filas: Fila[], pestana: ClavePestana): Punto[] {
  const vistos = new Map<string, number>()
  return extremos.flatMap((e) => {
    const x = nombreVisita(e.etapa)
    const f = filas.find((fila) => fila.x === x)
    if (!f) return []
    const k = vistos.get(x) ?? 0
    vistos.set(x, k + 1)
    return [{
      sujeto: e.sujeto, x, z: e.z, riesgo: e.riesgo, fuerte: esRiesgoMaximo(e.riesgo), dx: DESPLAZAMIENTOS[k % DESPLAZAMIENTOS.length],
      rotulo: k === 0,
      distancia: f.media != null && f.de ? Math.abs(e.z - f.media) / f.de : null,
      atipico: pestana === 'var' && f.bajo != null && f.alto != null ? e.z < f.bajo || e.z > f.alto : undefined,
    }]
  })
}

const etiquetaPunto = (p: Punto) => `Niño ${p.sujeto}, ${p.x}: ${dec2(p.z)}, riesgo ${textoRiesgo(p.riesgo)}`

/** El dibujo de una visita: los bigotes, la caja y su raya. Recharts lo llama con la barra de todo el rango. */
function Caja({ x = 0, y = 0, width = 0, height = 0, payload }: { x?: number; y?: number; width?: number; height?: number; payload?: FilaDibujo }) {
  if (!payload?.rango || !payload.caja || payload.centro == null) return null
  const [lo, hi] = payload.rango
  const arriba = Math.min(y, y + height)
  const alto = Math.abs(height)
  const px = (v: number) => (hi === lo ? arriba : arriba + ((hi - v) / (hi - lo)) * alto)
  const cx = x + width / 2
  const ancho = Math.min(width, 44)
  const tope = px(payload.caja[1])
  return (
    <g aria-hidden>
      <line x1={cx} x2={cx} y1={px(hi)} y2={px(lo)} stroke={COLOR.serie} strokeWidth={1.5} />
      <line x1={cx - 12} x2={cx + 12} y1={px(hi)} y2={px(hi)} stroke={COLOR.serie} strokeWidth={1.5} />
      <line x1={cx - 12} x2={cx + 12} y1={px(lo)} y2={px(lo)} stroke={COLOR.serie} strokeWidth={1.5} />
      <rect x={cx - ancho / 2} y={tope} width={ancho} height={Math.max(px(payload.caja[0]) - tope, 1)} rx={3}
        fill={COLOR.franja} stroke={COLOR.serie} strokeWidth={1.5} />
      <line x1={cx - ancho / 2} x2={cx + ancho / 2} y1={px(payload.centro)} y2={px(payload.centro)} stroke={SERIES_COLOR[0]} strokeWidth={3} />
    </g>
  )
}

/** Un niño en la gráfica: un botón (clic, Enter o espacio) que abre su resumen bajo la gráfica. Al pasar el puntero
 *  avisa (``senalar``) para que el globo diga ese niño y no el que Recharts empareja con la visita. */
export function PuntoNino({ cx = 0, cy = 0, payload, elegido, elegir, senalar }: {
  cx?: number; cy?: number; payload?: Punto; elegido: boolean; elegir: (sujeto: string) => void
  senalar?: (sujeto: string | null) => void
}) {
  if (!payload) return null
  const p = payload
  const x = cx + p.dx
  const alTeclear = (ev: KeyboardEvent<SVGGElement>) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return
    ev.preventDefault()
    ev.stopPropagation()
    elegir(p.sujeto)
  }
  return (
    <g role="button" tabIndex={0} aria-label={etiquetaPunto(p)} aria-pressed={elegido} onClick={() => elegir(p.sujeto)} onKeyDown={alTeclear}
      onMouseEnter={() => senalar?.(p.sujeto)} onMouseLeave={() => senalar?.(null)} className="cursor-pointer outline-none">
      {/* el área de toque es más grande que el punto */}
      <circle cx={x} cy={cy} r={12} fill="transparent" />
      {elegido && <circle cx={x} cy={cy} r={11.5} fill="none" stroke={SERIES_COLOR[0]} strokeWidth={2.5} />}
      <circle cx={x} cy={cy} r={8} fill={p.fuerte ? COLOR.marca : COLOR.alerta} stroke={p.fuerte ? COLOR.papel : COLOR.marca} strokeWidth={2} />
      {p.rotulo && (
        // con la gráfica angosta no cabe junto a la caja vecina: el código queda en el globo y en el resumen del punto
        <text x={x + (p.dx < 0 ? -13 : 13)} y={cy + 4} textAnchor={p.dx < 0 ? 'end' : 'start'} fontSize={11} fontWeight={700} fill={COLOR.marca}
          className="@max-2xl:hidden">
          {p.sujeto}
        </text>
      )}
    </g>
  )
}

/** El niño elegido: su visita, su dato, su riesgo, cuánto se aleja y el enlace a su ficha. */
export function DetalleNino({ punto, pestana }: { punto: Punto; pestana: ClavePestana }) {
  const lejania = pestana === 'var' && punto.atipico !== undefined
    ? (punto.atipico ? 'queda por fuera de los bigotes de su visita' : 'queda dentro de los bigotes de su visita')
    : punto.distancia == null ? null
      : `a ${dec(punto.distancia)} DE ${punto.z < 0 ? 'por debajo' : 'por encima'} del promedio de su visita`
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-linea bg-papel px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <span className="inline-block size-2.5 rounded-full" aria-hidden
          style={{ background: punto.fuerte ? COLOR.marca : COLOR.alerta, border: punto.fuerte ? undefined : `2px solid ${COLOR.marca}` }} />
        Niño {punto.sujeto}
      </span>
      <span>{punto.x}: {dec2(punto.z)} · riesgo estimado {textoRiesgo(punto.riesgo)}{lejania ? ` · ${lejania}` : ''}</span>
      <Link className="font-semibold text-teal underline-offset-2 hover:underline" to={`/ninos/${encodeURIComponent(punto.sujeto)}`}>Abrir ficha del niño</Link>
    </div>
  )
}

/** «Cómo leerla»: el dibujo de una caja con el nombre de cada parte, los colores de los puntos y las líneas de referencia. */
function ComoLeerla({ pestana, conCaja, conPuntos, conPoblacion, umbral }: {
  pestana: ClavePestana; conCaja: boolean; conPuntos: boolean; conPoblacion: boolean; umbral: string | null
}) {
  const partes = pestana === 'de'
    ? [{ y: 8, texto: '2 DE por encima' }, { y: 40, texto: '1 DE por encima' }, { y: 76, texto: 'Promedio', fuerte: true }, { y: 112, texto: '1 DE por debajo' }, { y: 144, texto: '2 DE por debajo' }]
    : [{ y: 8, texto: 'Máximo no atípico' }, { y: 44, texto: 'Q3 (75 %)' }, { y: 70, texto: 'Mediana', fuerte: true }, { y: 108, texto: 'Q1 (25 %)' }, { y: 144, texto: 'Mínimo no atípico' }]
  const caja = pestana === 'de' ? { arriba: 40, abajo: 112, raya: 76 } : { arriba: 44, abajo: 108, raya: 70 }
  return (
    // tarjeta ancha: al lado de la gráfica, con el dibujo de una caja (se desplaza en vez de encoger el dibujo). Angosta: bajo
    // la gráfica, solo los colores y las líneas en una línea que se parte; la descripción de arriba ya dice qué es la caja
    <aside aria-label="Cómo leerla" className="flex shrink-0 flex-col gap-2 text-xs @2xl:w-40 @2xl:border-l @2xl:border-linea @2xl:pl-3 xl:min-h-0 xl:overflow-y-auto [&>*]:shrink-0">
      {conCaja && (
        <div className="hidden flex-col gap-2 @2xl:flex">
          <p className="font-semibold uppercase tracking-wide text-salvia">Cómo leerla</p>
          <div className="relative h-[156px] w-full">
            <svg width="30" height="156" className="absolute left-0 top-0" aria-hidden>
              <line x1={15} x2={15} y1={8} y2={144} stroke={COLOR.serie} strokeWidth={1.5} />
              <line x1={5} x2={25} y1={8} y2={8} stroke={COLOR.serie} strokeWidth={1.5} />
              <line x1={5} x2={25} y1={144} y2={144} stroke={COLOR.serie} strokeWidth={1.5} />
              <rect x={1} y={caja.arriba} width={28} height={caja.abajo - caja.arriba} rx={3} fill={COLOR.franja} stroke={COLOR.serie} strokeWidth={1.5} />
              <line x1={1} x2={29} y1={caja.raya} y2={caja.raya} stroke={SERIES_COLOR[0]} strokeWidth={3} />
            </svg>
            <ul>
              {partes.map((p) => (
                <li key={p.texto} className={cn('absolute left-9 -translate-y-1/2 leading-tight', p.fuerte && 'font-semibold text-teal')} style={{ top: p.y }}>{p.texto}</li>
              ))}
            </ul>
          </div>
          <p className="text-salvia">{pestana === 'de' ? 'La caja reúne cerca de 2 de cada 3 niños; los bigotes, cerca de 95 de cada 100.' : 'La caja reúne la mitad central de los niños.'}</p>
        </div>
      )}
      <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 @2xl:flex-col @2xl:flex-nowrap @2xl:gap-1.5', conCaja && '@2xl:border-t @2xl:border-linea @2xl:pt-2')}>
        {conPuntos && (
          <>
            <li className="inline-flex items-center gap-2">
              <span className="inline-block size-3.5 shrink-0 rounded-full" style={{ background: COLOR.marca }} aria-hidden />Riesgo más de 99,9 %
            </li>
            <li className="inline-flex items-center gap-2">
              <span className="inline-block size-3.5 shrink-0 rounded-full border-2" style={{ background: COLOR.alerta, borderColor: COLOR.marca }} aria-hidden />Riesgo menor, en alerta
            </li>
          </>
        )}
        {conPoblacion && (
          <li className="inline-flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 shrink-0 rounded-full" style={{ background: COLOR.referencia }} aria-hidden />
            {pestana === 'de' && conCaja ? 'Promedio de toda la población' : 'Mediana de toda la población'}
          </li>
        )}
        {umbral && (
          <li className="inline-flex items-center gap-2">
            <span className="inline-block w-4 shrink-0 border-t-2 border-dashed border-coral-hondo" aria-hidden />
            <span>{umbral} de la <Termino id="oms">OMS</Termino> (<Termino id="de">−2</Termino>)</span>
          </li>
        )}
      </ul>
      {conPuntos && <p className="text-salvia">Puntos: los niños en alerta más alejados del promedio en cada visita. Toque un punto para ver el niño.</p>}
    </aside>
  )
}

/** La visita y, debajo, cuántos niños del grupo tienen dato en ella (el pie lo dice) y la dispersión de esa pestaña. */
function MarcaVisita({ x, y, payload, filas, pestana }: { x?: number | string; y?: number | string; payload?: { value?: unknown }; filas: Fila[]; pestana: ClavePestana }) {
  const visita = String(payload?.value ?? '')
  const f = filas.find((fila) => fila.x === visita)
  const cifra = !f?.conCaja ? null : pestana === 'de' ? `DE ${dec2(f.de)}` : `var. ${dec2(f.varianza)}`
  return (
    <text x={Number(x ?? 0)} y={Number(y ?? 0)} textAnchor="middle" fill={COLOR.eje} fontSize={12}>
      <tspan x={Number(x ?? 0)} dy={12}>{visita}</tspan>
      <tspan x={Number(x ?? 0)} dy={15} fontSize={11}>{f?.n == null ? 'sin dato' : num(f.n)}</tspan>
      {cifra && <tspan x={Number(x ?? 0)} dy={14} fontSize={11} fill={SERIES_COLOR[0]}>{cifra}</tspan>}
    </text>
  )
}

/** El globo de la gráfica, corto para que quepa en una pantalla pequeña. Al pasar por un punto, ese niño
 *  (``senalado``); si no, el resumen de la visita bajo el puntero. Recharts empareja los puntos por posición y no por
 *  visita, así que un niño que llegue en ``payload`` no se usa. */
export function Globo({ active, payload, unidad, pestana, conPoblacion, bajo, senalado }: {
  active?: boolean; payload?: ReadonlyArray<{ payload?: FilaDibujo | Punto }>; unidad: string; pestana: ClavePestana; conPoblacion: boolean
  /** «talla baja» o «crecimiento bajo» (``nombreBajo``); ``null`` si la medida no va en puntaje z. */
  bajo: string | null
  senalado: Punto | null
}) {
  if (!active) return null
  const f = payload?.map((p) => p.payload).find((p): p is FilaDibujo => !!p && 'conCaja' in p)
  if (!senalado && !f) return null
  const z = esPuntajeZ(unidad)
  return (
    <div role="status" aria-live="polite" className="max-w-60 rounded-control border border-linea bg-papel px-2.5 py-1.5 text-xs leading-snug shadow-elevada sm:text-sm">
      {senalado ? (
        <>
          <p className="font-semibold">Niño {senalado.sujeto} · {senalado.x}</p>
          <p>{z ? `z ${dec2(senalado.z)}` : `${dec2(senalado.z)} ${unidad}`} · riesgo {textoRiesgo(senalado.riesgo)}</p>
        </>
      ) : f ? (
        <>
          <p className="font-semibold">{f.x} · {f.n == null ? 'sin dato' : ninos(f.n)}</p>
          {f.mediana == null ? <p>Sin dato del grupo</p>
            : !f.conCaja ? <p>Mediana {dec2(f.mediana)} · sin caja: menos de {MINIMO_NINOS_DISTRIBUCION} niños</p>
              : pestana === 'de' ? <p>Promedio {dec2(f.media)} · DE {dec2(f.de)}</p>
                : <p>Mediana {dec2(f.mediana)} · varianza {dec2(f.varianza)}</p>}
          {bajo && f.conCaja && f.pctBajo != null && <p>{pct(f.pctBajo)} con {bajo}</p>}
          {conPoblacion && f.referencia != null && <p>Toda la población: {dec2(f.referencia)}</p>}
        </>
      ) : null}
    </div>
  )
}

export function Trayectoria({ indicador, unidad, etapas, extremos, muestra, conPoblacion, className }: {
  indicador: string
  unidad: string
  etapas: EtapaClinica[]
  /** Los niños en alerta más alejados del promedio de cada visita; ``null`` para quien no ve niños uno por uno. */
  extremos?: ExtremoClinico[] | null
  /** Quién es el grupo y cuántos niños son: va al pie y a la imagen que se descarga. */
  muestra: string
  /** Falso cuando el grupo es toda la población: su línea sería la misma. */
  conPoblacion: boolean
  className?: string
}) {
  const [pestana, setPestana] = useState<ClavePestana>('de')
  const [elegido, setElegido] = useState<string | null>(null)
  const [senalado, setSenalado] = useState<string | null>(null)
  // «Crecimiento» y la medida: también en el desenlace de desarrollo se entiende que la gráfica es de talla
  const titulo = `Crecimiento: ${nombreIndicador(indicador).toLowerCase()}`
  const filas = filasDe(etapas).map((f) => (conPoblacion ? f : { ...f, poblacion: null, poblacionMedia: null }))
  // la caja solo se promete si alguna visita la tiene (20 niños o más con dato, D52); sin ninguna, no hay pestañas
  const conCaja = filas.some((f) => f.conCaja)
  const sinCaja = filas.some((f) => f.sinCaja)
  const vista: ClavePestana = conCaja ? pestana : 'de'
  // sin caja, la línea de la población es su mediana, como el punto suelto del grupo
  const dibujo = filas.map((f) => dibujoDe(f, vista)).map((f) => (conCaja ? f : { ...f, referencia: f.poblacion }))
  const puntos = puntosDe(extremos ?? [], filas, vista)
  const conPuntos = puntos.length > 0
  const z = esPuntajeZ(unidad)
  const umbral = z ? (indicador === 'talla' ? 'Umbral de talla baja' : 'Umbral de crecimiento bajo') : null
  const bajo = nombreBajo(indicador, unidad)
  const valores = [
    ...dibujo.flatMap((f) => [...(f.rango ?? []), f.suelto, f.referencia]),
    ...puntos.map((p) => p.z),
  ].filter((v): v is number => v != null)
  if (umbral) valores.push(UMBRAL_Z, 0)
  const dominio: [number, number] = valores.length ? [Math.floor(Math.min(...valores) - 0.3), Math.ceil(Math.max(...valores) + 0.3)] : [-3, 1]
  const hayDatos = filas.some((f) => f.mediana != null)
  const elegidoPunto = puntos.find((p) => p.sujeto === elegido) ?? null
  const senaladoPunto = puntos.find((p) => p.sujeto === senalado) ?? null

  const descripcion = !conCaja
    ? `Mediana del grupo por visita${conPoblacion ? ', frente a la mediana de toda la población' : ''}; con menos de ${MINIMO_NINOS_DISTRIBUCION} niños con dato no se calcula la caja.`
    : vista === 'de'
      ? 'Promedio por visita: la caja va de una desviación estándar (DE) por debajo a una por encima y los bigotes llegan a ±2 DE.'
      : 'Caja y bigotes por cuartiles: la caja reúne la mitad central de los niños, la raya es la mediana y los bigotes llegan al valor más bajo y más alto que no es atípico. Bajo cada visita, la varianza.'

  const items = dibujo.map((f) => {
    const base = f.mediana == null ? `${f.x}. Sin dato del grupo`
      : !f.conCaja ? `${f.x}. Mediana del grupo ${dec2(f.mediana)}, ${num(f.n)} niños con dato, sin caja`
        : vista === 'de' ? `${f.x}. Promedio ${dec2(f.media)}, DE ${dec2(f.de)}, ${num(f.n)} niños con dato`
          : `${f.x}. Mediana ${dec2(f.mediana)}, mitad central ${dec2(f.q1)} a ${dec2(f.q3)}, varianza ${dec2(f.varianza)}, ${num(f.n)} niños con dato`
    const conBajo = bajo && f.conCaja && f.pctBajo != null ? `, ${pct(f.pctBajo)} con ${bajo}` : ''
    const poblacion = f.referencia == null ? '' : `. Toda la población ${dec2(f.referencia)}`
    const suyos = puntos.filter((p) => p.x === f.x)
    const alejados = suyos.length ? `. En alerta y más alejados: ${suyos.map((p) => `${p.sujeto} (${dec2(p.z)}; riesgo ${textoRiesgo(p.riesgo)})`).join(', ')}` : ''
    return `${base}${conBajo}${poblacion}${alejados}`
  })
  const medida = !conCaja ? 'mediana del grupo' : vista === 'de' ? 'promedio y desviación estándar del grupo' : 'mediana, cuartiles y varianza del grupo'
  const etiqueta = `${titulo}: ${medida}${conPoblacion ? ', frente a toda la población' : ''}, en ${unidad}. ${items.join('; ')}`

  const cifra = (f: Fila, v: number | null) => (f.conCaja ? dec2(v) : f.sinCaja ? 'sin cifra' : null)
  const tabla = filas.map((f) => ({
    Visita: f.x,
    'Niños con dato': f.n,
    Promedio: cifra(f, f.media),
    DE: cifra(f, f.de),
    Varianza: cifra(f, f.varianza),
    'Mínimo no atípico': cifra(f, f.bajo),
    'Primer cuartil (25 %)': cifra(f, f.q1),
    Mediana: f.mediana == null ? null : dec2(f.mediana),
    'Tercer cuartil (75 %)': cifra(f, f.q3),
    'Máximo no atípico': cifra(f, f.alto),
    ...(bajo ? { [`Con ${bajo} (%)`]: cifra(f, f.pctBajo) } : {}),
    ...(conPoblacion ? {
      'Promedio de la población': f.poblacionMedia == null ? null : dec2(f.poblacionMedia),
      'Mediana de la población': f.poblacion == null ? null : dec2(f.poblacion),
    } : {}),
  }))

  const elegir = (sujeto: string) => setElegido((antes) => (antes === sujeto ? null : sujeto))
  const grafica = (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <GraficaNavegable etiqueta={etiqueta} resumen={resumenDe('Cajas', filas.length, ['visita', 'visitas'])} items={items}
        className="h-[320px] xl:h-auto xl:min-h-[16rem] xl:flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dibujo} margin={{ left: 0, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
            <XAxis dataKey="x" type="category" allowDuplicatedCategory={false} stroke={COLOR.eje} tickLine={false} interval={0} height={conCaja ? 50 : 36}
              padding={{ left: 20, right: 20 }} tick={(p) => <MarcaVisita {...p} filas={filas} pestana={vista} />} />
            <YAxis domain={dominio} ticks={z ? marcasEnteras(dominio) : undefined} stroke={COLOR.eje} fontSize={12} width={52} tickLine={false} axisLine={false} allowDecimals={false}
              label={{ value: z ? 'puntaje z' : unidad, angle: -90, position: 'insideLeft', offset: 14, fill: COLOR.eje, fontSize: 12, style: { textAnchor: 'middle' } }} />
            <Tooltip cursor={{ fill: COLOR.rejilla, fillOpacity: 0.35 }}
              content={(p) => <Globo {...p} unidad={unidad} pestana={vista} conPoblacion={conPoblacion} bajo={bajo} senalado={senaladoPunto} />} />
            {umbral && (
              <ReferenceLine y={UMBRAL_Z} stroke={COLOR.marca} strokeDasharray="5 4"
                label={{ value: indicador === 'talla' ? 'talla baja' : 'crecimiento bajo', position: 'insideBottomRight', fill: COLOR.marca, fontSize: 11 }} />
            )}
            <Bar dataKey="rango" barSize={44} isAnimationActive={false} shape={(p: unknown) => <Caja {...(p as Parameters<typeof Caja>[0])} />} />
            <Line dataKey="centro" stroke={SERIES_COLOR[0]} strokeWidth={1.5} strokeDasharray="4 4" strokeOpacity={0.55}
              isAnimationActive={false} connectNulls={false} dot={false} activeDot={false} />
            <Line dataKey="suelto" stroke="none" isAnimationActive={false} connectNulls={false}
              dot={{ r: 4, fill: SERIES_COLOR[0], stroke: COLOR.papel, strokeWidth: 2 }} activeDot={false} />
            {conPoblacion && (
              <Line dataKey="referencia" stroke={COLOR.referencia} strokeWidth={2} isAnimationActive={false} connectNulls={false}
                dot={{ r: 3, fill: COLOR.referencia, strokeWidth: 0 }} activeDot={false} />
            )}
            {conPuntos && (
              <Scatter data={puntos} dataKey="z" isAnimationActive={false} tooltipType="none"
                shape={(p: unknown) => {
                  const q = p as { cx?: number; cy?: number; payload?: Punto }
                  return <PuntoNino cx={q.cx} cy={q.cy} payload={q.payload} elegido={q.payload?.sujeto === elegido} elegir={elegir} senalar={setSenalado} />
                }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </GraficaNavegable>
      {elegidoPunto && <DetalleNino punto={elegidoPunto} pestana={vista} />}
    </div>
  )

  return (
    // en escritorio el cuerpo del panel se reparte en columna: la gráfica crece y el pie (grupo, unidad) queda abajo. La
    // tarjeta no baja de lo que mide su contenido con la gráfica en su alto mínimo: en una pantalla baja se desplaza la
    // página, no se encoge la gráfica hasta no leerse (ni se monta sobre el pie)
    <Grafica llenar titulo={titulo} className={cn('xl:min-h-min xl:[&>div:last-child]:flex xl:[&>div:last-child]:flex-col xl:[&>div:last-child>div:first-child]:min-h-0 xl:[&>div:last-child>div:first-child]:flex-1 xl:[&>div:last-child>div:first-child]:overflow-y-auto', className)}
      descripcion={descripcion}
      exportar={{ nombre: 'vista-clinica-trayectoria', filas: tabla, columnas: Object.keys(tabla[0] ?? {}), muestra,
        unidad: `Unidad: ${unidad}${z ? ' frente a la OMS' : ''}; la varianza, en unidades al cuadrado · EC: edad corregida · bajo cada visita, los niños del grupo con dato` }}>
      {hayDatos ? (
        <div className="@container flex flex-col gap-2 xl:h-full">
          {conCaja && <Pestanas prefijo="crecimiento" etiqueta="Medida de la dispersión" pestanas={PESTANAS} activa={vista} elegir={setPestana} />}
          {conCaja ? (
            <PanelPestana prefijo="crecimiento" activa={vista} className="flex flex-col gap-3 @2xl:flex-row xl:flex-1">
              {grafica}
              <ComoLeerla pestana={vista} conCaja conPuntos={conPuntos} conPoblacion={conPoblacion} umbral={umbral} />
            </PanelPestana>
          ) : (
            // sin pestañas no hay panel de pestaña
            <div className="flex flex-col gap-3 @2xl:flex-row xl:flex-1">
              {grafica}
              <ComoLeerla pestana={vista} conCaja={false} conPuntos={conPuntos} conPoblacion={conPoblacion} umbral={umbral} />
            </div>
          )}
          {/* solo si alguna visita tiene mediana sin caja: explica por qué ahí hay un punto suelto */}
          {sinCaja && <p className="text-xs">Sin caja: pide al menos {MINIMO_NINOS_DISTRIBUCION} niños con dato en la visita.</p>}
        </div>
      ) : <p className="text-sm text-salvia">Ningún niño del grupo tiene esta medida en alguna visita.</p>}
    </Grafica>
  )
}
