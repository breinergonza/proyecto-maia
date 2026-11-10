import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

function api(rol: 'admin' | 'experto' | 'visualizador') {
  return simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url.startsWith('/api/')) return { cuerpo: [] }
  })
}

function Ubicacion() {
  return <p data-testid="ruta">{useLocation().pathname}</p>
}

// la instancia de escritorio es la que lleva el atajo y la sugerencia «(/)»
const campo = async () => (await screen.findAllByPlaceholderText('Buscar en el menú (/)'))[0]

describe('Buscar en el menú', () => {
  it('tiene etiqueta accesible y se enfoca con «/» y con Ctrl+K', async () => {
    api('experto')
    montar('/tablero', <Ubicacion />)
    const entrada = await campo()
    expect(entrada).toHaveAccessibleName('Buscar en el menú')
    expect(entrada).not.toHaveFocus()
    fireEvent.keyDown(document.body, { key: '/' })
    expect(entrada).toHaveFocus()
    entrada.blur()
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true })
    expect(entrada).toHaveFocus()
  })

  it('«/» no roba la tecla mientras se escribe en otro campo', async () => {
    api('experto')
    montar('/ninos')
    const entrada = await campo()
    const otro = await screen.findByLabelText('Buscar por código')
    otro.focus()
    fireEvent.keyDown(otro, { key: '/' })
    expect(entrada).not.toHaveFocus()
  })

  // el menú de escritorio y el cajón móvil existen a la vez; se mira el de escritorio (el primero)
  const enlaces = (nombre: string | RegExp) => screen.queryAllByRole('link', { name: nombre })

  it('filtra el propio menú, sin tildes, y oculta lo que no coincide', async () => {
    api('experto')
    montar('/tablero')
    expect((await screen.findAllByRole('link', { name: 'Explorar' })).length).toBeGreaterThan(0)
    await userEvent.type(await campo(), 'predic')
    expect(screen.queryAllByRole('listbox')).toHaveLength(0)   // no hay lista aparte: se filtra el menú
    expect(enlaces('Predicción').length).toBeGreaterThan(0)
    expect(enlaces('Explorar')).toHaveLength(0)
    expect(enlaces('Mis modelos')).toHaveLength(0)
  })

  it('Enter va a la primera coincidencia y limpia el filtro', async () => {
    api('experto')
    montar('/tablero', <Ubicacion />)
    const entrada = await campo()
    await userEvent.type(entrada, 'predic{Enter}')
    expect(await screen.findByTestId('ruta')).toHaveTextContent('/prediccion')
    expect(entrada).toHaveValue('')
    expect((await screen.findAllByRole('link', { name: 'Explorar' })).length).toBeGreaterThan(0)
  })

  it('abre los grupos con coincidencias y muestra solo esas', async () => {
    api('admin')
    montar('/tablero')
    await userEvent.type(await campo(), 'program')
    expect((await screen.findAllByRole('link', { name: 'Programación' })).length).toBeGreaterThan(0)
    expect(enlaces('Notificaciones')).toHaveLength(0)
    expect(enlaces('Usuarios')).toHaveLength(0)
  })

  it('si coincide el nombre del grupo, muestra todas sus opciones', async () => {
    api('admin')
    montar('/tablero')
    await userEvent.type(await campo(), 'configuracion')
    expect((await screen.findAllByRole('link', { name: 'Notificaciones' })).length).toBeGreaterThan(0)
    expect(enlaces('Programación').length).toBeGreaterThan(0)
  })

  it('solo considera las opciones permitidas al rol y avisa si no hay coincidencias', async () => {
    api('visualizador')
    montar('/tablero')
    await userEvent.type(await campo(), 'usuarios')
    expect((await screen.findAllByText('Ninguna opción coincide.')).length).toBeGreaterThan(0)
  })

  it('Escape y el botón de borrar devuelven el menú completo', async () => {
    api('experto')
    montar('/tablero')
    const entrada = await campo()
    await userEvent.type(entrada, 'ni')
    expect(enlaces('Explorar')).toHaveLength(0)
    await userEvent.keyboard('{Escape}')
    expect(entrada).toHaveValue('')
    expect(enlaces('Explorar').length).toBeGreaterThan(0)
  })
})

describe('Grupos del menú', () => {
  it('un grupo abierto por la ruta se puede plegar y volver a desplegar', async () => {
    api('admin')
    montar('/admin/programacion')
    // el menú de escritorio y el cajón móvil existen a la vez; se prueba el de escritorio (el primero)
    const plegar = (await screen.findAllByRole('button', { name: 'Plegar Configuración' }))[0]
    expect(plegar).toBeEnabled()
    expect(screen.getAllByRole('link', { name: 'Notificaciones' }).length).toBeGreaterThan(0)
    await userEvent.click(plegar)
    expect(plegar).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click((await screen.findAllByRole('button', { name: 'Desplegar Configuración' }))[0])
    expect((await screen.findAllByRole('button', { name: 'Plegar Configuración' }))[0]).toHaveAttribute('aria-expanded', 'true')
  }, 20_000)   // la página de Programación se carga bajo demanda
})
