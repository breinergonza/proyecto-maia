// Lista de niños. Clic en un encabezado ordena (lo hace la API, sobre todos los niños); arrastrar un encabezado, o el
// menú «Columnas», cambia el orden de las columnas, que se recuerda en este navegador.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, Columns3, GripVertical, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { pedir } from '../api/cliente'
import type { NinoFila, Pagina, ResumenTablero } from '../api/tipos'
import { Boton, Cargando, Encabezado, Entrada, Insignia, Paginador, Selector, Vacio } from '../components/ui'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { cn } from '../lib/cn'
import { dec, edad, fecha, num, RIESGO_ALTO } from '../lib/formato'
import { ayudaPosicion, AYUDA_OMS, BAJO_EDAD, CAYO, esAlto, nivelCorto, RIESGO_MUY_ALTO } from '../lib/lenguaje'

const TAMANOS = [10, 25, 50, 100]
const TAMANO = 25
const GUARDADO = 'maia.ninos.columnas'

type Columna = {
  id: string
  titulo: string
  derecha?: boolean
  /** sentido del primer clic: los números empiezan por el mayor */
  primero: 'asc' | 'desc'
  celda: (n: NinoFila) => ReactNode
}

const COLUMNAS: Columna[] = [
  {
    id: 'sujeto', titulo: 'Niño', primero: 'asc',
    celda: (n) => <Link className="font-semibold text-teal underline-offset-2 hover:underline" to={`/ninos/${encodeURIComponent(n.sujeto)}`}>{n.sujeto}</Link>,
  },
  // el nivel de riesgo va justo después del niño: en el teléfono es lo que se ve sin desplazarse de lado
  {
    id: 'percentil_max', titulo: 'Nivel de riesgo', primero: 'desc',
    celda: (n) => (n.percentil_max == null ? '—' : esAlto(n.percentil_max)
      ? <span title={ayudaPosicion(n.percentil_max)}><Insignia tono="coral">{nivelCorto(n.percentil_max)}</Insignia></span>
      : <span title={ayudaPosicion(n.percentil_max)} className="whitespace-nowrap">{nivelCorto(n.percentil_max)}</span>),
  },
  {
    id: 'desenlace_max', titulo: 'Riesgo más alto', primero: 'asc',
    celda: (n) => <>{n.desenlace_max ?? <span className="text-salvia">Sin riesgo calculado</span>}{n.n_riesgos > 1 && <span className="text-salvia"> y {n.n_riesgos - 1} más</span>}</>,
  },
  {
    id: 'n_alertas', titulo: 'Datos por revisar', derecha: true, primero: 'desc',
    celda: (n) => (n.n_alertas ? <span className="font-semibold">{num(n.n_alertas)}</span> : '—'),
  },
  {
    id: 'eg_semanas', titulo: 'Edad gestacional', derecha: true, primero: 'asc',
    celda: (n) => (n.eg_semanas == null ? '—' : `${dec(n.eg_semanas)} sem`),
  },
  {
    id: 'crecimiento', titulo: 'Crecimiento', primero: 'desc',
    celda: (n) => (
      <span className="flex flex-wrap gap-1">
        {n.n_bajo_2de > 0 && <span title={AYUDA_OMS}><Insignia tono="ocre">{BAJO_EDAD} ×{n.n_bajo_2de}</Insignia></span>}
        {n.n_caida_1de > 0 && <span title={`${CAYO}. ${AYUDA_OMS}`}><Insignia>Cayó ×{n.n_caida_1de}</Insignia></span>}
        {!n.n_bajo_2de && !n.n_caida_1de && (n.n_crecimiento > 0
          ? <span className="text-teal" title={`${num(n.n_crecimiento)} medidas, ninguna baja para la edad ni con caída. ${AYUDA_OMS}`}>Sin alerta</span>
          : <span className="text-salvia" title="No hay peso, talla ni perímetro con que compararlo">Sin dato</span>)}
      </span>
    ),
  },
  // la última visita con algún dato (la misma que cierra la ficha) y la edad corregida de ese día; ordena por visita
  {
    id: 'ultimo_control', titulo: 'Último control', derecha: true, primero: 'desc',
    celda: (n) => (n.ultima_visita == null ? <span className="text-salvia">Sin controles</span> : (
      <span className="whitespace-nowrap">
        {n.ultima_visita.replace(' (edad corregida)', '')}
        <span className="block text-xs text-salvia">
          {n.ultima_edad_corregida != null ? `${edad(n.ultima_edad_corregida)} de edad corregida` : fecha(n.ultima_fecha)}
        </span>
      </span>
    )),
  },
]
const POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]))
const ORDEN_INICIAL = COLUMNAS.map((c) => c.id)

function leerOrden(): string[] {
  try {
    const guardado = JSON.parse(localStorage.getItem(GUARDADO) ?? 'null') as unknown
    if (Array.isArray(guardado)) {
      // el orden guardado, sin columnas que ya no existen y con las nuevas al final
      const propio = guardado.filter((id): id is string => typeof id === 'string' && POR_ID.has(id))
      return [...new Set([...propio, ...ORDEN_INICIAL])]
    }
  } catch { /* sin almacenamiento: el orden de siempre */ }
  return ORDEN_INICIAL
}

function guardarOrden(orden: string[]) {
  try { localStorage.setItem(GUARDADO, JSON.stringify(orden)) } catch { /* se pierde al recargar, nada más */ }
}

function mover<T>(lista: T[], desde: number, hasta: number): T[] {
  const copia = [...lista]
  const [x] = copia.splice(desde, 1)
  copia.splice(hasta, 0, x)
  return copia
}

export default function Ninos() {
  const [params, setParams] = useSearchParams()
  const buscar = params.get('buscar') ?? ''
  const desenlace = params.get('desenlace') ?? ''
  const percentil = params.get('percentil_min') ?? ''
  const pagina = Number(params.get('pagina') ?? 1)
  const tamano = TAMANOS.includes(Number(params.get('tamano'))) ? Number(params.get('tamano')) : TAMANO
  const orden = POR_ID.has(params.get('orden') ?? '') ? params.get('orden')! : ''
  const dir = params.get('dir') === 'asc' ? 'asc' : 'desc'
  const [texto, setTexto] = useState(buscar)
  const [columnas, setColumnas] = useState<string[]>(leerOrden)

  const cambiar = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    if (!('pagina' in cambios)) p.delete('pagina')
    setParams(p, { replace: true })
  }

  useEffect(() => {
    const t = setTimeout(() => texto !== buscar && cambiar({ buscar: texto.trim() }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  const reordenar = (nuevo: string[]) => {
    setColumnas(nuevo)
    guardarOrden(nuevo)
  }

  const ordenarPor = (c: Columna) => {
    if (orden !== c.id) cambiar({ orden: c.id, dir: c.primero })
    else cambiar({ orden: c.id, dir: dir === 'asc' ? 'desc' : 'asc' })
  }

  const desenlaces = useQuery({ queryKey: ['tablero', 'resumen'], queryFn: () => pedir<ResumenTablero>('/tablero/resumen') })
  const q = useQuery({
    queryKey: ['ninos', buscar, desenlace, percentil, pagina, tamano, orden, dir],
    queryFn: () => pedir<Pagina<NinoFila>>('/ninos', {
      params: { buscar, desenlace, percentil_min: percentil, pagina, tamano, orden, dir: orden ? dir : '' },
    }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex flex-col lg:h-full">
      <Encabezado titulo="Niños">
        Por defecto, ordenados por su riesgo más alto con los datos más recientes. Los códigos están seudonimizados: para saber quién es
        un niño hay que consultar la base de la Fundación.
      </Encabezado>

      <div className="mb-4 grid grid-cols-1 shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_16rem_14rem_auto]">
        <label className="sr-only" htmlFor="buscar">Buscar por código</label>
        <Entrada id="buscar" placeholder="Buscar por código" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <label className="sr-only" htmlFor="desenlace">Desenlace</label>
        <Selector id="desenlace" value={desenlace} onChange={(e) => cambiar({ desenlace: e.target.value })}>
          <option value="">Todos los desenlaces</option>
          {desenlaces.data?.riesgos_por_desenlace.map((d) => <option key={d.clave} value={d.clave}>{d.desenlace}</option>)}
        </Selector>
        <label className="sr-only" htmlFor="percentil">Nivel de riesgo</label>
        <Selector id="percentil" value={percentil} onChange={(e) => cambiar({ percentil_min: e.target.value })}>
          <option value="">Cualquier riesgo</option>
          <option value={RIESGO_ALTO}>Riesgo alto (el {100 - RIESGO_ALTO} % con más riesgo)</option>
          <option value={RIESGO_MUY_ALTO}>Riesgo muy alto (el {100 - RIESGO_MUY_ALTO} % con más riesgo)</option>
          <option value="0">Con algún riesgo calculado</option>
        </Selector>
        <MenuColumnas columnas={columnas} reordenar={reordenar} />
      </div>

      {q.isPending ? <Cargando /> : q.error ? <ErrorConReintento error={q.error} que="la lista de niños" conserva="Los filtros siguen en la dirección: al reintentar se pide la misma lista." reintentando={q.isFetching} reintentar={() => void q.refetch()} /> : q.data.items.length === 0 ? (
        <Vacio titulo="Ningún niño cumple estos filtros">Quite un filtro o busque otro código.</Vacio>
      ) : (
        <section className="flex animate-aparecer flex-col rounded-panel border border-linea/80 bg-papel shadow-suave lg:min-h-0 lg:flex-1">
          <Grilla filas={q.data.items} columnas={columnas} reordenar={reordenar} orden={orden} dir={dir} ordenarPor={ordenarPor} />
          <div className="flex shrink-0 flex-col gap-3 border-t border-linea px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-salvia">
              Filas por página
              <Selector className="h-9 w-24 sm:h-8" value={tamano} onChange={(e) => cambiar({ tamano: e.target.value === String(TAMANO) ? '' : e.target.value })}>
                {TAMANOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Selector>
            </label>
            <div className="[&>nav]:mt-0">
              <Paginador pagina={pagina} tamano={tamano} total={q.data.total} cambiar={(p) => cambiar({ pagina: String(p) })} />
              {q.data.total <= tamano && <span className="text-sm text-salvia">{num(q.data.total)} en total</span>}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

// la primera columna queda fija al desplazarse de lado (en el teléfono no se pierde de qué niño es la fila)
const FIJA = 'first:sticky first:left-0 first:z-[1] first:bg-papel first:shadow-[inset_-1px_0_0_var(--color-linea)]'

function Grilla({ filas, columnas, reordenar, orden, dir, ordenarPor }: {
  filas: NinoFila[]; columnas: string[]; reordenar: (c: string[]) => void
  orden: string; dir: 'asc' | 'desc'; ordenarPor: (c: Columna) => void
}) {
  const [arrastrada, setArrastrada] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const cols = columnas.map((id) => POR_ID.get(id)!)

  const soltar = (destino: string) => {
    if (arrastrada && arrastrada !== destino) reordenar(mover(columnas, columnas.indexOf(arrastrada), columnas.indexOf(destino)))
    setArrastrada(null)
    setSobre(null)
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-papel">
          <tr>
            {cols.map((c) => {
              const activa = orden === c.id
              const Icono = activa ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
              return (
                <th key={c.id} scope="col" draggable
                  aria-sort={activa ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onDragStart={(e) => { setArrastrada(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id) }}
                  onDragOver={(e) => { e.preventDefault(); setSobre(c.id) }}
                  onDragLeave={() => setSobre((s) => (s === c.id ? null : s))}
                  onDrop={(e) => { e.preventDefault(); soltar(c.id) }}
                  onDragEnd={() => { setArrastrada(null); setSobre(null) }}
                  className={cn('group border-b border-linea px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-salvia transition-colors',
                    FIJA, 'first:z-20',
                    c.derecha ? 'text-right' : 'text-left',
                    arrastrada === c.id && 'opacity-40',
                    sobre === c.id && arrastrada !== c.id && 'bg-teal-tinte shadow-[inset_2px_0_0_var(--color-teal)]')}>
                  <span className={cn('inline-flex items-center gap-1', c.derecha && 'flex-row-reverse')}>
                    <GripVertical size={14} aria-hidden className="hidden cursor-grab text-salvia/40 group-hover:text-salvia sm:block" />
                    <button type="button" onClick={() => ordenarPor(c)} title={`Ordenar por ${c.titulo.toLowerCase()}`}
                      className={cn('inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wider hover:text-tinta', c.derecha ? 'text-right' : 'text-left', activa && 'text-teal')}>
                      {c.titulo}
                      <Icono size={13} aria-hidden className={cn(!activa && 'opacity-40 group-hover:opacity-100')} />
                    </button>
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {filas.map((n) => (
            <tr key={n.sujeto} className="transition-colors hover:bg-teal-tinte/40">
              {cols.map((c) => (
                <td key={c.id} className={cn('border-b border-linea/70 px-3 py-3', FIJA, c.derecha && 'text-right')}>{c.celda(n)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Orden de las columnas sin arrastrar: sirve en el teléfono y con el teclado. */
function MenuColumnas({ columnas, reordenar }: { columnas: string[]; reordenar: (c: string[]) => void }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false)
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div ref={caja} className="relative">
      <Boton variante="secundario" className="w-full xl:w-auto" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <Columns3 size={17} aria-hidden /> Columnas
      </Boton>
      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-72 animate-aparecer rounded-panel border border-linea bg-papel p-3 shadow-elevada">
          <p className="mb-2 px-1 text-xs text-salvia">Cambie el orden con las flechas o arrastrando los encabezados.</p>
          <ol className="space-y-1">
            {columnas.map((id, i) => (
              <li key={id} className="flex items-center justify-between gap-2 rounded-control px-2 py-1.5 hover:bg-fondo">
                <span className="text-sm">{POR_ID.get(id)!.titulo}</span>
                <span className="flex gap-1">
                  <button type="button" disabled={i === 0} onClick={() => reordenar(mover(columnas, i, i - 1))}
                    aria-label={`Subir ${POR_ID.get(id)!.titulo}`}
                    className="grid size-8 place-items-center rounded-control text-salvia hover:bg-papel hover:text-tinta disabled:opacity-30">
                    <ChevronUp size={16} aria-hidden />
                  </button>
                  <button type="button" disabled={i === columnas.length - 1} onClick={() => reordenar(mover(columnas, i, i + 1))}
                    aria-label={`Bajar ${POR_ID.get(id)!.titulo}`}
                    className="grid size-8 place-items-center rounded-control text-salvia hover:bg-papel hover:text-tinta disabled:opacity-30">
                    <ChevronDown size={16} aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => reordenar(ORDEN_INICIAL)}
            className="mt-2 inline-flex items-center gap-1.5 px-1 text-sm font-semibold text-teal hover:underline">
            <RotateCcw size={14} aria-hidden /> Restablecer
          </button>
        </div>
      )}
    </div>
  )
}
