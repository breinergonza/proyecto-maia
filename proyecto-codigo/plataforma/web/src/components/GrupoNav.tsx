// Grupo desplegable del menú lateral: un enlace al primer submódulo y un botón que abre o cierra la lista. Se abre solo
// cuando la ruta actual cuelga del grupo.
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { cn } from '../lib/cn'

export type Hijo = { a: string; texto: string }

export function GrupoNav({ a, texto, icono: Icono, hijos, alElegir }: {
  a: string; texto: string; icono: LucideIcon; hijos: Hijo[]; alElegir?: () => void
}) {
  const { pathname } = useLocation()
  const dentro = pathname === a || pathname.startsWith(`${a}/`) || hijos.some((h) => pathname.startsWith(h.a))
  const [abierto, setAbierto] = useState(false)
  const visible = dentro || abierto
  return (
    <li>
      <div className={cn('flex items-center rounded-control transition-colors', dentro ? 'bg-teal-tinte text-teal' : 'text-tinta/75 hover:bg-fondo hover:text-tinta')}>
        <NavLink to={hijos[0]?.a ?? a} onClick={alElegir}
          className={cn('flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-[0.95rem] lg:py-2', dentro && 'font-semibold')}>
          <Icono size={18} strokeWidth={dentro ? 2.25 : 1.75} aria-hidden className={cn('shrink-0', dentro ? 'text-teal' : 'text-salvia')} />
          {texto}
        </NavLink>
        <button type="button" aria-expanded={visible} aria-label={`${visible ? 'Plegar' : 'Desplegar'} ${texto}`} disabled={dentro}
          onClick={() => setAbierto(!abierto)} className="grid size-9 shrink-0 place-items-center rounded-control disabled:opacity-40">
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
                {h.texto}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
