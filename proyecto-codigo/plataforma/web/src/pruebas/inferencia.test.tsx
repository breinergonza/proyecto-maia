// Calcular el riesgo de un niño: el formulario por visita arma la petición de siempre, avisa en español lo que falta y
// muestra el resultado con el glosario clínico. El JSON queda solo para administración.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const campo = (variable: string, etiqueta: string, extra = {}) => ({
  variable, etiqueta, tipo: 'numero', unidad: null, tema: null, opciones: [], minimo: null, maximo: null,
  crecimiento: false, peso: 0, principal: true, ...extra,
})
const formulario = {
  paquete: 'p1', fuente: 'simulado',
  generales: [campo('ingreso_hogar', 'Ingreso del hogar', { principal: false, unidad: 'COP' })],
  visitas: [
    { etapa: 'nacimiento', nombre: 'Nacimiento', orden: 1, base: 'cronologica', edad_min: 0, edad_max: 3, desenlaces: [],
      campos: [campo('peso_nacer', 'Peso al nacer', { unidad: 'g', crecimiento: true })] },
    { etapa: '3 m EC', nombre: '3 meses (edad corregida)', orden: 4, base: 'corregida', edad_min: 45, edad_max: 135,
      desenlaces: ['desarrollo psicomotor bajo a los 6 meses'],
      campos: [campo('peso_3m', 'Peso a 3 m EC', { unidad: 'g', crecimiento: true }),
        campo('oxigeno_3m', 'Oxígeno a los 3 meses', { tipo: 'lista', opciones: [{ valor: '1', etiqueta: 'displasia broncopulmonar' }, { valor: '9', etiqueta: 'sin diagnóstico' }] })] },
  ],
}
const resultado = {
  paquete: 'p1', fuente: 'simulado', variables_ignoradas: [], modelo_clinico: 'a1b2c3d4e5',
  riesgos: [{ sujeto: 'calculo', clave: 'des6', desenlace: 'desarrollo psicomotor bajo a los 6 meses', momento: '3 m EC', riesgo: 0.31,
    percentil: 96, motivos: ['Peso al nacer (peso_nacer) = 900'], fecha_visita: '2026-05-10' }],
  alertas_dato: [{ sujeto: 'calculo', variable: 'peso_3m', etiqueta: 'Peso a 3 m EC', etapa: '3 m EC', valor: '9999', esperado: 5000,
    rango_bajo: 4000, rango_alto: 6500, capas: ['1'], motivo: 'posible error de unidad', prioridad: 1 }],
  crecimiento: [{ sujeto: 'calculo', etapa: '3 m EC', indicador: 'peso', fecha: '2026-05-10', edad_corregida: 60, valor: 9999, unidad: 'g', z: -2.6,
    bajo_2de: true, caida_1de: true, improbable: false },
  { sujeto: 'calculo', etapa: '3 m EC', indicador: 'talla', fecha: '2026-05-10', edad_corregida: 60, valor: 99, unidad: 'cm', z: 9.1,
    bajo_2de: false, caida_1de: false, improbable: true }],
}

function api(rol: Usuario['rol'], enviados: unknown[] = [], extra?: { formulario?: unknown; inferencia?: { estado: number; cuerpo: unknown }; activo?: unknown; ejemplo?: unknown }) {
  simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/modelos/activo') return { cuerpo: extra?.activo === undefined ? { version: 'p1', fuente: 'simulado', activo: true, metricas: {}, modelos: {} } : extra.activo }
    if (url === '/api/inferencia/ejemplo') return { cuerpo: extra?.ejemplo }
    if (url === '/api/inferencia/formulario') return { cuerpo: extra?.formulario ?? formulario }
    if (url === '/api/inferencia') {
      enviados.push(JSON.parse(String(init?.body)))
      return extra?.inferencia ?? { cuerpo: resultado }
    }
    return { cuerpo: {} }
  })
  return enviados
}

describe('calcular el riesgo de un niño', () => {
  it('arma la petición desde el formulario y muestra el resultado en palabras clínicas', async () => {
    const enviados = api('experto')
    montar('/prediccion')
    await userEvent.type(await screen.findByLabelText('Fecha de nacimiento'), '2026-01-10')
    await userEvent.type(screen.getByLabelText('Semanas de gestación al nacer'), '30,5')
    await userEvent.click(screen.getByRole('tab', { name: /^3 meses/ }))
    // la visita dice qué riesgos calcula, en una lista (no una frase corrida bajo el nombre)
    expect(within(screen.getByRole('list', { name: 'Riesgos que se calculan con esta visita' })).getByText('desarrollo psicomotor bajo a los 6 meses')).toBeInTheDocument()
    expect(screen.queryByText(/Aquí se calcula/)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Peso a 3 m EC (g)'), '9999')
    await userEvent.selectOptions(screen.getByLabelText('Oxígeno a los 3 meses'), '9')

    // sin la fecha de la visita no se calcula, y se dice por qué
    await userEvent.click(screen.getByRole('button', { name: 'Estimar riesgo' }))
    expect(await screen.findByText('Escriba la fecha de la visita «3 meses (edad corregida)».')).toBeInTheDocument()
    expect(screen.getByLabelText('Revise los datos del cálculo')).toHaveFocus()
    expect(enviados).toEqual([])

    await userEvent.type(screen.getByLabelText('Fecha de la visita'), '2026-05-10')
    await userEvent.click(screen.getByRole('button', { name: 'Estimar riesgo' }))
    await waitFor(() => expect(enviados).toHaveLength(1))
    expect(enviados[0]).toEqual({
      sujetos: [{ sujeto: 'calculo', fecha_nacimiento: '2026-01-10', eg_semanas: 30.5 }],
      mediciones: [
        { sujeto: 'calculo', variable: 'peso_3m', valor: 9999, fecha: '2026-05-10', edad_dias: 120 },
        { sujeto: 'calculo', variable: 'oxigeno_3m', valor: 9, fecha: '2026-05-10', edad_dias: 120 },
      ],
    })

    const riesgo = (await screen.findByText('desarrollo psicomotor bajo a los 6 meses', { selector: 'h2' })).closest('article')!
    expect(within(riesgo).getByText('En uso')).toBeInTheDocument()
    expect(within(riesgo).getByText('Modelo clínico a1b2c3d4e5')).toBeInTheDocument()
    expect(within(riesgo).getByText('Riesgo muy alto')).toBeInTheDocument()
    expect(within(riesgo).getByText('9 de 10')).toBeInTheDocument()
    expect(within(riesgo).getByText('Peso al nacer: 900')).toBeInTheDocument()
    expect(screen.getByText('Parece anotado en otra unidad (por ejemplo, kilos en lugar de gramos).')).toBeInTheDocument()
    expect(screen.getByText('Bajo para la edad')).toBeInTheDocument()
    expect(screen.getByText('Cayó desde el último control')).toBeInTheDocument()
    // una medida que solo tiene datos improbables no desaparece: se nombra para revisarla
    expect(screen.getByText('1 medida improbable (revisar) no se grafica')).toBeInTheDocument()
    expect(document.querySelector('main')?.textContent).not.toMatch(/posici[oó]n|puntaje z|capa \d|[−-]2 DE|\(peso_nacer\)/i)
    expect(screen.queryByRole('button', { name: 'Ingresar datos en formato JSON' })).not.toBeInTheDocument()
  })

  it('la página se llama «Calcular un niño» (como el menú y la pestaña del navegador) y «Calcular el riesgo» queda a la vista junto al título', async () => {
    api('experto')
    montar('/prediccion')
    expect(await screen.findByRole('heading', { level: 1, name: 'Estimar riesgo individual' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Predicción: un niño/ })).not.toBeInTheDocument()
    // el botón está fuera del formulario, que es largo, y lo envía por su id
    const boton = await screen.findByRole('button', { name: 'Estimar riesgo' })
    expect(boton.closest('form')).toBeNull()
    expect(boton).toHaveAttribute('form', 'formulario-calculo')
    expect(document.getElementById('formulario-calculo')).not.toBeNull()
    expect(screen.getByRole('tab', { name: 'Riesgo estimado' })).toBeInTheDocument()
  })

  it('carga la fecha y la gestación del ejemplo y lo calcula desde el botón', async () => {
    const enviados = api('experto', [], {
      ejemplo: {
        sujetos: [{ sujeto: 'ejemplo-1', fecha_nacimiento: '2026-01-10', eg_semanas: 32 }],
        mediciones: [{ sujeto: 'ejemplo-1', variable: 'peso_nacer', valor: 1600, fecha: '2026-01-10' }],
      },
    })
    montar('/prediccion')
    await userEvent.click(await screen.findByRole('button', { name: 'Cargar un niño de ejemplo' }))
    await waitFor(() => expect(screen.getByLabelText('Fecha de nacimiento')).toHaveValue('2026-01-10'))
    expect(screen.getByLabelText('Semanas de gestación al nacer')).toHaveValue('32')

    await userEvent.click(screen.getByRole('button', { name: 'Estimar riesgo' }))
    await waitFor(() => expect(enviados).toHaveLength(1))
    expect(enviados[0]).toMatchObject({
      sujetos: [{ fecha_nacimiento: '2026-01-10', eg_semanas: 32 }],
      mediciones: [{ variable: 'peso_nacer', valor: 1600 }],
    })
  })

  it('los datos generales van plegados y la administración tiene el modo avanzado', async () => {
    api('admin')
    montar('/prediccion')
    expect(await screen.findByText('Más datos del niño y la familia (1)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar datos en formato JSON' }))
    expect(screen.getByLabelText('Petición en JSON')).toBeInTheDocument()
  })

  it('la edad gestacional se pide una sola vez, aunque el diccionario también la tenga como dato', async () => {
    const enviados = api('experto', [], {
      formulario: { ...formulario, generales: [campo('eg_semanas', 'Semanas de gestación al nacer'), ...formulario.generales] },
    })
    montar('/prediccion')
    await userEvent.type(await screen.findByLabelText('Fecha de nacimiento'), '2026-01-10')
    expect(screen.getAllByLabelText(/gestación/i)).toHaveLength(1)
    await userEvent.type(screen.getByLabelText('Semanas de gestación al nacer'), '30')
    await userEvent.click(screen.getByRole('tab', { name: /^3 meses/ }))
    await userEvent.type(screen.getByLabelText('Peso a 3 m EC (g)'), '5000')
    await userEvent.type(screen.getByLabelText('Fecha de la visita'), '2026-05-10')
    await userEvent.click(screen.getByRole('button', { name: 'Estimar riesgo' }))
    await waitFor(() => expect(enviados).toHaveLength(1))
    expect(enviados[0]).toEqual({
      sujetos: [{ sujeto: 'calculo', fecha_nacimiento: '2026-01-10', eg_semanas: 30 }],
      mediciones: [{ sujeto: 'calculo', variable: 'peso_3m', valor: 5000, fecha: '2026-05-10', edad_dias: 120 }],
    })
  })
})

describe('el formulario cabe en la ventana: las casillas se reparten a lo ancho y nada ocupa una línea de más', () => {
  const conRango = {
    ...formulario,
    generales: [campo('talla_madre', 'Talla de la madre', { unidad: 'cm', minimo: 120, maximo: 200 }), ...formulario.generales],
  }
  const cuadriculaDe = (casilla: HTMLElement) => casilla.closest('[data-cuadricula]') as HTMLElement

  it('el rango habitual va dentro de la casilla y se le sigue diciendo a quien usa lector de pantalla', async () => {
    api('experto', [], { formulario: conRango })
    montar('/prediccion')
    const talla = await screen.findByLabelText('Talla de la madre (cm)')
    expect(talla).toHaveAttribute('placeholder', '120 a 200')
    expect(talla).toHaveAccessibleDescription('Habitual: 120 a 200 cm.')
    // la frase completa no se pinta: ocupaba una línea bajo cada casilla
    expect(document.getElementById(talla.getAttribute('aria-describedby')!)).toHaveClass('sr-only')
    const semanas = screen.getByLabelText('Semanas de gestación al nacer')
    expect(semanas).toHaveAttribute('placeholder', '20 a 45')
    expect(semanas).toHaveAccessibleDescription('Entre 20 y 45.')
  })

  it('la fecha de nacimiento, las semanas de gestación y los datos principales del niño comparten una cuadrícula', async () => {
    api('experto', [], { formulario: conRango })
    montar('/prediccion')
    const cuadricula = cuadriculaDe(await screen.findByLabelText('Fecha de nacimiento'))
    expect(cuadricula).not.toBeNull()
    expect(within(cuadricula).getByLabelText('Semanas de gestación al nacer')).toBeInTheDocument()
    expect(within(cuadricula).getByLabelText('Talla de la madre (cm)')).toBeInTheDocument()
    // tantas columnas como quepan en el ancho de la ventana, no cuatro fijas
    expect(cuadricula.className).toMatch(/grid-cols-\[repeat\(auto-fill,minmax\(/)
    // en escritorio las casillas son un poco más bajas (en un teléfono conservan el alto para el dedo)
    for (const casilla of within(cuadricula).getAllByRole('textbox')) expect(casilla).toHaveClass('lg:h-9')
    expect(within(cuadricula).getByLabelText('Fecha de nacimiento')).toHaveClass('lg:h-9')
  })

  it('la fecha de la visita es una casilla más de la visita, y la edad esperada se sigue diciendo', async () => {
    api('experto')
    montar('/prediccion')
    await userEvent.click(await screen.findByRole('tab', { name: /^3 meses/ }))
    const fecha = screen.getByLabelText('Fecha de la visita')
    expect(within(cuadriculaDe(fecha)).getByLabelText('Peso a 3 m EC (g)')).toBeInTheDocument()
    expect(screen.getByText('Se espera entre 45 d y 4,4 m de edad corregida.')).toBeInTheDocument()
    expect(fecha).toHaveAccessibleDescription('Se espera entre 45 d y 4,4 m de edad corregida.')
  })

  it('la guía del formulario va junto al título «Datos del niño», no en un renglón propio', async () => {
    api('experto')
    montar('/prediccion')
    const titulo = await screen.findByRole('heading', { level: 2, name: 'Datos del niño' })
    expect(within(titulo.closest('header')!).getByText(/Lo que deje vacío se toma como dato faltante\. No se guarda nada\./)).toBeInTheDocument()
  })

  it('el título «Visitas» comparte renglón con las pestañas de las visitas', async () => {
    api('experto')
    montar('/prediccion')
    const titulo = await screen.findByRole('heading', { level: 2, name: 'Visitas' })
    expect(within(titulo.parentElement!).getByRole('tablist', { name: 'Visitas' })).toBeInTheDocument()
  })

  it('una visita del nacimiento no pide fecha y lo dice, junto a sus casillas', async () => {
    api('experto')
    montar('/prediccion')
    await screen.findByLabelText('Peso al nacer (g)')
    // todos los paneles de visita están montados: se mira el de la pestaña elegida
    const panel = document.getElementById('visita-panel')!
    expect(within(panel).getByText('Se toman con la fecha de nacimiento.')).toBeInTheDocument()
    expect(within(panel).queryByLabelText('Fecha de la visita')).not.toBeInTheDocument()
    expect(cuadriculaDe(within(panel).getByLabelText('Peso al nacer (g)'))).not.toBeNull()
  })
})

describe('un resultado de datos que ya cambiaron se marca', () => {
  it('editar el formulario después de calcular avisa que el resultado es de los datos anteriores, hasta volver a calcular', async () => {
    const enviados = api('experto')
    montar('/prediccion')
    await userEvent.type(await screen.findByLabelText('Fecha de nacimiento'), '2026-01-10')
    await userEvent.type(screen.getByLabelText('Semanas de gestación al nacer'), '30')
    await userEvent.type(screen.getByLabelText('Peso al nacer (g)'), '900')
    await userEvent.click(screen.getByRole('button', { name: 'Estimar riesgo' }))
    await waitFor(() => expect(enviados).toHaveLength(1))
    await screen.findByText('desarrollo psicomotor bajo a los 6 meses', { selector: 'h2' })
    expect(screen.queryByText(/datos que ya cambiaron/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Datos del niño' }))
    await userEvent.type(screen.getByLabelText('Peso al nacer (g)'), '0')
    expect(screen.getByText(/datos que ya cambiaron/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Estimar riesgo' }))
    await waitFor(() => expect(enviados).toHaveLength(2))
    await waitFor(() => expect(screen.queryByText(/datos que ya cambiaron/)).not.toBeInTheDocument())
  })
})

describe('cuando no se puede calcular, cada rol sabe a quién acudir', () => {
  const sinModelo = { estado: 409, cuerpo: { detail: 'No hay un paquete de modelos activo.' } }
  const falla = { estado: 422, cuerpo: { detail: 'No se pudo calcular el riesgo con estos datos. Revise los valores que escribió e intente de nuevo.' } }

  async function calcularConError(rol: Usuario['rol'], inferencia: { estado: number; cuerpo: unknown }) {
    api(rol, [], { inferencia })
    montar('/prediccion')
    await userEvent.type(await screen.findByLabelText('Fecha de nacimiento'), '2026-01-10')
    await userEvent.type(screen.getByLabelText('Semanas de gestación al nacer'), '30')
    await userEvent.type(screen.getByLabelText('Peso al nacer (g)'), '900')
    await userEvent.click(screen.getByRole('button', { name: 'Estimar riesgo' }))
    return screen.findByRole('alert')
  }

  it('la administración recibe un enlace a Modelos', async () => {
    const aviso = await calcularConError('admin', sinModelo)
    expect(within(aviso).getByRole('link', { name: 'Modelos' })).toHaveAttribute('href', '/admin/modelos')
  })

  it('un experto no es enviado a una pantalla que no puede abrir', async () => {
    const aviso = await calcularConError('experto', sinModelo)
    expect(aviso).toHaveTextContent('Pídale a la administración que active un modelo.')
    expect(within(aviso).queryByRole('link')).not.toBeInTheDocument()
    expect(aviso).not.toHaveTextContent('Modelos')
  })

  it('un cálculo que falla muestra lo que dice el servidor, sin mandar a nadie a Modelos', async () => {
    const aviso = await calcularConError('experto', falla)
    expect(aviso).toHaveTextContent('No se pudo calcular el riesgo con estos datos.')
    expect(aviso).not.toHaveTextContent(/Modelos|Pídale/)
  })

  it('sin paquete activo, la administración tiene el enlace a Modelos', async () => {
    api('admin', [], { activo: null })
    montar('/prediccion')
    const vacio = (await screen.findByText('No hay un paquete de modelos activo')).parentElement!
    expect(within(vacio).getByRole('link', { name: 'Modelos' })).toHaveAttribute('href', '/admin/modelos')
  })

  it('sin paquete activo, el experto sabe a quién pedirlo', async () => {
    api('experto', [], { activo: null })
    montar('/prediccion')
    expect(await screen.findByText('Pídale a la administración que active un modelo.')).toBeInTheDocument()
  })
})
