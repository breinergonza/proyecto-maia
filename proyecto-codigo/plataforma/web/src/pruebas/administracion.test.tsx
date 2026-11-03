import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Entrenamiento } from '../api/tipos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const comoAdmin = (url: string) => (url === '/api/auth/refrescar' ? { cuerpo: { acceso: 't', usuario: usuario('admin') } } : undefined)

const resumen = {
  entorno: 'local', solo_simulado: false, zona_horaria: 'America/Bogota', mlflow_url: 'http://localhost:5000',
  cifrado_disponible: true, conexion_guardada: true, clave_disponible: true, programaciones_activas: 0,
  hiperparametros_ajustados: false, paquete_activo: null, ultima_ejecucion: null,
}
const conexion = {
  host: 'db.entidad', puerto: 5432, base: 'postgres', usuario: 'lector', esquema: 'consumo', sslmode: 'require', timeout: 20,
  guardada: true, origen_clave: 'guardada', cifrado_disponible: true, actualizado_en: '2026-10-28T10:00:00Z',
}
const hiper = [{ modelo: 'clinico', actualizado_en: null, campos: [
  { nombre: 'rondas', etiqueta: 'Rondas de boosting (máximo)', tipo: 'int', minimo: 20, maximo: 5000, ayuda: 'Árboles.', defecto: 600, valor: null },
] }]

describe('administración de las ejecuciones', () => {
  it('el experto no ve Configuración, Programación ni Entrenamientos', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
    })
    montar('/admin/configuracion')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    for (const n of ['Configuración', 'Programación', 'Entrenamientos']) expect(screen.queryAllByRole('link', { name: n })).toHaveLength(0)
  })

  it('configuración: la clave guardada no se muestra y solo se envía si se escribe', async () => {
    const llamadas = simularApi((url) => comoAdmin(url) ?? (
      url === '/api/administracion/resumen' ? { cuerpo: resumen }
        : url === '/api/administracion/conexion' ? { cuerpo: conexion }
          : url === '/api/administracion/hiperparametros' ? { cuerpo: hiper }
            : url === '/api/administracion/conexion/probar'
              ? { cuerpo: { ok: true, mensaje: 'Conexión de solo lectura correcta.', version_servidor: '16.4', esquema: 'consumo', tablas: ['a', 'b'] } }
              : undefined))
    montar('/admin/configuracion')
    expect(await screen.findByText('2. Conexión a la base de la entidad')).toBeInTheDocument()
    const clave = await screen.findByLabelText('Clave')
    expect(clave).toHaveValue('')
    await waitFor(() => expect(screen.getByLabelText('Servidor')).toHaveValue('db.entidad'))
    await userEvent.click(screen.getByRole('button', { name: 'Probar conexión' }))
    expect(await screen.findByText(/2 tablas en consumo/)).toBeInTheDocument()
    const form = screen.getByLabelText('Servidor').closest('form')!
    await userEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/administracion/conexion' && l.init?.method === 'PUT')).toBe(true))
    const put = llamadas.find((l) => l.url === '/api/administracion/conexion' && l.init?.method === 'PUT')!
    expect(JSON.parse(String(put.init!.body))).toMatchObject({ host: 'db.entidad', clave: null, borrar_clave: false })
    // el valor del núcleo se ve como sugerencia, no como ajuste
    expect(screen.getByLabelText('Rondas de boosting (máximo)')).toHaveAttribute('placeholder', '600')
  })

  it('programación: muestra cómo se lee el horario y crea la programación', async () => {
    const llamadas = simularApi((url, init) => comoAdmin(url) ?? (
      url === '/api/administracion/programaciones' && init?.method === 'GET' ? { cuerpo: [] }
        : url === '/api/administracion/programaciones' ? { estado: 201, cuerpo: { id: 1 } }
          : url === '/api/administracion/ejecuciones' ? { cuerpo: [] }
            : url.startsWith('/api/administracion/calendario')
              ? { cuerpo: { cron: '0 2 1 1,7 *', zona: 'America/Bogota', descripcion: 'El día 1 de enero y julio, a las 02:00', proximas: ['2027-01-01T07:00:00Z'] } }
              : undefined))
    montar('/admin/programacion')
    expect(await screen.findByText('El día 1 de enero y julio, a las 02:00')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Nacidos desde (año)'), '2015')
    await userEvent.click(screen.getByRole('button', { name: 'Crear programación' }))
    await waitFor(() => expect(llamadas.some((l) => l.init?.method === 'POST' && l.url === '/api/administracion/programaciones')).toBe(true))
    const post = llamadas.find((l) => l.init?.method === 'POST' && l.url === '/api/administracion/programaciones')!
    expect(JSON.parse(String(post.init!.body))).toMatchObject({ fuente: 'kmc', cron: '0 2 1 1,7 *', solo_si_nuevo: true, parametros: { anio_desde: 2015 } })
  })

  it('configuración: la meta de falsas alertas se lee en su unidad y avisa si se aleja 10 veces del núcleo', async () => {
    const anomalias = [{ modelo: 'anomalias', actualizado_en: '2026-10-28T22:13:42Z', campos: [
      { nombre: 'alpha', etiqueta: 'Meta de falsas alertas por dato (capa 2)', tipo: 'float', minimo: 0.0005, maximo: 0.05,
        ayuda: 'Fracción de los datos sanos que la capa 2 puede marcar.', escala: 'por_mil', defecto: 0.05, valor: 0.005 },
      { nombre: 'rondas', etiqueta: 'Rondas de boosting (máximo)', tipo: 'int', minimo: 20, maximo: 5000, ayuda: 'Árboles.', defecto: 300, valor: 300 },
    ] }]
    const llamadas = simularApi((url) => comoAdmin(url) ?? (
      url === '/api/administracion/resumen' ? { cuerpo: resumen }
        : url === '/api/administracion/conexion' ? { cuerpo: conexion }
          : url.startsWith('/api/administracion/hiperparametros') ? { cuerpo: anomalias }
            : undefined))
    const confirmar = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmar)
    montar('/admin/configuracion')
    const alpha = await screen.findByLabelText('Meta de falsas alertas por dato (capa 2)')
    expect(screen.getByText(/0,005 = 5 por cada 1\.000 datos/)).toBeInTheDocument()
    expect(screen.getByText(/10 veces menos que el valor del núcleo \(0,05\)/)).toBeInTheDocument()
    expect(screen.getByText(/De 0,0005 a 0,05 · núcleo: 0,05/)).toBeInTheDocument()
    expect(screen.getByText('1 ajustado(s)')).toBeInTheDocument()        // 300 rondas es el valor del núcleo
    expect(screen.queryByText(/p\. m\.\./)).not.toBeInTheDocument()
    await userEvent.clear(alpha)
    await userEvent.type(alpha, '0.05')
    expect(screen.getByText(/0,05 = 50 por cada 1\.000 datos/)).toBeInTheDocument()
    expect(screen.queryByText(/veces (más|menos) que el valor del núcleo/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver a los del núcleo' }))
    expect(confirmar).toHaveBeenCalled()
    expect(llamadas.some((l) => l.init?.method === 'PUT')).toBe(false)     // no confirmó: no guarda
  })

  it('usuarios: cambiar el perfil pide confirmación antes de guardar', async () => {
    const otra = { ...usuario('experto'), id: '00000000-0000-0000-0000-000000000002', nombre: 'Ana Pérez', ultimo_ingreso: null }
    const llamadas = simularApi((url, init) => comoAdmin(url) ?? (
      url === '/api/usuarios' ? { cuerpo: [{ ...usuario('admin'), ultimo_ingreso: null }, otra] }
        : url === `/api/usuarios/${otra.id}` && init?.method === 'PATCH' ? { cuerpo: { ...otra, rol: 'visualizador' } }
          : undefined))
    const confirmar = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmar)
    montar('/admin/usuarios')
    const perfil = await screen.findByLabelText('Perfil de Ana Pérez')
    await userEvent.selectOptions(perfil, 'Consulta')
    expect(confirmar).toHaveBeenCalledWith('¿Cambiar el perfil de Ana Pérez de Experto clínico a Consulta?')
    expect(llamadas.some((l) => l.init?.method === 'PATCH')).toBe(false)
    expect(perfil).toHaveValue('experto')
    confirmar.mockReturnValue(true)
    await userEvent.selectOptions(perfil, 'Consulta')
    await waitFor(() => expect(llamadas.some((l) => l.init?.method === 'PATCH')).toBe(true))
  })

  it('programación: cada ejecución dice su tipo, también los entrenamientos', async () => {
    simularApi((url) => comoAdmin(url) ?? (
      url === '/api/administracion/programaciones' ? { cuerpo: [] }
        : url === '/api/administracion/ejecuciones'
          ? { cuerpo: [{ id: 5, tipo: 'entrenamiento', origen: 'manual', fuente: 'kmc', estado: 'ok', creada_en: '2026-10-30T13:35:00Z',
            parametros: {}, resultado: { paso: 'entrenado' }, mensaje: 'Entrenado.' }] }
          : url.startsWith('/api/administracion/calendario')
            ? { cuerpo: { cron: '0 2 1 1,7 *', zona: 'America/Bogota', descripcion: 'x', proximas: [] } }
            : undefined))
    montar('/admin/programacion')
    expect(await screen.findByText('Entrenamiento · Base de la Fundación')).toBeInTheDocument()
  })

  it('corridas: la hecha con datos nuevos no se llama «Semestral (equipo local)» y el encabezado lleva a Programación', async () => {
    simularApi((url) => comoAdmin(url) ?? (
      url === '/api/corridas' ? { cuerpo: [{ id: 2, tipo: 'completa', estado: 'ok', silencio: false, corte_id: 1, fuente: 'kmc',
        fecha_corte: '2026-07-24', modelo_version: 'abc', iniciada_en: '2026-10-30T23:36:00Z', terminada_en: null,
        sujetos: 10, alertas_datos: 3, riesgos: 5, paso: null, mensaje: null }] }
        : undefined))
    montar('/admin/corridas')
    expect(await screen.findByText('Extracción y cálculo')).toBeInTheDocument()
    expect(screen.queryByText(/equipo local/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Programación' })).toHaveAttribute('href', '/admin/programacion')
  })

  it('entrenamientos: hiperparámetros, métricas, comparación y aprobación', async () => {
    const run = (id: string, version: string, rondas: string, auc: number, alias: string[]): Entrenamiento => ({
      run_id: id, experimento_id: '2', tipo: 'clinico', nombre: id, estado: 'FINISHED', inicio: '2026-10-01T10:00:00Z',
      fuente: 'kmc', corte: '2026-06-30', hiperparametros: { rondas, tasa: '0.05', hojas: '31', min_hoja: '50' }, extraccion: {},
      metricas: { auc__muerte: auc }, etiquetas: { hiperparametros: rondas === '600' ? 'nucleo' : '{"rondas": 800}' },
      modelo: { registro: 'maia-clinico', version, alias }, enlace: null,
    })
    const anom: Entrenamiento = { ...run('a1', '2', '300', 0.5, ['candidato']), tipo: 'anomalias', metricas: { falsas_por_1000__cualquiera: 4.2 } }
    const llamadas = simularApi((url) => comoAdmin(url) ?? (
      url.startsWith('/api/entrenamientos?')
        ? { cuerpo: { mlflow_url: null, anomalias: [anom], clinico: [run('c2', '5', '800', 0.83, ['candidato']), run('c1', '4', '600', 0.8, ['produccion'])] } }
        : url === '/api/entrenamientos/aprobar' ? { estado: 202, cuerpo: { id: 9 } }
          : undefined))
    vi.stubGlobal('confirm', () => true)
    montar('/admin/entrenamientos')
    const clinico = (await screen.findByText('Alertas clínicas')).closest('section')!
    expect(within(clinico).getByText('produccion')).toBeInTheDocument()
    expect(within(clinico).getByText('ajustado')).toBeInTheDocument()
    expect(within(clinico).getByText('0,83')).toBeInTheDocument()
    expect(within(clinico).getAllByText('0,05').length).toBeGreaterThan(0)    // la tasa con coma, como el resto
    expect(within(clinico).queryByText('0.05')).not.toBeInTheDocument()
    await userEvent.click(within(clinico).getByLabelText('Comparar c2'))
    await userEvent.click(within(clinico).getByLabelText('Comparar c1'))
    expect(await within(clinico).findByText('Comparación de 2 entrenamientos')).toBeInTheDocument()
    expect(within(clinico).getByText('auc__muerte')).toBeInTheDocument()
    await userEvent.click(within(clinico).getByLabelText('Aprobar v5'))
    await userEvent.click(screen.getByLabelText('Aprobar v2'))
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar y activar' }))
    expect(await screen.findByText(/Aprobación en cola \(ejecución n\.º 9\)/)).toBeInTheDocument()
    const post = llamadas.find((l) => l.url === '/api/entrenamientos/aprobar')!
    expect(JSON.parse(String(post.init!.body))).toEqual({ fuente: 'kmc', anomalias: '2', clinico: '5' })
  })

  it('entrenar ahora: envía los hiperparámetros del formulario y muestra que se está entrenando y que terminó', async () => {
    let estado: 'nada' | 'en_curso' | 'ok' = 'nada'
    const ejec = () => ({
      id: 7, tipo: 'entrenamiento', origen: 'manual', fuente: 'kmc', creada_en: '2026-10-28T15:00:00Z',
      parametros: { modelos: ['clinico'], extraer: true },
      ...(estado === 'en_curso'
        ? { estado: 'en_curso', resultado: { paso: 'entrenando_clinico', hechos: ['extrayendo'] } }
        : { estado: 'ok', mensaje: 'Entrenado (clinico v12); quedó como candidato en MLflow.', resultado: { paso: 'entrenado', hechos: ['extrayendo', 'entrenando_clinico'], modelos: { clinico: { version: '12' } } } }),
    })
    const llamadas = simularApi((url) => comoAdmin(url) ?? (
      url.startsWith('/api/entrenamientos/ejecuciones') ? { cuerpo: estado === 'nada' ? [] : [ejec()] }
        : url === '/api/entrenamientos/entrenar' ? (estado = 'en_curso', { estado: 202, cuerpo: ejec() })
          : url === '/api/administracion/hiperparametros' ? { cuerpo: hiper }
            : url.startsWith('/api/entrenamientos?') ? { cuerpo: { mlflow_url: null, anomalias: [], clinico: [] } }
              : undefined))
    montar('/admin/entrenamientos')
    const rondas = await screen.findByLabelText('Rondas de boosting (máximo)')
    expect(rondas).toHaveValue(600)                       // parte del valor del núcleo
    await userEvent.click(screen.getByLabelText('Anomalías (revisión de datos)'))
    await userEvent.clear(rondas)
    await userEvent.type(rondas, '800')
    await userEvent.click(screen.getByRole('button', { name: 'Entrenar ahora' }))
    expect(await screen.findByText('Entrenando el modelo…')).toBeInTheDocument()
    expect(screen.getByText('Entrenando alertas clínicas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hay un entrenamiento en curso' })).toBeDisabled()
    expect((await screen.findAllByText('Entrenando…')).length).toBeGreaterThan(0)   // aviso en el menú
    const post = llamadas.find((l) => l.url === '/api/entrenamientos/entrenar')!
    expect(JSON.parse(String(post.init!.body))).toEqual({
      fuente: 'kmc', modelos: ['clinico'], extraer: true, guardar: false, hiperparametros: { clinico: { rondas: 800 } } })
    estado = 'ok'
    expect(await screen.findByText('Modelo entrenado', {}, { timeout: 6000 })).toBeInTheDocument()
    expect(screen.getByText(/Alertas clínicas v12 \(candidato\)/)).toBeInTheDocument()
  }, 10000)
})
