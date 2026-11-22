// Las páginas de administración y los catálogos caben en una pantalla de escritorio: lo que no cabe se reparte en
// pestañas (con la pestaña en la dirección) y los formularios conservan lo escrito al cambiar de pestaña.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Entrenamiento } from '../api/tipos'
import type { VersionDiccionario, VistaDiccionario } from '../api/tipos-diccionario'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const como = (rol: 'admin' | 'datos') => (url: string) =>
  url === '/api/auth/refrescar' ? { cuerpo: { acceso: 't', usuario: usuario(rol) } } : undefined

const nombresDePestanas = (lista?: string) =>
  within(lista ? screen.getByRole('tablist', { name: lista }) : document.body).getAllByRole('tab').map((t) => t.textContent?.replace(/\s+/g, ' ').trim())
const seleccionada = () => screen.getByRole('tab', { selected: true })
/** Sin hojas de estilo, «oculto» es la clase `hidden` del panel (o de un ascendiente): en pantalla se ve un solo panel. */
const visible = (el: HTMLElement) => el.closest('.hidden') === null

// ---------------------------------------------------------------------------------------------------- Configuración
const resumen = {
  entorno: 'local', solo_simulado: false, zona_horaria: 'America/Bogota', mlflow_url: null,
  cifrado_disponible: true, conexion_guardada: false, clave_disponible: false, programaciones_activas: 0,
  hiperparametros_ajustados: false, paquete_activo: null, ultima_ejecucion: null,
}
const conexion = {
  host: 'db.entidad', puerto: 5432, base: 'postgres', usuario: 'lector', esquema: 'consumo', sslmode: 'require', timeout: 20,
  guardada: false, origen_clave: 'ninguna', cifrado_disponible: true, actualizado_en: null,
}
const campo = (nombre: string, etiqueta: string) => ({ nombre, etiqueta, tipo: 'int', minimo: 1, maximo: 9000, ayuda: 'Ayuda.', defecto: 300, valor: null })
const hiper = [
  { modelo: 'anomalias', actualizado_en: null, campos: [campo('rondas', 'Rondas de boosting (máximo)')] },
  { modelo: 'clinico', actualizado_en: null, campos: [campo('hojas', 'Hojas por árbol')] },
]

describe('Configuración en pestañas', () => {
  const api = () => simularApi((url) => como('admin')(url) ?? (
    url === '/api/administracion/resumen' ? { cuerpo: resumen }
      : url === '/api/administracion/conexion' ? { cuerpo: conexion }
        : url === '/api/administracion/hiperparametros' ? { cuerpo: hiper } : undefined))

  it('reparte el estado, la conexión y los hiperparámetros de cada modelo; abre en el estado', async () => {
    api()
    montar('/admin/configuracion')
    expect(visible(await screen.findByText('2. Conexión a la base de la entidad'))).toBe(true)
    expect(nombresDePestanas()).toEqual(['Estado del sistema', 'Base de datos', 'Parámetros de entrenamiento para detectar mediciones atípicas', 'Parámetros de entrenamiento para estimar riesgo clínico'])
    expect(seleccionada()).toHaveTextContent('Estado del sistema')
    expect(visible(screen.getByLabelText('Servidor'))).toBe(false)
    expect(visible(screen.getByLabelText('Rondas de boosting (máximo)'))).toBe(false)
  })

  it('lo escrito en un formulario sigue ahí al cambiar de pestaña', async () => {
    api()
    montar('/admin/configuracion')
    await userEvent.click(await screen.findByRole('tab', { name: 'Base de datos' }))
    const servidor = screen.getByLabelText('Servidor')
    await waitFor(() => expect(servidor).toHaveValue('db.entidad'))
    await userEvent.clear(servidor)
    await userEvent.type(servidor, 'otro.host')
    await userEvent.click(screen.getByRole('tab', { name: 'Parámetros de entrenamiento para estimar riesgo clínico' }))
    expect(visible(screen.getByLabelText('Hojas por árbol'))).toBe(true)
    expect(visible(screen.getByLabelText('Servidor'))).toBe(false)
    await userEvent.click(screen.getByRole('tab', { name: 'Base de datos' }))
    expect(screen.getByLabelText('Servidor')).toHaveValue('otro.host')
  })

  it('la pestaña va en la dirección', async () => {
    api()
    montar('/admin/configuracion?ver=anomalias')
    expect(await screen.findByRole('tab', { name: 'Parámetros de entrenamiento para detectar mediciones atípicas' })).toHaveAttribute('aria-selected', 'true')
    expect(visible(await screen.findByLabelText('Rondas de boosting (máximo)'))).toBe(true)
    expect(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Guardar' })).toBeInTheDocument()   // solo el panel elegido lleva el rol
  })
})

// ---------------------------------------------------------------------------------------------------- Programación
const horario = {
  id: 3, nombre: 'Corrida semestral', fuente: 'kmc', cron: '0 2 1 1,7 *', zona: 'America/Bogota', activo: true, silencio: false,
  solo_si_nuevo: true, parametros: {}, descripcion: 'El día 1 de enero y julio, a las 02:00', proxima: '2027-01-01T07:00:00Z', ultima: null,
}
const ejecucion = {
  id: 5, tipo: 'entrenamiento', origen: 'manual', fuente: 'kmc', estado: 'ok', creada_en: '2026-10-30T13:35:00Z',
  parametros: {}, resultado: { paso: 'entrenado' }, mensaje: 'Entrenado.',
}

describe('Programación en pestañas', () => {
  const api = () => simularApi((url) => como('admin')(url) ?? (
    url === '/api/administracion/programaciones' ? { cuerpo: [horario] }
      : url === '/api/administracion/ejecuciones' ? { cuerpo: [ejecucion] }
        : url.startsWith('/api/administracion/calendario')
          ? { cuerpo: { cron: horario.cron, zona: 'America/Bogota', descripcion: 'El día 1 de enero y julio, a las 02:00', proximas: [] } }
          : undefined))

  it('abre en los horarios y las ejecuciones; el formulario está en su pestaña', async () => {
    api()
    montar('/admin/programacion')
    expect(visible(await screen.findByText('Corrida semestral'))).toBe(true)
    expect(nombresDePestanas()).toEqual(['Horarios y ejecuciones', 'Crear programación'])
    expect(visible(screen.getByRole('heading', { name: 'Historial de ejecuciones automáticas' }))).toBe(true)
    expect(visible(screen.getByText('Entrenamiento · Base de la Fundación'))).toBe(true)
    expect(visible(screen.getByLabelText('Nombre'))).toBe(false)
  })

  it('«Editar» lleva al formulario con el horario; cancelar vuelve a la lista', async () => {
    api()
    montar('/admin/programacion')
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    expect(seleccionada()).toHaveTextContent('Editar programación')
    expect(screen.getByLabelText('Nombre')).toHaveValue('Corrida semestral')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(seleccionada()).toHaveTextContent('Horarios y ejecuciones')
    expect(visible(screen.getByText('Corrida semestral'))).toBe(true)
  })

  it('la pestaña va en la dirección y lo escrito sobrevive al cambiar de pestaña', async () => {
    api()
    montar('/admin/programacion?ver=programar')
    const nombre = await screen.findByLabelText('Nombre')
    expect(visible(nombre)).toBe(true)
    await userEvent.clear(nombre)
    await userEvent.type(nombre, 'Mensual')
    await userEvent.click(screen.getByRole('tab', { name: 'Horarios y ejecuciones' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Crear programación' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Mensual')
  })
})

// -------------------------------------------------------------------------------------------------- Entrenamientos
const corrida = (id: string, version: string, auc: number, alias: string[]): Entrenamiento => ({
  run_id: id, experimento_id: '2', tipo: 'clinico', nombre: id, estado: 'FINISHED', inicio: '2026-10-01T10:00:00Z',
  fuente: 'kmc', corte: '2026-06-30', hiperparametros: { rondas: '600', tasa: '0.05', hojas: '31', min_hoja: '50' }, extraccion: {},
  metricas: { auc__muerte: auc }, etiquetas: { hiperparametros: 'nucleo' }, modelo: { registro: 'maia-clinico', version, alias }, enlace: null,
})
const anomalia: Entrenamiento = { ...corrida('a1', '2', 0.5, ['candidato']), tipo: 'anomalias', metricas: { falsas_por_1000__cualquiera: 4.2 } }

describe('Entrenamientos en pestañas', () => {
  const api = () => simularApi((url) => como('admin')(url) ?? (
    url.startsWith('/api/entrenamientos?') ? { cuerpo: { mlflow_url: null, anomalias: [anomalia], clinico: [corrida('c2', '5', 0.83, ['candidato'])] } }
      : url.startsWith('/api/entrenamientos/ejecuciones') ? { cuerpo: [] }
        : url === '/api/administracion/hiperparametros' ? { cuerpo: hiper } : undefined))

  it('abre en las versiones de las alertas clínicas; las anomalías y entrenar ahora tienen su pestaña', async () => {
    api()
    montar('/admin/entrenamientos')
    expect(visible(await screen.findByLabelText('Comparar c2'))).toBe(true)
    expect(nombresDePestanas('Qué ver')).toEqual(['Modelos de riesgo clínico', 'Modelos de calidad de datos', 'Entrenar ahora'])
    expect(visible(screen.getByLabelText('Comparar a1'))).toBe(false)
    expect(visible(screen.getByRole('button', { name: 'Entrenar ahora' }))).toBe(false)
  })

  it('la aprobación abarca las dos tablas: el resumen y el botón se ven en las dos y recuerdan lo elegido', async () => {
    api()
    montar('/admin/entrenamientos')
    await userEvent.click(await screen.findByLabelText('Aprobar v5'))
    const resumenAprobar = () => screen.getByRole('heading', { name: 'Aprobar para usar en la solución' }).closest('section')!
    expect(visible(resumenAprobar())).toBe(true)
    expect(visible(within(resumenAprobar()).getByText('v5'))).toBe(true)
    const pestanas = within(screen.getByRole('tablist', { name: 'Qué ver' }))
    await userEvent.click(pestanas.getByRole('tab', { name: 'Modelos de calidad de datos' }))
    expect(visible(resumenAprobar())).toBe(true)
    expect(visible(within(resumenAprobar()).getByText('v5'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Aprobar y poner el modelo en uso' })).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Aprobar v2'))
    expect(screen.getByRole('button', { name: 'Aprobar y poner el modelo en uso' })).toBeEnabled()
    await userEvent.click(pestanas.getByRole('tab', { name: 'Entrenar ahora' }))
    expect(screen.queryByRole('heading', { name: 'Aprobar para usar en la solución' })).not.toBeInTheDocument()
  })

  it('la pestaña va en la dirección y el selector de datos acompaña a todas', async () => {
    api()
    montar('/admin/entrenamientos?ver=entrenar')
    expect(visible(await screen.findByRole('button', { name: 'Entrenar ahora' }))).toBe(true)
    expect(visible(screen.getByLabelText('Datos'))).toBe(true)
    expect(visible(await screen.findByLabelText('Hojas por árbol'))).toBe(true)
    // un modelo por pestaña: el otro no se ve hasta elegirlo, y lo escrito se conserva
    await userEvent.type(screen.getByLabelText('Hojas por árbol'), '5')
    await userEvent.click(within(screen.getByRole('tablist', { name: 'Hiperparámetros por modelo' })).getByRole('tab', { name: 'Anomalías (revisión de datos)' }))
    expect(await screen.findByLabelText('Rondas de boosting (máximo)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Hojas por árbol')).not.toBeInTheDocument()
  })
})

// ------------------------------------------------------------------------------------------------------ Mis modelos
const cola = {
  items: [{ id: 2, estado: 'pendiente', posicion: 1, estimado_min: 12, propietario: 'Persona experto', visibilidad: 'personal', nombre: 'Mi prueba',
    muestra_id: null, creada_en: null, propia: true, cancelable: true }],
  limites: { sin_limite: false, cola_max: 2, cola_usada: 1, modelos_max: 3, modelos_usados: 1 }, promedio_min: 12,
}
const banco = [{
  id: 9, propietario: 'Ana', visibilidad: 'personal', nombre: 'Modelo de Ana', descripcion: null, fuente: 'simulado', modelos: ['clinico'],
  muestra_id: null, muestra: null, corte: '2026-01-01', corte_anterior: false, auc: 0.81, terminada: null, propia: false, descartado: false,
}]

describe('Mis modelos en pestañas', () => {
  const api = (rol: 'admin' | 'datos') => simularApi((url) => como(rol)(url) ?? (
    url === '/api/entrenamientos/cola' ? { cuerpo: cola }
      : url === '/api/entrenamientos/banco' ? { cuerpo: banco }
        : url === '/api/entrenamientos/cuotas' ? { cuerpo: { cola_max: 2, modelos_max: 3, dias_sin_uso: 90, dias_aviso: 14 } }
          : url === '/api/muestras' ? { cuerpo: [] }
            : url === '/api/exploracion/facetas' ? { cuerpo: { n: 900, minimo: 20, n_base: 1000, facetas: {} } }
              : url === '/api/muestras/contar' ? { cuerpo: { n: 150, n_base: 1000, minimo: 20, suficiente: true, huella: 'h' } } : undefined))

  it('el experto en datos abre en entrenar (límites, formulario y cola), con el banco y los límites de uso en sus pestañas', async () => {
    api('datos')
    montar('/mis-modelos')
    expect(visible(await screen.findByText('Mi prueba'))).toBe(true)
    expect(nombresDePestanas()).toEqual(['Nuevo entrenamiento', 'Modelos propios', 'Límites de uso'])   // los fija (D77)
    expect(visible(screen.getByText(/1 de 2/))).toBe(true)
    expect(visible(screen.getByRole('button', { name: 'Entrenar modelo nuevo' }))).toBe(true)
    expect(visible(screen.getByText('Modelo de Ana'))).toBe(false)
  })

  it('el banco va en la dirección y trae sus filtros', async () => {
    api('datos')
    montar('/mis-modelos?ver=banco')
    expect(visible(await screen.findByText('Modelo de Ana'))).toBe(true)
    expect(seleccionada()).toHaveTextContent('Modelos propios')
    expect(visible(screen.getByLabelText('Mostrar'))).toBe(true)
    expect(visible(screen.getByLabelText('Nombre'))).toBe(false)
  })

  it('el administrador ve además la pestaña de límites', async () => {
    api('admin')
    montar('/mis-modelos')
    await userEvent.click(await screen.findByRole('tab', { name: 'Límites de uso' }))
    expect(visible(await screen.findByRole('button', { name: 'Guardar límites' }))).toBe(true)
    expect(visible(screen.getByRole('button', { name: 'Entrenar modelo nuevo' }))).toBe(false)
  })

  it('armar una muestra reemplaza el formulario y cerrar lo devuelve con lo escrito', async () => {
    api('datos')
    montar('/mis-modelos')
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Prueba A')
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar niños para el entrenamiento' }))
    expect(visible(await screen.findByLabelText('Título de la muestra'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Entrenar modelo nuevo' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Prueba A')
  })
})

// ------------------------------------------------------------------------------------------------------- Diccionario
const version = (v: number, estado: VersionDiccionario['estado']): VersionDiccionario => ({
  id: v * 10, version: v, estado, origen: 'subido', nota: null, sha256: 'x', tamano: 50_000, creado_por: null, creado_en: '2026-10-30T10:00:00Z',
})
const col = (clave: string, titulo: string, extra = {}) => ({
  clave, titulo, explica: `Ayuda de ${titulo}.`, opciones: [], lista: null, largo: false, tipo: 'texto' as const, obligatoria: false, ...extra,
})
const vigente = version(2, 'vigente')
const vista: VistaDiccionario = {
  version: vigente,
  hojas: [
    { nombre: 'Variables', describe: 'Una fila por variable de la base', clave: 'variable', agregar: false,
      columnas: [col('variable', 'Variable', { obligatoria: true }), col('estado', 'Estado')],
      filas: [['var_simulada_a', 'Variables pendientes de clasificar'], ['var_simulada_b', 'Lista']] },
    { nombre: 'Visitas', describe: 'Las visitas del seguimiento', clave: 'etapa', agregar: true,
      columnas: [col('etapa', 'Visita', { obligatoria: true }), col('nombre', 'Nombre')], filas: [['3 m EC', '3 meses']] },
  ],
}
const porClasificar = {
  vigente, total: 1, borrador: null,
  variables: [{ variable: 'var_simulada_a', etiqueta: 'Variable simulada A', estado: 'Variables pendientes de clasificar', tema: null, etapa: '3 m EC', visita: '3 meses', nota: null }],
}

describe('Diccionario en pestañas', () => {
  const api = () => simularApi((url) => como('datos')(url) ?? (
    url === '/api/diccionario/por-clasificar' ? { cuerpo: porClasificar }
      : url === '/api/diccionario/versiones' ? { cuerpo: [vigente, version(1, 'archivado')] }
        : url === '/api/diccionario/versiones/20/vista' ? { cuerpo: vista } : undefined))

  it('abre en el editor, con las hojas como pestañas y su número de filas', async () => {
    api()
    montar('/diccionario')
    const hojas = await screen.findByRole('tablist', { name: 'Hojas del diccionario' })
    expect(within(hojas).getAllByRole('tab').map((t) => t.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Variables 2', 'Visitas 1'])
    expect(visible(await screen.findByRole('button', { name: 'Editar var_simulada_a' }))).toBe(true)
    const secciones = screen.getByRole('tablist', { name: 'Secciones del diccionario' })
    expect(within(secciones).getAllByRole('tab').map((t) => t.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['Editar definiciones', 'Variables pendientes de clasificar 1', 'Importar diccionario y ver versiones'])
    expect(visible(screen.getByText('Variable simulada A'))).toBe(false)   // las variables por clasificar están en su pestaña
  })

  it('la hoja y la sección van en la dirección', async () => {
    api()
    montar('/diccionario?hoja=Visitas')
    expect(await screen.findByRole('tab', { name: /Visitas/ })).toHaveAttribute('aria-selected', 'true')
    expect(visible(screen.getByRole('button', { name: 'Editar 3 m EC' }))).toBe(true)
    expect(visible(screen.getByRole('button', { name: 'Agregar fila' }))).toBe(true)
  })

  it('las variables por clasificar y las versiones tienen su pestaña; «Completar» vuelve al editor', async () => {
    api()
    montar('/diccionario?ver=clasificar')
    expect(visible(await screen.findByText('Variable simulada A'))).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Completar var_simulada_a' }))
    expect(visible(await screen.findByRole('dialog', { name: /var_simulada_a/ }))).toBe(true)
    expect(screen.getByRole('tab', { name: 'Editar definiciones' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('tab', { name: 'Importar diccionario y ver versiones' }))
    expect(visible(screen.getByRole('button', { name: 'Ver la versión 1' }))).toBe(true)
    expect(visible(screen.getByLabelText('Archivo de Excel (.xlsx)'))).toBe(true)
  })
})
