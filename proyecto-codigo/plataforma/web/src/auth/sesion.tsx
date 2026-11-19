// Sesión: al abrir la página se intenta recuperar con la cookie de refresco; el token de acceso solo vive en memoria.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { alCambiarSesion, fijarAcceso, pedir, refrescar } from '../api/cliente'
import type { RespuestaLogin, Rol, Usuario } from '../api/tipos'
import { ROLES } from '../lib/formato'

interface Sesion {
  usuario: Usuario | null
  cargando: boolean
  ingresar: (email: string, clave: string) => Promise<void>
  salir: () => Promise<void>
  /** Suelta la sesión local (sin llamar a la API) para volver a ingresar; la ruta se conserva en la redirección. */
  descartar: () => void
}

const Contexto = createContext<Sesion | null>(null)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const quitar = alCambiarSesion((r) => setUsuario(r?.usuario ?? null))
    refrescar().finally(() => setCargando(false))
    return () => {
      quitar()
    }
  }, [])

  const ingresar = useCallback(async (email: string, clave: string) => {
    const r = await pedir<RespuestaLogin>('/auth/login', { cuerpo: { email, clave } })
    fijarAcceso(r.acceso)
    setUsuario(r.usuario)
  }, [])

  const salir = useCallback(async () => {
    try {
      await pedir('/auth/salir', { metodo: 'POST' })
    } finally {
      fijarAcceso(null)
      setUsuario(null)
    }
  }, [])

  const descartar = useCallback(() => {
    fijarAcceso(null)
    setUsuario(null)
  }, [])

  const valor = useMemo(() => ({ usuario, cargando, ingresar, salir, descartar }), [usuario, cargando, ingresar, salir, descartar])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSesion(): Sesion {
  const s = useContext(Contexto)
  if (!s) throw new Error('useSesion fuera de ProveedorSesion')
  return s
}

export const puede = (u: Usuario | null, roles: Rol[]) => !!u && roles.includes(u.rol)

/** Protege una ruta: sin sesión, al ingreso; sin el rol, un aviso. */
export function Requiere({ roles, children }: { roles?: Rol[]; children: ReactNode }) {
  const { usuario, cargando } = useSesion()
  const lugar = useLocation()
  if (cargando) return null
  if (!usuario) return <Navigate to="/ingresar" replace state={{ desde: `${lugar.pathname}${lugar.search}${lugar.hash}` }} />
  if (roles && !roles.includes(usuario.rol)) {
    return (
      <div className="rounded-panel border border-linea bg-papel p-6">
        <h1>Sin permiso</h1>
        <p className="mt-2 text-salvia">Su perfil ({ROLES[usuario.rol]}) no puede ver esta sección. Pida acceso a la administración.</p>
      </div>
    )
  }
  return <>{children}</>
}
