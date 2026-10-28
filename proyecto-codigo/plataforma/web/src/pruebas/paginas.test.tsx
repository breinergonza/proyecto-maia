import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const sinSesion = (url: string) => (url === '/api/auth/refrescar' ? { estado: 401, cuerpo: { detail: 'no' } } : undefined)

describe('ingreso y permisos', () => {
  it('sin sesión lleva al ingreso', async () => {
    simularApi(sinSesion)
    montar('/ninos')
    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument()
  })

  it('valida el formulario antes de llamar a la API', async () => {
    const llamadas = simularApi(sinSesion)
    montar('/ingresar')
    await userEvent.click(await screen.findByRole('button', { name: 'Ingresar al sistema' }))
    expect(await screen.findByText('Escriba su correo.')).toBeInTheDocument()
    expect(llamadas.some((l) => l.url === '/api/auth/login')).toBe(false)
  })

  it('muestra el error de la API y, con la clave correcta, entra al tablero', async () => {
    simularApi((url, init) => {
      if (url === '/api/auth/refrescar') return { estado: 401, cuerpo: {} }
      if (url === '/api/auth/login') {
        const { clave } = JSON.parse(String(init?.body))
        return clave === 'buena-clave'
          ? { cuerpo: { acceso: 't', usuario: usuario('visualizador') } }
          : { estado: 401, cuerpo: { detail: 'Correo o contraseña incorrectos.' } }
      }
      if (url === '/api/tablero/resumen') return { estado: 404, cuerpo: { detail: 'Todavía no hay resultados' } }
    })
    montar('/ingresar')
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'consulta@maia.prueba')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar al sistema' }))
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Contraseña'))
    await userEvent.type(screen.getByLabelText('Contraseña'), 'buena-clave')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar al sistema' }))
    expect(await screen.findByText('Todavía no hay resultados')).toBeInTheDocument()
  })

  it('el perfil de consulta no ve la administración ni la revisión', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('visualizador') } }
      if (url === '/api/tablero/resumen') return { estado: 404, cuerpo: { detail: 'x' } }
    })
    montar('/admin/usuarios')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(screen.queryAllByRole('link', { name: 'Usuarios' })).toHaveLength(0)
    expect(screen.queryAllByRole('link', { name: 'Datos por revisar' })).toHaveLength(0)
    expect(screen.getAllByRole('link', { name: 'Niños' }).length).toBeGreaterThan(0)
  })
})

describe('revisión de datos', () => {
  it('guarda la respuesta del experto', async () => {
    const dato = {
      id: 7, prioridad: 1, sujeto: 's1', variable: 'peso_40', etiqueta: 'Peso a 40 sem', unidad: 'g', etapa: 's40',
      etapa_nombre: '40 semanas', fecha: '2026-01-01', valor: '9999', esperado: 2800, rango_bajo: 2000, rango_alto: 3500,
      capas: ['1', '2'], motivo: 'valor atípico', fuerza: 9, es_error: null, comentario: null,
    }
    const enviados: unknown[] = []
    simularApi((url, init) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url.startsWith('/api/revision/datos?')) return { cuerpo: { total: 1, pagina: 1, tamano: 10, items: [dato] } }
      if (url === '/api/revision/datos/7') {
        enviados.push(JSON.parse(String(init?.body)))
        return { estado: 204 }
      }
      return { cuerpo: {} }
    })
    montar('/revision/datos')
    expect(await screen.findByText(/Para este niño se esperaba entre/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Comentario'), 'La báscula estaba dañada')
    await userEvent.click(screen.getByRole('button', { name: 'Sí' }))
    await waitFor(() => expect(enviados).toEqual([{ es_error: 'si', comentario: 'La báscula estaba dañada' }]))
    expect(await screen.findByText('Respuesta guardada.')).toBeInTheDocument()
  })
})
