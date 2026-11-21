// Crecimiento del grupo elegido: una línea por medida con el % de niños medidos con crecimiento bajo en cada visita.
// Los colores de cada medida son los del Tablero (seriesCrecimiento).
import type { CrecimientoEtapa } from '../../api/tipos'
import { num, pct } from '../../lib/formato'
import { seriesCrecimiento } from '../../paginas/Tablero'
import { LeyendaSeries, LineasSeries, type FilaSeries } from '../graficos'

const nombreVisita = (f: { etapa: string; etapa_nombre: string | null }) => (f.etapa_nombre ?? f.etapa).replace(' (edad corregida)', ' EC')

export function CrecimientoGrupo({ filas }: { filas: CrecimientoEtapa[] }) {
  if (filas.length === 0) return <p className="text-sm text-salvia">Sin datos de crecimiento para este grupo.</p>
  const etapas = [...new Map([...filas].sort((a, b) => a.orden - b.orden).map((f) => [f.etapa, nombreVisita(f)])).entries()]
  const medidas = [...new Set(filas.map((f) => f.indicador))]
  const celda = new Map(filas.map((f) => [`${f.etapa}|${f.indicador}`, f]))
  const series = seriesCrecimiento(medidas)
  const datos: FilaSeries[] = etapas.map(([etapa, nombre]) => {
    const fila: FilaSeries = { x: nombre }
    for (const m of medidas) {
      const c = celda.get(`${etapa}|${m}`)
      fila[m] = c ? c.pct_bajo : null
      fila[`${m}:datos`] = c ? c.datos : null
    }
    return fila
  })
  return (
    <>
      <LeyendaSeries series={series} />
      <LineasSeries filas={datos} series={series} alto={260} formatoY={(v) => `${num(v)} %`}
        etiqueta={`Porcentaje de niños del grupo con crecimiento bajo en cada visita: ${series.map((s) =>
          `${s.nombre}, ${datos.map((f) => `${f.x} ${typeof f[s.clave] === 'number' ? pct(f[s.clave] as number) : 'sin dato'}`).join(', ')}`).join('; ')}`}
        formatoTooltip={(v, f, s) => `${pct(v)} bajo · ${num(Number(f[`${s.clave}:datos`]))} datos`} />
      {series.length < medidas.length && <p className="mt-1 text-sm">Las demás medidas no se dibujan.</p>}
    </>
  )
}
