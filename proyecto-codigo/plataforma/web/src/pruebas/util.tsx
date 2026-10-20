import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { crearCliente, Rutas } from '../App'
import { fijarAcceso } from '../api/cliente'
import type { Usuario } from '../api/tipos'
import { ProveedorSesion } from '../auth/sesion'

export const usuario = (rol: Usuario['rol']): Usuario => ({
  id: '00000000-0000-0000-0000-000000000001', email: `${rol}@maia.prueba`, nombre: `Persona ${rol}`, rol, activo: true,
})

type Manejador = (url: string, init?: RequestInit) => { estado?: number; cuerpo?: unknown } | undefined

/** fetch falso: cada petición pasa por ``manejar``; lo que no maneja responde 404. */
export function simularApi(manejar: Manejador) {
  const llamadas: { url: string; init?: RequestInit }[] = []
  const f = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    llamadas.push({ url, init })
    const r = manejar(url, init) ?? { estado: 404, cuerpo: { detail: 'No existe' } }
    const estado = r.estado ?? 200
    return new Response(estado === 204 ? null : JSON.stringify(r.cuerpo ?? null), {
      status: estado, headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', f)
  return llamadas
}

export function montar(ruta: string, extra?: ReactNode) {
  fijarAcceso(null)
  return render(
    <QueryClientProvider client={crearCliente()}>
      <ProveedorSesion>
        <MemoryRouter initialEntries={[ruta]}>
          <Rutas />
          {extra}
        </MemoryRouter>
      </ProveedorSesion>
    </QueryClientProvider>,
  )
}
