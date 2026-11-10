// Mapa de calor y bosque (forest plot) hechos con tarjetas y SVG propios: sin librerías. Toda celda con menos de 5 niños
// dice «n menor que 5» en vez de una cifra (D4).
import { cn } from '../../lib/cn'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { GraficaNavegable, resumenDe } from './navegacion'

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
  // HTML y no SVG escalado: el texto mantiene su tamaño a cualquier ancho y las etiquetas largas bajan de renglón
  const pos = (v: number) => `${((Math.max(dominio[0], Math.min(dominio[1], v)) - dominio[0]) / (dominio[1] - dominio[0])) * 100}%`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => dominio[0] + t * (dominio[1] - dominio[0]))
  const fmt = (v: number) => v.toFixed(2).replace('.', ',')
  const items = puntos.map((p) => `${p.etiqueta}. ` + (p.pequena ? N_MENOR_QUE_5 : p.valor == null ? (p.nota ?? 'Muy pocos niños para calcularlo')
    : `${nombreValor} ${fmt(p.valor)}` + (p.bajo != null && p.alto != null ? `, entre ${fmt(p.bajo)} y ${fmt(p.alto)}` : '')))
  const marcas = [dominio[0], (dominio[0] + dominio[1]) / 2, dominio[1]]
  return (
    <GraficaNavegable etiqueta={etiqueta} resumen={resumenDe('Bosque', puntos.length, ['grupo', 'grupos'])} items={items}>
      {/* cada fila: nombre y cifra arriba, la raya debajo a todo el ancho; así se lee igual en un panel angosto */}
      <div aria-hidden className="flex flex-col gap-2.5 py-1">
        {puntos.map((p) => (
          <div key={p.etiqueta}>
            <div className="flex items-baseline justify-between gap-3 text-sm leading-tight">
              <span>{p.etiqueta}</span>
              <span className="shrink-0 font-semibold tabular-nums">{p.pequena || p.valor == null ? '' : fmt(p.valor)}</span>
            </div>
            <div className="relative mt-1 h-4">
              <span className="absolute inset-x-0 top-1/2 h-px bg-linea" />
              {ticks.map((t) => <span key={t} className="absolute inset-y-0.5 w-px bg-linea" style={{ left: pos(t) }} />)}
              {referencia != null && <span className="absolute -inset-y-1 border-l-2 border-dashed border-referencia" style={{ left: pos(referencia) }} />}
              {p.pequena || p.valor == null ? (
                <span className="absolute inset-y-0 left-1 flex items-center bg-papel pr-1 text-xs text-salvia">{p.pequena ? N_MENOR_QUE_5 : (p.nota ?? 'Muy pocos niños para calcularlo')}</span>
              ) : (
                <>
                  {p.bajo != null && p.alto != null && (
                    <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-serie-1" style={{ left: pos(p.bajo), width: `calc(${pos(p.alto)} - ${pos(p.bajo)})` }} />
                  )}
                  <span title={`${p.etiqueta}: ${nombreValor} ${fmt(p.valor)}`} className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-papel bg-serie-1"
                    style={{ left: pos(p.valor) }} />
                </>
              )}
            </div>
          </div>
        ))}
        <div className="relative h-4 text-xs text-salvia tabular-nums">
          {marcas.map((t, i) => (
            <span key={t} className={cn('absolute', i === 0 ? '' : i === marcas.length - 1 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: pos(t) }}>{fmt(t)}</span>
          ))}
        </div>
      </div>
    </GraficaNavegable>
  )
}
