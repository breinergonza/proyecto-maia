// Trayectorias, perfiles y anticipación: con datos de ejemplo y en estado pendiente.
import { configure, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { SUBMODULOS } from '../paginas/analitica/submodulos'
import { montar, simularApi, usuario } from './util'

vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 15_000 })
afterEach(() => vi.unstubAllGlobals())

const contexto = {
  estado: 'ok', entrenamiento: 7,
  modelos: [{ modelo: 'clinico', registro: 'maia', version_registro: 3, fuente: 'simulado', corte: '2026-06-30' }],
  desenlaces: [{ clave: 'talla_baja_12m', nombre: 'Talla baja a 12 meses', etiqueta: 'En prueba' }],
  submodulos: SUBMODULOS.map((s) => ({ id: s.id, estado: 'ok' })),
  entrenamientos: [{ entrenamiento: 7, creada: '2026-07-01T10:00:00Z' }],
}
const etapa = (e: string, nombre: string, orden: number, z: number | null, n = 12) => ({
  etapa: e, nombre, orden, n, edad_media_meses: orden * 3, z_media: z, z_desvio: 0.8, diferencia_oms: z, valor_medio: 5.2, valor_desvio: 0.5, unidad: 'kg',
})
const tray = {
  estado: 'ok', entrenamiento: 7, indicador: 'peso', etiqueta: 'En uso', individuales_visibles: true,
  grupos: [
    { grupo: 'Riesgo alto', ninos: 12, etapas: [etapa('3m', '3 meses', 1, -1.2), etapa('6m', '6 meses', 2, -1.5)] },
    { grupo: 'Resto', ninos: 40, etapas: [etapa('3m', '3 meses', 1, 0.1), etapa('6m', '6 meses', 2, 0.2)] },
    { grupo: 'Pocos', ninos: 3, etapas: [etapa('3m', '3 meses', 1, -0.4, 3), etapa('6m', '6 meses', 2, null, 1)] },
  ],
  individuales: [{ codigo: 'N-001', grupo: 'Riesgo alto', serie: [{ etapa: '3m', nombre: '3 meses', orden: 1, edad_meses: 3, z: -1.4 }] }],
}
const perfiles = {
  estado: 'ok', entrenamiento: 7, ninos: 100, unidad_peso: 'g',
  confianza: { aprobacion: 'pendiente' }, tasa_significa: 'proporción de niños con riesgo alto',
  eg: [{ categoria: 'a', etiqueta: 'Muy prematuro', n: 20, tasa: 0.25, eg_media: 29.5, peso_medio: 1200 },
    { categoria: 'b', etiqueta: 'Prematuro tardío', n: 3, tasa: 0.33 }],
  lubchenco: [{ categoria: 'c', etiqueta: 'Pequeño para la edad', n: 15, tasa: 0.4, eg_media: 33, peso_medio: 1500 }],
}
const anticipacion = {
  talla_baja_12m: {
    nombre: 'talla baja a los 12 meses', etiqueta: 'En prueba', top_pct: 10,
    visitas: [
      { desde: '3 m EC', etapa: '12 m EC', ventaja_visitas: 3, casos: 12, alertas: 20, casos_detectados_pct: 30, alertas_acertadas_pct: 40 },
      { desde: '6 m EC', etapa: '12 m EC', ventaja_visitas: 2, casos: 3, alertas: 20, casos_detectados_pct: 33.3, alertas_acertadas_pct: 15 },
    ],
    avisados_antes: { casos: 12, avisados: 6, pct: 50, meta: 'avisar al menos una visita antes del desenlace' },
  },
}

function api(rol: Usuario['rol'], pendiente = false) {
  return simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/analitica/entrenamientos') return { cuerpo: { entrenamientos: contexto.entrenamientos.map((m) => ({ ...m, modelo: 'clinico', desenlaces: contexto.desenlaces, submodulos: contexto.submodulos })) } }
    if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
    const m = url.match(/^\/api\/analitica\/7\/(trayectorias|perfiles|anticipacion)/)
    if (!m) return undefined
    if (pendiente) return { cuerpo: { estado: 'pendiente', entrenamiento: 7, submodulo: m[1], mensaje: 'Todavía no hay una corrida con datos.', desenlaces: {} } }
    if (m[1] === 'trayectorias') return { cuerpo: tray }
    if (m[1] === 'perfiles') return { cuerpo: perfiles }
    return { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'anticipacion', desenlaces: anticipacion } }
  })
}

describe('analítica viva', () => {
  it('trayectorias: tabla frente a la OMS, niños individuales con enlace y selectores', async () => {
    const llamadas = api('experto')
    montar('/analitica/trayectorias?entrenamiento=7&ver=oms')   // cada pregunta tiene su pestaña (?ver=): aquí, la tabla frente a la OMS
    expect(await screen.findByText('Diferencia con la OMS (z)')).toBeInTheDocument()
    expect(screen.getAllByText('Riesgo alto').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/5,2 kg/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pocos').length).toBeGreaterThan(0)   // un grupo de 3 niños sale con su fila
    expect(screen.queryByText(/n menor que 5|celda.*omitid|grupo.*omitid/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Niños individuales' }))
    expect((await screen.findByRole('link', { name: 'N-001' })).getAttribute('href')).toBe('/ninos/N-001')
    fireEvent.change(screen.getByLabelText('Medida de crecimiento'), { target: { value: 'peso_para_talla' } })
    await waitFor(() => expect(llamadas.some((l) => l.url.includes('indicador=peso_para_talla&agrupar=riesgo&eje=edad_corregida'))).toBe(true))
    expect(await screen.findAllByText('En prueba')).not.toHaveLength(0)
  })

  it('perfiles: tarjetas, una categoría de 3 niños con su cifra y nota de confianza', async () => {
    api('experto')
    montar('/analitica/perfiles?entrenamiento=7')
    expect(await screen.findByText('Muy prematuro')).toBeInTheDocument()
    expect(screen.getByText('25,0 %')).toBeInTheDocument()
    expect(screen.getByText('Prematuro tardío')).toBeInTheDocument()
    expect(screen.getByText('33,0 %')).toBeInTheDocument()   // una categoría de 3 niños dice su tasa
    expect(screen.queryByText(/n menor que 5|categoría\(s\)/)).not.toBeInTheDocument()
    expect(screen.getByText(/Aún no hay perfiles reales aprobados por los expertos/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Por Lubchenco' }))
    expect(await screen.findByText('Pequeño para la edad')).toBeInTheDocument()
  })

  it('anticipación: avisados antes, tabla y nota', async () => {
    api('experto')
    montar('/analitica/anticipacion?entrenamiento=7')
    expect(await screen.findByText('Casos avisados al menos una visita antes')).toBeInTheDocument()
    expect(screen.getByText('50,0 %')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Qué cuesta avisar antes' }))   // el costo de avisar antes tiene su pestaña
    expect(await screen.findByText('Avisar antes detecta menos casos y da más ventaja.')).toBeInTheDocument()
    expect(screen.getAllByText('En prueba').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: /^Tabla/ }))   // la tabla por visita, con sus cifras pequeñas omitidas, tiene su pestaña
    expect((await screen.findAllByText('33,3 %')).length).toBeGreaterThan(0)   // 3 casos: su porcentaje sale tal cual
  })

  it.each(['trayectorias', 'perfiles', 'anticipacion'])('%s: estado pendiente con mensaje', async (sub) => {
    api('experto', true)
    montar(`/analitica/${sub}?entrenamiento=7`)
    expect(await screen.findByText('Este análisis estará disponible pronto')).toBeInTheDocument()
  })
})
