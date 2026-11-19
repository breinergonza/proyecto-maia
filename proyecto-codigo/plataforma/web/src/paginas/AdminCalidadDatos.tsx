// Calidad de datos (Administración): cuatro cifras, tres paneles (alertas por tipo, aciertos frente a la revisión y
// dónde se concentran) y, debajo, la cola de datos raros con tarjetas compactas en grilla y los filtros junto al título.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { pedir } from '../api/cliente'
import { useAciertos, useConcentracion } from '../api/calidad'
import type { ConcentracionAlertas, DatoRevision, Pagina, Respuesta, ResumenTablero } from '../api/tipos'
import { Aviso, Boton, Cargando, Cifra, Encabezado, Insignia, Paginador, Panel, Selector, Texto, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import {
  BarrasApiladas, escalaRedonda, LineasSeries, MiniSerie, RangoEsperado, type FilaSeries, type PuntoSerie, type Serie,
} from '../components/graficos'
import { aproximado, fecha, medida, num, numero, pct, RESPUESTAS } from '../lib/formato'
import { alerta, ayudaAlerta, motivoExtra } from '../lib/lenguaje'

const TAMANO = 12

export default function AdminCalidadDatos() {
  const [estado, setEstado] = useState<'pendiente' | 'revisado' | 'todos'>('pendiente')
  const [capa, setCapa] = useState('')
  const [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ['revision', 'datos', estado, capa, pagina],
    queryFn: () => pedir<Pagina<DatoRevision>>('/revision/datos', { params: { estado, capa, pagina, tamano: TAMANO } }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex flex-col">
      <Encabezado titulo="Calidad de datos"
        accion={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <label className="sr-only" htmlFor="estado">Estado</label>
            <Selector id="estado" className="sm:w-44" value={estado} onChange={(e) => { setEstado(e.target.value as typeof estado); setPagina(1) }}>
              <option value="pendiente">Sin responder</option>
              <option value="revisado">Ya respondidos</option>
              <option value="todos">Todos</option>
            </Selector>
            <label className="sr-only" htmlFor="capa">Tipo de alerta</label>
            <Selector id="capa" className="sm:w-52" value={capa} onChange={(e) => { setCapa(e.target.value); setPagina(1) }}>
              <option value="">Todas las alertas</option>
              {['1', '2', '3'].map((c) => <option key={c} value={c}>{alerta(c)}</option>)}
            </Selector>
          </div>
        }>
        Datos que el modelo de anomalías encontró raros. Diga si cree que cada uno es un error de registro: sus respuestas
        miden qué tan bien acierta cada tipo de alerta y ajustan la exigencia del siguiente entrenamiento.
      </Encabezado>
      <Medidas />
      <h2 className="mb-2 mt-6">Datos por revisar</h2>
      {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : q.data.items.length === 0 ? (
        <Vacio titulo={estado === 'pendiente' ? 'No queda nada por revisar' : 'No hay datos con estos filtros'}>
          {estado === 'pendiente' ? 'Cuando lleguen datos nuevos, aquí aparecerán los que parezcan raros.' : undefined}
        </Vacio>
      ) : (
        <>
          <p className="mb-2 text-xs text-salvia">
            {num(q.data.total)} datos. Primero los que tienen más alertas y más fuertes.
          </p>
          <ol className="grid grid-cols-1 content-start gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {q.data.items.map((d) => <Tarjeta key={d.id} dato={d} />)}
          </ol>
          <div className="[&>nav]:mt-3">
            <Paginador pagina={pagina} tamano={TAMANO} total={q.data.total} cambiar={setPagina} />
          </div>
        </>
      )}
    </div>
  )
}

const SERIE_ALERTAS: Serie[] = [{ clave: 'alertas', nombre: 'Alertas', color: 0 }]
const SERIE_ACIERTOS: Serie[] = [{ clave: 'precision', nombre: 'Confirmadas como error', color: 0 }]

/** Lo que dicen las alertas de la corrida y qué tanto aciertan frente a lo que respondió el equipo. */
function Medidas() {
  const resumen = useQuery({ queryKey: ['tablero', 'resumen'], queryFn: () => pedir<ResumenTablero>('/tablero/resumen') })
  const aciertos = useAciertos()
  const concentracion = useConcentracion()
  const r = resumen.data
  const porCapa: FilaSeries[] = Object.entries(r?.alertas_por_capa ?? {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([capa, n]) => ({ x: alerta(capa), alertas: n }))
  const puntos: FilaSeries[] = (aciertos.data?.serie ?? []).filter((p) => p.precision != null)
    .map((p) => ({ x: `${p.k}`, precision: p.precision, respondidas: p.respondidas }))
  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Cifra valor={r ? num(r.datos_revisar) : '—'} texto="datos por revisar" />
          <Cifra valor={r ? numero(r.alertas_por_1000) : '—'} texto="alertas por cada mil datos" />
          <Cifra valor={pct(aciertos.data?.confirmadas_error_pct)} texto="de los respondidos, confirmados como error" />
          <Cifra valor={r ? num(r.alarmas_grupo) : '—'} texto="alarmas de grupo" />
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Alertas por tipo">
          <p className="mb-2 text-sm text-salvia">Cuántos datos raros encontró cada revisión.</p>
          {resumen.isPending ? <Cargando /> : porCapa.length === 0 ? <p className="text-sm text-salvia">No hay alertas en esta corrida.</p> : (
            <BarrasApiladas filas={porCapa} series={SERIE_ALERTAS} alto={200}
              etiqueta={`Alertas por tipo: ${porCapa.map((f) => `${f.x}, ${f.alertas}`).join('; ')}`} />
          )}
        </Panel>
        <Panel titulo="Aciertos frente a la revisión">
          <p className="mb-2 text-sm text-salvia">Cuántas alertas confirmó el equipo al revisar las primeras.</p>
          {aciertos.isPending ? <Cargando /> : puntos.length === 0 ? (
            <p className="text-sm text-salvia">Todavía no hay alertas respondidas.</p>
          ) : (
            <>
              <LineasSeries filas={puntos} series={SERIE_ACIERTOS} alto={200} dominioY={[0, 100]} formatoY={(v) => `${v} %`}
                formatoTooltip={(v, f) => `${pct(v)} de ${num(Number(f.respondidas))} respondidas`}
                etiqueta={`Porcentaje de alertas confirmadas como error entre las primeras: ${puntos.map((f) => `${f.x}, ${pct(Number(f.precision))}`).join('; ')}`} />
              <p className="mt-1 text-xs text-salvia">Eje inferior: las primeras alertas de la cola.</p>
            </>
          )}
        </Panel>
        <Panel titulo="Dónde se concentran">
          <p className="mb-2 text-sm text-salvia">Sede y dato con más alertas.</p>
          {concentracion.isPending ? <Cargando /> : concentracion.error ? <Aviso>{concentracion.error.message}</Aviso>
            : <Concentracion c={concentracion.data} />}
        </Panel>
      </div>
    </div>
  )
}

/** Mapa de calor simple: sede por dato si hay sedes; si no, solo los datos con más alertas. Sin celdas pequeñas. */
function Concentracion({ c }: { c: ConcentracionAlertas }) {
  const otras = c.hay_sede ? c.otras_celdas : c.otras_variables
  const filas = c.hay_sede
    ? c.celdas.slice(0, 8).map((x) => ({ clave: `${x.grupo}|${x.variable}`, titulo: x.etiqueta ?? x.variable, sub: x.grupo, n: x.alertas }))
    : c.por_variable.slice(0, 8).map((x) => ({ clave: x.variable, titulo: x.etiqueta ?? x.variable, sub: '', n: x.alertas }))
  const maximo = Math.max(1, ...filas.map((x) => x.n))
  const tono = (n: number) => ({ background: `color-mix(in srgb, var(--color-teal) ${Math.round(15 + 70 * n / maximo)}%, transparent)` })
  if (filas.length === 0) return <p className="text-sm text-salvia">Todavía no hay alertas suficientes para mostrar.</p>
  return (
    <div>
      <ul className="grid grid-cols-2 gap-1.5" aria-label="Alertas por sede y dato">
        {filas.map((x) => (
          <li key={x.clave} className="rounded-lg px-2 py-1.5 text-sm" style={tono(x.n)}>
            <span className="block truncate font-semibold" title={x.titulo}>{x.titulo}</span>
            <span className="block truncate text-xs">{x.sub && <>{x.sub} · </>}{num(x.n)} alertas</span>
          </li>
        ))}
      </ul>
      {!c.hay_sede && <p className="mt-2 text-xs text-salvia">Este corte no trae sedes: solo se muestra por dato.</p>}
      {otras > 0 && <p className="mt-2 text-xs text-salvia">Otras: {num(otras)} alertas en grupos con menos de {c.minimo_celda}.</p>}
    </div>
  )
}

/** El dato en su contexto: la serie del niño para ese concepto (p. ej. su peso en cada visita) con el rango esperado
 * sombreado sobre el punto revisado o, si no hay serie, el valor frente a su rango esperado. */
function SerieDato({ dato }: { dato: DatoRevision }) {
  const unidad = dato.unidad ? ` ${dato.unidad}` : ''
  const nombre = dato.etiqueta ?? dato.variable
  const este = dato.serie.find((p) => p.es_este)
  const { rango_bajo: bajo, rango_alto: alto } = dato
  if (dato.serie.length >= 2) {
    const valores = [...dato.serie.map((p) => p.valor), ...(este && bajo != null ? [bajo] : []), ...(este && alto != null ? [alto] : [])]
    const [min, max] = [Math.min(...valores), Math.max(...valores)]
    const eje = escalaRedonda([min, max])
    const ordenes = dato.serie.map((p) => p.orden)
    const nombres = new Map(dato.serie.map((p) => [p.orden, p.etapa_nombre ?? '']))
    return (
      <MiniSerie
        alto={130}
        etiqueta={`${nombre} de este niño en cada visita: ${dato.serie.map((p) => `${p.etapa_nombre}, ${aproximado(p.valor)}${unidad}`).join('; ')}`}
        puntos={dato.serie.map((p): PuntoSerie => ({
          x: p.orden, y: p.valor, marcado: p.es_este,
          titulo: p.etapa_nombre ?? '',
          detalle: [`${aproximado(p.valor)}${unidad}`, ...(p.es_este ? ['El dato por revisar'] : [])],
        }))}
        dominioY={eje.dominio} ticksY={eje.ticks} formatoY={aproximado}
        dominioX={[ordenes[0], ordenes[ordenes.length - 1]]} ticksX={ordenes} formatoX={(v) => nombres.get(v) ?? ''}
        franjas={este && bajo != null && alto != null ? [{ desde: bajo, hasta: alto, x: [este.orden - 0.35, este.orden + 0.35] }] : []}
      />
    )
  }
  if (bajo == null || alto == null) return null
  const valor = Number(dato.valor)
  return (
    <div className="mt-2">
      <RangoEsperado bajo={bajo} alto={alto} esperado={dato.esperado} valor={Number.isFinite(valor) ? valor : null}
        etiqueta={`${nombre}: ${medida(dato.valor)}${unidad}; se esperaba entre ${aproximado(bajo)} y ${aproximado(alto)}`} />
    </div>
  )
}

function Tarjeta({ dato }: { dato: DatoRevision }) {
  const cliente = useQueryClient()
  const [comentario, setComentario] = useState(dato.comentario ?? '')
  const [elegida, setElegida] = useState<Respuesta | null>(dato.es_error)
  const m = useMutation({
    mutationFn: (es_error: Respuesta) =>
      pedir(`/revision/datos/${dato.id}`, { cuerpo: { es_error, comentario: comentario.trim() || null } }),
    onSuccess: (_, r) => {
      setElegida(r)
      void cliente.invalidateQueries({ queryKey: ['revision'] })
      void cliente.invalidateQueries({ queryKey: ['tablero', 'resumen'] })
    },
  })
  const rango = dato.rango_bajo != null || dato.rango_alto != null
  const extra = motivoExtra(dato.motivo)
  return (
    <li className={cn('flex animate-aparecer flex-col gap-3 rounded-panel border bg-papel p-4 shadow-suave transition-colors',
      elegida ? 'border-teal/30' : 'border-linea/80')}>
      <div className="min-w-0">
        <p className="truncate text-xs text-salvia">
          <Link className="font-semibold text-teal hover:underline" to={`/ninos/${encodeURIComponent(dato.sujeto)}`}>Niño {dato.sujeto}</Link>
          {dato.etapa_nombre && <> · {dato.etapa_nombre}</>} · {fecha(dato.fecha)}
        </p>
        <h2 className="mt-1 text-base">
          {dato.etiqueta ?? dato.variable}: <span className="text-coral-hondo">{medida(dato.valor)}{dato.unidad ? ` ${dato.unidad}` : ''}</span>
        </h2>
        {rango && (
          <p className="text-sm">
            Para este niño se esperaba entre {aproximado(dato.rango_bajo)} y {aproximado(dato.rango_alto)}
            {dato.esperado != null && <> (lo más probable: {aproximado(dato.esperado)})</>}.
          </p>
        )}
        {extra && <p className="mt-0.5 text-sm">{extra}.</p>}
        <SerieDato dato={dato} />
        <div className="mt-2 flex flex-wrap gap-1">
          {dato.capas.map((c) => <span key={c} title={ayudaAlerta(c)}><Insignia>{alerta(c)}</Insignia></span>)}
        </div>
      </div>
      <fieldset className="mt-auto border-t border-linea/70 pt-3">
        <legend className="float-left pt-1.5 text-sm font-semibold">¿Es un error de registro?</legend>
        <div className="flex justify-end">
          <div className="grid grid-cols-3 gap-1.5">
            {(['si', 'no', 'no_se'] as Respuesta[]).map((r) => (
              <Boton key={r} chico className="whitespace-nowrap" variante={elegida === r ? 'primario' : 'secundario'} aria-pressed={elegida === r}
                disabled={m.isPending} onClick={() => m.mutate(r)}>
                {RESPUESTAS[r]}
              </Boton>
            ))}
          </div>
        </div>
        <label className="sr-only" htmlFor={`com-${dato.id}`}>Comentario</label>
        <Texto id={`com-${dato.id}`} rows={1} maxLength={2000} className="clear-both mt-2 min-h-9 resize-y text-sm" placeholder="Comentario (opcional)"
          value={comentario} onChange={(e) => setComentario(e.target.value)} />
        <p className={cn('mt-1 min-h-4 text-xs', m.error ? 'text-coral-hondo' : 'text-salvia')} role="status">
          {m.error ? m.error.message : m.isSuccess ? 'Respuesta guardada.' : elegida ? 'Puede cambiar su respuesta.' : ''}
        </p>
      </fieldset>
    </li>
  )
}
