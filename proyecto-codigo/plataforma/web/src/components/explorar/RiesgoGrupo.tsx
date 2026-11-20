// Riesgo del grupo elegido: por desenlace, cuántos niños tienen riesgo alto y cuántos no.
import type { RiesgoDesenlace } from '../../api/tipos'
import { num } from '../../lib/formato'
import { COLOR, LeyendaSeries, SERIES_COLOR, type Serie } from '../graficos'
import { Tabla } from '../ui'

const SERIES: Serie[] = [
  { clave: 'alto', nombre: 'Riesgo alto', color: 1 },
  { clave: 'resto', nombre: 'Sin riesgo alto', color: 0 },
]

// Barras horizontales: el nombre completo del desenlace cabe a la izquierda (en hasta tres renglones) en vez de
// amontonarse debajo de cada barra. Es un solo SVG para que el botón PNG de la gráfica lo exporte.
const ANCHO = 640, ETIQUETA = 270, FIN = 96, BARRA = 14, MAX_CARACTERES = 38, MAX_RENGLONES = 3, RENGLON = 15, SEPARACION = 12

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

export function RiesgoGrupo({ filas }: { filas: RiesgoDesenlace[] }) {
  if (filas.length === 0) {
    return <p className="text-sm text-salvia">Ningún niño de este grupo tiene riesgo calculado con estos datos.</p>
  }
  const util = ANCHO - ETIQUETA - FIN
  const maximo = Math.max(1, ...filas.map((d) => d.ninos))
  let y = 0
  const dibujo = filas.map((d) => {
    const lineas = renglones(d.desenlace)
    const alto = Math.max(BARRA, lineas.length * RENGLON) + SEPARACION
    const arriba = y
    y += alto
    return { d, lineas, arriba, alto }
  })
  return (
    <>
      <LeyendaSeries series={SERIES} marca="barra" />
      <svg viewBox={`0 0 ${ANCHO} ${y}`} width="100%" role="img" className="mt-1 block max-w-full" style={{ fontSize: 12.8 }}
        aria-label={`Niños del grupo por desenlace: ${filas.map((d) => `${d.desenlace}, ${num(d.altos)} con riesgo alto de ${num(d.ninos)}`).join('; ')}`}>
        {dibujo.map(({ d, lineas, arriba, alto }) => {
          const centro = (alto - SEPARACION) / 2
          const largo = d.ninos / maximo * util
          const altos = Math.min(largo, d.altos / maximo * util)
          return (
            <g key={d.clave} transform={`translate(0 ${arriba})`}>
              <title>{`${d.desenlace}: ${num(d.altos)} con riesgo alto de ${num(d.ninos)}`}</title>
              <text fill="currentColor">
                {lineas.map((l, i) => <tspan key={i} x={0} y={centro - (lineas.length - 1) * RENGLON / 2 + i * RENGLON + 4}>{l}</tspan>)}
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
          <thead><tr><th>Desenlace</th><th className="text-right">Niños</th><th className="text-right">Riesgo alto</th></tr></thead>
          <tbody>
            {filas.map((d) => (
              <tr key={d.clave}>
                <td><span className="font-semibold">{d.desenlace}</span><span className="block text-xs text-salvia">Visita: {d.momento_nombre}</span></td>
                <td className="text-right">{num(d.ninos)}</td>
                <td className="text-right">{num(d.altos)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </details>
    </>
  )
}
