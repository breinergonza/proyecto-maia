// Marco de la aplicación: navegación lateral en escritorio, barra superior con cajón deslizable en el teléfono,
// aviso de demostración y contenido (que aparece con una transición corta al cambiar de página).
import {
  Baby, Bell, Calculator, ClipboardCheck, HeartPulse, LayoutDashboard, LogOut, Menu, Package, Play, Users, X,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import type { Rol } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { cn } from '../lib/cn'
import { esDemo } from '../lib/config'
import { ROLES } from '../lib/formato'
import { Cargando } from './ui'

type Enlace = { a: string; texto: string; icono: LucideIcon; roles?: Rol[] }

const SECCIONES: { titulo: string; enlaces: Enlace[] }[] = [
  {
    titulo: 'Seguimiento',
    enlaces: [{ a: '/', texto: 'Tablero', icono: LayoutDashboard }, { a: '/ninos', texto: 'Niños', icono: Baby }],
  },
  {
    titulo: 'Revisión clínica',
    enlaces: [
      { a: '/revision/datos', texto: 'Datos por revisar', icono: ClipboardCheck, roles: ['admin', 'experto'] },
      { a: '/revision/riesgos', texto: 'Revisión de riesgos', icono: HeartPulse, roles: ['admin', 'experto'] },
      { a: '/inferencia', texto: 'Calcular un niño', icono: Calculator, roles: ['admin', 'experto'] },
    ],
  },
  {
    titulo: 'Administración',
    enlaces: [
      { a: '/admin/modelos', texto: 'Modelos', icono: Package, roles: ['admin'] },
      { a: '/admin/corridas', texto: 'Corridas', icono: Play, roles: ['admin'] },
      { a: '/admin/usuarios', texto: 'Usuarios', icono: Users, roles: ['admin'] },
      { a: '/admin/notificaciones', texto: 'Notificaciones', icono: Bell, roles: ['admin'] },
    ],
  },
]

function Navegacion({ alElegir }: { alElegir?: () => void }) {
  const { usuario } = useSesion()
  return (
    <nav aria-label="Secciones" className="flex flex-col gap-6">
      {SECCIONES.map((s) => {
        const visibles = s.enlaces.filter((e) => !e.roles || puede(usuario, e.roles))
        if (!visibles.length) return null
        return (
          <div key={s.titulo}>
            <p className="mb-1.5 px-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-salvia/80">{s.titulo}</p>
            <ul className="flex flex-col gap-0.5">
              {visibles.map((e) => (
                <li key={e.a}>
                  <NavLink
                    to={e.a}
                    end={e.a === '/'}
                    onClick={alElegir}
                    className={({ isActive }) =>
                      cn('group flex items-center gap-3 rounded-control px-3 py-2.5 text-[0.95rem] text-tinta/75 transition-colors duration-200 hover:bg-fondo hover:text-tinta lg:py-2',
                        isActive && 'bg-teal-tinte font-semibold text-teal hover:bg-teal-tinte hover:text-teal')}
                  >
                    {({ isActive }) => (
                      <>
                        <e.icono size={18} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden
                          className={cn('shrink-0 transition-colors', isActive ? 'text-teal' : 'text-salvia group-hover:text-tinta')} />
                        {e.texto}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

/** Marca: una curva de crecimiento con su visita destacada. */
export function Marca({ claro }: { claro?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', claro ? 'bg-white/12' : 'bg-teal')} aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none">
          <path d="M3 17 L8 13 L12 14 L16 9 L21 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="9" r="2.4" fill="#D9694C" />
        </svg>
      </span>
      <div className="leading-tight">
        <p className={cn('font-bold tracking-tight', claro ? 'text-white' : 'text-tinta')}>Observatorio Canguro</p>
        <p className={cn('text-xs', claro ? 'text-white/65' : 'text-salvia')}>Alertas clínicas tempranas</p>
      </div>
    </div>
  )
}

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

function Usuario() {
  const { usuario, salir } = useSesion()
  if (!usuario) return null
  return (
    <div className="flex items-center gap-3 rounded-panel border border-linea bg-fondo/60 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal text-sm font-semibold text-white" aria-hidden>
        {iniciales(usuario.nombre)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{usuario.nombre}</p>
        <p className="truncate text-xs text-salvia">{ROLES[usuario.rol]}</p>
      </div>
      <button onClick={() => void salir()} title="Cerrar sesión"
        className="grid size-9 shrink-0 place-items-center rounded-control text-salvia transition-colors hover:bg-papel hover:text-coral-hondo">
        <LogOut size={17} aria-hidden /><span className="sr-only">Cerrar sesión</span>
      </button>
    </div>
  )
}

export function AvisoDemo() {
  if (!esDemo()) return null
  return (
    <div className="flex items-center justify-center gap-2 bg-coral-tinte px-4 py-2 text-center text-xs font-medium text-coral-hondo sm:text-sm">
      <span className="size-1.5 shrink-0 rounded-full bg-coral" aria-hidden />
      Demostración con niños simulados. Ningún dato corresponde a un niño real.
    </div>
  )
}

export function Marco({ children }: { children?: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const { pathname } = useLocation()

  // con el cajón abierto: Escape lo cierra y la página de fondo no se desplaza
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('keydown', cerrar)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', cerrar)
      document.body.style.overflow = ''
    }
  }, [abierto])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden border-r border-linea bg-papel px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-8">
        <div className="px-2"><Marca /></div>
        <div className="-mx-1 flex-1 overflow-y-auto px-1"><Navegacion /></div>
        <Usuario />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-linea/80 bg-papel/85 px-4 py-3 backdrop-blur-md lg:hidden">
        <Marca />
        <button className="grid size-10 place-items-center rounded-control text-tinta transition-colors hover:bg-fondo"
          onClick={() => setAbierto(true)} aria-expanded={abierto} aria-controls="menu-movil" aria-label="Abrir menú">
          <Menu size={22} aria-hidden />
        </button>
      </header>

      <div className={cn('fixed inset-0 z-40 lg:hidden', !abierto && 'pointer-events-none')} inert={!abierto}>
        <div onClick={() => setAbierto(false)}
          className={cn('absolute inset-0 bg-tinta/40 backdrop-blur-[2px] transition-opacity duration-300', abierto ? 'opacity-100' : 'opacity-0')} />
        <div id="menu-movil" role="dialog" aria-modal="true" aria-label="Menú"
          className={cn('absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col gap-6 bg-papel px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 shadow-elevada transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            abierto ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex items-center justify-between px-1">
            <Marca />
            <button className="grid size-10 place-items-center rounded-control text-salvia hover:bg-fondo"
              onClick={() => setAbierto(false)} aria-label="Cerrar menú">
              <X size={22} aria-hidden />
            </button>
          </div>
          <div className="-mx-1 flex-1 overflow-y-auto px-1"><Navegacion alElegir={() => setAbierto(false)} /></div>
          <Usuario />
        </div>
      </div>

      {/* en escritorio el contenido ocupa justo la ventana y se desplaza por dentro: las páginas pueden llenarla */}
      <div className="flex min-w-0 flex-col lg:h-dvh">
        <AvisoDemo />
        <main className="w-full flex-1 px-4 py-5 sm:px-6 lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:py-6">
          <div key={pathname} className="animate-aparecer lg:h-full">
            <Suspense fallback={<Cargando />}>{children ?? <Outlet />}</Suspense>
          </div>
        </main>
        <footer className="w-full shrink-0 px-4 pb-4 text-xs text-salvia sm:px-6 lg:border-t lg:border-linea lg:px-8 lg:py-2">
          Apoyo a la decisión, no diagnóstico. El riesgo ordena a los niños; la decisión es del equipo clínico.
        </footer>
      </div>
    </div>
  )
}
