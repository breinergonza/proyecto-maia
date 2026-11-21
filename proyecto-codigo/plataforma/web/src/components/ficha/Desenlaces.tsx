// La pestaña «Desenlaces» de la ficha (S21): todos los desenlaces del niño en una sola lista (nombre, riesgo más reciente, qué
// tan alto es, cuánto cambió y «En prueba») y, al lado, el detalle del que se elige: los de 12 meses con su riesgo visita por
// visita y los demás con su tarjeta de riesgo y su evolución. El más alto abre elegido; el elegido vive en la dirección
// (`?desenlace=`). Los que no tienen riesgo calculado se listan aparte con la razón en una línea. Al imprimir salen todos.
import type { UseQueryResult } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { useSearchParams } from 'react-router'
import type { RiesgoPorCorte } from '../../api/ninos'
import type { HistoriaRiesgo, RiesgoNino } from '../../api/tipos'
import { cn } from '../../lib/cn'
import {
  type CambioDeRiesgo, cambioCorto, desenlaceDeUrlAntigua, estadoDe, familiaDe, type FamiliaDelNino, familiasConRiesgo, familiasDelNino,
  ordenarPorRiesgo, resumenDeAusente, resumenDeFamilia, resumenDeSerie, type ResumenDeDesenlace, type SerieDeRiesgo,
} from '../../lib/familias'
import { AYUDA_DOS_CIFRAS, cuantosMenos, nivelCorto, nombreFamilia } from '../../lib/lenguaje'
import { frase, RIESGO_ALTO } from '../../lib/formato'
import { ErrorConReintento } from '../ErrorConReintento'
import { familiasSinExcluidas, TarjetaRiesgo, TrayectoriaRiesgo } from '../ficha'
import { Cargando } from '../ui'
import { usePestanaEnUrl } from '../ui/Pestanas'
import { DetalleDe12Meses } from './RiesgoA12Meses'

/** La tarjeta de riesgo de la última visita de un desenlace, con el nombre de esa visita. */
export type TarjetaConVisita = RiesgoNino & { visita: string }

type Detalle =
  | { tipo: 'doce_meses'; familia: FamiliaDelNino }
  | { tipo: 'otro'; tarjetas: TarjetaConVisita[] }
  | { tipo: 'sin_riesgo' }

export interface DesenlaceDelNino {
  resumen: ResumenDeDesenlace
  detalle: Detalle
}

/** Todos los desenlaces del niño, los de más riesgo primero y al final los que no tienen riesgo calculado. Los de 12 meses salen
 * de la respuesta con las familias (una API anterior, sin ellas, no aporta ninguno); los demás, de las tarjetas de su última
 * visita y de su riesgo en cada visita. */
export function desenlacesDelNino({ historia, trayectoria, riesgos }: {
  historia: RiesgoPorCorte | undefined; trayectoria: HistoriaRiesgo | undefined; riesgos: readonly TarjetaConVisita[]
}): DesenlaceDelNino[] {
  const doce = historia?.familias ? familiasDelNino(historia) : null
  // los de 12 meses ya se cuentan visita por visita: ni sus tarjetas ni sus filas de evolución salen como otro desenlace
  const de12 = new Set([...familiasConRiesgo(historia), ...(doce?.mostradas ?? []).map((f) => f.familia.clave)])
  const tarjetas = riesgos.filter((r) => !de12.has(familiaDe(r.clave)))

  const de12Meses = (doce?.mostradas ?? []).map((f): DesenlaceDelNino => ({ resumen: resumenDeFamilia(f), detalle: { tipo: 'doce_meses', familia: f } }))

  // los demás: un desenlace por clave de `familiaDe` (el desenlace con su ventana: `desarrollo_6m` y sus filas `_desde_<visita>`),
  // con sus tarjetas y su evolución juntas, no uno por cada nombre con que las nombra la tarjeta o la historia
  const series = new Map<string, SerieDeRiesgo>(familiasSinExcluidas(trayectoria?.puntos, de12, familiaDe)
    .map((f) => [f.clave, { clave: f.clave, nombre: f.nombre, puntos: f.puntos }]))
  const tarjetasDe = new Map<string, TarjetaConVisita[]>()
  for (const r of tarjetas) tarjetasDe.set(familiaDe(r.clave), [...(tarjetasDe.get(familiaDe(r.clave)) ?? []), r])
  for (const [clave, rs] of tarjetasDe) {
    // sin evolución (aún se pide o no hay), la serie son las propias tarjetas
    const serie: SerieDeRiesgo = series.get(clave) ?? {
      clave, nombre: nombreFamilia(rs.map((r) => r.desenlace)),
      puntos: rs.map((r) => ({ clave: r.clave, riesgo: r.riesgo, percentil: r.percentil, momento_nombre: r.visita })),
    }
    const enUso = rs.findLast((r) => estadoDe(r.clave) === 'en_uso')   // la última visita del modelo que da alertas
    series.set(clave, { ...serie, tarjeta: enUso && { clave: enUso.clave, riesgo: enUso.riesgo, percentil: enUso.percentil } })
  }
  const otros = [...series.values()].map((s): DesenlaceDelNino => ({
    resumen: resumenDeSerie(s), detalle: { tipo: 'otro', tarjetas: tarjetasDe.get(s.clave) ?? [] },
  }))
  // una priorizada que el paquete no calcula se dice aparte, salvo que haya riesgo suyo de otra fuente
  const ausentes = (doce?.ausentes ?? []).filter((a) => !series.has(a.clave))
    .map((a): DesenlaceDelNino => ({ resumen: resumenDeAusente(a), detalle: { tipo: 'sin_riesgo' } }))
  return ordenarPorRiesgo([...de12Meses, ...otros, ...ausentes], (d) => d.resumen)
}

/** Si algún desenlace tiene riesgo calculado: de eso depende que la ficha abra en «Desenlaces» o en otra pestaña con contenido. */
export const hayRiesgo = (desenlaces: readonly DesenlaceDelNino[]) => desenlaces.some((d) => d.resumen.riesgo != null)

export function Desenlaces({ sujeto, historia, desenlaces, modeloClinico }: {
  sujeto: string
  historia: UseQueryResult<RiesgoPorCorte>
  desenlaces: readonly DesenlaceDelNino[]
  modeloClinico: string | null
}) {
  const [params] = useSearchParams()
  const claves = desenlaces.map((d) => d.resumen.clave)
  // una dirección de antes (`?ver=riesgo-<familia>`, `?ver=otros`) abre el desenlace que nombraba, si existe
  const antigua = desenlaceDeUrlAntigua(params.get('ver'), claves, desenlaces.find((d) => d.detalle.tipo === 'otro')?.resumen.clave)
  const preferida = antigua?.desenlace
  const [elegido, elegir] = usePestanaEnUrl('desenlace', preferida != null ? [preferida, ...claves.filter((c) => c !== preferida)] : claves)

  if (historia.isPending) return <Cargando texto="Calculando el riesgo visita por visita…" />
  const conRiesgo = desenlaces.filter((d) => d.resumen.riesgo != null)
  const sinRiesgo = desenlaces.filter((d) => d.resumen.riesgo == null)
  return (
    <div className="flex flex-col gap-3 lg:h-full">
      <h2 className="sr-only">Desenlaces</h2>
      {historia.error && (
        <ErrorConReintento error={historia.error} que="el riesgo a 12 meses de este niño" reintentando={historia.isFetching}
          reintentar={() => { void historia.refetch() }} />
      )}
      {desenlaces.length > 0 && (
        <div className="flex flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Desenlaces de este niño" className="no-imprimir print:hidden lg:min-h-0 lg:overflow-y-auto">
            {conRiesgo.length > 0 && (
              <ul aria-label="Desenlaces del niño" className="divide-y divide-linea rounded-panel border border-linea/80 bg-papel">
                {conRiesgo.map((d) => <Fila key={d.resumen.clave} d={d} elegido={d.resumen.clave === elegido} elegir={elegir} />)}
              </ul>
            )}
            {sinRiesgo.length > 0 && (
              <>
                <h3 className={cn('mb-1 text-sm', conRiesgo.length > 0 && 'mt-4')}>Sin riesgo calculado</h3>
                <ul aria-label="Desenlaces sin riesgo calculado" className="divide-y divide-linea rounded-panel border border-linea/80 bg-papel">
                  {sinRiesgo.map((d) => <Fila key={d.resumen.clave} d={d} elegido={d.resumen.clave === elegido} elegir={elegir} />)}
                </ul>
              </>
            )}
          </nav>
          <div className="min-w-0 space-y-4 lg:min-h-0 lg:overflow-y-auto">
            {/* en pantalla se ve el elegido; en papel, todos */}
            {desenlaces.map((d) => (
              <section key={d.resumen.clave} aria-label={d.resumen.nombre}
                className={cn('print:break-inside-avoid', d.resumen.clave !== elegido && 'hidden print:block')}>
                <Contenido d={d} historia={historia.data} sujeto={sujeto} modeloClinico={modeloClinico} />
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const Flecha = ({ c }: { c: CambioDeRiesgo }) => {
  const Icono = c.sentido === 'subio' ? ArrowUp : c.sentido === 'bajo' ? ArrowDown : Minus
  return <Icono size={14} aria-hidden className="shrink-0" />
}

/** Un desenlace en la lista: se elige con un clic y dice lo esencial sin abrirlo. */
function Fila({ d: { resumen: r }, elegido, elegir }: { d: DesenlaceDelNino; elegido: boolean; elegir: (clave: string) => void }) {
  const alto = r.riesgo != null && r.riesgo.percentil >= RIESGO_ALTO
  return (
    <li>
      <button type="button" data-desenlace={r.clave} aria-current={elegido ? 'true' : undefined} onClick={() => elegir(r.clave)}
        className={cn('block w-full px-3 py-2.5 text-left transition-colors', elegido ? 'bg-teal-tinte' : 'hover:bg-fondo',
          alto && 'shadow-[inset_4px_0_0_var(--color-coral)]')}>
        <span className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className={cn('text-sm font-semibold', elegido && 'text-teal')}>{r.nombre}</span>
          {r.enPrueba && <span className="text-xs font-semibold text-ocre-hondo" title="Aún no se usa para dar alertas: se muestra para seguirlo y evaluarlo.">En prueba</span>}
        </span>
        {r.riesgo ? (
          <span className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className={cn('text-lg font-bold tabular-nums', alto ? 'text-coral-hondo' : 'text-teal')}>{r.riesgo.texto}</span>
            {/* la misma comparación en todas las filas, la de la tarjeta; «Alto» y «Muy alto» se suman en coral, no la reemplazan */}
            <span>Más que {cuantosMenos(r.riesgo.percentil)} de 10</span>
            {alto && <span className="font-semibold text-coral-hondo">{nivelCorto(r.riesgo.percentil)}</span>}
            {r.cambio && (
              <span className={cn('inline-flex items-center gap-1', r.cambio.sentido === 'subio' ? 'text-coral-hondo' : 'text-teal')}>
                <Flecha c={r.cambio} />{cambioCorto(r.cambio)}
              </span>
            )}
          </span>
        ) : (
          <span className="mt-0.5 block text-xs">{r.sinRiesgo}</span>
        )}
      </button>
    </li>
  )
}

/** El detalle de un desenlace. */
function Contenido({ d, historia, sujeto, modeloClinico }: { d: DesenlaceDelNino; historia: RiesgoPorCorte | undefined; sujeto: string; modeloClinico: string | null }) {
  const { resumen, detalle } = d
  switch (detalle.tipo) {
    case 'doce_meses':
      return historia ? <DetalleDe12Meses f={detalle.familia} historia={historia} /> : null
    case 'sin_riesgo':
      return (
        <div className="rounded-panel border border-linea/80 bg-papel p-4 shadow-suave sm:p-5">
          <h3 className="text-base">{resumen.nombre}</h3>
          <p className="mt-1 text-sm">{resumen.sinRiesgo}</p>
        </div>
      )
    case 'otro':
      return (
        <div className="space-y-4">
          {detalle.tarjetas.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm">{AYUDA_DOS_CIFRAS}</p>
              {detalle.tarjetas.map((r) => (
                <TarjetaRiesgo key={r.id} r={{ ...r, desenlace: frase(r.desenlace) }} nota={`Calculado con lo medido hasta ${r.visita}`}
                  origen={{ estado: estadoDe(r.clave), version: modeloClinico }} />
              ))}
            </div>
          )}
          <TrayectoriaRiesgo sujeto={sujeto} solo={resumen.clave} grilla="grid-cols-1" />
        </div>
      )
  }
}
