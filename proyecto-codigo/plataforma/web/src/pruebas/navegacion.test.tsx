import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nombrePagina, tituloDocumento } from '../lib/useTituloPagina'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

function api(rol: 'admin' | 'experto' | 'visualizador') {
  simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/inferencia/formulario') return { cuerpo: { campos: [], visitas: [], variables_visita: [], nota: '' } }
    if (url.startsWith('/api/')) return { cuerpo: [] }
  })
}

describe('navegación', () => {
  it('/inferencia redirige a Predicción, pestaña «Un niño»', async () => {
    api('experto')
    montar('/inferencia')
    const pestana = await screen.findByRole('tab', { name: 'Un niño' })
    expect(pestana).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Un grupo de niños' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tablist', { name: 'Qué desea predecir' })).toBeInTheDocument()
  })

  it('la pestaña «Un grupo de niños» vive en la URL y muestra la predicción por grupo', async () => {
    api('experto')
    montar('/prediccion')
    await userEvent.click(await screen.findByRole('tab', { name: 'Un grupo de niños' }))
    // el router cambia la URL dentro de una transición: con el módulo diferido aún sin cargar, el cambio llega un instante después
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Un grupo de niños' })).toHaveAttribute('aria-selected', 'true'))
    expect(await screen.findByRole('tab', { name: 'Todo el universo' })).toBeInTheDocument()
  })

  it('el menú ofrece una sola entrada de Predicción y ya no «Calcular el riesgo de un niño»', async () => {
    api('experto')
    montar('/prediccion')
    await screen.findByRole('tab', { name: 'Un niño' })
    expect(screen.getAllByRole('link', { name: 'Predicción' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Calcular el riesgo de un niño' })).toBeNull()
  })

  it('el menú de escritorio se pliega a iconos, conserva los enlaces accesibles y recuerda la preferencia', async () => {
    window.localStorage.removeItem('maia.menu.plegado')
    api('admin')
    const { unmount } = montar('/diccionario')
    const boton = await screen.findByRole('button', { name: 'Plegar menú' })
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(boton)
    expect(screen.getByRole('button', { name: 'Desplegar menú' })).toHaveAttribute('aria-expanded', 'false')
    expect(window.localStorage.getItem('maia.menu.plegado')).toBe('1')
    expect(screen.getAllByRole('link', { name: 'Diccionario' }).length).toBeGreaterThan(0)   // el texto sigue para lectores
    unmount()
    montar('/diccionario')                                                                       // vuelve plegado
    expect(await screen.findByRole('button', { name: 'Desplegar menú' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Desplegar menú' }))
    expect(window.localStorage.getItem('maia.menu.plegado')).toBe('0')
  })

  it('el título de la pestaña sigue a la página y se anuncia', async () => {
    api('admin')
    montar('/diccionario')
    await waitFor(() => expect(document.title).toBe('Diccionario · Observatorio Canguro'))
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Diccionario · Observatorio Canguro')).toBe(true)
  })

  it('tabla de títulos: submódulos de analítica, ficha del niño y página inexistente', () => {
    expect(nombrePagina('/analitica/calibracion')).toBe('Analítica: Calibración')
    expect(nombrePagina('/ninos/ABC-1')).toBe('Niño ABC-1')
    expect(nombrePagina('/admin/corridas/')).toBe('Corridas')
    expect(tituloDocumento('/x/y')).toBe('No existe esa página · Observatorio Canguro')
  })

  it('el administrador ve el menú agrupado: Modelos y corridas, y Configuración', async () => {
    api('admin')
    montar('/admin/entrenamientos')
    const menu = (await screen.findAllByRole('navigation', { name: 'Secciones' }))[0]
    expect(within(menu).getByRole('link', { name: 'Modelos y corridas' })).toBeInTheDocument()
    for (const t of ['Entrenamientos', 'Modelos', 'Corridas']) expect(within(menu).getByRole('link', { name: t })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Configuración' })).toBeInTheDocument()
    expect(within(menu).queryByRole('link', { name: 'Programación' })).toBeNull() // el grupo está plegado
    await userEvent.click(within(menu).getByRole('button', { name: 'Desplegar Configuración' }))
    expect(within(menu).getByRole('link', { name: 'Programación' })).toHaveAttribute('href', '/admin/programacion')
    expect(within(menu).getByRole('link', { name: 'Notificaciones' })).toHaveAttribute('href', '/admin/notificaciones')
  })

  it('el experto no ve los grupos de administración', async () => {
    api('experto')
    montar('/prediccion')
    const menu = (await screen.findAllByRole('navigation', { name: 'Secciones' }))[0]
    await screen.findByRole('tab', { name: 'Un niño' })
    expect(within(menu).queryByRole('link', { name: 'Modelos y corridas' })).toBeNull()
    expect(within(menu).queryByRole('link', { name: 'Configuración' })).toBeNull()
    expect(within(menu).getByRole('link', { name: 'Mis modelos' })).toBeInTheDocument()
  })
})
