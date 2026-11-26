// Riesgo a los 12 meses, visita por visita (S7): el riesgo de cada familia de desenlaces en cada visita a la que fue el
// niño, con lo que más pesó, el cambio frente a la visita anterior, «En prueba» y cómo se calculó.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { CorteDeFamilia, FamiliaDelPaquete, PuntoPorCorte, RiesgoPorCorte } from '../api/ninos'
import { RiesgoA12Meses } from '../components/ficha/RiesgoA12Meses'
import { estadoDe, familiaDe, familiaDesde, familiasDelNino, ordenarFamilias12m } from '../lib/familias'

const corte = (clave: string, momento: string, nombre: string, orden: number, extra: Partial<CorteDeFamilia> = {}): CorteDeFamilia => ({
  clave, momento, momento_nombre: nombre, orden, estado: estadoDe(clave), motivo_sin_riesgo: null, calibrado_con: 'nacidos de 2019 a 2021', ...extra,
})
const punto = (c: CorteDeFamilia, riesgo: number, percentil: number, motivos: string[] = []): PuntoPorCorte => ({
  clave: c.clave, desenlace: 'talla baja a los 12 meses', momento: c.momento, momento_nombre: c.momento_nombre, orden: c.orden,
  riesgo, percentil, fecha_visita: null, estado: c.estado, motivos,
})

const c40 = corte('talla_baja_12m_desde_40', '40 sem', '40 semanas', 3)
const c3 = corte('talla_baja_12m_desde_3', '3 m EC', '3 meses', 4)
const c6 = corte('talla_baja_12m_desde_6', '6 m EC', '6 meses', 5, { motivo_sin_riesgo: 'no_asistio' })
const tallaBaja: FamiliaDelPaquete = {
  clave: 'talla_baja_12m', nombre: 'talla baja a los 12 meses', estado: 'en_prueba', cortes: [c40, c3, c6],
  definicion: 'Talla para la edad con z menor que −2 (OMS) en la visita de 12 m EC.',
}
const historia = (extra: Partial<RiesgoPorCorte> = {}): RiesgoPorCorte => ({
  paquete: '2026-11-19-abc123',
  modelo: { version: 'a1b2c3d4e5', entrenado: '2026-11-19T10:00:00', corte_datos: '2026-06-30' },
  familias: [tallaBaja],
  puntos: [
    punto(c40, 0.22, 78, ['Peso al nacer (peso_nacer) = 1.240 g', 'Lactancia exclusiva (lactancia) = Sí']),
    punto(c3, 0.35, 89, ['Talla al nacer (talla_nacer) = 38 cm', 'Readmisión (readm) = sin dato']),
  ],
  ...extra,
})

describe('familias de desenlaces (espejo de maia_comun.clinica)', () => {
  it('la familia es la clave sin «_desde_<visita>»; la clave base es su propia familia', () => {
    expect(familiaDesde('talla_baja_12m_desde_3')).toEqual({ familia: 'talla_baja_12m', visita: '3' })
    expect(familiaDesde('readm_6m_desde_pmc')).toEqual({ familia: 'readm_6m', visita: 'pmc' })
    expect(familiaDesde('desarrollo_12m')).toBeNull()
    expect(familiaDe('talla_baja_12m_desde_3')).toBe('talla_baja_12m')
    expect(familiaDe('desarrollo_12m')).toBe('desarrollo_12m')
  })
  it('las filas _desde_ están en prueba y la base en uso', () => {
    expect(estadoDe('desarrollo_12m_desde_40')).toBe('en_prueba')
    expect(estadoDe('desarrollo_12m')).toBe('en_uso')
  })
  it('solo las de 12 meses, primero talla baja, luego desarrollo y luego las demás', () => {
    const f = (clave: string) => ({ clave })
    expect(ordenarFamilias12m([f('readm_3m'), f('otra_12m'), f('desarrollo_12m'), f('talla_baja_12m')]).map((x) => x.clave))
      .toEqual(['talla_baja_12m', 'desarrollo_12m', 'otra_12m'])
  })
})

describe('familiasDelNino', () => {
  it('una columna por visita con riesgo, en orden, y el cambio frente a la visita anterior', () => {
    const { mostradas } = familiasDelNino(historia())
    expect(mostradas).toHaveLength(1)
    const [a, b] = mostradas[0].columnas
    expect([a.corte.clave, b.corte.clave]).toEqual(['talla_baja_12m_desde_40', 'talla_baja_12m_desde_3'])
    expect(a.cambio).toBeNull()
    expect(b.cambio).toEqual({ sentido: 'subio', puntos: 13, texto: 'Subió 13 puntos con la visita de 3 meses' })
    expect(mostradas[0].sinRiesgo.map((c) => c.clave)).toEqual(['talla_baja_12m_desde_6'])
  })
  it('dice si bajó, si quedó igual y usa el singular', () => {
    const base = historia()
    const cambio = (r: number) => familiasDelNino({ ...base, puntos: [base.puntos[0], { ...base.puntos[1], riesgo: r }] }).mostradas[0].columnas[1].cambio?.texto
    expect(cambio(0.1)).toBe('Bajó 12 puntos con la visita de 3 meses')
    expect(cambio(0.23)).toBe('Subió 1 punto con la visita de 3 meses')
    expect(cambio(0.22)).toBe('Sin cambio con la visita de 3 meses')
  })
  it('una familia sin riesgo en ningún corte se muestra con sus razones; la que el paquete no tiene, como ausente', () => {
    const sin = { ...tallaBaja, cortes: tallaBaja.cortes.map((c) => ({ ...c, motivo_sin_riesgo: 'no_asistio' as const })) }
    const v = familiasDelNino(historia({ familias: [sin], puntos: [] }))
    expect(v.mostradas[0].columnas).toEqual([])
    expect(v.mostradas[0].sinRiesgo).toHaveLength(3)
    expect(v.ausentes.map((a) => a.clave)).toEqual(['desarrollo_12m'])
  })
})

describe('RiesgoA12Meses', () => {
  it('muestra, por visita, el riesgo, qué tan alto es frente a los demás, lo que más pesó y el cambio', () => {
    render(<RiesgoA12Meses historia={historia()} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Riesgo a los 12 meses, visita por visita' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /Riesgo de talla baja a los 12 meses/ })).toBeInTheDocument()
    expect(screen.getByText('En prueba', { selector: 'h3 *' })).toBeInTheDocument()
    expect(screen.getByText('Talla para la edad con z menor que −2 (OMS) en la visita de 12 m EC.')).toBeInTheDocument()

    const columnas = screen.getAllByRole('listitem').filter((li) => within(li).queryByText(/^Calculado a /))
    expect(columnas).toHaveLength(2)
    const [antes, ahora] = columnas
    expect(within(antes).getByText('Calculado a 40 semanas')).toBeInTheDocument()
    expect(within(antes).getByText('22 %')).toBeInTheDocument()
    expect(within(antes).getByText('Más riesgo que 7 de cada 10 niños')).toBeInTheDocument()
    expect(within(antes).getByText('Peso al nacer: 1.240 g')).toBeInTheDocument()
    expect(within(antes).queryByText(/Subió|Bajó/)).not.toBeInTheDocument()
    expect(within(ahora).getByText('Calculado a 3 meses')).toBeInTheDocument()
    expect(within(ahora).getByText('35 %')).toBeInTheDocument()
    expect(within(ahora).getByText('Más riesgo que 8 de cada 10 niños')).toBeInTheDocument()
    expect(within(ahora).getByText('Subió 13 puntos con la visita de 3 meses')).toBeInTheDocument()
    expect(within(ahora).getByText('Talla al nacer: 38 cm')).toBeInTheDocument()
    expect(within(ahora).getByText(/Readmisión/)).toBeInTheDocument()   // el dato que falta se dice aparte
    expect(within(ahora).getByText('Datos que faltan:')).toBeInTheDocument()
  })

  it('con un modelo en prueba no se promete la frecuencia; el pie dice cómo se calculó', () => {
    render(<RiesgoA12Meses historia={historia()} />)
    expect(screen.getByText('Modelo en prueba: aún no se ha comprobado si, de cada 100 niños con un riesgo de 35 %, unos 35 tienen talla baja a los 12 meses.')).toBeInTheDocument()
    expect(screen.queryByText(/^De cada 100 niños/)).not.toBeInTheDocument()
    const pie = screen.getByRole('heading', { name: 'Cómo se calculó' }).parentElement!
    expect(pie.textContent).toMatch(/solo con lo medido hasta su visita/i)
    expect(pie.textContent).toMatch(/Modelo clínico a1b2c3d4e5/)
    expect(pie.textContent).toMatch(/Entrenamiento del 19 de nov/)
    expect(pie.textContent).toMatch(/Calibrado con los niños más recientes \(nacidos de 2019 a 2021\)/)
  })

  it('el pie «Cómo se calculó» sale una sola vez por página, aunque haya dos desenlaces, y cada desenlace sigue diciendo su visita y «En prueba»', () => {
    const desarrollo: FamiliaDelPaquete = { ...tallaBaja, clave: 'desarrollo_12m', nombre: 'desarrollo bajo a los 12 meses',
      cortes: [corte('desarrollo_12m_desde_40', '40 sem', '40 semanas', 3), corte('desarrollo_12m_desde_3', '3 m EC', '3 meses', 4)] }
    const p = [...historia().puntos, ...desarrollo.cortes.map((c) => punto(c, 0.3, 60))]
    render(<RiesgoA12Meses historia={historia({ familias: [tallaBaja, desarrollo], puntos: p })} />)
    expect(screen.getAllByRole('heading', { level: 3, name: /^Riesgo de / })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { name: 'Cómo se calculó' })).toHaveLength(1)
    expect(screen.getAllByText('En prueba', { selector: 'h3 *' })).toHaveLength(2)
    expect(screen.getAllByText('Calculado a 40 semanas')).toHaveLength(2)
  })

  it('con dos visitas no hay gráfica de evolución (las columnas ya dicen el cambio); con tres, sí', () => {
    const { unmount } = render(<RiesgoA12Meses historia={historia()} />)
    expect(screen.queryByRole('figure', { name: /por visita:/ })).not.toBeInTheDocument()
    unmount()
    const tres = { ...tallaBaja, cortes: [c40, c3, { ...c6, motivo_sin_riesgo: null }] }
    render(<RiesgoA12Meses historia={historia({ familias: [tres], puntos: [...historia().puntos, punto(c6, 0.4, 91)] })} />)
    expect(screen.getByRole('figure', { name: /por visita:/ })).toBeInTheDocument()
  })

  it('«En prueba» solo en las visitas que lo están cuando la familia ya se usa', () => {
    const uso: FamiliaDelPaquete = { ...tallaBaja, clave: 'desarrollo_12m', nombre: 'desarrollo bajo a los 12 meses', estado: 'en_uso',
      cortes: [corte('desarrollo_12m_desde_40', '40 sem', '40 semanas', 3), corte('desarrollo_12m', '6 m EC', '6 meses', 5)] }
    const p = uso.cortes.map((c) => punto(c, 0.2, 50))
    render(<RiesgoA12Meses historia={historia({ familias: [uso], puntos: p })} />)
    const encabezado = screen.getByRole('heading', { level: 3, name: /Riesgo de desarrollo bajo a los 12 meses/ })
    expect(within(encabezado).queryByText('En prueba')).not.toBeInTheDocument()
    const columnas = screen.getAllByRole('listitem').filter((li) => within(li).queryByText(/^Calculado a /))
    expect(within(columnas[0]).getByText('En prueba')).toBeInTheDocument()
    expect(within(columnas[1]).queryByText('En prueba')).not.toBeInTheDocument()
    // la frase es la del último corte, que ya está en uso: ahí sí se dice lo que pasó con otros niños
    expect(screen.getByText('De cada 100 niños con un riesgo de 20 %, unos 20 tuvieron desarrollo bajo a los 12 meses.')).toBeInTheDocument()
  })

  it('si el último corte de una familia en uso está en prueba, tampoco se promete la frecuencia', () => {
    const uso: FamiliaDelPaquete = { ...tallaBaja, estado: 'en_uso', cortes: [{ ...c40, estado: 'en_uso' }, { ...c3, estado: 'en_prueba' }] }
    render(<RiesgoA12Meses historia={historia({ familias: [uso] })} />)
    expect(screen.getByText('Modelo en prueba: aún no se ha comprobado si, de cada 100 niños con un riesgo de 35 %, unos 35 tienen talla baja a los 12 meses.')).toBeInTheDocument()
  })

  it('si una familia no tiene riesgo en ningún corte, dice por qué; si el paquete no la tiene, también', () => {
    const sin = { ...tallaBaja, cortes: [{ ...c40, motivo_sin_riesgo: 'no_asistio' as const }, { ...c3, motivo_sin_riesgo: 'sin_datos' as const },
      { ...c6, motivo_sin_riesgo: 'no_entrenado' as const }] }
    render(<RiesgoA12Meses historia={historia({ familias: [sin], puntos: [] })} />)
    expect(screen.getByText('Aún no hay datos de la visita de 40 semanas.')).toBeInTheDocument()
    expect(screen.getByText('El paquete de modelos activo no puede calcularlo con los datos de la visita de 3 meses.')).toBeInTheDocument()
    expect(screen.getByText('El paquete de modelos activo no tiene el modelo para la visita de 6 meses.')).toBeInTheDocument()
    expect(screen.getByText('El paquete de modelos activo no calcula desarrollo psicomotor bajo a los 12 meses.')).toBeInTheDocument()
  })

  it('las visitas sin riesgo de una familia con otras sí se explican bajo las columnas', () => {
    render(<RiesgoA12Meses historia={historia()} />)
    expect(screen.getByText('Aún no hay datos de la visita de 6 meses.')).toBeInTheDocument()
  })

  it('tiene una tabla como alternativa a la gráfica', async () => {
    render(<RiesgoA12Meses historia={historia()} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver como tabla' }))
    const tabla = screen.getByRole('table')
    expect(within(tabla).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Visita', 'Riesgo', 'Frente a los demás niños', 'Cambio', 'Lo que más pesó'])
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas).toHaveLength(2)
    expect(within(filas[1]).getByText('35 %')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Subió 13 puntos con la visita de 3 meses')).toBeInTheDocument()
  })

  it('sin la respuesta nueva de la API no pinta nada, y mientras carga o si falla, lo dice con reintento', async () => {
    const { container, rerender } = render(<RiesgoA12Meses historia={{ paquete: 'p', puntos: [] }} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<RiesgoA12Meses cargando />)
    expect(screen.getByText('Calculando el riesgo visita por visita…')).toBeInTheDocument()
    let reintentos = 0
    rerender(<RiesgoA12Meses error={new Error('Sin conexión')} reintentar={() => { reintentos++ }} />)
    expect(screen.getByText('Sin conexión')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reintentos).toBe(1)
  })

  it('no usa jerga técnica en la pantalla clínica', () => {
    render(<RiesgoA12Meses historia={historia()} />)
    expect(document.body.textContent).not.toMatch(/posici[oó]n|percentil|puntaje z|\bcorte\b|\bcorrida\b|capa \d|\bAUC\b|\(talla_nacer\)/i)
  })
})
