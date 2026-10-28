// La historia de un niño: sus visitas en orden, lo que se midió en cada una, los datos por revisar, el riesgo
// calculado y su crecimiento frente a la OMS.
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { pedir } from '../api/cliente'
import type { AlertaDato, LineaTemporal, Visita } from '../api/tipos'
import { Aviso, Cargando, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { HEX_SERIES } from '../lib/consultas'
import { CAPAS, dec, dec2, edad, fecha, frase, indicador, posicion, riesgo } from '../lib/formato'

export default function Nino() {
  const { sujeto = '' } = useParams()
  const q = useQuery({
    queryKey: ['nino', sujeto],
    queryFn: () => pedir<LineaTemporal>(`/ninos/${encodeURIComponent(sujeto)}/linea-temporal`),
  })
  const [elegida, setElegida] = useState<string | null>(null)

  const inicial = useMemo(() => {
    const v = q.data?.visitas ?? []
    return (v.find((x) => x.riesgos.length) ?? v.find((x) => x.alertas_dato.length) ?? v[v.length - 1])?.etapa ?? null
  }, [q.data])

  if (q.isPending) return <Cargando />
  if (q.error) return <Aviso>{q.error.message}</Aviso>
  const n = q.data
  const visita = n.visitas.find((v) => v.etapa === (elegida ?? inicial))
  const riesgos = n.visitas.flatMap((v) => v.riesgos.map((r) => ({ ...r, visita: v.nombre })))

  return (
    <>
      <Link to="/ninos" className="mb-2 inline-flex items-center gap-1 text-sm text-teal hover:underline">
        <ArrowLeft size={16} aria-hidden /> Todos los niños
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Niño {n.sujeto}</h1>
          <p className="mt-1 text-salvia">
            {n.eg_semanas != null && <>Nació a las {dec(n.eg_semanas)} semanas de gestación</>}
            {n.anio_nacimiento && <>, en {n.anio_nacimiento}</>}
            {n.grupo && <>. Grupo {n.grupo}</>}. Datos hasta el corte del {fecha(n.corte)}.
          </p>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-4">
      {riesgos.length > 0 && (
        <section aria-label="Riesgo calculado" className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          {riesgos.map((r) => (
            <article key={r.id} className={cn('rounded-panel border bg-papel p-4 shadow-suave',
              r.percentil >= 90 ? 'border-coral/50 shadow-[inset_4px_0_0_var(--color-coral)]' : 'border-linea')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base">{r.desenlace}</h2>
                  <p className="text-sm text-salvia">Calculado con lo medido hasta {r.visita}</p>
                </div>
                <div className="text-right">
                  <p className={cn('text-2xl font-bold leading-none', r.percentil >= 90 ? 'text-coral-hondo' : 'text-teal')}>{posicion(r.percentil)}</p>
                  <p className="text-xs text-salvia">posición de 0 a 100</p>
                </div>
              </div>
              <p className="mt-3 text-sm">Riesgo estimado: <strong>{riesgo(r.riesgo)}</strong></p>
              {r.motivos.length > 0 && (
                <>
                  <p className="mt-3 text-sm font-semibold">Lo que más pesó</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{r.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
                </>
              )}
            </article>
          ))}
        </section>
      )}

      <Crecimiento datos={n} />
      </div>

      <Panel titulo="Visitas">
        {n.visitas.length === 0 ? <Vacio titulo="Este niño no tiene visitas registradas" /> : (
          <>
            <Recorrido visitas={n.visitas} elegida={visita?.etapa ?? null} elegir={setElegida} />
            {visita && <DetalleVisita visita={visita} />}
          </>
        )}
      </Panel>
      </div>
    </>
  )
}

/** Las visitas como estaciones de un recorrido: el coral marca dónde hay algo por mirar. */
function Recorrido({ visitas, elegida, elegir }: { visitas: Visita[]; elegida: string | null; elegir: (e: string) => void }) {
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // en pantallas angostas, la visita elegida queda a la vista
    const c = caja.current
    const b = c?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!c || !b) return
    const rb = b.getBoundingClientRect()
    const rc = c.getBoundingClientRect()
    c.scrollLeft += rb.left + rb.width / 2 - (rc.left + rc.width / 2)
  }, [elegida])
  return (
    <div ref={caja} className="relative -mx-5 overflow-x-auto px-5 pb-2">
      <ol className="relative flex min-w-max gap-0" aria-label="Visitas en orden">
        {visitas.map((v, i) => {
          const atencion = v.alertas_dato.length > 0 || v.riesgos.some((r) => r.percentil >= 90)
          const activa = v.etapa === elegida
          return (
            <li key={v.etapa} className="relative w-36 shrink-0">
              {i > 0 && <span aria-hidden className="absolute left-0 right-1/2 top-[15px] h-[3px] bg-teal/30" />}
              {i < visitas.length - 1 && <span aria-hidden className="absolute left-1/2 right-0 top-[15px] h-[3px] bg-teal/30" />}
              <button
                onClick={() => elegir(v.etapa)}
                aria-current={activa ? 'step' : undefined}
                className={cn('group relative flex w-full flex-col items-center rounded-control px-2 pb-2 text-center',
                  activa ? 'bg-teal-tinte' : 'hover:bg-fondo')}
              >
                <span className={cn('relative z-10 mt-[3px] flex size-6 items-center justify-center rounded-full border-[3px] bg-papel',
                  activa ? 'border-teal bg-teal' : 'border-teal/60',
                  atencion && !activa && 'border-coral')}>
                  {atencion && <span className={cn('size-2 rounded-full', activa ? 'bg-papel' : 'bg-coral')} />}
                </span>
                <span className={cn('mt-2 text-sm leading-tight', activa ? 'font-bold text-teal' : 'font-semibold')}>{v.nombre}</span>
                <span className="text-xs text-salvia">{v.edad_corregida != null ? `${edad(v.edad_corregida)} corregidos` : fecha(v.fecha)}</span>
                <span className="mt-1 flex min-h-5 flex-wrap justify-center gap-1">
                  {v.alertas_dato.length > 0 && <Insignia tono="coral">{v.alertas_dato.length} por revisar</Insignia>}
                  {v.riesgos.length > 0 && <Insignia tono={v.riesgos.some((r) => r.percentil >= 90) ? 'coral' : 'teal'}>riesgo</Insignia>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function rango(a: AlertaDato) {
  if (a.rango_bajo == null && a.rango_alto == null) return null
  return `${dec2(a.rango_bajo)} a ${dec2(a.rango_alto)}`
}

function DetalleVisita({ visita }: { visita: Visita }) {
  const alertas = new Map(visita.alertas_dato.map((a) => [a.variable, a]))
  const z = Object.entries(visita.z).filter(([, v]) => v != null)
  return (
    <div className="mt-4 grid gap-5 border-t border-linea pt-4 lg:grid-cols-[1.5fr_1fr] xl:grid-cols-1 2xl:grid-cols-[1.5fr_1fr]">
      <div>
        <h3>{visita.nombre}: lo que se midió</h3>
        <p className="mb-3 text-sm text-salvia">{fecha(visita.fecha)}{visita.edad_corregida != null && ` · ${edad(visita.edad_corregida)} de edad corregida`}</p>
        {visita.mediciones.length === 0 ? <p className="text-salvia">No hay mediciones de esta visita.</p> : (
          <Tabla>
            <thead><tr><th>Dato</th><th className="text-right">Valor</th><th>Revisión</th></tr></thead>
            <tbody>
              {visita.mediciones.map((m) => {
                const a = alertas.get(m.variable)
                return (
                  <tr key={m.variable} className={a ? 'bg-coral-tinte/60' : undefined}>
                    <td>{m.etiqueta}</td>
                    <td className={cn('text-right whitespace-nowrap', a && 'font-bold text-coral-hondo')}>
                      {m.valor ?? '—'}{m.unidad && m.valor != null ? ` ${m.unidad}` : ''}
                    </td>
                    <td className="text-sm">
                      {a ? (
                        <span>
                          {frase(a.motivo) || 'Fuera de lo esperado'}
                          {rango(a) && <span className="text-salvia"> · esperado {rango(a)}</span>}
                        </span>
                      ) : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Tabla>
        )}
      </div>
      <div className="space-y-5">
        {z.length > 0 && (
          <div>
            <h3 className="mb-2">Puntaje z (OMS)</h3>
            <ul className="divide-y divide-linea">
              {z.map(([k, v]) => (
                <li key={k} className="flex justify-between py-1.5">
                  <span>{indicador(k)}</span>
                  <span className={cn('font-semibold', (v as number) < -2 && 'text-[#7a5717]')}>{dec2(v)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {visita.alertas_dato.length > 0 && (
          <div>
            <h3 className="mb-2">Por qué se marcó</h3>
            <ul className="space-y-2 text-sm">
              {visita.alertas_dato.map((a) => (
                <li key={a.id}>
                  <span className="font-semibold">{a.etiqueta ?? a.variable}</span>{' '}
                  {a.capas.map((c) => <Insignia key={c} className="mr-1">{CAPAS[c] ?? c}</Insignia>)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function Crecimiento({ datos }: { datos: LineaTemporal }) {
  const indicadores = Object.keys(datos.crecimiento)
  const filas = useMemo(() => {
    const porEdad = new Map<number, Record<string, number | null> & { edad: number }>()
    for (const [k, puntos] of Object.entries(datos.crecimiento)) {
      for (const p of puntos) {
        if (p.edad_corregida == null || p.z == null || p.improbable) continue
        const e = Math.round(p.edad_corregida)
        const f = porEdad.get(e) ?? { edad: e }
        f[k] = p.z
        porEdad.set(e, f)
      }
    }
    return [...porEdad.values()].sort((a, b) => a.edad - b.edad)
  }, [datos])

  if (!filas.length) return null
  return (
    <Panel titulo="Crecimiento frente a la OMS"
      accion={<span className="text-xs text-salvia">puntaje z por edad corregida · franja: bajo −2 DE</span>}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filas} margin={{ left: 0, right: 16, top: 8 }}>
            <CartesianGrid stroke="#e4ebea" vertical={false} />
            <ReferenceArea y1={-10} y2={-2} fill="#b8862b" fillOpacity={0.12} ifOverflow="hidden" />
            <ReferenceLine y={0} stroke="#8a9b98" />
            <ReferenceLine y={-2} stroke="#b8862b" strokeDasharray="4 3" />
            <XAxis dataKey="edad" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v: number) => edad(v)}
              stroke="#56736d" fontSize={12} />
            <YAxis domain={[(m: number) => Math.min(-3, Math.floor(m)), (m: number) => Math.max(2, Math.ceil(m))]}
              allowDataOverflow stroke="#56736d" fontSize={12} width={36} />
            <Tooltip labelFormatter={(v) => `${edad(Number(v))} de edad corregida`} formatter={(v, nombre) => [dec2(Number(v)), nombre]} />
            <Legend verticalAlign="top" height={28} />
            {indicadores.map((k, i) => (
              <Line key={k} dataKey={k} name={indicador(k)} stroke={HEX_SERIES[i % HEX_SERIES.length]} strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}
