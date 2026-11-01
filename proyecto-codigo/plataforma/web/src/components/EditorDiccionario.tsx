// Editor del diccionario con formularios (experto y administración). Cada hoja del Excel es una pestaña y cada fila se
// abre en un formulario armado con lo que el núcleo dice de sus columnas: título, ayuda, respuestas posibles y de qué
// hoja salen. Los cambios se juntan aquí, se revisan contra la vigente (el núcleo los valida) y se guardan como una
// versión nueva.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ErrorApi, pedir } from '../api/cliente'
import type {
  CambioFila, DiferenciasDiccionario as Diferencias, Edicion, HojaVista, VersionDiccionario, VistaDiccionario,
} from '../api/tipos-diccionario'
import { cn } from '../lib/cn'
import { num } from '../lib/formato'
import DiferenciasDiccionario from './DiferenciasDiccionario'
import { Aviso, Boton, Campo, Cargando, Entrada, Insignia, Paginador, Selector, Tabla, Texto, Vacio } from './ui'

type Valores = Record<string, string | null>
type Pendiente = { accion: 'editar' | 'agregar'; valores: Valores } | { accion: 'borrar' }
/** hoja → fila (el valor de su primera columna) → lo que se le cambió */
type Pendientes = Record<string, Record<string, Pendiente>>
type Fila = { clave: string; valores: Valores; original: Valores | null; pendiente: Pendiente | null }
/** Una fila que otra parte de la página pide abrir (por ejemplo «Completar» en las variables por clasificar). */
export type FilaPedida = { hoja: string; clave: string }

const POR_PAGINA = 50
const COLUMNAS_TABLA = 4   // la tabla muestra las primeras (en el teléfono, dos); el formulario, todas
const ESTADO_FILA = {
  editar: { texto: 'Editada', tono: 'ocre' },
  agregar: { texto: 'Nueva', tono: 'teal' },
  borrar: { texto: 'Se quita', tono: 'coral' },
} as const

const registro = (h: HojaVista, f: (string | null)[]): Valores =>
  Object.fromEntries(h.columnas.map((c, i) => [c.clave, f[i] ?? null]))

function filasDe(h: HojaVista, pendientes: Record<string, Pendiente> = {}): Fila[] {
  const existentes = h.filas.map((f): Fila => {
    const original = registro(h, f)
    const clave = original[h.clave] ?? ''
    const pendiente = pendientes[clave] ?? null
    return { clave, original, pendiente, valores: pendiente?.accion === 'editar' ? { ...original, ...pendiente.valores } : original }
  })
  const nuevas = Object.entries(pendientes).flatMap(([clave, p]): Fila[] =>
    p.accion === 'agregar' ? [{ clave, original: null, pendiente: p, valores: p.valores }] : [])
  return [...existentes, ...nuevas]
}

const aCambios = (hojas: HojaVista[], pendientes: Pendientes): CambioFila[] =>
  hojas.flatMap((h) => Object.entries(pendientes[h.nombre] ?? {}).map(([clave, p]): CambioFila =>
    p.accion === 'agregar' ? { hoja: h.nombre, accion: 'agregar', clave: null, valores: p.valores }
      : { hoja: h.nombre, accion: p.accion, clave, valores: p.accion === 'editar' ? p.valores : {} }))

const contar = (pendientes: Pendientes) => Object.values(pendientes).reduce((n, h) => n + Object.keys(h).length, 0)

export default function EditorDiccionario({ vigente, pedida, alAbrirPedida, alGuardar }: {
  vigente: VersionDiccionario; pedida: FilaPedida | null; alAbrirPedida: () => void; alGuardar: (v: VersionDiccionario) => void
}) {
  const titulo = useId()
  const seccion = useRef<HTMLElement>(null)
  const vista = useQuery({
    queryKey: ['diccionario', 'vista', vigente.id],
    queryFn: () => pedir<VistaDiccionario>(`/diccionario/versiones/${vigente.id}/vista`),
    staleTime: Infinity,   // una versión guardada no cambia
  })
  const [indice, setIndice] = useState(0)
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)
  const [pendientes, setPendientes] = useState<Pendientes>({})
  const [abierta, setAbierta] = useState<{ hoja: string; clave: string | null } | null>(null)
  const [revisando, setRevisando] = useState(false)
  const hojas = vista.data?.hojas ?? []
  const hoja = hojas[indice]
  const n = contar(pendientes)

  const filas = useMemo(() => hoja ? filasDe(hoja, pendientes[hoja.nombre]) : [], [hoja, pendientes])
  const visibles = useMemo(() => {
    const t = buscar.trim().toLocaleLowerCase('es')
    return t ? filas.filter((f) => Object.values(f.valores).some((v) => v?.toLocaleLowerCase('es').includes(t))) : filas
  }, [filas, buscar])
  // las respuestas de las columnas que salen de otra hoja (su primera columna, con lo que se agregó)
  const listas = useMemo(() => Object.fromEntries(hojas.map((h) => [h.nombre,
    filasDe(h, pendientes[h.nombre]).filter((f) => f.pendiente?.accion !== 'borrar').map((f) => f.clave)])), [hojas, pendientes])

  useEffect(() => {
    if (!pedida || !vista.data) return
    const i = vista.data.hojas.findIndex((h) => h.nombre === pedida.hoja)
    if (i >= 0) {
      setIndice(i)
      setBuscar('')
      setAbierta({ hoja: pedida.hoja, clave: pedida.clave })
      seccion.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    }
    alAbrirPedida()
  }, [pedida, vista.data, alAbrirPedida])

  // con cambios sin guardar, el navegador pregunta antes de salir de la página
  useEffect(() => {
    if (!n) return
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [n])

  const fijar = (nombre: string, clave: string, p: Pendiente | null) => setPendientes((todos) => {
    const { [clave]: _, ...resto } = todos[nombre] ?? {}
    return { ...todos, [nombre]: p ? { ...resto, [clave]: p } : resto }
  })
  const elegir = (i: number) => {
    setIndice(i)
    setBuscar('')
    setPagina(1)
  }
  const descartar = () => {
    if (window.confirm(`¿Descartar los cambios de ${n} fila${n === 1 ? '' : 's'}?`)) setPendientes({})
  }

  const formulario = abierta && hojas.find((h) => h.nombre === abierta.hoja)
  const fila = formulario && abierta.clave !== null ? filasDe(formulario, pendientes[formulario.nombre]).find((f) => f.clave === abierta.clave) : undefined

  return (
    <section ref={seccion} aria-labelledby={titulo} className="animate-aparecer scroll-mt-4 rounded-panel border border-linea/80 bg-papel shadow-suave">
      <header className="px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 id={titulo} className="text-base">Editar el diccionario</h2>
      </header>
      <div className="space-y-3 p-4 sm:p-6">
        {vista.isPending ? <Cargando /> : vista.error ? <Aviso><span className="whitespace-pre-line">{vista.error.message}</span></Aviso> : hoja && (
          <>
            <div role="tablist" aria-label="Hojas del diccionario" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {hojas.map((h, i) => {
                const cambios = Object.keys(pendientes[h.nombre] ?? {}).length
                return (
                  <button key={h.nombre} type="button" role="tab" aria-selected={i === indice} onClick={() => elegir(i)}
                    className={cn('shrink-0 rounded-control px-3 py-1.5 text-sm font-semibold transition-colors',
                      i === indice ? 'bg-teal-tinte text-teal' : 'text-salvia hover:bg-fondo hover:text-tinta')}>
                    {h.nombre} <span className="font-normal opacity-70">{num(h.filas.length)}</span>
                    {cambios > 0 && <span className="ml-1 text-ocre" aria-label={`, ${cambios} con cambios`}>•</span>}
                  </button>
                )
              })}
            </div>

            {n > 0 && (
              <div className="flex flex-col gap-2 rounded-control border border-ocre/40 bg-ocre-tinte/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold">{n} fila{n === 1 ? '' : 's'} con cambios sin guardar</p>
                <div className="flex gap-2">
                  <Boton chico variante="secundario" onClick={descartar}>Descartar</Boton>
                  <Boton chico onClick={() => setRevisando(true)}>Revisar y guardar</Boton>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-sm text-salvia">{hoja.describe}. Abra una fila para editarla.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="relative block sm:w-72">
                  <span className="sr-only">Buscar en la hoja {hoja.nombre}</span>
                  <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-salvia" />
                  <Entrada value={buscar} placeholder="Buscar…" className="h-10 pl-9" onChange={(e) => {
                    setBuscar(e.target.value)
                    setPagina(1)
                  }} />
                </label>
                {hoja.agregar && (
                  <Boton variante="secundario" onClick={() => setAbierta({ hoja: hoja.nombre, clave: null })}>
                    <Plus size={16} aria-hidden />Agregar fila
                  </Boton>
                )}
              </div>
            </div>

            {visibles.length === 0 ? <Vacio titulo={buscar ? 'Nada coincide con la búsqueda' : 'Esta hoja está vacía'} /> : (
              <>
                <Tabla densa>
                  <thead>
                    <tr>
                      {hoja.columnas.slice(0, COLUMNAS_TABLA).map((c, j) => <th key={c.clave} className={cn(j > 1 && 'hidden md:table-cell')}>{c.titulo}</th>)}
                      <th><span className="sr-only">Cambios</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((f) => (
                      <tr key={f.clave} onClick={() => setAbierta({ hoja: hoja.nombre, clave: f.clave })}
                        className={cn('cursor-pointer hover:bg-fondo/60', f.pendiente?.accion === 'borrar' && 'text-salvia line-through')}>
                        {hoja.columnas.slice(0, COLUMNAS_TABLA).map((c, j) => (
                          <td key={c.clave} className={cn('max-w-80 align-top', j > 1 && 'hidden md:table-cell')}>
                            {j === 0 ? (
                              <button type="button" aria-label={`Editar ${f.clave}`} onClick={(e) => {
                                e.stopPropagation()
                                setAbierta({ hoja: hoja.nombre, clave: f.clave })
                              }} className="break-all text-left font-mono text-xs font-semibold text-teal underline-offset-2 hover:underline">
                                {f.clave}
                              </button>
                            ) : f.valores[c.clave] ?? <span className="text-salvia/60">—</span>}
                          </td>
                        ))}
                        <td className="align-top">
                          {f.pendiente && <Insignia tono={ESTADO_FILA[f.pendiente.accion].tono}>{ESTADO_FILA[f.pendiente.accion].texto}</Insignia>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
                <Paginador pagina={pagina} tamano={POR_PAGINA} total={visibles.length} cambiar={setPagina} />
              </>
            )}
          </>
        )}
      </div>

      {formulario && (abierta.clave === null || fila) && (
        <FormularioFila key={`${formulario.nombre}:${abierta.clave ?? '+'}`} hoja={formulario} fila={fila ?? null} listas={listas}
          alCerrar={() => setAbierta(null)}
          alAplicar={(valores) => {
            const clave = valores[formulario.clave] ?? ''
            if (!fila || fila.pendiente?.accion === 'agregar') {
              if (fila && fila.clave !== clave) fijar(formulario.nombre, fila.clave, null)
              fijar(formulario.nombre, clave, { accion: 'agregar', valores: Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== null)) })
            } else {
              const distintos = Object.fromEntries(Object.entries(valores).filter(([k, v]) => v !== (fila.original?.[k] ?? null)))
              fijar(formulario.nombre, fila.clave, Object.keys(distintos).length ? { accion: 'editar', valores: distintos } : null)
            }
            setAbierta(null)
          }}
          alQuitar={formulario.agregar && fila ? () => {
            fijar(formulario.nombre, fila.clave, fila.pendiente?.accion === 'agregar' ? null : { accion: 'borrar' })
            setAbierta(null)
          } : undefined}
          alDeshacer={fila?.original && fila.pendiente ? () => {
            fijar(formulario.nombre, fila.clave, null)
            setAbierta(null)
          } : undefined} />
      )}

      {revisando && (
        <Revision edicion={{ base: vigente.id, cambios: aCambios(hojas, pendientes), nota: null }} hojas={hojas}
          alCerrar={() => setRevisando(false)}
          alGuardar={(v) => {
            setPendientes({})
            setRevisando(false)
            alGuardar(v)
          }} />
      )}
    </section>
  )
}

/** Ventana modal: Escape la cierra y la página de fondo no se desplaza. En el teléfono sube desde abajo. */
function Dialogo({ titulo, subtitulo, alCerrar, pie, children }: {
  titulo: string; subtitulo?: ReactNode; alCerrar: () => void; pie?: ReactNode; children: ReactNode
}) {
  const id = useId()
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar()
    document.addEventListener('keydown', cerrar)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', cerrar)
      document.body.style.overflow = ''
    }
  }, [alCerrar])
  // en el body: la página entra con una animación (transform) que, si no, ataría el `fixed` a ella y no a la ventana
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-tinta/40 backdrop-blur-[2px]" onClick={alCerrar} />
      <div role="dialog" aria-modal="true" aria-labelledby={id}
        className="relative flex max-h-[92dvh] w-full max-w-2xl animate-aparecer flex-col rounded-t-panel bg-papel shadow-elevada sm:max-h-[85dvh] sm:rounded-panel">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-linea px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 id={id} className="break-words text-base">{titulo}</h2>
            {subtitulo && <p className="text-sm text-salvia">{subtitulo}</p>}
          </div>
          <button type="button" onClick={alCerrar} aria-label="Cerrar"
            className="grid size-10 shrink-0 place-items-center rounded-control text-salvia hover:bg-fondo hover:text-tinta">
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">{children}</div>
        {pie && <footer className="shrink-0 border-t border-linea px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">{pie}</footer>}
      </div>
    </div>,
    document.body,
  )
}

function FormularioFila({ hoja, fila, listas, alAplicar, alQuitar, alDeshacer, alCerrar }: {
  hoja: HojaVista; fila: Fila | null; listas: Record<string, string[]>
  alAplicar: (valores: Valores) => void; alQuitar?: () => void; alDeshacer?: () => void; alCerrar: () => void
}) {
  const base = useId()
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(hoja.columnas.map((c) => [c.clave, fila?.valores[c.clave] ?? ''])))
  const [errores, setErrores] = useState<Record<string, string>>({})
  const nueva = !fila || fila.pendiente?.accion === 'agregar'
  const quitada = fila?.pendiente?.accion === 'borrar'
  const usadas = new Set((listas[hoja.nombre] ?? []).filter((c) => c !== fila?.clave))
  const desde = [...new Set(hoja.columnas.flatMap((c) => c.lista ? [c.lista] : []))]

  const aplicar = () => {
    const faltas: Record<string, string> = {}
    for (const c of hoja.columnas) {
      const v = valores[c.clave].trim()
      if (c.obligatoria && !v) faltas[c.clave] = 'Falta este dato.'
      else if (c.tipo === 'numero' && v && Number.isNaN(Number(v.replace(',', '.')))) faltas[c.clave] = 'Escriba un número.'
    }
    const clave = valores[hoja.clave].trim()
    if (nueva && clave && usadas.has(clave)) faltas[hoja.clave] = `Ya hay una fila «${clave}» en esta hoja.`
    setErrores(faltas)
    if (!Object.keys(faltas).length) alAplicar(Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.trim() || null])))
  }

  return (
    <Dialogo titulo={`${hoja.nombre} · ${fila ? fila.clave : 'Fila nueva'}`} subtitulo={hoja.describe} alCerrar={alCerrar}
      pie={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            {alQuitar && !quitada && <Boton variante="secundario" className="text-coral-hondo" onClick={alQuitar}>
              {nueva ? 'Descartar la fila' : 'Quitar la fila'}
            </Boton>}
            {alDeshacer && <Boton variante="secundario" onClick={alDeshacer}>{quitada ? 'No quitarla' : 'Deshacer los cambios'}</Boton>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
            {!quitada && <Boton type="submit" form={base}>Aplicar</Boton>}
          </div>
        </div>
      }>
      {quitada && <div className="mb-4"><Aviso>Esta fila se quita al guardar los cambios.</Aviso></div>}
      <p className="mb-4 text-sm text-salvia">Los campos con * son obligatorios. Los cambios quedan pendientes hasta que los revise y guarde.</p>
      <form id={base} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault()
        aplicar()
      }}>
        {hoja.columnas.map((c, i) => {
          const id = `${base}-${i}`
          const fija = c.clave === hoja.clave && !nueva   // la primera columna es como el sistema reconoce la fila
          const p = {
            id, value: valores[c.clave], disabled: fija || quitada, 'aria-invalid': errores[c.clave] ? true : undefined,
            className: fija || quitada ? 'cursor-not-allowed bg-fondo text-salvia' : undefined,
            onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
              setValores((v) => ({ ...v, [c.clave]: e.target.value })),
          }
          const opciones = valores[c.clave] && !c.opciones.includes(valores[c.clave]) ? [...c.opciones, valores[c.clave]] : c.opciones
          return (
            <div key={c.clave} className={cn((c.largo || c.explica.length > 90) && 'sm:col-span-2')}>
              <Campo id={id} etiqueta={c.obligatoria ? `${c.titulo} *` : c.titulo} error={errores[c.clave]}
                ayuda={fija ? 'No se cambia: es como el sistema reconoce la fila.' : c.explica}>
                {c.opciones.length ? (
                  <Selector {...p}>
                    <option value="">—</option>
                    {opciones.map((o) => <option key={o}>{o}</option>)}
                  </Selector>
                ) : c.largo ? <Texto rows={3} {...p} /> : (
                  <Entrada {...p} autoComplete="off" type={c.tipo === 'fecha' ? 'date' : 'text'}
                    inputMode={c.tipo === 'numero' ? 'decimal' : undefined} list={c.lista ? `${base}-lista-${c.lista}` : undefined} />
                )}
              </Campo>
            </div>
          )
        })}
        {desde.map((h) => (
          <datalist key={h} id={`${base}-lista-${h}`}>{(listas[h] ?? []).map((o) => <option key={o} value={o} />)}</datalist>
        ))}
      </form>
    </Dialogo>
  )
}

function Revision({ edicion, hojas, alCerrar, alGuardar }: {
  edicion: Edicion; hojas: HojaVista[]; alCerrar: () => void; alGuardar: (v: VersionDiccionario) => void
}) {
  const [nota, setNota] = useState('')
  const revisar = useQuery({
    queryKey: ['diccionario', 'revisar', edicion],
    queryFn: () => pedir<Diferencias>('/diccionario/editar/revisar', { cuerpo: edicion }),
    retry: false,
    gcTime: 0,
  })
  const guardar = useMutation({
    mutationFn: () => pedir<VersionDiccionario>('/diccionario/editar', { cuerpo: { ...edicion, nota: nota.trim() || null } }),
    onSuccess: alGuardar,
  })
  const porHoja = Object.fromEntries(hojas.map((h) => [h.nombre, h]))
  const original = (c: CambioFila, columna: string) => {
    const h = porHoja[c.hoja]
    const f = h?.filas.find((x) => x[h.columnas.findIndex((k) => k.clave === h.clave)] === c.clave)
    return f ? f[h.columnas.findIndex((k) => k.clave === columna)] ?? null : null
  }
  const titulo = (c: CambioFila, columna: string) => porHoja[c.hoja]?.columnas.find((k) => k.clave === columna)?.titulo ?? columna
  const error = revisar.error ?? guardar.error
  const desactualizado = error instanceof ErrorApi && error.estado === 409
  // otra persona guardó una versión: se trae la nueva y, con ella, esta revisión se repite sobre la nueva
  const cliente = useQueryClient()
  useEffect(() => {
    if (desactualizado) void cliente.invalidateQueries({ queryKey: ['diccionario', 'versiones'] })
  }, [desactualizado, cliente])

  return (
    <Dialogo titulo="Revisar los cambios" subtitulo={`Sobre la versión vigente · ${edicion.cambios.length} fila${edicion.cambios.length === 1 ? '' : 's'}`}
      alCerrar={alCerrar}
      pie={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={alCerrar} disabled={guardar.isPending}>Seguir editando</Boton>
          {revisar.data && !desactualizado && (
            <Boton onClick={() => guardar.mutate()} disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar versión nueva'}</Boton>
          )}
        </div>
      }>
      <div className="space-y-4">
        <ul className="space-y-3 text-sm">
          {edicion.cambios.map((c) => (
            <li key={`${c.hoja}:${c.clave ?? c.valores[porHoja[c.hoja]?.clave ?? '']}`}>
              <p className="font-semibold">
                {c.hoja} · <span className="font-mono text-xs">{c.clave ?? c.valores[porHoja[c.hoja]?.clave ?? '']}</span>
                {c.accion !== 'editar' && <Insignia className="ml-2" tono={ESTADO_FILA[c.accion].tono}>{ESTADO_FILA[c.accion].texto}</Insignia>}
              </p>
              {c.accion === 'editar' && (
                <ul className="mt-1 space-y-0.5 pl-1">
                  {Object.entries(c.valores).map(([k, v]) => (
                    <li key={k}>
                      <span className="text-salvia">{titulo(c, k)}: </span>
                      <span>{original(c, k) ?? '(vacío)'} → {v ?? '(vacío)'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {revisar.isPending ? <Cargando texto="Revisando los cambios…" />
          : error ? (
            <Aviso>
              <span className="whitespace-pre-line">{error.message}</span>
            </Aviso>
          ) : revisar.data && (
            <>
              <DiferenciasDiccionario d={revisar.data} otrasColumnas={null} />
              <Campo id="nota-edicion" etiqueta="Nota (opcional)" ayuda="Qué cambió y por qué, para quien lo revise después.">
                <Entrada id="nota-edicion" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} />
              </Campo>
            </>
          )}
      </div>
    </Dialogo>
  )
}
