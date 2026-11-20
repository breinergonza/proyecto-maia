// Ficha del niño, Calcular un niño, Calcular un grupo y Revisión de riesgos en pestañas (S15): lo que no cabe en una pantalla de
// escritorio se reparte por pregunta; la pestaña vive en la dirección, el estado sobrevive al cambiar de pestaña y la ficha
// imprime todas sus secciones.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CorteDeFamilia, RiesgoPorCorte } from '../api/ninos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const Ubicacion = () => <p>dirección: {useLocation().search}</p>

// ------------------------------------------------------------------ la ficha del niño

const riesgoNino = (id: number, clave: string, desenlace: string) => ({
  id, clave, desenlace, momento: '3 m EC', riesgo: 0.35, percentil: 89, motivos: ['Peso al nacer (peso_nacer) = 1240'], fecha_visita: '2026-03-01', riesgo_medio: 0.1,
})
const z = (edad: number, valor: number) => ({ etapa: '3 m EC', indicador: 'talla', fecha: null, edad_corregida: edad, valor: 50, unidad: 'cm', z: valor, bajo_2de: false, caida_1de: false, improbable: false })
const linea = {
  sujeto: 's1', grupo: null, eg_semanas: 30, anio_nacimiento: 2026, corte: '2026-06-30', corrida_id: 3, nombre_etapa: {}, contexto: [],
  crecimiento: { talla: [z(10, -0.5), z(60, -1)] },
  visitas: [{
    etapa: '3 m EC', nombre: '3 meses', orden: 4, fecha: '2026-03-01', edad_corregida: 90, z: {}, alertas_dato: [],
    mediciones: [{ variable: 'peso_3m', etiqueta: 'Peso a los 3 meses', valor: '5200', unidad: 'g', fecha: '2026-03-01', tema: 'crecimiento' }],
    riesgos: [riesgoNino(2, 'desarrollo_6m', 'desarrollo psicomotor bajo a los 6 meses')],
  }],
}
const corte = (clave: string, momento: string, nombre: string, orden: number, estado: CorteDeFamilia['estado']): CorteDeFamilia => ({
  clave, momento, momento_nombre: nombre, orden, estado, motivo_sin_riesgo: null, calibrado_con: 'nacidos de 2019 a 2021',
})
const t40 = corte('talla_baja_12m_desde_40', '40 sem', '40 semanas', 3, 'en_prueba')
const t3 = corte('talla_baja_12m_desde_3', '3 m EC', '3 meses', 4, 'en_prueba')
const d3 = corte('desarrollo_12m_desde_3', '3 m EC', '3 meses', 4, 'en_prueba')
const punto = (c: CorteDeFamilia, desenlace: string, riesgo: number, percentil: number) => ({
  clave: c.clave, desenlace, momento: c.momento, momento_nombre: c.momento_nombre, orden: c.orden, riesgo, percentil,
  fecha_visita: null, estado: c.estado, motivos: ['Peso al nacer (peso_nacer) = 1240'],
})
const historia = (dosFamilias = true): RiesgoPorCorte => ({
  paquete: 'p1', modelo: { version: 'a1b2c3d4e5', entrenado: '2026-11-19T10:00:00', corte_datos: '2026-06-30' },
  familias: [
    { clave: 'talla_baja_12m', nombre: 'talla baja a los 12 meses', definicion: null, estado: 'en_prueba', cortes: [t40, t3] },
    ...(dosFamilias ? [{ clave: 'desarrollo_12m', nombre: 'desarrollo psicomotor bajo a los 12 meses', definicion: null, estado: 'en_prueba' as const, cortes: [d3] }] : []),
  ],
  puntos: [
    punto(t40, 'talla baja a los 12 meses', 0.22, 78), punto(t3, 'talla baja a los 12 meses', 0.35, 89),
    ...(dosFamilias ? [punto(d3, 'desarrollo psicomotor bajo a los 12 meses', 0.6, 95)] : []),
  ],
})
const perfil = { variables: [{ variable: 'eg_semanas', etiqueta: 'Edad gestacional', unidad: 'semanas', ninos: 800, cuantiles: { p5: 28, p25: 31, p50: 33, p75: 35, p95: 36 }, valor: 31, posicion: 40 }] }

function apiFicha(h: RiesgoPorCorte | { paquete: string; puntos: [] } = historia()) {
  simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
    if (url === '/api/ninos/s1/linea-temporal') return { cuerpo: linea }
    if (url === '/api/ninos/s1/historia-riesgo?motivos=true') return { cuerpo: h }
    if (url === '/api/ninos/s1/historia-riesgo') return { cuerpo: { paquete: 'p1', paquete_corrida: 'p1', puntos: [
      { clave: 'desarrollo_6m', desenlace: 'desarrollo psicomotor bajo a los 6 meses', momento: '3 m EC', momento_nombre: '3 meses', orden: 4, riesgo: 0.3, percentil: 70, fecha_visita: null }] } }
    if (url === '/api/ninos/s1/perfil') return { cuerpo: perfil }
    return undefined
  })
}

// el panel de la pestaña elegida de unas pestañas: los demás paneles, ocultos por clase, no llevan rol ni id
const panel = (prefijo: string) => within(document.getElementById(`${prefijo}-panel`)!)
const textos = (lista: HTMLElement) => within(lista).getAllByRole('tab').map((t) => t.textContent)

describe('ficha del niño en pestañas', () => {
  it('una pestaña por desenlace de 12 meses y luego una por pregunta; abre la primera con su riesgo visita por visita', async () => {
    apiFicha()
    montar('/ninos/s1')
    const lista = await screen.findByRole('tablist', { name: 'Qué ver de este niño' })
    await waitFor(() => expect(textos(lista)).toEqual([
      'Talla baja a 12 meses', 'Desarrollo psicomotor bajo a 12 meses', 'Otros riesgos', 'Crecimiento', 'Frente a los demás niños', 'Visitas']))
    expect(within(lista).getByRole('tab', { name: 'Talla baja a 12 meses' })).toHaveAttribute('aria-selected', 'true')
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('Calculado a 40 semanas')).toBeInTheDocument()
    expect(within(panel).getByText('Calculado a 3 meses')).toBeInTheDocument()
    expect(within(panel).getByText('Modelo en prueba: aún no se ha comprobado si, de cada 100 niños con un riesgo de 35 %, unos 35 tienen talla baja a los 12 meses.')).toBeInTheDocument()
    // el nombre y los datos del niño quedan arriba de las pestañas
    expect(screen.getByRole('heading', { level: 1, name: 'Niño s1' })).toBeInTheDocument()
  })

  it('elegir una pestaña cambia el panel y la dirección; la dirección también la elige', async () => {
    apiFicha()
    montar('/ninos/s1', <Ubicacion />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Crecimiento' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Crecimiento frente a la OMS')
    expect(screen.getByText(/^dirección:/)).toHaveTextContent('ver=crecimiento')
    await userEvent.click(screen.getByRole('tab', { name: 'Desarrollo psicomotor bajo a 12 meses' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Riesgo de desarrollo psicomotor bajo a los 12 meses')
    expect(screen.getByText(/^dirección:/)).toHaveTextContent('ver=riesgo-desarrollo_12m')
  })

  it('con la pestaña en la dirección abre esa', async () => {
    apiFicha()
    montar('/ninos/s1?ver=visitas')
    const visitas = await screen.findByRole('tab', { name: 'Visitas' })
    expect(visitas).toHaveAttribute('aria-selected', 'true')
    expect(await within(screen.getByRole('tabpanel')).findByText('Peso a los 3 meses')).toBeInTheDocument()
  })

  it('lo que se abrió en una pestaña sigue ahí al volver a ella', async () => {
    apiFicha()
    montar('/ninos/s1')
    await screen.findByRole('tablist', { name: 'Qué ver de este niño' })
    const tabla = () => within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Ver como tabla' })
    await userEvent.click(tabla())
    expect(tabla()).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Visitas' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Talla baja a 12 meses' }))
    expect(tabla()).toHaveAttribute('aria-pressed', 'true')
  })

  it('al imprimir salen todas las secciones, no solo la pestaña abierta, y las pestañas no se imprimen', async () => {
    apiFicha()
    montar('/ninos/s1')
    const lista = await screen.findByRole('tablist', { name: 'Qué ver de este niño' })
    expect(lista).toHaveClass('no-imprimir')
    const visitas = (await screen.findByText('Peso a los 3 meses')).closest('[class*="print:block"]')
    expect(visitas).not.toBeNull()
    expect(visitas).toHaveClass('hidden')   // en pantalla se ve una sola; en papel, todas
    expect(screen.getByRole('heading', { name: 'Crecimiento frente a la OMS' }).closest('[class*="print:block"]')).toHaveClass('hidden')
    expect(screen.getByRole('heading', { name: 'Al nacer, frente a los demás niños' })).toBeInTheDocument()
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  })

  it('sin desenlaces de 12 meses en la API, la primera pestaña es «Otros riesgos»', async () => {
    apiFicha({ paquete: 'p1', puntos: [] })
    montar('/ninos/s1')
    const lista = await screen.findByRole('tablist', { name: 'Qué ver de este niño' })
    expect(textos(lista)).toEqual(['Otros riesgos', 'Crecimiento', 'Frente a los demás niños', 'Visitas'])
    expect(within(lista).getByRole('tab', { name: 'Otros riesgos' })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('tabpanel')).getByRole('region', { name: 'Riesgo calculado' })).toBeInTheDocument()
  })
})

// ------------------------------------------------------------------ Calcular un niño

const campo = (variable: string, etiqueta: string, extra = {}) => ({
  variable, etiqueta, tipo: 'numero', unidad: 'g', tema: null, opciones: [], minimo: null, maximo: null, crecimiento: false, peso: 0, principal: true, ...extra,
})
const formulario = {
  paquete: 'p1', fuente: 'simulado', generales: [],
  visitas: [
    { etapa: 'nacimiento', nombre: 'Nacimiento', orden: 1, base: 'cronologica', edad_min: 0, edad_max: 3, desenlaces: [], campos: [campo('peso_nacer', 'Peso al nacer')] },
    { etapa: '3 m EC', nombre: '3 meses (edad corregida)', orden: 4, base: 'corregida', edad_min: 45, edad_max: 135,
      desenlaces: ['desarrollo psicomotor bajo a los 6 meses'], campos: [campo('peso_3m', 'Peso a 3 m EC')] },
  ],
}
const resultado = {
  paquete: 'p1', fuente: 'simulado', variables_ignoradas: [], modelo_clinico: 'a1b2c3d4e5',
  historia: historia(false),
  riesgos: [{ sujeto: 'calculo', clave: 'des6', desenlace: 'desarrollo psicomotor bajo a los 6 meses', momento: '3 m EC', riesgo: 0.31, percentil: 96, motivos: [], fecha_visita: null }],
  alertas_dato: [{ sujeto: 'calculo', variable: 'peso_3m', etiqueta: 'Peso a 3 m EC', etapa: '3 m EC', valor: '9999', esperado: 5000, rango_bajo: 4000, rango_alto: 6500, capas: ['1'], motivo: 'posible error de unidad', prioridad: 1 }],
  crecimiento: [{ sujeto: 'calculo', etapa: '3 m EC', indicador: 'peso', fecha: '2026-05-10', edad_corregida: 60, valor: 9999, unidad: 'g', z: -2.6, bajo_2de: true, caida_1de: true, improbable: false }],
}

function apiCalculo() {
  const enviados: unknown[] = []
  simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
    if (url === '/api/modelos/activo') return { cuerpo: { version: 'p1', fuente: 'simulado', activo: true, metricas: {}, modelos: {} } }
    if (url === '/api/inferencia/formulario') return { cuerpo: formulario }
    if (url === '/api/inferencia') { enviados.push(JSON.parse(String(init?.body))); return { cuerpo: resultado } }
    return { cuerpo: {} }
  })
  return enviados
}

const llenarNino = async () => {
  await userEvent.type(await screen.findByLabelText('Fecha de nacimiento'), '2026-01-10')
  await userEvent.type(screen.getByLabelText('Semanas de gestación al nacer'), '30')
}

describe('Calcular un niño en pestañas', () => {
  it('los datos y cada visita son pestañas; cada una dice cuántos datos tiene y se ve una a la vez', { timeout: 20_000 }, async () => {
    apiCalculo()
    montar('/prediccion')
    await llenarNino()
    const visitas = await screen.findByRole('tablist', { name: 'Visitas' })
    expect(textos(visitas)).toEqual(['Nacimiento', '3 meses'])
    expect(within(visitas).getByRole('tab', { name: 'Nacimiento' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.type(screen.getByLabelText('Peso al nacer (g)'), '900')
    expect(within(visitas).getByRole('tab', { name: /^Nacimiento/ })).toHaveTextContent('1 dato')
    // la otra visita no se ve, pero lo escrito en la primera sigue ahí al volver
    await userEvent.click(within(visitas).getByRole('tab', { name: '3 meses' }))
    expect(panel('visita').getByLabelText('Peso a 3 m EC (g)')).toBeInTheDocument()
    expect(document.querySelectorAll('[role="tabpanel"]#visita-panel')).toHaveLength(1)   // una sola visita a la vez
    await userEvent.click(within(visitas).getByRole('tab', { name: /^Nacimiento/ }))
    expect(screen.getByLabelText('Peso al nacer (g)')).toHaveValue('900')
  })

  it('antes de calcular, «Resultado» dice cómo verlo; «Calcular el riesgo» está a la vista', async () => {
    apiCalculo()
    montar('/prediccion')
    await screen.findByLabelText('Fecha de nacimiento')
    const lista = screen.getByRole('tablist', { name: 'Qué ver del cálculo' })
    expect(textos(lista)).toEqual(['Datos del niño', 'Resultado'])
    await userEvent.click(within(lista).getByRole('tab', { name: 'Resultado' }))
    expect(panel('calculo').getByText('Aquí aparecerá el resultado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calcular el riesgo' })).toBeEnabled()
  })

  it('al calcular aparecen las pestañas del resultado y se abre la primera', { timeout: 20_000 }, async () => {
    const enviados = apiCalculo()
    montar('/prediccion')
    await llenarNino()
    await userEvent.type(screen.getByLabelText('Peso al nacer (g)'), '900')
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    await waitFor(() => expect(enviados).toHaveLength(1))
    const lista = screen.getByRole('tablist', { name: 'Qué ver del cálculo' })
    await waitFor(() => expect(textos(lista)).toEqual(['Datos del niño', 'Talla baja a 12 meses', 'Otros riesgos', 'Datos que parecen raros 1', 'Crecimiento']))
    expect(within(lista).getByRole('tab', { name: 'Talla baja a 12 meses' })).toHaveAttribute('aria-selected', 'true')
    expect(panel('calculo').getByText('Calculado a 3 meses')).toBeInTheDocument()
    await userEvent.click(within(lista).getByRole('tab', { name: /^Datos que parecen raros/ }))
    expect(panel('calculo').getByText('Parece anotado en otra unidad (por ejemplo, kilos en lugar de gramos).')).toBeInTheDocument()
  })

  it('un error en una visita oculta se ve en su pestaña y se abre', { timeout: 20_000 }, async () => {
    const enviados = apiCalculo()
    montar('/prediccion')
    await llenarNino()
    const visitas = await screen.findByRole('tablist', { name: 'Visitas' })
    await userEvent.click(within(visitas).getByRole('tab', { name: '3 meses' }))
    await userEvent.type(screen.getByLabelText('Peso a 3 m EC (g)'), '5000')
    await userEvent.click(within(visitas).getByRole('tab', { name: /^Nacimiento/ }))   // la visita con el error queda oculta
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByText('Escriba la fecha de la visita «3 meses (edad corregida)».')).toBeInTheDocument()
    expect(enviados).toEqual([])
    const conError = within(visitas).getByRole('tab', { name: /^3 meses/ })
    expect(conError).toHaveTextContent('Revisar')
    expect(conError).toHaveAttribute('aria-selected', 'true')
  })
})
