// Las piezas de la ficha de un niño que también usa el cálculo de riesgo de un niño: la tarjeta de riesgo, el riesgo en
// cada visita, el crecimiento frente a la OMS y el perfil frente a su cohorte.
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { pedir } from '../api/cliente'
import type { HistoriaRiesgo, PerfilNino, PerfilProvisional, PrimeraAlerta, PuntoCrecimiento, PuntoHistoria } from '../api/tipos'
import { cn } from '../lib/cn'
import { aproximado, dec, edad, indicador, meses, posicion, riesgo, RIESGO_ALTO } from '../lib/formato'
import { AYUDA_DOS_CIFRAS, AYUDA_MOTIVOS, AYUDA_OMS, ayudaPosicion, BAJO_EDAD, CAYO, cuantosMenos, desviaciones, familia, frenteDemas, frenteOms,
  motivosRiesgo, nivelAlto, nombreFamilia, RIESGO_MUY_ALTO } from '../lib/lenguaje'
import type { EstadoDesenlace } from '../api/ninos'
import { Distribucion, MiniSerie, Muestra, ticksEnteros, type PuntoSerie } from './graficos'
import { descripcionDe } from '../lib/descripciones'
import { Grafica } from './grafica'
import { Aviso, Boton, Cargando, Insignia, Panel } from './ui'

// ------------------------------------------------------------------ tarjeta de riesgo

export interface DatosTarjeta {
  desenlace: string
  riesgo: number
  percentil: number
  motivos: string[]
  /** Riesgo promedio del desenlace entre los niños de la corrida, si se conoce. */
  riesgo_medio?: number | null
}

/** «En prueba»: se muestra para seguirlo y evaluarlo, sin dar alertas. Igual en la tarjeta y en el riesgo por visita. */
export const EnPrueba = () => (
  <Insignia tono="ocre" className="font-semibold">
    <span title="Aún no se usa para dar alertas: se muestra para seguirlo y evaluarlo.">En prueba</span>
  </Insignia>
)

/** De qué modelo sale el riesgo: si ya se usa para dar alertas y su versión (la del pie de «Cómo se calculó»). */
export interface OrigenRiesgo { estado: EstadoDesenlace; version: string | null }

export function TarjetaRiesgo({ r, nota, origen }: { r: DatosTarjeta; nota?: string; origen?: OrigenRiesgo }) {
  const alto = r.percentil >= RIESGO_ALTO
  const { suben, faltan } = motivosRiesgo(r.motivos)
  return (
    <article className={cn('rounded-panel border bg-papel p-4 shadow-suave',
      alto ? 'border-coral/50 shadow-[inset_4px_0_0_var(--color-coral)]' : 'border-linea')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base">{r.desenlace}</h2>
          {nota && <p className="text-sm text-salvia">{nota}</p>}
        </div>
        <div className="shrink-0 text-right" title={ayudaPosicion(r.percentil)}>
          {nivelAlto(r.percentil) && <Insignia tono="coral" className="mb-1">{nivelAlto(r.percentil)}</Insignia>}
          <p className={cn('text-2xl font-bold leading-none', alto ? 'text-coral-hondo' : 'text-teal')}>
            {cuantosMenos(r.percentil)} de 10
          </p>
          <p className="text-xs text-salvia">niños tienen menos riesgo</p>
        </div>
      </div>
      <p className="mt-3 text-sm" title={AYUDA_DOS_CIFRAS}>
        Probabilidad estimada: <strong>{riesgo(r.riesgo)}</strong>
        {r.riesgo_medio != null && <> · promedio de los niños: {riesgo(r.riesgo_medio)}</>}
      </p>
      {suben.length > 0 && (
        <>
          <p className="mt-3 text-sm font-semibold" title={AYUDA_MOTIVOS}>Lo que sube el riesgo</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{suben.map((m) => <li key={m}>{m}</li>)}</ul>
        </>
      )}
      {faltan.length > 0 && (
        <>
          <p className="mt-3 text-sm font-semibold">Datos que faltan</p>
          <p className="text-sm">
            También suben el riesgo: {faltan.join(', ')}. Si se midieron, conviene registrarlos.
          </p>
        </>
      )}
      {origen && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-linea pt-2 text-xs">
          {origen.estado === 'en_prueba' ? <EnPrueba /> : <span className="font-semibold" title="Ya se usa para dar alertas.">En uso</span>}
          {origen.version && <span>Modelo clínico {origen.version}</span>}
        </p>
      )}
    </article>
  )
}

// ------------------------------------------------------------------ riesgo en cada visita

interface Familia { clave: string; nombre: string; puntos: PuntoHistoria[]; ultimo: PuntoHistoria }

/** Agrupa los puntos por familia de desenlace (el mismo evento visto desde varias visitas), la de mayor riesgo actual
 * primero. */
export function familiasDeRiesgo(puntos: PuntoHistoria[]): Familia[] {
  const grupos = new Map<string, PuntoHistoria[]>()
  for (const p of puntos) grupos.set(familia(p.clave), [...(grupos.get(familia(p.clave)) ?? []), p])
  return [...grupos.entries()]
    .map(([clave, ps]) => {
      const orden = [...ps].sort((a, b) => a.orden - b.orden)
      return { clave, nombre: nombreFamilia(orden.map((p) => p.desenlace)), puntos: orden, ultimo: orden[orden.length - 1] }
    })
    .sort((a, b) => b.ultimo.percentil - a.ultimo.percentil || a.nombre.localeCompare(b.nombre))
}

const VISIBLES = 4

/** Orden de la primera visita con alerta de una familia de desenlaces (la más temprana entre sus claves), o null. */
export function ordenPrimeraAlerta(f: { puntos: PuntoHistoria[] }, primera?: Record<string, PrimeraAlerta | null>): number | null {
  const ordenes = f.puntos.map((p) => primera?.[p.clave]?.orden).filter((o): o is number => o != null)
  return ordenes.length ? Math.min(...ordenes) : null
}

/** Tarjeta «Perfil del niño»: chips con categorías (edad gestacional, Lubchenco) y la visita actual; sin cifras (D10). */
export function PerfilDelNino({ perfil }: { perfil?: PerfilProvisional }) {
  if (!perfil) return null
  const d = descripcionDe('perfil_nino')
  return (
    <Panel titulo={d.titulo} descripcion={d.descripcion}>
      <ul className="flex flex-wrap gap-2" aria-label={d.titulo}>
        <li><Insignia tono="neutro">{perfil.eg_etiqueta ?? 'Edad gestacional sin clasificar'}</Insignia></li>
        <li><Insignia tono="neutro">{perfil.lubchenco_etiqueta ?? 'Lubchenco sin clasificar'}</Insignia></li>
        {perfil.visita && <li><Insignia tono="neutro">Visita actual: {perfil.visita}</Insignia></li>}
      </ul>
    </Panel>
  )
}

/** `excluir`: familias de desenlaces que la ficha ya cuenta con su riesgo por visita (no se repiten aquí). */
export function TrayectoriaRiesgo({ sujeto, excluir }: { sujeto: string; excluir?: ReadonlySet<string> }) {
  const q = useQuery({
    queryKey: ['nino', sujeto, 'historia-riesgo'],
    queryFn: () => pedir<HistoriaRiesgo>(`/ninos/${encodeURIComponent(sujeto)}/historia-riesgo`),
    staleTime: 5 * 60_000,
  })
  const [todas, setTodas] = useState(false)
  const familias = useMemo(() => familiasDeRiesgo(q.data?.puntos ?? []).filter((f) => !excluir?.has(f.clave)), [q.data, excluir])
  const visitas = useMemo(() => {
    const m = new Map<number, string>()
    for (const p of q.data?.puntos ?? []) m.set(p.orden, p.momento_nombre)
    return m
  }, [q.data])

  const d = descripcionDe('riesgo_visita')
  if (q.isPending) return <Panel titulo={descripcionDe('riesgo_visita').titulo}><Cargando /></Panel>
  if (q.error) return <Panel titulo={descripcionDe('riesgo_visita').titulo}><Aviso>{q.error.message}</Aviso></Panel>
  if (!familias.length) return null

  const ordenes = [...visitas.keys()].sort((a, b) => a - b)
  const dominioX: [number, number] = ordenes.length > 1 ? [ordenes[0], ordenes[ordenes.length - 1]]
    : [ordenes[0] - 0.5, ordenes[0] + 0.5]
  const mostradas = todas ? familias : familias.slice(0, VISIBLES)
  return (
    <Grafica titulo={d.titulo} descripcion={d.descripcion} exportar={{ nombre: 'riesgo-por-visita' }}
      accion={<span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <Muestra tipo="alerta">10 % con más riesgo</Muestra>
        <Muestra tipo="marcado">riesgo alto</Muestra>
        <Muestra tipo="estrella">primera alerta</Muestra>
      </span>}>
      {q.data.paquete_corrida && q.data.paquete !== q.data.paquete_corrida && (
        <p className="mb-3 text-sm text-ocre-hondo" title={`Modelos vigentes: ${q.data.paquete}; tarjetas: ${q.data.paquete_corrida}`}>
          Calculado con los modelos vigentes; las tarjetas de arriba se calcularon con modelos anteriores y pueden no coincidir.
        </p>
      )}
      <ul className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {mostradas.map((f) => {
          const primera = ordenPrimeraAlerta(f, q.data.primera_alerta)
          return (
          <li key={f.clave}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm">{f.nombre}</h3>
              <span className={cn('shrink-0 text-sm font-semibold', f.ultimo.percentil >= RIESGO_ALTO ? 'text-coral-hondo' : 'text-teal')}
                title={ayudaPosicion(f.ultimo.percentil)}>
                {cuantosMenos(f.ultimo.percentil)} de 10
              </span>
            </div>
            <MiniSerie
              alto={120}
              etiqueta={`${f.nombre}: ${f.puntos.map((p) => `${p.momento_nombre}, ${cuantosMenos(p.percentil)} de 10`).join('; ')}`}
              puntos={f.puntos.map((p): PuntoSerie => ({
                x: p.orden, y: p.percentil, marcado: p.percentil >= RIESGO_ALTO,
                estrella: p.orden === primera,
                titulo: `${p.momento_nombre}: ${p.desenlace}`,
                detalle: [`Probabilidad estimada: ${riesgo(p.riesgo)}`, frenteDemas(p.percentil)],
              }))}
              dominioY={[0, 100]} ticksY={[0, 50, RIESGO_ALTO]} formatoY={(v) => posicion(v)}
              franjas={[{ desde: RIESGO_ALTO, hasta: 100, tono: 'alerta' }]} guias={[{ y: RIESGO_MUY_ALTO, punteada: true }]}
              dominioX={dominioX} ticksX={ordenes} formatoX={(v) => visitas.get(v) ?? ''}
            />
          </li>
          )
        })}
      </ul>
      {familias.length > VISIBLES && (
        <Boton variante="fantasma" chico className="mt-3" onClick={() => setTodas(!todas)} aria-expanded={todas}>
          {todas ? 'Ver menos' : `Ver los ${familias.length} desenlaces`}
        </Boton>
      )}
    </Grafica>
  )
}

// ------------------------------------------------------------------ crecimiento frente a la OMS

const DIA_MES = 30.4375

/** Marcas del eje de edad cada 1, 3 o 6 meses según el tramo, en días. */
export function ticksMeses([a, b]: [number, number]): number[] {
  const tramo = (b - a) / DIA_MES
  const paso = tramo <= 6 ? 1 : tramo <= 15 ? 3 : 6
  const ticks: number[] = []
  for (let m = Math.ceil(a / DIA_MES / paso) * paso; m * DIA_MES <= b; m += paso) ticks.push(m * DIA_MES)
  return ticks
}

// una sola frase por gráfica: qué mide el eje y cuándo es bajo
const DESCRIPCION_CRECIMIENTO = 'Desviaciones frente a lo esperado para la edad corregida: 0 es lo esperado; por debajo de −2, bajo para la edad.'

/** `grilla` es la distribución de las gráficas (una por medida); por defecto, las tres en una fila donde hay ancho. */
export function CrecimientoOms({ crecimiento, grilla = 'sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3', alto }: {
  crecimiento: Record<string, PuntoCrecimiento[]>; grilla?: string
  /** Alto de cada gráfica en px; sin él, el de siempre. */
  alto?: number
}) {
  const series = useMemo(() => Object.entries(crecimiento)
    .map(([k, ps]) => ({
      k,
      puntos: ps.filter((p) => p.edad_corregida != null && p.z != null && !p.improbable),
      improbables: ps.filter((p) => p.improbable).length,
    }))
    // una medida con solo datos improbables se lista igual: hay que revisarla aunque no se grafique
    .filter((s) => s.puntos.length > 0 || s.improbables > 0), [crecimiento])
  if (!series.length) return null

  const edades = series.flatMap((s) => s.puntos.map((p) => p.edad_corregida as number))
  const dominioX: [number, number] = edades.length ? [Math.min(...edades), Math.max(...edades)] : [0, 0]
  if (dominioX[0] === dominioX[1]) { dominioX[0] -= DIA_MES; dominioX[1] += DIA_MES }
  const ticksX = ticksMeses(dominioX)
  return (
    <Grafica titulo={descripcionDe('crecimiento_ficha').titulo} descripcion={DESCRIPCION_CRECIMIENTO} exportar={{ nombre: 'crecimiento-oms' }}
      accion={<span className="flex flex-wrap gap-x-3 gap-y-1 text-xs" title={AYUDA_OMS}>
        <Muestra tipo="franja">rango esperado (−2 a +2)</Muestra>
        <Muestra tipo="marcado">bajo para la edad o caída</Muestra>
      </span>}>
      <ul className={cn('grid grid-cols-1 gap-x-6 gap-y-4', grilla)}>
        {series.map(({ k, puntos, improbables }) => {
          const nota = improbables > 0 && (
            <p className="text-xs font-semibold text-coral-hondo">
              {improbables === 1 ? '1 medida improbable (revisar) no se grafica' : `${improbables} medidas improbables (revisar) no se grafican`}
            </p>
          )
          if (!puntos.length) return <li key={k}><h3 className="text-sm">{indicador(k)}</h3>{nota}</li>
          const zs = puntos.map((p) => p.z as number)
          const dominioY: [number, number] = [Math.min(-3, Math.floor(Math.min(...zs))), Math.max(3, Math.ceil(Math.max(...zs)))]
          const ultimo = puntos[puntos.length - 1]
          return (
            <li key={k}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm">{indicador(k)}</h3>
                <span className={cn('shrink-0 text-sm font-semibold', (ultimo.z as number) < -2 ? 'text-coral-hondo' : 'text-teal')}>
                  {frenteOms(ultimo.z)}
                </span>
              </div>
              {ultimo.caida_1de && <p className="text-xs font-semibold text-coral-hondo">{CAYO}</p>}
              <MiniSerie
                etiqueta={`${indicador(k)}: ${puntos.map((p) => `${edad(p.edad_corregida)}, ${frenteOms(p.z).toLowerCase()}`).join('; ')}`}
                puntos={puntos.map((p): PuntoSerie => ({
                  x: p.edad_corregida as number, y: p.z as number, marcado: p.bajo_2de || p.caida_1de,
                  titulo: `${edad(p.edad_corregida)} de edad corregida`,
                  detalle: [
                    `${indicador(k)}: ${p.valor == null ? '—' : `${aproximado(p.valor)}${p.unidad ? ` ${p.unidad}` : ''}`}`,
                    `${frenteOms(p.z)}: ${desviaciones(p.z as number)} frente a la OMS`,
                    ...(p.bajo_2de ? [BAJO_EDAD] : []), ...(p.caida_1de ? [CAYO] : []),
                  ],
                }))}
                dominioY={dominioY} ticksY={ticksEnteros(dominioY, [-2, 0, 2])} formatoY={(v) => (v > 0 ? `+${v}` : `${v}`).replace('-', '−')}
                franjas={[{ desde: -2, hasta: 2 }]} guias={[{ y: 0 }]}
                dominioX={dominioX} ticksX={ticksX} formatoX={meses} alto={alto}
              />
              {nota}
            </li>
          )
        })}
      </ul>
    </Grafica>
  )
}

// ------------------------------------------------------------------ perfil frente a la cohorte

/** «40 de cada 100 niños tienen menos»: la API cuenta solo a los que tienen un valor estrictamente menor, así que con
 * empates la frase sigue siendo cierta. */
export const frentePerfil = (p: number) => `${Math.round(p)} de cada 100 niños tienen menos`

export function PerfilCohorte({ sujeto }: { sujeto: string }) {
  const q = useQuery({
    queryKey: ['nino', sujeto, 'perfil'],
    queryFn: () => pedir<PerfilNino>(`/ninos/${encodeURIComponent(sujeto)}/perfil`),
    staleTime: 5 * 60_000,
  })
  if (q.isPending) return <Panel titulo={descripcionDe('al_nacer').titulo}><Cargando /></Panel>
  if (q.error) return <Panel titulo={descripcionDe('al_nacer').titulo}><Aviso>{q.error.message}</Aviso></Panel>
  if (!q.data.variables.length) return null
  const dn = descripcionDe('al_nacer')
  return (
    <Grafica titulo={dn.titulo} descripcion={dn.descripcion} exportar={{ nombre: 'al-nacer' }}
      accion={<span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <Muestra tipo="franja">la mitad de los niños</Muestra>
        <Muestra tipo="marcado">este niño</Muestra>
      </span>}>
      <ul className="space-y-4">
        {q.data.variables.map((v) => {
          const formato = (x: number) => `${v.unidad === 'semanas' ? dec(x) : aproximado(x)}${v.unidad ? ` ${v.unidad}` : ''}`
          return (
            <li key={v.variable}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-sm">{v.etiqueta}</h3>
                <span className="text-sm">
                  {v.valor == null ? 'Sin dato' : <><strong>{formato(v.valor)}</strong>{v.posicion != null && <> · {frentePerfil(v.posicion)}</>}</>}
                </span>
              </div>
              <Distribucion cuantiles={v.cuantiles} valor={v.valor} formato={formato}
                etiqueta={`${v.etiqueta}: ${v.valor == null ? 'sin dato' : formato(v.valor)}; la mitad de los ${v.ninos} niños entre ${formato(v.cuantiles.p25)} y ${formato(v.cuantiles.p75)}`} />
            </li>
          )
        })}
      </ul>
    </Grafica>
  )
}
