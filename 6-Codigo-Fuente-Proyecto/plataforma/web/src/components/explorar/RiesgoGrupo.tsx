// Riesgo del grupo elegido: por desenlace, cuántos niños tienen riesgo alto y cuántos no. El mismo desenlace calculado desde
// varias visitas se dice una vez (el título del grupo) y cada visita es una fila.
import type { RiesgoDesenlace } from '../../api/tipos'
import { num } from '../../lib/formato'
import { familiaDe } from '../../lib/familias'
import { COLOR, LeyendaSeries, SERIES_COLOR, type Serie } from '../graficos'
import { nombreSinCorte } from '../modelos/desenlaces'
import { Tabla } from '../ui'

const SERIES: Serie[] = [
  { clave: 'alto', nombre: 'Riesgo alto', color: 1 },
  { clave: 'resto', nombre: 'Sin riesgo alto', color: 0 },
]

// Barras horizontales en un solo SVG (para que el botón PNG de la gráfica lo exporte). Un desenlace con varias visitas lleva su
// título en una línea y una fila por visita, sangrada; uno con una sola visita pone el título (hasta dos renglones) y la visita
// en la misma fila.
const ANCHO = 640, ETIQUETA = 270, SANGRIA = 14, FIN = 96, BARRA = 15, MAX_CARACTERES = 34, MAX_RENGLONES = 2, RENGLON = 19, SEPARACION = 12

function renglones(texto: string): string[] {
  const salida: string[] = []
  let actual = ''
  for (const palabra of texto.split(/\s+/)) {
    if (actual && `${actual} ${palabra}`.length > MAX_CARACTERES) { salida.push(actual); actual = palabra } else actual = actual ? `${actual} ${palabra}` : palabra
  }
  if (actual) salida.push(actual)
  if (salida.length <= MAX_RENGLONES) return salida
  const corta = salida.slice(0, MAX_RENGLONES)
  corta[MAX_RENGLONES - 1] = `${corta[MAX_RENGLONES - 1].slice(0, MAX_CARACTERES - 1)}…`
  return corta
}

interface GrupoDeDesenlace { clave: string; nombre: string; filas: RiesgoDesenlace[] }

/** Los desenlaces por familia, en el orden en que llegan. */
export function agruparPorDesenlace(filas: readonly RiesgoDesenlace[]): GrupoDeDesenlace[] {
  const grupos = new Map<string, GrupoDeDesenlace>()
  for (const d of filas) {
    const clave = familiaDe(d.clave)
    const grupo = grupos.get(clave) ?? { clave, nombre: nombreSinCorte(d.desenlace), filas: [] }
    grupo.filas.push(d)
    grupos.set(clave, grupo)
  }
  return [...grupos.values()]
}

const desde = (d: RiesgoDesenlace) => `Desde ${(d.momento_nombre ?? d.momento).replace(/^\p{Lu}(?=\p{Ll})/u, (c) => c.toLowerCase())}`

export function RiesgoGrupo({ filas }: { filas: RiesgoDesenlace[] }) {
  if (filas.length === 0) {
    return <p className="text-sm text-salvia">Ningún niño de este grupo tiene riesgo calculado con estos datos.</p>
  }
  const grupos = agruparPorDesenlace(filas)
  const util = ANCHO - ETIQUETA - FIN
  const maximo = Math.max(1, ...filas.map((d) => d.ninos))
  let y = 0
  // cada barra con su fila: arriba, alto de la fila y los renglones de su rótulo
  const barras: { d: RiesgoDesenlace; lineas: string[]; arriba: number; alto: number; x: number }[] = []
  const titulos: { nombre: string; arriba: number }[] = []
  for (const g of grupos) {
    if (g.filas.length === 1) {
      const d = g.filas[0]
      const lineas = [...renglones(g.nombre), desde(d)]
      const alto = Math.max(BARRA, lineas.length * RENGLON) + SEPARACION
      barras.push({ d, lineas, arriba: y, alto, x: 0 })
      y += alto
      continue
    }
    titulos.push({ nombre: g.nombre, arriba: y })
    y += RENGLON + 4
    for (const d of g.filas) {
      barras.push({ d, lineas: [desde(d)], arriba: y, alto: RENGLON + 4, x: SANGRIA })
      y += RENGLON + 4
    }
    y += SEPARACION
  }
  return (
    <>
      <LeyendaSeries series={SERIES} marca="barra" />
      <svg viewBox={`0 0 ${ANCHO} ${y}`} width="100%" role="img" className="mt-1 block max-w-3xl" style={{ fontSize: 15 }}
        aria-label={`Niños del grupo por desenlace: ${filas.map((d) => `${nombreSinCorte(d.desenlace)}, ${desde(d).toLowerCase()}, ${num(d.altos)} con riesgo alto de ${num(d.ninos)}`).join('; ')}`}>
        {titulos.map((t) => (
          <text key={t.nombre} x={0} y={t.arriba + 14} fill="currentColor" fontWeight={600}>{t.nombre}</text>
        ))}
        {barras.map(({ d, lineas, arriba, alto, x }) => {
          const centro = (alto - (x ? 4 : SEPARACION)) / 2
          const largo = d.ninos / maximo * util
          const altos = Math.min(largo, d.altos / maximo * util)
          // en una fila con título propio el rótulo es solo la visita, en gris
          const rotuloSolo = lineas.length === 1
          return (
            <g key={d.clave} transform={`translate(0 ${arriba})`}>
              <title>{`${nombreSinCorte(d.desenlace)}, ${desde(d).toLowerCase()}: ${num(d.altos)} con riesgo alto de ${num(d.ninos)}`}</title>
              <text fill={rotuloSolo ? COLOR.eje : 'currentColor'}>
                {lineas.map((l, i) => (
                  <tspan key={i} x={x} y={centro - (lineas.length - 1) * RENGLON / 2 + i * RENGLON + 4}
                    fill={!rotuloSolo && i === lineas.length - 1 ? COLOR.eje : undefined}>{l}</tspan>
                ))}
              </text>
              <rect x={ETIQUETA} y={centro - BARRA / 2} width={Math.max(0, largo - altos)} height={BARRA} fill={SERIES_COLOR[0]} />
              <rect x={ETIQUETA + Math.max(0, largo - altos)} y={centro - BARRA / 2} width={altos} height={BARRA} fill={SERIES_COLOR[1]} />
              <text x={ETIQUETA + largo + 6} y={centro + 4} fill={COLOR.eje}>{num(d.altos)} de {num(d.ninos)}</text>
            </g>
          )
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-teal">Ver la tabla</summary>
        <Tabla densa>
          <thead><tr><th>Desenlace, calculado desde</th><th className="text-right">Niños</th><th className="text-right">Riesgo alto</th></tr></thead>
          <tbody>
            {grupos.flatMap((g) => [
              ...(g.filas.length > 1 ? [<tr key={`${g.clave}-titulo`}><th colSpan={3} className="pt-2 text-left font-semibold normal-case tracking-normal text-tinta">{g.nombre}</th></tr>] : []),
              ...g.filas.map((d) => (
                <tr key={d.clave}>
                  <td>{g.filas.length > 1 ? <span className="pl-3">{desde(d)}</span> : <><span className="font-semibold">{g.nombre}</span><span className="block text-xs text-salvia">{desde(d)}</span></>}</td>
                  <td className="text-right">{num(d.ninos)}</td>
                  <td className="text-right">{num(d.altos)}</td>
                </tr>
              )),
            ])}
          </tbody>
        </Tabla>
      </details>
    </>
  )
}
