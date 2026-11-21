// La ficha del niño con una sola pestaña «Desenlaces» (S21): todos los desenlaces del niño en una lista (los de 12 meses con su
// riesgo visita por visita y los demás con su riesgo calculado), el elegido en la dirección, y ningún rótulo sin contenido
// debajo: lo condicional se omite o se dice en una frase.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CorteDeFamilia, PuntoPorCorte, RiesgoPorCorte } from '../api/ninos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const Ubicacion = () => <p>dirección: {useLocation().search}</p>

const FALTA = 'Readmisión (readm) = sin dato'
const SUBE = 'Peso al nacer (peso_nacer) = 1240'

const tarjeta = (motivos: string[]) => ({
  id: 2, clave: 'desarrollo_6m', desenlace: 'desarrollo psicomotor bajo a los 6 meses', momento: '3 m EC', riesgo: 0.3, percentil: 70,
  motivos, fecha_visita: '2026-03-01', riesgo_medio: 0.1,
})
const linea = (extra: Record<string, unknown> = {}, motivosTarjeta = [FALTA]) => ({
  sujeto: 's1', grupo: '1', eg_semanas: 30, anio_nacimiento: 2026, corte: '2026-06-30', corrida_id: 3, modelo_clinico: 'f00dcafe12', nombre_etapa: {}, contexto: [],
  crecimiento: {},
  visitas: [{
    etapa: '3 m EC', nombre: '3 meses', orden: 4, fecha: '2026-03-01', edad_corregida: 90, z: {}, alertas_dato: [],
    mediciones: [{ variable: 'peso_3m', etiqueta: 'Peso a los 3 meses', valor: '5200', unidad: 'g', fecha: '2026-03-01', tema: 'crecimiento' }],
    riesgos: [tarjeta(motivosTarjeta)],
  }],
  ...extra,
})

const corte = (clave: string, momento: string, nombre: string, orden: number, extra: Partial<CorteDeFamilia> = {}): CorteDeFamilia => ({
  clave, momento, momento_nombre: nombre, orden, estado: 'en_prueba', motivo_sin_riesgo: null, calibrado_con: 'nacidos de 2019 a 2021', ...extra,
})
const t40 = corte('talla_baja_12m_desde_40', '40 sem', '40 semanas', 3)
const t3 = corte('talla_baja_12m_desde_3', '3 m EC', '3 meses', 4)
const d3 = corte('desarrollo_12m_desde_3', '3 m EC', '3 meses', 4)
const punto = (c: CorteDeFamilia, desenlace: string, riesgo: number, percentil: number, motivos: string[]): PuntoPorCorte => ({
  clave: c.clave, desenlace, momento: c.momento, momento_nombre: c.momento_nombre, orden: c.orden, riesgo, percentil,
  fecha_visita: null, estado: c.estado, motivos,
})
const TALLA = 'talla baja a los 12 meses'
const DESARROLLO = 'desarrollo psicomotor bajo a los 12 meses'
// talla: a 40 semanas ningún dato subió el riesgo, a 3 meses sí; desarrollo: solo hay datos que faltan
const historia = (): RiesgoPorCorte => ({
  paquete: 'p1', modelo: { version: 'a1b2c3d4e5', entrenado: '2026-11-19T10:00:00', corte_datos: '2026-06-30' },
  familias: [
    { clave: 'talla_baja_12m', nombre: TALLA, definicion: null, estado: 'en_prueba', cortes: [t40, t3] },
    { clave: 'desarrollo_12m', nombre: DESARROLLO, definicion: null, estado: 'en_prueba', cortes: [d3] },
  ],
  puntos: [punto(t40, TALLA, 0.22, 78, []), punto(t3, TALLA, 0.35, 89, [SUBE]), punto(d3, DESARROLLO, 0.6, 95, [FALTA])],
})
const sinFamilias = (): { paquete: string; puntos: [] } => ({ paquete: 'p1', puntos: [] })   // una API anterior: sin las familias
const sinRiesgo = (): RiesgoPorCorte => ({
  paquete: 'p1',
  familias: [{ clave: 'talla_baja_12m', nombre: TALLA, definicion: null, estado: 'en_prueba',
    cortes: [{ ...t3, motivo_sin_riesgo: 'no_asistio' }] }],
  puntos: [],
})
const trayectoria = [{ clave: 'desarrollo_6m', desenlace: 'desarrollo psicomotor bajo a los 6 meses', momento: '3 m EC', momento_nombre: '3 meses', orden: 4,
  riesgo: 0.3, percentil: 70, fecha_visita: null }]

function api(h: RiesgoPorCorte | { paquete: string; puntos: [] } = historia(), nino: unknown = linea(), puntos: unknown[] = trayectoria) {
  simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
    if (url === '/api/ninos/s1/linea-temporal') return { cuerpo: nino }
    if (url === '/api/ninos/s1/historia-riesgo?motivos=true') return { cuerpo: h }
    if (url === '/api/ninos/s1/historia-riesgo') return { cuerpo: { paquete: 'p1', paquete_corrida: 'p1', puntos } }
    if (url === '/api/ninos/s1/perfil') return { cuerpo: { variables: [] } }
    return undefined
  })
}

const pestanas = async () => within(await screen.findByRole('tablist', { name: 'Qué ver de este niño' }))
const nombres = (lista: HTMLElement) => within(lista).getAllByRole('button').map((b) => b.getAttribute('data-desenlace'))
const detalle = (nombre: string) => screen.getByRole('region', { name: nombre })

describe('lo condicional de la ficha no deja rótulos vacíos', () => {
  it('«Lo que más pesó» solo sale con algo debajo; los datos que faltan van aparte, con lo que significan', async () => {
    api()
    montar('/ninos/s1')
    await screen.findByRole('list', { name: 'Desenlaces del niño' })
    // de las tres columnas, solo la de talla a 3 meses tiene algo que sube el riesgo
    const encabezados = screen.getAllByText('Lo que más pesó')
    expect(encabezados).toHaveLength(1)
    expect(encabezados[0].parentElement!.querySelectorAll('li')).toHaveLength(1)
    // sin datos que suban el riesgo se dice en una frase; con solo datos que faltan, ellos son su propia línea
    expect(screen.getAllByText('Ningún dato subió el riesgo de forma notable.')).toHaveLength(1)
    const faltan = within(detalle('Desarrollo psicomotor bajo a los 12 meses')).getByText('Datos que faltan:').parentElement!
    expect(faltan).toHaveTextContent('Readmisión')
    expect(faltan).toHaveTextContent('Si se midieron, conviene registrarlos.')
    expect(within(detalle('Desarrollo psicomotor bajo a los 12 meses')).queryByText('Lo que más pesó')).not.toBeInTheDocument()
    // la tarjeta de otro desenlace, con solo datos que faltan, no trae «Lo que sube el riesgo» vacío
    expect(screen.queryByText('Lo que sube el riesgo')).not.toBeInTheDocument()
    expect(within(detalle('Desarrollo psicomotor bajo a los 6 meses')).getByText('Datos que faltan:')).toBeInTheDocument()
  })

  it('sin riesgo en una familia no se explica «cada columna»', async () => {
    api(sinRiesgo(), linea({ visitas: [] }), [])
    montar('/ninos/s1?ver=desenlaces')
    await screen.findByRole('list', { name: 'Desenlaces sin riesgo calculado' })
    expect(screen.queryByText(/Cada columna es/)).not.toBeInTheDocument()
    expect(screen.queryByText('Cómo se calculó')).not.toBeInTheDocument()
  })

  it('el pie de la ficha no dice «Grupo N»: la sede se dice como sede', async () => {
    api()
    montar('/ninos/s1')
    await screen.findByRole('list', { name: 'Desenlaces del niño' })
    expect(screen.getByText(/Nació a las 30 semanas de gestación, en 2026\. Sede 1\. Datos al/)).toBeInTheDocument()
    expect(screen.queryByText(/Grupo 1/)).not.toBeInTheDocument()
  })
})

describe('pestaña «Desenlaces»', () => {
  it('una sola pestaña reemplaza las de cada familia y «Otros riesgos»', async () => {
    const z = (edad: number, valor: number) => ({ etapa: '3 m EC', indicador: 'talla', fecha: null, edad_corregida: edad, valor: 50, unidad: 'cm', z: valor, bajo_2de: false, caida_1de: false, improbable: false })
    api(historia(), linea({ crecimiento: { talla: [z(10, -0.5), z(60, -1)] } }))
    montar('/ninos/s1')
    const lista = await pestanas()
    await waitFor(() => expect(lista.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Desenlaces', 'Crecimiento', 'Visitas']))
    expect(lista.getByRole('tab', { name: 'Desenlaces' })).toHaveAttribute('aria-selected', 'true')
  })

  it('lista todos los desenlaces, el de más riesgo primero y elegido; el elegido vive en la dirección', async () => {
    api()
    montar('/ninos/s1', <Ubicacion />)
    const lista = await screen.findByRole('list', { name: 'Desenlaces del niño' })
    expect(nombres(lista)).toEqual(['desarrollo_12m', 'talla_baja_12m', 'desarrollo_6m'])
    const [desarrollo12, talla12, desarrollo6] = within(lista).getAllByRole('button')
    expect(desarrollo12).toHaveAttribute('aria-current', 'true')
    expect(desarrollo12).toHaveTextContent('Desarrollo psicomotor bajo a los 12 meses')
    expect(desarrollo12).toHaveTextContent('60 %')
    // una sola comparación en toda la columna («Más que N de 10»); «Muy alto» o «Alto» se suman, no la reemplazan
    expect(desarrollo12).toHaveTextContent('Más que 9 de 10')
    expect(desarrollo12).toHaveTextContent('Muy alto')
    expect(desarrollo12).toHaveTextContent('En prueba')
    expect(talla12).toHaveTextContent('35 %')
    expect(talla12).toHaveTextContent('Más que 8 de 10')
    expect(talla12).not.toHaveTextContent(/Alto/)
    expect(talla12).toHaveTextContent('Subió 13 puntos')
    expect(desarrollo6).toHaveTextContent('Desarrollo psicomotor bajo a los 6 meses')
    expect(desarrollo6).toHaveTextContent('Más que 7 de 10')
    expect(desarrollo6).not.toHaveTextContent('En prueba')
    expect(detalle('Desarrollo psicomotor bajo a los 12 meses')).not.toHaveClass('hidden')
    expect(detalle('Talla baja a los 12 meses')).toHaveClass('hidden')

    await userEvent.click(talla12)
    expect(screen.getByText(/^dirección:/)).toHaveTextContent('desenlace=talla_baja_12m')
    expect(talla12).toHaveAttribute('aria-current', 'true')
    expect(within(detalle('Talla baja a los 12 meses')).getByText('Calculado a 40 semanas')).toBeInTheDocument()
    expect(detalle('Talla baja a los 12 meses')).not.toHaveClass('hidden')
    expect(detalle('Desarrollo psicomotor bajo a los 12 meses')).toHaveClass('hidden')

    await userEvent.click(desarrollo6)
    expect(screen.getByText(/^dirección:/)).toHaveTextContent('desenlace=desarrollo_6m')
    // el título de la tarjeta empieza con mayúscula, igual que en la lista
    expect(within(detalle('Desarrollo psicomotor bajo a los 6 meses')).getByRole('heading', { level: 2, name: 'Desarrollo psicomotor bajo a los 6 meses' })).toBeInTheDocument()
  })

  it('cada desenlace sale una sola vez, con su tarjeta y su evolución juntas, aunque la tarjeta y las visitas lo nombren distinto', async () => {
    // claves reales de un niño: la tarjeta de la última visita (desarrollo_6m, oxigeno_3m, readm_3m) y la historia con una fila por visita
    const tarjeta = (id: number, clave: string, desenlace: string, riesgo: number, percentil: number) => ({
      id, clave, desenlace, momento: '3 m EC', riesgo, percentil, motivos: [], fecha_visita: '2026-03-01', riesgo_medio: 0.1,
    })
    const punto = (clave: string, desenlace: string, orden: number, riesgo: number, percentil: number) => ({
      clave, desenlace, momento: 'x', momento_nombre: `visita ${orden}`, orden, riesgo, percentil, fecha_visita: null,
    })
    const DES = 'desarrollo psicomotor bajo a los 6 meses'
    const OXI = 'oxigenodependencia a los 3 meses'
    const REA = 'readmisión entre las 40 semanas y los 3 meses'
    const nino = linea({ visitas: [{
      ...linea().visitas[0],
      riesgos: [tarjeta(1, 'desarrollo_6m', DES, 0.3, 70), tarjeta(2, 'oxigeno_3m', OXI, 0.2, 40), tarjeta(3, 'readm_3m_desde_pmc', `${REA} (riesgo calculado a pmc)`, 0.2, 60)],
    }] })
    api(sinFamilias(), nino, [
      punto('desarrollo_6m_desde_pmc', `${DES} (riesgo calculado a pmc)`, 1, 0.2, 50),
      punto('desarrollo_6m_desde_40', `${DES} (riesgo calculado a 40 sem)`, 3, 0.25, 60),
      punto('desarrollo_6m', DES, 4, 0.3, 70),
      punto('desarrollo_6m_desde_3', `${DES} (riesgo calculado a 3 m EC)`, 5, 0.4, 80),
      punto('oxigeno_3m_desde_pmc', `${OXI} (riesgo calculado a pmc)`, 1, 0.1, 30),
      punto('oxigeno_3m', OXI, 4, 0.2, 40),
      punto('readm_3m_desde_pmc', `${REA} (riesgo calculado a pmc)`, 2, 0.2, 60),
      punto('readm_3m_desde_40', `${REA} (riesgo calculado a 40 sem)`, 3, 0.3, 92),
      punto('no_vuelve_3m', 'no regresa al programa a los 3 meses', 4, 0.05, 20),
    ])
    montar('/ninos/s1')
    const lista = await screen.findByRole('list', { name: 'Desenlaces del niño' })
    expect(nombres(lista)).toEqual(['readm_3m', 'desarrollo_6m', 'oxigeno_3m', 'no_vuelve_3m'])
    const [readm, desarrollo, oxigeno] = within(lista).getAllByRole('button')
    // con tarjeta de un modelo en uso, la fila dice lo mismo que la tarjeta; el cambio, frente a la visita anterior
    expect(desarrollo).toHaveTextContent('30,0 %')
    expect(desarrollo).toHaveTextContent('Más que 7 de 10')
    expect(desarrollo).toHaveTextContent('Subió 5 puntos')
    expect(desarrollo).not.toHaveTextContent('En prueba')
    expect(oxigeno).toHaveTextContent('20,0 %')
    // si la única tarjeta es de un modelo en prueba, la fila sigue el último punto de la evolución y lo dice
    expect(readm).toHaveTextContent('30,0 %')
    expect(readm).toHaveTextContent('Más que 9 de 10')
    expect(readm).toHaveTextContent('Alto')
    expect(readm).toHaveTextContent('En prueba')
    // tarjeta y evolución viven en el mismo detalle
    const region = within(detalle('Desarrollo psicomotor bajo a los 6 meses'))
    expect(region.getByRole('heading', { level: 2, name: 'Desarrollo psicomotor bajo a los 6 meses' })).toBeInTheDocument()
    expect(await region.findByRole('figure', { name: /Desarrollo psicomotor bajo a los 6 meses/ })).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: 'Desarrollo psicomotor bajo a los 6 meses' })).toHaveLength(1)
  })

  it('con el desenlace en la dirección abre ese', async () => {
    api()
    montar('/ninos/s1?desenlace=talla_baja_12m')
    const lista = await screen.findByRole('list', { name: 'Desenlaces del niño' })
    expect(within(lista).getAllByRole('button')[1]).toHaveAttribute('aria-current', 'true')
  })

  it('un desenlace sin riesgo calculado se lista aparte con la razón en una línea, no como tarjeta vacía', async () => {
    api(sinRiesgo(), linea({ visitas: [] }), [])
    montar('/ninos/s1?ver=desenlaces')
    const lista = await screen.findByRole('list', { name: 'Desenlaces sin riesgo calculado' })
    expect(screen.queryByRole('list', { name: 'Desenlaces del niño' })).not.toBeInTheDocument()
    expect(screen.getByText('Sin riesgo calculado')).toBeInTheDocument()
    const [talla, desarrollo] = within(lista).getAllByRole('button')
    expect(talla).toHaveTextContent('Aún no hay datos de la visita de 3 meses.')
    // las priorizadas que el paquete no calcula también se dicen
    expect(desarrollo).toHaveTextContent('El paquete de modelos activo no calcula desarrollo psicomotor bajo a los 12 meses.')
  })

  it('las direcciones de antes (?ver=riesgo-<familia> y ?ver=otros) abren «Desenlaces» con ese desenlace', async () => {
    api()
    const { unmount } = montar('/ninos/s1?ver=riesgo-talla_baja_12m')
    const lista = await screen.findByRole('list', { name: 'Desenlaces del niño' })
    expect(screen.getByRole('tab', { name: 'Desenlaces' })).toHaveAttribute('aria-selected', 'true')
    expect(within(lista).getAllByRole('button')[1]).toHaveAttribute('aria-current', 'true')
    unmount()

    api()
    montar('/ninos/s1?ver=otros')
    const otra = await screen.findByRole('list', { name: 'Desenlaces del niño' })
    expect(screen.getByRole('tab', { name: 'Desenlaces' })).toHaveAttribute('aria-selected', 'true')
    expect(within(otra).getAllByRole('button')[2]).toHaveAttribute('aria-current', 'true')
  })

  it('al imprimir salen todos los desenlaces, no solo el elegido, y la lista no se imprime', async () => {
    api()
    montar('/ninos/s1')
    const lista = await screen.findByRole('list', { name: 'Desenlaces del niño' })
    expect(lista.closest('nav')).toHaveClass('print:hidden')
    // en pantalla se ve uno; los demás están ocultos solo en pantalla
    expect(detalle('Desarrollo psicomotor bajo a los 12 meses')).not.toHaveClass('hidden')
    for (const nombre of ['Talla baja a los 12 meses', 'Desarrollo psicomotor bajo a los 6 meses']) {
      expect(detalle(nombre)).toHaveClass('hidden', 'print:block')
    }
    expect(within(detalle('Talla baja a los 12 meses')).getByText('Calculado a 40 semanas')).toBeInTheDocument()
  })

  it('una falla de red se dice con un reintento que recupera los desenlaces', async () => {
    let falla = true
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url === '/api/ninos/s1/linea-temporal') return { cuerpo: linea() }
      if (url === '/api/ninos/s1/historia-riesgo?motivos=true') {
        return falla ? { estado: 500, cuerpo: { detail: 'No se pudo calcular el riesgo en las visitas anteriores de este niño.' } } : { cuerpo: historia() }
      }
      if (url === '/api/ninos/s1/historia-riesgo') return { cuerpo: { paquete: 'p1', paquete_corrida: 'p1', puntos: trayectoria } }
      if (url === '/api/ninos/s1/perfil') return { cuerpo: { variables: [] } }
      return undefined
    })
    montar('/ninos/s1')
    expect((await screen.findAllByText('No se pudo calcular el riesgo en las visitas anteriores de este niño.')).length).toBeGreaterThan(0)
    expect(await screen.findByRole('heading', { name: 'Niño s1' })).toBeInTheDocument()   // el resto de la ficha sigue a la vista
    // lo que no depende de esa consulta se ve igual
    expect(screen.getByRole('list', { name: 'Desenlaces del niño' })).toHaveTextContent('Desarrollo psicomotor bajo a los 6 meses')
    falla = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect((await screen.findAllByText('Calculado a 3 meses', { selector: 'h4' })).length).toBeGreaterThan(0)
  })
})

describe('la ficha abre en una pestaña con contenido', () => {
  it('con riesgo abre «Desenlaces»; sin ningún riesgo, la primera pestaña que tiene algo que mostrar', async () => {
    api(sinRiesgo(), linea({ visitas: [{ ...linea().visitas[0], riesgos: [] }] }), [])
    montar('/ninos/s1')
    const lista = await pestanas()
    await waitFor(() => expect(lista.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Desenlaces', 'Visitas']))
    expect(lista.getByRole('tab', { name: 'Visitas' })).toHaveAttribute('aria-selected', 'true')
    expect(await within(screen.getByRole('tabpanel')).findByText('Peso a los 3 meses')).toBeInTheDocument()
    // la pestaña de desenlaces sigue ahí, para ver por qué no hay riesgo
    await userEvent.click(lista.getByRole('tab', { name: 'Desenlaces' }))
    expect(within(screen.getByRole('tabpanel')).getAllByText('Aún no hay datos de la visita de 3 meses.').length).toBeGreaterThan(0)
  })

  it('sin desenlaces ni familias en la API, no hay pestaña «Desenlaces» y abre «Visitas»', async () => {
    api({ paquete: 'p1', puntos: [] }, linea({ visitas: [{ ...linea().visitas[0], riesgos: [] }] }), [])
    montar('/ninos/s1')
    const lista = await pestanas()
    await waitFor(() => expect(lista.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Visitas']))
    expect(lista.getByRole('tab', { name: 'Visitas' })).toHaveAttribute('aria-selected', 'true')
  })
})
