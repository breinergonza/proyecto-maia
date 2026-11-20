// La ficha del niño con «Riesgo a los 12 meses, visita por visita» (S7): arriba de las tarjetas, sin repetir lo que ya cuenta,
// y con una falla de red dicha con reintento.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RiesgoPorCorte } from '../api/ninos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const riesgoNino = (id: number, clave: string, desenlace: string, momento: string) => ({
  id, clave, desenlace, momento, riesgo: 0.35, percentil: 89, motivos: ['Peso al nacer (peso_nacer) = 1240'], fecha_visita: '2026-03-01', riesgo_medio: 0.1,
})
const linea = {
  sujeto: 's1', grupo: null, eg_semanas: 30, anio_nacimiento: 2026, corte: '2026-06-30', corrida_id: 3, nombre_etapa: {}, contexto: [], crecimiento: {},
  visitas: [{
    etapa: '3 m EC', nombre: '3 meses', orden: 4, fecha: '2026-03-01', edad_corregida: 90, mediciones: [], z: {}, alertas_dato: [],
    riesgos: [riesgoNino(1, 'talla_baja_12m_desde_3', 'talla baja a los 12 meses (riesgo calculado a 3 m EC)', '3 m EC'),
      riesgoNino(2, 'desarrollo_6m', 'desarrollo psicomotor bajo a los 6 meses', '3 m EC')],
  }],
}
const corte = (clave: string, momento: string, nombre: string, orden: number) => ({
  clave, momento, momento_nombre: nombre, orden, estado: 'en_prueba' as const, motivo_sin_riesgo: null, calibrado_con: 'nacidos de 2019 a 2021',
})
const c40 = corte('talla_baja_12m_desde_40', '40 sem', '40 semanas', 3)
const c3 = corte('talla_baja_12m_desde_3', '3 m EC', '3 meses', 4)
const punto = (c: typeof c40, riesgo: number, percentil: number) => ({
  clave: c.clave, desenlace: 'talla baja a los 12 meses', momento: c.momento, momento_nombre: c.momento_nombre, orden: c.orden, riesgo, percentil,
  fecha_visita: null, estado: 'en_prueba' as const, motivos: ['Peso al nacer (peso_nacer) = 1240'],
})
const historia: RiesgoPorCorte = {
  paquete: 'p1', modelo: { version: 'a1b2c3d4e5', entrenado: '2026-11-19T10:00:00', corte_datos: '2026-06-30' },
  familias: [{ clave: 'talla_baja_12m', nombre: 'talla baja a los 12 meses', definicion: null, estado: 'en_prueba', cortes: [c40, c3] }],
  puntos: [punto(c40, 0.22, 78), punto(c3, 0.35, 89)],
}

function api(historiaDe: () => { estado?: number; cuerpo: unknown }, extra: { linea?: unknown; trayectoria?: unknown[] } = {}) {
  return simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
    if (url === '/api/ninos/s1/linea-temporal') return { cuerpo: extra.linea ?? linea }
    if (url === '/api/ninos/s1/historia-riesgo?motivos=true') return historiaDe()
    if (url === '/api/ninos/s1/historia-riesgo') return { cuerpo: { paquete: 'p1', paquete_corrida: 'p1', puntos: extra.trayectoria ?? [] } }
    if (url === '/api/ninos/s1/perfil') return { cuerpo: { variables: [] } }
    return undefined
  })
}

describe('ficha del niño: riesgo a los 12 meses', () => {
  it('cada tarjeta dice si su modelo está en uso o en prueba y con qué versión se calculó', async () => {
    const otra = riesgoNino(3, 'desarrollo_12m_desde_3', 'desarrollo bajo a los 12 meses (riesgo calculado a 3 m EC)', '3 m EC')
    api(() => ({ cuerpo: historia }), { linea: { ...linea, modelo_clinico: 'f00dcafe12', visitas: [{ ...linea.visitas[0], riesgos: [...linea.visitas[0].riesgos, otra] }] } })
    montar('/ninos/s1')
    const tarjeta = async (nombre: string) => (await screen.findByText(nombre, { selector: 'h2' })).closest('article')!
    const enUso = await tarjeta('desarrollo psicomotor bajo a los 6 meses')
    expect(within(enUso).getByText('En uso')).toBeInTheDocument()
    expect(within(enUso).getByText('Modelo clínico f00dcafe12')).toBeInTheDocument()
    const enPrueba = await tarjeta('desarrollo bajo a los 12 meses (riesgo calculado a 3 m EC)')
    expect(within(enPrueba).getByText('En prueba')).toBeInTheDocument()
    expect(within(enPrueba).queryByText('En uso')).not.toBeInTheDocument()
    expect(within(enPrueba).getByText('Modelo clínico f00dcafe12')).toBeInTheDocument()
  })

  it('va arriba de las tarjetas y no las repite', async () => {
    const llamadas = api(() => ({ cuerpo: historia }))
    montar('/ninos/s1')
    const seccion = await screen.findByRole('heading', { level: 2, name: 'Riesgo a los 12 meses, visita por visita' })
    expect(screen.getAllByText(/^Calculado a /)).toHaveLength(2)
    expect(llamadas.some((l) => l.url === '/api/ninos/s1/historia-riesgo?motivos=true')).toBe(true)

    const tarjetas = await screen.findByRole('region', { name: 'Riesgo calculado' })
    expect(seccion.compareDocumentPosition(tarjetas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // la tarjeta de talla baja ya está en la sección; la de otro desenlace sigue
    expect(within(tarjetas).queryByText('talla baja a los 12 meses (riesgo calculado a 3 m EC)')).not.toBeInTheDocument()
    expect(within(tarjetas).getByText('desarrollo psicomotor bajo a los 6 meses')).toBeInTheDocument()
  })

  it('una falla de red se dice con un reintento que recupera la sección', async () => {
    let falla = true
    api(() => (falla ? { estado: 500, cuerpo: { detail: 'No se pudo calcular el riesgo en las visitas anteriores de este niño.' } } : { cuerpo: historia }))
    montar('/ninos/s1')
    const aviso = await screen.findAllByText('No se pudo calcular el riesgo en las visitas anteriores de este niño.')
    expect(aviso.length).toBeGreaterThan(0)
    // el resto de la ficha sigue a la vista
    expect(await screen.findByRole('heading', { name: 'Niño s1' })).toBeInTheDocument()
    falla = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Calculado a 3 meses')).toBeInTheDocument()
  })

  it('con una API anterior (sin las familias) la ficha queda como estaba', async () => {
    api(() => ({ cuerpo: { paquete: 'p1', puntos: [] } }))
    montar('/ninos/s1')
    expect(await screen.findByRole('region', { name: 'Riesgo calculado' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Riesgo a los 12 meses, visita por visita' })).not.toBeInTheDocument()
    expect(screen.getByText('talla baja a los 12 meses (riesgo calculado a 3 m EC)')).toBeInTheDocument()
  })

  it('el índice de la ficha lleva a riesgo, crecimiento y visitas, y las curvas de crecimiento van antes que el resto', async () => {
    const z = (edad: number, valor: number) => ({ etapa: '3 m EC', indicador: 'talla', fecha: null, edad_corregida: edad, valor: 50, unidad: 'cm', z: valor, bajo_2de: false, caida_1de: false, improbable: false })
    const conCrecimiento = { ...linea, crecimiento: { talla: [z(10, -0.5), z(60, -1)] } }
    api(() => ({ cuerpo: historia }), { linea: conCrecimiento })
    montar('/ninos/s1')
    const indice = await screen.findByRole('navigation', { name: 'En esta ficha' })
    expect(indice).toHaveClass('no-imprimir')
    const enlaces = within(indice).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])
    expect(enlaces).toEqual([['Riesgo a 12 meses', '#riesgo-12-meses'], ['Crecimiento', '#crecimiento'], ['Visitas', '#visitas']])
    for (const [, href] of enlaces) expect(document.querySelector(href!)).not.toBeNull()
    // el crecimiento viene antes que las tarjetas del resto de desenlaces
    const crecimiento = screen.getByRole('heading', { name: 'Crecimiento frente a la OMS' })
    const tarjetas = await screen.findByRole('region', { name: 'Riesgo calculado' })
    expect(crecimiento.compareDocumentPosition(tarjetas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('«Riesgo en cada visita» no repite los desenlaces que la sección de 12 meses ya cuenta', async () => {
    const punto = (clave: string, desenlace: string) => ({ clave, desenlace, momento: '3 m EC', momento_nombre: '3 meses', orden: 4, riesgo: 0.3, percentil: 70, fecha_visita: null })
    api(() => ({ cuerpo: historia }), { trayectoria: [
      punto('talla_baja_12m_desde_3', 'talla baja a los 12 meses (riesgo calculado a 3 m EC)'),
      punto('desarrollo_6m', 'desarrollo psicomotor bajo a los 6 meses'),
    ] })
    montar('/ninos/s1')
    expect(await screen.findByRole('heading', { level: 3, name: 'Desarrollo psicomotor bajo a los 6 meses' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Talla baja a los 12 meses' })).not.toBeInTheDocument()
  })
})
