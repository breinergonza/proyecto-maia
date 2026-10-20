import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorApi, conParams, fijarAcceso, pedir } from '../api/cliente'
import { simularApi, usuario } from './util'

afterEach(() => {
  vi.unstubAllGlobals()
  fijarAcceso(null)
})

describe('cliente de la API', () => {
  it('arma la consulta sin los parámetros vacíos', () => {
    expect(conParams('/ninos', { buscar: '', pagina: 2, desenlace: null, percentil_min: 0 })).toBe('/ninos?pagina=2&percentil_min=0')
  })

  it('ante un 401 refresca una vez y repite con el token nuevo', async () => {
    fijarAcceso('viejo')
    const llamadas = simularApi((url, init) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 'nuevo', usuario: usuario('admin') } }
      if (url === '/api/tablero/resumen') return auth === 'Bearer nuevo' ? { cuerpo: { ok: true } } : { estado: 401, cuerpo: { detail: 'Inicie sesión.' } }
    })
    await expect(pedir('/tablero/resumen')).resolves.toEqual({ ok: true })
    expect(llamadas.map((l) => l.url)).toEqual(['/api/tablero/resumen', '/api/auth/refrescar', '/api/tablero/resumen'])
  })

  it('dos 401 a la vez comparten un solo refresco (la cookie rota en cada uso)', async () => {
    const llamadas = simularApi((url, init) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 'nuevo', usuario: usuario('admin') } }
      return auth === 'Bearer nuevo' ? { cuerpo: 1 } : { estado: 401, cuerpo: {} }
    })
    await Promise.all([pedir('/a'), pedir('/b')])
    expect(llamadas.filter((l) => l.url === '/api/auth/refrescar')).toHaveLength(1)
  })

  it('convierte el detalle de FastAPI en un mensaje legible', async () => {
    simularApi(() => ({ estado: 422, cuerpo: { detail: [{ loc: ['body', 'clave'], msg: 'muy corta' }] } }))
    const e = (await pedir('/usuarios', { cuerpo: {} }).catch((x: unknown) => x)) as ErrorApi
    expect(e).toBeInstanceOf(ErrorApi)
    expect(e.estado).toBe(422)
    expect(e.message).toBe('clave: muy corta')
  })
})
