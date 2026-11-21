// Modelos (S9, mockup 05): selectores Desenlace (por familia), Calculado a y Entrenamiento con el estado del desenlace; y los
// paneles Configuración, Trazabilidad, Evaluación en prueba y Comparación técnica con los datos reales del entrenamiento.
// Una falla de red se explica y se puede reintentar sin perder lo elegido; lo que el entrenamiento no trae no se inventa.
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { fecha } from '../lib/formato'
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
  hiperparametros: [
    { nombre: 'rondas', etiqueta: 'Rondas de boosting (máximo)', valor: 1200 },
    { nombre: 'tasa', etiqueta: 'Tasa de aprendizaje', valor: 0.05 },
  ],
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
const semaforos = [{ id: 'auc', nombre: 'Detección y falsas alertas', estado: 'verde', valor: 0.74, detalle: 'Ordena bien.', umbral: 'AUC ≥ 0,7' }]

type Extra = (url: string, init?: RequestInit) => { estado?: number; cuerpo?: unknown } | undefined

function api(rol: Usuario['rol'] = 'experto', extra?: Extra, conReferencia = true) {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    const e = extra?.(url, init)
    if (e) return e
    if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
    if (url === '/api/analitica/entrenamientos') return { cuerpo: { entrenamientos: [meta, { ...meta, entrenamiento: 6, creada: '2026-06-01T10:00:00Z', hiperparametros: [] }] } }
    if (url === '/api/modelos/activo') {
      return { cuerpo: { version: '2026-11-19-5dcbdc', fuente: 'simulado', activo: true, metricas: {}, modelos: { clinico: { version_modelo: 'abc123' } } } }
    }
    const m = /^\/api\/analitica\/(\d+)\/(\w+)\?desenlace=(.+)$/.exec(url)
    if (m) {
      const [, n, sub, clave] = m
      const base = { estado: 'ok', entrenamiento: Number(n), submodulo: sub, meta: n === '6' ? { ...meta, entrenamiento: 6, hiperparametros: [] } : meta }
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
    expect(await screen.findByRole('heading', { level: 1, name: 'Ficha del modelo' })).toBeInTheDocument()
    const desenlace = await screen.findByLabelText('Resultado clínico evaluado')
    await waitFor(() => expect(desenlace).toHaveValue('talla_baja_12m'))
    expect(within(desenlace).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Talla baja a los 12 meses', 'Desarrollo psicomotor bajo a los 12 meses'])
    const corte = screen.getByLabelText('Edad al estimar el riesgo')
    expect(corte).toHaveValue(T3)
    expect(within(corte).getAllByRole('option').map((o) => o.textContent)).toEqual(['3 meses de edad corregida', '40 sem'])
    expect(screen.getByLabelText('Entrenamiento')).toHaveValue('7')
    expect(screen.getByText('En prueba', { selector: 'b' })).toBeInTheDocument()
    expect(screen.getByText(/no está validado/)).toBeInTheDocument()

    fireEvent.change(corte, { target: { value: T40 } })
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toContain(`desenlace=${T40}`))
    // otro desenlace: el que ya está en uso va primero y su estado cambia
    fireEvent.change(screen.getByLabelText('Resultado clínico evaluado'), { target: { value: 'desarrollo_12m' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toContain(`desenlace=${D}`))
    expect(await screen.findByText('En uso', { selector: 'b' })).toBeInTheDocument()
    expect(within(screen.getByLabelText('Edad al estimar el riesgo')).getAllByRole('option').map((o) => o.textContent)).toEqual(['12 meses de edad corregida', '3 meses de edad corregida'])
  })
})

describe('modelos: configuración y trazabilidad', () => {
  it('muestra con qué datos y cómo se entrenó y qué entrenamiento, versión y paquete es', async () => {
    api('experto')
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=entrenamiento`)
    const config = (await screen.findByRole('heading', { name: 'Configuración' })).closest('section')!
    expect(within(config).getByText((texto) => texto.includes(datosAl('2026-06-30')))).toBeInTheDocument()
    expect(within(config).getByText(/Temporal por fecha de nacimiento/)).toBeInTheDocument()
    expect(within(config).getByText('Gradient boosting (LightGBM)')).toBeInTheDocument()
    expect(within(config).queryByRole('link', { name: /hiperparámetros/ })).not.toBeInTheDocument()   // solo administración
    const hp = screen.getByRole('heading', { name: 'Hiperparámetros' }).closest('section')!   // todos los perfiles los ven, en su propia tarjeta
    expect(within(hp).getByText('Rondas de boosting (máximo)').nextElementSibling).toHaveTextContent('1.200')
    expect(within(hp).getByText('Tasa de aprendizaje').nextElementSibling).toHaveTextContent('0,05')
    const traza = screen.getByRole('heading', { name: 'Trazabilidad' }).closest('section')!
    expect(within(traza).getByText('N.º 7')).toBeInTheDocument()
    expect(within(traza).getByText(/versión 3/)).toBeInTheDocument()
    expect(await within(traza).findByText('2026-11-19-5dcbdc')).toBeInTheDocument()
    expect(within(traza).queryByText(/Guía de variables y unidades/)).not.toBeInTheDocument()   // el entrenamiento no lo registra: no se inventa
  })

  it('un entrenamiento que guardó sus cohortes y su Diccionario dice con quiénes se entrenó, con quiénes se probó y con qué versión', async () => {
    const completa = { ...meta, diccionario: 14, cohortes: {
      entrenamiento: { ninos: 3400, nacidos_desde: 2007, nacidos_hasta: 2021 }, prueba: { ninos: 600, nacidos_desde: 2020, nacidos_hasta: 2021 } } }
    api('experto', (url) => {
      const m = /^\/api\/analitica\/7\/(rendimiento|resumen)\?desenlace=(.+)$/.exec(url)
      if (!m) return undefined
      return { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: m[1], meta: completa,
        desenlaces: { [m[2]]: m[1] === 'rendimiento' ? rendimiento(0.74, 0.68) : { auc: 0.74, semaforos } } } }
    })
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=entrenamiento`)
    const config = (await screen.findByRole('heading', { name: 'Configuración' })).closest('section')!
    expect(within(config).getByText('Cohorte de entrenamiento').nextElementSibling).toHaveTextContent('Nacidos de 2007 a 2021 · 3.400 niños')
    expect(within(config).getByText('División de datos').nextElementSibling).toHaveTextContent(
      'Temporal por fecha de nacimiento: se entrena con los nacidos antes y se prueba con los 600 más recientes (nacidos de 2020 a 2021), que el modelo no vio.')
    const traza = screen.getByRole('heading', { name: 'Trazabilidad' }).closest('section')!
    expect(within(traza).getByText('Diccionario').nextElementSibling).toHaveTextContent('versión 14')
  })

  it('un entrenamiento que no guardó sus hiperparámetros no los muestra', async () => {
    api('experto')
    montar(`/analitica?entrenamiento=6&desenlace=${T3}&ver=entrenamiento`)
    const config = (await screen.findByRole('heading', { name: 'Configuración' })).closest('section')!
    await within(config).findByText('Gradient boosting (LightGBM)')
    expect(screen.queryByRole('heading', { name: 'Hiperparámetros' })).not.toBeInTheDocument()
  })

  it('el administrador ve el enlace a los hiperparámetros; un entrenamiento que no está en el paquete activo lo dice', async () => {
    api('admin', (url) => (url === '/api/modelos/activo'
      ? { cuerpo: { version: 'otro', fuente: 'simulado', activo: true, metricas: {}, modelos: { clinico: { version_modelo: 'zzz' } } } } : undefined))
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=entrenamiento`)
    expect(await screen.findByRole('link', { name: /Ver hiperparámetros/ })).toHaveAttribute('href', '/admin/entrenamientos')
    expect(await screen.findByText('No está en el paquete activo')).toBeInTheDocument()
  })
})

describe('modelos: evaluación en prueba', () => {
  it('cada métrica trae su cifra y una frase que la explica; F1 sale de sensibilidad y precisión', async () => {
    api()
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=evaluacion`)
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
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=graficas`)
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
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=evaluacion`)
    const panel = (await screen.findByRole('heading', { name: 'Comparación técnica' })).closest('section')!
    const fila = (t: string) => within(panel).getByText(t).closest('tr')!
    expect(fila('Modelo de referencia')).toHaveTextContent('0,68')
    expect(fila('Modelo completo')).toHaveTextContent('0,74')
    expect(fila('Modelo completo')).toHaveTextContent('+0,06')
  })

  // un entrenamiento nuevo guarda con qué datos se calcula la regla y la diferencia con su intervalo
  const conRegla = (diferencia: { valor: number; ic_bajo: number | null; ic_alto: number | null }): Extra => (url) => {
    const m = /^\/api\/analitica\/7\/rendimiento\?desenlace=(.+)$/.exec(url)
    if (!m) return undefined
    const r = rendimiento(0.74, 0.68)
    return { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'rendimiento', meta, desenlaces: { [m[1]]: {
      ...r, referencia: { ...r.referencia, entradas: ['talla, puntaje z a 3 meses (edad corregida)'], diferencia } } } } }
  }

  it('dice con qué datos se calcula la regla de referencia y da la diferencia con su intervalo', async () => {
    api('experto', conRegla({ valor: 0.06, ic_bajo: 0.02, ic_alto: 0.1 }))
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=evaluacion`)
    const panel = (await screen.findByRole('heading', { name: 'Comparación técnica' })).closest('section')!
    const fila = (t: string) => within(panel).getByText(t).closest('tr')!
    expect(fila('Modelo de referencia')).toHaveTextContent('(solo talla, puntaje z a 3 meses (edad corregida))')
    expect(fila('Modelo de referencia')).not.toHaveTextContent('edad gestacional')
    expect(fila('Modelo completo')).toHaveTextContent('+0,06(0,02 a 0,1)')
    expect(within(panel).getByText(/El intervalo de la diferencia no incluye el 0: la ventaja del modelo completo no es casualidad\./)).toBeInTheDocument()
  })

  it('si el intervalo de la diferencia incluye el 0, dice que la ventaja puede ser casualidad', async () => {
    api('experto', conRegla({ valor: 0.02, ic_bajo: -0.03, ic_alto: 0.07 }))
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=evaluacion`)
    const panel = (await screen.findByRole('heading', { name: 'Comparación técnica' })).closest('section')!
    expect(within(panel).getByText('Modelo completo').closest('tr')).toHaveTextContent('(−0,03 a 0,07)')
    expect(within(panel).getByText(/El intervalo de la diferencia incluye el 0: la ventaja puede ser casualidad\./)).toBeInTheDocument()
  })

  it('un entrenamiento sin regla de referencia no muestra el panel', async () => {
    api('experto', undefined, false)
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=evaluacion`)
    await screen.findByRole('heading', { name: 'Evaluación en prueba' })
    expect(screen.queryByRole('heading', { name: 'Comparación técnica' })).not.toBeInTheDocument()
  })
})

describe('modelos: sin jerga ni repeticiones', () => {
  it('no explica cómo funciona la pantalla ni repite la advertencia del pie', async () => {
    api()
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=evaluacion`)
    await screen.findByRole('heading', { name: 'Evaluación en prueba' })
    const principal = within(screen.getByRole('main'))
    expect(principal.queryByText(/El contexto vive en el enlace/)).not.toBeInTheDocument()
    expect(principal.queryByText(/Apoyo a la decisión, no diagnóstico/)).not.toBeInTheDocument()
  })

  it('la fecha del entrenamiento se dice una vez, y las opciones del selector no llevan la hora', async () => {
    api()
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=entrenamiento`)
    const traza = (await screen.findByRole('heading', { name: 'Trazabilidad' })).closest('section')!
    expect(within(traza).getByText('Fecha').nextElementSibling).toHaveTextContent(new RegExp(`^${fecha('2026-07-01T10:00:00Z')}$`))
    expect(within(screen.getByLabelText('Entrenamiento')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      `N.º 7 · ${fecha('2026-07-01T10:00:00Z')}`, `N.º 6 · ${fecha('2026-06-01T10:00:00Z')}`])
  })

  it('la comparación técnica no repite lo que AUROC mide: ya lo dice la evaluación', async () => {
    api()
    montar(`/analitica?entrenamiento=7&desenlace=${T3}&ver=evaluacion`)
    const panel = (await screen.findByRole('heading', { name: 'Comparación técnica' })).closest('section')!
    expect(within(panel).queryByText(/AUROC mide qué tan bien ordena/)).not.toBeInTheDocument()
    expect(within(panel).getByText(/si los intervalos se montan/)).toBeInTheDocument()
  })
})

describe('modelos: falla de red', () => {
  it('explica qué pasó, ofrece reintentar y conserva el desenlace y el entrenamiento elegidos', async () => {
    let caida = true
    api('experto', (url) => (caida && /\/analitica\/7\/rendimiento/.test(url) ? { estado: 503, cuerpo: { detail: 'El servidor no responde por ahora.' } } : undefined))
    montar(`/analitica?entrenamiento=7&desenlace=${T40}&ver=evaluacion`, <Ubicacion />)
    const aviso = await screen.findByRole('alert', undefined, { timeout: 20_000 })
    expect(aviso).toHaveTextContent('No se pudo cargar este análisis')
    expect(aviso).toHaveTextContent('El servidor no responde por ahora.')
    expect(screen.getByLabelText('Edad al estimar el riesgo')).toHaveValue(T40)
    expect(screen.getByTestId('ubicacion').textContent).toContain(`desenlace=${T40}`)
    caida = false
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/1\.204 niños, 16,0 % con el desenlace/)).toBeInTheDocument()
    expect(screen.getByLabelText('Edad al estimar el riesgo')).toHaveValue(T40)
  })
})

describe('modelos: los demás submódulos siguen funcionando', () => {
  it('Rendimiento abre con el mismo contexto y los selectores nuevos', async () => {
    api()
    montar(`/analitica/rendimiento?entrenamiento=7&desenlace=${T3}&ver=linea`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Detección y falsas alertas' })).toBeInTheDocument()
    expect(await screen.findByRole('slider')).toHaveValue('10')
    expect(screen.getByLabelText('Edad al estimar el riesgo')).toHaveValue(T3)
  })
})
