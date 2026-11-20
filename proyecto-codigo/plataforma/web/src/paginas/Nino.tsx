// La historia de un niño: sus visitas en orden, lo que se midió en cada una, los datos por revisar, el riesgo
// calculado (y cómo fue cambiando visita a visita), su crecimiento frente a la OMS y cómo nació frente a los demás.
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { pedir } from '../api/cliente'
import { historiaPorCorte } from '../api/ninos'
import type { AlertaDato, LineaTemporal, Visita } from '../api/tipos'
import { CrecimientoOms, PerfilCohorte, PerfilDelNino, TarjetaRiesgo, TrayectoriaRiesgo } from '../components/ficha'
import { RiesgoA12Meses } from '../components/ficha/RiesgoA12Meses'
import { Aviso, Boton, Cargando, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { familiaDe, familiasConRiesgo } from '../lib/familias'
import { aproximado, dec, edad, fecha, indicador, RIESGO_ALTO } from '../lib/formato'
import { alerta, AYUDA_DOS_CIFRAS, AYUDA_OMS, ayudaAlerta, ayudaZ, datosAl, frenteOms, motivo } from '../lib/lenguaje'

export default function Nino() {
  const { sujeto = '' } = useParams()
  const q = useQuery({
    queryKey: ['nino', sujeto],
    queryFn: () => pedir<LineaTemporal>(`/ninos/${encodeURIComponent(sujeto)}/linea-temporal`),
  })
  const historia = useQuery(historiaPorCorte(sujeto))
  const [elegida, setElegida] = useState<string | null>(null)

  const inicial = useMemo(() => {
    const v = q.data?.visitas ?? []
    return (v.find((x) => x.riesgos.length) ?? v.find((x) => x.alertas_dato.length) ?? v[v.length - 1])?.etapa ?? null
  }, [q.data])

  if (q.isPending) return <Cargando />
  if (q.error) return <Aviso>{q.error.message}</Aviso>
  const n = q.data
  const visita = n.visitas.find((v) => v.etapa === (elegida ?? inicial))
  // lo que «Riesgo a los 12 meses» ya cuenta visita por visita no se repite en una tarjeta de la última visita
  const enSeccion = familiasConRiesgo(historia.data)
  const riesgos = n.visitas.flatMap((v) => v.riesgos.map((r) => ({ ...r, visita: v.nombre }))).filter((r) => !enSeccion.has(familiaDe(r.clave)))

  return (
    <>
      <Link to="/ninos" className="no-imprimir mb-2 inline-flex items-center gap-1 text-sm text-teal hover:underline">
        <ArrowLeft size={16} aria-hidden /> Todos los niños
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Niño {n.sujeto}</h1>
          <p className="mt-1 text-salvia">
            {n.eg_semanas != null && <>Nació a las {dec(n.eg_semanas)} semanas de gestación</>}
            {n.anio_nacimiento && <>, en {n.anio_nacimiento}</>}
            {n.grupo && <>. Grupo {n.grupo}</>}. {datosAl(n.corte)}.
          </p>
        </div>
        <Boton variante="secundario" className="no-imprimir" onClick={() => window.print()}>
          <Printer size={16} aria-hidden /> Imprimir ficha
        </Boton>
      </div>

      <div className="mb-4 empty:hidden">
        <RiesgoA12Meses historia={historia.data} cargando={historia.isPending} error={historia.error}
          reintentar={() => { void historia.refetch() }} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-4">
      {riesgos.length > 0 && (
        <section aria-label="Riesgo calculado" className="space-y-3">
          <p className="text-sm">{AYUDA_DOS_CIFRAS}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1">
            {riesgos.map((r) => <TarjetaRiesgo key={r.id} r={r} nota={`Calculado con lo medido hasta ${r.visita}`} />)}
          </div>
        </section>
      )}

      <PerfilDelNino perfil={n.perfil} />
      <TrayectoriaRiesgo sujeto={n.sujeto} />
      <CrecimientoOms crecimiento={n.crecimiento} />
      <PerfilCohorte sujeto={n.sujeto} />
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
      <p className="solo-imprimir">
        Impreso el {fecha(new Date().toISOString())} · Observatorio Canguro · Documento de apoyo clínico: no reemplaza el criterio médico
      </p>
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
          const atencion = v.alertas_dato.length > 0 || v.riesgos.some((r) => r.percentil >= RIESGO_ALTO)
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
                  {v.riesgos.length > 0 && <Insignia tono={v.riesgos.some((r) => r.percentil >= RIESGO_ALTO) ? 'coral' : 'teal'}>riesgo</Insignia>}
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
  return `${aproximado(a.rango_bajo)} a ${aproximado(a.rango_alto)}`
}

function DetalleVisita({ visita }: { visita: Visita }) {
  const alertas = new Map(visita.alertas_dato.map((a) => [a.variable, a]))
  const z = Object.entries(visita.z).filter(([, v]) => v != null)
  return (
    <div className="mt-4 grid grid-cols-1 gap-5 border-t border-linea pt-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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
                          {motivo(a.motivo) || 'Fuera de lo esperado'}
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
            <h3 className="mb-2" title={AYUDA_OMS}>Frente a la OMS</h3>
            <ul className="divide-y divide-linea">
              {z.map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3 py-1.5">
                  <span>{indicador(k)}</span>
                  <span title={ayudaZ(v as number)} className={cn('text-right font-semibold', (v as number) < -2 && 'text-[#7a5717]')}>
                    {frenteOms(v as number)}
                  </span>
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
                  {a.capas.map((c) => <span key={c} title={ayudaAlerta(c)}><Insignia className="mr-1">{alerta(c)}</Insignia></span>)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
