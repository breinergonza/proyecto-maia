// Mapa de calor y bosque (forest plot) hechos con tarjetas y SVG propios: sin librerías. Toda celda con menos de 5 niños
// dice «n menor que 5» en vez de una cifra (D4).
import { cn } from '../../lib/cn'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'

export interface CeldaMapa { valor: number | null; texto: string; pequena?: boolean }
export interface FilaMapa { etiqueta: string; celdas: CeldaMapa[] }

/** Tono de una celda: más oscuro (teal) es mejor, entre `bajo` y `alto`. */
function tono(v: number | null, [bajo, alto]: [number, number]): string {
  if (v == null) return 'transparent'
  const t = Math.max(0, Math.min(1, (v - bajo) / (alto - bajo || 1)))
  return `color-mix(in srgb, var(--color-teal-medio) ${Math.round(8 + t * 62)}%, var(--color-papel))`
}

export function MapaCalor({ columnas, filas, escala = [0.5, 1], etiqueta }: {
  columnas: string[]; filas: FilaMapa[]; escala?: [number, number]; etiqueta: string
}) {
  return (
    <div role="table" aria-label={etiqueta} className="overflow-x-auto">
      <div role="row" className="grid min-w-[34rem] gap-1 text-xs font-semibold text-salvia" style={{ gridTemplateColumns: `minmax(9rem,1.4fr) repeat(${columnas.length}, minmax(5rem,1fr))` }}>
        <span role="columnheader">Grupo</span>
        {columnas.map((c) => <span key={c} role="columnheader">{c}</span>)}
      </div>
      {filas.map((f) => (
        <div key={f.etiqueta} role="row" className="mt-1 grid min-w-[34rem] gap-1" style={{ gridTemplateColumns: `minmax(9rem,1.4fr) repeat(${columnas.length}, minmax(5rem,1fr))` }}>
          <span role="rowheader" className="self-center text-sm">{f.etiqueta}</span>
          {f.celdas.map((c, i) => (
            <span key={i} role="cell" style={{ background: c.pequena ? undefined : tono(c.valor, escala) }}
              className={cn('rounded-control px-2 py-2 text-center text-sm', c.pequena && 'border border-dashed border-linea text-xs text-salvia',
                !c.pequena && c.valor != null && (c.valor - escala[0]) / (escala[1] - escala[0]) > 0.6 && 'text-white')}>
              {c.pequena ? N_MENOR_QUE_5 : c.texto}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

export interface PuntoBosque { etiqueta: string; valor: number | null; bajo: number | null; alto: number | null; pequena?: boolean; nota?: string }

/** Un punto con su intervalo por fila y una línea vertical de referencia (el total). */
export function Bosque({ puntos, referencia, dominio = [0.4, 1], etiqueta, nombreValor = 'Valor' }: {
  puntos: PuntoBosque[]; referencia?: number | null; dominio?: [number, number]; etiqueta: string; nombreValor?: string
}) {
  const ancho = 640, izq = 190, der = 20, fila = 30, arriba = 10, abajo = 26
  const alto = arriba + fila * puntos.length + abajo
  const x = (v: number) => izq + ((Math.max(dominio[0], Math.min(dominio[1], v)) - dominio[0]) / (dominio[1] - dominio[0])) * (ancho - izq - der)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => dominio[0] + t * (dominio[1] - dominio[0]))
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="figure" aria-label={etiqueta} className="h-auto w-full min-w-[34rem]">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={arriba} y2={alto - abajo} stroke="var(--color-linea)" />
            <text x={x(t)} y={alto - 8} textAnchor="middle" fontSize="11" fill="var(--color-salvia)">{t.toFixed(2).replace('.', ',')}</text>
          </g>
        ))}
        {referencia != null && <line x1={x(referencia)} x2={x(referencia)} y1={arriba} y2={alto - abajo} stroke="var(--color-referencia)" strokeDasharray="4 3" strokeWidth="1.5" />}
        {puntos.map((p, i) => {
          const y = arriba + fila * i + fila / 2
          return (
            <g key={p.etiqueta}>
              <text x={izq - 8} y={y + 4} textAnchor="end" fontSize="12" fill="var(--color-tinta)">{p.etiqueta}</text>
              {p.pequena ? <text x={izq + 8} y={y + 4} fontSize="11" fill="var(--color-salvia)">{N_MENOR_QUE_5}</text>
                : p.valor == null ? <text x={izq + 8} y={y + 4} fontSize="11" fill="var(--color-salvia)">{p.nota ?? 'Muy pocos niños para calcularlo'}</text>
                : (
                  <>
                    {p.bajo != null && p.alto != null && <line x1={x(p.bajo)} x2={x(p.alto)} y1={y} y2={y} stroke="var(--color-serie-1)" strokeWidth="2" />}
                    <circle cx={x(p.valor)} cy={y} r="5" fill="var(--color-serie-1)" stroke="var(--color-papel)" strokeWidth="2">
                      <title>{`${p.etiqueta}: ${nombreValor} ${p.valor.toFixed(2).replace('.', ',')}`}</title>
                    </circle>
                  </>
                )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
