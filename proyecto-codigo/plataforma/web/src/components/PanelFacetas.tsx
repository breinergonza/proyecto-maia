// Panel de filtros de Explorar: casillas por variable con cuántos niños tendría cada opción (los demás filtros puestos),
// los filtros activos como fichas, «+ Agregar variable», el tiempo y el muestreo, los filtros guardados y «Guardar este
// filtro». Con menos de 5 niños en una opción solo dice «<5» (D4); con menos de 20 en el grupo no hay cifras (D46); una
// opción sin niños dice «0» y se atenúa: un cero es un dato, no una cifra oculta. Cada categoría vale por sí sola: elegir
// «muy prematuro» y «a término» no incluye a los moderados.
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ErrorApi } from '../api/cliente'
import { useGuardarMuestra, useMuestras } from '../api/exploracion'
import type { EntradaFiltro, Faceta, MuestreoJson, OpcionFaceta, RespuestaFacetas, TiempoJson } from '../api/tipos'
import { cn } from '../lib/cn'
import { num } from '../lib/formato'
import { nuevaEntrada, SEMILLA_POR_DEFECTO, TOPE_POR_DEFECTO, type Filtros } from '../lib/useFiltros'
import { Aviso, Boton, Entrada, Panel, Selector } from './ui'

/** Las variables que se muestran de entrada; las demás se agregan con «+ Agregar variable». */
const BASICAS = ['sede', 'ern_sexo', 'sexo', 'eg_categoria', 'ern_lubchencofenton']
const FECHA_VALIDA = /^\d{4}(-\d{2}(-\d{2})?)?$/

const nf = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

function textoRango(lo: unknown, hi: unknown): string {
  const a = typeof lo === 'number' ? nf(lo) : null
  const b = typeof hi === 'number' ? nf(hi) : null
  if (a && b) return `${a} a ${b}`
  return a ? `desde ${a}` : b ? `hasta ${b}` : ''
}

const REGLAS: Record<string, string> = { primera: 'Primera medición', ultima: 'Última medición', alguna: 'En alguna visita' }

/** «En alguna visita», «En la visita 40 semanas»... */
export function textoRegla(cuando: string | null | undefined, etapas: RespuestaFacetas['etapas'] = []): string {
  if (!cuando) return ''
  if (cuando.startsWith('etapa:')) return `En la visita ${etapas.find((e) => e.etapa === cuando.slice(6))?.nombre ?? cuando.slice(6)}`
  return REGLAS[cuando] ?? cuando
}

function resumenEntrada(e: EntradaFiltro, f?: Faceta): string {
  if (e.tipo === 'numero') return textoRango(e.valores[0], e.valores[1])
  if (e.tipo === 'si_no') return e.valores[0] ? 'Sí' : 'No'
  return e.valores.map((v) => f?.opciones?.find((o) => String(o.valor) === String(v))?.etiqueta ?? String(v)).join(', ')
}

function estaMarcada(o: OpcionFaceta, e: EntradaFiltro | undefined): boolean {
  if (!e) return false
  if (e.tipo === 'si_no') return e.valores[0] === o.valor
  return e.valores.map(String).includes(String(o.valor))
}

type Cambiar = (e: EntradaFiltro | null) => void

function Casillas({ clave, faceta, entrada, cambiar }: { clave: string; faceta: Faceta; entrada?: EntradaFiltro; cambiar: Cambiar }) {
  const opciones = faceta.opciones ?? []
  const alternar = (o: OpcionFaceta, marcada: boolean) => {
    if (faceta.tipo === 'si_no') {
      cambiar(marcada ? null : nuevaEntrada(clave, 'si_no', [o.valor], faceta.cuando))
    } else {   // una lista: cada opción elegida es una opción, nunca un tramo entre dos
      const previos = (entrada?.valores ?? []).map(String)
      const valores = marcada ? previos.filter((v) => v !== String(o.valor)) : [...previos, String(o.valor)]
      cambiar(valores.length ? nuevaEntrada(clave, 'lista', valores, faceta.cuando) : null)
    }
  }
  return (
    <ul className="space-y-1">
      {opciones.map((o) => {
        const marcada = estaMarcada(o, entrada)
        const id = `faceta-${clave}-${String(o.valor)}`
        const sinNinos = o.n === 0   // un cero verdadero: la opción existe pero ningún niño la tiene con estos filtros
        return (
          <li key={String(o.valor)} className={cn('flex items-center gap-2 text-sm', sinNinos && !marcada && 'opacity-60')}>
            <input id={id} type="checkbox" className="size-4 accent-teal" checked={marcada} onChange={() => alternar(o, marcada)} />
            <label htmlFor={id} className="flex flex-1 cursor-pointer items-baseline justify-between gap-2">
              <span>{o.etiqueta}</span>
              <span className="text-xs text-salvia">{o.texto}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

function Rango({ clave, faceta, entrada, cambiar }: { clave: string; faceta: Faceta; entrada?: EntradaFiltro; cambiar: Cambiar }) {
  // se aplica al salir del campo, no en cada tecla
  const [borrador, setBorrador] = useState<{ lo?: string; hi?: string }>({})
  const lo = borrador.lo ?? String(entrada?.valores[0] ?? '')
  const hi = borrador.hi ?? String(entrada?.valores[1] ?? '')
  const aplicar = () => {
    const [a, b] = [lo, hi].map((t) => (t.trim() === '' ? null : Number(t.replace(',', '.'))))
    setBorrador({})
    const valido = (v: number | null) => (v === null || Number.isNaN(v) ? null : v)
    if (valido(a) === null && valido(b) === null) return cambiar(null)
    cambiar(nuevaEntrada(clave, 'numero', [valido(a), valido(b)], faceta.cuando))
  }
  const alTeclear = (e: React.KeyboardEvent) => e.key === 'Enter' && aplicar()
  return (
    <div className="flex items-center gap-2">
      <Entrada aria-label={`${faceta.etiqueta}: desde`} inputMode="decimal" placeholder={faceta.min != null ? nf(faceta.min) : 'Desde'}
        value={lo} onChange={(e) => setBorrador({ lo: e.target.value, hi })} onBlur={aplicar} onKeyDown={alTeclear} />
      <span className="text-salvia">a</span>
      <Entrada aria-label={`${faceta.etiqueta}: hasta`} inputMode="decimal" placeholder={faceta.max != null ? nf(faceta.max) : 'Hasta'}
        value={hi} onChange={(e) => setBorrador({ lo, hi: e.target.value })} onBlur={aplicar} onKeyDown={alTeclear} />
    </div>
  )
}

/** Cómo se lee una variable que se mide en cada visita (D1): la primera, la última, en alguna o en una visita. */
function ReglaDeLectura({ faceta, etapas, cambiar }: {
  faceta: Faceta; etapas: NonNullable<RespuestaFacetas['etapas']>; cambiar: (cuando: string) => void
}) {
  return (
    <Selector aria-label={`Regla de lectura: ${faceta.etiqueta}`} className="mb-2 h-9 text-xs sm:h-9" value={faceta.cuando ?? 'alguna'}
      onChange={(e) => cambiar(e.target.value)}>
      {(faceta.reglas ?? []).map((r) => <option key={r} value={r}>{textoRegla(r)}</option>)}
      {etapas.length > 0 && (
        <optgroup label="En una visita">
          {etapas.map((x) => <option key={x.etapa} value={`etapa:${x.etapa}`}>{textoRegla(`etapa:${x.etapa}`, etapas)}</option>)}
        </optgroup>
      )}
    </Selector>
  )
}

function ayudaFecha(t: string) {
  return t.trim() !== '' && !FECHA_VALIDA.test(t.trim()) ? 'Escriba el año (2018), el mes (2018-03) o el día (2018-03-31).' : null
}

type ModoTiempo = 'todo' | 'periodo' | 'ultimos_meses'

/** Qué fecha manda y el período (fechas fijas o los últimos N meses desde el corte). Vive en la dirección. */
function Tiempo({ info, filtros }: { info: NonNullable<RespuestaFacetas['tiempo']>; filtros: Filtros }) {
  const t = filtros.tiempo
  const [modoLocal, setModoLocal] = useState<ModoTiempo>('todo')
  const [fechaLocal, setFechaLocal] = useState(info.defecto)
  const [borrador, setBorrador] = useState<{ desde?: string; hasta?: string }>({})
  const modo: ModoTiempo = t ? t.modo : modoLocal
  const fecha = t?.fecha ?? fechaLocal
  const desde = borrador.desde ?? String(t?.desde ?? '')
  const hasta = borrador.hasta ?? String(t?.hasta ?? '')
  const error = modo === 'periodo' ? ayudaFecha(desde) ?? ayudaFecha(hasta) : null

  const aplicar = (nuevo: { fecha?: string; modo?: ModoTiempo; desde?: string; hasta?: string } = {}) => {
    const m = nuevo.modo ?? modo
    const f = nuevo.fecha ?? fecha
    const d = (nuevo.desde ?? desde).trim()
    const h = (nuevo.hasta ?? hasta).trim()
    setBorrador({})
    if (m === 'todo') return filtros.ponerTiempo(null)
    if (m === 'ultimos_meses') {
      const n = Number(d)
      return filtros.ponerTiempo(Number.isInteger(n) && n > 0 ? { fecha: f, modo: m, desde: n } : null)
    }
    if ((!d && !h) || ayudaFecha(d) || ayudaFecha(h)) return filtros.ponerTiempo(null)
    const nuevoTiempo: TiempoJson = { fecha: f, modo: 'periodo', ...(d ? { desde: d } : {}), ...(h ? { hasta: h } : {}) }
    return filtros.ponerTiempo(nuevoTiempo)
  }
  const alTeclear = (e: React.KeyboardEvent) => e.key === 'Enter' && aplicar()
  const anios = info.desde && info.hasta ? ` Los niños del corte nacieron entre ${info.desde} y ${info.hasta}.` : ''

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-1.5 text-sm font-semibold">Tiempo</legend>
      <Selector aria-label="Fecha que manda" value={fecha} onChange={(e) => { setFechaLocal(e.target.value); aplicar({ fecha: e.target.value }) }}>
        {info.campos.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
      </Selector>
      <Selector aria-label="Período" value={modo} onChange={(e) => {
        const m = e.target.value as ModoTiempo
        setModoLocal(m)
        aplicar({ modo: m, desde: '', hasta: '' })
      }}>
        <option value="todo">Todo el período</option>
        <option value="periodo">Entre dos fechas</option>
        <option value="ultimos_meses">Últimos meses antes del corte</option>
      </Selector>
      {modo === 'periodo' && (
        <div className="flex items-center gap-2">
          <Entrada aria-label="Desde" placeholder="Desde (2018)" value={desde} onChange={(e) => setBorrador({ desde: e.target.value, hasta })}
            onBlur={() => aplicar()} onKeyDown={alTeclear} />
          <span className="text-salvia">a</span>
          <Entrada aria-label="Hasta" placeholder="Hasta (2019-12)" value={hasta} onChange={(e) => setBorrador({ desde, hasta: e.target.value })}
            onBlur={() => aplicar()} onKeyDown={alTeclear} />
        </div>
      )}
      {modo === 'ultimos_meses' && (
        <Entrada aria-label="Meses" inputMode="numeric" placeholder="Meses (por ejemplo 24)" value={desde}
          onChange={(e) => setBorrador({ desde: e.target.value })} onBlur={() => aplicar()} onKeyDown={alTeclear} />
      )}
      {error && <p className="text-xs text-coral-hondo" role="alert">{error}</p>}
      <p className="text-xs text-salvia">
        {info.hay_fecha_nacimiento ? 'Con la fecha de parto se compara el día.' : 'Este corte no trae la fecha de parto: se usa el año de nacimiento.'}
        {anios}
      </p>
    </fieldset>
  )
}

/** Todos los que cumplen, o un tope por categoría para que un grupo grande no domine (se aplica al entrenar). */
function Muestreo({ info, filtros }: { info: NonNullable<RespuestaFacetas['muestreo']>; filtros: Filtros }) {
  const m = filtros.muestreo
  const [abierto, setAbierto] = useState(false)
  const [tope, setTope] = useState<string | undefined>()
  const estratificado = abierto || !!m
  const por = m?.por ?? info.por[0]?.valor ?? ''
  const topeTexto = tope ?? String(m?.maximo_por_categoria ?? TOPE_POR_DEFECTO)
  const aplicar = (nuevo: Partial<MuestreoJson> = {}) => {
    const n = Number(nuevo.maximo_por_categoria ?? topeTexto)
    setTope(undefined)
    if (!Number.isInteger(n) || n < 1 || !(nuevo.por ?? por)) return
    filtros.ponerMuestreo({ modo: 'estratificado', por: nuevo.por ?? por, maximo_por_categoria: n, semilla: m?.semilla ?? SEMILLA_POR_DEFECTO })
  }
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-1.5 text-sm font-semibold">Muestreo</legend>
      <Selector aria-label="Muestreo" value={estratificado ? 'estratificado' : 'todos'} onChange={(e) => {
        if (e.target.value === 'todos') { setAbierto(false); filtros.ponerMuestreo(null) } else { setAbierto(true); aplicar() }
      }}>
        <option value="todos">Todos los que cumplen</option>
        <option value="estratificado" disabled={info.por.length === 0}>Un tope por categoría</option>
      </Selector>
      {estratificado && (
        <div className="flex items-center gap-2">
          <Selector aria-label="Categoría del muestreo" value={por} onChange={(e) => aplicar({ por: e.target.value })}>
            {info.por.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
          </Selector>
          <Entrada aria-label="Máximo por categoría" inputMode="numeric" className="w-24" value={topeTexto}
            onChange={(e) => setTope(e.target.value)} onBlur={() => aplicar()} onKeyDown={(e) => e.key === 'Enter' && aplicar()} />
        </div>
      )}
      <p className="text-xs text-salvia">El tope se aplica al entrenar; las cifras de Explorar son las del grupo completo.</p>
    </fieldset>
  )
}

function Guardar({ filtros }: { filtros: Filtros }) {
  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const guardar = useGuardarMuestra()
  if (!abierto) return <Boton variante="secundario" chico onClick={() => setAbierto(true)}>Guardar este filtro</Boton>
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault()
      guardar.mutate({ titulo: titulo.trim(), muestra: filtros.muestra }, {
        onSuccess: (m) => { setAbierto(false); setTitulo(''); filtros.ponerTodas(m.definicion.y, m.id, m.definicion) },
      })
    }}>
      <Entrada aria-label="Nombre del filtro" placeholder="Nombre del filtro" maxLength={200} value={titulo}
        onChange={(e) => setTitulo(e.target.value)} />
      {guardar.error && <Aviso>{guardar.error instanceof ErrorApi ? guardar.error.message : 'No se pudo guardar.'}</Aviso>}
      <div className="flex gap-2">
        <Boton type="submit" chico disabled={!titulo.trim() || guardar.isPending}>Guardar</Boton>
        <Boton variante="fantasma" chico onClick={() => setAbierto(false)}>Cancelar</Boton>
      </div>
    </form>
  )
}

function Ficha({ texto, quitar, etiqueta }: { texto: string; quitar: () => void; etiqueta: string }) {
  return (
    <li className="inline-flex items-center gap-1 rounded-full border border-teal/20 bg-teal-tinte py-0.5 pl-3 pr-1 text-sm text-teal">
      <span>{texto}</span>
      <button type="button" aria-label={etiqueta} onClick={quitar} className="grid size-6 place-items-center rounded-full hover:bg-teal/10">×</button>
    </li>
  )
}

function textoTiempo(t: TiempoJson): string {
  if (t.modo === 'ultimos_meses') return `últimos ${t.desde} meses`
  return [t.desde, t.hasta].filter(Boolean).join(' a ') || 'sin límite'
}

export function PanelFacetas({ facetas, cargando, filtros, esExperto, conTiempo = false, error = false, reintentar }: {
  facetas?: RespuestaFacetas; cargando?: boolean; filtros: Filtros; esExperto: boolean
  /** Muestra el tiempo y el muestreo (Explorar); el constructor de muestras los trae en su propio formulario. */
  conTiempo?: boolean
  /** La consulta de opciones falló; con ``reintentar`` se ofrece volver a pedirla. */
  error?: boolean
  reintentar?: () => void
}) {
  const [extra, setExtra] = useState<string[]>([])
  const [lento, setLento] = useState(false)
  useEffect(() => {   // si las opciones tardan, se dice (no se queda en «Cargando…» sin explicación)
    if (!(cargando && !facetas)) { setLento(false); return }
    const t = setTimeout(() => setLento(true), 20000)
    return () => clearTimeout(t)
  }, [cargando, facetas])
  const guardadas = useMuestras(esExperto)
  const todas = facetas?.facetas ?? {}
  const etapas = facetas?.etapas ?? []
  const porVariable = new Map(filtros.entradas.map((e) => [e.variable, e]))
  const agregadas = new Set(filtros.extras.map((x) => x.variable))
  const visibles = Object.keys(todas).filter((k) => BASICAS.includes(k) || todas[k].destacada || porVariable.has(k) || agregadas.has(k) || extra.includes(k))
  const agregables = [
    ...Object.keys(todas).filter((k) => !visibles.includes(k)).map((k) => ({ variable: k, etiqueta: todas[k].etiqueta, cuando: todas[k].cuando })),
    ...(facetas?.disponibles ?? []).filter((d) => !(d.variable in todas)).map((d) => ({ variable: d.variable, etiqueta: d.etiqueta, cuando: d.cuando })),
  ]
  const otrosGuardados = (guardadas.data ?? []).filter((m) => m.id !== filtros.guardada)
  const hayActivos = filtros.entradas.length > 0 || !!filtros.tiempo || !!filtros.muestreo

  const agregar = (variable: string) => {
    if (!variable) return
    if (variable in todas) setExtra((x) => [...x, variable])
    else filtros.ponerExtra(variable, agregables.find((a) => a.variable === variable)?.cuando ?? 'primera')
  }

  return (
    <Panel titulo="Elija el grupo" descripcion="Marque las opciones; los números son los niños que tendría cada una."
      accion={hayActivos && <Boton variante="fantasma" chico onClick={filtros.limpiar}>Quitar todos</Boton>}>
      <div className="space-y-4">
        {esExperto && (guardadas.data?.length ?? 0) > 0 && (
          <label className="block text-sm font-semibold">
            Filtro guardado
            <Selector className="mt-1 font-normal" value={filtros.guardada ?? ''} onChange={(e) => {
              const m = guardadas.data?.find((x) => x.id === Number(e.target.value))
              if (m) filtros.ponerTodas(m.definicion.y, m.id, m.definicion)
              else filtros.limpiar()
            }}>
              <option value="">Ninguno</option>
              {guardadas.data?.map((m) => <option key={m.id} value={m.id}>{m.titulo} · {num(m.n_ninos)} niños</option>)}
            </Selector>
          </label>
        )}

        {hayActivos && (
          <ul className="flex flex-wrap gap-2" aria-label="Filtros activos">
            {filtros.entradas.map((e) => {
              const f = todas[e.variable]
              const nombre = f?.etiqueta ?? e.variable
              const regla = f?.reglas?.length ? ` (${textoRegla(e.cuando, etapas).toLowerCase()})` : ''
              return <Ficha key={e.variable} texto={`${nombre}${regla}: ${resumenEntrada(e, f)}`} etiqueta={`Quitar filtro ${nombre}`}
                quitar={() => filtros.poner(e.variable, null)} />
            })}
            {filtros.tiempo && <Ficha texto={`Tiempo: ${textoTiempo(filtros.tiempo)}`} etiqueta="Quitar el tiempo" quitar={() => filtros.ponerTiempo(null)} />}
            {filtros.muestreo && (
              <Ficha texto={`Muestreo: hasta ${filtros.muestreo.maximo_por_categoria} por categoría`} etiqueta="Quitar el muestreo"
                quitar={() => filtros.ponerMuestreo(null)} />
            )}
          </ul>
        )}

        {facetas?.vacio && (
          <p className="rounded-control border border-dashed border-linea px-3 py-2 text-sm" role="status">
            <strong>Ningún niño cumple estos filtros (0).</strong> Quite alguno para volver a ver las opciones.
          </p>
        )}
        {cargando && !facetas && (
          <p className="text-sm text-salvia" role="status">
            Cargando opciones…{lento && ' Está tardando más de lo normal; las cifras de arriba ya están disponibles.'}
          </p>
        )}
        {error && !facetas && (
          <p className="rounded-control border border-dashed border-linea px-3 py-2 text-sm" role="alert">
            <strong>No se pudieron cargar las opciones.</strong>{' '}
            {reintentar && <button type="button" className="underline" onClick={reintentar}>Reintentar</button>}
          </p>
        )}
        {visibles.map((k) => (
          <fieldset key={k} className="min-w-0">
            <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-semibold">
              <span>{todas[k].etiqueta}</span>
              {agregadas.has(k) && !porVariable.has(k) && (
                <button type="button" aria-label={`Quitar variable ${todas[k].etiqueta}`} className="text-xs font-normal text-teal underline"
                  onClick={() => filtros.ponerExtra(k, null)}>Quitar</button>
              )}
            </legend>
            {!!todas[k].reglas?.length && <ReglaDeLectura faceta={todas[k]} etapas={etapas} cambiar={(c) => filtros.ponerRegla(k, c)} />}
            {todas[k].opciones
              ? <Casillas clave={k} faceta={todas[k]} entrada={porVariable.get(k)} cambiar={(e) => filtros.poner(k, e)} />
              : <Rango clave={k} faceta={todas[k]} entrada={porVariable.get(k)} cambiar={(e) => filtros.poner(k, e)} />}
          </fieldset>
        ))}

        {agregables.length > 0 && (
          <Selector aria-label="Agregar variable" value="" onChange={(e) => agregar(e.target.value)}>
            <option value="">+ Agregar variable</option>
            {agregables.map((a) => <option key={a.variable} value={a.variable}>{a.etiqueta}</option>)}
          </Selector>
        )}

        {conTiempo && facetas?.tiempo && <Tiempo key={filtros.tiempo ? 'tiempo-con' : 'tiempo-sin'} info={facetas.tiempo} filtros={filtros} />}
        {conTiempo && facetas?.muestreo && <Muestreo key={filtros.muestreo ? 'muestreo-con' : 'muestreo-sin'} info={facetas.muestreo} filtros={filtros} />}

        {esExperto && (
          <div className="space-y-3 border-t border-linea pt-3">
            <Guardar filtros={filtros} />
            {otrosGuardados.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-teal">Comparar con otro filtro</summary>
                {filtros.guardada
                  ? (
                    <ul className="mt-2 space-y-1">
                      {otrosGuardados.map((m) => (
                        <li key={m.id}>
                          <Link className="text-teal underline" to={`/analitica/comparar?a=${filtros.guardada}&b=${m.id}`}>{m.titulo}</Link>
                        </li>
                      ))}
                    </ul>
                  )
                  : <p className="mt-2 text-salvia">Guarde este filtro para compararlo con otro.</p>}
              </details>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
