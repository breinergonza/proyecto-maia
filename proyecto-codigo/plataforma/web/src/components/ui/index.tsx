// Piezas de interfaz al estilo shadcn/ui: el código vive en el repositorio y usa los tokens de estilos.css.
import { forwardRef, useId, useLayoutEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'atencion'
const variantes: Record<Variante, string> = {
  primario: 'bg-teal text-white shadow-suave hover:bg-teal-medio hover:shadow-elevada disabled:bg-teal/50 disabled:shadow-none',
  secundario: 'border border-linea bg-papel text-tinta shadow-suave hover:border-teal/40 hover:text-teal disabled:opacity-50',
  fantasma: 'text-teal hover:bg-teal-tinte disabled:opacity-50',
  atencion: 'bg-coral-hondo text-white shadow-suave hover:bg-coral disabled:opacity-50',
}

export const Boton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; chico?: boolean }>(
  function Boton({ variante = 'primario', chico, className, type = 'button', ...p }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
          chico ? 'h-9 px-3 text-sm sm:h-8' : 'h-11 px-5 sm:h-10',
          variantes[variante],
          className,
        )}
        {...p}
      />
    )
  },
)

const control =
  'w-full rounded-control border border-linea bg-papel px-3.5 text-base text-tinta shadow-suave transition-[border-color,box-shadow] duration-200 placeholder:text-salvia/60 hover:border-teal/30 focus:border-teal focus:outline-none focus-visible:outline-none focus:ring-4 focus:ring-teal/10 aria-[invalid=true]:border-coral-hondo aria-[invalid=true]:focus:ring-coral/15'

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Entrada(
  { className, ...p }, ref) {
  return <input ref={ref} className={cn(control, 'h-11 sm:h-10', className)} {...p} />
})

export const Selector = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Selector(
  { className, ...p }, ref) {
  return <select ref={ref} className={cn(control, 'h-11 pr-8 sm:h-10', className)} {...p} />
})

export const Texto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Texto(
  { className, ...p }, ref) {
  return <textarea ref={ref} className={cn(control, 'py-2', className)} {...p} />
})

export function Campo({ etiqueta, error, aviso, ayuda, children, id }: {
  etiqueta: string; error?: string; aviso?: string; ayuda?: string; children: ReactNode; id: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-tinta/90">{etiqueta}</label>
      {children}
      {/* aviso: el valor se puede guardar, pero conviene revisarlo */}
      {!error && aviso && <p className="text-sm font-semibold text-ocre">{aviso}</p>}
      {error ? <p className="text-sm text-coral-hondo" role="alert">{error}</p>
        : ayuda ? <p className="text-sm text-salvia">{ayuda}</p> : null}
    </div>
  )
}

/** Panel con título opcional. `llenar`: ocupa el alto que le da su contenedor y desplaza su contenido por dentro. */
export function Panel({ titulo, descripcion, accion, children, className, llenar }: {
  titulo?: ReactNode; descripcion?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string; llenar?: boolean
}) {
  const idDescripcion = useId()
  return (
    <section aria-describedby={descripcion ? idDescripcion : undefined}
      className={cn('animate-aparecer rounded-panel border border-linea/80 bg-papel shadow-suave',
        llenar && 'flex min-h-0 flex-col', className)}>
      {(titulo || accion) && (
        <header className={cn('flex flex-wrap items-center justify-between gap-2 px-4 pt-4', llenar ? 'shrink-0 sm:px-5' : 'sm:px-6 sm:pt-5')}>
          {typeof titulo === 'string' ? <h2 className="text-base">{titulo}</h2> : titulo}
          {accion}
        </header>
      )}
      {descripcion && <p id={idDescripcion} className={cn('px-4 pt-1 text-sm text-salvia', llenar ? 'shrink-0 sm:px-5' : 'sm:px-6')}>{descripcion}</p>}
      <div className={llenar ? 'min-h-0 flex-1 overflow-auto p-4 sm:px-5' : 'p-4 sm:p-6'}>{children}</div>
    </section>
  )
}

type Tono = 'neutro' | 'teal' | 'coral' | 'ocre'
const tonos: Record<Tono, string> = {
  neutro: 'bg-fondo text-salvia border-linea',
  teal: 'bg-teal-tinte text-teal border-teal/20',
  coral: 'bg-coral-tinte text-coral-hondo border-coral/30',
  ocre: 'bg-ocre-tinte text-[#7a5717] border-ocre/30',
}
export function Insignia({ tono = 'neutro', children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', tonos[tono], className)}>
      {children}
    </span>
  )
}

/** El título de cada columna en sus celdas (data-etiqueta), para la tabla apilada del teléfono. Un encabezado vacío o
 *  marcado con data-acciones deja la celda sin título; uno solo para lectores de pantalla se usa tal cual. */
function etiquetar(tabla: HTMLTableElement) {
  const titulos = [...tabla.querySelectorAll('thead tr:last-child th')].map((th) => {
    if (th instanceof HTMLElement && th.dataset.acciones !== undefined) return ''
    const visible = [...th.childNodes].filter((n) => !(n instanceof HTMLElement && n.classList.contains('sr-only')))
      .map((n) => n.textContent).join('').trim()
    return visible || th.textContent?.trim() || ''
  })
  for (const fila of tabla.querySelectorAll('tbody tr')) {
    let i = 0
    for (const td of fila.children) {
      const ancho = (td as HTMLTableCellElement).colSpan || 1
      if (ancho > 1) td.setAttribute('data-ancha', '')   // una fila de detalle a todo lo ancho
      else td.setAttribute('data-etiqueta', titulos[i] ?? '')
      i += ancho
    }
  }
}

/** Tabla con el estilo de la aplicación. `densa`: filas más bajas, para paneles que deben caber en la ventana.
 *  `apilar`: en el teléfono cada fila se vuelve una tarjeta (para listas de registros; no para matrices de números). */
export function Tabla({ children, className, densa, apilar }: { children: ReactNode; className?: string; densa?: boolean; apilar?: boolean }) {
  const ref = useRef<HTMLTableElement>(null)
  useLayoutEffect(() => {
    if (!apilar || !ref.current) return
    const tabla = ref.current
    etiquetar(tabla)
    const observador = new MutationObserver(() => etiquetar(tabla))   // filas que llegan o cambian después
    observador.observe(tabla, { childList: true, subtree: true, characterData: true })
    return () => observador.disconnect()
  }, [apilar])
  return (
    <div className={cn('-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', apilar && 'tabla-apilada', className)}>
      <table ref={ref} className={cn(densa ? '[&_td]:px-2.5 [&_td]:py-1.5 [&_td]:leading-snug [&_th]:px-2.5' : '[&_td]:px-3 [&_td]:py-3 [&_th]:px-3',
        'w-full border-collapse text-sm [&_td]:border-b [&_td]:border-linea/70 [&_th]:border-b [&_th]:border-linea [&_th]:pb-2.5 [&_th]:pt-1 [&_th:not(.text-right)]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-salvia [&_th]:whitespace-nowrap [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-teal-tinte/40 [&_tbody_tr:last-child_td]:border-b-0')}>
        {children}
      </table>
    </div>
  )
}

/** Cifra con su explicación debajo. */
export function Cifra({ valor, texto, tono }: { valor: ReactNode; texto: string; tono?: 'coral' }) {
  return (
    <div>
      <div className={cn('text-2xl font-bold leading-tight tracking-tight sm:text-3xl', tono === 'coral' ? 'text-coral-hondo' : 'text-teal')}>{valor}</div>
      <div className="mt-1 text-sm leading-snug text-salvia">{texto}</div>
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <p className="flex items-center gap-3 py-6 text-salvia" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-teal/20 border-t-teal" aria-hidden />
      {texto}
    </p>
  )
}

export function Aviso({ children, tono = 'coral' }: { children: ReactNode; tono?: 'coral' | 'teal' }) {
  return (
    <div role={tono === 'coral' ? 'alert' : 'status'}
      className={cn('animate-aparecer rounded-control border px-4 py-3 text-sm',
        tono === 'coral' ? 'border-coral/40 bg-coral-tinte text-coral-hondo' : 'border-teal/25 bg-teal-tinte text-teal')}>
      {children}
    </div>
  )
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="animate-aparecer rounded-panel border border-dashed border-linea bg-papel/60 px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-teal-tinte" aria-hidden>
        <span className="size-2.5 rounded-full bg-teal/60" />
      </div>
      <p className="font-semibold">{titulo}</p>
      {children && <div className="mx-auto mt-1 max-w-[46ch] text-sm text-salvia">{children}</div>}
    </div>
  )
}

export function Paginador({ pagina, tamano, total, cambiar }: {
  pagina: number; tamano: number; total: number; cambiar: (p: number) => void
}) {
  const paginas = Math.max(1, Math.ceil(total / tamano))
  if (paginas <= 1) return null
  return (
    <nav className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Páginas">
      <span className="text-salvia">Página {pagina} de {paginas} · {total} en total</span>
      <div className="flex gap-2">
        <Boton chico variante="secundario" disabled={pagina <= 1} onClick={() => cambiar(pagina - 1)}>Anterior</Boton>
        <Boton chico variante="secundario" disabled={pagina >= paginas} onClick={() => cambiar(pagina + 1)}>Siguiente</Boton>
      </div>
    </nav>
  )
}

export function Encabezado({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-4 flex animate-aparecer flex-wrap items-end justify-between gap-3 lg:mb-5">
      <div className="max-w-[90ch]">
        <h1>{titulo}</h1>
        {children && <p className="mt-1 text-sm text-salvia">{children}</p>}
      </div>
      {accion}
    </div>
  )
}
