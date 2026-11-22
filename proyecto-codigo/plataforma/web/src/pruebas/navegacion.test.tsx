import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nombrePagina, tituloDocumento } from '../lib/useTituloPagina'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

function api(rol: 'admin' | 'experto' | 'datos' | 'visualizador') {
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
    const pestana = await screen.findByRole('tab', { name: 'Estimación individual' })
    expect(pestana).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Estimación por grupo' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tablist', { name: 'Qué desea predecir' })).toBeInTheDocument()
  })

  it('la pestaña «Un grupo de niños» vive en la URL y muestra la predicción por grupo', async () => {
    api('experto')
    montar('/prediccion')
    await userEvent.click(await screen.findByRole('tab', { name: 'Estimación por grupo' }))
    // el router cambia la URL dentro de una transición: con el módulo diferido aún sin cargar, el cambio llega un instante después
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Estimación por grupo' })).toHaveAttribute('aria-selected', 'true'))
    expect(await screen.findByRole('tab', { name: 'Usar todos los niños disponibles' })).toBeInTheDocument()
  })

  it('/revision no es una página que no existe: lleva a Revisión de riesgos para los mismos perfiles', async () => {
    api('experto')
    const { unmount } = montar('/revision')
    expect(await screen.findByRole('heading', { name: 'Revisión clínica de casos' })).toBeInTheDocument()
    expect(screen.queryByText('No existe esa página')).toBeNull()
    unmount()
    api('visualizador')
    montar('/revision')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })

  it('el menú ofrece una sola entrada para calcular un niño, «Calcular un niño», que lleva a la predicción', async () => {
    api('experto')
    montar('/prediccion')
    await screen.findByRole('tab', { name: 'Estimación individual' })
    const enlaces = screen.getAllByRole('link', { name: 'Estimar riesgo' })
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
    expect(screen.getAllByRole('link', { name: 'Guía de variables y unidades' }).length).toBeGreaterThan(0)   // el texto sigue para lectores
    unmount()
    montar('/diccionario')                                                                       // vuelve plegado
    expect(await screen.findByRole('button', { name: 'Desplegar menú' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Desplegar menú' }))
    expect(window.localStorage.getItem('maia.menu.plegado')).toBe('0')
  })

  it('el título de la pestaña sigue a la página y se anuncia', async () => {
    api('admin')
    montar('/diccionario')
    await waitFor(() => expect(document.title).toBe('Guía de variables y unidades · Observatorio Canguro'))
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Guía de variables y unidades · Observatorio Canguro')).toBe(true)
  })

  it('tabla de títulos: submódulos de analítica, ficha del niño y página inexistente', () => {
    expect(nombrePagina('/analitica/calibracion')).toBe('Calibración y umbrales de alerta')
    expect(nombrePagina('/ninos/ABC-1')).toBe('Ficha clínica · ABC-1')
    expect(nombrePagina('/admin/corridas/')).toBe('Recalcular riesgos')
    expect(nombrePagina('/')).toBe('Seguimiento clínico')
    expect(nombrePagina('/tablero')).toBe('Resumen de riesgos y calidad de datos')
    expect(nombrePagina('/comparar')).toBe('Comparar grupos de niños')
    expect(nombrePagina('/prediccion')).toBe('Estimar riesgo')
    expect(tituloDocumento('/x/y')).toBe('No existe esa página · Observatorio Canguro')
  })

  it('el administrador ve el menú agrupado: Operación de modelos, y Configuración', async () => {
    api('admin')
    montar('/admin/entrenamientos')
    const menu = (await screen.findAllByRole('navigation', { name: 'Secciones' }))[0]
    expect(within(menu).getByRole('link', { name: 'Operación de modelos' })).toBeInTheDocument()
    // la operación de modelos y la configuración son de Datos y modelos (D77); Administración queda con los usuarios
    const datos = Array.from(menu.querySelectorAll('p')).find((p) => p.textContent === 'Datos y modelos')!.parentElement!
    for (const t of ['Entrenar y aprobar modelos', 'Modelos disponibles', 'Recalcular riesgos']) expect(within(datos).getByRole('link', { name: t })).toBeInTheDocument()
    expect(seccion(menu, 'Administración')).toEqual(['Usuarios y permisos'])
    expect(within(menu).getByRole('link', { name: 'Configuración' })).toBeInTheDocument()
    expect(within(menu).queryByRole('link', { name: 'Programar ejecuciones automáticas' })).toBeNull() // el grupo está plegado
    await userEvent.click(within(menu).getByRole('button', { name: 'Desplegar Configuración' }))
    expect(within(menu).getByRole('link', { name: 'Programar ejecuciones automáticas' })).toHaveAttribute('href', '/admin/programacion')
    expect(within(menu).queryByRole('link', { name: 'Notificaciones' })).toBeNull()   // ya no es hijo de Configuración
    expect(within(menu).getByRole('link', { name: 'Configuración del correo saliente' })).toHaveAttribute('href', '/notificaciones/servidor')
    expect(within(menu).getByRole('link', { name: 'Reglas y envíos de alertas por correo' })).toHaveAttribute('href', '/notificaciones/alertas')
    const titulos = Array.from(menu.querySelectorAll('p')).map((p) => p.textContent)
    expect(titulos).toEqual(['Clínica', 'Datos y modelos', 'Notificaciones', 'Administración'])
  })

  it('el experto clínico ve solo lo clínico: ni Datos y modelos, ni configuración, ni operación de modelos', async () => {
    api('experto')
    montar('/prediccion')
    const menu = (await screen.findAllByRole('navigation', { name: 'Secciones' }))[0]
    await screen.findByRole('tab', { name: 'Estimación individual' })
    expect(Array.from(menu.querySelectorAll('p')).map((p) => p.textContent)).toEqual(['Clínica'])
    for (const t of ['Operación de modelos', 'Configuración', 'Evaluación de modelos', 'Guía de variables y unidades', 'Mediciones por revisar'])
      expect(within(menu).queryByRole('link', { name: t })).toBeNull()
  })

  it.each(['/diccionario', '/admin/calidad-datos', '/mis-modelos', '/admin/configuracion', '/admin/programacion', '/admin/entrenamientos', '/tablero', '/analitica'])(
    'el experto clínico no entra a %s por la dirección', async (ruta) => {
      api('experto')
      montar(ruta)
      expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    })

  it('el experto en datos ve Datos y modelos con la configuración, la programación y la operación de modelos', async () => {
    api('datos')
    montar('/diccionario')        // en una página sin grupo: los grupos están plegados
    const menu = await menuDe()
    expect(Array.from(menu.querySelectorAll('p')).map((p) => p.textContent)).toEqual(['Clínica', 'Datos y modelos'])
    expect(seccion(menu, 'Clínica')).toEqual(['Seguimiento clínico', 'Comparar grupos de niños'])
    expect(seccion(menu, 'Datos y modelos')).toEqual(['Evaluación de modelos', 'Operación de modelos', 'Mediciones por revisar',
      'Guía de variables y unidades', 'Resumen de riesgos y calidad de datos', 'Configuración'])
    await userEvent.click(within(menu).getByRole('button', { name: 'Desplegar Configuración' }))
    expect(within(menu).getByRole('link', { name: 'Programar ejecuciones automáticas' })).toHaveAttribute('href', '/admin/programacion')
    await userEvent.click(within(menu).getByRole('button', { name: 'Desplegar Operación de modelos' }))
    expect(within(menu).getByRole('link', { name: 'Entrenar y aprobar modelos' })).toHaveAttribute('href', '/admin/entrenamientos')
    await userEvent.click(within(menu).getByRole('button', { name: 'Desplegar Evaluación de modelos' }))
    expect(within(menu).getByRole('link', { name: 'Entrenamientos propios' })).toHaveAttribute('href', '/mis-modelos')
    expect(screen.getAllByText('Experto en datos').length).toBeGreaterThan(0)    // el perfil, con su nombre
  })

  it.each(['/admin/usuarios', '/notificaciones/servidor', '/ninos', '/revision/riesgos', '/prediccion'])(
    'el experto en datos no entra a %s (usuarios, notificaciones ni lo clínico de cada niño)', async (ruta) => {
      api('datos')
      montar(ruta)
      expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    })

  it.each(['experto', 'visualizador'] as const)('%s no ve Notificaciones ni entra por la dirección', async (rol) => {
    api(rol)
    montar('/notificaciones/servidor')
    const menu = (await screen.findAllByRole('navigation', { name: 'Secciones' }))[0]
    expect(within(menu).queryByRole('link', { name: 'Configuración del correo saliente' })).toBeNull()
    expect(within(menu).queryByRole('link', { name: 'Reglas y envíos de alertas por correo' })).toBeNull()
    expect(Array.from(menu.querySelectorAll('p')).map((p) => p.textContent)).not.toContain('Notificaciones')
    expect(screen.queryByRole('heading', { name: 'Configuración del correo saliente' })).toBeNull()
  })

  it('el administrador ve CLÍNICA (vista, niños, comparar, revisión, calcular un niño) y TÉCNICA (modelos, calidad, diccionario, resumen)', async () => {
    api('admin')
    montar('/ninos')
    const menu = await menuDe()
    expect(seccion(menu, 'Clínica')).toEqual(['Seguimiento clínico', 'Listado de niños', 'Comparar grupos de niños', 'Revisión clínica de casos', 'Estimar riesgo'])
    expect(seccion(menu, 'Datos y modelos')).toEqual(['Evaluación de modelos', 'Operación de modelos', 'Mediciones por revisar',
      'Guía de variables y unidades', 'Resumen de riesgos y calidad de datos', 'Configuración'])
    // Calidad de datos salió de Administración; Explorar y Tablero ya no están en el menú con esos nombres
    expect(seccion(menu, 'Administración')).not.toContain('Mediciones por revisar')
    expect(within(menu).queryByRole('link', { name: 'Explorar grupos de niños' })).toBeNull()
    expect(within(menu).queryByRole('link', { name: 'Tablero' })).toBeNull()
    expect(within(menu).getByRole('link', { name: 'Seguimiento clínico' })).toHaveAttribute('href', '/')
    expect(within(menu).getByRole('link', { name: 'Comparar grupos de niños' })).toHaveAttribute('href', '/comparar')
    expect(within(menu).getByRole('link', { name: 'Mediciones por revisar' })).toHaveAttribute('href', '/admin/calidad-datos')
    expect(within(menu).getByRole('link', { name: 'Resumen de riesgos y calidad de datos' })).toHaveAttribute('href', '/tablero')
    // Modelos es el grupo de la analítica, con Mis modelos entre sus opciones
    await userEvent.click(within(menu).getByRole('button', { name: 'Desplegar Evaluación de modelos' }))
    expect(within(menu).getByRole('link', { name: 'Detección y falsas alertas' })).toHaveAttribute('href', '/analitica/rendimiento')
    expect(within(menu).getByRole('link', { name: 'Entrenamientos propios' })).toHaveAttribute('href', '/mis-modelos')
  })

  it('el experto clínico ve todo lo clínico', async () => {
    api('experto')
    montar('/ninos')
    const menu = await menuDe()
    expect(seccion(menu, 'Clínica')).toEqual(['Seguimiento clínico', 'Listado de niños', 'Comparar grupos de niños', 'Revisión clínica de casos', 'Estimar riesgo'])
    expect(seccion(menu, 'Datos y modelos')).toBeNull()
  })

  it('quien solo consulta ve vista clínica, comparar, modelos y el resumen; no niños uno por uno ni lo que cambia o calcula', async () => {
    api('visualizador')
    montar('/')
    const menu = await menuDe()
    expect(seccion(menu, 'Clínica')).toEqual(['Seguimiento clínico', 'Comparar grupos de niños'])
    expect(seccion(menu, 'Datos y modelos')).toEqual(['Evaluación de modelos', 'Resumen de riesgos y calidad de datos'])
  })

  it('quien solo consulta tampoco abre la lista de niños ni la ficha de uno por la dirección', async () => {
    for (const ruta of ['/ninos', '/ninos/K001']) {
      api('visualizador')
      const { unmount } = montar(ruta)
      expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
      unmount()
    }
  })

  it('«/» abre la vista clínica y el tablero de antes queda en «/tablero» como «Resumen»', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('datos') } }
      if (url === '/api/tablero/resumen') return { estado: 404, cuerpo: { detail: 'x' } }
      if (url === '/api/clinica/resumen') return { estado: 404, cuerpo: { detail: 'x' } }
      if (url.startsWith('/api/')) return { cuerpo: [] }
    })
    const { unmount } = montar('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Seguimiento clínico' })).toBeInTheDocument()
    unmount()
    montar('/tablero')
    expect(await screen.findByRole('heading', { level: 1, name: 'Resumen de riesgos y calidad de datos' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Resumen de riesgos y calidad de datos · Observatorio Canguro'))
  })

  it('«/comparar» abre «Comparar grupos» con el grupo A y un atajo para elegir el B', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url.startsWith('/api/analitica/contexto')) return { cuerpo: { entrenamiento: 1, desenlaces: [], modelos: [], submodulos: [], estado: 'ok' } }
      if (url === '/api/exploracion/facetas') return { cuerpo: { n: 0, minimo: 20, facetas: {} } }
      if (url.startsWith('/api/')) return { cuerpo: [] }
    })
    montar('/comparar')
    expect(await screen.findByRole('heading', { level: 1, name: 'Comparar grupos de niños' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Grupo A' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Elegir los criterios del grupo B' })).toBeInTheDocument()
  })

  it('«/explorar» sigue abierto aunque ya no esté en el menú', async () => {
    api('visualizador')
    montar('/explorar')
    expect(await screen.findByRole('heading', { level: 1, name: 'Explorar grupos de niños' })).toBeInTheDocument()
  })

  it('quien solo consulta no entra a Calidad de datos, tampoco por la dirección', async () => {
    api('visualizador')
    montar('/admin/calidad-datos')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })
})
