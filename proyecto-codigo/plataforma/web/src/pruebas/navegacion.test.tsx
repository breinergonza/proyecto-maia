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

/** Los enlaces (texto) de la sección del menú que lleva ese título. */
function seccion(menu: HTMLElement, titulo: string) {
  const p = Array.from(menu.querySelectorAll('p')).find((x) => x.textContent === titulo)
  if (!p?.parentElement) return null
  return within(p.parentElement).queryAllByRole('link').map((a) => a.textContent)
}

const menuDe = async () => (await screen.findAllByRole('navigation', { name: 'Secciones' }))[0]

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

  it('el menú ofrece una sola entrada para calcular un niño, «Calcular un niño», que lleva a la predicción', async () => {
    api('experto')
    montar('/prediccion')
    await screen.findByRole('tab', { name: 'Un niño' })
    const enlaces = screen.getAllByRole('link', { name: 'Calcular un niño' })
    expect(enlaces.length).toBeGreaterThan(0)
    expect(enlaces[0]).toHaveAttribute('href', '/prediccion')
    expect(screen.queryByRole('link', { name: 'Predicción' })).toBeNull()
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
    expect(nombrePagina('/')).toBe('Vista clínica')
    expect(nombrePagina('/tablero')).toBe('Resumen')
    expect(nombrePagina('/comparar')).toBe('Comparar grupos')
    expect(nombrePagina('/prediccion')).toBe('Calcular un niño')
    expect(tituloDocumento('/x/y')).toBe('No existe esa página · Observatorio Canguro')
  })

  it('el administrador ve el menú agrupado: Modelos y corridas, y Configuración', async () => {
    api('admin')
    montar('/admin/entrenamientos')
    const menu = (await screen.findAllByRole('navigation', { name: 'Secciones' }))[0]
    expect(within(menu).getByRole('link', { name: 'Modelos y corridas' })).toBeInTheDocument()
    // «Modelos» también es una opción de TÉCNICA: se mira solo la sección de administración
    const administracion = Array.from(menu.querySelectorAll('p')).find((p) => p.textContent === 'Administración')!.parentElement!
    for (const t of ['Entrenamientos', 'Modelos', 'Corridas']) expect(within(administracion).getByRole('link', { name: t })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Configuración' })).toBeInTheDocument()
    expect(within(menu).queryByRole('link', { name: 'Programación' })).toBeNull() // el grupo está plegado
    await userEvent.click(within(menu).getByRole('button', { name: 'Desplegar Configuración' }))
    expect(within(menu).getByRole('link', { name: 'Programación' })).toHaveAttribute('href', '/admin/programacion')
    expect(within(menu).queryByRole('link', { name: 'Notificaciones' })).toBeNull()   // ya no es hijo de Configuración
    expect(within(menu).getByRole('link', { name: 'Servidor de correo' })).toHaveAttribute('href', '/notificaciones/servidor')
    expect(within(menu).getByRole('link', { name: 'Alertas' })).toHaveAttribute('href', '/notificaciones/alertas')
    const titulos = Array.from(menu.querySelectorAll('p')).map((p) => p.textContent)
    expect(titulos).toEqual(['Clínica', 'Técnica', 'Notificaciones', 'Administración'])
  })

  it('el experto no ve los grupos de administración', async () => {
    api('experto')
    montar('/prediccion')
    const menu = (await screen.findAllByRole('navigation', { name: 'Secciones' }))[0]
    await screen.findByRole('tab', { name: 'Un niño' })
    expect(within(menu).queryByRole('link', { name: 'Modelos y corridas' })).toBeNull()
    expect(within(menu).queryByRole('link', { name: 'Configuración' })).toBeNull()
    await userEvent.click(within(menu).getByRole('button', { name: 'Desplegar Modelos' }))
    expect(within(menu).getByRole('link', { name: 'Mis modelos' })).toBeInTheDocument()
  })

  it.each(['experto', 'visualizador'] as const)('%s no ve Notificaciones ni entra por la dirección', async (rol) => {
    api(rol)
    montar('/notificaciones/servidor')
    const menu = (await screen.findAllByRole('navigation', { name: 'Secciones' }))[0]
    expect(within(menu).queryByRole('link', { name: 'Servidor de correo' })).toBeNull()
    expect(within(menu).queryByRole('link', { name: 'Alertas' })).toBeNull()
    expect(Array.from(menu.querySelectorAll('p')).map((p) => p.textContent)).not.toContain('Notificaciones')
    expect(screen.queryByRole('heading', { name: 'Servidor de correo' })).toBeNull()
  })

  it('el administrador ve CLÍNICA (vista, niños, comparar, revisión, calcular un niño) y TÉCNICA (modelos, calidad, diccionario, resumen)', async () => {
    api('admin')
    montar('/ninos')
    const menu = await menuDe()
    expect(seccion(menu, 'Clínica')).toEqual(['Vista clínica', 'Niños', 'Comparar grupos', 'Revisión de riesgos', 'Calcular un niño'])
    expect(seccion(menu, 'Técnica')).toEqual(['Modelos', 'Calidad de datos', 'Diccionario', 'Resumen'])
    // Calidad de datos salió de Administración; Explorar y Tablero ya no están en el menú con esos nombres
    expect(seccion(menu, 'Administración')).not.toContain('Calidad de datos')
    expect(within(menu).queryByRole('link', { name: 'Explorar' })).toBeNull()
    expect(within(menu).queryByRole('link', { name: 'Tablero' })).toBeNull()
    expect(within(menu).getByRole('link', { name: 'Vista clínica' })).toHaveAttribute('href', '/')
    expect(within(menu).getByRole('link', { name: 'Comparar grupos' })).toHaveAttribute('href', '/comparar')
    expect(within(menu).getByRole('link', { name: 'Calidad de datos' })).toHaveAttribute('href', '/admin/calidad-datos')
    expect(within(menu).getByRole('link', { name: 'Resumen' })).toHaveAttribute('href', '/tablero')
    // Modelos es el grupo de la analítica, con Mis modelos entre sus opciones
    await userEvent.click(within(menu).getByRole('button', { name: 'Desplegar Modelos' }))
    expect(within(menu).getByRole('link', { name: 'Rendimiento' })).toHaveAttribute('href', '/analitica/rendimiento')
    expect(within(menu).getByRole('link', { name: 'Mis modelos' })).toHaveAttribute('href', '/mis-modelos')
  })

  it('el experto ve lo clínico y lo técnico menos Calidad de datos', async () => {
    api('experto')
    montar('/ninos')
    const menu = await menuDe()
    expect(seccion(menu, 'Clínica')).toEqual(['Vista clínica', 'Niños', 'Comparar grupos', 'Revisión de riesgos', 'Calcular un niño'])
    expect(seccion(menu, 'Técnica')).toEqual(['Modelos', 'Diccionario', 'Resumen'])
  })

  it('quien solo consulta ve vista clínica, niños, comparar, modelos y el resumen; no lo que cambia o calcula', async () => {
    api('visualizador')
    montar('/ninos')
    const menu = await menuDe()
    expect(seccion(menu, 'Clínica')).toEqual(['Vista clínica', 'Niños', 'Comparar grupos'])
    expect(seccion(menu, 'Técnica')).toEqual(['Modelos', 'Resumen'])
  })

  it('«/» abre la vista clínica y el tablero de antes queda en «/tablero» como «Resumen»', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url === '/api/tablero/resumen') return { estado: 404, cuerpo: { detail: 'x' } }
      if (url === '/api/clinica/resumen') return { estado: 404, cuerpo: { detail: 'x' } }
      if (url.startsWith('/api/')) return { cuerpo: [] }
    })
    const { unmount } = montar('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Vista clínica' })).toBeInTheDocument()
    unmount()
    montar('/tablero')
    expect(await screen.findByRole('heading', { level: 1, name: 'Resumen' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Resumen · Observatorio Canguro'))
  })

  it('«/comparar» abre «Comparar grupos» con el grupo A y un atajo para elegir el B', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url.startsWith('/api/analitica/contexto')) return { cuerpo: { entrenamiento: 1, desenlaces: [], modelos: [], submodulos: [], estado: 'ok' } }
      if (url === '/api/exploracion/facetas') return { cuerpo: { n: 0, minimo: 20, facetas: {} } }
      if (url.startsWith('/api/')) return { cuerpo: [] }
    })
    montar('/comparar')
    expect(await screen.findByRole('heading', { level: 1, name: 'Comparar grupos' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Grupo A' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Comparar con todos los niños' })).toBeInTheDocument()
  })

  it('«/explorar» sigue abierto aunque ya no esté en el menú', async () => {
    api('visualizador')
    montar('/explorar')
    expect(await screen.findByRole('heading', { level: 1, name: 'Explorar' })).toBeInTheDocument()
  })

  it('Calidad de datos sigue siendo solo de administración, también por la dirección', async () => {
    api('experto')
    montar('/admin/calidad-datos')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })
})
