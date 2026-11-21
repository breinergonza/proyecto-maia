// La historia de un niño: su identidad arriba y, debajo, una pestaña por pregunta: todos sus desenlaces (los de 12 meses visita
// por visita y los demás con su riesgo calculado), su crecimiento frente a la OMS, cómo nació frente a los demás niños y sus
// visitas con lo que se midió en cada una. Abre en «Desenlaces» si el niño tiene algún riesgo y, si no, en la primera pestaña
// con algo que mostrar; ninguna pestaña ni rótulo sale vacío. Cada pestaña cabe en una pantalla de escritorio; al imprimir
// salen todas.
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { pedir } from '../api/cliente'
import { historiaPorCorte, type RiesgoPorCorte } from '../api/ninos'
import type { AlertaDato, HistoriaRiesgo, LineaTemporal, PerfilNino, Visita } from '../api/tipos'
import { CrecimientoOms, PerfilCohorte, PerfilDelNino, useHistoriaRiesgo, usePerfilCohorte } from '../components/ficha'
import { Desenlaces, desenlacesDelNino, hayRiesgo, type TarjetaConVisita } from '../components/ficha/Desenlaces'
import { PanelesPestana, Pestanas, usePestanaEnUrl } from '../components/ui/Pestanas'
import { Boton, Cargando, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { Termino } from '../components/Termino'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { cn } from '../lib/cn'
import { desenlaceDeUrlAntigua } from '../lib/familias'
import { aproximado, dec, edad, fecha, indicador, RIESGO_ALTO } from '../lib/formato'
import { alerta, ayudaAlerta, ayudaZ, datosAl, frenteOms, motivo } from '../lib/lenguaje'

export default function Nino() {
  const { sujeto = '' } = useParams()
  const q = useQuery({
    queryKey: ['nino', sujeto],
    queryFn: () => pedir<LineaTemporal>(`/ninos/${encodeURIComponent(sujeto)}/linea-temporal`),
  })
  // se piden junto con la línea de tiempo, no después: de ellas depende qué pestañas hay
  const historia = useQuery(historiaPorCorte(sujeto))
  const trayectoria = useHistoriaRiesgo(sujeto)
  const perfil = usePerfilCohorte(sujeto)

  if (q.isPending) return <Cargando />
  if (q.error) return <ErrorConReintento error={q.error} que="la ficha de este niño" reintentando={q.isFetching} reintentar={() => void q.refetch()} />
  return <Ficha n={q.data} historia={historia} trayectoria={trayectoria.data} perfil={perfil.data} />
}

function Ficha({ n, historia, trayectoria, perfil }: {
  n: LineaTemporal; historia: UseQueryResult<RiesgoPorCorte>; trayectoria: HistoriaRiesgo | undefined; perfil: PerfilNino | undefined
}) {
  const [elegida, setElegida] = useState<string | null>(null)
  const inicial = (n.visitas.find((x) => x.riesgos.length) ?? n.visitas.find((x) => x.alertas_dato.length) ?? n.visitas[n.visitas.length - 1])?.etapa ?? null
  const visita = n.visitas.find((v) => v.etapa === (elegida ?? inicial))
  // todos los desenlaces del niño: los de 12 meses visita por visita y los demás con su tarjeta de la última visita y su evolución
  const tarjetas: TarjetaConVisita[] = n.visitas.flatMap((v) => v.riesgos.map((r) => ({ ...r, visita: v.nombre })))
  const desenlaces = desenlacesDelNino({ historia: historia.data, trayectoria, riesgos: tarjetas })
  const conCrecimiento = Object.values(n.crecimiento).some((ps) => ps.length > 0)
  const conPerfil = n.perfil != null || (perfil?.variables?.length ?? 0) > 0

  // mientras se piden o si fallan, la pestaña dice qué pasa; con una API anterior (sin las familias) y sin otros riesgos, no hay
  const conDesenlaces = historia.isPending || historia.error != null || desenlaces.length > 0
  const secciones = [
    ...(conDesenlaces ? [{ clave: 'desenlaces', texto: 'Desenlaces', contenido: (
      <Desenlaces sujeto={n.sujeto} historia={historia} desenlaces={desenlaces} modeloClinico={n.modelo_clinico} />
    ) }] : []),
    ...(conCrecimiento ? [{ clave: 'crecimiento', texto: 'Crecimiento', contenido: <CrecimientoOms crecimiento={n.crecimiento} grilla="sm:grid-cols-3" /> }] : []),
    ...(conPerfil ? [{ clave: 'perfil', texto: 'Frente a los demás niños', contenido: (
      <div className="space-y-4">
        <PerfilDelNino perfil={n.perfil} />
        <PerfilCohorte sujeto={n.sujeto} grilla="sm:grid-cols-2" />
      </div>
    ) }] : []),
    { clave: 'visitas', texto: 'Visitas', contenido: <PanelVisitas n={n} visita={visita} elegir={setElegida} /> },
  ]
  // abre en la primera pestaña con algo que mostrar: «Desenlaces» solo si hay riesgo (o se está pidiendo); si no, queda al final
  // (sigue ahí para ver por qué no hay riesgo). Las direcciones de antes (`?ver=riesgo-…`, `?ver=otros`) también abren «Desenlaces».
  const [params] = useSearchParams()
  const sinRiesgo = !historia.isPending && historia.error == null && !hayRiesgo(desenlaces)
  const esAntigua = desenlaceDeUrlAntigua(params.get('ver'), desenlaces.map((d) => d.resumen.clave), undefined) != null
  const claves = secciones.map((s) => s.clave)
  const [activa, elegirPestana] = usePestanaEnUrl('ver', conDesenlaces && sinRiesgo && !esAntigua ? [...claves.filter((c) => c !== 'desenlaces'), 'desenlaces'] : claves)

  return (
    <div className="flex flex-col lg:h-full">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1>Niño {n.sujeto}</h1>
          <p className="mt-1 text-salvia">{subtitulo(n)}</p>
        </div>
        <div className="no-imprimir flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link to="/ninos" className="inline-flex items-center gap-1 text-sm text-teal hover:underline">
            <ArrowLeft size={16} aria-hidden /> Todos los niños
          </Link>
          <Boton variante="secundario" onClick={() => window.print()}>
            <Printer size={16} aria-hidden /> Imprimir ficha
          </Boton>
        </div>
      </div>

      <Pestanas prefijo="ficha" etiqueta="Qué ver de este niño" pestanas={secciones} activa={activa} elegir={elegirPestana} className="no-imprimir" />
      <div className="mt-3 lg:min-h-0 lg:flex-1">
        <PanelesPestana prefijo="ficha" activa={activa} paneles={secciones} className="lg:h-full lg:overflow-y-auto print:h-auto print:overflow-visible" />
      </div>
      <p className="solo-imprimir">
        Impreso el {fecha(new Date().toISOString())} · Observatorio Canguro · Documento de apoyo clínico: no reemplaza el criterio médico
      </p>
    </div>
  )
}

/** Cómo nació y dónde se atiende, en frases que no quedan sueltas cuando falta un dato. El grupo del niño es su sede. */
function subtitulo(n: LineaTemporal) {
  const nacio = n.eg_semanas != null ? `Nació a las ${dec(n.eg_semanas)} semanas de gestación` : null
  const anio = n.anio_nacimiento ? (nacio ? `en ${n.anio_nacimiento}` : `Nació en ${n.anio_nacimiento}`) : null
  const nacimiento = [nacio, anio].filter((x) => x != null).join(', ')
  return `${[nacimiento || null, n.grupo ? `Sede ${n.grupo}` : null, datosAl(n.corte)].filter((f) => f != null).join('. ')}.`
}

/** Las visitas del niño y lo que se midió en la elegida. Con pocas mediciones la tarjeta mide lo que su contenido; con muchas se
 * desplaza por dentro, con el encabezado de la lista fijo. */
function PanelVisitas({ n, visita, elegir }: { n: LineaTemporal; visita: Visita | undefined; elegir: (etapa: string) => void }) {
  return (
    <Panel llenar titulo="Visitas" className="lg:max-h-full print:max-h-none">
      {n.visitas.length === 0 ? <Vacio titulo="Este niño no tiene visitas registradas" /> : (
        <>
          <Recorrido visitas={n.visitas} elegida={visita?.etapa ?? null} elegir={elegir} />
          {visita && <DetalleVisita visita={visita} />}
        </>
      )}
    </Panel>
  )
}

/** Las visitas como estaciones de un recorrido: el coral marca dónde hay algo por mirar. */
function Recorrido({ visitas, elegida, elegir }: { visitas: Visita[]; elegida: string | null; elegir: (e: string) => void }) {
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // en pantallas angostas, la visita elegida queda a la vista; también al abrir la pestaña, que antes estaba oculta
    const c = caja.current
    if (!c) return
    const centrar = () => {
      const b = c.querySelector<HTMLElement>('[aria-current="step"]')
      if (!b || c.clientWidth === 0) return
      const rb = b.getBoundingClientRect()
      const rc = c.getBoundingClientRect()
      c.scrollLeft += rb.left + rb.width / 2 - (rc.left + rc.width / 2)
    }
    centrar()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(centrar)
    observador.observe(c)
    return () => observador.disconnect()
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
  // la columna de la derecha solo existe si tiene algo: sin ella, las mediciones usan todo el ancho
  const conLado = z.length > 0 || visita.alertas_dato.length > 0
  return (
    <div className={cn('mt-4 grid grid-cols-1 gap-5 border-t border-linea pt-4', conLado && 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]')}>
      <div>
        <h3>{visita.nombre}: lo que se midió</h3>
        <p className="mb-3 text-sm text-salvia">{fecha(visita.fecha)}{visita.edad_corregida != null && ` · ${edad(visita.edad_corregida)} de edad corregida`}</p>
        {visita.mediciones.length === 0 ? <p className="text-salvia">No hay mediciones de esta visita.</p> : (
          // el encabezado queda fijo mientras la tarjeta se desplaza
          <Tabla className="lg:overflow-visible [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-papel">
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
      {conLado && <div className="space-y-5">
        {z.length > 0 && (
          <div>
            <h3 className="mb-2">Frente a la <Termino id="oms">OMS</Termino></h3>
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
      </div>}
    </div>
  )
}
