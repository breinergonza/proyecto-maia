// Analítica de los modelos: contexto en la URL, estados vacíos, control de «a cuántos niños se alerta», celdas con menos
// de 5 niños, acceso del perfil de consulta y enlace en el menú.
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { SUBMODULOS } from '../paginas/analitica/submodulos'
import { montar, simularApi, usuario } from './util'

// la primera carga de la página descarga recharts y todo el árbol de gráficas
vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 15_000 })

afterEach(() => {
  vi.unstubAllGlobals()
  try { localStorage.clear() } catch { /* sin almacenamiento */ }
})

const contexto = {
  estado: 'ok', entrenamiento: 7,
  modelos: [{ modelo: 'clinico', registro: 'maia', version_registro: 3, fuente: 'simulado', corte: '2026-06-30' }],
  desenlaces: [
    { clave: 'des_a', nombre: 'Desnutrición a 12 meses', etiqueta: 'En uso' },
    { clave: 'des_b', nombre: 'Crecimiento a 12 meses', etiqueta: 'En prueba' },
  ],
  submodulos: SUBMODULOS.map((s) => ({ id: s.id, estado: ['trayectorias', 'perfiles', 'anticipacion'].includes(s.id) ? 'pendiente' : 'ok' })),
  entrenamientos: [{ entrenamiento: 7, creada: '2026-07-01T10:00:00Z' }, { entrenamiento: 6, creada: '2026-06-01T10:00:00Z' }],
}

const percentiles = Array.from({ length: 100 }, (_, i) => {
  const q = i + 1
  return {
    percentil: q, k: q * 10, alertas: q * 10,
    casos_detectados_pct: Math.min(100, q * 4),
    alertas_acertadas_pct: 30,
    sin_falsa_alarma_pct: 90 - q / 10,
    alertas_por_1000: q * 10,
  }
})
const rendimiento = {
  auc_desenlace: { auc: 0.78, ic_bajo: 0.7, ic_alto: 0.85, n: 1000, casos: 60 },
  roc: { puntos: [[0, 0], [0.2, 0.6], [1, 1]] }, pr: { puntos: [[0, 1], [0.5, 0.4], [1, 0.06]], prevalencia: 0.06 }, pr_auc: 0.31,
  metricas_por_top: [{ top_pct: 10, k: 100, alertas: 100, casos_detectados_pct: 40, alertas_acertadas_pct: 24, sin_falsa_alarma_pct: 92, alertas_por_1000: 100 }],
  metricas_por_percentil: percentiles,
  confusion_por_top: [{ top_pct: 10, tp: 24, fp: 76, fn: 36, tn: 2 }],
  lift: { tasa_general: 0.06, deciles: [{ decil: 1, niños: 100, tasa: 0.24, lift: 4 }], acumulado: [] },
  top_k: [{ k: 10, casos: 3, acertadas_pct: 50, detectados_pct: 8 }],
}

function api(rol: Usuario['rol'], extra?: (url: string) => { estado?: number; cuerpo?: unknown } | undefined) {
  return simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    const e = extra?.(url)
    if (e) return e
    if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
    if (url === '/api/analitica/entrenamientos') {
      return { cuerpo: { entrenamientos: contexto.entrenamientos.map((m) => ({ ...m, modelo: 'clinico', desenlaces: contexto.desenlaces, submodulos: contexto.submodulos })) } }
    }
    const m = /^\/api\/analitica\/(\d+)\/(\w+)/.exec(url)
    if (m && m[2] === 'rendimiento') return { cuerpo: { estado: 'ok', entrenamiento: Number(m[1]), submodulo: 'rendimiento', desenlaces: { des_a: rendimiento, des_b: rendimiento } } }
    if (m && ['trayectorias', 'perfiles', 'anticipacion'].includes(m[2])) return { cuerpo: { estado: 'pendiente', entrenamiento: Number(m[1]), submodulo: m[2], desenlaces: {} } }
    return { cuerpo: {} }
  })
}

function Ubicacion() {
  const l = useLocation()
  return <p data-testid="ubicacion">{l.pathname + l.search}</p>
}

describe('analítica: contexto en la URL', () => {
  it('lee entrenamiento y desenlace de la URL, pide ese desenlace y marca «En prueba»', async () => {
    const llamadas = api('datos')
    montar('/analitica/rendimiento?entrenamiento=7&desenlace=des_b', <Ubicacion />)
    // el encabezado nombra el submódulo y su pregunta (plan v3.7, 6.1)
    expect(await screen.findByRole('heading', { level: 1, name: 'Detección y falsas alertas' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Resultado clínico evaluado')).toHaveValue('des_b'))
    expect(screen.getAllByText('En prueba').length).toBeGreaterThan(0)
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/analitica/7/rendimiento?desenlace=des_b')).toBe(true))
    expect(screen.getByText(/versión 3/)).toBeInTheDocument()
  })

  it('al cambiar de desenlace la URL guarda el contexto y las fichas lo conservan', async () => {
    api('datos')
    montar('/analitica/rendimiento?entrenamiento=7', <Ubicacion />)
    const selector = await screen.findByLabelText('Resultado clínico evaluado')
    await waitFor(() => expect(selector).toHaveValue('des_a'))
    fireEvent.change(selector, { target: { value: 'des_b' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/analitica/rendimiento?entrenamiento=7&desenlace=des_b'))
    const ficha = within(screen.getByRole('navigation', { name: 'Submódulos de analítica' })).getByRole('link', { name: /Calibración/ })
    expect(ficha.getAttribute('href')).toBe('/analitica/calibracion?entrenamiento=7&desenlace=des_b')
  })

  it('/analitica abre el resumen', async () => {
    api('datos')
    montar('/analitica', <Ubicacion />)
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/analitica/resumen'))
  })
})

describe('analítica: estados', () => {
  it('sin_artefactos explica que no se recalcula y manda a reentrenar (administración)', async () => {
    api('admin', (url) => (url.startsWith('/api/analitica/7/rendimiento') ? { cuerpo: { estado: 'sin_artefactos', entrenamiento: 7, submodulo: 'rendimiento' } } : undefined))
    montar('/analitica/rendimiento?entrenamiento=7')
    expect(await screen.findByText('Este entrenamiento es anterior a la analítica')).toBeInTheDocument()
    expect(screen.getByText(/vuelva a entrenar el modelo en Administración › Entrenamientos/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a Entrenamientos' })).toHaveAttribute('href', '/admin/entrenamientos')
  })

  it('pendiente dice que el análisis estará disponible pronto', async () => {
    api('datos')
    montar('/analitica/trayectorias?entrenamiento=7')
    expect(await screen.findByText('Este análisis estará disponible pronto')).toBeInTheDocument()
  })
})

describe('analítica: anticipación sin datos', () => {
  it('pendiente muestra el motivo que manda la API y, a quien administra, el enlace a Entrenamientos', async () => {
    api('admin', (url) => (url.startsWith('/api/analitica/7/anticipacion')
      ? { cuerpo: { estado: 'pendiente', entrenamiento: 7, submodulo: 'anticipacion', mensaje: 'Sin desenlaces desde varias visitas.', desenlaces: {} } }
      : undefined))
    montar('/analitica/anticipacion?entrenamiento=7')
    expect(await screen.findByText('Este análisis estará disponible pronto')).toBeInTheDocument()
    expect(screen.getByText('Sin desenlaces desde varias visitas.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a Entrenamientos' })).toHaveAttribute('href', '/admin/entrenamientos')
  })
})

describe('analítica: a cuántos niños se alerta', () => {
  it('empieza en 10 % y el control deslizante recalcula las cifras en el navegador', async () => {
    const llamadas = api('datos')
    montar('/analitica/rendimiento?entrenamiento=7&desenlace=des_a&ver=linea')
    const control = await screen.findByRole('slider')
    expect(control).toHaveValue('10')
    expect(screen.getByTestId('cifra-detectados').textContent).toContain('40')
    const antes = llamadas.length
    fireEvent.change(control, { target: { value: '20' } })
    expect(screen.getByTestId('cifra-detectados').textContent).toContain('80')
    expect(screen.getByTestId('cifra-por-mil').textContent).toBe('200')
    expect(llamadas.length).toBe(antes)   // sin pedir nada a la API
  })

  it('con 2 de cada 100 niños alertados la cifra sale con su número, no oculta', async () => {
    api('datos')
    montar('/analitica/rendimiento?entrenamiento=7&desenlace=des_a&ver=linea')
    const control = await screen.findByRole('slider')
    fireEvent.change(control, { target: { value: '2' } })
    expect(screen.getByTestId('cifra-detectados').textContent).toContain('8')
    expect(screen.queryByText(/sin cifra|n menor que 5/)).not.toBeInTheDocument()
  })

  it('una sola palabra: sin interruptor técnico, «Casos detectados» explica que en estadística es la sensibilidad', async () => {
    api('datos')
    montar('/analitica/rendimiento?entrenamiento=7&desenlace=des_a&ver=linea')
    await screen.findByRole('slider')
    expect(screen.queryByRole('switch', { name: 'Modo técnico' })).not.toBeInTheDocument()
    const termino = screen.getByRole('button', { name: /^Casos detectados/ })
    fireEvent.focus(termino)
    expect(document.getElementById(termino.getAttribute('aria-describedby') ?? '')).toHaveTextContent(/En estadística: sensibilidad/)
    expect(screen.queryByText('Sensibilidad')).not.toBeInTheDocument()
  })
})

describe('analítica: equidad con grupos pequeños', () => {
  it('un grupo de 3 niños dice cuántos son y su AUC pide 20, sin decir «n menor que 5»', async () => {
    api('datos', (url) => {
      if (url.startsWith('/api/analitica/7/equidad')) {
        return { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'equidad', desenlaces: { des_a: { subgrupos: { sexo: [
          { grupo: 'Niñas', n: 500, casos: 30, auc: 0.8, ic_bajo: 0.7, ic_alto: 0.9, riesgo_medio: 0.06, observado: 0.06, tasa_alerta_top10: 0.1, sensibilidad_top10: 0.4 },
          { grupo: 'Otro', n: 3, casos: 1, auc: null, ic_bajo: null, ic_alto: null, riesgo_medio: 0.5, observado: 0.33, tasa_alerta_top10: 0.33, sensibilidad_top10: 1 },
        ] } } } } }
      }
      return undefined
    })
    montar('/analitica/equidad?entrenamiento=7&desenlace=des_a&ver=desenlace')
    // el mapa (pestaña «Por desenlace») es grupo × desenlace para el «Subgrupo por» elegido (aquí, un solo desenlace)
    const mapa = await screen.findByRole('table', { name: 'Qué tan bien ordena por grupo y desenlace' })
    // un desenlace por fila: el encabezado de la primera columna lo dice
    expect(within(mapa).getAllByRole('columnheader')[0]).toHaveTextContent('Desenlace')
    expect(within(mapa).queryByText('n menor que 5')).not.toBeInTheDocument()
    expect(within(mapa).getByText('0,8')).toBeInTheDocument()
    expect(within(mapa).getByText('—')).toBeInTheDocument()   // el AUC de 3 niños no se estima: pide 20
    expect(screen.queryByText('n menor que 5')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sexo', pressed: true })).toBeInTheDocument()
  })
})

describe('analítica: acceso y menú', () => {
  it('el perfil de consulta (visualizador) entra a la analítica', async () => {
    api('visualizador')
    montar('/analitica/resumen?entrenamiento=7')
    expect(await screen.findByRole('heading', { level: 1, name: 'Ficha del modelo' })).toBeInTheDocument()
    expect(screen.queryByText('Sin permiso')).not.toBeInTheDocument()
  })

  it('el menú tiene el grupo «Modelos» con sus submódulos para todos los perfiles', async () => {
    api('visualizador')
    montar('/tablero')
    const enlaces = await screen.findAllByRole('link', { name: 'Evaluación de modelos' })
    expect(enlaces[0]).toHaveAttribute('href', '/analitica/resumen')
    expect(screen.getAllByRole('button', { name: /Desplegar Evaluación de modelos/ }).length).toBeGreaterThan(0)
  })

  it('en la analítica el grupo del menú se abre solo y lista los submódulos', async () => {
    api('datos')
    montar('/analitica/resumen?entrenamiento=7')
    await screen.findByRole('heading', { level: 1, name: 'Ficha del modelo' })
    for (const s of SUBMODULOS) expect(screen.getAllByRole('link', { name: s.texto }).length).toBeGreaterThan(0)
  })
})

describe('analítica: comparar', () => {
  it('«Aprobar B» solo para administración; sin registro de modelos queda deshabilitado y lo explica', async () => {
    api('admin')
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    const boton = await screen.findByRole('button', { name: /Aprobar y activar el modelo B/ })
    await waitFor(() => expect(boton).toBeDisabled())
    expect(await screen.findByText('Diferencia de B frente a A')).toBeInTheDocument()
  })

  it('quien solo consulta no ve «Aprobar B»; el experto en datos aprueba (D77)', async () => {
    api('visualizador')
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    await screen.findByText('Entrenamiento B')
    expect(screen.queryByRole('button', { name: /Aprobar y activar el modelo B/ })).not.toBeInTheDocument()
  })
})

describe('analítica: sin riesgo calculado para el desenlace', () => {
  it('Trayectorias lo explica y ofrece agrupar por perfil o sexo', async () => {
    api('datos', (url) => (url.startsWith('/api/analitica/7/trayectorias')
      ? { cuerpo: { estado: 'pendiente', entrenamiento: 7, submodulo: 'trayectorias', motivo: 'sin_riesgo', grupos: [],
        mensaje: 'La última corrida no calculó el riesgo de este desenlace: el riesgo se calcula solo para los niños que siguen en seguimiento.' } }
      : undefined))
    montar('/analitica/trayectorias?entrenamiento=7&desenlace=des_a')
    expect(await screen.findByText(/siguen en seguimiento/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Perfil de niños' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sexo' })).toBeInTheDocument()
  })
})
