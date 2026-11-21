// Calcular el riesgo de un niño con el paquete activo, sin guardar nada. El formulario se arma solo con el esquema del
// paquete (GET /inferencia/formulario): primero los datos del niño y luego cada visita, con los campos que más pesan a
// la vista y el resto plegado. Arma la misma petición que antes se pegaba como JSON, que queda como modo avanzado
// (solo administración). Los resultados se dicen con el glosario clínico.
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ErrorApi, pedir } from '../api/cliente'
import type { ResultadoConHistoria } from '../api/inferencia'
import type { CampoFormulario, FormularioCalculo, PeticionInferencia, PuntoCrecimiento, ResultadoInferencia, VisitaFormulario } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { descripcionDe } from '../lib/descripciones'
import { Aviso, Boton, Cargando, Encabezado, Entrada, Insignia, Panel, Selector, Tabla, Texto, Vacio } from '../components/ui'
import { Termino } from '../components/Termino'
import { cn } from '../lib/cn'
import { usePaqueteActivo } from '../lib/consultas'
import { CrecimientoOms, TarjetaRiesgo } from '../components/ficha'
import { PanelesPestana, Pestanas } from '../components/ui/Pestanas'
import { seccionesDeRiesgo } from '../components/ficha/RiesgoA12Meses'
import { RangoEsperado } from '../components/graficos'
import { estadoDe, familiaDe, familiasConRiesgo } from '../lib/familias'
import { aproximado, dec, edad, indicador, medida } from '../lib/formato'
import { alerta, AYUDA_DOS_CIFRAS, ayudaAlerta, ayudaZ, CAYO, frenteOms, motivoExtra } from '../lib/lenguaje'

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
  // las visitas con algo que corregir, para marcar su pestaña aunque no se vea
  const visitasConError: string[] = []
  const marcar = (etapa: string) => { if (!visitasConError.includes(etapa)) visitasConError.push(etapa) }
  const agregar = (campos: CampoFormulario[], fecha: string | null, etapa?: string) => {
    for (const c of campos) {
      const v = valores[c.variable]?.trim()
      if (!v) continue
      if (c.tipo === 'numero' && !Number.isFinite(Number(v.replace(',', '.')))) {
        errores.push(`«${c.etiqueta}»: escriba un número.`)
        if (etapa) marcar(etapa)
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
      agregar(v.campos, nino.nacimiento || null, v.etapa)
      continue
    }
    const fecha = fechas[v.etapa]
    if (!fecha) {
      errores.push(`Escriba la fecha de la visita «${v.nombre}».`)
      marcar(v.etapa)
      continue
    }
    if (nacimiento && new Date(`${fecha}T00:00:00`) < nacimiento) {
      errores.push(`La visita «${v.nombre}» no puede ser antes del nacimiento.`)
      marcar(v.etapa)
    }
    agregar(v.campos, fecha, v.etapa)
  }
  if (!mediciones.length && !errores.length) errores.push('Escriba al menos un dato del niño o de una visita.')
  const peticion: PeticionInferencia = {
    sujetos: [{ sujeto: SUJETO, fecha_nacimiento: nino.nacimiento || null, eg_semanas: Number.isFinite(eg) ? eg : null }],
    mediciones,
  }
  return { peticion, errores, visitasConError }
}

/** Los desenlaces que calcula una visita, sin «(riesgo calculado a …)»: la visita ya es la que se está mirando, y sin repetidos. */
const riesgosDe = (v: VisitaFormulario) => [...new Set(v.desenlaces.map((d) => d.replace(/\s*\(riesgo calculado a [^)]*\)\s*$/, '')))]

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

/** Quita «(edad corregida)» del nombre de una visita para su pestaña: la fecha y la ventana de edad ya lo dicen. */
const nombreCorto = (nombre: string) => nombre.replace(' (edad corregida)', '')

/** La clave de la pestaña de una visita: su etapa sin espacios, que no valen en los id de pestaña y panel. */
const claveVisita = (etapa: string) => etapa.replace(/[^\w-]+/g, '-')

/** El formulario es un solo `form`: su botón «Calcular el riesgo» vive junto al título para estar a la vista en cualquier pestaña. */
const ID_FORMULARIO = 'formulario-calculo'

type Seccion = { clave: string; texto: ReactNode; contenido: ReactNode }

export default function Inferencia() {
  const { usuario } = useSesion()
  const activo = usePaqueteActivo()
  const [avanzado, setAvanzado] = useState(false)
  const [pestana, setPestana] = useState('datos')
  const calcular = useMutation({ mutationFn: (p: unknown) => pedir<ResultadoConHistoria>('/inferencia', { cuerpo: p }) })
  const formulario = useQuery({
    queryKey: ['inferencia', 'formulario'], queryFn: () => pedir<FormularioCalculo>('/inferencia/formulario'), select: quitarEdadGestacional,
  })

  if (activo.data === null) {
    return (
      <>
        <Encabezado titulo="Calcular un niño" />
        <Vacio titulo="No hay un paquete de modelos activo"><ActivarModelo admin={puede(usuario, ['admin'])} /></Vacio>
      </>
    )
  }
  const admin = puede(usuario, ['admin'])
  // al terminar el cálculo se abre la primera pestaña del resultado; al fallar, se queda donde estaba el error
  const enviar = (p: unknown) => calcular.mutate(p, { onSuccess: (r) => setPestana(seccionesDeResultado(r, avanzado)[0].clave) })
  const resultado = calcular.data
  const secciones: Seccion[] = [
    {
      clave: 'datos', texto: 'Datos del niño',
      contenido: avanzado ? <ModoAvanzado calcular={enviar} pendiente={calcular.isPending} />
        : formulario.isPending ? <Cargando />
          : formulario.error ? <Aviso>{formulario.error.message}</Aviso>
            : <Formulario formulario={formulario.data} calcular={enviar} verDatos={() => setPestana('datos')} />,
    },
    ...(resultado ? seccionesDeResultado(resultado, avanzado) : [{
      clave: 'resultado', texto: 'Resultado',
      contenido: <Vacio titulo="Aquí aparecerá el resultado">Llene los datos y pulse «Calcular el riesgo». Para ver cómo se ve, cargue el niño de ejemplo.</Vacio>,
    }]),
  ]
  const activa = secciones.find((s) => s.clave === pestana)?.clave ?? 'datos'
  return (
    <div className="flex flex-col lg:h-full">
      <Encabezado titulo="Calcular un niño"
        accion={
          <div className="flex flex-wrap items-center gap-2">
            {admin && (
              <Boton chico variante="fantasma" onClick={() => { setAvanzado((a) => !a); setPestana('datos'); calcular.reset() }} aria-pressed={avanzado}>
                {avanzado ? 'Volver al formulario' : 'Modo avanzado (JSON)'}
              </Boton>
            )}
            {!avanzado && (
              <Boton type="submit" form={ID_FORMULARIO} disabled={!formulario.data || calcular.isPending}>
                {calcular.isPending ? 'Calculando…' : 'Calcular el riesgo'}
              </Boton>
            )}
          </div>
        } />
      {calcular.error && (
        <div className="mb-3">
          <Aviso>
            {calcular.error.message}
            {calcular.error instanceof ErrorApi && calcular.error.estado === 409 && <> <ActivarModelo admin={admin} /></>}
          </Aviso>
        </div>
      )}
      {resultado && resultado.variables_ignoradas.length > 0 && (
        <div className="mb-3"><Aviso tono="teal">No se usaron estos datos porque el modelo no los conoce: {resultado.variables_ignoradas.join(', ')}.</Aviso></div>
      )}
      <Pestanas prefijo="calculo" etiqueta="Qué ver del cálculo" pestanas={secciones} activa={activa} elegir={setPestana} />
      <div className="mt-2 lg:min-h-0 lg:flex-1">
        <PanelesPestana prefijo="calculo" activa={activa} paneles={secciones} className="lg:h-full lg:overflow-y-auto" />
      </div>
    </div>
  )
}

function Formulario({ formulario, calcular, verDatos }: {
  formulario: FormularioCalculo; calcular: (p: PeticionInferencia) => void; verDatos: () => void
}) {
  const [nino, setNino] = useState<Nino>({ nacimiento: '', eg: '' })
  const [valores, setValores] = useState<Valores>({})
  const [fechas, setFechas] = useState<Valores>({})
  const [errores, setErrores] = useState<string[]>([])
  const [conError, setConError] = useState<string[]>([])
  const [visita, setVisita] = useState(claveVisita(formulario.visitas[0]?.etapa ?? ''))
  const ejemplo = useMutation({
    mutationFn: () => pedir<PeticionInferencia & { nota: string }>('/inferencia/ejemplo'),
    onSuccess: (p) => {
      const e = desdeEjemplo(formulario, p)
      setNino(e.nino)
      setValores(e.valores)
      setFechas(e.fechas)
      setErrores([])
      setConError([])
      // la primera visita con datos, para que lo cargado se vea
      setVisita(claveVisita(formulario.visitas.find((v) => v.campos.some((c) => e.valores[c.variable]))?.etapa ?? visita))
    },
  })

  const cambiar = (variable: string, v: string) => setValores((x) => ({ ...x, [variable]: v }))
  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    const r = armarPeticion(formulario, nino, valores, fechas)
    setErrores(r.errores)
    setConError(r.visitasConError.map(claveVisita))
    if (r.errores.length) {
      // lo que falta está en los datos: se vuelve a ellos y, si es de una visita, se abre esa
      verDatos()
      if (r.visitasConError[0]) setVisita(claveVisita(r.visitasConError[0]))
    } else calcular(r.peticion)
  }
  const limpiar = () => {
    setNino({ nacimiento: '', eg: '' })
    setValores({})
    setFechas({})
    setErrores([])
    setConError([])
  }
  const llenosDe = (v: VisitaFormulario) => v.campos.filter((c) => valores[c.variable]?.trim()).length
  const pestanasVisitas = formulario.visitas.map((v) => {
    const llenos = llenosDe(v)
    return {
      clave: claveVisita(v.etapa),
      texto: (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1" title={v.nombre}>
          {nombreCorto(v.nombre)}
          {llenos > 0 && <Insignia tono="teal">{llenos} {llenos === 1 ? 'dato' : 'datos'}</Insignia>}
          {conError.includes(claveVisita(v.etapa)) && <Insignia tono="coral">Revisar</Insignia>}
        </span>
      ),
    }
  })
  const visitaActiva = formulario.visitas.some((v) => claveVisita(v.etapa) === visita) ? visita : claveVisita(formulario.visitas[0]?.etapa ?? '')

  return (
    <form id={ID_FORMULARIO} onSubmit={enviar} noValidate className="space-y-2.5">
      {errores.length > 0 && (
        <Aviso>{errores.length === 1 ? errores[0] : <ul className="list-disc space-y-0.5 pl-4">{errores.map((e) => <li key={e}>{e}</li>)}</ul>}</Aviso>
      )}
      {/* la guía va junto al título: en un renglón propio le quitaba una fila al formulario */}
      <Panel denso
        titulo={<div className="flex min-w-0 flex-[1_1_20rem] flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="text-base">Datos del niño</h2>
          <p className="text-sm text-salvia">Escriba lo que tenga, visita por visita. Lo que deje vacío se toma como dato faltante. No se guarda nada.</p>
        </div>}
        accion={<div className="flex flex-wrap gap-2">
          <Boton type="button" chico variante="secundario" onClick={() => ejemplo.mutate()} disabled={ejemplo.isPending}>{ejemplo.isPending ? 'Armando el ejemplo…' : 'Cargar un niño de ejemplo'}</Boton>
          <Boton type="button" chico variante="fantasma" onClick={limpiar}>Limpiar</Boton>
        </div>}>
        {/* las dos fechas del niño van en la misma cuadrícula que sus datos: en una pantalla ancha, todo en una fila */}
        <Campos campos={formulario.generales} valores={valores} cambiar={cambiar} masTexto="Más datos del niño y la familia"
          antes={<>
            <CampoSimple id="c-nacimiento" etiqueta="Fecha de nacimiento">
              <Entrada id="c-nacimiento" type="date" className={CASILLA} value={nino.nacimiento} onChange={(e) => setNino({ ...nino, nacimiento: e.target.value })} />
            </CampoSimple>
            <CampoSimple id="c-eg" etiqueta="Semanas de gestación al nacer" ayuda="Entre 20 y 45.">
              <Entrada id="c-eg" inputMode="decimal" placeholder="20 a 45" className={CASILLA} value={nino.eg}
                onChange={(e) => setNino({ ...nino, eg: e.target.value })} {...conAyuda('c-eg', 'Entre 20 y 45.')} />
            </CampoSimple>
          </>} />
        {ejemplo.error && <div className="mt-3"><Aviso>{ejemplo.error.message}</Aviso></div>}
        {ejemplo.isSuccess && <p className="mt-3 text-sm text-salvia">Se cargó un niño simulado: ningún dato es de un niño real.</p>}
      </Panel>

      {formulario.visitas.length > 0 && visitaActiva && (
        <Panel denso>
          {/* el título comparte renglón con las pestañas de las visitas; si no caben, las pestañas bajan enteras */}
          <div className="flex flex-wrap items-end gap-x-4 border-b border-linea">
            <h2 className="pb-2.5 text-base">Visitas</h2>
            <Pestanas prefijo="visita" etiqueta="Visitas" pestanas={pestanasVisitas} activa={visitaActiva} elegir={setVisita} className="border-b-0" />
          </div>
          <PanelesPestana prefijo="visita" activa={visitaActiva} className="pt-2.5"
            paneles={formulario.visitas.map((v) => {
              // la edad esperada de la visita se dice una vez, en la línea de arriba, y describe a la casilla de la fecha
              const idVentana = `ventana-${claveVisita(v.etapa)}`
              const esperada = ventana(v)
              return {
                clave: claveVisita(v.etapa),
                contenido: (
                  <>
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
                      {v.desenlaces.length > 0 && (
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <p className="font-semibold" id={`riesgos-${v.etapa}`}>Con esta visita se calculan:</p>
                          <ul aria-label="Riesgos que se calculan con esta visita" className="flex flex-wrap gap-x-1.5 gap-y-1">
                            {riesgosDe(v).map((d) => (
                              <li key={d} className="rounded-full border border-linea bg-fondo px-2 py-0.5 text-xs font-semibold text-salvia">{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {alNacer(v) ? <p className="text-salvia">Se toman con la fecha de nacimiento.</p>
                        : esperada && <p id={idVentana} className="text-salvia">{esperada}</p>}
                    </div>
                    <Campos campos={v.campos} valores={valores} cambiar={cambiar} masTexto="Más datos de esta visita"
                      antes={!alNacer(v) && (
                        <CampoSimple id={`f-${v.etapa}`} etiqueta="Fecha de la visita">
                          <Entrada id={`f-${v.etapa}`} type="date" className={CASILLA} value={fechas[v.etapa] ?? ''} aria-describedby={esperada ? idVentana : undefined}
                            onChange={(e) => setFechas({ ...fechas, [v.etapa]: e.target.value })} />
                        </CampoSimple>
                      )} />
                    {v.campos.length === 0 && <p className="mt-2.5 text-sm text-salvia">Esta visita no tiene datos propios en el modelo.</p>}
                  </>
                ),
              }
            })} />
        </Panel>
      )}
    </form>
  )
}

/** La cuadrícula de casillas: tantas columnas como quepan en el ancho (una o dos en un teléfono, siete en un portátil,
 * ocho en una pantalla grande) para que el formulario se vea entero sin bajar. En un portátil las casillas son más
 * angostas: así los datos del niño caben en una fila; en una pantalla grande sobra ancho y se les da. Las casillas se
 * alinean por abajo: una etiqueta de dos renglones no descuadra la fila. */
const CUADRICULA = 'grid grid-cols-[repeat(auto-fill,minmax(9.25rem,1fr))] min-[1700px]:grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] items-end gap-x-3 gap-y-2'

/** El control de una casilla: en escritorio un poco más bajo (en un teléfono conserva el alto para el dedo), y el rango
 * escrito dentro de la casilla vacía más chico y tenue que un valor, para que no parezca un dato ya escrito. */
const CASILLA = 'lg:h-9 placeholder:text-sm placeholder:text-salvia/80'

const idAyuda = (id: string) => `${id}-ayuda`
/** Lo que lleva el control de una casilla con ayuda: la frase completa no se pinta bajo la casilla (ocupaba un renglón
 * por fila); se lee al pasar el cursor y la oyen los lectores de pantalla. */
const conAyuda = (id: string, ayuda?: string) => (ayuda ? { 'aria-describedby': idAyuda(id), title: ayuda } : {})

function CampoSimple({ id, etiqueta, ayuda, children }: { id: string; etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} title={etiqueta} className="line-clamp-3 text-[0.8125rem] leading-tight font-semibold text-tinta/90">{etiqueta}</label>
      {children}
      {ayuda && <span id={idAyuda(id)} className="sr-only">{ayuda}</span>}
    </div>
  )
}

/** Los campos principales a la vista; el resto, plegado. `antes` son casillas que van primero en la misma cuadrícula
 * (las fechas), para que no gasten una fila aparte. */
function Campos({ campos, valores, cambiar, masTexto, antes }: {
  campos: CampoFormulario[]; valores: Valores; cambiar: (variable: string, valor: string) => void; masTexto: string; antes?: ReactNode
}) {
  const principales = campos.filter((c) => c.principal)
  const resto = campos.filter((c) => !c.principal)
  const llenosResto = resto.filter((c) => valores[c.variable]?.trim()).length
  const casillas = (lista: CampoFormulario[]) =>
    lista.map((c) => <CampoDato key={c.variable} c={c} valor={valores[c.variable] ?? ''} cambiar={(x) => cambiar(c.variable, x)} />)
  return (
    <div className="space-y-2">
      {(antes || principales.length > 0) && <div data-cuadricula className={CUADRICULA}>{antes}{casillas(principales)}</div>}
      {resto.length > 0 && (
        <details className="rounded-control border border-linea/70 px-3 py-1" open={principales.length === 0 || llenosResto > 0}>
          <summary className="cursor-pointer text-sm font-semibold text-teal">
            {masTexto} ({resto.length}){llenosResto > 0 && <span className="font-normal text-salvia"> · {llenosResto} llenos</span>}
          </summary>
          <div data-cuadricula className={cn(CUADRICULA, 'mt-2 pb-1.5')}>{casillas(resto)}</div>
        </details>
      )}
    </div>
  )
}

function CampoDato({ c, valor, cambiar }: { c: CampoFormulario; valor: string; cambiar: (v: string) => void }) {
  const id = `v-${c.variable}`
  const conRango = c.minimo != null && c.maximo != null
  const rango = conRango ? `Habitual: ${dec(c.minimo)} a ${dec(c.maximo)}${c.unidad ? ` ${c.unidad}` : ''}.` : undefined
  const etiqueta = c.unidad && c.tipo === 'numero' ? `${c.etiqueta} (${c.unidad})` : c.etiqueta
  let control: ReactNode
  if (c.tipo === 'lista' || c.tipo === 'si_no') {
    const opciones = c.tipo === 'si_no' && !c.opciones.length ? [{ valor: '1', etiqueta: 'Sí' }, { valor: '0', etiqueta: 'No' }] : c.opciones
    control = (
      <Selector id={id} className={CASILLA} value={valor} onChange={(e) => cambiar(e.target.value)} {...conAyuda(id, rango)}>
        <option value="">—</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
      </Selector>
    )
  } else {
    // el rango habitual va dentro de la casilla vacía (la unidad ya está en la etiqueta)
    control = <Entrada id={id} type={c.tipo === 'fecha' ? 'date' : 'text'} inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
      placeholder={conRango ? `${dec(c.minimo)} a ${dec(c.maximo)}` : undefined} className={CASILLA}
      value={valor} onChange={(e) => cambiar(e.target.value)} {...conAyuda(id, rango)} />
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

/** Las medidas de crecimiento de un niño agrupadas por indicador y en orden de edad, como las trae la ficha. */
function porIndicador(crecimiento: ResultadoInferencia['crecimiento']): Record<string, PuntoCrecimiento[]> {
  const series: Record<string, PuntoCrecimiento[]> = {}
  for (const c of crecimiento) (series[c.indicador] ??= []).push(c)
  for (const ps of Object.values(series)) ps.sort((a, b) => (a.edad_corregida ?? 0) - (b.edad_corregida ?? 0))
  return series
}

/** Las pestañas del resultado: el riesgo a 12 meses de cada desenlace, el resto de riesgos, los datos que parecen raros y el
 * crecimiento. Con varios niños (modo avanzado), cada fila dice de quién es. */
function seccionesDeResultado(r: ResultadoConHistoria, varios: boolean): Seccion[] {
  const quien = (s: string) => (varios ? <span className="font-normal text-salvia"> · {s}</span> : null)
  // con un solo niño, el crecimiento se dibuja como en su ficha; con varios, una tabla deja comparar
  const grafica = !varios && r.crecimiento.some((c) => c.improbable || (c.z != null && c.edad_corregida != null))
  // lo que «Riesgo a los 12 meses» ya cuenta visita por visita no se repite en una tarjeta de la última visita
  const enSeccion = familiasConRiesgo(r.historia)
  const riesgos = r.riesgos.filter((x) => !enSeccion.has(familiaDe(x.clave)))
  const familias = seccionesDeRiesgo({ historia: r.historia })
  const sinRiesgo = r.riesgos.length === 0 && familias.length === 0
  return [
    ...familias,
    ...(sinRiesgo || riesgos.length > 0 ? [{
      clave: 'riesgos', texto: familias.length > 0 ? 'Otros riesgos' : 'Riesgo calculado',
      contenido: sinRiesgo ? (
        <Panel titulo={descripcionDe('riesgo').titulo} descripcion={descripcionDe('riesgo').descripcion}>
          <p className="text-sm text-salvia">
            No se calculó ningún riesgo. El riesgo se calcula en la <strong>última visita con datos</strong>: para verlo, esa
            visita debe ser una de las que calculan riesgos, y lo dice bajo su nombre (deje vacías las posteriores).
          </p>
        </Panel>
      ) : (
        <section aria-label="Riesgo calculado" className="space-y-3">
          <p className="text-sm">{AYUDA_DOS_CIFRAS}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {riesgos.map((x) => <TarjetaRiesgo key={`${x.sujeto}-${x.clave}`} r={x} nota={varios ? `Niño ${x.sujeto}` : undefined}
              origen={{ estado: estadoDe(x.clave), version: r.modelo_clinico }} />)}
          </div>
        </section>
      ),
    }] : []),
    {
      clave: 'datos-raros',
      texto: (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          Datos que parecen raros{r.alertas_dato.length > 0 && <>{' '}<Insignia tono="coral">{r.alertas_dato.length}</Insignia></>}
        </span>
      ),
      contenido: (
        <Panel titulo={descripcionDe('datos_raros').titulo} descripcion={descripcionDe('datos_raros').descripcion}>
          {r.alertas_dato.length === 0 ? <p className="text-sm text-salvia">Ningún dato quedó marcado.</p> : (
            <ul className="divide-y divide-linea/70 text-sm">
              {r.alertas_dato.map((a, i) => {
                const nombre = a.etiqueta ?? a.variable
                const valor = Number(a.valor)
                const extra = motivoExtra(a.motivo)
                return (
                  <li key={i} className="py-3 first:pt-0 last:pb-0">
                    <p>
                      <span className="font-semibold">{nombre}</span>{quien(a.sujeto)}:{' '}
                      <span className="font-semibold text-coral-hondo">{medida(a.valor)}</span>
                      {a.rango_bajo != null && a.rango_alto != null && (
                        <span> · se esperaba entre {aproximado(a.rango_bajo)} y {aproximado(a.rango_alto)}</span>
                      )}
                    </p>
                    {extra && <p>{extra}.</p>}
                    {a.rango_bajo != null && a.rango_alto != null && Number.isFinite(valor) && (
                      <div className="mt-1 max-w-md">
                        <RangoEsperado bajo={a.rango_bajo} alto={a.rango_alto} esperado={a.esperado} valor={valor}
                          etiqueta={`${nombre}: ${medida(a.valor)}; se esperaba entre ${aproximado(a.rango_bajo)} y ${aproximado(a.rango_alto)}`} />
                      </div>
                    )}
                    <p className="mt-1 flex flex-wrap gap-1">
                      {a.capas.map((c) => <span key={c} title={ayudaAlerta(c)}><Insignia>{alerta(c)}</Insignia></span>)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      ),
    },
    {
      clave: 'crecimiento', texto: 'Crecimiento',
      contenido: grafica ? <CrecimientoOms crecimiento={porIndicador(r.crecimiento)} grilla="sm:grid-cols-3" /> : (
        <Panel titulo={descripcionDe('crecimiento_ficha').titulo} descripcion={descripcionDe('crecimiento_ficha').descripcion} accion={<span className="text-xs text-salvia">frente a la <Termino id="oms">OMS</Termino>, para la <Termino id="edad_corregida">edad corregida</Termino></span>}>
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
      ),
    },
  ]
}
