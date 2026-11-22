// Modelos (parte 1): Resumen, Rendimiento, Anticipación, Calibración y Qué datos pesan reparten su contenido en pestañas por la
// pregunta que contesta cada bloque (la primera responde la pregunta de la página), con la pestaña en la dirección (?ver=); y el
// marco de Analítica pone el contexto (selectores, estado y de dónde salen los datos) en una sola tarjeta compacta.
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { SUBMODULOS } from '../paginas/analitica/submodulos'
import { montar, simularApi, usuario } from './util'

vi.setConfig({ testTimeout: 30_000 })
configure({ asyncUtilTimeout: 20_000 })

afterEach(() => {
  vi.unstubAllGlobals()
  try { localStorage.clear(); sessionStorage.clear() } catch { /* sin almacenamiento */ }
})

const desenlaces = [{ clave: 'readm_3m', nombre: 'Readmisión a 3 meses', momento: '40 sem', etiqueta: 'En uso' }]
const meta = {
  entrenamiento: 7, modelo: 'clinico', fuente: 'simulado', registro: 'maia-clinico', version_registro: 3, version_modelo: 'abc123',
  corte: '2026-06-30', creada: '2026-07-01T10:00:00Z', desenlaces, submodulos: SUBMODULOS.map((s) => ({ id: s.id, estado: 'ok' })),
  hiperparametros: [{ nombre: 'rondas', etiqueta: 'Rondas de boosting (máximo)', valor: 1200 }],
}
const contexto = {
  estado: 'ok', entrenamiento: 7,
  modelos: [{ modelo: 'clinico', registro: 'maia-clinico', version_registro: 3, version_modelo: 'abc123', fuente: 'simulado', corte: '2026-06-30' }],
  desenlaces, submodulos: meta.submodulos,
  entrenamientos: [{ entrenamiento: 7, creada: '2026-07-01T10:00:00Z' }],
}
const percentiles = Array.from({ length: 100 }, (_, i) => {
  const q = i + 1
  return { percentil: q, k: q * 10, alertas: q * 10, casos_detectados_pct: q >= 5 ? Math.min(100, q * 4) : null, alertas_acertadas_pct: 30, sin_falsa_alarma_pct: 90, alertas_por_1000: q * 10 }
})
const rendimiento = {
  auc_desenlace: { auc: 0.78, ic_bajo: 0.7, ic_alto: 0.85, n: 1000, casos: 160 },
  roc: { puntos: [[0, 0], [0.2, 0.6], [1, 1]] }, pr: { puntos: [[0, 1], [0.5, 0.4], [1, 0.16]], prevalencia: 0.16 }, pr_auc: 0.31,
  metricas_por_top: [{ top_pct: 10, k: 100, alertas: 100, casos_detectados_pct: 40, alertas_acertadas_pct: 24, sin_falsa_alarma_pct: 92, alertas_por_1000: 100 }],
  metricas_por_percentil: percentiles,
  confusion_por_top: [{ top_pct: 10, tp: 79, fp: 162, fn: 114, tn: 849 }],
  lift: { tasa_general: 0.16, deciles: [{ decil: 1, niños: 100, tasa: 0.4, lift: 2.5 }, { decil: 2, niños: 100, tasa: 0.3, lift: 1.9 }], acumulado: [] },
  top_k: [{ k: 10, casos: 6, acertadas_pct: 60, detectados_pct: 8 }],
  referencia: { auc_desenlace: { auc: 0.6, ic_bajo: 0.55, ic_alto: 0.65, n: 1000, casos: 160 }, casos_top10_pct: 20 },
}
const calibracion = {
  n: 1000, brier: 0.05, ece: 0.03, riesgo_medio: 0.16, observado: 0.16, razon_riesgo_observado: 1,
  bins: [{ bin: 1, n: 400, riesgo_medio: 0.05, observado: 0.04 }, { bin: 2, n: 600, riesgo_medio: 0.25, observado: 0.27 }],
  histograma: [{ desde: 0, hasta: 0.2, n: 600 }, { desde: 0.2, hasta: 0.4, n: 400 }],
  decision: { lectura: 'Beneficio neto de ejemplo.', puntos: [{ umbral: 0.1, modelo: 0.05, todos: 0.02, ninguno: 0, alertas_pct: 30 }, { umbral: 0.2, modelo: 0.04, todos: -0.1, ninguno: 0, alertas_pct: 10 }] },
  hist_riesgo: { estado: 'ok', n: 1000, casos: 160, mediana_con: 0.3, mediana_sin: 0.1, tramos: [{ desde: 0, hasta: 0.5, con: 30, sin: 600 }, { desde: 0.5, hasta: 1, con: 130, sin: 240 }] },
}
const resumenPorDesenlace = { auc: 0.78, ic_bajo: 0.7, ic_alto: 0.85, auc_ref: 0.6, semaforos: [{ id: 'auc', nombre: 'Detección y falsas alertas', estado: 'verde', valor: 0.78, detalle: 'Ordena bien.', umbral: 'AUC ≥ 0,7' }] }
const por = (t: number, a: number, d: number | null, c: number | null) => ({ top_pct: t, alertas: a, casos_detectados_pct: d, alertas_acertadas_pct: c })
const anticipacion = {
  nombre: 'readmisión entre los 3 y los 6 meses', etiqueta: 'En uso', top_pct: 10,
  visitas: [{ desde: '3 m EC', etapa: '6 m EC', ventaja_visitas: 1, casos: 36, alertas: 28, casos_detectados_pct: 40, alertas_acertadas_pct: 51 }],
  avisados_antes: { casos: 44, avisados: 22, pct: 50, meta: 'D12: avisar al menos una visita antes del desenlace' },
  metricas_por_visita: { familia: 'readm_3m', nombre: 'readmisión', tops: [5, 10, 20], visitas: [
    { desde: '3 m EC', etapa: '6 m EC', ventaja_visitas: 1, n: 280, casos: 36, auc: 0.72, por_top: [por(5, 14, 20, 50), por(10, 28, 40, 51), por(20, 56, 58, 40)] },
    { desde: '40 sem', etapa: '6 m EC', ventaja_visitas: 2, n: 300, casos: 40, auc: 0.61, por_top: [por(5, 15, 12, 40), por(10, 30, 25, 33), por(20, 60, 41, 27)] }] },
  primera_alerta: { familia: 'readm_3m', nombre: 'readmisión', top_pct: 10, casos: 44, meta: 'D12', distribucion: [{ desde: '3 m EC', ventaja_visitas: 1, casos: 11, pct: 25 }], sin_alerta: { casos: 22, pct: 50 }, ventaja_visitas: { media: null, mediana: null } },
}
const riesgoNinos = {
  corrida_id: 4, desenlace: 'readm_3m', umbral_percentil: 90, elegidos_por: 'mayor_riesgo',
  ninos: [{ sujeto: 'N-017', primera_alerta: { clave: 'a', momento: '3 m EC', momento_nombre: '3 meses', orden: 3, percentil: 93 },
    puntos: [{ clave: 'a', desenlace: 'readmisión', momento: '3 m EC', momento_nombre: '3 meses', orden: 3, riesgo: 0.4, percentil: 93, fecha_visita: null },
      { clave: 'b', desenlace: 'readmisión', momento: '40 sem', momento_nombre: '40 semanas', orden: 4, riesgo: 0.5, percentil: 96, fecha_visita: null }] }],
}
const interpretabilidad = {
  importancia: [{ variable: 'ern_peso', importancia_pct: 60 }], avisos: [],
  shap_global: { n: 800, metodo: 'TreeSHAP', advertencia: 'Asociación del modelo, no causa.', deciles: {},
    variables: [{ variable: 'ern_peso', etiqueta: 'Peso al nacer', importancia: 0.9, importancia_pct: 60, n: 800 }] },
  pdp: { n: 800, riesgo_medio: 0.2, advertencia: '', variables: [{ variable: 'ern_peso', etiqueta: 'Peso al nacer', n: 800, categorica: false, puntos: [[1000, 0.4], [1500, 0.2], [2000, 0.1]] }] },
  motivos_frecuentes: { n_alertas: 80, por_nino: 3, advertencia: '', motivos: [{ variable: 'ern_peso', etiqueta: 'Peso al nacer', n: 70, pct: 87.5 }] },
  interaccion: { n: 800, advertencia: '', pares: [{ a: 'ern_peso', b: 'eg', etiqueta_a: 'Peso al nacer', etiqueta_b: 'Edad gestacional', cortes_a: [1400], cortes_b: [32],
    celdas: [{ i: 0, j: 0, n: 100, riesgo_medio: 0.5 }, { i: 0, j: 1, n: 90, riesgo_medio: 0.2 }, { i: 1, j: 0, n: 90, riesgo_medio: 0.2 }, { i: 1, j: 1, n: 200, riesgo_medio: 0.05 }] }] },
}

/** ``caida``: la petición que empieza así falla como falla el navegador sin conexión. ``sinCorrida``: los niños de ejemplo
 *  responden 409, como cuando no hay un paquete activo. */
function api(rol: Usuario['rol'] = 'datos', { caida, sinCorrida = false }: { caida?: string; sinCorrida?: boolean } = {}) {
  return simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (caida && url.startsWith(caida)) throw new TypeError('Failed to fetch')
    if (sinCorrida && url.startsWith('/api/analitica/riesgo-por-visita')) return { estado: 409, cuerpo: { detail: 'No hay un paquete activo.' } }
    if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
    if (url === '/api/analitica/entrenamientos') return { cuerpo: { entrenamientos: [meta] } }
    if (url === '/api/modelos/activo') return { cuerpo: { version: '2026-11-19-5dcbdc', fuente: 'simulado', activo: true, metricas: {}, modelos: { clinico: { version_modelo: 'abc123' } } } }
    if (url.startsWith('/api/analitica/riesgo-por-visita')) return { cuerpo: riesgoNinos }
    const m = /^\/api\/analitica\/7\/(\w+)/.exec(url)
    if (!m) return undefined
    const base = { estado: 'ok', entrenamiento: 7, submodulo: m[1], meta }
    const datos: Record<string, object> = {
      rendimiento, calibracion, anticipacion, interpretabilidad, resumen: resumenPorDesenlace,
    }
    if (!datos[m[1]]) return undefined
    return { cuerpo: { ...base, desenlaces: { readm_3m: datos[m[1]] } } }
  })
}

function Ubicacion() {
  const l = useLocation()
  return <p data-testid="ubicacion">{l.pathname + l.search}</p>
}

const ruta = (sub: string, ver?: string) => `/analitica/${sub}?entrenamiento=7&desenlace=readm_3m${ver ? `&ver=${ver}` : ''}`
const pestana = (nombre: string) => screen.findByRole('tab', { name: nombre })

describe('Modelos 1: Resumen en pestañas', () => {
  it('abre en «Cómo le fue» y lo técnico del entrenamiento queda en la última pestaña', async () => {
    api()
    montar(ruta('resumen'), <Ubicacion />)
    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['Resultados de validación', 'Aciertos y calibración', 'Datos y configuración del entrenamiento'])
    expect(await pestana('Resultados de validación')).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: 'Evaluación en prueba' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Comparación técnica' })).toBeInTheDocument()
    expect(screen.getByText('Rendimiento', { selector: 'span.font-semibold' })).toBeInTheDocument()   // la revisión rápida, junto a la evaluación
    expect(screen.queryByRole('heading', { name: 'Configuración' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Aciertos y calibración' }))
    expect(await screen.findByRole('table', { name: 'Aciertos y errores de la alerta' })).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: /Riesgo estimado frente a riesgo observado/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Datos y configuración del entrenamiento' }))
    expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trazabilidad' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Evaluación en prueba' })).not.toBeInTheDocument()
    expect(screen.getByTestId('ubicacion').textContent).toContain('ver=entrenamiento')
  })

  it('la pestaña de la dirección se abre directamente', async () => {
    api()
    montar(ruta('resumen', 'graficas'))
    expect(await screen.findByRole('table', { name: 'Aciertos y errores de la alerta' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Aciertos y calibración' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('Modelos 1: Rendimiento en pestañas', () => {
  it('«Curvas» responde primero; «Línea de alerta» trae el control, la matriz y la tabla; «Por desenlace» la lista', async () => {
    api()
    montar(ruta('rendimiento'), <Ubicacion />)
    expect(await pestana('Curvas de rendimiento')).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Casos detectados frente a falsas alertas')).toBeInTheDocument()
    expect(screen.getByText('Alertas acertadas frente a casos detectados')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Umbral de alerta' }))
    const control = await screen.findByRole('slider')
    expect(control).toHaveValue('10')
    expect(screen.getByRole('table', { name: 'Aciertos y errores de la alerta' })).toBeInTheDocument()
    expect(screen.getByText('Qué pasa según la línea de alerta')).toBeInTheDocument()
    fireEvent.change(control, { target: { value: '20' } })
    expect(screen.getByTestId('cifra-detectados').textContent).toContain('80')
    expect(screen.getByTestId('ubicacion').textContent).toContain('ver=linea')

    await userEvent.click(screen.getByRole('tab', { name: 'Por desenlace' }))
    expect(await screen.findByRole('figure', { name: 'Qué tan bien ordena el modelo, por desenlace' })).toBeInTheDocument()
    expect(screen.getByText(/Frente a la regla de referencia/)).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('el control de la línea de alerta conserva su valor al cambiar de pestaña', async () => {
    api()
    montar(ruta('rendimiento', 'linea'))
    fireEvent.change(await screen.findByRole('slider'), { target: { value: '30' } })
    await userEvent.click(screen.getByRole('tab', { name: 'Curvas de rendimiento' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Umbral de alerta' }))
    expect(await screen.findByRole('slider')).toHaveValue('30')
  })
})

describe('Modelos 1: Anticipación en pestañas', () => {
  it('«Ventaja» abre primero; «Qué cuesta avisar antes» y «Tabla y niños de ejemplo» traen el resto', async () => {
    api('admin')
    montar(ruta('anticipacion'), <Ubicacion />)
    expect(await pestana('Ventaja')).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Casos avisados al menos una visita antes')).toBeInTheDocument()
    expect(screen.getByText('Cuántas visitas antes se avisó cada caso')).toBeInTheDocument()
    expect(screen.queryByText('Cada visita de cálculo')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Qué cuesta avisar antes' }))
    expect(await screen.findByText('Qué tan temprano se puede avisar')).toBeInTheDocument()
    expect(screen.getByText('El precio de avisar antes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Tabla y niños de ejemplo' }))
    expect(await screen.findByText('Cada visita de cálculo')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'N-017' })).toBeInTheDocument()
    expect(screen.getByTestId('ubicacion').textContent).toContain('ver=tabla')
  })

  it('el porcentaje de alerta se elige desde cualquier pestaña y cambia la tabla', async () => {
    api('datos')
    montar(ruta('anticipacion', 'tabla'))
    await screen.findByText('Cada visita de cálculo')
    fireEvent.change(screen.getByLabelText('Alertar al'), { target: { value: '20' } })
    await waitFor(() => expect(screen.getAllByText('58,0 %').length).toBeGreaterThan(0))
  })

  it('quien no ve niños individuales no tiene la parte de niños de ejemplo', async () => {
    api('visualizador')
    montar(ruta('anticipacion', 'tabla'))
    expect(await screen.findByText('Cada visita de cálculo')).toBeInTheDocument()
    expect(screen.queryByText('Riesgo de tres niños, visita por visita')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tabla por visita' })).toBeInTheDocument()
  })
})

describe('Modelos 1: Calibración en pestañas', () => {
  it('cada pestaña responde una pregunta de la calibración y las elecciones se conservan', async () => {
    api()
    montar(ruta('calibracion'), <Ubicacion />)
    expect(await pestana('Riesgo estimado frente al observado')).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Qué tan fiable es el porcentaje')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Riesgo estimado frente al observado' })).toBeInTheDocument()
    expect(screen.getByText('Por grupos de niños')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Distribución del riesgo estimado' }))
    expect(await screen.findByText('Riesgo de los niños con y sin el desenlace')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Distribución del riesgo estimado' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Niños por revisar según el umbral' }))
    expect(await screen.findByRole('heading', { name: 'Niños por revisar según el umbral' })).toBeInTheDocument()
    const capacidad = screen.getByLabelText('Niños que el equipo puede revisar')
    fireEvent.change(capacidad, { target: { value: '7' } })

    await userEvent.click(screen.getByRole('tab', { name: 'Beneficio y costo' }))
    expect(await screen.findByText('Beneficio de alertar')).toBeInTheDocument()
    expect(screen.getByText('Costo de equivocarse')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
    expect(screen.getByTestId('ubicacion').textContent).toContain('ver=beneficio')

    await userEvent.click(screen.getByRole('tab', { name: 'Niños por revisar según el umbral' }))
    expect(screen.getByLabelText('Niños que el equipo puede revisar')).toHaveValue(7)
    await userEvent.click(screen.getByRole('tab', { name: 'Beneficio y costo' }))
    expect(screen.getByRole('slider')).toHaveValue('5')
  })
})

describe('Modelos 1: Qué datos pesan en pestañas', () => {
  it('«Qué datos pesan» junta la importancia y los motivos; las curvas y la combinación van aparte', async () => {
    api()
    montar(ruta('interpretabilidad'), <Ubicacion />)
    expect(await pestana('Qué datos pesan')).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('Qué datos pesan más')).toBeInTheDocument()
    expect(screen.getByText('Motivos frecuentes')).toBeInTheDocument()
    expect(screen.queryByText('Cómo cambia el riesgo con un dato')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Cómo cambia el riesgo' }))
    expect(await screen.findByText('Cómo cambia el riesgo con un dato')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Dato que cambia' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Combinación' }))
    expect(await screen.findByText('Combinación de dos datos')).toBeInTheDocument()
    expect(screen.getByTestId('ubicacion').textContent).toContain('ver=combinacion')
  })
})

describe('Modelos 1: el marco de Analítica es compacto', () => {
  it('la tarjeta de contexto trae los tres selectores, el estado y de dónde salen los datos', async () => {
    api()
    montar(ruta('rendimiento'))
    const region = await screen.findByRole('region', { name: 'Contexto de análisis' })
    expect(await within(region).findByLabelText('Resultado clínico evaluado')).toBeInTheDocument()
    expect(within(region).getByLabelText('Edad al estimar el riesgo')).toBeInTheDocument()
    expect(within(region).getByLabelText('Entrenamiento')).toBeInTheDocument()
    expect(await within(region).findByText('Estado:')).toBeInTheDocument()
    expect(within(region).getByText(/Datos simulados/)).toBeInTheDocument()
    // el título, la pregunta y la guía siguen en el encabezado; no hay modo técnico: una sola palabra (S22)
    expect(screen.getByRole('heading', { level: 1, name: 'Detección y falsas alertas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guía de lectura' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Modo técnico' })).not.toBeInTheDocument()
  })

  it('el estado y el origen de los datos van en la misma línea, bajo los selectores', async () => {
    api()
    montar(ruta('rendimiento'))
    const region = await screen.findByRole('region', { name: 'Contexto de análisis' })
    const estado = await within(region).findByText('Estado:')
    const origen = within(region).getByText(/Datos simulados/)
    expect(estado.closest('[data-linea-contexto]')).not.toBeNull()
    expect(estado.closest('[data-linea-contexto]')).toBe(origen.closest('[data-linea-contexto]'))
  })
})

describe('Modelos sin red (prueba de resiliencia del asesor)', () => {
  it('los niños de ejemplo de Anticipación se pueden reintentar', async () => {
    const llamadas = api('admin', { caida: '/api/analitica/riesgo-por-visita' })
    montar(ruta('anticipacion', 'tabla'))
    const pedidas = () => llamadas.filter((l) => l.url.startsWith('/api/analitica/riesgo-por-visita')).length
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(pedidas()).toBe(2))
    expect(screen.queryByText(/Todavía no hay una corrida/)).not.toBeInTheDocument()
  })

  it('sin corrida activa, Anticipación lo dice sin ofrecer reintentar', async () => {
    api('admin', { sinCorrida: true })
    montar(ruta('anticipacion', 'tabla'))
    expect(await screen.findByText(/Todavía no hay una corrida con un modelo activo/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('un análisis que se calcula al pedirlo (Trayectorias) se puede reintentar', async () => {
    const llamadas = api('datos', { caida: '/api/analitica/7/trayectorias' })
    montar(ruta('trayectorias'))
    const pedidas = () => llamadas.filter((l) => l.url.startsWith('/api/analitica/7/trayectorias')).length
    const boton = await screen.findByRole('button', { name: 'Reintentar' })
    const antes = pedidas()
    await userEvent.click(boton)
    await waitFor(() => expect(pedidas()).toBe(antes + 1))
  })
})
