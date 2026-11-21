// Vista clínica: el desenlace a 12 meses del grupo activo, su trayectoria, el riesgo por corte y los niños con más riesgo;
// la barra «Grupo activo» y los estados de carga, vacío y error.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FamiliaClinica, RespuestaClinica, Usuario } from '../api/tipos'
import { filasDeLaVista } from '../components/clinica/exportarVista'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const familias: FamiliaClinica[] = [
  { clave: 'talla_baja_12m', nombre: 'Talla baja a los 12 meses', estado: 'en_prueba', indicador: 'talla',
    definicion: 'Talla para la edad con z menor que −2 según la OMS, a los 12 meses de edad corregida.' },
  { clave: 'desarrollo_12m', nombre: 'Desarrollo psicomotor bajo a los 12 meses', estado: 'en_uso', indicador: null,
    definicion: 'Desarrollo psicomotor por debajo de lo esperado a los 12 meses de edad corregida.' },
]

const resumen = {
  corrida_id: 3, datos_al: '2026-06-30', familias, familia: 'talla_baja_12m', indicador: 'talla',
  grupo: { n: 312, n_total: 5000 },
  observado: {
    grupo: { casos: 41, con_dato: 223, sin_dato: 89, pct: 18.4, pct_sin_dato: 28.5 },
    poblacion: { casos: 412, con_dato: 3680, sin_dato: 800, pct: 11.2, pct_sin_dato: 17.9 },
  },
  trayectoria: {
    indicador: 'talla', unidad: 'puntaje z de la OMS',
    etapas: [
      { etapa: '40 sem', grupo: { n: 298, p25: -1.4, mediana: -1, p75: -0.6 }, poblacion: { n: 4000, mediana: -0.2 } },
      { etapa: '3 m EC', grupo: { n: 271, p25: -1.9, mediana: -1.5, p75: -1.1 }, poblacion: { n: 3900, mediana: -0.7 } },
      { etapa: '6 m EC', grupo: null, poblacion: { n: 3500, mediana: -0.8 } },
      { etapa: '12 m EC', grupo: { n: 223, p25: -1.6, mediana: -1.2, p75: -0.8 }, poblacion: { n: 3680, mediana: -0.5 } },
    ],
  },
  riesgo: [
    { momento: '40 sem', clave: 'talla_baja_12m_desde_40sem', estado: 'en_prueba', calculados: 290, en_alerta: 58, pct_en_alerta: 20 },
    { momento: '3 m EC', clave: 'talla_baja_12m_desde_3m', estado: 'en_prueba', calculados: 268, en_alerta: 61, pct_en_alerta: 22.8 },
  ],
  riesgo_con_modelo: true,
  alerta_percentil: 90,
  ninos: [
    { sujeto: 'S-01633', semanas: null, momento: '3 m EC', riesgo: 0.61, percentil: 97, ultima_z: -1.9 },
    { sujeto: 'S-02210', semanas: 30.5, momento: '3 m EC', riesgo: 0.57, percentil: 95, ultima_z: -2.3 },
  ],
} satisfies RespuestaClinica

const desarrollo = {
  ...resumen, familia: 'desarrollo_12m', indicador: null,
  observado: { grupo: { casos: 20, con_dato: 200, sin_dato: 112 }, poblacion: { casos: 300, con_dato: 3000, sin_dato: 1500 } },
  riesgo: [{ momento: '40 sem', clave: 'desarrollo_12m', estado: 'en_uso', calculados: 300, en_alerta: 30 }],
}

const facetas = {
  n: 312, minimo: 20,
  facetas: {
    sexo: { etiqueta: 'Sexo', tipo: 'lista', cuando: 'primera', opciones: [
      { valor: 'M', etiqueta: 'Masculino', n: 150, texto: '150' }, { valor: 'F', etiqueta: 'Femenino', n: 162, texto: '162' }] },
  },
  etapas: [], disponibles: [],
}

function Ubicacion() {
  return <output data-testid="ubicacion">{decodeURIComponent(useLocation().search)}</output>
}

type Respuesta = unknown
function api(rol: Usuario['rol'], clinica: (cuerpo: Record<string, unknown>) => Respuesta | { estado: number; cuerpo: unknown } = () => resumen) {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/clinica/resumen') {
      const r = clinica(JSON.parse(String(init?.body)))
      return typeof r === 'object' && r !== null && 'estado' in r && 'cuerpo' in r ? (r as { estado: number; cuerpo: unknown }) : { cuerpo: r }
    }
    if (url === '/api/exploracion/facetas') return { cuerpo: facetas }
    if (url === '/api/muestras') return rol === 'visualizador'
      ? { estado: 403, cuerpo: { detail: 'Sin permiso' } }
      : { cuerpo: [{ id: 7, titulo: 'Muy prematuros 2019–2023', n_ninos: 312, definicion: { version: 2, y: [{ variable: 'sexo', tipo: 'lista', op: 'en', valores: ['F'] }] } }] }
    return { cuerpo: [] }
  })
}

const cuerpos = (llamadas: { url: string; init?: RequestInit }[]) =>
  llamadas.filter((l) => l.url === '/api/clinica/resumen').map((l) => JSON.parse(String(l.init?.body)) as Record<string, unknown>)

describe('vista clínica', () => {
  it('la dirección «/» abre la vista clínica con el desenlace de talla baja elegido y su definición', async () => {
    api('experto')
    montar('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Vista clínica' })).toBeInTheDocument()
    const pestana = await screen.findByRole('tab', { name: 'Talla baja a los 12 meses' })
    expect(pestana).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Desarrollo psicomotor bajo a los 12 meses' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText(familias[0].definicion)).toBeInTheDocument()
    // la pestaña controla todo el contenido del desenlace, no solo la definición
    const panel = screen.getByRole('tabpanel', { name: 'Talla baja a los 12 meses' })
    expect(within(panel).getByRole('heading', { name: 'Qué les pasó a los 12 meses' })).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: 'Niños del grupo con más riesgo' })).toBeInTheDocument()
  })

  it('el aviso «Apoyo a la decisión» sale una sola vez en la pantalla (el pie)', async () => {
    api('experto')
    montar('/')
    await screen.findByRole('heading', { name: 'Riesgo estimado de talla baja a los 12 meses' })
    expect(screen.getAllByText(/Apoyo a la decisión/)).toHaveLength(1)
  })

  it('«Qué les pasó a los 12 meses»: porcentaje observado con su numerador, denominador y sin dato; la población, como referencia', async () => {
    api('experto')
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Qué les pasó a los 12 meses' })).closest('section')!
    expect(within(panel).getByText('18,4 %')).toBeInTheDocument()
    expect(within(panel).getByText(/41 de 223 niños con dato a los 12 meses/)).toBeInTheDocument()
    expect(within(panel).getByText(/89 sin dato/)).toBeInTheDocument()
    expect(within(panel).getByText(/Toda la población \(referencia\)/)).toBeInTheDocument()
    expect(within(panel).getByText('11,2 %')).toBeInTheDocument()
    expect(within(panel).getByText(/412 de 3\.680/)).toBeInTheDocument()
  })

  it('si el grupo son todos los niños no repite la población como referencia (ni en la cifra ni en la gráfica)', async () => {
    api('experto', () => ({ ...resumen, grupo: { n: 5000, n_total: 5000 }, observado: { grupo: resumen.observado.poblacion, poblacion: resumen.observado.poblacion } }))
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Qué les pasó a los 12 meses' })).closest('section')!
    expect(within(panel).getByText('11,2 %')).toBeInTheDocument()
    // una línea corta dice que la referencia es el mismo grupo, en vez de repetir la cifra
    expect(within(panel).getByText('Referencia: el grupo es toda la población.')).toBeInTheDocument()
    const grafica = screen.getByRole('heading', { name: 'Crecimiento: talla para la edad' }).closest('section')!
    expect(within(grafica).queryByText('Toda la población')).toBeNull()
    expect(within(grafica).getByText('Mediana del grupo')).toBeInTheDocument()
    expect(within(grafica).getByRole('figure').getAttribute('aria-label')).not.toMatch(/población/)
    const barra = screen.getByRole('region', { name: 'Grupo activo' })
    expect(within(barra).getByText('5.000 niños elegibles')).toBeInTheDocument()
    expect(within(barra).queryByText(/elegibles de/)).toBeNull()
  })

  it('sin niños con dato a los 12 meses no hay cifra observada del grupo y se explica', async () => {
    api('experto', () => ({ ...resumen, observado: { grupo: null, poblacion: resumen.observado.poblacion } }))
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Qué les pasó a los 12 meses' })).closest('section')!
    expect(within(panel).getByText('Ningún niño del grupo elegido tiene dato a los 12 meses.')).toBeInTheDocument()
    expect(within(panel).getByText(/Toda la población \(referencia\)/)).toBeInTheDocument()
  })

  it('una visita con menos de 20 niños con dato tiene su mediana y su cuenta, pero no la mitad central', async () => {
    const etapas = resumen.trayectoria.etapas.map((e) => e.etapa === '3 m EC' ? { ...e, grupo: { n: 3, p25: null, mediana: -1.5, p75: null } } : e)
    api('experto', () => ({ ...resumen, trayectoria: { ...resumen.trayectoria, etapas } }))
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Crecimiento: talla para la edad' })).closest('section')!
    expect(within(panel).getByText('Sin mitad central: pide al menos 20 niños con dato en la visita.')).toBeInTheDocument()
    expect(within(panel).getByRole('figure', { name: /3 m EC\. Mediana del grupo -1,5, 3 niños con dato, sin mitad central/ })).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Ver como tabla' }))
    const fila = within(within(panel).getByRole('table')).getByRole('row', { name: /3 m EC/ })
    expect(fila).toHaveTextContent('3 m EC3-1,5sin cifra')
    // la vista de tabla se recuerda: se deja como estaba
    await userEvent.click(within(panel).getByRole('button', { name: 'Ver como tabla' }))
  })

  it('si ninguna visita llega a 20 niños, ni la leyenda ni la descripción prometen la mitad central', async () => {
    const etapas = resumen.trayectoria.etapas.map((e) => e.grupo ? { ...e, grupo: { n: 6, p25: null, mediana: e.grupo.mediana, p75: null } } : e)
    api('experto', () => ({ ...resumen, trayectoria: { ...resumen.trayectoria, etapas } }))
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Crecimiento: talla para la edad' })).closest('section')!
    expect(within(panel).getByText('Sin mitad central: pide al menos 20 niños con dato en la visita.')).toBeInTheDocument()
    expect(within(panel).queryByText('Mitad central del grupo')).not.toBeInTheDocument()
    expect(within(panel).getByText(/^Mediana del grupo por visita, frente a la mediana de toda la población/)).toBeInTheDocument()
  })

  it('sin visitas con menos de 20 niños no hay nota de la mitad central', async () => {
    api('experto')
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Crecimiento: talla para la edad' })).closest('section')!
    expect(within(panel).queryByText(/Sin mitad central:/)).not.toBeInTheDocument()
  })

  it('la trayectoria dice qué muestra, trae su leyenda y una vista de tabla con los niños con dato de cada visita', async () => {
    api('experto')
    montar('/')
    // «Crecimiento» y la medida en el título: en el desenlace de desarrollo también se ve que la gráfica es de talla
    const titulo = await screen.findByRole('heading', { name: 'Crecimiento: talla para la edad' })
    const panel = titulo.closest('section')!
    expect(within(panel).getByText('Mediana del grupo')).toBeInTheDocument()
    expect(within(panel).getByText('Mitad central del grupo')).toBeInTheDocument()
    expect(within(panel).getByText('Toda la población')).toBeInTheDocument()
    expect(within(panel).getByText(/Umbral de talla baja/)).toBeInTheDocument()
    // el umbral nombra la referencia y explica «DE» a pedido (asesor: referencia OMS, significado de «DE» y umbral z < −2)
    await userEvent.click(within(panel).getByRole('button', { name: /^−2/ }))
    expect(within(panel).getByRole('tooltip')).toHaveTextContent(/desviación estándar/i)
    expect(within(panel).getByRole('button', { name: /^OMS/ })).toBeInTheDocument()
    expect(within(panel).getByRole('figure', { name: /puntaje z de la OMS/ })).toBeInTheDocument()
    expect(within(panel).getByText(/Grupo activo: 312 niños de 5\.000/)).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Ver como tabla' }))
    const tabla = within(panel).getByRole('table')
    for (const t of ['Visita', 'Niños con dato', 'Mediana del grupo', 'Mitad central del grupo', 'Mediana de la población']) {
      expect(within(tabla).getByRole('columnheader', { name: t })).toBeInTheDocument()
    }
    expect(within(tabla).getByText('298')).toBeInTheDocument()
    expect(within(tabla).getByText('271')).toBeInTheDocument()
    expect(within(tabla).getByText('223')).toBeInTheDocument()
    // la visita sin dato del grupo se ve vacía, no inventada
    const sexta = within(tabla).getByRole('row', { name: /6 m EC/ })
    expect(within(sexta).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('el riesgo estimado nombra el desenlace y dice, por visita de cálculo, cuántos de los niños con riesgo calculado están en alerta; «En prueba» una vez', async () => {
    api('experto')
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Riesgo estimado de talla baja a los 12 meses' })).closest('section')!
    expect(within(panel).getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'Calculado a las 40 semanas: 58 de 290 niños en alerta (20,0 %)',
      'Calculado a los 3 meses: 61 de 268 niños en alerta (22,8 %)',
    ])
    // el denominador se explica: solo los niños que siguen en seguimiento a esa visita tienen riesgo calculado
    expect(within(panel).getByText(/siguen en seguimiento/)).toBeInTheDocument()
    expect(within(panel).getByText(/En alerta: riesgo entre el 10 % más alto de los niños más recientes con desenlace conocido, con quienes se calibró el modelo\. Por eso, en un grupo pueden ser más o menos del 10 %\./)).toBeInTheDocument()
    expect(within(panel).getAllByText(/En prueba/)).toHaveLength(1)
  })

  it('con cortes en prueba y en uso, «En prueba» sale una vez y dice cuál no lo está', async () => {
    api('experto', () => ({ ...resumen, riesgo: [...resumen.riesgo,
      { momento: '6 m EC', clave: 'talla_baja_12m', estado: 'en_uso', calculados: 120, en_alerta: 12, pct_en_alerta: 10 }] }))
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Riesgo estimado de talla baja a los 12 meses' })).closest('section')!
    expect(within(panel).getAllByText(/En prueba/)).toHaveLength(1)
    expect(within(panel).getByText('En prueba, salvo a los 6 meses')).toBeInTheDocument()
  })

  it('un desenlace sin modelo en el paquete activo lo dice en lugar de mostrar riesgo', async () => {
    api('experto', () => ({ ...resumen, riesgo: [], riesgo_con_modelo: false }))
    montar('/')
    expect(await screen.findByText('El paquete de modelos activo aún no calcula este desenlace: no hay riesgo estimado del grupo.')).toBeInTheDocument()
  })

  it('con modelo pero sin niños del grupo en seguimiento no dice «sin modelo»: explica por qué no hay riesgo', async () => {
    api('experto', () => ({ ...resumen, riesgo: [], riesgo_con_modelo: true }))
    montar('/')
    expect(await screen.findByText(/Ningún niño del grupo tiene riesgo estimado ahora: se calcula solo para los niños que siguen en seguimiento/)).toBeInTheDocument()
    expect(screen.queryByText(/aún no calcula este desenlace/)).not.toBeInTheDocument()
  })

  it('los niños con más riesgo enlazan a su ficha y dicen su riesgo estimado en porcentaje, con la visita del cálculo', async () => {
    api('experto')
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Niños del grupo con más riesgo' })).closest('section')!
    expect(within(panel).getByRole('link', { name: 'S-01633' })).toHaveAttribute('href', '/ninos/S-01633')
    expect(within(panel).getByRole('link', { name: 'S-02210' })).toHaveAttribute('href', '/ninos/S-02210')
    expect(within(panel).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Niño', 'Edad gestacional', 'Riesgo estimado', 'Última talla (z)'])
    const primero = within(panel).getByRole('row', { name: /S-01633/ })
    expect(within(primero).getAllByRole('cell')[2]).toHaveTextContent('61,0 % · 3 m EC')
    expect(within(primero).getByText('sin dato')).toBeInTheDocument()
    const segundo = within(panel).getByRole('row', { name: /S-02210/ })
    expect(within(segundo).getAllByRole('cell')[2]).toHaveTextContent('57,0 % · 3 m EC')
    expect(within(segundo).getByText('30,5 sem')).toBeInTheDocument()
    expect(within(segundo).getByText('-2,3')).toBeInTheDocument()
  })

  it('con el riesgo saturado el porcentaje no ordena: el lugar entre los niños de su visita queda al pasar el cursor', async () => {
    api('experto', () => ({ ...resumen, ninos: [
      { sujeto: 'S-1', semanas: 30, momento: '3 m EC', riesgo: 1, percentil: 98.4, ultima_z: -2.5 },
      { sujeto: 'S-2', semanas: 39, momento: '40 sem', riesgo: 1, percentil: 98, ultima_z: -1.2 },
      { sujeto: 'S-3', semanas: 32, momento: '40 sem', riesgo: 1, percentil: 98, ultima_z: -0.8 },
      { sujeto: 'S-4', semanas: 29, momento: '3 m EC', riesgo: 1, percentil: 96.5, ultima_z: -2.4 },
      { sujeto: 'S-5', semanas: 35, momento: '6 m EC', riesgo: 1, percentil: 96, ultima_z: -2.9 },
    ] }))
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Niños del grupo con más riesgo' })).closest('section')!
    const celda = (s: string) => within(within(panel).getByRole('row', { name: new RegExp(s) })).getAllByRole('cell')[2]
    expect(celda('S-1')).toHaveTextContent('más de 99,9 % · 3 m EC')
    expect(celda('S-1')).toHaveAttribute('title', '1.º entre los 268 niños del grupo con riesgo calculado a los 3 meses.')
    // los empates comparten lugar y cada visita cuenta por separado
    expect(celda('S-2')).toHaveAttribute('title', '1.º entre los 290 niños del grupo con riesgo calculado a las 40 semanas.')
    expect(celda('S-3')).toHaveAttribute('title', '1.º entre los 290 niños del grupo con riesgo calculado a las 40 semanas.')
    expect(celda('S-4')).toHaveAttribute('title', '2.º entre los 268 niños del grupo con riesgo calculado a los 3 meses.')
    // una visita sin fila de riesgo (menos de 5 calculados) no inventa el denominador
    expect(celda('S-5')).toHaveAttribute('title', '1.º entre los niños del grupo con riesgo calculado a los 6 meses.')
  })

  it('con todos los niños, «Ver los niños en alerta» lleva a la lista de Niños con ese desenlace y ese umbral', async () => {
    api('experto', () => ({ ...resumen, grupo: { n: 5000, n_total: 5000 } }))
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Niños del grupo con más riesgo' })).closest('section')!
    // los 61 en alerta de la visita de cálculo más reciente (3 meses)
    expect(within(panel).getByRole('link', { name: 'Ver los 61 niños en alerta a los 3 meses' }))
      .toHaveAttribute('href', '/ninos?desenlace=talla_baja_12m_desde_3m&percentil_min=90')
  })

  it('con un grupo filtrado no enlaza a la lista de Niños, que no filtra por grupo', async () => {
    api('experto')
    montar('/')
    const panel = (await screen.findByRole('heading', { name: 'Niños del grupo con más riesgo' })).closest('section')!
    expect(within(panel).queryByRole('link', { name: /Ver los .* niños en alerta/ })).toBeNull()
  })

  it('para quien no ve niños individuales (ninos nulo) la tabla no aparece', async () => {
    api('visualizador', () => ({ ...resumen, ninos: null }))
    montar('/')
    await screen.findByRole('heading', { name: 'Qué les pasó a los 12 meses' })
    expect(screen.queryByRole('heading', { name: 'Niños del grupo con más riesgo' })).toBeNull()
  })

  it('cambiar de desenlace lo pide a la API y queda en la dirección, junto con el grupo', async () => {
    const llamadas = api('experto', (c) => (c.familia === 'desarrollo_12m' ? desarrollo : resumen))
    montar('/?f=sexo|lista|F', <Ubicacion />)
    await userEvent.click(await screen.findByRole('tab', { name: 'Desarrollo psicomotor bajo a los 12 meses' }))
    await waitFor(() => expect(cuerpos(llamadas).some((c) => c.familia === 'desarrollo_12m')).toBe(true))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Desarrollo psicomotor bajo a los 12 meses' })).toHaveAttribute('aria-selected', 'true'))
    expect(await screen.findByText(/20 de 200 niños con dato/)).toBeInTheDocument()
    const ubicacion = screen.getByTestId('ubicacion').textContent ?? ''
    expect(ubicacion).toContain('familia=desarrollo_12m')
    expect(ubicacion).toContain('f=sexo|lista|F')
    const ultimo = cuerpos(llamadas).at(-1)!
    expect(ultimo).toMatchObject({ familia: 'desarrollo_12m', muestra: { version: 2, y: [{ variable: 'sexo', valores: ['F'] }] } })
  })

  it('si la API abre con otro desenlace, la vista elige talla baja cuando existe', async () => {
    const llamadas = api('experto', (c) => (c.familia === 'talla_baja_12m' ? resumen : desarrollo))
    montar('/')
    await waitFor(() => expect(cuerpos(llamadas).some((c) => c.familia === 'talla_baja_12m')).toBe(true))
    expect(await screen.findByText(/41 de 223 niños con dato/)).toBeInTheDocument()
  })

  it('con menos de 20 niños no muestra cifras y lo explica', async () => {
    api('experto', () => ({ insuficiente: true, minimo: 20, ninos: null }))
    montar('/')
    expect(await screen.findByText(/Con menos de 20 niños no se muestran cifras/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Qué les pasó a los 12 meses' })).toBeNull()
  })

  it('una falla de red dice qué pasó, ofrece reintentar y conserva el grupo de la dirección', async () => {
    let falla = true
    const llamadas = simularApi((url, init) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url === '/api/clinica/resumen') {
        if (falla) throw new TypeError('Failed to fetch')
        return { cuerpo: resumen }
      }
      if (url === '/api/exploracion/facetas') return { cuerpo: facetas }
      void init
      return { cuerpo: [] }
    })
    montar('/?f=sexo|lista|F', <Ubicacion />)
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent(/No se pudo conectar con el servidor/)
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=sexo|lista|F')
    falla = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Qué les pasó a los 12 meses' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    const enviados = cuerpos(llamadas)
    expect(enviados.length).toBeGreaterThanOrEqual(2)
    expect(enviados.at(-1)).toMatchObject({ muestra: { y: [{ variable: 'sexo', valores: ['F'] }] } })
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=sexo|lista|F')
  })

  it('enlaza a Comparar grupos y a Explorar más variables conservando el grupo', async () => {
    api('experto')
    montar('/?f=sexo|lista|F')
    await screen.findByRole('heading', { name: 'Qué les pasó a los 12 meses' })
    expect(screen.getByRole('link', { name: 'Comparar con otro grupo' })).toHaveAttribute('href', '/comparar?f=sexo%7Clista%7CF')
    expect(screen.getByRole('link', { name: 'Explorar más variables' })).toHaveAttribute('href', '/explorar?f=sexo%7Clista%7CF')
  })
})

describe('vista clínica: exportar', () => {
  it('las filas del CSV traen el grupo, lo observado, el riesgo por visita y el crecimiento, cada cifra con su denominador', () => {
    const filas = filasDeLaVista(resumen)
    const de = (seccion: string) => filas.filter((f) => f['Sección'] === seccion).map((f) => `${f.Dato}: ${f.Valor}`)
    expect(de('Grupo')).toEqual(['Niños elegibles del grupo: 312', 'Niños elegibles en total: 5000', 'Desenlace: Talla baja a los 12 meses', 'Datos al: 2026-06-30'])
    expect(de('Observado a los 12 meses')).toEqual([
      'Grupo: % con el desenlace: 18,4', 'Grupo: casos: 41', 'Grupo: niños con dato: 223', 'Grupo: niños sin dato: 89',
      'Toda la población: % con el desenlace: 11,2', 'Toda la población: casos: 412', 'Toda la población: niños con dato: 3680'])
    expect(de('Riesgo estimado')).toEqual([
      'Calculado a las 40 semanas: niños en alerta: 58', 'Calculado a las 40 semanas: niños con riesgo calculado: 290', 'Calculado a las 40 semanas: % en alerta: 20',
      'Calculado a los 3 meses: niños en alerta: 61', 'Calculado a los 3 meses: niños con riesgo calculado: 268', 'Calculado a los 3 meses: % en alerta: 22,8'])
    expect(de('Crecimiento: talla para la edad (puntaje z)')).toContain('40 sem: mediana del grupo: -1')
    expect(de('Crecimiento: talla para la edad (puntaje z)')).toContain('40 sem: niños del grupo con dato: 298')
    // una visita sin dato del grupo no inventa una mediana
    expect(de('Crecimiento: talla para la edad (puntaje z)').some((x) => x.startsWith('6 m EC: mediana del grupo'))).toBe(false)
    // ningún niño individual sale en el archivo
    expect(JSON.stringify(filas)).not.toContain('S-01633')
  })

  it('el botón «Exportar» está junto a los enlaces de la página', async () => {
    api('experto')
    montar('/')
    await screen.findByRole('heading', { name: 'Qué les pasó a los 12 meses' })
    expect(screen.getByRole('button', { name: 'Exportar' })).toHaveAttribute('title', 'Descargar las cifras de esta vista (CSV)')
  })
})

describe('grupo activo', () => {
  it('sin filtro dice «Todos los niños» con los elegibles, el total y cuántos tienen el dato del desenlace elegido', async () => {
    api('experto')
    montar('/')
    const barra = await screen.findByRole('region', { name: 'Grupo activo' })
    expect(await within(barra).findByText('312 niños elegibles de 5.000')).toBeInTheDocument()
    expect(await within(barra).findByText('223 con el dato de «Talla baja a los 12 meses»')).toBeInTheDocument()
    expect(within(barra).getByText('Todos los niños')).toBeInTheDocument()
    // el nombre ya dice que no hay filtros: no se repite en otra frase
    expect(within(barra).queryByText(/Sin filtros/)).toBeNull()
  })

  it('con un grupo guardado muestra su nombre y los criterios legibles', async () => {
    api('experto')
    montar('/?guardada=7&f=sexo|lista|F')
    const barra = await screen.findByRole('region', { name: 'Grupo activo' })
    expect(await within(barra).findByText('Muy prematuros 2019–2023')).toBeInTheDocument()
    expect(within(barra).getByText(/Sexo: Femenino/)).toBeInTheDocument()
  })

  it('sin nombre guardado arma el nombre con los criterios, y el tiempo también se describe', async () => {
    api('visualizador')
    montar('/?f=sexo|lista|F&t=fecha_nacimiento|periodo|2019|2023')
    const barra = await screen.findByRole('region', { name: 'Grupo activo' })
    expect(await within(barra).findByText(/Sexo: Femenino/)).toBeInTheDocument()
    expect(within(barra).getByText(/Período: 2019 a 2023/)).toBeInTheDocument()
    expect(within(barra).getByRole('heading', { name: 'Grupo con 2 criterios' })).toBeInTheDocument()
  })

  it('«Cambiar grupo» abre el cajón de filtros y al elegir algo la barra y las cifras se actualizan, sin perder la dirección', async () => {
    const llamadas = api('experto')
    montar('/', <Ubicacion />)
    const barra = await screen.findByRole('region', { name: 'Grupo activo' })
    const boton = await within(barra).findByRole('button', { name: 'Cambiar grupo' })
    await userEvent.click(boton)
    // el panel es un cajón lateral modal, fuera de la barra (su detalle está en panel-grupo.test.tsx)
    const cajon = await screen.findByRole('dialog', { name: 'Elija el grupo' })
    fireEvent.click(await within(cajon).findByRole('checkbox', { name: /Masculino/ }))
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=sexo|lista|M'))
    expect(await within(barra).findByText(/Sexo: Masculino/)).toBeInTheDocument()
    await waitFor(() => expect(cuerpos(llamadas).at(-1)).toMatchObject({ muestra: { y: [{ variable: 'sexo', valores: ['M'] }] } }))
    await userEvent.click(within(cajon).getByRole('button', { name: 'Listo' }))
    expect(screen.queryByRole('dialog', { name: 'Elija el grupo' })).not.toBeInTheDocument()
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=sexo|lista|M')
  })

  it('también está en Explorar, con los números de ese resumen', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url === '/api/exploracion/resumen') return { cuerpo: { insuficiente: true, minimo: 20, ninos: null } }
      if (url === '/api/exploracion/facetas') return { cuerpo: facetas }
      return { cuerpo: [] }
    })
    montar('/explorar?f=sexo|lista|F')
    const barra = await screen.findByRole('region', { name: 'Grupo activo' })
    expect(await within(barra).findByText(/Sexo: Femenino/)).toBeInTheDocument()
  })
})
