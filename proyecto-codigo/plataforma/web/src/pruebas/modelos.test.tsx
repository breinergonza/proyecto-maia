// Modelos (S9, mockup 05): selectores Desenlace (por familia), Calculado a y Entrenamiento con el estado del desenlace; y los
// paneles Configuración, Trazabilidad, Evaluación en prueba y Comparación técnica con los datos reales del entrenamiento.
// Una falla de red se explica y se puede reintentar sin perder lo elegido; lo que el entrenamiento no trae no se inventa.
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { datosAl } from '../lib/lenguaje'
import { SUBMODULOS } from '../paginas/analitica/submodulos'
import { montar, simularApi, usuario } from './util'

vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 15_000 })

afterEach(() => {
  vi.unstubAllGlobals()
  try { localStorage.clear(); sessionStorage.clear() } catch { /* sin almacenamiento */ }
})

const T3 = 'talla_baja_12m_desde_3', T40 = 'talla_baja_12m_desde_40', D = 'desarrollo_12m', D3 = 'desarrollo_12m_desde_3'
const desenlaces = [
  { clave: T3, nombre: 'Talla baja a los 12 meses (riesgo calculado a 3 m EC)', momento: '3 m EC', etiqueta: 'En prueba' },
  { clave: T40, nombre: 'Talla baja a los 12 meses (riesgo calculado a 40 sem)', momento: '40 sem', etiqueta: 'En prueba' },
  { clave: D, nombre: 'Desarrollo psicomotor bajo a los 12 meses', momento: '12 m EC', etiqueta: 'En uso' },
  { clave: D3, nombre: 'Desarrollo psicomotor bajo a los 12 meses (riesgo calculado a 3 m EC)', momento: '3 m EC', etiqueta: 'En prueba' },
]
const meta = {
  entrenamiento: 7, modelo: 'clinico', fuente: 'simulado', registro: 'maia-clinico', version_registro: 3, version_modelo: 'abc123',
  corte: '2026-06-30', creada: '2026-07-01T10:00:00Z', desenlaces, submodulos: SUBMODULOS.map((s) => ({ id: s.id, estado: 'ok' })),
}
const contexto = {
  estado: 'ok', entrenamiento: 7,
  modelos: [{ modelo: 'clinico', registro: 'maia-clinico', version_registro: 3, version_modelo: 'abc123', fuente: 'simulado', corte: '2026-06-30' }],
  desenlaces, submodulos: meta.submodulos,
  entrenamientos: [{ entrenamiento: 7, creada: '2026-07-01T10:00:00Z' }, { entrenamiento: 6, creada: '2026-06-01T10:00:00Z' }],
}
const rendimiento = (auc: number, ref: number | null) => ({
  auc_desenlace: { auc, ic_bajo: auc - 0.05, ic_alto: auc + 0.05, n: 1204, casos: 193 },
  roc: { puntos: [[0, 0], [1, 1]] }, pr: { puntos: [[0, 1], [1, 0.16]], prevalencia: 0.16 }, pr_auc: 0.38,
  metricas_por_top: [{ top_pct: 10, k: 120, alertas: 120, casos_detectados_pct: 40, alertas_acertadas_pct: 24, sin_falsa_alarma_pct: 92, alertas_por_1000: 100 }],
  metricas_por_percentil: [], confusion_por_top: [{ top_pct: 10, tp: 79, fp: 162, fn: 114, tn: 849 }],
  lift: { tasa_general: 0.16, deciles: [], acumulado: [] }, top_k: [],
  ...(ref != null ? { referencia: { auc_desenlace: { auc: ref, ic_bajo: ref - 0.05, ic_alto: ref + 0.05, n: 1204, casos: 193 }, casos_top10_pct: 20 } } : {}),
})
const calibracion = {
  n: 1204, brier: 0.05, riesgo_medio: 0.16, observado: 0.16, razon_riesgo_observado: 1,
  bins: [{ bin: 1, n: 400, riesgo_medio: 0.05, observado: 0.04 }, { bin: 2, n: 400, riesgo_medio: 0.15, observado: 0.17 }, { bin: 3, n: 404, riesgo_medio: 0.4, observado: 0.35 }],
  histograma: [],
}
const semaforos = [{ id: 'auc', nombre: 'Rendimiento', estado: 'verde', valor: 0.74, detalle: 'Ordena bien.', umbral: 'AUC ≥ 0,7' }]

type Extra = (url: string, init?: RequestInit) => { estado?: number; cuerpo?: unknown } | undefined

function api(rol: Usuario['rol'] = 'experto', extra?: Extra, conReferencia = true) {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    const e = extra?.(url, init)
    if (e) return e
    if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
    if (url === '/api/analitica/entrenamientos') return { cuerpo: { entrenamientos: [meta, { ...meta, entrenamiento: 6, creada: '2026-06-01T10:00:00Z' }] } }
    if (url === '/api/modelos/activo') {
      return { cuerpo: { version: '2026-11-19-5dcbdc', fuente: 'simulado', activo: true, metricas: {}, modelos: { clinico: { version_modelo: 'abc123' } } } }
    }
    const m = /^\/api\/analitica\/(\d+)\/(\w+)\?desenlace=(.+)$/.exec(url)
    if (m) {
      const [, n, sub, clave] = m
      const base = { estado: 'ok', entrenamiento: Number(n), submodulo: sub, meta }
      if (sub === 'rendimiento') return { cuerpo: { ...base, desenlaces: { [clave]: rendimiento(0.74, conReferencia ? 0.68 : null) } } }
      if (sub === 'calibracion') return { cuerpo: { ...base, desenlaces: { [clave]: calibracion } } }
      if (sub === 'resumen') return { cuerpo: { ...base, desenlaces: { [clave]: { auc: 0.74, semaforos } } } }
    }
    return { cuerpo: {} }
  })
}

function Ubicacion() {
  const l = useLocation()
  return <p data-testid="ubicacion">{l.pathname + l.search}</p>
}

describe('modelos: los selectores de arriba', () => {
  it('Desenlace agrupa por familia, Calculado a lista sus visitas y el estado es el del desenlace elegido', async () => {
    api()
    montar(`/analitica?entrenamiento=7&desenlace=${T3}`, <Ubicacion />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Modelos' })).toBeInTheDocument()
    const desenlace = await screen.findByLabelText('Desenlace')
    await waitFor(() => expect(desenlace).toHaveValue('talla_baja_12m'))
    expect(within(desenlace).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Talla baja a los 12 meses', 'Desarrollo psicomotor bajo a los 12 meses'])
    const corte = screen.getByLabelText('Calculado a')
    expect(corte).toHaveValue(T3)
    expect(within(corte).getAllByRole('option').map((o) => o.textContent)).toEqual(['3 m EC', '40 sem'])
    expect(screen.getByLabelText('Entrenamiento')).toHaveValue('7')
    expect(screen.getByText('En prueba', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByText(/no está validado/)).toBeInTheDocument()

    fireEvent.change(corte, { target: { value: T40 } })
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toContain(`desenlace=${T40}`))
    // otro desenlace: el que ya está en uso va primero y su estado cambia
    fireEvent.change(screen.getByLabelText('Desenlace'), { target: { value: 'desarrollo_12m' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toContain(`desenlace=${D}`))
    expect(await screen.findByText('En uso', { selector: 'b' })).toBeInTheDocument()
    expect(within(screen.getByLabelText('Calculado a')).getAllByRole('option').map((o) => o.textContent)).toEqual(['12 m EC', '3 m EC'])
  })
})

describe('modelos: configuración y trazabilidad', () => {
  it('muestra con qué datos y cómo se entrenó y qué entrenamiento, versión y paquete es', async () => {
    api('experto')
    montar(`/analitica?entrenamiento=7&desenlace=${T3}`)
    const config = (await screen.findByRole('heading', { name: 'Configuración' })).closest('section')!
    expect(within(config).getByText((texto) => texto.includes(datosAl('2026-06-30')))).toBeInTheDocument()
    expect(within(config).getByText(/Temporal por fecha de nacimiento/)).toBeInTheDocument()
    expect(within(config).getByText('Gradient boosting (LightGBM)')).toBeInTheDocument()
    expect(within(config).queryByRole('link', { name: /hiperparámetros/ })).not.toBeInTheDocument()   // solo administración
    const traza = screen.getByRole('heading', { name: 'Trazabilidad' }).closest('section')!
    expect(within(traza).getByText('N.º 7')).toBeInTheDocument()
    expect(within(traza).getByText(/versión 3/)).toBeInTheDocument()
    expect(await within(traza).findByText('2026-11-19-5dcbdc')).toBeInTheDocument()
    expect(within(traza).queryByText(/Diccionario/)).not.toBeInTheDocument()   // el entrenamiento no lo registra: no se inventa
  })

  it('el administrador ve el enlace a los hiperparámetros; un entrenamiento que no está en el paquete activo lo dice', async () => {
    api('admin', (url) => (url === '/api/modelos/activo'
      ? { cuerpo: { version: 'otro', fuente: 'simulado', activo: true, metricas: {}, modelos: { clinico: { version_modelo: 'zzz' } } } } : undefined))
    montar(`/analitica?entrenamiento=7&desenlace=${T3}`)
    expect(await screen.findByRole('link', { name: /Ver hiperparámetros/ })).toHaveAttribute('href', '/admin/entrenamientos')
    expect(await screen.findByText('No está en el paquete activo')).toBeInTheDocument()
  })
})

describe('modelos: evaluación en prueba', () => {
  it('cada métrica trae su cifra y una frase que la explica; F1 sale de sensibilidad y precisión', async () => {
    api()
    montar(`/analitica?entrenamiento=7&desenlace=${T3}`)
    const panel = (await screen.findByRole('heading', { name: 'Evaluación en prueba' })).closest('section')!
    expect(await within(panel).findByText(/1\.204 niños, 16,0 % con el desenlace/)).toBeInTheDocument()
    expect(within(panel).getByText(/Alertando al 10 % de niños con más riesgo/)).toBeInTheDocument()
    const valor = (nombre: string) => within(panel).getByText(nombre, { selector: 'dt' }).parentElement!
    expect(valor('AUROC')).toHaveTextContent('0,74')
    expect(valor('AUROC')).toHaveTextContent('(0,69 a 0,79)')
    expect(valor('PR-AUC')).toHaveTextContent('0,38')
    expect(valor('Sensibilidad')).toHaveTextContent('40,0 %')
    expect(valor('Precisión')).toHaveTextContent('24,0 %')
    expect(valor('F1')).toHaveTextContent('0,3')
    for (const frase of [/probabilidad de que un niño que tuvo el desenlace reciba más riesgo/, /Compárela con 0,16/,
      /De cada 100 niños que tuvieron el desenlace, a cuántos se les dio alerta/, /De cada 100 niños en alerta, cuántos sí tuvieron el desenlace/,
      /Una sola cifra que junta sensibilidad y precisión/]) {
      expect(within(panel).getByText(frase)).toBeInTheDocument()
    }
  })

  it('la matriz de aciertos y errores y la calibración con su diagonal dicen variable, unidad, momento, población, datos válidos y denominador', async () => {
    api()
    montar(`/analitica?entrenamiento=7&desenlace=${T3}`)
    const matriz = await screen.findByRole('table', { name: 'Aciertos y errores de la alerta' })
    expect(within(matriz).getByText('79')).toBeInTheDocument()
    expect(within(matriz).getByText('849')).toBeInTheDocument()
    for (const t of ['detectados', 'no detectados', 'falsas alarmas', 'sin falsa alarma']) expect(within(matriz).getByText(t)).toBeInTheDocument()
    expect(await screen.findByRole('figure', { name: /Riesgo estimado frente a riesgo observado de Talla baja a los 12 meses/ })).toBeInTheDocument()
    expect(screen.getByText(/referencia ideal/)).toBeInTheDocument()
    expect(screen.getAllByText('Variable', { selector: 'dt' })).toHaveLength(2)
    for (const rotulo of ['Unidad', 'Momento', 'Población', 'Datos válidos', 'Porcentaje y denominador']) {
      expect(screen.getAllByText(rotulo, { selector: 'dt' })).toHaveLength(2)
    }
    expect(screen.getAllByText(/Riesgo calculado a 3 m EC; desenlace observado a los 12 meses/)).toHaveLength(2)
    expect(screen.getAllByText(/1\.204 niños del conjunto de prueba, 193 con el desenlace/)).toHaveLength(2)
  })
})

describe('modelos: comparación técnica', () => {
  it('compara el modelo completo con la regla de referencia', async () => {
    api()
    montar(`/analitica?entrenamiento=7&desenlace=${T3}`)
    const panel = (await screen.findByRole('heading', { name: 'Comparación técnica' })).closest('section')!
    const fila = (t: string) => within(panel).getByText(t).closest('tr')!
    expect(fila('Modelo de referencia')).toHaveTextContent('0,68')
    expect(fila('Modelo completo')).toHaveTextContent('0,74')
    expect(fila('Modelo completo')).toHaveTextContent('+0,06')
  })

  it('un entrenamiento sin regla de referencia no muestra el panel', async () => {
    api('experto', undefined, false)
    montar(`/analitica?entrenamiento=7&desenlace=${T3}`)
    await screen.findByRole('heading', { name: 'Evaluación en prueba' })
    expect(screen.queryByRole('heading', { name: 'Comparación técnica' })).not.toBeInTheDocument()
  })
})

describe('modelos: falla de red', () => {
  it('explica qué pasó, ofrece reintentar y conserva el desenlace y el entrenamiento elegidos', async () => {
    let caida = true
    api('experto', (url) => (caida && /\/analitica\/7\/rendimiento/.test(url) ? { estado: 503, cuerpo: { detail: 'El servidor no responde por ahora.' } } : undefined))
    montar(`/analitica?entrenamiento=7&desenlace=${T40}`, <Ubicacion />)
    const aviso = await screen.findByRole('alert', undefined, { timeout: 20_000 })
    expect(aviso).toHaveTextContent('No se pudo cargar este análisis')
    expect(aviso).toHaveTextContent('El servidor no responde por ahora.')
    expect(screen.getByLabelText('Calculado a')).toHaveValue(T40)
    expect(screen.getByTestId('ubicacion').textContent).toContain(`desenlace=${T40}`)
    caida = false
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/1\.204 niños, 16,0 % con el desenlace/)).toBeInTheDocument()
    expect(screen.getByLabelText('Calculado a')).toHaveValue(T40)
  })
})

describe('modelos: los demás submódulos siguen funcionando', () => {
  it('Rendimiento abre con el mismo contexto y los selectores nuevos', async () => {
    api()
    montar(`/analitica/rendimiento?entrenamiento=7&desenlace=${T3}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Rendimiento' })).toBeInTheDocument()
    expect(await screen.findByRole('slider')).toHaveValue('10')
    expect(screen.getByLabelText('Calculado a')).toHaveValue(T3)
  })
})
