// Modelos (analítica), segunda mitad: Población, Equidad, Estabilidad, Trayectorias, Perfiles y Comparar reparten su
// contenido en pestañas por la pregunta que responde cada una (para no desplazar la página en escritorio). La pestaña
// elegida vive en la dirección (?ver=), la primera responde la pregunta principal y nada de lo que había se pierde.
import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
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

const contexto = {
  estado: 'ok', entrenamiento: 7,
  modelos: [{ modelo: 'clinico', registro: 'maia', version_registro: 3, fuente: 'simulado', corte: '2026-06-30' }],
  desenlaces: [{ clave: 'des_a', nombre: 'Desnutrición a 12 meses', etiqueta: 'En uso' }, { clave: 'des_b', nombre: 'Crecimiento a 12 meses', etiqueta: 'En prueba' }],
  submodulos: SUBMODULOS.map((s) => ({ id: s.id, estado: 'ok' })),
  entrenamientos: [{ entrenamiento: 7, creada: '2026-07-01T10:00:00Z' }, { entrenamiento: 6, creada: '2026-06-01T10:00:00Z' }],
}
const meta = (n: number, version: string) => ({ entrenamiento: n, modelo: 'clinico', fuente: 'simulado', registro: 'maia', version_registro: version, corte: '2026-06-30', creada: `2026-0${n - 5}-01T10:00:00Z`, desenlaces: [], submodulos: [] })

const tramos = (n: number) => Array.from({ length: n }, (_, i) => `202${Math.floor(i / 4)}-T${(i % 4) + 1}`)
const poblacion = {
  embudo: [{ paso: 'niños del corte', n: 2000 }, { paso: 'con desenlace conocido', n: 1500 }], eventos: { niños: 1500, casos: 90, tasa: 0.06 },
  nulos: Array.from({ length: 12 }, (_, i) => ({ variable: `dato_${i}`, nulos_pct: i * 5 })),
  distribuciones_muestra_universo: {
    estado: 'ok', universo: 'u', muestra: 'm', minimo_ninos: 20,
    categoricas: { sexo: { n_universo: 2000, n_muestra: 1500, diferencia_maxima_pp: 1.2, categorias: [
      { categoria: 'femenino', n_universo: 980, n_muestra: 740, pct_universo: 49, pct_muestra: 49.3, diferencia_pp: 0.3 },
      { categoria: 'masculino', n_universo: 1020, n_muestra: 760, pct_universo: 51, pct_muestra: 50.7, diferencia_pp: -0.3 },
    ] } },
    numericas: { 'edad gestacional (semanas)': { n_universo: 2000, n_muestra: 1500,
      universo: { p5: 28, p25: 31, p50: 34, p75: 37, p95: 40 }, muestra: { p5: 29, p25: 32, p50: 35, p75: 37, p95: 40 } } },
  },
}
const fila = (grupo: string, auc: number) => ({ grupo, n: 500, casos: 30, auc, ic_bajo: auc - 0.1, ic_alto: auc + 0.1, riesgo_medio: 0.06, observado: 0.06, tasa_alerta_top10: 0.1, sensibilidad_top10: 0.4 })
const equidad = { subgrupos: { sexo: [fila('Niñas', 0.8), fila('Niños', 0.7)], sede: [fila('1', 0.75), fila('2', 0.6)] } }
const auc = (t: string, v: number) => ({ trimestre: t, n: 80, casos: 9, auc: v, ic_bajo: v - 0.1, ic_alto: v + 0.1 })
const estabilidad = {
  metricas_trimestre: tramos(6).map((t, i) => auc(t, 0.85 - i * 0.01)),
  alertas_trimestre: tramos(6).map((t) => ({ trimestre: t, n: 80, alertas: 8, alertas_por_1000: 100, casos: 9 })),
  psi: { trimestres: ['2020-T1', '2020-T2'], variables: { peso: { '2020-T1': 0.05, '2020-T2': 0.3 }, talla: { '2020-T1': 0.02, '2020-T2': 0.12 } } },
}
const etapa = (e: string, nombre: string, orden: number, z: number | null) => ({
  etapa: e, nombre, orden, n: 12, edad_media_meses: orden * 3, z_media: z, z_desvio: 0.8, diferencia_oms: z, valor_medio: 5.2, valor_desvio: 0.5, unidad: 'kg',
})
const trayectorias = {
  estado: 'ok', entrenamiento: 7, indicador: 'peso', etiqueta: 'En uso', individuales_visibles: true,
  grupos: [{ grupo: 'Riesgo alto', ninos: 12, etapas: [etapa('3m', '3 meses', 1, -1.2), etapa('6m', '6 meses', 2, -1.5)] },
    { grupo: 'Resto', ninos: 40, etapas: [etapa('3m', '3 meses', 1, 0.1), etapa('6m', '6 meses', 2, 0.2)] }],
  individuales: [{ codigo: 'N-001', grupo: 'Riesgo alto', serie: [{ etapa: '3m', nombre: '3 meses', orden: 1, edad_meses: 3, z: -1.4 }] }],
}
const rend = (a: number) => ({
  auc_desenlace: { auc: a, ic_bajo: a - 0.05, ic_alto: a + 0.05, n: 1500, casos: 90 }, roc: { puntos: [[0, 0], [0.2, 0.6], [1, 1]] },
  pr: { puntos: [[0, 1], [1, 0.06]], prevalencia: 0.06 }, pr_auc: 0.3,
  metricas_por_top: [{ top_pct: 10, k: 150, alertas: 150, casos_detectados_pct: 40, alertas_acertadas_pct: 24, sin_falsa_alarma_pct: 92, alertas_por_1000: 100 }],
  metricas_por_percentil: [], confusion_por_top: [], lift: { tasa_general: 0.06, deciles: [], acumulado: [] }, top_k: [],
})
const comparacion = {
  estado: 'ok', desenlace: 'des_a', replicas: 500, aviso: 'El intervalo de la diferencia es aproximado.',
  a: { entrenamiento: 6, fuente: 'simulado', corte: '2026-05-31', version_registro: '2', n: 1500, casos: 90 },
  b: { entrenamiento: 7, fuente: 'simulado', corte: '2026-06-30', version_registro: '3', n: 1500, casos: 90 },
  metricas: [{ id: 'auc', texto: 'AUC', unidad: 'abs', a: 0.7, b: 0.78, diferencia: 0.08, ic_bajo: 0.04, ic_alto: 0.12, clara: true, n_a: 1500, n_b: 1500 }],
  por_grupo: [{ variable: 'sexo', grupo: 'femenino', a: 0.7, b: 0.8, diferencia: 0.1, ic_bajo: 0.02, ic_alto: 0.18, clara: true, n_a: 740, n_b: 740 }],
  calibracion: [],
}

function api(rol: Usuario['rol']) {
  return simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
    if (url === '/api/analitica/entrenamientos') return { cuerpo: { entrenamientos: [meta(7, '3'), meta(6, '2')] } }
    if (url.startsWith('/api/analitica/comparar?')) return { cuerpo: comparacion }
    const m = /^\/api\/analitica\/(\d+)\/(\w+)/.exec(url)
    if (!m) return undefined
    const por = (d: unknown) => ({ cuerpo: { estado: 'ok', entrenamiento: Number(m[1]), submodulo: m[2], desenlaces: { des_a: d, des_b: d } } })
    if (m[2] === 'poblacion') return por(poblacion)
    if (m[2] === 'equidad') return por(equidad)
    if (m[2] === 'estabilidad') return por(estabilidad)
    if (m[2] === 'trayectorias') return { cuerpo: trayectorias }
    if (m[2] === 'perfiles') return { cuerpo: { estado: 'ok', entrenamiento: 7, ninos: 100, unidad_peso: 'g', confianza: { aprobacion: 'pendiente' },
      eg: [{ categoria: 'a', etiqueta: 'Muy prematuro', n: 20, tasa: 0.25, eg_media: 29.5, peso_medio: 1200 }], lubchenco: [] } }
    if (m[2] === 'rendimiento') return { cuerpo: { estado: 'ok', entrenamiento: Number(m[1]), submodulo: 'rendimiento', meta: meta(Number(m[1]), '3'), desenlaces: { des_a: rend(m[1] === '7' ? 0.78 : 0.7) } } }
    return { cuerpo: {} }
  })
}

function Ubicacion() {
  const { search } = useLocation()
  return <p data-testid="ubicacion">{search}</p>
}

/** Las pestañas de la página (lista «Qué ver») y la que está elegida. */
const lista = async () => within(await screen.findByRole('tablist', { name: 'Qué ver' }))
const nombres = async () => (await lista()).getAllByRole('tab').map((t) => t.textContent)
const elegida = async () => (await lista()).getByRole('tab', { selected: true }).textContent

describe('Población en pestañas', () => {
  it('abre en «La muestra» (cifras y embudo) y deja lo demás en sus pestañas', async () => {
    api('datos')
    montar('/analitica/poblacion?entrenamiento=7&desenlace=des_a')
    expect(await nombres()).toEqual(['La muestra', 'Casos por desenlace', 'Reparto por categoría', 'Valores típicos', 'Datos faltantes'])
    expect(await elegida()).toBe('La muestra')
    expect(await screen.findByText('La muestra en cifras')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Niños que quedan después de cada filtro' })).toBeInTheDocument()
    expect(screen.queryByText('Cuántos casos hay para validar', { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'Porcentaje de niños sin cada dato' })).not.toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'sexo: la muestra frente a todos los niños' })).not.toBeInTheDocument()
  })

  it('«Casos por desenlace» lista los desenlaces con sus casos y la advertencia de pocos casos', async () => {
    api('datos')
    montar('/analitica/poblacion?entrenamiento=7&desenlace=des_a')
    await userEvent.click(await screen.findByRole('tab', { name: 'Casos por desenlace' }))
    expect(await screen.findByText(/Cuántos casos hay para validar en cada desenlace/)).toBeInTheDocument()
    expect(screen.getAllByText('Desnutrición a 12 meses').length).toBeGreaterThan(1)   // el selector del contexto y la lista
    expect(screen.getByText('Crecimiento a 12 meses (En prueba)')).toBeInTheDocument()
  })

  it('«Reparto por categoría» y «Valores típicos» ponen la muestra frente a todos los niños', async () => {
    api('datos')
    montar('/analitica/poblacion?entrenamiento=7&desenlace=des_a')
    await userEvent.click(await screen.findByRole('tab', { name: 'Reparto por categoría' }))
    expect(await screen.findByRole('figure', { name: 'sexo: la muestra frente a todos los niños' })).toBeInTheDocument()
    expect(screen.queryByText('Mediana')).not.toBeInTheDocument()
    expect(screen.queryByText('La muestra en cifras')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Valores típicos' }))
    expect(await screen.findByText('Edad gestacional: muestra frente a todos')).toBeInTheDocument()
    expect(screen.getByText('Mediana')).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'sexo: la muestra frente a todos los niños' })).not.toBeInTheDocument()
  })

  it('«Datos faltantes» lista todos los datos sin esconder ninguno', async () => {
    api('datos')
    montar('/analitica/poblacion?entrenamiento=7&desenlace=des_a&ver=faltantes', <Ubicacion />)
    expect(await elegida()).toBe('Datos faltantes')
    const figura = await screen.findByRole('figure', { name: 'Porcentaje de niños sin cada dato' })
    expect(within(figura).getAllByRole('listitem')).toHaveLength(12)
    expect(screen.queryByRole('button', { name: /Ver los \d+ datos/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('ver=faltantes')
  })
})

describe('Equidad en pestañas', () => {
  it('abre en «Por grupo» con el bosque y la tabla de diferencias; el mapa va en «Por desenlace»', async () => {
    api('datos')
    montar('/analitica/equidad?entrenamiento=7&desenlace=des_a')
    expect(await nombres()).toEqual(['Por grupo', 'Por desenlace'])
    expect(await elegida()).toBe('Por grupo')
    expect(await screen.findByText('Diferencia por grupo')).toBeInTheDocument()
    expect(screen.getByText(/Equidad por grupo: sexo/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Qué tan bien ordena por grupo y desenlace' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Por desenlace' }))
    expect(await screen.findByRole('table', { name: 'Qué tan bien ordena por grupo y desenlace' })).toBeInTheDocument()
    expect(screen.queryByText('Diferencia por grupo')).not.toBeInTheDocument()
  })

  it('el «Subgrupo por» elegido vale para las dos pestañas', async () => {
    api('datos')
    montar('/analitica/equidad?entrenamiento=7&desenlace=des_a')
    await userEvent.click(await screen.findByRole('button', { name: 'Sede' }))
    expect(await screen.findByText(/Equidad por grupo: sede/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Por desenlace' }))
    expect(await screen.findByText(/Mapa de equidad: sede y desenlace/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sede', pressed: true })).toBeInTheDocument()
    expect(screen.getByText('Sede 1')).toBeInTheDocument()   // los grupos que son solo un número se nombran con su corte
  })

  it('la dirección elige la pestaña', async () => {
    api('datos')
    montar('/analitica/equidad?entrenamiento=7&desenlace=des_a&ver=desenlace')
    expect(await elegida()).toBe('Por desenlace')
    expect(await screen.findByRole('table', { name: 'Qué tan bien ordena por grupo y desenlace' })).toBeInTheDocument()
  })
})

describe('Estabilidad en pestañas', () => {
  it('el aviso de reentrenar queda sobre las pestañas; «Por trimestre» abre con las dos gráficas', async () => {
    api('datos')
    montar('/analitica/estabilidad?entrenamiento=7&desenlace=des_a')
    expect(await nombres()).toEqual(['Rendimiento por trimestre', 'Datos por trimestre', 'Cambios en la población evaluada'])
    expect(await elegida()).toBe('Rendimiento por trimestre')
    expect(await screen.findByText(/Reentrenar recomendado/)).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Qué tan bien ordena el modelo en cada trimestre' })).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Alertas por cada mil niños en cada trimestre' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Niños' })).not.toBeInTheDocument()
  })

  it('«Datos por trimestre» tiene la tabla de la gráfica y «Cambio de la población» el cuadro de cambios con su semáforo', async () => {
    api('datos')
    montar('/analitica/estabilidad?entrenamiento=7&desenlace=des_a')
    await userEvent.click(await screen.findByRole('tab', { name: 'Datos por trimestre' }))
    expect(await screen.findByRole('columnheader', { name: 'Casos' })).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(7)
    await userEvent.click(screen.getByRole('tab', { name: 'Cambios en la población evaluada' }))
    expect(await screen.findByText('Reentrenar: más de 0,25')).toBeInTheDocument()
    expect(screen.getByText('Estable: menos de 0,10')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '2020-T2' })).toBeInTheDocument()
  })

  it('la dirección elige la pestaña', async () => {
    api('datos')
    montar('/analitica/estabilidad?entrenamiento=7&desenlace=des_a&ver=poblacion')
    expect(await elegida()).toBe('Cambios en la población evaluada')
  })
})

describe('Trayectorias en pestañas', () => {
  it('los selectores quedan sobre las pestañas y «Trayectoria media» abre con la gráfica', async () => {
    api('datos')
    montar('/analitica/trayectorias?entrenamiento=7&desenlace=des_a')
    expect(await nombres()).toEqual(['Trayectoria media', 'Frente a la OMS', 'Niños individuales'])
    expect(await elegida()).toBe('Trayectoria media')
    expect(screen.getByLabelText('Medida de crecimiento')).toBeInTheDocument()
    expect(await screen.findByRole('figure', { name: /Puntaje z medio de cada grupo/ })).toBeInTheDocument()
    expect(screen.queryByText('Diferencia con la OMS (z)')).not.toBeInTheDocument()
  })

  it('«Frente a la OMS» trae la tabla y «Niños individuales» la lista con enlaces', async () => {
    api('datos')
    montar('/analitica/trayectorias?entrenamiento=7&desenlace=des_a')
    await userEvent.click(await screen.findByRole('tab', { name: 'Frente a la OMS' }))
    expect(await screen.findByText('Diferencia con la OMS (z)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Niños individuales' }))
    expect(await screen.findByRole('link', { name: 'N-001' })).toHaveAttribute('href', '/ninos/N-001')
  })

  it('sin niños individuales (perfil de consulta) no hay esa pestaña', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('visualizador') } }
      if (url.startsWith('/api/analitica/contexto')) return { cuerpo: contexto }
      if (url.startsWith('/api/analitica/7/trayectorias')) return { cuerpo: { ...trayectorias, individuales: undefined, individuales_visibles: false } }
      return undefined
    })
    montar('/analitica/trayectorias?entrenamiento=7&desenlace=des_a')
    expect(await nombres()).toEqual(['Trayectoria media', 'Frente a la OMS'])
  })

  it('la dirección elige la pestaña y cambiar un selector no la pierde', async () => {
    api('datos')
    montar('/analitica/trayectorias?entrenamiento=7&desenlace=des_a&ver=oms', <Ubicacion />)
    expect(await screen.findByText('Diferencia con la OMS (z)')).toBeInTheDocument()
    expect(await elegida()).toBe('Frente a la OMS')
    await userEvent.selectOptions(screen.getByLabelText('Tipo de edad en la gráfica'), 'cronologica')
    expect(await elegida()).toBe('Frente a la OMS')
  })
})

describe('Perfiles', () => {
  it('muestra los perfiles, el interruptor de tipo y la nota de confianza a la vez, sin pestañas', async () => {
    api('datos')
    montar('/analitica/perfiles?entrenamiento=7&desenlace=des_a')
    expect(await screen.findByText('Muy prematuro')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Por edad gestacional', pressed: true })).toBeInTheDocument()
    expect(screen.getByText(/Aún no hay perfiles reales aprobados por los expertos/)).toBeInTheDocument()
    expect(screen.queryByText('Niños mínimos para mostrar un perfil')).not.toBeInTheDocument()   // ya no hay mínimo de 5
  })
})

describe('Comparar entrenamientos en pestañas', () => {
  it('los selectores quedan sobre las pestañas y «Medidas» abre con A, B, la diferencia y su certeza', async () => {
    api('datos')
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    expect(await nombres()).toEqual(['Métricas de validación', 'Curva ROC', 'Niños y grupos'])
    expect(await elegida()).toBe('Métricas de validación')
    expect(screen.getByLabelText('Entrenamiento A (referencia)')).toBeInTheDocument()
    expect(await screen.findByText('Diferencia de B frente a A')).toBeInTheDocument()
    expect(screen.getByText('Diferencia clara *')).toBeInTheDocument()
    expect(screen.getByText(/A: 1\.500 niños, 90 casos/)).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: 'Casos detectados frente a falsas alertas en A y en B' })).not.toBeInTheDocument()
  })

  it('«Curva ROC» pone A y B en la misma gráfica; «Niños y grupos» trae el AUC por grupo y los niños de cada entrenamiento', async () => {
    api('datos')
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a')
    await userEvent.click(await screen.findByRole('tab', { name: 'Curva ROC' }))
    expect(await screen.findByRole('figure', { name: 'Casos detectados frente a falsas alertas en A y en B' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Niños y grupos' }))
    expect(await screen.findByText('sexo: femenino')).toBeInTheDocument()
    expect(screen.getByText('Niños evaluados')).toBeInTheDocument()
  })

  it('la dirección elige la pestaña y «Aprobar B» queda a la vista en cualquiera', async () => {
    api('admin')
    montar('/analitica/comparar?entrenamiento=7&desenlace=des_a&ver=roc')
    expect(await elegida()).toBe('Curva ROC')
    expect(await screen.findByRole('button', { name: /Aprobar y activar el modelo B/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('figure', { name: 'Casos detectados frente a falsas alertas en A y en B' })).toBeInTheDocument())
  })
})
