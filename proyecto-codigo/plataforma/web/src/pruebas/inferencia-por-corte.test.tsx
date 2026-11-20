// «Calcular un niño» con el riesgo de cada visita (S7): un niño escrito solo hasta las 40 semanas da una columna; al sumar la
// visita de los 3 meses, dos, con el cambio. La API calcula cada una solo con lo escrito hasta su visita.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CorteDeFamilia, RiesgoPorCorte } from '../api/ninos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const campo = (variable: string, etiqueta: string) => ({
  variable, etiqueta, tipo: 'numero', unidad: 'g', tema: null, opciones: [], minimo: null, maximo: null,
  crecimiento: true, peso: 0, principal: true,
})
const formulario = {
  paquete: 'p1', fuente: 'simulado', generales: [],
  visitas: [
    { etapa: '40 sem', nombre: '40 semanas', orden: 3, base: 'corregida', edad_min: -21, edad_max: 35, desenlaces: [], campos: [campo('peso_40', 'Peso a 40 sem')] },
    { etapa: '3 m EC', nombre: '3 meses', orden: 4, base: 'corregida', edad_min: 45, edad_max: 135, desenlaces: [], campos: [campo('peso_3m', 'Peso a 3 m')] },
  ],
}
const corte = (clave: string, momento: string, nombre: string, orden: number): CorteDeFamilia => ({
  clave, momento, momento_nombre: nombre, orden, estado: 'en_prueba', motivo_sin_riesgo: null, calibrado_con: 'nacidos de 2019 a 2021',
})
const c40 = corte('talla_baja_12m_desde_40', '40 sem', '40 semanas', 3)
const c3 = corte('talla_baja_12m_desde_3', '3 m EC', '3 meses', 4)

/** Lo que haría el servidor: un punto por cada visita de la que la petición trae datos, y ninguno de las demás. */
function historiaDe(variables: string[]): RiesgoPorCorte {
  const con = [{ c: c40, variable: 'peso_40', riesgo: 0.22, percentil: 78 }, { c: c3, variable: 'peso_3m', riesgo: 0.35, percentil: 89 }]
    .filter((x) => variables.includes(x.variable))
  return {
    paquete: 'p1', modelo: { version: 'a1b2c3d4e5', entrenado: '2026-11-19T10:00:00', corte_datos: '2026-06-30' },
    familias: [{ clave: 'talla_baja_12m', nombre: 'talla baja a los 12 meses', definicion: null, estado: 'en_prueba',
      cortes: [c40, { ...c3, motivo_sin_riesgo: variables.includes('peso_3m') ? null : 'no_asistio' }, { ...corte('talla_baja_12m_desde_6', '6 m EC', '6 meses', 5), motivo_sin_riesgo: 'no_asistio' }] },
    ],
    puntos: con.map((x) => ({ clave: x.c.clave, desenlace: 'talla baja a los 12 meses', momento: x.c.momento, momento_nombre: x.c.momento_nombre,
      orden: x.c.orden, riesgo: x.riesgo, percentil: x.percentil, fecha_visita: null, estado: 'en_prueba' as const, motivos: ['Peso al nacer (peso_nacer) = 1.240 g'] })),
  }
}

function api() {
  simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
    if (url === '/api/modelos/activo') return { cuerpo: { version: 'p1', fuente: 'simulado', activo: true, metricas: {}, modelos: {} } }
    if (url === '/api/inferencia/formulario') return { cuerpo: formulario }
    if (url === '/api/inferencia') {
      const variables = (JSON.parse(String(init?.body)).mediciones as { variable: string }[]).map((m) => m.variable)
      const historia = historiaDe(variables)
      const ultimo = historia.puntos[historia.puntos.length - 1]
      return { cuerpo: { paquete: 'p1', fuente: 'simulado', variables_ignoradas: [], alertas_dato: [], crecimiento: [], historia,
        riesgos: [{ sujeto: 'calculo', clave: ultimo.clave, desenlace: 'talla baja a los 12 meses', momento: ultimo.momento, riesgo: ultimo.riesgo,
          percentil: ultimo.percentil, motivos: [], fecha_visita: null }] } }
    }
    return { cuerpo: {} }
  })
}

const columnas = () => screen.queryAllByText(/^Calculado a /)

describe('calcular un niño: riesgo visita por visita', () => {
  it('con solo las 40 semanas hay una columna; al sumar los 3 meses, dos y el cambio', { timeout: 20_000 }, async () => {
    api()
    montar('/prediccion')
    await userEvent.type(await screen.findByLabelText('Fecha de nacimiento'), '2026-01-10')
    await userEvent.type(screen.getByLabelText('Semanas de gestación al nacer'), '30')
    await userEvent.click(screen.getByRole('tab', { name: /^40 semanas/ }))
    await userEvent.type(screen.getByLabelText('Peso a 40 sem (g)'), '2500')
    await userEvent.type(within(screen.getByRole('tabpanel', { name: /^40 semanas/ })).getByLabelText('Fecha de la visita'), '2026-02-20')
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Riesgo a los 12 meses, visita por visita' })).toBeInTheDocument()
    await waitFor(() => expect(columnas()).toHaveLength(1))
    expect(screen.getByText('Calculado a 40 semanas')).toBeInTheDocument()
    expect(screen.getByText('22 %')).toBeInTheDocument()
    expect(screen.queryByText(/Subió|Bajó/)).not.toBeInTheDocument()
    expect(screen.getByText('Aún no hay datos de la visita de 3 meses.')).toBeInTheDocument()
    // la tarjeta suelta de la última visita no repite lo que ya dice la sección
    expect(screen.queryByRole('heading', { level: 2, name: 'talla baja a los 12 meses' })).not.toBeInTheDocument()

    // el resultado se abrió solo: se vuelve a los datos para sumar la visita
    await userEvent.click(screen.getByRole('tab', { name: 'Datos del niño' }))
    await userEvent.click(screen.getByRole('tab', { name: /^3 meses/ }))
    await userEvent.type(screen.getByLabelText('Peso a 3 m (g)'), '5000')
    await userEvent.type(within(screen.getByRole('tabpanel', { name: /^3 meses/ })).getByLabelText('Fecha de la visita'), '2026-05-10')
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))

    await waitFor(() => expect(columnas()).toHaveLength(2))
    const ahora = screen.getByText('Calculado a 3 meses').closest('li')!
    expect(within(ahora).getByText('35 %')).toBeInTheDocument()
    expect(within(ahora).getByText('Subió 13 puntos con la visita de 3 meses')).toBeInTheDocument()
    expect(screen.queryByText('Aún no hay datos de la visita de 3 meses.')).not.toBeInTheDocument()
    expect(screen.getByText('Modelo en prueba: aún no se ha comprobado si, de cada 100 niños con un riesgo de 35 %, unos 35 tienen talla baja a los 12 meses.')).toBeInTheDocument()
  })
})
