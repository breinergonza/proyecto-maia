// Calibración (riesgo con y sin el desenlace), Población (muestra frente a todos los niños, en su pestaña) y Comparar con
// intervalos (en pestañas), «Aprobar B» solo para administración. Siempre con celdas de menos de 5 niños ocultas. Los grupos de niños se comparan en
// Comparar grupos (/comparar), no aquí.
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { SUBMODULOS } from '../paginas/analitica/submodulos'
import { montar, simularApi, usuario } from './util'

vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 15_000 })

afterEach(() => {
  vi.unstubAllGlobals()
  try { localStorage.clear() } catch { /* sin almacenamiento */ }
})

const meta = (n: number, version: string) => ({ entrenamiento: n, modelo: 'clinico', fuente: 'simulado', registro: 'maia', version_registro: version, corte: '2026-06-30', creada: `2026-0${n - 5}-01T10:00:00Z`, desenlaces: [], submodulos: [] })
const contexto = {
  estado: 'ok', entrenamiento: 7,
  modelos: [{ modelo: 'clinico', registro: 'maia', version_registro: 3, fuente: 'simulado', corte: '2026-06-30' }],
  desenlaces: [{ clave: 'des_a', nombre: 'Desnutrición a 12 meses', etiqueta: 'En uso' }],
  submodulos: SUBMODULOS.map((s) => ({ id: s.id, estado: 'ok' })),
  entrenamientos: [{ entrenamiento: 7, creada: '2026-07-01T10:00:00Z' }, { entrenamiento: 6, creada: '2026-06-01T10:00:00Z' }],
}

const tramos = Array.from({ length: 20 }, (_, i) => ({ desde: i * 0.05, hasta: (i + 1) * 0.05, con: i < 14 ? null : 12 + i, sin: i > 17 ? null : 100 - i * 3 }))
const calibracion = {
  n: 1500, brier: 0.05, ece: 0.01, riesgo_medio: 0.06, observado: 0.06, razon_riesgo_observado: 1,
  bins: [{ bin: 1, n: 150, riesgo_medio: 0.02, observado: 0.02 }],
  histograma: [{ desde: 0, hasta: 0.05, n: 100 }],
  hist_riesgo: { estado: 'ok', n: 1500, casos: 90, tramos, riesgo_medio_con: 0.4, riesgo_medio_sin: 0.05, mediana_con: 0.38, mediana_sin: 0.04 },
}
const poblacion = {
  embudo: [{ paso: 'niños del corte', n: 2000 }], eventos: { niños: 1500, casos: 90, tasa: 0.06 }, nulos: [{ variable: 'peso', nulos_pct: 2 }],
  distribuciones_muestra_universo: {
    estado: 'ok', universo: 'niños del corte de validación', muestra: 'niños con el desenlace conocido', minimo_ninos: 20,
    categoricas: { sexo: { n_universo: 2000, n_muestra: 1500, diferencia_maxima_pp: 1.2, categorias: [
      { categoria: 'femenino', n_universo: 980, n_muestra: 740, pct_universo: 49, pct_muestra: 49.3, diferencia_pp: 0.3 },
      { categoria: 'masculino', n_universo: 1020, n_muestra: 760, pct_universo: 51, pct_muestra: 50.7, diferencia_pp: -0.3 },
      { categoria: 'otro', n_universo: null, n_muestra: null, pct_universo: null, pct_muestra: null, diferencia_pp: null },
    ] } },
    numericas: { 'edad gestacional (semanas)': { n_universo: 2000, n_muestra: 1500,
      universo: { p5: 28, p25: 31, p50: 34, p75: 37, p95: 40 }, muestra: { p5: 29, p25: 32, p50: 35, p75: 37, p95: 40 } } },
  },
}
const medida = (id: string, texto: string, a: number, b: number, unidad: 'abs' | 'pp', ic: [number, number] | null, clara: boolean | null) => ({
  id, texto, unidad, a, b, diferencia: b - a, ic_bajo: ic?.[0] ?? null, ic_alto: ic?.[1] ?? null, clara, n_a: 1500, n_b: 1500,
})
const rend = (auc: number) => ({
  auc_desenlace: { auc, ic_bajo: auc - 0.05, ic_alto: auc + 0.05, n: 1500, casos: 90 }, roc: { puntos: [[0, 0], [0.2, 0.6], [1, 1]] },
  pr: { puntos: [[0, 1], [1, 0.06]], prevalencia: 0.06 }, pr_auc: 0.3,
  metricas_por_top: [{ top_pct: 10, k: 150, alertas: 150, casos_detectados_pct: 40, alertas_acertadas_pct: 24, sin_falsa_alarma_pct: 92, alertas_por_1000: 100 }],
  metricas_por_percentil: [], confusion_por_top: [], lift: { tasa_general: 0.06, deciles: [], acumulado: [] }, top_k: [],
})
const comparacion = {
  estado: 'ok', desenlace: 'des_a', replicas: 500, aviso: 'Como no se guardan predicciones por niño, el intervalo de la diferencia es aproximado.',
  a: { entrenamiento: 6, fuente: 'simulado', corte: '2026-05-31', version_registro: '2', n: 1500, casos: 90 },
  b: { entrenamiento: 7, fuente: 'simulado', corte: '2026-06-30', version_registro: '3', n: 1500, casos: 90 },
  metricas: [
    medida('auc', 'AUC', 0.7, 0.78, 'abs', [0.04, 0.12], true),
    medida('pr', 'PR', 0.3, 0.3, 'abs', null, null),
    medida('det10', 'Casos detectados', 40, 41, 'pp', [-8.2, 10.1], false),
    medida('ac10', 'Alertas acertadas', 24, 24, 'pp', [-5, 5], false), medida('det20', 'd20', 60, 60, 'pp', [-5, 5], false),
    medida('ac20', 'a20', 20, 20, 'pp', [-5, 5], false), medida('mil', 'mil', 100, 100, 'abs', null, null),
  ],
  por_grupo: [{ variable: 'sexo', grupo: 'femenino', a: 0.7, b: 0.8, diferencia: 0.1, ic_bajo: 0.02, ic_alto: 0.18, clara: true, n_a: 740, n_b: 740 }],
  calibracion: [],
}

type Extra = (url: string, init?: RequestInit) => { estado?: number; cuerpo?: unknown } | undefined

function api(rol: Usuario['rol'], extra?: Extra) {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    const e = extra?.(url, init)
    if (e) return e
    if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
    if (url === '/api/analitica/entrenamientos') return { cuerpo: { entrenamientos: [meta(7, '3'), meta(6, '2')] } }
    if (url.startsWith('/api/analitica/comparar?')) return { cuerpo: comparacion }
    const m = /^\/api\/analitica\/(\d+)\/(\w+)/.exec(url)
    if (m && m[2] === 'calibracion') return { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'calibracion', desenlaces: { des_a: calibracion } } }
    if (m && m[2] === 'poblacion') return { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'poblacion', desenlaces: { des_a: poblacion } } }
    if (m && m[2] === 'rendimiento') {
      return { cuerpo: { estado: 'ok', entrenamiento: Number(m[1]), submodulo: 'rendimiento', meta: meta(Number(m[1]), m[1] === '7' ? '3' : '2'), desenlaces: { des_a: rend(m[1] === '7' ? 0.78 : 0.7) } } }
    }
    return { cuerpo: {} }
  })
}

describe('calibración: riesgo con y sin el desenlace', () => {
  it('muestra la gráfica con descripción, PNG y CSV, y los tramos pequeños quedan vacíos', async () => {
    api('experto')
    montar('/analitica/calibracion?entrenamiento=7&desenlace=des_a&ver=reparto')
    expect(await screen.findByText('Riesgo de los niños con y sin el desenlace', { selector: 'h2, h3' })).toBeInTheDocument()
    expect(screen.getByText(/Cómo se reparte el riesgo en quienes tuvieron el desenlace/)).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Riesgo de los niños con y sin el desenlace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar PNG: Riesgo de los niños con y sin el desenlace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar CSV: Riesgo de los niños con y sin el desenlace' })).toBeInTheDocument()
    expect(screen.getByText(/con el desenlace 38,0 %/)).toBeInTheDocument()
    expect(screen.getByText(/Los tramos con menos de 5 niños quedan sin barra/)).toBeInTheDocument()
  })

  it('un entrenamiento anterior sin hist_riesgo sigue mostrando el histograma de siempre', async () => {
    api('experto', (url) => (/\/analitica\/7\/calibracion/.test(url)
      ? { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'calibracion', desenlaces: { des_a: { ...calibracion, hist_riesgo: undefined } } } } : undefined))
    montar('/analitica/calibracion?entrenamiento=7&desenlace=des_a&ver=reparto')
    expect(await screen.findByRole('figure', { name: 'Cómo se reparte el riesgo' })).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'Riesgo de los niños con y sin el desenlace' })).not.toBeInTheDocument()
  })
})

describe('población: muestra frente a todos los niños', () => {
  it('dibuja el reparto por categoría y la tabla de valores típicos con su descripción', async () => {
    api('visualizador')
    montar('/analitica/poblacion?entrenamiento=7&desenlace=des_a&ver=categorias')   // el reparto y los valores típicos tienen cada uno su pestaña
    expect(await screen.findByRole('figure', { name: 'sexo: la muestra frente a todos los niños' })).toBeInTheDocument()
    expect(screen.getAllByText('Si la muestra se parece a todos los niños del programa.').length).toBeGreaterThan(0)
    expect(screen.getByText(/La mayor diferencia es de 1,2 puntos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Descargar PNG: Muestra frente a todos los niños: sexo/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Valores típicos' }))
    expect(await screen.findByText('Edad gestacional: muestra frente a todos')).toBeInTheDocument()
    expect(screen.getByText('Mediana')).toBeInTheDocument()
  })

  it('un entrenamiento anterior lo explica y no inventa cifras', async () => {
    api('experto', (url) => (/\/analitica\/7\/poblacion/.test(url)
      ? { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'poblacion', desenlaces: { des_a: { ...poblacion, distribuciones_muestra_universo: undefined } } } } : undefined))
    montar('/analitica/poblacion?entrenamiento=7&desenlace=des_a&ver=categorias')
    expect(await screen.findByText(/no trae la comparación de la muestra con todos los niños/)).toBeInTheDocument()
  })
})

describe('comparar entrenamientos: intervalos y Aprobar B', () => {
  it('pide la comparación con réplicas y muestra la certeza, el n y el aviso de aproximación', async () => {
    const llamadas = api('experto')
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    expect(await screen.findByText('Diferencia clara *')).toBeInTheDocument()
    expect(screen.getByText(/A: 1\.500 niños, 90 casos/)).toBeInTheDocument()
    expect(screen.getAllByText('No es clara').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sin intervalo').length).toBeGreaterThan(0)
    expect(screen.getByText(/el intervalo de la diferencia es aproximado/)).toBeInTheDocument()
    expect(llamadas.some((l) => l.url === '/api/analitica/comparar?a=6&b=7&desenlace=des_a')).toBe(true)
    expect(screen.queryByRole('button', { name: /Aprobar B/ })).not.toBeInTheDocument()
    // en el teléfono cada fila de métricas, grupos y muestra se vuelve una tarjeta: B y la diferencia no quedan fuera de la vista
    const apiladas = () => {
      const tablas = screen.getAllByRole('table').filter((t) => !t.closest('figure'))
      for (const t of tablas) expect(t.parentElement).toHaveClass('tabla-apilada')
      return tablas.length
    }
    expect(apiladas()).toBe(1)
    await userEvent.click(screen.getByRole('tab', { name: 'Niños y grupos' }))
    expect(await screen.findByText('sexo: femenino')).toBeInTheDocument()
    expect(apiladas()).toBe(2)
  })

  const registro = {
    mlflow_url: null,
    anomalias: [{ run_id: 'x', experimento_id: '1', tipo: 'anomalias', modelo: { registro: 'a', version: '2', alias: ['produccion'] } },
      { run_id: 'y', experimento_id: '1', tipo: 'anomalias', modelo: { registro: 'a', version: '4', alias: ['candidato'] } }],
    clinico: [],
  }

  it('el administrador aprueba B con confirmación: usa /entrenamientos/aprobar con la versión de B y las anomalías vigentes', async () => {
    const llamadas = api('admin', (url) => (url.startsWith('/api/entrenamientos?') ? { cuerpo: registro }
      : url === '/api/entrenamientos/aprobar' ? { estado: 202, cuerpo: { id: 31 } } : undefined))
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    const boton = await screen.findByRole('button', { name: 'Aprobar B' })
    await waitFor(() => expect(boton).toBeEnabled())
    await userEvent.click(boton)
    const d = await screen.findByRole('alertdialog')
    expect(d).toHaveTextContent('alertas clínicas v3')
    expect(d).toHaveTextContent('anomalías v2')
    expect(d).toHaveTextContent('para todos los usuarios')
    await userEvent.click(within(d).getByRole('button', { name: 'Aprobar B' }))
    expect(await screen.findByText(/Aprobación en cola \(ejecución n\.º 31\)/)).toBeInTheDocument()
    const post = llamadas.find((l) => l.url === '/api/entrenamientos/aprobar')!
    expect(JSON.parse(String(post.init!.body))).toEqual({ fuente: 'simulado', anomalias: '2', clinico: '3' })
  })

  it('si se cancela la confirmación no se aprueba nada, y «Mantener A» no cambia nada', async () => {
    const llamadas = api('admin', (url) => (url.startsWith('/api/entrenamientos?') ? { cuerpo: registro } : undefined))
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    const boton = await screen.findByRole('button', { name: 'Aprobar B' })
    await waitFor(() => expect(boton).toBeEnabled())
    await userEvent.click(boton)
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(llamadas.some((l) => l.url === '/api/entrenamientos/aprobar')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Mantener A' }))
    expect(screen.getByText('Se mantiene A. No se cambió nada.')).toBeInTheDocument()
    expect(llamadas.some((l) => l.url === '/api/entrenamientos/aprobar')).toBe(false)
  })

  it('un error de la aprobación (ya hay una pendiente) se muestra', async () => {
    api('admin', (url) => (url.startsWith('/api/entrenamientos?') ? { cuerpo: registro }
      : url === '/api/entrenamientos/aprobar' ? { estado: 409, cuerpo: { detail: 'Ya hay una aprobación pendiente o en curso.' } } : undefined))
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    const boton = await screen.findByRole('button', { name: 'Aprobar B' })
    await waitFor(() => expect(boton).toBeEnabled())
    await userEvent.click(boton)
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aprobar B' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay una aprobación pendiente o en curso.')
  })
})

describe('comparar: solo entrenamientos', () => {
  it('no mezcla grupos de niños con entrenamientos: ninguna pestaña es de grupos y una línea lleva a Comparar grupos', async () => {
    api('experto')
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    expect(await screen.findByText('Entrenamiento B')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Grupos de niños' })).not.toBeInTheDocument()
    expect(within(await screen.findByRole('tablist', { name: 'Qué ver' })).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Medidas', 'Curva ROC', 'Niños y grupos'])
    const linea = screen.getByText(/Aquí se comparan entrenamientos/).closest('p')!
    expect(linea).toHaveTextContent('Aquí se comparan entrenamientos. Para comparar dos grupos de niños, use Comparar grupos.')
    expect(within(linea).getByRole('link', { name: 'Comparar grupos' })).toHaveAttribute('href', '/comparar')
  })
})
