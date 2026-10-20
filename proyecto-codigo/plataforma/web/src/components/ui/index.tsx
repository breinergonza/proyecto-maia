// Piezas de interfaz al estilo shadcn/ui: el código vive en el repositorio y usa los tokens de estilos.css.
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'atencion'
const variantes: Record<Variante, string> = {
  primario: 'bg-teal text-white hover:bg-teal-medio disabled:bg-teal/50',
  secundario: 'border border-linea bg-papel text-tinta hover:border-teal hover:text-teal disabled:opacity-50',
  fantasma: 'text-teal hover:bg-teal-tinte disabled:opacity-50',
  atencion: 'bg-coral-hondo text-white hover:bg-coral disabled:opacity-50',
}

export const Boton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; chico?: boolean }>(
  function Boton({ variante = 'primario', chico, className, type = 'button', ...p }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors disabled:cursor-not-allowed',
          chico ? 'h-8 px-3 text-sm' : 'h-10 px-4',
          variantes[variante],
          className,
        )}
        {...p}
      />
    )
  },
)

const control =
  'w-full rounded-control border border-linea bg-papel px-3 text-tinta placeholder:text-salvia/70 focus:border-teal focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-teal/25 aria-[invalid=true]:border-coral-hondo'

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Entrada(
  { className, ...p }, ref) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...p} />
})

export const Selector = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Selector(
  { className, ...p }, ref) {
  return <select ref={ref} className={cn(control, 'h-10 pr-8', className)} {...p} />
})

export const Texto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Texto(
  { className, ...p }, ref) {
  return <textarea ref={ref} className={cn(control, 'py-2', className)} {...p} />
})

export function Campo({ etiqueta, error, ayuda, children, id }: {
  etiqueta: string; error?: string; ayuda?: string; children: ReactNode; id: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold">{etiqueta}</label>
      {children}
      {error ? <p className="text-sm text-coral-hondo" role="alert">{error}</p>
        : ayuda ? <p className="text-sm text-salvia">{ayuda}</p> : null}
    </div>
  )
}

export function Panel({ titulo, accion, children, className }: {
  titulo?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={cn('rounded-panel border border-linea bg-papel', className)}>
      {(titulo || accion) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-5 py-3">
          {typeof titulo === 'string' ? <h2 className="text-base">{titulo}</h2> : titulo}
          {accion}
        </header>
      )}
      <div className="p-5">{children}</div>
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

export function Tabla({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm [&_td]:border-b [&_td]:border-linea [&_td]:px-3 [&_td]:py-2 [&_th]:border-b-2 [&_th]:border-linea [&_th]:px-3 [&_th]:py-2 [&_th:not(.text-right)]:text-left [&_th]:font-semibold [&_th]:text-salvia [&_tbody_tr:hover]:bg-fondo">
        {children}
      </table>
    </div>
  )
}

/** Cifra con su explicación debajo. */
export function Cifra({ valor, texto, tono }: { valor: ReactNode; texto: string; tono?: 'coral' }) {
  return (
    <div>
      <div className={cn('text-2xl font-bold leading-tight', tono === 'coral' ? 'text-coral-hondo' : 'text-teal')}>{valor}</div>
      <div className="text-sm text-salvia">{texto}</div>
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <p className="py-6 text-salvia" role="status">{texto}</p>
}

export function Aviso({ children, tono = 'coral' }: { children: ReactNode; tono?: 'coral' | 'teal' }) {
  return (
    <div role={tono === 'coral' ? 'alert' : 'status'}
      className={cn('rounded-control border px-4 py-3 text-sm',
        tono === 'coral' ? 'border-coral/40 bg-coral-tinte text-coral-hondo' : 'border-teal/25 bg-teal-tinte text-teal')}>
      {children}
    </div>
  )
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-linea px-6 py-10 text-center">
      <p className="font-semibold">{titulo}</p>
      {children && <div className="mt-1 text-sm text-salvia">{children}</div>}
    </div>
  )
}

export function Paginador({ pagina, tamano, total, cambiar }: {
  pagina: number; tamano: number; total: number; cambiar: (p: number) => void
}) {
  const paginas = Math.max(1, Math.ceil(total / tamano))
  if (paginas <= 1) return null
  return (
    <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Páginas">
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[70ch]">
        <h1>{titulo}</h1>
        {children && <p className="mt-1 text-salvia">{children}</p>}
      </div>
      {accion}
    </div>
  )
}
