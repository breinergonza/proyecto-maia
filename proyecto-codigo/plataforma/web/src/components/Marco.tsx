// Marco de la aplicación: navegación lateral (arriba en pantallas chicas), aviso de demostración y contenido.
import { LogOut, Menu, X } from 'lucide-react'
import { Suspense, useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import type { Rol } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { cn } from '../lib/cn'
import { esDemo } from '../lib/config'
import { ROLES } from '../lib/formato'

const SECCIONES: { titulo: string; enlaces: { a: string; texto: string; roles?: Rol[] }[] }[] = [
  { titulo: 'Seguimiento', enlaces: [{ a: '/', texto: 'Tablero' }, { a: '/ninos', texto: 'Niños' }] },
  {
    titulo: 'Revisión clínica',
    enlaces: [
      { a: '/revision/datos', texto: 'Datos por revisar', roles: ['admin', 'experto'] },
      { a: '/revision/riesgos', texto: 'Revisión de riesgos', roles: ['admin', 'experto'] },
      { a: '/inferencia', texto: 'Calcular un niño', roles: ['admin', 'experto'] },
    ],
  },
  {
    titulo: 'Administración',
    enlaces: [
      { a: '/admin/modelos', texto: 'Modelos', roles: ['admin'] },
      { a: '/admin/corridas', texto: 'Corridas', roles: ['admin'] },
      { a: '/admin/usuarios', texto: 'Usuarios', roles: ['admin'] },
      { a: '/admin/notificaciones', texto: 'Notificaciones', roles: ['admin'] },
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
            <p className="mb-1 px-3 text-sm text-white/60">{s.titulo}</p>
            <ul className="flex flex-col">
              {visibles.map((e) => (
                <li key={e.a}>
                  <NavLink
                    to={e.a}
                    end={e.a === '/'}
                    onClick={alElegir}
                    className={({ isActive }) =>
                      cn('block rounded-control px-3 py-1.5 text-white/90 hover:bg-white/10',
                        isActive && 'bg-white/12 font-semibold text-white shadow-[inset_3px_0_0_var(--color-coral)]')}
                  >
                    {e.texto}
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

function Marca() {
  return (
    <div className="leading-tight">
      <p className="text-lg font-bold text-white">Observatorio Canguro</p>
      <p className="text-sm text-white/65">Alertas clínicas tempranas</p>
    </div>
  )
}

function Usuario() {
  const { usuario, salir } = useSesion()
  if (!usuario) return null
  return (
    <div className="border-t border-white/15 pt-4 text-sm text-white/80">
      <p className="font-semibold text-white">{usuario.nombre}</p>
      <p>{ROLES[usuario.rol]}</p>
      <button onClick={() => void salir()} className="mt-3 inline-flex items-center gap-2 rounded-control px-2 py-1 -ml-2 hover:bg-white/10">
        <LogOut size={16} aria-hidden /> Cerrar sesión
      </button>
    </div>
  )
}

export function AvisoDemo() {
  if (!esDemo()) return null
  return (
    <div className="bg-coral-tinte px-4 py-2 text-center text-sm text-coral-hondo">
      Demostración con niños simulados. Ningún dato corresponde a un niño real.
    </div>
  )
}

export function Marco({ children }: { children?: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden bg-teal px-4 py-6 lg:flex lg:min-h-screen lg:flex-col lg:gap-8 lg:sticky lg:top-0 lg:h-screen">
        <Marca />
        <div className="flex-1 overflow-y-auto"><Navegacion /></div>
        <Usuario />
      </aside>
      <div className="lg:hidden">
        <div className="flex items-center justify-between bg-teal px-4 py-3">
          <Marca />
          <button className="rounded-control p-2 text-white hover:bg-white/10" onClick={() => setAbierto((a) => !a)}
            aria-expanded={abierto} aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}>
            {abierto ? <X aria-hidden /> : <Menu aria-hidden />}
          </button>
        </div>
        {abierto && (
          <div className="flex flex-col gap-6 bg-teal-hondo px-4 pb-6 pt-2">
            <Navegacion alElegir={() => setAbierto(false)} />
            <Usuario />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <AvisoDemo />
        <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8"><Suspense fallback={<p className="py-6 text-salvia" role="status">Cargando…</p>}>{children ?? <Outlet />}</Suspense></main>
        <footer className="mx-auto max-w-[1200px] px-4 pb-8 text-sm text-salvia sm:px-8">
          Apoyo a la decisión, no diagnóstico. El riesgo ordena a los niños; la decisión es del equipo clínico.
        </footer>
      </div>
    </div>
  )
}
