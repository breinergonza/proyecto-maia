import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const cola = {
  items: [
    { id: 1, estado: 'en_curso', posicion: 0, estimado_min: 12, propietario: 'Ana', visibilidad: 'oficial', nombre: 'Base', muestra_id: null, creada_en: null, propia: false, cancelable: false },
    { id: 2, estado: 'pendiente', posicion: 1, estimado_min: 12, propietario: 'Persona experto', visibilidad: 'personal', nombre: 'Mi prueba', muestra_id: null, creada_en: null, propia: true, cancelable: true },
  ],
  limites: { sin_limite: false, cola_max: 1, cola_usada: 1, modelos_max: 3, modelos_usados: 1 },
  promedio_min: 12,
}
const banco = [{
  id: 9, propietario: 'Ana', visibilidad: 'personal', nombre: 'Viejo', descripcion: null, fuente: 'simulado', modelos: ['clinico'],
  muestra_id: 4, muestra: 'Prematuros', corte: '2026-01-01', corte_anterior: true, auc: 0.81, terminada: null, propia: false, descartado: false,
}]

const muestras = [
  { id: 4, titulo: 'Prematuros', fuente: 'simulado', propietario: 'Persona experto', propietario_id: '00000000-0000-0000-0000-000000000001', n_ninos: 300, definicion: { version: 2, y: [] } },
  { id: 5, titulo: 'De otra persona', fuente: 'simulado', propietario: 'Ana', propietario_id: 'otro', n_ninos: 80, definicion: { version: 2, y: [] } },
]

const api = (rol: 'admin' | 'experto' | 'visualizador') => (url: string) =>
  url === '/api/auth/refrescar' ? { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    : url === '/api/entrenamientos/cola' ? { cuerpo: cola }
      : url === '/api/entrenamientos/banco' ? { cuerpo: banco }
        : url === '/api/entrenamientos/2/cancelar' ? { cuerpo: {} }
          : url === '/api/muestras' ? { cuerpo: muestras }
            : url === '/api/exploracion/facetas' ? { cuerpo: { n: 900, minimo: 20, n_base: 1000, facetas: { sede: { etiqueta: 'Sede', tipo: 'lista', cuando: null, opciones: [{ valor: 'A', etiqueta: 'Sede A', n: 600, texto: '600' }] } } } }
              : url === '/api/muestras/contar' ? { cuerpo: { n: 150, n_base: 1000, minimo: 20, suficiente: true, huella: 'h' } } : undefined

describe('Mis modelos', () => {
  it('el visualizador no entra', async () => {
    simularApi(api('visualizador'))
    montar('/mis-modelos')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })

  it('muestra límites, cola con posición, banco con corte anterior y cancela el propio', async () => {
    const llamadas = simularApi(api('experto'))
    montar('/mis-modelos')
    expect(await screen.findByText('Mi prueba')).toBeInTheDocument()
    expect(screen.getByText(/1 de 3/)).toBeInTheDocument()
    expect(screen.getAllByText('Personal').length).toBeGreaterThan(0)
    expect(await screen.findByText('Corte anterior')).toBeInTheDocument()
    expect(screen.getByText('Prematuros')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrenar modelo nuevo' })).toBeDisabled()   // cola llena
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/entrenamientos/2/cancelar' && l.init?.method === 'POST')).toBe(true))
  })

  it('entrena con el nombre y envía solo lo escrito', async () => {
    const libre = { ...cola, items: [], limites: { ...cola.limites, cola_usada: 0 } }
    const llamadas = simularApi((url, init) => url === '/api/entrenamientos/cola' ? { cuerpo: libre }
      : url === '/api/entrenamientos/entrenar' && init?.method === 'POST' ? { estado: 202, cuerpo: {} } : api('experto')(url))
    montar('/mis-modelos')
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Prueba A')
    await userEvent.click(screen.getByRole('button', { name: 'Entrenar modelo nuevo' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/entrenamientos/entrenar')).toBe(true))
    const cuerpo = JSON.parse(String(llamadas.find((l) => l.url === '/api/entrenamientos/entrenar')?.init?.body))
    expect(cuerpo).toMatchObject({ nombre: 'Prueba A', muestra_id: null })
    expect(cuerpo.hiperparametros).toBeUndefined()
  })

  it('entrena con una muestra guardada elegida en el selector (solo las propias)', async () => {
    const libre = { ...cola, items: [], limites: { ...cola.limites, cola_usada: 0 } }
    const llamadas = simularApi((url, init) => url === '/api/entrenamientos/cola' ? { cuerpo: libre }
      : url === '/api/entrenamientos/entrenar' && init?.method === 'POST' ? { estado: 202, cuerpo: {} } : api('experto')(url))
    montar('/mis-modelos')
    const selector = await screen.findByLabelText('Muestra de niños')
    await screen.findByRole('option', { name: /Prematuros/ })
    expect(screen.queryByRole('option', { name: /De otra persona/ })).toBeNull()
    await userEvent.selectOptions(selector, '4')
    await userEvent.click(screen.getByRole('button', { name: 'Entrenar modelo nuevo' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/entrenamientos/entrenar')).toBe(true))
    expect(JSON.parse(String(llamadas.find((l) => l.url === '/api/entrenamientos/entrenar')?.init?.body))).toMatchObject({ muestra_id: 4 })
  })

  it('arma una muestra: cuenta en vivo, avisa de pocos niños y la guarda antes de entrenar', async () => {
    const libre = { ...cola, items: [], limites: { ...cola.limites, cola_usada: 0 } }
    const llamadas = simularApi((url, init) => url === '/api/entrenamientos/cola' ? { cuerpo: libre }
      : url === '/api/muestras' && init?.method === 'POST' ? { estado: 201, cuerpo: { ...muestras[0], id: 11 } }
        : url === '/api/entrenamientos/entrenar' && init?.method === 'POST' ? { estado: 202, cuerpo: {} } : api('experto')(url))
    montar('/mis-modelos')
    await userEvent.click(await screen.findByRole('button', { name: 'Armar una muestra' }))
    expect(await screen.findByText(/Son pocos niños \(150/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Cuántos niños'), 'estratificado')
    await userEvent.type(screen.getByLabelText('Desde'), '2018')
    await waitFor(() => {
      const c = llamadas.filter((l) => l.url === '/api/muestras/contar').map((l) => JSON.parse(String(l.init?.body)).muestra)
      expect(c.some((m) => m.tiempo?.desde === '2018' && m.muestreo.modo === 'estratificado' && m.muestreo.maximo_por_categoria === 500)).toBe(true)
    })
    expect(screen.getByRole('button', { name: 'Guardar y entrenar' })).toBeDisabled()    // falta el título
    await userEvent.type(screen.getByLabelText('Título de la muestra'), 'Nacidos desde 2018')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y entrenar' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/entrenamientos/entrenar')).toBe(true))
    const guardar = llamadas.find((l) => l.url === '/api/muestras' && l.init?.method === 'POST')
    expect(JSON.parse(String(guardar?.init?.body))).toMatchObject({ titulo: 'Nacidos desde 2018' })
    expect(JSON.parse(String(llamadas.find((l) => l.url === '/api/entrenamientos/entrenar')?.init?.body))).toMatchObject({ muestra_id: 11 })
  })
})

describe('Mis modelos: banco con medidas, filtros por dueño y límites del admin', () => {
  const banco2 = [
    { ...banco[0], id: 9, propietario: 'Ana', propietario_id: 'ana', propia: false, metricas: { clinico: { auc: 0.81, pr_auc: 0.32 } }, vence_en_dias: 5 },
    { ...banco[0], id: 10, propietario: 'Persona experto', propietario_id: 'yo', propia: true, nombre: 'El mío', auc: null, corte_anterior: false },
    { ...banco[0], id: 11, propietario: 'Admin', propietario_id: 'adm', visibilidad: 'oficial', nombre: 'Oficial base', auc: 0.9, corte_anterior: false, propia: false },
  ]
  const conBanco = (rol: 'admin' | 'experto') => (url: string, init?: { method?: string; body?: unknown }) =>
    url === '/api/entrenamientos/banco' ? { cuerpo: banco2 }
      : url === '/api/entrenamientos/cuotas' ? (init?.method === 'PUT' ? { cuerpo: JSON.parse(String(init.body)) } : { cuerpo: { cola_max: 1, modelos_max: 3, dias_sin_uso: 90, dias_aviso: 14 } })
        : api(rol)(url)

  it('muestra otras medidas, el aviso de borrado y filtra por etiqueta y por dueño', async () => {
    simularApi(conBanco('experto'))
    montar('/mis-modelos')
    expect(await screen.findByText('Precisión promedio: 0.32')).toBeInTheDocument()
    expect(screen.getByText('Se borra en 5 días si no se usa')).toBeInTheDocument()
    expect(screen.getByText('Oficial base')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'mios')
    expect(screen.getByText('El mío')).toBeInTheDocument()
    expect(screen.queryByText('Oficial base')).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'oficial')
    expect(screen.getByText('Oficial base')).toBeInTheDocument()
    expect(screen.queryByText('El mío')).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'todos')
    await userEvent.selectOptions(screen.getByLabelText('Dueño'), 'ana')
    expect(screen.queryByText('Oficial base')).toBeNull()
    expect(screen.queryByText('El mío')).toBeNull()
  })

  it('el experto no ve los límites editables; el admin los cambia', async () => {
    simularApi(conBanco('experto'))
    montar('/mis-modelos')
    await screen.findByText('Mi prueba')
    expect(screen.queryByRole('button', { name: 'Guardar límites' })).toBeNull()
  })

  it('el admin guarda los límites', async () => {
    const llamadas = simularApi(conBanco('admin'))
    montar('/mis-modelos')
    const dias = await screen.findByLabelText('Días sin uso antes de borrar')
    await userEvent.clear(dias)
    await userEvent.type(dias, '60')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar límites' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/entrenamientos/cuotas' && l.init?.method === 'PUT')).toBe(true))
    expect(JSON.parse(String(llamadas.find((l) => l.init?.method === 'PUT')?.init?.body))).toMatchObject({ dias_sin_uso: 60, cola_max: 1 })
  })
})
