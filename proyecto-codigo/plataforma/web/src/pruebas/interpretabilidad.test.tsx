// Interpretabilidad: barras de importancia, curva de dependencia, motivos y combinación; y el estado de un entrenamiento antiguo.
import { configure, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SUBMODULOS } from '../paginas/analitica/submodulos'
import { montar, simularApi, usuario } from './util'

vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 15_000 })
afterEach(() => vi.unstubAllGlobals())

const contexto = {
  estado: 'ok', entrenamiento: 7,
  modelos: [{ modelo: 'clinico', registro: 'maia', version_registro: 3, fuente: 'simulado', corte: '2026-06-30' }],
  desenlaces: [{ clave: 'readm_3m', nombre: 'Readmisión a 3 meses', etiqueta: 'En uso' }],
  submodulos: SUBMODULOS.map((s) => ({ id: s.id, estado: 'ok' })),
  entrenamientos: [{ entrenamiento: 7, creada: '2026-07-01T10:00:00Z' }],
}
const completo = {
  importancia: [{ variable: 'ern_peso', importancia_pct: 60 }], avisos: [],
  shap_global: { n: 800, metodo: 'TreeSHAP', advertencia: 'Asociación del modelo, no causa.', deciles: {},
    variables: [{ variable: 'ern_peso', etiqueta: 'Peso al nacer', importancia: 0.9, importancia_pct: 60, n: 800 },
      { variable: 'eg', etiqueta: 'Edad gestacional', importancia: 0.4, importancia_pct: 40, n: 800 }] },
  pdp: { n: 800, riesgo_medio: 0.2, advertencia: '', variables: [
    { variable: 'ern_peso', etiqueta: 'Peso al nacer', n: 800, categorica: false, puntos: [[1000, 0.4], [1500, 0.2], [2000, 0.1]] },
    { variable: 'eg', etiqueta: 'Edad gestacional', n: 800, categorica: false, puntos: [[28, 0.35], [34, 0.15]] }] },
  motivos_frecuentes: { n_alertas: 80, por_nino: 3, advertencia: '', motivos: [
    { variable: 'ern_peso', etiqueta: 'Peso al nacer', n: 70, pct: 87.5 }, { variable: 'eg', etiqueta: 'Edad gestacional', n: null, pct: null }] },
  interaccion: { n: 800, advertencia: '', pares: [{ a: 'ern_peso', b: 'eg', etiqueta_a: 'Peso al nacer', etiqueta_b: 'Edad gestacional', cortes_a: [1400], cortes_b: [32],
    celdas: [{ i: 0, j: 0, n: 100, riesgo_medio: 0.5 }, { i: 0, j: 1, n: null, riesgo_medio: null }, { i: 1, j: 0, n: 90, riesgo_medio: 0.2 }, { i: 1, j: 1, n: 200, riesgo_medio: 0.05 }] }] },
}
const antiguo = { importancia: [{ variable: 'ern_peso', importancia_pct: 100 }], shap: null, avisos: [] }

function api(datos: object) {
  simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
    if (url === '/api/analitica/entrenamientos') return { cuerpo: { entrenamientos: contexto.entrenamientos.map((m) => ({ ...m, modelo: 'clinico', desenlaces: contexto.desenlaces, submodulos: contexto.submodulos })) } }
    if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
    if (/^\/api\/analitica\/7\/interpretabilidad/.test(url)) return { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'interpretabilidad', desenlaces: { readm_3m: datos } } }
    return undefined
  })
}

describe('interpretabilidad', () => {
  it('muestra importancia, curva, motivos y combinación con sus descripciones y exportaciones', async () => {
    api(completo)
    montar('/analitica/interpretabilidad?entrenamiento=7&desenlace=readm_3m')
    expect(await screen.findByText('Qué datos pesan más')).toBeInTheDocument()
    expect(screen.getAllByText('Peso al nacer').length).toBeGreaterThan(0)
    expect(screen.getByText(/no prueban causa/)).toBeInTheDocument()
    expect(screen.getByText('Motivos frecuentes')).toBeInTheDocument()
    expect(screen.getByText('87,5 %')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /CSV/ }).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('button', { name: /PNG/ }).length).toBeGreaterThanOrEqual(1)
    // la curva de un dato y la combinación de dos están en sus pestañas
    fireEvent.click(screen.getByRole('tab', { name: 'Cómo cambia el riesgo' }))
    expect(await screen.findByText('Cómo cambia el riesgo con un dato')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Dato que cambia' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Dato que cambia' }), { target: { value: 'eg' } })
    expect(screen.getByRole('figure', { name: 'Riesgo medio según Edad gestacional' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Combinación' }))
    expect(await screen.findByText('Combinación de dos datos')).toBeInTheDocument()
    expect(screen.getAllByText(/n menor que 5/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /CSV/ }).length).toBeGreaterThanOrEqual(1)
  })

  it('un entrenamiento anterior dice que no trae el detalle y ofrece reentrenar', async () => {
    api(antiguo)
    montar('/analitica/interpretabilidad?entrenamiento=7&desenlace=readm_3m')
    expect(await screen.findByText('Este entrenamiento no trae el detalle de interpretabilidad')).toBeInTheDocument()
    expect(screen.getByText('Qué datos pesan más')).toBeInTheDocument()
    expect(screen.queryByText('Motivos frecuentes')).toBeNull()
  })
})
