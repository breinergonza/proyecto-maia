// Predicción: las tres pestañas, el CSV solo para administración y la reserva de cifras con pocos niños.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const modelo = { version: 'p1', version_modelo: 'x', corte: '2026-06-30', corte_anterior: false, corte_vigente: '2026-06-30' }
const base = {
  modelo, visita: null, visita_nombre: null, n_filtro: 600, fuga_no_verificable: true, en_entrenamiento: null, excluidos: 0, aviso_corte: null,
}
const muestra = {
  ...base, insuficiente: false, guardado: false,
  agregados: {
    n_puntuados: 590, deciles: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.2],
    histograma: Array.from({ length: 10 }, (_, i) => ({ desde: 10 * i, hasta: 10 * i + 10, n: 59 })),
    niveles: { muy_alto: 30, alto: 29, resto: 531, percentil_alto: 90, percentil_muy_alto: 95 },
    por_desenlace: [{ clave: 'des6', desenlace: 'desarrollo psicomotor bajo', momento: '3 m EC', momento_nombre: '3 meses', n: 590,
      riesgo_mediano: 0.05, altos: 59, muy_altos: 30 }],
  },
  tabla: { total: 590, pagina: 1, limite: 200, filas: [{ sujeto: 'N-001', clave: 'des6', desenlace: 'desarrollo psicomotor bajo', momento: '3 m EC',
    momento_nombre: '3 meses', riesgo: 0.4, percentil: 97, nivel: 'muy_alto', perfil: 'Muy prematuro · Peso adecuado',
    primera_alerta: 'Nacimiento', motivos: ['Peso al nacer = 900 g'] }] },
}

function api(rol: Usuario['rol'], respuesta: unknown = muestra) {
  return simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/prediccion/modelos') {
      return { cuerpo: { corte_vigente: '2026-06-30', activo: 'p1', modelos: [{ version: 'p1', origen: 'oficial', dueno: null, activo: true,
        fuente: 'simulado', corte: '2026-06-30', creado: null, corte_anterior: false, aviso: null }] } }
    }
    if (url.startsWith('/api/prediccion/ejemplos')) {
      return { cuerpo: { modelo, visitas: [{ etapa: 'nacimiento', nombre: 'Nacimiento', orden: 1 }],
        perfiles: [{ perfil: 'extremo', etiqueta: 'Prematuro extremo', grupo: 'eg', n: 40, insuficiente: false }] } }
    }
    if (url === '/api/muestras') return { cuerpo: [] }
    if (url === '/api/prediccion/muestra') return { cuerpo: respuesta }
  })
}

describe('predicción', () => {
  it('ofrece los tres modos como pestañas y el enlace en Revisión clínica', async () => {
    api('experto')
    montar('/prediccion')
    expect(await screen.findByRole('heading', { name: 'Predicción' })).toBeInTheDocument()
    const pestanas = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(pestanas).toEqual(['Muestra', 'Todo el universo', 'Niño nuevo desde un perfil'])
    expect(screen.getAllByRole('link', { name: 'Predicción' }).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('tab', { name: 'Niño nuevo desde un perfil' }))
    expect(await screen.findByText('Biblioteca de niños de ejemplo')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Prematuro extremo/ })).toBeInTheDocument()
  })

  it('el CSV por niño lo ve solo administración', async () => {
    api('admin')
    const { unmount } = montar('/prediccion')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByRole('button', { name: /Exportar CSV/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'N-001' })).toHaveAttribute('href', '/ninos/N-001')
    unmount()
    api('experto')
    montar('/prediccion')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByRole('link', { name: 'N-001' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Exportar CSV/ })).not.toBeInTheDocument()
  })

  it('con menos de 20 niños no muestra cifras', async () => {
    api('experto', { ...base, n_filtro: 8, insuficiente: true, minimo: 20, mensaje: 'Con menos de 20 niños no se muestran cifras.' })
    montar('/prediccion')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByText(/Con menos de 20 niños no se muestran cifras/)).toBeInTheDocument()
    expect(screen.queryByText('niños con el riesgo calculado')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('el visualizador no entra a Predicción', async () => {
    api('visualizador')
    montar('/prediccion')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })
})
