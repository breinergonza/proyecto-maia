// Piezas comunes de los submódulos de analítica: modo técnico, guía de lectura, estados vacíos y formatos.
import type { UseQueryResult } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import type { RespuestaAnalitica } from '../../api/tipos'
import { puede, useSesion } from '../../auth/sesion'
import { Aviso, Boton, Cargando, Vacio } from '../../components/ui'
import { cn } from '../../lib/cn'
import { dec2, pct } from '../../lib/formato'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { useContextoAnalitica } from './contexto'

// ------------------------------------------------------------------ modo técnico (preferencia del navegador)
const CLAVE_TECNICO = 'maia.analitica.tecnico'
function leerTecnico(): boolean {
  try { return localStorage.getItem(CLAVE_TECNICO) === '1' } catch { return false }
}

const Tecnico = createContext<{ tecnico: boolean; fijar: (v: boolean) => void }>({ tecnico: false, fijar: () => {} })
export const useTecnico = () => useContext(Tecnico)

export function ProveedorTecnico({ children }: { children: ReactNode }) {
  const [tecnico, setTecnico] = useState(leerTecnico)
  const fijar = useCallback((v: boolean) => {
    setTecnico(v)
    try { localStorage.setItem(CLAVE_TECNICO, v ? '1' : '0') } catch { /* sin almacenamiento: vale solo para esta vista */ }
  }, [])
  const valor = useMemo(() => ({ tecnico, fijar }), [tecnico, fijar])
  return <Tecnico.Provider value={valor}>{children}</Tecnico.Provider>
}

/** El lugar del encabezado donde cada submódulo pone su «Guía de lectura» (lo fija `AnaliticaLayout`). */
export const RanuraGuia = createContext<HTMLElement | null>(null)

/** Interruptor del modo técnico: muestra la jerga y las cifras completas. */
export function InterruptorTecnico() {
  const { tecnico, fijar } = useTecnico()
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-salvia">
      <button type="button" role="switch" aria-checked={tecnico} aria-label="Modo técnico" onClick={() => fijar(!tecnico)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full border transition-colors', tecnico ? 'border-teal bg-teal' : 'border-linea bg-fondo')}>
        <span className={cn('absolute top-0.5 size-4.5 rounded-full bg-papel shadow-suave transition-all', tecnico ? 'left-5.5' : 'left-0.5')} />
      </button>
      Modo técnico
    </label>
  )
}

/** «Guía de lectura» de un submódulo: un botón en el encabezado que despliega una explicación breve. */
export function Guia({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState(false)
  const ranura = useContext(RanuraGuia)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {   // se cierra con Escape o al hacer clic fuera
    if (!abierta) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false)
    const clic = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false) }
    document.addEventListener('keydown', tecla)
    document.addEventListener('mousedown', clic)
    return () => { document.removeEventListener('keydown', tecla); document.removeEventListener('mousedown', clic) }
  }, [abierta])
  const guia = (
    <div ref={caja} className="relative">
      <Boton variante="secundario" chico aria-expanded={abierta} aria-controls="guia-lectura" onClick={() => setAbierta(!abierta)}>
        Guía de lectura
      </Boton>
      {abierta && (
        <div id="guia-lectura" role="region" aria-label="Guía de lectura"
          className="absolute right-0 z-20 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-panel border border-linea bg-papel p-4 text-sm shadow-elevada">
          <div className="space-y-2">{children}</div>
        </div>
      )}
    </div>
  )
  return ranura ? createPortal(guia, ranura) : <div className="mb-4">{guia}</div>
}

// ------------------------------------------------------------------ estados de la respuesta
export function EstadoVacio({ estado }: { estado: 'sin_artefactos' | 'pendiente' }) {
  const { usuario } = useSesion()
  if (estado === 'pendiente') {
    return <Vacio titulo="Este análisis estará disponible pronto">Todavía no se calcula para este modelo. Cuando esté listo aparecerá aquí.</Vacio>
  }
  return (
    <Vacio titulo="Este entrenamiento es anterior a la analítica">
      <p>No se recalcula para no cambiar cifras ya conocidas. Para ver este análisis, vuelva a entrenar el modelo en Administración › Entrenamientos.</p>
      {puede(usuario, ['admin']) && <p className="mt-2"><Link to="/admin/entrenamientos" className="font-semibold text-teal underline">Ir a Entrenamientos</Link></p>}
    </Vacio>
  )
}

/** Carga, error, `sin_artefactos` y `pendiente`; con datos entrega la respuesta completa. */
export function Resultado<T>({ consulta, children }: { consulta: UseQueryResult<RespuestaAnalitica<T>>; children: (r: RespuestaAnalitica<T>) => ReactNode }) {
  if (consulta.isPending) return consulta.fetchStatus === 'idle' ? <Cargando texto="Buscando el entrenamiento…" /> : <Cargando />
  if (consulta.isError) return <Aviso>No se pudo cargar este análisis. Intente de nuevo en un momento.</Aviso>
  const r = consulta.data
  if (r.estado !== 'ok') return <EstadoVacio estado={r.estado} />
  return <>{children(r)}</>
}

/** Como `Resultado`, pero entrega los datos del desenlace elegido en el contexto. */
export function PorDesenlace<T extends object>({ consulta, children }: {
  consulta: UseQueryResult<RespuestaAnalitica<T>>; children: (datos: T, r: RespuestaAnalitica<T>) => ReactNode
}) {
  const { desenlace } = useContextoAnalitica()
  return (
    <Resultado consulta={consulta}>
      {(r) => {
        const d = desenlace ? r.desenlaces?.[desenlace] : undefined
        if (!d) return <Vacio titulo="Sin datos para este desenlace">Elija otro desenlace en el contexto de análisis.</Vacio>
        const { estado, n } = d as { estado?: string; n?: number }
        if (estado === 'insuficiente') {
          return <Aviso tono="teal">Hay muy pocos niños{n != null ? ` (${n})` : ''} o falta una de las dos clases para calcular este análisis.</Aviso>
        }
        return <>{children(d, r)}</>
      }}
    </Resultado>
  )
}

// ------------------------------------------------------------------ formatos
/** Texto de una cifra que puede venir omitida por tener menos de 5 niños. */
export const omitida = (v: number | null | undefined, f: (x: number) => string) => (v == null ? N_MENOR_QUE_5 : f(v))
export const pctN = (v: number | null | undefined) => omitida(v, pct)
export const decN = (v: number | null | undefined) => omitida(v, dec2)
/** Una fracción de 0 a 1 dicha como porcentaje. */
export const fracPct = (v: number | null | undefined) => (v == null ? '—' : pct(100 * v))
export const unoDec = (v: number) => dec2(v)
export const ic = (a: { auc: number | null; ic_bajo: number | null; ic_alto: number | null }) =>
  a.auc == null ? '—' : `${dec2(a.auc)}${a.ic_bajo != null && a.ic_alto != null ? ` (${dec2(a.ic_bajo)} a ${dec2(a.ic_alto)})` : ''}`

export function EnPrueba() {
  return <span className="rounded-full border border-ocre/30 bg-ocre-tinte px-2 py-0.5 text-xs font-semibold text-[#7a5717]">En prueba</span>
}

/** Nombre clínico de un desenlace y si está «En prueba». */
export function useNombreDesenlace() {
  const { desenlaces } = useContextoAnalitica()
  return (clave: string) => {
    const d = desenlaces.find((x) => x.clave === clave)
    return { nombre: d?.nombre ?? clave, enPrueba: d?.etiqueta === 'En prueba' }
  }
}

/** El pie de las exportaciones: con cuántos niños se calculó. */
export const muestraDe = (n?: number | null, casos?: number | null) =>
  n == null ? undefined : `${n} niños${casos != null ? `, ${casos} casos` : ''}`

// ------------------------------------------------------------------ aciertos y errores de la alerta (2×2)
export type ModoMatriz = 'conteos' | 'fila' | 'total'
interface Confusion { tp: number | null; fp: number | null; fn: number | null; tn: number | null }

/** La matriz de aciertos y errores como un cuadro de 2×2: conteos, % por fila (de los que tuvieron o no el desenlace)
 *  o % del total. Las celdas con menos de 5 niños dicen «n menor que 5» y no entran en los porcentajes. */
export function MatrizAlerta({ c, modo = 'conteos', compacta }: { c: Confusion; modo?: ModoMatriz; compacta?: boolean }) {
  const suma = (...v: (number | null)[]) => (v.some((x) => x == null) ? null : v.reduce<number>((a, b) => a + (b ?? 0), 0))
  const total = suma(c.tp, c.fp, c.fn, c.tn), casos = suma(c.tp, c.fn), sanos = suma(c.fp, c.tn)
  const texto = (v: number | null, base: number | null) => {
    if (v == null) return N_MENOR_QUE_5
    if (modo === 'conteos') return v.toLocaleString('es-CO')
    const b = modo === 'fila' ? base : total
    return b ? pct((100 * v) / b) : '—'
  }
  const celda = 'grid place-content-center rounded-control text-center leading-tight'
  const alto = compacta ? 'h-16' : 'h-20'
  const cifra = compacta ? 'text-xl' : 'text-2xl'
  return (
    <div role="table" aria-label="Aciertos y errores de la alerta" className="grid grid-cols-[4.5rem_1fr_1fr] gap-1 text-xs text-salvia">
      <span role="row" className="contents">
        <span role="columnheader" />
        <span role="columnheader" className="text-center font-semibold">Con alerta</span>
        <span role="columnheader" className="text-center font-semibold">Sin alerta</span>
      </span>
      <span role="row" className="contents">
        <span role="rowheader" className="self-center">Tuvo el desenlace</span>
        <span role="cell" className={cn(celda, alto, 'bg-teal text-white')}><b className={cn(cifra, 'tabular-nums')}>{texto(c.tp, casos)}</b>detectados</span>
        <span role="cell" className={cn(celda, alto, 'bg-coral-tinte text-coral-hondo')}><b className={cn(cifra, 'tabular-nums')}>{texto(c.fn, casos)}</b>no detectados</span>
      </span>
      <span role="row" className="contents">
        <span role="rowheader" className="self-center">No lo tuvo</span>
        <span role="cell" className={cn(celda, alto, 'bg-ocre-tinte text-ocre-hondo')}><b className={cn(cifra, 'tabular-nums')}>{texto(c.fp, sanos)}</b>falsas alarmas</span>
        <span role="cell" className={cn(celda, alto, 'bg-teal-tinte text-teal')}><b className={cn(cifra, 'tabular-nums')}>{texto(c.tn, sanos)}</b>sin falsa alarma</span>
      </span>
    </div>
  )
}

/** Enlace «Ver ›» a otro submódulo conservando el contexto de la URL. */
export function IrA({ submodulo, children }: { submodulo: string; children: ReactNode }) {
  const { search } = useContextoAnalitica()
  return <Link to={{ pathname: `/analitica/${submodulo}`, search }} className="text-sm font-semibold text-teal hover:underline">{children} ›</Link>
}
