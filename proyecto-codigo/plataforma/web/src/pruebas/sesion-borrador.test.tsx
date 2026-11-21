import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fijarAcceso, refrescar } from '../api/cliente'
import { ProveedorSesion } from '../auth/sesion'
import { AvisoSesion } from '../components/AvisoSesion'
import { montar, simularApi, usuario } from './util'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fijarAcceso(null)
  window.sessionStorage.clear()
})

/** JWT de mentira (sin firma real) con ``exp`` dentro de ``seg`` segundos. */
const jwt = (seg: number) => `x.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seg }))}.y`
const Ubicacion = () => <p data-testid="ubicacion">{useLocation().pathname + useLocation().search}</p>

describe('aviso de sesión por vencer', () => {
  it('avisa antes de vencer si el refresco falla y luego avisa que venció; no hace nada si todo va bien', async () => {
    simularApi(() => ({ estado: 401, cuerpo: { detail: 'Inicie sesión.' } }))     // ni al abrir ni al renovar hay sesión
    render(<ProveedorSesion><MemoryRouter><AvisoSesion /></MemoryRouter></ProveedorSesion>)
    expect(screen.queryByText(/Guarde su trabajo/)).toBeNull()                    // sin sesión previa no hay aviso
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    act(() => fijarAcceso(jwt(120)))                                              // vence en 2 minutos; renueva a los 60 s
    expect(screen.queryByText(/Guarde su trabajo/)).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })          // el refresco falla con 59 s de margen
    expect(screen.getByRole('status')).toHaveTextContent('Su sesión está por vencer. Guarde su trabajo e ingrese de nuevo.')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })          // ya venció
    expect(screen.getByRole('alert')).toHaveTextContent('Su sesión venció. Guarde su trabajo e ingrese de nuevo.')
  })

  it('si el refresco funciona la sesión se renueva sin avisar', async () => {
    simularApi((url) => (url === '/api/auth/refrescar' ? { cuerpo: { acceso: 'nuevo', usuario: usuario('experto') } } : undefined))
    render(<ProveedorSesion><MemoryRouter><AvisoSesion /></MemoryRouter></ProveedorSesion>)
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    act(() => fijarAcceso(jwt(120)))
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000) })
    expect(screen.queryByText(/Guarde su trabajo/)).toBeNull()
  })

  it('«Ingresar de nuevo» lleva al ingreso y, al ingresar, vuelve a la misma dirección', async () => {
    let sesionViva = true
    const llamadas = simularApi((url) => {
      if (url === '/api/auth/refrescar') return sesionViva ? { cuerpo: { acceso: 't', usuario: usuario('experto') } } : { estado: 401, cuerpo: {} }
      if (url === '/api/auth/login') return { cuerpo: { acceso: 't2', usuario: usuario('experto') } }
      return undefined
    })
    montar('/tablero?x=1', <Ubicacion />)                                          // el aviso ya lo monta el Marco
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/auth/refrescar')).toBe(true))
    sesionViva = false
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/tablero?x=1'))
    // se rompe el refresco con la sesión abierta
    await act(async () => { await refrescar() })
    const boton = await screen.findByRole('button', { name: 'Ingresar de nuevo' })
    fireEvent.click(boton)
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/ingresar'))
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'e@maia.prueba')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave')
    await userEvent.click(screen.getByRole('button', { name: /Iniciar sesión/ }))
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/tablero?x=1'))
  })
})

describe('borrador del motivo en la revisión', () => {
  const caso = (id: number, extra = {}) => ({
    id, sujeto: `N-${id}`, clave: 'oxigeno', desenlace: 'Oxígeno a los 12 meses', momento: '40s', momento_nombre: '40 semanas',
    fecha_visita: '2026-03-01', preocupa: null, comentario: null, resumen: ['Edad gestacional: 30 semanas'], ...extra,
  })
  const api = (url: string) =>
    url === '/api/auth/refrescar' ? { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      : url === '/api/revision/riesgos' ? { cuerpo: { corrida_id: 3, items: [caso(1), caso(2)] } }
        : url.startsWith('/api/revision/riesgos/') ? { estado: 204, cuerpo: null } : undefined

  it('guarda el motivo por id de riesgo (sin el código del niño), lo restaura y lo borra al responder', async () => {
    simularApi(api)
    const { unmount } = montar('/revision/riesgos')
    await userEvent.type(await screen.findByLabelText(/Motivo/), 'Poco peso')
    expect(window.sessionStorage.getItem('maia.revision.motivo.1')).toBe('Poco peso')
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('N-1')
    unmount()

    montar('/revision/riesgos')                                                   // vuelve al caso: el texto sigue ahí
    expect(await screen.findByLabelText(/Motivo/)).toHaveValue('Poco peso')
    await userEvent.click(screen.getByRole('button', { name: 'Sí, me preocupa' }))
    await waitFor(() => expect(window.sessionStorage.getItem('maia.revision.motivo.1')).toBeNull())
  })

  it('si el almacenamiento falla, la revisión sigue funcionando', async () => {
    simularApi(api)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado') })
    montar('/revision/riesgos')
    await userEvent.type(await screen.findByLabelText(/Motivo/), 'ok')
    expect(screen.getByLabelText(/Motivo/)).toHaveValue('ok')
    vi.restoreAllMocks()
  })
})
