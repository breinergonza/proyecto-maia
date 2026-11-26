import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorApi, conParams, fijarAcceso, pedir, pedirArchivo } from '../api/cliente'
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

  it('sin conexión explica el problema en español, no «Failed to fetch»', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    for (const llamada of [() => pedir('/tablero/resumen'), () => pedirArchivo('/diccionario/vigente/archivo')]) {
      const e = await llamada().catch((x: unknown) => x)
      expect(e).toBeInstanceOf(ErrorApi)
      expect((e as ErrorApi).estado).toBe(0)
      expect((e as ErrorApi).message).toBe('No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.')
    }
  })
})
