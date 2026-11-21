// Prueba de aceptación del profesor (S10): «Una falla de red presenta un mensaje comprensible y opción de reintento, sin
// perder silenciosamente el contexto.» Cada página clínica que carga datos, con la red caída: dice qué pasó, ofrece
// reintentar, y reintentar pide exactamente lo mismo (los filtros de la dirección siguen ahí).
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const SIN_CONEXION = 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.'

/** La sesión responde; la petición que empieza por ``caida`` falla como falla el navegador sin red. */
const api = (caida: string) => (url: string) => {
  if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
  if (url.startsWith(caida)) throw new TypeError('Failed to fetch')
  return undefined   // lo demás responde 404, como en util
}

const casos = [
  { pagina: 'Listado de niños', ruta: '/ninos?desenlace=talla_baja_12m', caida: '/api/ninos?', contexto: 'desenlace=talla_baja_12m' },
  { pagina: 'Ficha de un niño', ruta: '/ninos/N-7', caida: '/api/ninos/N-7/linea-temporal', contexto: 'N-7' },
  { pagina: 'Revisión clínica de casos', ruta: '/revision/riesgos', caida: '/api/revision/riesgos', contexto: '/api/revision/riesgos' },
  { pagina: 'Resumen', ruta: '/tablero', caida: '/api/tablero/resumen', contexto: '/api/tablero/resumen' },
]

describe('una falla de red se explica y se puede reintentar sin perder lo elegido', () => {
  it.each(casos)('$pagina', async ({ ruta, caida, contexto }) => {
    const llamadas = simularApi(api(caida))
    montar(ruta)
    const boton = await screen.findByRole('button', { name: 'Reintentar' })
    expect(screen.getAllByText(SIN_CONEXION).length).toBeGreaterThan(0)
    const pedidas = () => llamadas.filter((l) => l.url.startsWith(caida)).map((l) => l.url)
    const antes = pedidas()
    expect(antes.at(-1)).toContain(contexto)
    await userEvent.click(boton)
    await waitFor(() => expect(pedidas().length).toBeGreaterThan(antes.length))
    expect(pedidas().at(-1)).toBe(antes.at(-1))
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
