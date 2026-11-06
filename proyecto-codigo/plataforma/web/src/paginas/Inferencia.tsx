// Calcular el riesgo de un niño con el paquete activo, sin guardar nada. El formulario se arma solo con el esquema del
// paquete (GET /inferencia/formulario): primero los datos del niño y luego cada visita, con los campos que más pesan a
// la vista y el resto plegado. Arma la misma petición que antes se pegaba como JSON, que queda como modo avanzado
// (solo administración). Los resultados se dicen con el glosario clínico.
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ErrorApi, pedir } from '../api/cliente'
import type { CampoFormulario, FormularioCalculo, PeticionInferencia, ResultadoInferencia, VisitaFormulario } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { Aviso, Boton, Cargando, Encabezado, Entrada, Insignia, Panel, Selector, Tabla, Texto, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { usePaqueteActivo } from '../lib/consultas'
import { aproximado, dec, edad, indicador, riesgo, RIESGO_ALTO } from '../lib/formato'
import { alerta, AYUDA_OMS, ayudaAlerta, ayudaPosicion, ayudaZ, CAYO, cuantosMenos, frenteOms, motivo, nivelAlto, peso } from '../lib/lenguaje'

const SUJETO = 'calculo'
const DIA = 86_400_000

type Valores = Record<string, string>
interface Nino { nacimiento: string; eg: string }

/** Visitas cuyos datos son del nacimiento (o de antes): su fecha es la de nacimiento. */
export const alNacer = (v: VisitaFormulario) =>
  (v.edad_min == null && v.edad_max == null) || (v.base !== 'corregida' && (v.edad_max ?? 0) <= 3)

function ventana(v: VisitaFormulario): string | undefined {
  if (v.edad_min == null || v.edad_max == null || alNacer(v)) return undefined
  return `Se espera entre ${edad(Math.max(0, v.edad_min))} y ${edad(v.edad_max)} de ${v.base === 'corregida' ? 'edad corregida' : 'vida'}.`
}

/** La edad gestacional tiene su propio campo en «Datos del niño» (y va en el niño, no como medición): el diccionario
 * también la trae como un dato general y se pediría dos veces. */
const EDAD_GESTACIONAL = 'eg_semanas'
const quitarEdadGestacional = (f: FormularioCalculo): FormularioCalculo => ({
  ...f,
  generales: f.generales.filter((c) => c.variable !== EDAD_GESTACIONAL),
  visitas: f.visitas.map((v) => ({ ...v, campos: v.campos.filter((c) => c.variable !== EDAD_GESTACIONAL) })),
})

/** Qué hacer cuando no hay un modelo activo: solo la administración puede activarlo. */
function ActivarModelo({ admin }: { admin: boolean }) {
  return admin
    ? <>Active uno en <Link className="font-semibold text-teal underline" to="/admin/modelos">Modelos</Link>.</>
    : <>Pídale a la administración que active un modelo.</>
}

/** Un valor escrito en el formulario, como lo espera la API: número si lo es (con coma o punto), si no, texto. */
function valorApi(c: CampoFormulario, v: string): string | number {
  const t = v.trim()
  if (c.tipo === 'fecha' || (c.tipo === 'texto' && !/^-?\d+([.,]\d+)?$/.test(t))) return t
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : t
}

/** Arma la petición de /inferencia y dice qué falta, en palabras de quien llena el formulario. */
export function armarPeticion(f: FormularioCalculo, nino: Nino, valores: Valores, fechas: Valores) {
  const errores: string[] = []
  const nacimiento = nino.nacimiento ? new Date(`${nino.nacimiento}T00:00:00`) : null
  if (!nacimiento) errores.push('Escriba la fecha de nacimiento.')
  const eg = Number(nino.eg.replace(',', '.'))
  if (!nino.eg.trim()) errores.push('Escriba las semanas de gestación al nacer.')
  else if (!Number.isFinite(eg) || eg < 20 || eg > 45) errores.push('Las semanas de gestación deben estar entre 20 y 45.')

  const mediciones: PeticionInferencia['mediciones'] = []
  const agregar = (campos: CampoFormulario[], fecha: string | null) => {
    for (const c of campos) {
      const v = valores[c.variable]?.trim()
      if (!v) continue
      if (c.tipo === 'numero' && !Number.isFinite(Number(v.replace(',', '.')))) {
        errores.push(`«${c.etiqueta}»: escriba un número.`)
        continue
      }
      const dias = fecha && nacimiento ? Math.round((new Date(`${fecha}T00:00:00`).getTime() - nacimiento.getTime()) / DIA) : null
      mediciones.push({ sujeto: SUJETO, variable: c.variable, valor: valorApi(c, v), fecha: fecha || null, edad_dias: dias })
    }
  }
  agregar(f.generales, nino.nacimiento || null)
  for (const v of f.visitas) {
    if (!v.campos.some((c) => valores[c.variable]?.trim())) continue
    if (alNacer(v)) {
      agregar(v.campos, nino.nacimiento || null)
      continue
    }
    const fecha = fechas[v.etapa]
    if (!fecha) {
      errores.push(`Escriba la fecha de la visita «${v.nombre}».`)
      continue
    }
    if (nacimiento && new Date(`${fecha}T00:00:00`) < nacimiento) errores.push(`La visita «${v.nombre}» no puede ser antes del nacimiento.`)
    agregar(v.campos, fecha)
  }
  if (!mediciones.length && !errores.length) errores.push('Escriba al menos un dato del niño o de una visita.')
  const peticion: PeticionInferencia = {
    sujetos: [{ sujeto: SUJETO, fecha_nacimiento: nino.nacimiento || null, eg_semanas: Number.isFinite(eg) ? eg : null }],
    mediciones,
  }
  return { peticion, errores }
}

/** Llena el formulario con el niño simulado de ejemplo, hasta la última visita en que se calcula un riesgo: el riesgo
 * sale de la última visita con datos, y una posterior sin desenlaces dejaría el ejemplo sin riesgo que mostrar. */
function desdeEjemplo(f: FormularioCalculo, p: PeticionInferencia) {
  const ultima = Math.max(-Infinity, ...f.visitas.filter((v) => v.desenlaces.length).map((v) => v.orden))
  const etapa = new Map<string, VisitaFormulario>()
  for (const v of f.visitas) for (const c of v.campos) etapa.set(c.variable, v)
  const s = p.sujetos[0]
  const valores: Valores = {}
  const fechas: Valores = {}
  for (const m of p.mediciones) {
    const v = etapa.get(m.variable)
    if (m.valor == null || (v && v.orden > ultima)) continue
    valores[m.variable] = String(m.valor)
    if (v && !alNacer(v) && m.fecha) fechas[v.etapa] = String(m.fecha).slice(0, 10)
  }
  const nino = { nacimiento: s.fecha_nacimiento ? String(s.fecha_nacimiento).slice(0, 10) : '', eg: s.eg_semanas != null ? String(s.eg_semanas) : '' }
  return { nino, valores, fechas }
}

export default function Inferencia() {
  const { usuario } = useSesion()
  const activo = usePaqueteActivo()
  const [avanzado, setAvanzado] = useState(false)
  const calcular = useMutation({ mutationFn: (p: unknown) => pedir<ResultadoInferencia>('/inferencia', { cuerpo: p }) })
  // el botón queda al final de un formulario largo: al terminar, el resultado (o el error) se trae a la vista
  const resultado = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (calcular.data || calcular.error) resultado.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [calcular.data, calcular.error])

  if (activo.data === null) {
    return (
      <>
        <Encabezado titulo="Calcular el riesgo de un niño" />
        <Vacio titulo="No hay un paquete de modelos activo"><ActivarModelo admin={puede(usuario, ['admin'])} /></Vacio>
      </>
    )
  }
  return (
    <>
      <Encabezado titulo="Calcular el riesgo de un niño"
        accion={puede(usuario, ['admin']) && (
          <Boton chico variante="fantasma" onClick={() => { setAvanzado((a) => !a); calcular.reset() }} aria-pressed={avanzado}>
            {avanzado ? 'Volver al formulario' : 'Modo avanzado (JSON)'}
          </Boton>
        )}>
        Escriba lo que tenga del niño, visita por visita, y vea qué riesgo calcula el modelo y qué datos parecen raros.
        Lo que deje vacío se toma como dato faltante. No se guarda nada.
      </Encabezado>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {avanzado ? <ModoAvanzado calcular={calcular.mutate} pendiente={calcular.isPending} />
          : <Formulario calcular={calcular.mutate} pendiente={calcular.isPending} />}
        <div ref={resultado} className="scroll-mt-4 space-y-4">
          {calcular.error && (
            <Aviso>
              {calcular.error.message}
              {calcular.error instanceof ErrorApi && calcular.error.estado === 409 && <> <ActivarModelo admin={puede(usuario, ['admin'])} /></>}
            </Aviso>
          )}
          {calcular.data ? <Resultado r={calcular.data} varios={avanzado} />
            : <Vacio titulo="Aquí aparecerá el resultado">Llene los datos y pulse «Calcular el riesgo». Para ver cómo se ve, cargue el niño de ejemplo.</Vacio>}
        </div>
      </div>
    </>
  )
}

function Formulario({ calcular, pendiente }: { calcular: (p: PeticionInferencia) => void; pendiente: boolean }) {
  const f = useQuery({
    queryKey: ['inferencia', 'formulario'], queryFn: () => pedir<FormularioCalculo>('/inferencia/formulario'), select: quitarEdadGestacional,
  })
  const [nino, setNino] = useState<Nino>({ nacimiento: '', eg: '' })
  const [valores, setValores] = useState<Valores>({})
  const [fechas, setFechas] = useState<Valores>({})
  const [errores, setErrores] = useState<string[]>([])
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({})
  const ejemplo = useMutation({
    mutationFn: () => pedir<PeticionInferencia & { nota: string }>('/inferencia/ejemplo'),
    onSuccess: (p) => {
      if (!f.data) return
      const e = desdeEjemplo(f.data, p)
      setNino(e.nino)
      setValores(e.valores)
      setFechas(e.fechas)
      setErrores([])
      setAbiertas(Object.fromEntries(f.data.visitas.map((v) => [v.etapa, v.campos.some((c) => e.valores[c.variable])])))
    },
  })

  if (f.isPending) return <Panel titulo="Datos del niño"><Cargando /></Panel>
  if (f.error) return <Aviso>{f.error.message}</Aviso>
  const formulario = f.data
  const cambiar = (variable: string, v: string) => setValores((x) => ({ ...x, [variable]: v }))
  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    const { peticion, errores } = armarPeticion(formulario, nino, valores, fechas)
    setErrores(errores)
    if (!errores.length) calcular(peticion)
  }
  const limpiar = () => {
    setNino({ nacimiento: '', eg: '' })
    setValores({})
    setFechas({})
    setErrores([])
    setAbiertas({})
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <Panel titulo="Datos del niño"
        accion={<div className="flex flex-wrap gap-2">
          <Boton type="button" chico variante="secundario" onClick={() => ejemplo.mutate()} disabled={ejemplo.isPending}>{ejemplo.isPending ? 'Armando el ejemplo…' : 'Cargar un niño de ejemplo'}</Boton>
          <Boton type="button" chico variante="fantasma" onClick={limpiar}>Limpiar</Boton>
        </div>}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoSimple id="c-nacimiento" etiqueta="Fecha de nacimiento">
            <Entrada id="c-nacimiento" type="date" value={nino.nacimiento} onChange={(e) => setNino({ ...nino, nacimiento: e.target.value })} />
          </CampoSimple>
          <CampoSimple id="c-eg" etiqueta="Semanas de gestación al nacer" ayuda="Entre 20 y 45.">
            <Entrada id="c-eg" inputMode="decimal" value={nino.eg} onChange={(e) => setNino({ ...nino, eg: e.target.value })} />
          </CampoSimple>
        </div>
        {formulario.generales.length > 0 && (
          <div className="mt-4"><Campos campos={formulario.generales} valores={valores} cambiar={cambiar} masTexto="Más datos del niño y la familia" /></div>
        )}
        {ejemplo.error && <div className="mt-3"><Aviso>{ejemplo.error.message}</Aviso></div>}
        {ejemplo.isSuccess && <p className="mt-3 text-sm text-salvia">Se cargó un niño simulado: ningún dato es de un niño real.</p>}
      </Panel>

      <section aria-label="Visitas" className="space-y-3">
        <h2 className="text-base">Visitas <span className="text-sm font-normal text-salvia">· llene solo las que tenga</span></h2>
        {formulario.visitas.map((v) => {
          const llenos = v.campos.filter((c) => valores[c.variable]?.trim()).length
          const abierta = abiertas[v.etapa] ?? false
          return (
            <div key={v.etapa} className={cn('rounded-panel border bg-papel shadow-suave', llenos ? 'border-teal/40' : 'border-linea')}>
              <button type="button" onClick={() => setAbiertas({ ...abiertas, [v.etapa]: !abierta })} aria-expanded={abierta}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left sm:px-5">
                <span className="min-w-0">
                  <span className="block font-semibold">{v.nombre}</span>
                  {v.desenlaces.length > 0 && <span className="mt-0.5 block text-xs text-salvia">Aquí se calcula: {v.desenlaces.join(' · ')}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {llenos > 0 && <Insignia tono="teal">{llenos} {llenos === 1 ? 'dato' : 'datos'}</Insignia>}
                  <ChevronDown size={18} aria-hidden className={cn('text-salvia transition-transform', abierta && 'rotate-180')} />
                </span>
              </button>
              {abierta && (
                <div className="border-t border-linea px-4 pb-4 pt-3 sm:px-5">
                  {alNacer(v) ? (
                    <p className="mb-3 text-sm text-salvia">Se toman con la fecha de nacimiento.</p>
                  ) : (
                    <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <CampoSimple id={`f-${v.etapa}`} etiqueta="Fecha de la visita" ayuda={ventana(v)}>
                        <Entrada id={`f-${v.etapa}`} type="date" value={fechas[v.etapa] ?? ''}
                          onChange={(e) => setFechas({ ...fechas, [v.etapa]: e.target.value })} />
                      </CampoSimple>
                    </div>
                  )}
                  {v.campos.length > 0 ? <Campos campos={v.campos} valores={valores} cambiar={cambiar} masTexto="Más datos de esta visita" />
                    : <p className="text-sm text-salvia">Esta visita no tiene datos propios en el modelo.</p>}
                </div>
              )}
            </div>
          )
        })}
      </section>

      {errores.length > 0 && (
        <Aviso>{errores.length === 1 ? errores[0] : <ul className="list-disc space-y-0.5 pl-4">{errores.map((e) => <li key={e}>{e}</li>)}</ul>}</Aviso>
      )}
      <Boton type="submit" className="w-full sm:w-auto" disabled={pendiente}>{pendiente ? 'Calculando…' : 'Calcular el riesgo'}</Boton>
    </form>
  )
}

function CampoSimple({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-tinta/90">{etiqueta}</label>
      {children}
      {ayuda && <p className="text-xs text-salvia">{ayuda}</p>}
    </div>
  )
}

/** Los campos principales a la vista; el resto, plegado. */
function Campos({ campos, valores, cambiar, masTexto }: {
  campos: CampoFormulario[]; valores: Valores; cambiar: (variable: string, valor: string) => void; masTexto: string
}) {
  const principales = campos.filter((c) => c.principal)
  const resto = campos.filter((c) => !c.principal)
  const llenosResto = resto.filter((c) => valores[c.variable]?.trim()).length
  const grilla = (lista: CampoFormulario[]) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {lista.map((c) => <CampoDato key={c.variable} c={c} valor={valores[c.variable] ?? ''} cambiar={(x) => cambiar(c.variable, x)} />)}
    </div>
  )
  return (
    <div className="space-y-3">
      {principales.length > 0 && grilla(principales)}
      {resto.length > 0 && (
        <details className="rounded-control border border-linea/70 px-3 py-2" open={principales.length === 0 || llenosResto > 0}>
          <summary className="cursor-pointer text-sm font-semibold text-teal">
            {masTexto} ({resto.length}){llenosResto > 0 && <span className="font-normal text-salvia"> · {llenosResto} llenos</span>}
          </summary>
          <div className="mt-3">{grilla(resto)}</div>
        </details>
      )}
    </div>
  )
}

function CampoDato({ c, valor, cambiar }: { c: CampoFormulario; valor: string; cambiar: (v: string) => void }) {
  const id = `v-${c.variable}`
  const rango = c.minimo != null && c.maximo != null ? `Habitual: ${dec(c.minimo)} a ${dec(c.maximo)}${c.unidad ? ` ${c.unidad}` : ''}.` : undefined
  const etiqueta = c.unidad && c.tipo === 'numero' ? `${c.etiqueta} (${c.unidad})` : c.etiqueta
  let control: ReactNode
  if (c.tipo === 'lista' || c.tipo === 'si_no') {
    const opciones = c.tipo === 'si_no' && !c.opciones.length ? [{ valor: '1', etiqueta: 'Sí' }, { valor: '0', etiqueta: 'No' }] : c.opciones
    control = (
      <Selector id={id} value={valor} onChange={(e) => cambiar(e.target.value)}>
        <option value="">—</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
      </Selector>
    )
  } else {
    control = <Entrada id={id} type={c.tipo === 'fecha' ? 'date' : 'text'} inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
      value={valor} onChange={(e) => cambiar(e.target.value)} />
  }
  return <CampoSimple id={id} etiqueta={etiqueta} ayuda={rango}>{control}</CampoSimple>
}

/** El JSON de siempre, para probar varios niños o casos que el formulario no cubre (solo administración). */
function ModoAvanzado({ calcular, pendiente }: { calcular: (p: unknown) => void; pendiente: boolean }) {
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ejemplo = useMutation({
    mutationFn: () => pedir<PeticionInferencia & { nota: string }>('/inferencia/ejemplo'),
    onSuccess: ({ nota: _nota, ...p }) => setTexto(JSON.stringify(p, null, 2)),
  })
  const enviar = () => {
    setError(null)
    try {
      calcular(JSON.parse(texto))
    } catch (e) {
      setError(`El texto no es JSON válido: ${(e as Error).message}`)
    }
  }
  return (
    <Panel titulo="Modo avanzado (JSON)"
      accion={<Boton chico variante="secundario" onClick={() => ejemplo.mutate()} disabled={ejemplo.isPending}>{ejemplo.isPending ? 'Armando el ejemplo…' : 'Cargar un niño de ejemplo'}</Boton>}>
      <p className="mb-2 text-sm text-salvia">
        Hasta 50 niños en JSON con <code>sujetos</code>, <code>mediciones</code> y, si hay, <code>episodios</code>, con los nombres de
        variable del diccionario. El ejemplo es un niño simulado.
      </p>
      <label className="sr-only" htmlFor="peticion">Petición en JSON</label>
      <Texto id="peticion" rows={22} spellCheck={false} className="font-[ui-monospace,monospace] text-xs" value={texto}
        onChange={(e) => setTexto(e.target.value)} placeholder='{"sujetos": [...], "mediciones": [...]}' />
      <div className="mt-3"><Boton onClick={enviar} disabled={!texto.trim() || pendiente}>{pendiente ? 'Calculando…' : 'Calcular'}</Boton></div>
      {(error || ejemplo.error) && <div className="mt-3"><Aviso>{error ?? ejemplo.error?.message}</Aviso></div>}
    </Panel>
  )
}

function Resultado({ r, varios }: { r: ResultadoInferencia; varios: boolean }) {
  const quien = (s: string) => (varios ? <span className="font-normal text-salvia"> · {s}</span> : null)
  return (
    <>
      {r.variables_ignoradas.length > 0 && (
        <Aviso tono="teal">No se usaron estos datos porque el modelo no los conoce: {r.variables_ignoradas.join(', ')}.</Aviso>
      )}
      <Panel titulo="Riesgo">
        {r.riesgos.length === 0 ? (
          <p className="text-sm text-salvia">
            No se calculó ningún riesgo. El riesgo se calcula en la <strong>última visita con datos</strong>: para verlo, esa
            visita debe ser una de las que dicen «Aquí se calcula» (deje vacías las posteriores).
          </p>
        ) : (
          <ul className="space-y-3">
            {r.riesgos.map((x) => (
              <li key={`${x.sujeto}-${x.clave}`} className={cn('rounded-control border p-3',
                x.percentil >= RIESGO_ALTO ? 'border-coral/50 shadow-[inset_4px_0_0_var(--color-coral)]' : 'border-linea')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{x.desenlace}{quien(x.sujeto)}</p>
                    <p className="text-sm">Riesgo estimado: <strong>{riesgo(x.riesgo)}</strong></p>
                  </div>
                  <div className="shrink-0 text-right" title={ayudaPosicion(x.percentil)}>
                    {nivelAlto(x.percentil) && <Insignia tono="coral" className="mb-1">{nivelAlto(x.percentil)}</Insignia>}
                    <p className={cn('text-xl font-bold leading-none', x.percentil >= RIESGO_ALTO ? 'text-coral-hondo' : 'text-teal')}>
                      {cuantosMenos(x.percentil)} de 10
                    </p>
                    <p className="text-xs text-salvia">niños tienen menos riesgo</p>
                  </div>
                </div>
                {x.motivos.length > 0 && (
                  <>
                    <p className="mt-2 text-sm font-semibold">Lo que más pesó</p>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm">{x.motivos.map((m) => <li key={m} title={m}>{peso(m)}</li>)}</ul>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel titulo="Datos que parecen raros">
        {r.alertas_dato.length === 0 ? <p className="text-sm text-salvia">Ningún dato quedó marcado.</p> : (
          <ul className="divide-y divide-linea/70 text-sm">
            {r.alertas_dato.map((a, i) => (
              <li key={i} className="py-2 first:pt-0">
                <p>
                  <span className="font-semibold">{a.etiqueta ?? a.variable}</span>{quien(a.sujeto)}:{' '}
                  <span className="font-semibold text-coral-hondo">{a.valor}</span>
                  {a.rango_bajo != null && <span className="text-salvia"> · esperado {aproximado(a.rango_bajo)} a {aproximado(a.rango_alto)}</span>}
                </p>
                {a.motivo && <p className="text-salvia">{motivo(a.motivo)}.</p>}
                <p className="mt-1 flex flex-wrap gap-1">
                  {a.capas.map((c) => <span key={c} title={ayudaAlerta(c)}><Insignia>{alerta(c)}</Insignia></span>)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel titulo="Crecimiento frente a la OMS" accion={<span className="text-xs text-salvia" title={AYUDA_OMS}>para la edad corregida</span>}>
        {r.crecimiento.length === 0 ? <p className="text-sm text-salvia">Sin medidas de crecimiento.</p> : (
          <Tabla densa>
            <thead><tr><th>Medida</th><th className="text-right">Edad corregida</th><th>Frente a la OMS</th></tr></thead>
            <tbody>{r.crecimiento.map((c, i) => (
              <tr key={i}>
                <td>{indicador(c.indicador)}{quien(c.sujeto)}</td>
                <td className="text-right whitespace-nowrap">{edad(c.edad_corregida)}</td>
                <td>
                  <span title={ayudaZ(c.z)} className={cn('mr-1', (c.z ?? 0) < -2 && 'font-semibold text-[#7a5717]')}>{frenteOms(c.z)}</span>
                  {c.caida_1de && <Insignia>{CAYO}</Insignia>} {c.improbable && <Insignia tono="coral">Dato improbable: revisar</Insignia>}
                </td>
              </tr>
            ))}</tbody>
          </Tabla>
        )}
      </Panel>
    </>
  )
}
