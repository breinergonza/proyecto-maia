import { renderHook, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearCliente } from '../App'
import { useContextoAnalitica } from '../paginas/analitica/contexto'
import { simularApi } from './util'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

const contexto = {
  entrenamiento: 7, entrenamientos: [], modelos: [],
  desenlaces: [{ clave: 'des_a', nombre: 'A' }, { clave: 'des_b', nombre: 'B' }], submodulos: [],
}
const envoltura = (ruta: string) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={crearCliente()}><MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter></QueryClientProvider>
)
const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 30)) })

describe('analítica: filtros recordados en la sesión del navegador', () => {
  it('recuerda el desenlace elegido y lo usa cuando la URL no trae uno', async () => {
    simularApi((url) => (url.startsWith('/api/analitica/contexto') ? { cuerpo: contexto } : undefined))
    const a = renderHook(() => useContextoAnalitica(), { wrapper: envoltura('/analitica/rendimiento?entrenamiento=7') })
    await esperar()
    expect(a.result.current.desenlace).toBe('des_a')                              // sin memoria: el primero
    act(() => a.result.current.fijar({ desenlace: 'des_b', visita: '40s' }))
    expect(window.sessionStorage.getItem('maia.analitica.desenlace')).toBe('des_b')
    a.unmount()

    const b = renderHook(() => useContextoAnalitica(), { wrapper: envoltura('/analitica/equidad?entrenamiento=7') })
    await esperar()
    expect(b.result.current.desenlace).toBe('des_b')
    expect(b.result.current.visita).toBe('40s')
  })

  it('la URL manda sobre lo recordado', async () => {
    window.sessionStorage.setItem('maia.analitica.desenlace', 'des_b')
    window.sessionStorage.setItem('maia.analitica.visita', '40s')
    simularApi((url) => (url.startsWith('/api/analitica/contexto') ? { cuerpo: contexto } : undefined))
    const r = renderHook(() => useContextoAnalitica(), { wrapper: envoltura('/analitica/equidad?entrenamiento=7&desenlace=des_a&visita=12m') })
    await esperar()
    expect(r.result.current.desenlace).toBe('des_a')
    expect(r.result.current.visita).toBe('12m')
  })

  it('ignora un desenlace recordado que este entrenamiento no tiene', async () => {
    window.sessionStorage.setItem('maia.analitica.desenlace', 'otro')
    simularApi((url) => (url.startsWith('/api/analitica/contexto') ? { cuerpo: contexto } : undefined))
    const r = renderHook(() => useContextoAnalitica(), { wrapper: envoltura('/analitica/equidad?entrenamiento=7') })
    await esperar()
    expect(r.result.current.desenlace).toBe('des_a')
  })

  it('sin almacenamiento disponible no falla', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    simularApi((url) => (url.startsWith('/api/analitica/contexto') ? { cuerpo: contexto } : undefined))
    const r = renderHook(() => useContextoAnalitica(), { wrapper: envoltura('/analitica/equidad?entrenamiento=7') })
    await esperar()
    act(() => r.result.current.fijar({ desenlace: 'des_b' }))
    expect(r.result.current.desenlace).toBe('des_b')
  })
})
