// Tablero: lo que dice cada cifra y su encabezado. Sin «Paquete —» cuando no hay paquete, dos cifras que no repiten el
// mismo número y un contador de alarmas que coincide con lo que se lista.
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const corrida = { id: 3, estado: 'ok', tipo: 'completa', fuente: 'kmc', terminada: '2026-07-01T10:00:00Z', creada_en: '2026-07-01T09:00:00Z' }
const resumen = {
  corrida, corte: '2026-06-30', fuente: 'kmc', paquete: null, ninos: 800, datos: 16000, datos_revisar: 200,
  ninos_revisar: 90, datos_revisados: 12, alertas_por_1000: 12.5, alertas_por_capa: { '1': 50, '2': 90, '3': 60 },
  alarmas_grupo: 789, ninos_con_riesgo: 300, ninos_riesgo_alto: 40, riesgos_altos: 55, percentil_alto: 90,
  riesgos_por_desenlace: [], crecimiento_por_etapa: [],
}
const alarmas = Array.from({ length: 100 }, (_, i) => ({
  grupo: null, periodo: `2026Q${(i % 4) + 1}`, variable: `v${i}`, etiqueta: `Variable ${i}`, senal: 'cusum', valor: 1, referencia: 0, estadistico: 9,
  que_paso: `cambió la variable ${i}`,
}))

function api(rol: Usuario['rol'], paquete: string | null = null) {
  simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/tablero/resumen') return { cuerpo: { ...resumen, paquete } }
    if (url === '/api/tablero/alarmas-grupo') return { cuerpo: alarmas }
    return { cuerpo: {} }
  })
}

const cifra = (texto: string) => screen.getByText(texto).previousElementSibling?.textContent

describe('tablero', () => {
  it('no dice «Paquete —» ni «corrida» cuando la actualización no vino de un paquete', async () => {
    api('admin')
    montar('/')
    expect(await screen.findByText('niños con datos')).toBeInTheDocument()
    const encabezado = screen.getByRole('heading', { name: 'Tablero' }).parentElement!.textContent ?? ''
    expect(encabezado).toMatch(/Datos al 30 de jun/)
    expect(encabezado).not.toMatch(/Paquete|corrida|—/i)
  })

  it('con paquete lo dice, sin la palabra «corrida»', async () => {
    api('admin', 'p1')
    montar('/')
    expect(await screen.findByText('niños con datos')).toBeInTheDocument()
    const encabezado = screen.getByRole('heading', { name: 'Tablero' }).parentElement!.textContent ?? ''
    expect(encabezado).toMatch(/Paquete p1/)
    expect(encabezado).not.toMatch(/corrida/i)
  })

  it('«por revisar» y las respuestas de los expertos son cifras distintas', async () => {
    api('experto')
    montar('/')
    await screen.findByText('niños con datos')
    expect(cifra('datos por revisar · 12,5 por mil')).toBe('200')
    expect(cifra('datos ya respondidos por expertos')).toBe('12')
    expect(screen.queryByText('sin respuesta del experto')).not.toBeInTheDocument()
  })

  it('el contador de alarmas es el total y dice cuántas se listan', async () => {
    api('experto')
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Alarmas de grupo' })).closest('section')!
    expect(await within(panel).findByText('789 · se muestran las 100 más recientes')).toBeInTheDocument()
    expect(within(panel).getAllByRole('listitem')).toHaveLength(100)
  })
})
