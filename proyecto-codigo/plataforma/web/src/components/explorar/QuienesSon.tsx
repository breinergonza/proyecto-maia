// «Quiénes son»: para cada característica (sexo, edad gestacional, peso para la edad, sede) dos barras por categoría, la
// del grupo elegido y la de todos los niños, en %. Es un solo SVG para que el botón PNG de la gráfica lo exporte.
import type { DistribucionGrupo } from '../../api/tipos'
import { pct } from '../../lib/formato'
import { COLOR, LeyendaSeries, SERIES_COLOR, type Serie } from '../graficos'

const LEYENDA: Serie[] = [{ clave: 'grupo', nombre: 'Grupo elegido', color: 0 }, { clave: 'todos', nombre: 'Todos los niños', color: 2 }]
const ANCHO = 640, ETIQUETA = 220, BARRA = 8, FILA = 26, TITULO = 24, SEPARACION = 14, FIN = 56

export function QuienesSon({ distribuciones }: { distribuciones: Record<string, DistribucionGrupo> }) {
  const bloques = Object.entries(distribuciones)
  if (bloques.length === 0) return <p className="text-sm text-salvia">No hay datos de nacimiento para describir al grupo.</p>
  const util = ANCHO - ETIQUETA - FIN
  let y = 0
  const dibujo = bloques.map(([clave, d]) => {
    const arriba = y
    y += TITULO + d.categorias.length * FILA + SEPARACION
    return { clave, d, arriba }
  })
  const descripcion = bloques.map(([, d]) => `${d.etiqueta}: ${d.categorias.map((c) =>
    `${c.etiqueta}, grupo ${c.grupo == null ? 'sin dato' : pct(c.grupo)}, todos ${pct(c.todos)}`).join('; ')}`).join('. ')
  return (
    <>
      <LeyendaSeries series={LEYENDA} marca="barra" />
      <svg viewBox={`0 0 ${ANCHO} ${y}`} width="100%" role="img" aria-label={`Quiénes son los niños del grupo frente a todos. ${descripcion}`}
        className="mt-1 block max-w-full" style={{ fontSize: 12 }}>
        {dibujo.map(({ clave, d, arriba }) => (
          <g key={clave} transform={`translate(0 ${arriba})`}>
            <text x={0} y={14} fontWeight={700} fill="currentColor">{d.etiqueta}</text>
            {d.categorias.map((c, i) => {
              const top = TITULO + i * FILA
              return (
                <g key={c.categoria} transform={`translate(0 ${top})`}>
                  <text x={0} y={BARRA + 4} fill="currentColor">{c.etiqueta}</text>
                  <rect x={ETIQUETA} y={0} width={Math.max(0, (c.grupo ?? 0) / 100 * util)} height={BARRA} rx={2} fill={SERIES_COLOR[0]} />
                  <text x={ETIQUETA + Math.max(0, (c.grupo ?? 0) / 100 * util) + 4} y={BARRA} fill={COLOR.eje}>{c.grupo == null ? '—' : pct(c.grupo)}</text>
                  <rect x={ETIQUETA} y={BARRA + 2} width={Math.max(0, c.todos / 100 * util)} height={BARRA} rx={2} fill={SERIES_COLOR[2]} />
                  <text x={ETIQUETA + Math.max(0, c.todos / 100 * util) + 4} y={2 * BARRA + 2} fill={COLOR.eje}>{pct(c.todos)}</text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
    </>
  )
}
