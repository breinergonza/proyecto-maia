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

function api(rol: Usuario['rol'], enviados: unknown[] = [], extra?: { formulario?: unknown; inferencia?: { estado: number; cuerpo: unknown }; activo?: unknown }) {
  simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/modelos/activo') return { cuerpo: extra?.activo === undefined ? { version: 'p1', fuente: 'simulado', activo: true, metricas: {}, modelos: {} } : extra.activo }
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
    await userEvent.click(screen.getByRole('button', { name: /3 meses \(edad corregida\)/ }))
    // la visita dice cuántos riesgos calcula; cuáles, en una lista al abrirla (no una frase corrida bajo el nombre)
    expect(screen.getByText('Calcula 1 riesgo')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Riesgos que se calculan con esta visita' })).getByText('desarrollo psicomotor bajo a los 6 meses')).toBeInTheDocument()
    expect(screen.queryByText(/Aquí se calcula/)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Peso a 3 m EC (g)'), '9999')
    await userEvent.selectOptions(screen.getByLabelText('Oxígeno a los 3 meses'), '9')

    // sin la fecha de la visita no se calcula, y se dice por qué
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByText('Escriba la fecha de la visita «3 meses (edad corregida)».')).toBeInTheDocument()
    expect(enviados).toEqual([])

    await userEvent.type(screen.getByLabelText('Fecha de la visita'), '2026-05-10')
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
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
    expect(screen.queryByRole('button', { name: 'Modo avanzado (JSON)' })).not.toBeInTheDocument()
  })

  it('la página se llama «Calcular un niño» (como el menú y la pestaña del navegador) y el resultado queda fijo junto al formulario', async () => {
    api('experto')
    montar('/prediccion')
    expect(await screen.findByRole('heading', { level: 1, name: 'Calcular un niño' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Predicción: un niño/ })).not.toBeInTheDocument()
    expect(screen.getByText('Aquí aparecerá el resultado').closest('[class~="xl:sticky"]')).not.toBeNull()
  })

  it('los datos generales van plegados y la administración tiene el modo avanzado', async () => {
    api('admin')
    montar('/prediccion')
    expect(await screen.findByText('Más datos del niño y la familia (1)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Modo avanzado (JSON)' }))
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
    await userEvent.click(screen.getByRole('button', { name: /3 meses \(edad corregida\)/ }))
    await userEvent.type(screen.getByLabelText('Peso a 3 m EC (g)'), '5000')
    await userEvent.type(screen.getByLabelText('Fecha de la visita'), '2026-05-10')
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    await waitFor(() => expect(enviados).toHaveLength(1))
    expect(enviados[0]).toEqual({
      sujetos: [{ sujeto: 'calculo', fecha_nacimiento: '2026-01-10', eg_semanas: 30 }],
      mediciones: [{ sujeto: 'calculo', variable: 'peso_3m', valor: 5000, fecha: '2026-05-10', edad_dias: 120 }],
    })
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
    await userEvent.click(screen.getByRole('button', { name: /Nacimiento/ }))
    await userEvent.type(screen.getByLabelText('Peso al nacer (g)'), '900')
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
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
