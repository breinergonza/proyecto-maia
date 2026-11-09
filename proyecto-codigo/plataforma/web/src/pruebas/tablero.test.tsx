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

  it('crecimiento como líneas por visita y alarmas como serie por trimestre', async () => {
    const crecimiento = [
      { etapa: 'm3', etapa_nombre: '3 meses (edad corregida)', orden: 3, indicador: 'peso', datos: 400, pct_bajo: 8, pct_caida: 3, z_mediano: -0.5 },
      { etapa: 's40', etapa_nombre: '40 semanas', orden: 2, indicador: 'peso', datos: 500, pct_bajo: 12, pct_caida: 4, z_mediano: -0.8 },
      { etapa: 's40', etapa_nombre: '40 semanas', orden: 2, indicador: 'talla', datos: 480, pct_bajo: 15, pct_caida: 2, z_mediano: -1 },
    ]
    const trimestres = [
      { periodo: '2025 T2', senal: 'redondeo', alarmas: 2 },
      { periodo: '2025 T4', senal: 'datos faltantes', alarmas: 1 },
    ]
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url === '/api/tablero/resumen') return { cuerpo: { ...resumen, crecimiento_por_etapa: crecimiento } }
      if (url === '/api/tablero/alarmas-grupo') return { cuerpo: alarmas }
      if (url === '/api/tablero/alarmas-por-trimestre') return { cuerpo: trimestres }
      return { cuerpo: {} }
    })
    montar('/')
    // visitas en orden (40 semanas antes que 3 meses) y una medida sin dato en una visita no corre a las demás
    expect(await screen.findByRole('figure', { name: 'Porcentaje de niños bajo para la edad en cada visita: '
      + 'Peso para la edad, 40 semanas 12,0 %, 3 meses EC 8,0 %; Talla para la edad, 40 semanas 15,0 %, 3 meses EC sin dato' }))
      .toBeInTheDocument()
    expect(screen.getByText('Ver la tabla')).toBeInTheDocument()
    // el trimestre sin alarmas (2025 T3) cuenta en el eje; las señales se dicen en palabras del equipo clínico
    expect(await screen.findByRole('figure', { name: '3 alarmas de grupo entre 2025 T2 y 2025 T4: '
      + '2025 T2, 2 por más valores redondeados; 2025 T4, 1 por más datos faltantes' })).toBeInTheDocument()
    expect(screen.getByText('Más valores redondeados')).toBeInTheDocument()
  })
})
