// Grupo desplegable del menú lateral: un enlace al primer submódulo y un botón que abre o cierra la lista. Se abre solo
// cuando la ruta actual cuelga del grupo.
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '../lib/cn'

export type Hijo = { a: string; texto: string; extra?: ReactNode }

export function GrupoNav({ a, texto, icono: Icono, hijos, alElegir, insignia, compacto, filtrando }: {
  a: string; texto: string; icono: LucideIcon; hijos: Hijo[]; alElegir?: () => void; insignia?: ReactNode; compacto?: boolean; filtrando?: boolean
}) {
  const { pathname } = useLocation()
  const dentro = pathname === a || pathname.startsWith(`${a}/`) || hijos.some((h) => pathname.startsWith(h.a))
  // null: sigue a la ruta (abierto si la página cuelga del grupo); true/false: lo que el usuario eligió con el botón
  const [elegido, setElegido] = useState<boolean | null>(null)
  useEffect(() => setElegido(null), [pathname])   // al navegar, el grupo vuelve a seguir a la ruta
  const visible = filtrando || (elegido ?? dentro)   // al filtrar, el grupo muestra sus coincidencias
  if (compacto) {   // menú plegado: solo el icono, que lleva al primer submódulo
    return (
      <li>
        <NavLink to={hijos[0]?.a ?? a} onClick={alElegir} title={texto} aria-label={texto}
          className={cn('relative grid h-10 place-items-center rounded-control transition-colors', dentro ? 'bg-teal-tinte text-teal' : 'text-salvia hover:bg-fondo hover:text-tinta')}>
          <Icono size={18} strokeWidth={dentro ? 2.25 : 1.75} aria-hidden />
          {insignia && <span className="absolute right-2 top-2 size-2 rounded-full bg-ocre" aria-hidden />}
        </NavLink>
      </li>
    )
  }
  return (
    <li>
      <div className={cn('flex items-center rounded-control transition-colors', dentro ? 'bg-teal-tinte text-teal' : 'text-tinta/75 hover:bg-fondo hover:text-tinta')}>
        <NavLink to={hijos[0]?.a ?? a} onClick={alElegir}
          className={cn('flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-[0.95rem] lg:py-2', dentro && 'font-semibold')}>
          <Icono size={18} strokeWidth={dentro ? 2.25 : 1.75} aria-hidden className={cn('shrink-0', dentro ? 'text-teal' : 'text-salvia')} />
          {texto}
          {insignia}
        </NavLink>
        <button type="button" aria-expanded={visible} disabled={filtrando} aria-label={`${visible ? 'Plegar' : 'Desplegar'} ${texto}`}
          onClick={() => setElegido(!visible)} className="grid size-9 shrink-0 place-items-center rounded-control disabled:opacity-40">
          <ChevronDown size={16} aria-hidden className={cn('transition-transform', visible && 'rotate-180')} />
        </button>
      </div>
      {visible && (
        <ul className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-linea pl-2">
          {hijos.map((h) => (
            <li key={h.a}>
              <NavLink to={h.a} onClick={alElegir}
                className={({ isActive }) => cn('block rounded-control px-3 py-1.5 text-sm text-tinta/75 transition-colors hover:bg-fondo hover:text-tinta',
                  isActive && 'bg-teal-tinte font-semibold text-teal hover:bg-teal-tinte hover:text-teal')}>
                {h.texto}{h.extra}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
