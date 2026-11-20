// Comparar grupos: dos grupos A y B (cada uno con su nombre, criterios, período y tamaño), una pestaña por pregunta
// (¿crecen distinto?, ¿les pasa algo distinto?, ¿faltan datos distintos?), el intercambio de A y B y la falla de red.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesenlaceComparado, GruposClinicoOk, RespuestaGruposClinico } from '../api/comparar'
import type { Usuario } from '../api/tipos'
import { Veredicto } from '../components/comparar/comun'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const RUTA = '/api/analitica/comparar/grupos/clinico'

const talla: DesenlaceComparado = {
  clave: 'talla_baja_12m', nombre: 'Talla baja a los 12 meses', estado: 'en_prueba', indicador: 'talla',
  definicion: 'Talla para la edad con puntaje z menor que −2 frente a la referencia de la OMS, medido a los 12 m EC.',
  a: { casos: 52, con_dato: 397, sin_dato: 101, pct: 13.1, pct_sin_dato: 20.3 }, b: { casos: 41, con_dato: 223, sin_dato: 89, pct: 18.4, pct_sin_dato: 28.5 },
  dif: { valor: 5.3, ic_bajo: -0.8, ic_alto: 11.4, clara: false },
  riesgo_con_modelo: true,
  riesgo: [
    { momento: '40 sem', momento_nombre: '40 semanas', clave: 'talla_baja_12m_desde_40', estado: 'en_prueba',
      a: { calculados: 400, en_alerta: 40, pct_en_alerta: 10 }, b: { calculados: 250, en_alerta: 30, pct_en_alerta: 12 } },
    { momento: '3 m EC', momento_nombre: '3 meses', clave: 'talla_baja_12m_desde_3', estado: 'en_prueba',
      a: { calculados: 380, en_alerta: 38, pct_en_alerta: 10 }, b: null },
  ],
}

const desarrollo: DesenlaceComparado = {
  clave: 'desarrollo_12m', nombre: 'Desarrollo psicomotor bajo a los 12 meses', estado: 'en_uso', indicador: null,
  definicion: 'Desarrollo psicomotor entre el 10 % más bajo de los niños con que se entrenó el modelo.',
  a: { casos: 20, con_dato: 200, sin_dato: 298, pct: 10, pct_sin_dato: 59.8 }, b: null,
  dif: { valor: null, ic_bajo: null, ic_alto: null, clara: null },
  riesgo_con_modelo: true,
  riesgo: [{ momento: '40 sem', momento_nombre: '40 semanas', clave: 'desarrollo_12m', estado: 'en_uso',
    a: { calculados: 450, en_alerta: 45, pct_en_alerta: 10 }, b: { calculados: 280, en_alerta: 28, pct_en_alerta: 10 } }],
}

const visita = (etapa: string, a: [number, number] | null, b: [number, number] | null) => ({
  etapa, etapa_nombre: etapa,
  a: a && { n: a[0], mediana: a[1], sin_dato: 498 - a[0], pct_sin_dato: Math.round((1000 * (498 - a[0])) / 498) / 10 },
  b: b && { n: b[0], mediana: b[1], sin_dato: 312 - b[0], pct_sin_dato: Math.round((1000 * (312 - b[0])) / 312) / 10 },
})

const ok: GruposClinicoOk = {
  estado: 'ok', corrida_id: 3, minimo_ninos: 20, alerta_percentil: 90,
  a: { nombre: 'Grupo A', n: 498, n_total: 5000 }, b: { nombre: 'Grupo B', n: 312, n_total: 5000 },
  desenlaces: [talla, desarrollo],
  trayectoria: {
    indicador: 'talla', nombre: 'Talla para la edad', unidad: 'puntaje z (desviaciones estándar)', referencia: 'OMS', umbral: -2,
    etapas: [
      visita('40 sem', [472, -2.2], [298, -2.6]), visita('3 m EC', [450, -1.9], [271, -2.3]),
      visita('6 m EC', [431, -1.6], null), visita('12 m EC', [397, -1.3], [223, -1.6]),
    ],
  },
}

const insuficiente: RespuestaGruposClinico = {
  estado: 'insuficiente', corrida_id: 3, minimo_ninos: 20, mensaje: 'Cada grupo necesita al menos 20 niños para compararse.',
  a: { nombre: 'Grupo A', n: 498 }, b: { nombre: 'Grupo B', n: null },
}

const facetas = {
  n: 498, minimo: 20,
  facetas: {
    sexo: { etiqueta: 'Sexo', tipo: 'lista', cuando: 'primera', opciones: [
      { valor: 'M', etiqueta: 'Masculino', n: 250, texto: '250' }, { valor: 'F', etiqueta: 'Femenino', n: 248, texto: '248' }] },
  },
  etapas: [], disponibles: [],
  tiempo: { campos: [{ valor: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento' }], defecto: 'fecha_nacimiento',
    hay_fecha_nacimiento: true, desde: 2015, hasta: 2023, corte: '2026-06-30' },
}

type Salida = RespuestaGruposClinico | { estado: number; cuerpo: unknown }
function api(rol: Usuario['rol'] = 'experto', comparar: (cuerpo: Record<string, unknown>) => Salida = () => ok) {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === RUTA) {
      const r = comparar(JSON.parse(String(init?.body)))
      return 'cuerpo' in r ? { estado: r.estado as number, cuerpo: r.cuerpo } : { cuerpo: r }
    }
    if (url === '/api/exploracion/facetas') return { cuerpo: facetas }
    if (url === '/api/muestras') return rol === 'visualizador'
      ? { estado: 403, cuerpo: { detail: 'Sin permiso' } }
      : { cuerpo: [{ id: 7, titulo: 'Muy prematuros 2019–2023', n_ninos: 312, definicion: { version: 2, y: [{ variable: 'sexo', tipo: 'lista', op: 'en', valores: ['M'] }] } }] }
    return { cuerpo: [] }
  })
}

const cuerpos = (llamadas: { url: string; init?: RequestInit }[]) =>
  llamadas.filter((l) => l.url === RUTA).map((l) => JSON.parse(String(l.init?.body)) as { a: Record<string, unknown>; b: Record<string, unknown> })

function Ubicacion() {
  return <output data-testid="ubicacion">{decodeURIComponent(useLocation().search)}</output>
}

const ladoA = () => screen.getByRole('region', { name: 'Grupo A' })
const ladoB = () => screen.getByRole('region', { name: 'Grupo B' })

/** La ficha del dato (S6: variable, unidad, momento, población y observaciones válidas) es un pie visible de cada gráfica,
 *  no un desplegable: se comprueba que cada campo está a la vista. */
function fichaVisible(panel: HTMLElement) {
  for (const campo of ['Variable', 'Unidad', 'Momento', 'Población', 'Observaciones válidas']) {
    expect(within(panel).getByText(new RegExp(`^${campo}:`))).toBeVisible()
  }
}

async function compararConTodos(ruta = '/comparar?f=sexo|lista|F') {
  const llamadas = api()
  montar(ruta, <Ubicacion />)
  await userEvent.click(await screen.findByRole('button', { name: 'Comparar con todos los niños' }))
  await screen.findByRole('tab', { name: '¿Crecen distinto?' })
  return llamadas
}

describe('comparar grupos', () => {
  it('abre con el grupo activo como A y B sin elegir: no pide nada hasta que se elija', async () => {
    const llamadas = api()
    montar('/comparar?f=sexo|lista|F&t=fecha_nacimiento|periodo|2015|2018')
    expect(await screen.findByRole('heading', { level: 1, name: 'Comparar grupos' })).toBeInTheDocument()
    expect(await within(ladoA()).findByText(/Sexo: Femenino/)).toBeInTheDocument()
    expect(within(ladoA()).getByText(/Período: 2015 a 2018/)).toBeInTheDocument()
    expect(within(ladoA()).getByText('498 niños elegibles')).toBeInTheDocument()   // S8: el tamaño, antes de comparar
    expect(within(ladoB()).getByText('Sin elegir')).toBeInTheDocument()
    expect(screen.getByText(/Elija el grupo B/)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '¿Crecen distinto?' })).toBeNull()
    expect(cuerpos(llamadas)).toHaveLength(0)
  })

  it('si el grupo A ya son todos los niños no ofrece compararlo con todos (A = B): pide elegir B y abre su panel', async () => {
    const llamadas = api()
    montar('/comparar')
    expect(await screen.findByText(/El grupo A ya son todos los niños/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comparar con todos los niños' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Elegir los criterios del grupo B' }))
    expect(await within(ladoB()).findByRole('checkbox', { name: /Masculino/ })).toBeInTheDocument()
    expect(cuerpos(llamadas)).toHaveLength(0)
  })

  it('si A y B quedan con los mismos criterios no compara: lo dice y no pide nada', async () => {
    const llamadas = await compararConTodos()
    const antes = cuerpos(llamadas).length
    await userEvent.click(screen.getByRole('button', { name: 'Editar grupo A' }))
    await userEvent.click(await within(ladoA()).findByRole('checkbox', { name: /Femenino/ }))   // A se queda sin filtros, como B
    expect(await screen.findByText(/Los grupos A y B tienen los mismos criterios/)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '¿Crecen distinto?' })).toBeNull()
    expect(cuerpos(llamadas)).toHaveLength(antes)
  })

  it('cada lado se identifica por su nombre, sus criterios, su período y su tamaño, y conserva los suyos', async () => {
    const llamadas = await compararConTodos('/comparar?f=sexo|lista|F&t=fecha_nacimiento|periodo|2015|2018')
    expect(await within(ladoA()).findByText('498 niños elegibles de 5.000')).toBeInTheDocument()
    expect(within(ladoA()).getByText(/Sexo: Femenino/)).toBeInTheDocument()
    expect(within(ladoA()).getByText(/Período: 2015 a 2018/)).toBeInTheDocument()
    expect(within(ladoB()).getByText('Todos los niños')).toBeInTheDocument()
    expect(within(ladoB()).getByText('Sin filtros: están todos los niños del programa.')).toBeInTheDocument()
    expect(within(ladoB()).getByText(/Período: todo el período/)).toBeInTheDocument()
    expect(within(ladoB()).getByText('312 niños elegibles de 5.000')).toBeInTheDocument()
    const [c] = cuerpos(llamadas)
    expect(c.a).toMatchObject({ muestra: { version: 2, y: [{ variable: 'sexo', valores: ['F'] }], tiempo: { desde: '2015', hasta: '2018' } } })
    expect(c.b).toMatchObject({ muestra: { version: 2, y: [] } })
  })

  it('«¿Crecen distinto?»: talla baja a los 12 meses de cada lado con «x de n con dato» y un solo veredicto con su intervalo', async () => {
    await compararConTodos()
    expect(screen.getByRole('tab', { name: '¿Crecen distinto?' })).toHaveAttribute('aria-selected', 'true')
    const panel = screen.getByRole('heading', { name: 'Talla baja a los 12 meses' }).closest('section')!
    expect(within(panel).getByText(/Talla para la edad con puntaje z menor que −2/)).toBeInTheDocument()
    expect(within(panel).getByText('13,1 %')).toBeInTheDocument()
    expect(within(panel).getByText(/52 de 397 niños con dato/)).toBeInTheDocument()
    expect(within(panel).getByText('18,4 %')).toBeInTheDocument()
    expect(within(panel).getByText(/41 de 223 niños con dato/)).toBeInTheDocument()
    expect(within(panel).getByText(/No se ve una diferencia clara/).closest('p')).toHaveTextContent(
      'No se ve una diferencia clara: 5,3 puntos más en B; el intervalo del 95 % va de −0,8 a 11,4 puntos e incluye el 0.')
    expect(within(panel).queryByText(/la diferencia no es clara/i)).toBeNull()   // una sola frase, no dos
    // S6: variable, unidad, momento, población y n válidos, a la vista bajo la gráfica
    fichaVisible(panel)
    expect(within(panel).getByText(/Variable: talla baja \(z menor que −2, OMS\)/)).toBeVisible()
    expect(within(panel).getByText(/Unidad: % de niños con dato/)).toBeVisible()
    expect(within(panel).getByText(/Momento: 12 meses de edad corregida/)).toBeVisible()
    expect(within(panel).getByText(/Población: niños elegibles de A \(498\) y de B \(312\)/)).toBeVisible()
  })

  it('la talla por visita dibuja un punto solo donde hay dato, con el umbral y los niños con dato de cada visita', async () => {
    await compararConTodos()
    const panel = screen.getByRole('heading', { name: 'Talla para la edad, visita por visita' }).closest('section')!
    const figura = within(panel).getByRole('figure', { name: /Talla para la edad.*puntaje z/ })
    expect(figura).toHaveAccessibleName(/40 sem\. Grupo A: mediana -2,2, 472 niños con dato; Grupo B: mediana -2,6, 298 niños con dato/)
    expect(figura).toHaveAccessibleName(/6 m EC\. Grupo A: mediana -1,6, 431 niños con dato; Grupo B: sin dato/)
    expect(within(panel).getByText(/Umbral de talla baja \(−2\)/)).toBeInTheDocument()
    fichaVisible(panel)
    expect(within(panel).getByText(/Unidad: puntaje z/)).toBeVisible()
    expect(within(panel).getByText(/Observaciones válidas: niños con dato, bajo cada visita/)).toBeVisible()
    // ya no hay una tabla aparte que repita la gráfica: los niños con dato van bajo cada visita y en «Ver como tabla»
    expect(within(panel).queryByRole('table')).toBeNull()
    expect(within(panel).getByRole('button', { name: /Descargar PNG/ })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: /Descargar CSV/ })).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Ver como tabla' }))
    const tabla = within(panel).getByRole('table')
    expect(within(tabla).getByRole('columnheader', { name: 'Grupo A: niños con dato' })).toBeInTheDocument()
    expect(within(within(tabla).getByRole('row', { name: /40 sem/ })).getByText('472')).toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Ver como tabla' }))   // deja la gráfica para las demás pruebas
  })

  it('«¿Les pasa algo distinto?»: lo observado de los dos desenlaces y, en el mismo lugar, el riesgo estimado rotulado aparte', async () => {
    await compararConTodos()
    await userEvent.click(screen.getByRole('tab', { name: '¿Les pasa algo distinto?' }))
    const vista = screen.getByRole('radiogroup', { name: 'Qué se muestra' })
    expect(within(vista).getByRole('radio', { name: 'Observado' })).toBeChecked()
    const dt = () => screen.getByRole('heading', { name: 'Talla baja a los 12 meses' }).closest('section')!
    const dd = () => screen.getByRole('heading', { name: 'Desarrollo psicomotor bajo a los 12 meses' }).closest('section')!
    expect(within(dt()).getByText(/52 de 397 niños con dato/)).toBeInTheDocument()
    expect(within(dt()).getByText(/101 sin dato/)).toBeInTheDocument()
    expect(within(dt()).getByText(/89 sin dato/)).toBeInTheDocument()
    expect(within(dd()).getByText(/20 de 200 niños con dato/)).toBeInTheDocument()
    expect(within(dd()).getByText(/Menos de 5 niños con dato/)).toBeInTheDocument()   // B no da cifra
    expect(within(dd()).getByText(/No se compara: cada lado necesita 20 niños con dato/)).toBeInTheDocument()
    fichaVisible(dd())
    expect(within(dd()).getByText(/Población: niños elegibles de A \(498\) y de B \(312\)/)).toBeVisible()
    expect(screen.queryByRole('table', { name: /Riesgo estimado/ })).toBeNull()
    // el riesgo estimado no se confunde con lo observado: es otra vista, en el mismo lugar, que dice que no es lo observado
    await userEvent.click(within(vista).getByRole('radio', { name: 'Riesgo estimado' }))
    expect(screen.getByTestId('ubicacion').textContent).toContain('vista=riesgo')
    expect(screen.getByText(/no es lo que pasó a los 12 meses/)).toBeVisible()
    expect(within(dt()).queryByText(/52 de 397 niños con dato/)).toBeNull()
    const riesgo = within(dt()).getByRole('table', { name: /Riesgo estimado de talla baja a los 12 meses/ })
    expect(within(riesgo).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Calculado a', 'Grupo A en alerta', 'Grupo B en alerta', 'Modelo'])
    const fila = within(riesgo).getByRole('row', { name: /40 sem/ })
    expect(within(fila).getByText('10,0 % (40 de 400)')).toBeInTheDocument()
    expect(within(fila).getByText('12,0 % (30 de 250)')).toBeInTheDocument()
    expect(within(fila).getByText('En prueba')).toBeInTheDocument()
    expect(within(within(riesgo).getByRole('row', { name: /3 m EC/ })).getByText('n menor que 5')).toBeInTheDocument()
    expect(within(within(dd()).getByRole('table')).getByText('En uso')).toBeInTheDocument()
    fichaVisible(dt())
    expect(within(dt()).getByText(/Observaciones válidas: niños con riesgo calculado en cada corte/)).toBeVisible()
    expect(screen.queryByText(/AUC|calibración|entrenamiento/i)).toBeNull()   // el rendimiento del modelo vive en Modelos
    await userEvent.click(within(vista).getByRole('radio', { name: 'Observado' }))
    expect(within(dt()).getByText(/52 de 397 niños con dato/)).toBeInTheDocument()
  })

  it('en una pantalla alta lo observado y el riesgo estimado van juntos, sin conmutador, y el riesgo sigue rotulado aparte', async () => {
    vi.stubGlobal('matchMedia', (consulta: string) => ({ matches: true, media: consulta, addEventListener: () => {}, removeEventListener: () => {} }))
    await compararConTodos()
    await userEvent.click(screen.getByRole('tab', { name: '¿Les pasa algo distinto?' }))
    expect(screen.queryByRole('radiogroup', { name: 'Qué se muestra' })).toBeNull()
    expect(screen.getByText(/Debajo, el riesgo estimado: .*no es lo que pasó a los 12 meses/)).toBeVisible()
    const dt = screen.getByRole('heading', { name: 'Talla baja a los 12 meses' }).closest('section')!
    expect(within(dt).getByText(/52 de 397 niños con dato/)).toBeVisible()
    expect(within(dt).getByRole('heading', { name: /Riesgo estimado por el modelo \(no es lo observado\)/ })).toBeVisible()
    expect(within(dt).getByRole('table', { name: /Riesgo estimado de talla baja/ })).toBeVisible()
    expect(within(dt).getAllByText(/^Variable:/)).toHaveLength(2)   // una ficha por cifra: lo observado y lo estimado
    // «¿Crecen distinto?» a todo lo ancho: lo observado a los 12 meses arriba y la talla por visita debajo
    await userEvent.click(screen.getByRole('tab', { name: '¿Crecen distinto?' }))
    expect(screen.getByRole('figure', { name: /Talla para la edad/ })).toBeInTheDocument()
  })

  it('«¿Faltan datos distintos?»: porcentaje sin dato por visita de cada lado, con su denominador, sin cortar las cifras', async () => {
    await compararConTodos()
    await userEvent.click(screen.getByRole('tab', { name: '¿Faltan datos distintos?' }))
    const panel = screen.getByRole('heading', { name: 'Niños sin dato de talla, visita por visita' }).closest('section')!
    const tabla = within(panel).getByRole('table', { name: /Niños sin dato de talla en cada visita/ })
    const celdas = (v: string) => within(within(tabla).getByRole('row', { name: new RegExp(v) })).getAllByRole('cell').map((c) => c.textContent)
    expect(celdas('40 sem')).toEqual(['40 sem', '5,2 % 26 de 498', '4,5 % 14 de 312'])
    expect(celdas('6 m EC')).toEqual(['6 m EC', '13,5 % 67 de 498', 'n menor que 5'])
    expect(within(panel).getByRole('button', { name: /Descargar CSV/ })).toBeInTheDocument()
    fichaVisible(panel)
    expect(within(panel).getByText(/Momento: cada visita, en edad corregida/)).toBeVisible()
    // los desenlaces a 12 meses también tienen sin dato
    const doce = screen.getByRole('heading', { name: 'Desenlaces a los 12 meses sin dato' }).closest('section')!
    const fila = within(within(doce).getByRole('table')).getByRole('row', { name: /Talla baja/ })
    expect(within(fila).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Talla baja', '20,3 % 101 de 498', '28,5 % 89 de 312'])
    fichaVisible(doce)
  })

  it('la pestaña queda en la dirección y el rendimiento del modelo es un enlace a Modelos, no otra pestaña', async () => {
    await compararConTodos()
    await userEvent.click(screen.getByRole('tab', { name: '¿Faltan datos distintos?' }))
    expect(screen.getByTestId('ubicacion').textContent).toContain('pregunta=faltan')
    const enlace = screen.getByRole('link', { name: /Rendimiento del modelo por grupo/ })
    expect(enlace).toHaveAttribute('href', '/analitica/comparar')
    expect(screen.getByRole('tablist').contains(enlace)).toBe(false)
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('«Intercambiar A y B» cambia los lados: B pasa a ser el grupo activo y cada uno conserva sus criterios', async () => {
    const llamadas = api()
    montar('/comparar?f=sexo|lista|F', <Ubicacion />)
    const intercambiar = await screen.findByRole('button', { name: 'Intercambiar A y B' })
    expect(intercambiar).toBeDisabled()   // B todavía no está elegida
    await userEvent.click(await screen.findByRole('button', { name: 'Comparar con todos los niños' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Intercambiar A y B' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Intercambiar A y B' }))
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).not.toContain('sexo|lista|F'))
    await waitFor(() => expect(within(ladoB()).getByText(/Sexo: Femenino/)).toBeInTheDocument())
    expect(within(ladoA()).getByText('Sin filtros: están todos los niños del programa.')).toBeInTheDocument()
    const ultimo = cuerpos(llamadas).at(-1)!
    expect(ultimo.a).toMatchObject({ muestra: { y: [] } })
    expect(ultimo.b).toMatchObject({ muestra: { y: [{ variable: 'sexo', valores: ['F'] }] } })
  })

  it('«Elegir grupo B» abre el panel de filtros y B queda con los criterios que se marquen', async () => {
    const llamadas = api()
    montar('/comparar?f=sexo|lista|F')
    await userEvent.click(await within(await screen.findByRole('region', { name: 'Grupo B' })).findByRole('button', { name: 'Elegir grupo B' }))
    const casilla = await within(ladoB()).findByRole('checkbox', { name: /Masculino/ })
    await userEvent.click(casilla)
    expect((await within(ladoB()).findAllByText(/Sexo: Masculino/)).length).toBeGreaterThan(0)   // el encabezado y la ficha del panel
    await waitFor(() => expect(cuerpos(llamadas).at(-1)?.b).toMatchObject({ muestra: { y: [{ variable: 'sexo', valores: ['M'] }] } }))
    expect(cuerpos(llamadas).at(-1)?.a).toMatchObject({ muestra: { y: [{ variable: 'sexo', valores: ['F'] }] } })   // A no cambió
    expect(await within(ladoA()).findByText(/Sexo: Femenino/)).toBeInTheDocument()
  })

  it('«Editar» A cambia el grupo activo de la dirección, sin tocar B', async () => {
    api()
    montar('/comparar?f=sexo|lista|F', <Ubicacion />)
    await userEvent.click(await screen.findByRole('button', { name: 'Comparar con todos los niños' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Editar grupo A' }))
    const panel = await within(ladoA()).findByRole('checkbox', { name: /Masculino/ })
    await userEvent.click(panel)
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toContain('sexo|lista|F;M'))
    expect(within(ladoB()).getByText('Sin filtros: están todos los niños del programa.')).toBeInTheDocument()
  })

  it('una falla de red dice qué pasó, ofrece reintentar y no pierde los grupos elegidos', async () => {
    const llamadas = api()
    const respuesta = fetch as unknown as (u: RequestInfo | URL, i?: RequestInit) => Promise<Response>
    let caida = true
    vi.stubGlobal('fetch', vi.fn(async (u: RequestInfo | URL, i?: RequestInit) => {
      if (String(u) === RUTA && caida) throw new TypeError('Failed to fetch')
      return respuesta(u, i)
    }))
    montar('/comparar?f=sexo|lista|F')
    await userEvent.click(await screen.findByRole('button', { name: 'Comparar con todos los niños' }))
    const alerta = await screen.findByRole('alert')
    expect(within(alerta).getByText(/conexión/i)).toBeInTheDocument()
    expect(within(alerta).getByText(/los grupos elegidos siguen aquí/i)).toBeInTheDocument()
    expect(within(ladoB()).getByText('Todos los niños')).toBeInTheDocument()   // B no se perdió
    expect(within(ladoA()).getByText(/Sexo: Femenino/)).toBeInTheDocument()
    caida = false
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('tab', { name: '¿Crecen distinto?' })).toBeInTheDocument()
    expect(cuerpos(llamadas).length).toBeGreaterThan(0)
    expect(await within(ladoB()).findByText('312 niños elegibles de 5.000')).toBeInTheDocument()
  })

  it('con menos de 20 niños en un lado no hay cifras: se explica y se dice cuántos hay en cada uno', async () => {
    api('experto', () => insuficiente)
    montar('/comparar?f=sexo|lista|F')
    await userEvent.click(await screen.findByRole('button', { name: 'Comparar con todos los niños' }))
    expect(await screen.findByText(/Cada grupo necesita al menos 20 niños para compararse/)).toBeInTheDocument()
    expect(screen.getByText(/Grupo A: 498 niños\. Grupo B: menos de 5 niños\./)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '¿Crecen distinto?' })).toBeNull()
    expect(await within(ladoB()).findByText(/Menos de 5 niños elegibles/)).toBeInTheDocument()
  })

  it('quien solo consulta compara grupos igual, sin filtros guardados', async () => {
    api('visualizador')
    montar('/comparar?f=sexo|lista|F')
    await userEvent.click(await screen.findByRole('button', { name: 'Comparar con todos los niños' }))
    expect(await screen.findByRole('tab', { name: '¿Crecen distinto?' })).toBeInTheDocument()
  })

  it('con las flechas se pasa de una pestaña a la siguiente', async () => {
    await compararConTodos()
    const primera = screen.getByRole('tab', { name: '¿Crecen distinto?' })
    primera.focus()
    fireEvent.keyDown(primera, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('tab', { name: '¿Les pasa algo distinto?' })).toHaveAttribute('aria-selected', 'true'))
  })
})

describe('Veredicto', () => {
  it('el intervalo va en la misma dirección que la diferencia: más en A da un intervalo positivo, no el de B frente a A', () => {
    render(<Veredicto d={{ valor: -5.1, ic_bajo: -8.1, ic_alto: -1.8, clara: true }} />)
    expect(screen.getByText(/puntos más en A/).textContent).toBe('Diferencia clara: 5,1 puntos más en A; el intervalo del 95 % va de 1,8 a 8,1 puntos.')
  })
  it('más en B y sin diferencia clara: el intervalo cruza el 0 y se dice', () => {
    render(<Veredicto d={{ valor: 5.3, ic_bajo: -0.8, ic_alto: 11.4, clara: false }} />)
    expect(screen.getByText(/puntos más en B/).textContent).toBe('No se ve una diferencia clara: 5,3 puntos más en B; el intervalo del 95 % va de −0,8 a 11,4 puntos e incluye el 0.')
  })
})
