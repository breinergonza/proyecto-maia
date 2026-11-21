// El panel «Elija el grupo» (S20): un cajón lateral en la vista clínica y en Comparar, filas legibles con su cifra pegada a la
// etiqueta, rangos compactos, el período con palabras claras, el muestreo solo al guardar un grupo para entrenar y los
// criterios del grupo sin repetir el nombre de la variable.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RespuestaClinica, Usuario } from '../api/tipos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const clinica = {
  corrida_id: 3, datos_al: '2026-06-30',
  familias: [{ clave: 'talla_baja_12m', nombre: 'Talla baja a los 12 meses', estado: 'en_prueba', indicador: 'talla', definicion: 'Talla baja.' }],
  familia: 'talla_baja_12m', indicador: 'talla', grupo: { n: 312, n_total: 5000 },
  observado: {
    grupo: { casos: 41, con_dato: 223, sin_dato: 89, pct: 18.4, pct_sin_dato: 28.5 },
    poblacion: { casos: 412, con_dato: 3680, sin_dato: 800, pct: 11.2, pct_sin_dato: 17.9 },
  },
  trayectoria: { indicador: 'talla', unidad: 'puntaje z de la OMS', etapas: [{ etapa: '40 sem', grupo: { n: 298, p25: -1.4, mediana: -1, p75: -0.6 }, poblacion: { n: 4000, mediana: -0.2 } }] },
  riesgo: [], riesgo_con_modelo: true, alerta_percentil: 90, ninos: null,
} satisfies RespuestaClinica

const resumenExplorar = {
  insuficiente: true, minimo: 20, ninos: null, ninos_total: 600,
}

const facetas = {
  n: 312, minimo: 20, n_base: 5000,
  facetas: {
    sede: { etiqueta: 'Sede', tipo: 'lista', cuando: null, opciones: [
      { valor: '1', etiqueta: 'Sede 1', n: 140 }, { valor: '2', etiqueta: 'Sede 2', n: 60 }, { valor: '3', etiqueta: 'Sede 3', n: 112 }] },
    sexo: { etiqueta: 'Sexo', tipo: 'lista', cuando: 'primera', opciones: [
      { valor: 'F', etiqueta: 'Femenino', n: 162 }, { valor: 'M', etiqueta: 'Masculino', n: 150 }] },
    eg_categoria: { etiqueta: 'Edad gestacional (categoría)', tipo: 'lista', cuando: null, opciones: [
      { valor: 'muy_prematuro', etiqueta: 'Muy prematuro (28 a 31 sem)', n: 80, rango: [28, 32] },
      { valor: 'a_termino', etiqueta: 'A término (37 sem o más)', n: 90, rango: [37, null] }] },
    eg_semanas: { etiqueta: 'Edad gestacional (semanas)', tipo: 'numero', cuando: null, destacada: true, min: 24, max: 41, bins: [] },
    peso_nacer: { etiqueta: 'Peso al nacer', tipo: 'numero', cuando: 'primera', min: 900, max: 4200, bins: [] },
  },
  tiempo: { campos: [{ valor: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento' }, { valor: 'anio_nacimiento', etiqueta: 'Año de nacimiento' }],
    defecto: 'fecha_nacimiento', hay_fecha_nacimiento: true, desde: 2012, hasta: 2026, corte: '2026-06-30' },
  muestreo: { por: [{ valor: 'sede', etiqueta: 'Sede' }] },
  etapas: [], disponibles: [{ variable: 'hematocrito', etiqueta: 'Hematocrito', tipo: 'numero', cuando: 'alguna', reglas: ['primera', 'alguna'] }],
}

function Ubicacion() {
  return <output data-testid="ubicacion">{decodeURIComponent(useLocation().search)}</output>
}

function api(rol: Usuario['rol'], tiempo: Partial<typeof facetas.tiempo> = {}) {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/clinica/resumen') return { cuerpo: clinica }
    if (url === '/api/exploracion/resumen') return { cuerpo: resumenExplorar }
    if (url === '/api/exploracion/facetas') return { cuerpo: { ...facetas, tiempo: { ...facetas.tiempo, ...tiempo } } }
    if (url === '/api/muestras' && init?.method === 'POST') {
      return { estado: 201, cuerpo: { id: 9, titulo: 'x', n_ninos: 1, definicion: JSON.parse(String(init.body)).muestra } }
    }
    if (url === '/api/muestras') return rol === 'visualizador'
      ? { estado: 403, cuerpo: { detail: 'Sin permiso' } }
      : { cuerpo: [{ id: 7, titulo: 'Muy prematuros', n_ninos: 312, definicion: { version: 2, y: [] } }] }
    return { cuerpo: [] }
  })
}

/** El menú del teléfono también es un diálogo (oculto en escritorio): el del grupo se pide por su nombre. */
const abrirCajon = async () => {
  const barra = await screen.findByRole('region', { name: 'Grupo activo' })
  const abre = await within(barra).findByRole('button', { name: 'Cambiar grupo' })
  await userEvent.click(abre)
  return { barra, abre, dialogo: await screen.findByRole('dialog', { name: 'Elija el grupo' }) }
}

describe('el panel del grupo en la vista clínica es un cajón', () => {
  it('abre un diálogo modal fuera de la barra, con su cifra y «Listo»; Escape y «Listo» lo cierran y el foco vuelve al botón', async () => {
    api('experto')
    montar('/?f=sexo|lista|F')
    const { barra, abre, dialogo } = await abrirCajon()
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    expect(barra).not.toContainElement(dialogo)   // no es un formulario a todo lo ancho bajo la barra
    expect(dialogo).toContainElement(document.activeElement as HTMLElement)   // el foco entra al abrir
    // el resultado a la vista, con la misma cifra de la barra
    expect(within(dialogo).getByText('312 niños en el grupo')).toBeInTheDocument()
    expect(within(barra).getByText(/312 niños elegibles/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Quitar todos' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Elija el grupo/ })).not.toBeInTheDocument())
    expect(abre).toHaveFocus()
    await userEvent.click(abre)
    await userEvent.click(within(await screen.findByRole('dialog', { name: /^Elija el grupo/ })).getByRole('button', { name: 'Listo' }))
    expect(screen.queryByRole('dialog', { name: /^Elija el grupo/ })).not.toBeInTheDocument()
    expect(abre).toHaveFocus()
  })

  it('el botón de cerrar también lo cierra, y los filtros se aplican al instante sin dejar el cajón', async () => {
    api('experto')
    montar('/', <Ubicacion />)
    const { dialogo } = await abrirCajon()
    await userEvent.click(within(dialogo).getByText('Masculino'))
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=sexo|lista|M'))
    expect(screen.getByRole('dialog', { name: 'Elija el grupo' })).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog', { name: /^Elija el grupo/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=sexo|lista|M')
  })

  it('no ofrece el muestreo ni su nota: es de una muestra guardada para entrenar, no de una vista clínica', async () => {
    api('experto')
    montar('/')
    const { dialogo } = await abrirCajon()
    expect(within(dialogo).queryByRole('combobox', { name: 'Muestreo' })).not.toBeInTheDocument()
    expect(within(dialogo).queryByText(/El tope se aplica al entrenar/)).not.toBeInTheDocument()
    expect(within(dialogo).queryByText(/Muestreo/)).not.toBeInTheDocument()
  })

  it('el grupo guardado está arriba para un experto y quien solo consulta no lo ve; se habla de «grupo»', async () => {
    api('experto')
    montar('/')
    const { dialogo } = await abrirCajon()
    const guardado = await within(dialogo).findByRole('combobox', { name: 'Grupo guardado' })
    expect(guardado.compareDocumentPosition(within(dialogo).getByText('Sede'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(within(dialogo).getByRole('button', { name: 'Guardar este grupo' })).toBeInTheDocument()
    expect(within(dialogo).queryByText(/filtro guardado/i)).not.toBeInTheDocument()
  })

  it('quien solo consulta tampoco ve el grupo guardado ni el botón para guardar', async () => {
    api('visualizador')
    montar('/')
    const { dialogo } = await abrirCajon()
    expect(within(dialogo).queryByRole('combobox', { name: 'Grupo guardado' })).not.toBeInTheDocument()
    expect(within(dialogo).queryByRole('button', { name: /Guardar este/ })).not.toBeInTheDocument()
  })

  it('el grupo se describe sin repetir la variable: «Sede 1, Sede 3», y las semanas de una categoría no cargan la barra', async () => {
    api('visualizador')
    montar('/?f=sede|lista|1;3&f=eg_categoria|lista|muy_prematuro;a_termino')
    const barra = await screen.findByRole('region', { name: 'Grupo activo' })
    expect(await within(barra).findByText(/Sede 1, Sede 3/)).toBeInTheDocument()
    expect(within(barra).queryByText(/Sede: Sede/)).not.toBeInTheDocument()
    expect(within(barra).getByText(/Edad gestacional \(categoría\): Muy prematuro, A término/)).toBeInTheDocument()
  })
})

describe('las filas, los rangos, el período y el muestreo del panel (Explorar)', () => {
  it('cada fila se marca con un clic en cualquier parte de ella; la cifra va pegada a la etiqueta bajo un encabezado «Niños»', async () => {
    api('experto')
    montar('/explorar', <Ubicacion />)
    const fila = (await screen.findByRole('checkbox', { name: /Sede 2/ })).closest('li')!
    expect(fila.closest('fieldset')).toHaveTextContent('Niños')   // el encabezado de la columna de cifras
    expect(fila).toHaveTextContent('60')
    expect(screen.queryByText(/Marque las opciones/)).not.toBeInTheDocument()
    // la fila entera es una etiqueta: el clic en su cifra marca la casilla
    await userEvent.click(within(fila).getByText('60'))
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=sede|lista|2'))
    expect(screen.getByRole('checkbox', { name: /Sede 2/ })).toBeChecked()
    // la lista de opciones no ocupa todo el ancho de una columna ancha
    expect(fila.closest('ul')!.className).toMatch(/max-w-/)
  })

  it('las etiquetas ya vienen legibles: se leen tal cual, sin códigos', async () => {
    api('experto')
    montar('/explorar')
    for (const e of [/Sede 1/, /Sede 3/, /Femenino/, /Masculino/, /Muy prematuro \(28 a 31 sem\)/, /A término \(37 sem o más\)/]) {
      expect(await screen.findByRole('checkbox', { name: e })).toBeInTheDocument()
    }
  })

  it('un rango son dos campos compactos con «de … a … unidad»; los límites son sugerencias, no valores escritos', async () => {
    api('experto')
    montar('/explorar', <Ubicacion />)
    const desde = await screen.findByRole('textbox', { name: 'Edad gestacional (semanas): desde' })
    const hasta = screen.getByRole('textbox', { name: 'Edad gestacional (semanas): hasta' })
    expect(desde).toHaveAttribute('placeholder', 'mín. 24')
    expect(hasta).toHaveAttribute('placeholder', 'máx. 41')
    expect(desde).toHaveValue('')
    expect(desde.className).toMatch(/\bw-24\b/)   // unos 6 rem, no todo el ancho
    const grupo = desde.closest('fieldset')!
    expect(grupo).toHaveTextContent(/de\s*a\s*semanas/)
    fireEvent.change(desde, { target: { value: '28' } })
    fireEvent.blur(desde)
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=eg_semanas|numero|28;'))
  })

  it('el período tiene nombre y frases claras: «Contar a los niños por», el rango de años y sin la explicación críptica', async () => {
    api('experto')
    montar('/explorar')
    const grupo = (await screen.findByText('Período', { selector: 'legend' })).closest('fieldset')!
    expect(within(grupo).getByRole('combobox', { name: 'Contar a los niños por' })).toHaveValue('fecha_nacimiento')
    expect(within(grupo).getByRole('combobox', { name: 'Período' })).toHaveValue('todo')
    expect(within(grupo).getByText('Hay niños nacidos entre 2012 y 2026.')).toBeInTheDocument()
    expect(screen.queryByText(/Con la fecha de parto/)).not.toBeInTheDocument()
    expect(screen.queryByText('Tiempo', { selector: 'legend' })).not.toBeInTheDocument()
  })

  it('un corte que solo trae el año de nacimiento lo dice con palabras llanas', async () => {
    api('experto', { hay_fecha_nacimiento: false })
    montar('/explorar')
    expect(await screen.findByText(/Este corte solo trae el año de nacimiento./)).toBeInTheDocument()
  })

  it('el muestreo no está en el panel; está al guardar el grupo y lo guardado conserva el que trae la dirección', async () => {
    const llamadas = api('experto')
    montar('/explorar?f=sexo|lista|M&m=sede|300|11')
    await screen.findByRole('checkbox', { name: /Masculino/ })
    expect(screen.queryByRole('combobox', { name: 'Muestreo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Máximo por categoría' })).not.toBeInTheDocument()
    // el muestreo de la dirección sigue a la vista como criterio y se puede quitar
    expect(screen.getByText('Muestreo: hasta 300 por categoría')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar este grupo' }))
    const forma = screen.getByRole('form', { name: 'Guardar este grupo' })
    expect(within(forma).getByRole('combobox', { name: 'Muestreo' })).toHaveValue('estratificado')
    expect(within(forma).getByRole('textbox', { name: 'Máximo por categoría' })).toHaveValue('300')
    fireEvent.change(within(forma).getByLabelText('Nombre del grupo'), { target: { value: 'Varones' } })
    await userEvent.click(within(forma).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/muestras' && l.init?.method === 'POST')).toBe(true))
    const envio = llamadas.find((l) => l.url === '/api/muestras' && l.init?.method === 'POST')!
    expect(JSON.parse(String(envio.init!.body))).toMatchObject({
      titulo: 'Varones', muestra: { y: [{ variable: 'sexo', valores: ['M'] }], muestreo: { modo: 'estratificado', por: 'sede', maximo_por_categoria: 300, semilla: 11 } },
    })
  })

  it('elegir el muestreo dentro del formulario de guardar lo escribe en la dirección', async () => {
    api('experto')
    montar('/explorar', <Ubicacion />)
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar este grupo' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Muestreo' }), { target: { value: 'estratificado' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('m=sede|300|11'))
    expect(screen.getByText(/El tope se aplica al entrenar/)).toBeInTheDocument()
  })

  it('«Agregar otra característica» es una acción con su etiqueta visible, y sigue siendo un selector nativo', async () => {
    api('experto')
    montar('/explorar', <Ubicacion />)
    const selector = await screen.findByLabelText('Agregar otra característica')
    expect(selector.tagName).toBe('SELECT')
    expect(screen.getByText('Agregar otra característica', { selector: 'label' })).toBeVisible()
    fireEvent.change(selector, { target: { value: 'hematocrito' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('v=hematocrito|alguna'))
  })
})
