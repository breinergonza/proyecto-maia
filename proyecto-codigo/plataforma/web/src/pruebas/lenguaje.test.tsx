// Las pantallas del equipo clínico hablan como el equipo clínico: el glosario (lib/lenguaje) y una guardia que falla si
// en el texto visible de esas pantallas vuelve a aparecer un término técnico. El término técnico puede seguir en title.
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { alerta, ayudaMinimo, cuantosMenos, familia, frenteOms, motivo, motivosRiesgo, nivelAlto, nivelCorto, nombreFamilia, peso } from '../lib/lenguaje'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const PROHIBIDO = /posici[oó]n|percentil|puntaje z|\bcorte\b|\bcorrida\b|capa \d|[−-]2 DE|\bAUC\b/i

describe('glosario clínico', () => {
  it('dice la posición como comparación con los demás niños', () => {
    expect(cuantosMenos(87)).toBe(8)
    expect(nivelCorto(87)).toBe('Más que 8 de 10')
    expect(nivelCorto(91)).toBe('Alto')
    expect(nivelCorto(97)).toBe('Muy alto')
    expect(nivelAlto(50)).toBeNull()
    expect(nivelAlto(90)).toBe('Riesgo alto')
  })

  it('dice el mínimo de las notificaciones como la parte de niños con más riesgo', () => {
    expect(ayudaMinimo(95)).toBe('Con 95 se avisa del 5 % de niños con más riesgo.')
    expect(ayudaMinimo(90)).toBe('Con 90 se avisa del 10 % de niños con más riesgo.')
    expect(ayudaMinimo(0)).toBe('Con 0 se avisa de todos los niños.')
  })

  it('dice el puntaje z, las capas y los motivos del motor en palabras clínicas', () => {
    expect(frenteOms(-2.4)).toBe('Bajo para la edad')
    expect(frenteOms(0.3)).toBe('En el rango esperado')
    expect(frenteOms(2.5)).toBe('Alto para la edad')
    expect(alerta('2')).toBe('No cuadra con el resto de sus datos')
    expect(motivo('valor atípico; fuera de la ventana de la etapa'))
      .toBe('Valor muy distinto al de los demás niños; la fecha no corresponde a esta visita')
    expect(motivo('algo que el glosario no conoce')).toBe('Algo que el glosario no conoce')
  })

  it('dice lo que más pesó en un riesgo sin códigos internos', () => {
    expect(peso('Días en UCI (dias_uci) = 20')).toBe('Días en UCI: 20')
    expect(peso('Perímetro cefálico a 40 sem (pc_40) = 35,4')).toBe('Perímetro cefálico a 40 sem: 35,4')
    expect(peso('quiebre_cambio_de_sistema_2022 = 1')).toBe('Nació después del cambio de sistema 2022')
    expect(peso('quiebre_cambio_de_sistema_2022 = 0')).toBe('Nació antes del cambio de sistema 2022')
    expect(peso('z_peso_40_sem = -2,4')).toBe('Peso para la edad a 40 sem: bajo para la edad')
    expect(peso('Sexo = Femenino')).toBe('Sexo: Femenino')
  })

  it('separa lo que sube el riesgo de los datos que faltan', () => {
    expect(motivosRiesgo(['Días en UCI (dias_uci) = 20', 'Talla a 40 sem (talla_40) = sin dato', 'z_peso_3m = sin dato',
      'Vacunas (vac) = No hay dato'])).toEqual({
      suben: ['Días en UCI: 20'],
      faltan: ['Talla a 40 sem', 'Peso para la edad a 3m', 'Vacunas'],
    })
  })

  it('agrupa los desenlaces que son el mismo evento visto desde distintas visitas', () => {
    expect(familia('readm_40s')).toBe('readm')
    expect(familia('no_vuelve_12m')).toBe('no_vuelve')
    expect(familia('oxigeno_ambulatorio_6m')).toBe('oxigeno_ambulatorio')
    expect(familia('talla_baja_12m_desde_40')).toBe('talla_baja_12m')
    expect(nombreFamilia(['readmisión antes de las 40 semanas', 'readmisión entre los 3 y los 6 meses'])).toBe('Readmisión')
    expect(nombreFamilia(['no vuelve a la visita de 3 meses', 'no vuelve a la visita de 6 meses'])).toBe('No vuelve a la visita')
    expect(nombreFamilia(['enfermedad respiratoria aguda antes de los 3 meses', 'enfermedad respiratoria aguda antes de los 6 meses']))
      .toBe('Enfermedad respiratoria aguda')
    expect(nombreFamilia(['talla baja para la edad a los 12 meses (riesgo calculado a 40 sem)',
      'talla baja para la edad a los 12 meses (riesgo calculado a 3 m EC)'])).toBe('Talla baja para la edad a los 12 meses')
    expect(nombreFamilia(['desarrollo psicomotor bajo a los 6 meses'])).toBe('Desarrollo psicomotor bajo a los 6 meses')
  })
})

const corrida = { id: 3, estado: 'ok', tipo: 'demo', fuente: 'simulado', terminada: '2026-07-01T10:00:00Z', creada_en: '2026-07-01T09:00:00Z' }
const resumen = {
  corrida, corte: '2026-06-30', fuente: 'simulado', paquete: 'p1', ninos: 800, datos: 16000, datos_revisar: 200,
  ninos_revisar: 90, datos_revisados: 10, alertas_por_1000: 12.5, alertas_por_capa: { '1': 50, '2': 90, '3': 60 },
  alarmas_grupo: 1, ninos_con_riesgo: 300, ninos_riesgo_alto: 40, riesgos_altos: 55, percentil_alto: 90,
  riesgos_por_desenlace: [{ clave: 'readm', desenlace: 'readmisión a los 3 meses', momento: 's40', momento_nombre: '40 semanas', ninos: 300, altos: 30, riesgo_medio: 0.12 }],
  crecimiento_por_etapa: [{ etapa: 'm3', etapa_nombre: '3 meses (edad corregida)', indicador: 'peso', datos: 500, pct_bajo: 12, pct_caida: 4, z_mediano: -0.8 }],
}
const alertaDato = { id: 1, variable: 'peso_3m', etiqueta: 'Peso a los 3 meses', etapa: 'm3', valor: '9999', esperado: 5000,
  rango_bajo: 4000, rango_alto: 6500, capas: ['1', '3'], motivo: 'valor atípico; fuera de la ventana de la etapa', prioridad: 1 }
const linea = {
  sujeto: 's1', grupo: null, eg_semanas: 31, anio_nacimiento: 2025, corte: '2026-06-30', corrida_id: 3, nombre_etapa: { m3: '3 meses' },
  contexto: [], crecimiento: { peso: [{ etapa: 'm3', indicador: 'peso', fecha: '2026-03-01', edad_corregida: 90, valor: 4100, z: -2.4, bajo_2de: true, caida_1de: true, improbable: false }] },
  visitas: [{
    etapa: 'm3', nombre: '3 meses', orden: 3, fecha: '2026-03-01', edad_corregida: 90,
    mediciones: [{ variable: 'peso_3m', etiqueta: 'Peso a los 3 meses', valor: '9999', unidad: 'g', fecha: '2026-03-01', tema: 'crecimiento' }],
    z: { peso: -2.4, talla: 0.2 }, alertas_dato: [alertaDato],
    riesgos: [{ id: 9, clave: 'readm', desenlace: 'readmisión a los 6 meses', momento: 'm3', riesgo: 0.41, percentil: 93, motivos: ['Peso al nacer (peso_nacer) = 769', 'quiebre_cambio_de_sistema_2022 = 1', 'Talla a 40 sem (talla_40) = sin dato'], fecha_visita: '2026-03-01', riesgo_medio: 0.12 }],
  }],
}
const historia = {
  paquete: 'p1', paquete_corrida: 'p1',
  puntos: [
    { clave: 'readm_40s', desenlace: 'readmisión antes de las 40 semanas', momento: 's40', momento_nombre: '40 semanas', orden: 2, riesgo: 0.2, percentil: 70, fecha_visita: '2025-12-01' },
    { clave: 'readm_6m', desenlace: 'readmisión entre los 3 y los 6 meses', momento: 'm3', momento_nombre: '3 meses', orden: 3, riesgo: 0.41, percentil: 93, fecha_visita: '2026-03-01' },
  ],
}
const perfil = { variables: [
  { variable: 'eg_semanas', etiqueta: 'Edad gestacional', unidad: 'semanas', ninos: 800, cuantiles: { p5: 28, p25: 31, p50: 33, p75: 35, p95: 36 }, valor: 31, posicion: 40 },
  { variable: 'peso_nacer', etiqueta: 'Peso al nacer', unidad: 'g', ninos: 790, cuantiles: { p5: 900, p25: 1300, p50: 1700, p75: 2000, p95: 2400 }, valor: null, posicion: null },
] }
const fila = { sujeto: 's1', eg_semanas: 31, grupo: null, percentil_max: 93, riesgo_max: 0.41, desenlace_max: 'readmisión a los 6 meses',
  clave_max: 'readm', n_riesgos: 2, n_alertas: 1, n_bajo_2de: 2, n_caida_1de: 1 }
const notificaciones = [{ desenlace: 'readm', nombre: 'readmisión a los 3 meses', percentil_minimo: 95, destinatarios: ['a@maia.prueba'], activo: true }]
const aviso = { id: 1, destinatario: 'a@maia.prueba', estado: 'enviado', error: null, enviado_en: '2026-07-01T10:00:00Z', sujeto: 's1',
  desenlace: 'readmisión a los 3 meses', percentil: 93, corrida_id: 3 }
const datoRevision = { ...alertaDato, sujeto: 's1', unidad: 'g', etapa_nombre: '3 meses', fecha: '2026-03-01', fuerza: 9, es_error: null, comentario: null }

function api(rol: 'admin' | 'experto' = 'experto') {
  simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/notificaciones/config') return { cuerpo: notificaciones }
    if (url.startsWith('/api/notificaciones/historial')) return { cuerpo: { total: 1, pagina: 1, tamano: 20, items: [aviso] } }
    if (url === '/api/tablero/resumen') return { cuerpo: resumen }
    if (url === '/api/tablero/alarmas-grupo') return { cuerpo: [{ grupo: null, periodo: '2026Q1', variable: 'peso_3m', etiqueta: 'Peso a los 3 meses', senal: 'cusum', valor: 1, referencia: 0, estadistico: 9, que_paso: 'subió de golpe en todo el programa' }] }
    if (url.startsWith('/api/ninos?')) return { cuerpo: { total: 1, pagina: 1, tamano: 25, items: [fila] } }
    if (url === '/api/ninos/s1/linea-temporal') return { cuerpo: linea }
    if (url === '/api/ninos/s1/historia-riesgo') return { cuerpo: historia }
    if (url === '/api/ninos/s1/perfil') return { cuerpo: perfil }
    if (url.startsWith('/api/revision/datos?')) return { cuerpo: { total: 1, pagina: 1, tamano: 10, items: [datoRevision] } }
    if (url === '/api/revision/riesgos') return { cuerpo: { corrida_id: 3, items: [] } }
    if (url === '/api/revision/resumen') return { cuerpo: { datos_por_capa: [{ capa: '2', respuestas: 4, si: 3, no: 1, no_se: 0, precision_pct: 75 }], riesgos_por_grupo: [] } }
    return { cuerpo: {} }
  })
}

const visible = () => document.body.textContent ?? ''

describe('pantallas del equipo clínico sin términos técnicos', () => {
  it('tablero', async () => {
    api()
    montar('/')
    expect(await screen.findByText('niños con algún riesgo alto')).toBeInTheDocument()
    expect(await screen.findByText('subió de golpe en todo el programa')).toBeInTheDocument()
    expect(screen.getByText('No cuadra con el resto de sus datos')).toBeInTheDocument()
    expect(visible()).toMatch(/Datos al 30 de jun/)
    expect(screen.getByText('Visita: 40 semanas')).toBeInTheDocument()   // no «se calcula a los 40 semanas»
    expect(screen.getByRole('columnheader', { name: 'Promedio' })).toBeInTheDocument()
    expect(visible()).not.toMatch(PROHIBIDO)
  })

  it('notificaciones (administración)', async () => {
    api('admin')
    montar('/admin/notificaciones')
    expect(await screen.findByText('Alto')).toBeInTheDocument()   // el aviso de posición 93, dicho como en el resto de la web
    expect(screen.getByLabelText('Riesgo mínimo')).toHaveValue(95)
    expect(screen.getByText('Con 95 se avisa del 5 % de niños con más riesgo.')).toBeInTheDocument()
    expect(document.querySelector('main')?.textContent).not.toMatch(PROHIBIDO)
  })

  it('lista de niños', async () => {
    api()
    montar('/ninos')
    expect(await screen.findByText('Alto')).toBeInTheDocument()
    expect(screen.getByText('Bajo para la edad ×2')).toBeInTheDocument()
    expect(visible()).not.toMatch(PROHIBIDO)
  })

  it('ficha del niño', async () => {
    api()
    montar('/ninos/s1')
    expect((await screen.findAllByText('9 de 10')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Riesgo alto').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bajo para la edad').length).toBeGreaterThan(0)
    expect(screen.getByText(/Valor muy distinto al de los demás niños; la fecha no corresponde a esta visita/)).toBeInTheDocument()
    expect(screen.getByText('Peso al nacer: 769')).toBeInTheDocument()
    expect(screen.getByText('Nació después del cambio de sistema 2022')).toBeInTheDocument()
    expect(screen.getByText(/También suben el riesgo: Talla a 40 sem\./)).toBeInTheDocument()   // no entre lo que sube por su valor
    expect(visible()).toMatch(/Probabilidad estimada: 41,0 % · promedio de los niños: 12,0 %/)
    expect(visible()).toMatch(/Nació a las 31 semanas de gestación/)   // sin «31,0»
    expect(await screen.findByText('Readmisión', { selector: 'h3' })).toBeInTheDocument()   // riesgo en cada visita, por familia
    expect(await screen.findByText(/más que 40 de cada 100 niños/)).toBeInTheDocument()   // perfil al nacer
    expect(screen.getByText('31 semanas', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('Sin dato')).toBeInTheDocument()
    expect(visible()).not.toMatch(PROHIBIDO)
    expect(visible()).not.toMatch(/\([a-z]+_[a-z0-9_]+\)|quiebre_/)
  })

  it('revisión de datos', async () => {
    api()
    montar('/revision/datos')
    expect(await screen.findByText(/Para este niño se esperaba entre/)).toBeInTheDocument()
    expect(visible()).not.toMatch(PROHIBIDO)
  })

  it('revisión de riesgos', async () => {
    api()
    montar('/revision/riesgos')
    expect(await screen.findByText('No hay niños con riesgo calculado con los datos más recientes')).toBeInTheDocument()
    expect(visible()).not.toMatch(PROHIBIDO)
  })
})
