// Anticipación: familias con sus tres artefactos (avisados antes, primera alerta, métricas por visita) y niños de ejemplo.
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { DESCRIPCIONES } from '../lib/descripciones'
import { familia } from '../lib/lenguaje'
import { SUBMODULOS } from '../paginas/analitica/submodulos'
import { montar, simularApi, usuario } from './util'

vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 15_000 })
afterEach(() => vi.unstubAllGlobals())

const contexto = {
  estado: 'ok', entrenamiento: 7,
  modelos: [{ modelo: 'clinico', registro: 'maia', version_registro: 3, fuente: 'simulado', corte: '2026-06-30' }],
  desenlaces: [{ clave: 'readm_6m', nombre: 'Readmisión entre los 3 y los 6 meses', etiqueta: 'En uso' }],
  submodulos: SUBMODULOS.map((s) => ({ id: s.id, estado: 'ok' })),
  entrenamientos: [{ entrenamiento: 7, creada: '2026-07-01T10:00:00Z' }],
}
const por = (t: number, a: number, d: number | null, c: number | null) => ({ top_pct: t, alertas: a, casos_detectados_pct: d, alertas_acertadas_pct: c })
const familiaReadm = {
  nombre: 'readmisión entre los 3 y los 6 meses', etiqueta: 'En uso', top_pct: 10,
  visitas: [
    { desde: 'entrada PMC', etapa: '6 m EC', ventaja_visitas: 3, casos: 40, alertas: 30, casos_detectados_pct: 25, alertas_acertadas_pct: 33 },
    { desde: '3 m EC', etapa: '6 m EC', ventaja_visitas: 1, casos: 36, alertas: 28, casos_detectados_pct: 40, alertas_acertadas_pct: 51 },
  ],
  avisados_antes: { casos: 44, avisados: 22, pct: 50, meta: 'D12: avisar al menos una visita antes del desenlace' },
  metricas_por_visita: {
    familia: 'readm_6m', nombre: 'readmisión entre los 3 y los 6 meses', tops: [5, 10, 20, 30, 40],
    visitas: [
      { desde: 'entrada PMC', etapa: '6 m EC', ventaja_visitas: 3, n: 300, casos: 40, auc: 0.61,
        por_top: [por(5, 15, 12, 40), por(10, 30, 25, 33), por(20, 60, 41, 27), por(30, 90, 55, 24), por(40, 120, 64, 21)] },
      { desde: '3 m EC', etapa: '6 m EC', ventaja_visitas: 1, n: 280, casos: 36, auc: 0.72,
        por_top: [por(5, 14, 20, 50), por(10, 28, 40, 51), por(20, 56, 58, 40), por(30, 84, 70, 33), por(40, 112, 80, 28)] },
    ],
  },
  primera_alerta: {
    familia: 'readm_6m', nombre: 'readmisión entre los 3 y los 6 meses', top_pct: 10, casos: 44, meta: 'D12',
    distribucion: [{ desde: 'entrada PMC', ventaja_visitas: 3, casos: 11, pct: 25 }, { desde: '3 m EC', ventaja_visitas: 1, casos: null, pct: null }],
    sin_alerta: { casos: 22, pct: 50 }, ventaja_visitas: { media: null, mediana: null },
  },
}
const riesgoNinos = {
  corrida_id: 4, desenlace: 'readm_6m', umbral_percentil: 90, elegidos_por: 'mayor_riesgo',
  ninos: [{
    sujeto: 'N-017', primera_alerta: { clave: 'readm_6m_desde_pmc', momento: 'entrada PMC', momento_nombre: 'Entrada al programa', orden: 1, percentil: 93 },
    puntos: [
      { clave: 'readm_6m_desde_pmc', desenlace: 'readmisión', momento: 'entrada PMC', momento_nombre: 'Entrada al programa', orden: 1, riesgo: 0.4, percentil: 93, fecha_visita: null },
      { clave: 'readm_6m', desenlace: 'readmisión', momento: '3 m EC', momento_nombre: '3 meses', orden: 3, riesgo: 0.5, percentil: 96, fecha_visita: null },
    ],
  }],
}

function api(rol: Usuario['rol'], ninos: 'ok' | 'error' = 'ok') {
  return simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/analitica/entrenamientos') return { cuerpo: { entrenamientos: contexto.entrenamientos.map((m) => ({ ...m, modelo: 'clinico', desenlaces: contexto.desenlaces, submodulos: contexto.submodulos })) } }
    if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
    if (url.startsWith('/api/analitica/riesgo-por-visita')) return ninos === 'ok' ? { cuerpo: riesgoNinos } : { estado: 409, cuerpo: { detail: 'No hay un paquete' } }
    if (/^\/api\/analitica\/7\/anticipacion/.test(url)) {
      return { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'anticipacion', desenlaces: { readm_6m: familiaReadm } } }
    }
    return undefined
  })
}

describe('anticipación', () => {
  it('trae todas las familias, sin pedir un solo desenlace, y muestra los tres artefactos', async () => {
    const llamadas = api('experto')
    montar('/analitica/anticipacion?entrenamiento=7')
    expect(await screen.findByText('Casos avisados al menos una visita antes')).toBeInTheDocument()
    expect(screen.getByText('50,0 %')).toBeInTheDocument()
    expect(llamadas.some((l) => l.url === '/api/analitica/7/anticipacion')).toBe(true)
    expect(screen.getByText('Cuántas visitas antes se avisó cada caso')).toBeInTheDocument()
    expect(screen.getByText(/Las partes con menos de 5 casos se omiten \(n menor que 5\)/)).toBeInTheDocument()
    // el resto de los artefactos está en las otras pestañas
    fireEvent.click(screen.getByRole('tab', { name: 'Qué cuesta avisar antes' }))
    expect(await screen.findByText('El precio de avisar antes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Tabla y niños de ejemplo' }))
    const tabla = (await screen.findByText('Cada visita de cálculo')).closest('section, div') as HTMLElement
    expect(within(tabla.parentElement as HTMLElement).getAllByText('0,72').length).toBeGreaterThan(0)
  })

  it('el porcentaje de alerta cambia los casos detectados de la tabla', async () => {
    api('experto')
    montar('/analitica/anticipacion?entrenamiento=7&ver=tabla')
    await screen.findByText('Cada visita de cálculo')
    expect(screen.getAllByText('40,0 %').length).toBeGreaterThan(0)   // 3 m EC con el 10 %
    fireEvent.change(screen.getByLabelText('Alertar a los niños con más riesgo'), { target: { value: '40' } })
    await waitFor(() => expect(screen.getAllByText('80,0 %').length).toBeGreaterThan(0))
  })

  it('el experto ve niños de ejemplo con su primera alerta; el visualizador no los pide', async () => {
    const experto = api('experto')
    montar('/analitica/anticipacion?entrenamiento=7&ver=tabla')
    expect(await screen.findByRole('link', { name: 'N-017' })).toBeInTheDocument()
    expect(screen.getByText('Primera alerta: Entrada al programa')).toBeInTheDocument()
    expect(experto.some((l) => l.url.startsWith('/api/analitica/riesgo-por-visita?desenlace=readm_6m'))).toBe(true)
    vi.unstubAllGlobals()
    const visor = api('visualizador')
    montar('/analitica/anticipacion?entrenamiento=7')
    await screen.findAllByText('Casos avisados al menos una visita antes')
    expect(screen.queryByText('Riesgo de tres niños, visita por visita')).not.toBeInTheDocument()
    expect(visor.some((l) => l.url.includes('riesgo-por-visita'))).toBe(false)
  })

  it('sin corrida o sin modelo activo avisa y no rompe la pantalla', async () => {
    api('experto', 'error')
    montar('/analitica/anticipacion?entrenamiento=7&ver=tabla')
    expect(await screen.findByText(/Todavía no hay una corrida con un modelo activo/)).toBeInTheDocument()
    expect(screen.getByText('Cada visita de cálculo')).toBeInTheDocument()
  })
})

describe('catálogo y familias', () => {
  it('las descripciones de Anticipación existen y caben en 160 caracteres', () => {
    for (const k of ['anticipacion', 'anticipacion_avisados', 'anticipacion_ventaja', 'anticipacion_precio', 'anticipacion_tabla', 'anticipacion_ninos']) {
      expect(DESCRIPCIONES[k], k).toBeDefined()
      expect(DESCRIPCIONES[k].descripcion.length, k).toBeLessThanOrEqual(160)
    }
  })

  it('familia() agrupa las claves desde la entrada al programa', () => {
    expect(familia('readm_6m_desde_pmc')).toBe('readm_6m')
    expect(familia('readm_6m_desde_40')).toBe('readm_6m')
    expect(familia('readm_6m')).toBe('readm')
  })
})
