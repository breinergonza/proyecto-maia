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
    casos_detectados_pct: q >= 5 ? Math.min(100, q * 4) : null,
    alertas_acertadas_pct: q >= 5 ? 30 : null,
    sin_falsa_alarma_pct: q >= 5 ? 90 - q / 10 : null,
    alertas_por_1000: q * 10,
  }
})
const rendimiento = {
  auc_desenlace: { auc: 0.78, ic_bajo: 0.7, ic_alto: 0.85, n: 1000, casos: 60 },
  roc: { puntos: [[0, 0], [0.2, 0.6], [1, 1]] }, pr: { puntos: [[0, 1], [0.5, 0.4], [1, 0.06]], prevalencia: 0.06 }, pr_auc: 0.31,
  metricas_por_top: [{ top_pct: 10, k: 100, alertas: 100, casos_detectados_pct: 40, alertas_acertadas_pct: 24, sin_falsa_alarma_pct: 92, alertas_por_1000: 100 }],
  metricas_por_percentil: percentiles,
  confusion_por_top: [{ top_pct: 10, tp: 24, fp: 76, fn: 36, tn: null }],
  lift: { tasa_general: 0.06, deciles: [{ decil: 1, niños: 100, tasa: 0.24, lift: 4 }], acumulado: [] },
  top_k: [{ k: 10, casos: null, acertadas_pct: 50, detectados_pct: 8 }],
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
    const llamadas = api('experto')
    montar('/analitica/rendimiento?entrenamiento=7&desenlace=des_b', <Ubicacion />)
    // el encabezado nombra el submódulo y su pregunta (plan v3.7, 6.1)
    expect(await screen.findByRole('heading', { level: 1, name: 'Rendimiento' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Desenlace')).toHaveValue('des_b'))
    expect(screen.getAllByText('En prueba').length).toBeGreaterThan(0)
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/analitica/7/rendimiento?desenlace=des_b')).toBe(true))
    expect(screen.getByText(/versión 3/)).toBeInTheDocument()
  })

  it('al cambiar de desenlace la URL guarda el contexto y las fichas lo conservan', async () => {
    api('experto')
    montar('/analitica/rendimiento?entrenamiento=7', <Ubicacion />)
    const selector = await screen.findByLabelText('Desenlace')
    await waitFor(() => expect(selector).toHaveValue('des_a'))
    fireEvent.change(selector, { target: { value: 'des_b' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/analitica/rendimiento?entrenamiento=7&desenlace=des_b'))
    const ficha = within(screen.getByRole('navigation', { name: 'Submódulos de analítica' })).getByRole('link', { name: /Calibración/ })
    expect(ficha.getAttribute('href')).toBe('/analitica/calibracion?entrenamiento=7&desenlace=des_b')
  })

  it('/analitica abre el resumen', async () => {
    api('experto')
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
    api('experto')
    montar('/analitica/trayectorias?entrenamiento=7')
    expect(await screen.findByText('Este análisis estará disponible pronto')).toBeInTheDocument()
  })
})

describe('analítica: a cuántos niños se alerta', () => {
  it('empieza en 10 % y el control deslizante recalcula las cifras en el navegador', async () => {
    const llamadas = api('experto')
    montar('/analitica/rendimiento?entrenamiento=7&desenlace=des_a')
    const control = await screen.findByRole('slider')
    expect(control).toHaveValue('10')
    expect(screen.getByTestId('cifra-detectados').textContent).toContain('40')
    const antes = llamadas.length
    fireEvent.change(control, { target: { value: '20' } })
    expect(screen.getByTestId('cifra-detectados').textContent).toContain('80')
    expect(screen.getByTestId('cifra-por-mil').textContent).toBe('200')
    expect(llamadas.length).toBe(antes)   // sin pedir nada a la API
  })

  it('con menos de 5 niños la cifra dice «n menor que 5»', async () => {
    api('experto')
    montar('/analitica/rendimiento?entrenamiento=7&desenlace=des_a')
    const control = await screen.findByRole('slider')
    fireEvent.change(control, { target: { value: '2' } })
    expect(screen.getByTestId('cifra-detectados').textContent).toBe('n menor que 5')
    expect(screen.getAllByText('n menor que 5').length).toBeGreaterThan(1)
  })

  it('el modo técnico (interruptor del encabezado) muestra la jerga y se recuerda', async () => {
    api('experto')
    montar('/analitica/rendimiento?entrenamiento=7&desenlace=des_a')
    await screen.findByRole('slider')
    expect(screen.queryByText('Sensibilidad')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Modo técnico' }))
    expect(screen.getAllByText('Sensibilidad').length).toBeGreaterThan(0)
    expect(localStorage.getItem('maia.analitica.tecnico')).toBe('1')
  })
})

describe('analítica: privacidad (n<5) en equidad', () => {
  it('un grupo con menos de 5 niños no enseña cifras', async () => {
    api('experto', (url) => {
      if (url.startsWith('/api/analitica/7/equidad')) {
        return { cuerpo: { estado: 'ok', entrenamiento: 7, submodulo: 'equidad', desenlaces: { des_a: { subgrupos: { sexo: [
          { grupo: 'Niñas', n: 500, casos: 30, auc: 0.8, ic_bajo: 0.7, ic_alto: 0.9, riesgo_medio: 0.06, observado: 0.06, tasa_alerta_top10: 0.1, sensibilidad_top10: 0.4 },
          { grupo: 'Otro', n: 3, casos: 0, auc: 0.5, ic_bajo: null, ic_alto: null, riesgo_medio: 0.5, observado: 0.5, tasa_alerta_top10: null, sensibilidad_top10: null },
        ] } } } } }
      }
      return undefined
    })
    montar('/analitica/equidad?entrenamiento=7&desenlace=des_a')
    // el mapa ahora es grupo × desenlace para el «Subgrupo por» elegido (aquí, un solo desenlace)
    const mapa = await screen.findByRole('table', { name: 'Qué tan bien ordena por grupo y desenlace' })
    expect(within(mapa).getAllByText('n menor que 5')).toHaveLength(1)
    expect(within(mapa).getByText('0,8')).toBeInTheDocument()
    expect(within(mapa).queryByText('0,5')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sexo', pressed: true })).toBeInTheDocument()
  })
})

describe('analítica: acceso y menú', () => {
  it('el perfil de consulta (visualizador) entra a la analítica', async () => {
    api('visualizador')
    montar('/analitica/resumen?entrenamiento=7')
    expect(await screen.findByRole('heading', { level: 1, name: 'Resumen' })).toBeInTheDocument()
    expect(screen.queryByText('Sin permiso')).not.toBeInTheDocument()
  })

  it('el menú tiene el grupo «Analítica» con sus submódulos para todos los perfiles', async () => {
    api('visualizador')
    montar('/')
    const enlaces = await screen.findAllByRole('link', { name: 'Analítica' })
    expect(enlaces[0]).toHaveAttribute('href', '/analitica/resumen')
    expect(screen.getAllByRole('button', { name: /Desplegar Analítica/ }).length).toBeGreaterThan(0)
  })

  it('en la analítica el grupo del menú se abre solo y lista los submódulos', async () => {
    api('experto')
    montar('/analitica/resumen?entrenamiento=7')
    await screen.findByRole('heading', { level: 1, name: 'Resumen' })
    for (const s of SUBMODULOS) expect(screen.getAllByRole('link', { name: s.texto }).length).toBeGreaterThan(0)
  })
})

describe('analítica: comparar', () => {
  it('«Aprobar B» solo para administración; sin registro de modelos queda deshabilitado y lo explica', async () => {
    api('admin')
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    const boton = await screen.findByRole('button', { name: /Aprobar B/ })
    await waitFor(() => expect(boton).toBeDisabled())
    expect(await screen.findByText('Diferencia de B frente a A')).toBeInTheDocument()
  })

  it('un experto no ve «Aprobar B»', async () => {
    api('experto')
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    await screen.findByText('Entrenamiento B')
    expect(screen.queryByRole('button', { name: /Aprobar B/ })).not.toBeInTheDocument()
  })
})

describe('analítica: sin riesgo calculado para el desenlace', () => {
  it('Trayectorias lo explica y ofrece agrupar por perfil o sexo', async () => {
    api('experto', (url) => (url.startsWith('/api/analitica/7/trayectorias')
      ? { cuerpo: { estado: 'pendiente', entrenamiento: 7, submodulo: 'trayectorias', motivo: 'sin_riesgo', grupos: [],
        mensaje: 'La última corrida no calculó el riesgo de este desenlace: el riesgo se calcula solo para los niños que siguen en seguimiento.' } }
      : undefined))
    montar('/analitica/trayectorias?entrenamiento=7&desenlace=des_a')
    expect(await screen.findByText(/siguen en seguimiento/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Perfil' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sexo' })).toBeInTheDocument()
  })
})
