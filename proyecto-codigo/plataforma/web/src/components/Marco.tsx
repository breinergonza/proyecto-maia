// Marco de la aplicación: navegación lateral en escritorio, barra superior con cajón deslizable en el teléfono,
// aviso de demostración y contenido (que aparece con una transición corta al cambiar de página).
import {
  Baby, BookOpen, BrainCircuit, ClipboardCheck, HeartPulse, LayoutDashboard, LogOut, Menu,
  BellRing, Mail, Package, PanelLeftClose, PanelLeftOpen, Search, Settings, Users, X,
  Activity, Compass, LineChart, type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import type { Rol } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { cn } from '../lib/cn'
import { esDemo } from '../lib/config'
import { usePorClasificar } from '../lib/diccionario'
import { ROLES } from '../lib/formato'
import { useTituloPagina } from '../lib/useTituloPagina'
import { SUBMODULOS } from '../paginas/analitica/submodulos'
import { AvisoSesion } from './AvisoSesion'
import { BuscarMenu, coincide, normalizar, type Destino } from './BuscarMenu'
import { enMarcha, useEntrenamientos } from './EntrenarAhora'
import { GrupoNav, type Hijo } from './GrupoNav'
import { LimiteError } from './LimiteError'
import { Cargando, Insignia } from './ui'

type Enlace = { a: string; texto: string; icono: LucideIcon; roles?: Rol[]; hijos?: Hijo[] }

const ANALITICA: Enlace = {
  a: '/analitica', texto: 'Analítica', icono: Activity, roles: ['admin', 'experto', 'visualizador'],
  hijos: SUBMODULOS.map((s) => ({ a: `/analitica/${s.id}`, texto: s.texto })),
}

const SECCIONES: { titulo: string; enlaces: Enlace[] }[] = [
  {
    titulo: 'Seguimiento',
    enlaces: [{ a: '/', texto: 'Tablero', icono: LayoutDashboard },
      { a: '/explorar', texto: 'Explorar', icono: Compass, roles: ['admin', 'experto', 'visualizador'] }, { a: '/ninos', texto: 'Niños', icono: Baby }, ANALITICA],
  },
  {
    titulo: 'Revisión clínica',
    enlaces: [
      { a: '/revision/riesgos', texto: 'Revisión de riesgos', icono: HeartPulse, roles: ['admin', 'experto'] },
      { a: '/prediccion', texto: 'Predicción', icono: LineChart, roles: ['admin', 'experto'] },
      { a: '/mis-modelos', texto: 'Mis modelos', icono: BrainCircuit, roles: ['admin', 'experto'] },
      { a: '/diccionario', texto: 'Diccionario', icono: BookOpen, roles: ['admin', 'experto'] },
    ],
  },
  {
    titulo: 'Notificaciones',
    enlaces: [
      { a: '/notificaciones/servidor', texto: 'Servidor de correo', icono: Mail, roles: ['admin'] },
      { a: '/notificaciones/alertas', texto: 'Alertas', icono: BellRing, roles: ['admin'] },
    ],
  },
  {
    titulo: 'Administración',
    enlaces: [
      { a: '/admin/calidad-datos', texto: 'Calidad de datos', icono: ClipboardCheck, roles: ['admin'] },
      {
        a: '/admin/configuracion', texto: 'Configuración', icono: Settings, roles: ['admin'],
        hijos: [
          { a: '/admin/configuracion', texto: 'General' },
          { a: '/admin/programacion', texto: 'Programación' },
        ],
      },
      {
        a: '/admin/modelos-y-corridas', texto: 'Modelos y corridas', icono: Package, roles: ['admin'],
        hijos: [
          { a: '/admin/entrenamientos', texto: 'Entrenamientos' },
          { a: '/admin/modelos', texto: 'Modelos' },
          { a: '/admin/corridas', texto: 'Corridas' },
        ],
      },
      { a: '/admin/usuarios', texto: 'Usuarios', icono: Users, roles: ['admin'] },
    ],
  },
]

/** Opciones del menú a las que el usuario puede entrar (las de los grupos, con su grupo), para el buscador. */
function useDestinos(): Destino[] {
  const { usuario } = useSesion()
  return SECCIONES.flatMap((s) => s.enlaces)
    .filter((e) => !e.roles || puede(usuario, e.roles))
    .flatMap((e) => e.hijos ? e.hijos.map((h) => ({ a: h.a, texto: h.texto, grupo: e.texto })) : [{ a: e.a, texto: e.texto }])
}

function Navegacion({ alElegir, compacto, filtro = '' }: { alElegir?: () => void; compacto?: boolean; filtro?: string }) {
  const { usuario } = useSesion()
  const entrenando = enMarcha(useEntrenamientos(puede(usuario, ['admin'])).data?.[0])
  const porClasificar = usePorClasificar(puede(usuario, ['admin', 'experto'])).data?.total ?? 0
  return (
    <nav aria-label="Secciones" className={cn('flex flex-col', compacto ? 'gap-3' : 'gap-4')}>
      {SECCIONES.map((s) => {
        const visibles = s.enlaces.filter((e) => !e.roles || puede(usuario, e.roles))
          .map((e) => {   // con filtro: la opción debe coincidir; en un grupo, él o alguno de sus hijos (si coincide el grupo, todos)
            if (!filtro) return e
            if (!e.hijos) return coincide(e.texto, filtro) ? e : null
            if (coincide(e.texto, filtro)) return e
            const hijos = e.hijos.filter((h) => coincide(h.texto, filtro))
            return hijos.length ? { ...e, hijos } : null
          })
          .filter((e): e is Enlace => e !== null)
        if (!visibles.length) return null
        return (
          <div key={s.titulo} className={cn(compacto && 'border-t border-linea pt-3 first:border-t-0 first:pt-0')}>
            {compacto ? <p className="sr-only">{s.titulo}</p>
              : <p className="mb-1 px-3 text-[0.8rem] font-semibold uppercase tracking-[0.1em] text-salvia">{s.titulo}</p>}
            <ul className="flex flex-col gap-0.5">
              {visibles.map((e) => e.hijos ? <GrupoNav key={e.a} {...e} alElegir={alElegir} compacto={compacto} filtrando={!!filtro}
                hijos={e.hijos.map((h) => h.a === '/admin/entrenamientos' && entrenando
                  ? { ...h, extra: <Insignia tono="ocre" className="ml-2">Entrenando…</Insignia> } : h)}
                insignia={e.a === '/admin/modelos-y-corridas' && entrenando ? <span className="ml-auto size-2 shrink-0 rounded-full bg-ocre" title="Entrenando…"><span className="sr-only">Entrenando…</span></span> : undefined} /> : (
                <li key={e.a}>
                  <NavLink
                    to={e.a}
                    end={e.a === '/'}
                    onClick={alElegir}
                    title={compacto ? e.texto : undefined}
                    className={({ isActive }) =>
                      cn('group relative flex items-center gap-3 rounded-control px-3 py-2.5 text-[0.95rem] text-tinta/75 transition-colors duration-200 hover:bg-fondo hover:text-tinta lg:py-1.5',
                        compacto && 'h-10 justify-center px-0 lg:py-0',
                        isActive && 'bg-teal-tinte font-semibold text-teal hover:bg-teal-tinte hover:text-teal')}
                  >
                    {({ isActive }) => (
                      <>
                        <e.icono size={18} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden
                          className={cn('shrink-0 transition-colors', isActive ? 'text-teal' : 'text-salvia group-hover:text-tinta')} />
                        <span className={cn(compacto && 'sr-only')}>{e.texto}</span>
                        {e.a === '/diccionario' && porClasificar > 0 && (compacto ? (
                          <>
                            <span className="absolute right-2 top-2 size-2 rounded-full bg-ocre" aria-hidden />
                            <span className="sr-only">{porClasificar} variables por clasificar</span>
                          </>
                        ) : (
                          <Insignia tono="ocre" className="ml-auto">
                            {porClasificar}<span className="sr-only"> variables por clasificar</span>
                          </Insignia>
                        ))}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {filtro && !SECCIONES.some((s) => s.enlaces.some((e) => (!e.roles || puede(usuario, e.roles)) && (coincide(e.texto, filtro) || e.hijos?.some((h) => coincide(h.texto, filtro))))) && (
        <p role="status" className="px-3 text-sm text-salvia">Ninguna opción coincide.</p>
      )}
    </nav>
  )
}

/** Marca: una curva de crecimiento con su visita destacada. */
export function Marca({ claro, soloIcono }: { claro?: boolean; soloIcono?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label={soloIcono ? 'Observatorio Canguro' : undefined}>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', claro ? 'bg-white/12' : 'bg-teal')} aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none">
          <path d="M3 17 L8 13 L12 14 L16 9 L21 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="9" r="2.4" fill="#D9694C" />
        </svg>
      </span>
      <div className={cn('leading-tight', soloIcono && 'hidden')}>
        <p className={cn('font-bold tracking-tight', claro ? 'text-white' : 'text-tinta')}>Observatorio Canguro</p>
        <p className={cn('text-xs', claro ? 'text-white/65' : 'text-salvia')}>Alertas clínicas tempranas</p>
      </div>
    </div>
  )
}

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

function Usuario({ compacto }: { compacto?: boolean }) {
  const { usuario, salir } = useSesion()
  if (!usuario) return null
  if (compacto) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="grid size-9 place-items-center rounded-full bg-teal text-sm font-semibold text-white" title={`${usuario.nombre} · ${ROLES[usuario.rol]}`} aria-hidden>
          {iniciales(usuario.nombre)}
        </span>
        <button onClick={() => void salir()} title="Cerrar sesión"
          className="grid size-9 place-items-center rounded-control text-salvia transition-colors hover:bg-fondo hover:text-coral-hondo">
          <LogOut size={17} aria-hidden /><span className="sr-only">Cerrar sesión</span>
        </button>
      </div>
    )
  }
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

const CLAVE_MENU = 'maia.menu.plegado'

/** El menú lateral de escritorio se puede plegar a una tira de iconos; la preferencia queda en este navegador. */
function usePlegado() {
  const [plegado, setPlegado] = useState(() => {
    try { return window.localStorage.getItem(CLAVE_MENU) === '1' } catch { return false }
  })
  const alternar = () => setPlegado((p) => {
    try { window.localStorage.setItem(CLAVE_MENU, p ? '0' : '1') } catch { /* sin almacenamiento: solo dura la visita */ }
    return !p
  })
  return [plegado, alternar] as const
}

export function Marco({ children }: { children?: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const [plegado, alternarPlegado] = usePlegado()
  const { pathname } = useLocation()
  const titulo = useTituloPagina()
  const destinos = useDestinos()
  const [texto, setTexto] = useState('')
  const filtro = normalizar(texto)
  const primero = filtro ? destinos.find((d) => coincide(d.texto, filtro) || (d.grupo ? coincide(d.grupo, filtro) : false)) : undefined
  const principal = useRef<HTMLElement>(null)
  const primera = useRef(true)

  // al cambiar de página el foco pasa al contenido, para quien navega con teclado o lector de pantalla
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    principal.current?.focus({ preventScroll: true })
  }, [pathname])

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
    <div className={cn('min-h-dvh lg:grid', plegado ? 'lg:grid-cols-[4.5rem_minmax(0,1fr)]' : 'lg:grid-cols-[15rem_minmax(0,1fr)]')}>
      <aside className={cn('hidden border-r border-linea bg-papel py-4 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-4', plegado ? 'px-2' : 'px-3')}>
        <div className={cn('flex items-center', plegado ? 'flex-col gap-3' : 'justify-between px-1')}>
          <Marca soloIcono={plegado} />
          <button type="button" onClick={alternarPlegado} aria-expanded={!plegado} aria-controls="menu-escritorio"
            title={plegado ? 'Desplegar menú' : 'Plegar menú'}
            className="grid size-8 shrink-0 place-items-center rounded-control text-salvia transition-colors hover:bg-fondo hover:text-tinta">
            {plegado ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            <span className="sr-only">{plegado ? 'Desplegar menú' : 'Plegar menú'}</span>
          </button>
        </div>
        {plegado ? (
          <button type="button" onClick={alternarPlegado} title="Buscar en el menú"
            className="grid h-10 place-items-center rounded-control text-salvia transition-colors hover:bg-fondo hover:text-tinta">
            <Search size={18} aria-hidden /><span className="sr-only">Buscar en el menú (despliega el menú)</span>
          </button>
        ) : <BuscarMenu valor={texto} alCambiar={setTexto} primero={primero} atajo />}
        <div id="menu-escritorio" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"><Navegacion compacto={plegado} filtro={plegado ? '' : filtro} /></div>
        <Usuario compacto={plegado} />
      </aside>

      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-y-2 border-b border-linea/80 bg-papel/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md lg:hidden">
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
          <BuscarMenu valor={texto} alCambiar={setTexto} primero={primero} alElegir={() => setAbierto(false)} />
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"><Navegacion alElegir={() => setAbierto(false)} filtro={filtro} /></div>
          <Usuario />
        </div>
      </div>

      {/* en escritorio el contenido ocupa justo la ventana y se desplaza por dentro: las páginas pueden llenarla */}
      <div className="flex min-w-0 flex-col lg:h-dvh">
        <AvisoDemo />
        <AvisoSesion />
        <p role="status" aria-live="polite" className="sr-only">{titulo}</p>
        <main ref={principal} tabIndex={-1} className="w-full flex-1 outline-none px-4 py-5 sm:px-6 lg:min-h-0 lg:overflow-y-auto lg:px-5 lg:py-4">
          <div key={pathname} className="animate-aparecer lg:h-full">
            <LimiteError key={pathname} nombre="la página"><Suspense fallback={<Cargando />}>{children ?? <Outlet />}</Suspense></LimiteError>
          </div>
        </main>
        <footer className="w-full shrink-0 px-4 pb-4 text-xs text-salvia sm:px-6 lg:border-t lg:border-linea lg:px-5 lg:py-1.5">
          Apoyo a la decisión, no diagnóstico. El riesgo ordena a los niños; la decisión es del equipo clínico.
        </footer>
      </div>
    </div>
  )
}
