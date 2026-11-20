// Explorar: las cifras del grupo, el filtro en la dirección, el aviso con menos de 20 niños y el enlace del menú.
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EntradaFiltro, Usuario } from '../api/tipos'
import { codificar, codificarMuestreo, codificarTiempo, decodificar, decodificarMuestreo, decodificarTiempo } from '../lib/useFiltros'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const corrida = { id: 3, estado: 'ok', tipo: 'completa', fuente: 'kmc', terminada: '2026-07-01T10:00:00Z', creada_en: '2026-07-01T09:00:00Z' }
const resumen = {
  insuficiente: false, minimo: 20, corrida, corte: '2026-06-30', filtrado: true, ninos: 240, ninos_total: 600, datos: 4800,
  ninos_riesgo_alto: 25, riesgos_altos: 31, percentil_alto: 90,
  riesgos_por_desenlace: [{ clave: 'readm', desenlace: 'Readmisión', momento: '40 sem', momento_nombre: '40 semanas', ninos: 200, altos: 20, riesgo_medio: 0.2 }],
  crecimiento_por_etapa: [{ etapa: '3 m EC', etapa_nombre: '3 meses', indicador: 'peso', datos: 180, pct_bajo: 12, pct_caida: 5, z_mediano: -0.3, orden: 2 }],
  pct_crecimiento_bajo: 12.5,
  distribuciones: { sexo: { etiqueta: 'Sexo', categorias: [
    { categoria: 'M', etiqueta: 'Masculino', grupo: 60, todos: 50 }, { categoria: 'F', etiqueta: 'Femenino', grupo: 40, todos: 50 }] } },
}
const facetas = {
  n: 240, minimo: 20,
  facetas: {
    sexo: { etiqueta: 'Sexo', tipo: 'lista', cuando: 'primera', opciones: [
      { valor: 'M', etiqueta: 'Masculino', n: 300, texto: '300' }, { valor: 'F', etiqueta: 'Femenino', n: null, texto: '<5' }] },
    eg_categoria: { etiqueta: 'Edad gestacional (categoría)', tipo: 'lista', cuando: null, opciones: [
      { valor: 'muy_prematuro', etiqueta: 'Muy prematuro', n: 80, texto: '80', rango: [28, 32] },
      { valor: 'moderado_tardio', etiqueta: 'Moderado o tardío', n: 0, texto: '0', rango: [32, 37] },
      { valor: 'a_termino', etiqueta: 'A término', n: 90, texto: '90', rango: [37, null] }] },
    oxigeno: { etiqueta: 'Oxigenodependencia', tipo: 'si_no', cuando: 'alguna', destacada: true, reglas: ['primera', 'ultima', 'alguna'], opciones: [
      { valor: true, etiqueta: 'Sí', n: 30, texto: '30' }, { valor: false, etiqueta: 'No', n: 210, texto: '210' }] },
    peso_nacer: { etiqueta: 'Peso al nacer', tipo: 'numero', cuando: 'primera', min: 900, max: 4200, bins: [] },
  },
  tiempo: { campos: [{ valor: 'fecha_nacimiento', etiqueta: 'Fecha de nacimiento' }, { valor: 'anio_nacimiento', etiqueta: 'Año de nacimiento' },
    { valor: 'fecha_visita', etiqueta: 'Fecha de visita' }], defecto: 'fecha_nacimiento', hay_fecha_nacimiento: true, desde: 2015, hasta: 2025, corte: '2026-06-30' },
  muestreo: { por: [{ valor: 'sede', etiqueta: 'Sede' }, { valor: 'ern_sexo', etiqueta: 'Sexo' }] },
  etapas: [{ etapa: '40 sem', nombre: '40 semanas' }, { etapa: '3 m EC', nombre: '3 meses' }],
  disponibles: [{ variable: 'hematocrito', etiqueta: 'Hematocrito', tipo: 'numero', cuando: 'alguna', reglas: ['primera', 'ultima', 'alguna'] }],
}

function Ubicacion() {
  return <output data-testid="ubicacion">{decodeURIComponent(useLocation().search)}</output>
}

function api(rol: Usuario['rol'], respuesta: unknown = resumen) {
  return simularApi((url, init) => {
    if (url === '/api/muestras' && init?.method === 'POST') {
      return { estado: 201, cuerpo: { id: 7, titulo: 'Varones', n_ninos: 240, definicion: JSON.parse(String(init.body)).muestra } }
    }
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/exploracion/resumen') return { cuerpo: respuesta }
    if (url === '/api/exploracion/facetas') return { cuerpo: facetas }
    if (url === '/api/muestras') return rol === 'visualizador' ? { estado: 403, cuerpo: { detail: 'Sin permiso' } } : { cuerpo: [] }
    return { cuerpo: {} }
  })
}

const cifra = (texto: string) => screen.getByText(texto).previousElementSibling?.textContent

describe('explorar', () => {
  it('muestra las cifras del grupo frente al total y las tres gráficas', async () => {
    api('experto')
    montar('/explorar')
    expect(await screen.findByText('niños en el grupo, de 600')).toBeInTheDocument()
    expect(cifra('niños en el grupo, de 600')).toBe('240')
    expect(cifra('niños con algún riesgo alto')).toBe('25')
    expect(cifra('de los datos de crecimiento, bajos frente a la OMS')).toBe('12,5 %')
    for (const t of ['Riesgo del grupo elegido', 'Crecimiento del grupo elegido', 'Quiénes son los niños del grupo']) {
      expect(screen.getByRole('heading', { name: t })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `Descargar PNG: ${t}` })).toBeInTheDocument()
    }
    expect(screen.getByText('Cómo se reparte el grupo elegido frente a todos los niños.')).toBeInTheDocument()
  })

  it('el filtro se lee de la dirección y se manda en la consulta', async () => {
    const llamadas = api('admin')
    montar('/explorar?f=sexo|lista|F&f=eg_categoria|lista|muy_prematuro;a_termino')
    await screen.findByText('niños en el grupo, de 600')
    const cuerpo = JSON.parse(String(llamadas.find((l) => l.url === '/api/exploracion/resumen')!.init!.body))
    expect(cuerpo.muestra.y).toEqual([
      { variable: 'sexo', tipo: 'lista', op: 'en', valores: ['F'], cuando: 'primera' },
      { variable: 'eg_categoria', tipo: 'lista', op: 'en', valores: ['muy_prematuro', 'a_termino'] },
    ])
    // fichas de los filtros activos
    expect(screen.getByRole('button', { name: 'Quitar filtro Sexo' })).toBeInTheDocument()
    expect(screen.getByText('Edad gestacional (categoría): Muy prematuro, A término')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Femenino/ })).toBeChecked()
    // cada categoría vale por sí sola: la del medio no queda marcada
    expect(screen.getByRole('checkbox', { name: /Muy prematuro/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /A término/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Moderado/ })).not.toBeChecked()
  })

  it('dos categorías de edad gestacional se mandan como lista y no como un rango continuo', async () => {
    api('experto')
    montar('/explorar?f=eg_categoria|lista|muy_prematuro', <Ubicacion />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /A término/ }))
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=eg_categoria|lista|muy_prematuro;a_termino'))
    expect(screen.getByTestId('ubicacion')).not.toHaveTextContent('numero')
    expect(screen.getByRole('checkbox', { name: /Moderado/ })).not.toBeChecked()
  })

  it('una opción sin niños dice 0 y se atenúa; «<5» sigue siendo un dato oculto', async () => {
    api('experto')
    montar('/explorar')
    const moderado = (await screen.findByRole('checkbox', { name: /Moderado/ })).closest('li')!
    expect(moderado).toHaveTextContent('0')
    expect(moderado).not.toHaveTextContent('<5')
    expect(moderado.className).toContain('opacity-60')
    expect(screen.getByRole('checkbox', { name: /Femenino/ }).closest('li')).toHaveTextContent('<5')
    expect(screen.getByRole('checkbox', { name: /Femenino/ }).closest('li')!.className).not.toContain('opacity-60')
  })

  it('ningún niño cumple: lo dice con un 0 y no como «menos de 20 niños»', async () => {
    api('visualizador', { insuficiente: true, vacio: true, ninos: 0, minimo: 20 })
    montar('/explorar?f=sexo|lista|F')
    expect(await screen.findByText('Ningún niño cumple estos filtros')).toBeInTheDocument()
    expect(screen.getByText(/Son 0 niños de este corte/)).toBeInTheDocument()
    expect(screen.queryByText(/Con menos de 20 niños no se muestran cifras/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar todos los filtros' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Quitar filtro Sexo' })).not.toBeInTheDocument())
  })

  it('el tiempo y el muestreo se leen de la dirección, se mandan en la consulta y se pueden compartir', async () => {
    const llamadas = api('admin')
    montar('/explorar?t=fecha_nacimiento|periodo|2018|2019-12&m=sede|300|11')
    await screen.findByText('niños en el grupo, de 600')
    const cuerpo = JSON.parse(String(llamadas.find((l) => l.url === '/api/exploracion/resumen')!.init!.body))
    expect(cuerpo.muestra).toEqual({
      version: 2, y: [],
      tiempo: { fecha: 'fecha_nacimiento', modo: 'periodo', desde: '2018', hasta: '2019-12' },
      muestreo: { modo: 'estratificado', por: 'sede', maximo_por_categoria: 300, semilla: 11 },
    })
    expect(screen.getByText('Tiempo: 2018 a 2019-12')).toBeInTheDocument()
    expect(screen.getByText('Muestreo: hasta 300 por categoría')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Fecha que manda' })).toHaveValue('fecha_nacimiento')
    expect(screen.getByRole('textbox', { name: 'Desde' })).toHaveValue('2018')
    expect(screen.getByRole('textbox', { name: 'Máximo por categoría' })).toHaveValue('300')
  })

  it('elegir el período y el muestreo en el panel escribe la dirección', async () => {
    api('admin')
    montar('/explorar?f=sexo|lista|F', <Ubicacion />)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Período' }), { target: { value: 'periodo' } })
    const desde = await screen.findByRole('textbox', { name: 'Desde' })
    fireEvent.change(desde, { target: { value: '2018' } })
    fireEvent.blur(desde)
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('t=fecha_nacimiento|periodo|2018|'))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=sexo|lista|F')   // no pierde los demás filtros
    fireEvent.change(screen.getByRole('combobox', { name: 'Fecha que manda' }), { target: { value: 'anio_nacimiento' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('t=anio_nacimiento|periodo|2018|'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Muestreo' }), { target: { value: 'estratificado' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('m=sede|300|11'))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar el tiempo' }))
    await waitFor(() => expect(screen.getByTestId('ubicacion')).not.toHaveTextContent('t='))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('m=sede|300|11')
  })

  it('un año mal escrito se avisa y no se aplica', async () => {
    api('admin')
    montar('/explorar', <Ubicacion />)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Período' }), { target: { value: 'periodo' } })
    const desde = await screen.findByRole('textbox', { name: 'Desde' })
    fireEvent.change(desde, { target: { value: '18/03' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Escriba el año')
    fireEvent.blur(desde)
    expect(screen.getByTestId('ubicacion')).not.toHaveTextContent('t=')
  })

  it('una variable de medición se agrega con su regla de lectura y la regla viaja en la dirección', async () => {
    const llamadas = api('experto')
    montar('/explorar', <Ubicacion />)
    expect(await screen.findByRole('combobox', { name: 'Regla de lectura: Oxigenodependencia' })).toHaveValue('alguna')
    // otra variable de las que se miden: se agrega con «+ Agregar variable» y la pide en las facetas
    fireEvent.change(screen.getByRole('combobox', { name: 'Agregar variable' }), { target: { value: 'hematocrito' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('v=hematocrito|alguna'))
    await waitFor(() => {
      const cuerpos = llamadas.filter((l) => l.url === '/api/exploracion/facetas').map((l) => JSON.parse(String(l.init!.body)))
      expect(cuerpos.some((c) => c.variables?.[0]?.variable === 'hematocrito' && c.variables[0].cuando === 'alguna')).toBe(true)
    })
    // cambiar la regla de la que ya filtra cambia el «cuando» del filtro
    fireEvent.click(screen.getByRole('checkbox', { name: /^Sí/ }))
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=oxigeno|si_no|true|alguna'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Regla de lectura: Oxigenodependencia' }), { target: { value: 'etapa:40 sem' } })
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=oxigeno|si_no|true|etapa%3A40%20sem'))
    expect(within(screen.getByRole('list', { name: 'Filtros activos' })).getByText('Oxigenodependencia (en la visita 40 semanas): Sí')).toBeInTheDocument()
  })

  it('la dirección guarda y recupera cada filtro, el tiempo y el muestreo tal como se eligieron', () => {
    const e: EntradaFiltro = { variable: 'oxigeno_3m', tipo: 'lista', op: 'en', valores: ['1', 'a|b;c'], cuando: 'etapa:3 m EC' }
    expect(decodificar(codificar(e))).toEqual(e)
    const primera: EntradaFiltro = { variable: 'ern_sexo', tipo: 'lista', op: 'en', valores: ['F'], cuando: 'primera' }
    expect(codificar(primera)).toBe('ern_sexo|lista|F')   // «primera» es lo de siempre y no se escribe
    expect(decodificar('ern_sexo|lista|F')).toEqual(primera)
    expect(decodificar('eg_categoria|lista|extremo')).toEqual({ variable: 'eg_categoria', tipo: 'lista', op: 'en', valores: ['extremo'] })
    const cero: EntradaFiltro = { variable: 'peso', tipo: 'numero', op: 'entre', valores: [0, null], cuando: 'primera' }
    expect(decodificar(codificar(cero))).toEqual(cero)   // 0 es un valor, no «sin valor»
    const t = { fecha: 'anio_nacimiento', modo: 'periodo', desde: '2018', hasta: '2019-12' } as const
    expect(decodificarTiempo(codificarTiempo(t))).toEqual(t)
    const meses = { fecha: 'fecha_nacimiento', modo: 'ultimos_meses', desde: 24 } as const
    expect(decodificarTiempo(codificarTiempo(meses))).toEqual(meses)
    expect(decodificarTiempo('fecha_nacimiento|periodo||')).toBeNull()
    expect(decodificarTiempo('fecha_nacimiento|ultimos_meses|0')).toBeNull()
    const m = { modo: 'estratificado', por: 'ern_lubchencofenton', maximo_por_categoria: 50, semilla: 0 } as const
    expect(decodificarMuestreo(codificarMuestreo(m))).toEqual(m)
    expect(decodificarMuestreo('sede|0|1')).toBeNull()
  })

  it('marcar una opción cambia la dirección y quitar la ficha la limpia; «<5» no da la cifra', async () => {
    api('experto')
    montar('/explorar', <Ubicacion />)
    const masculino = await screen.findByRole('checkbox', { name: /Masculino/ })
    expect(screen.getByRole('checkbox', { name: /Femenino/ }).closest('li')).toHaveTextContent('<5')
    fireEvent.click(masculino)
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('f=sexo|lista|M'))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro Sexo' }))
    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent(/^$/))
  })

  it('una variable agregada con «+ Agregar variable» se puede retirar, con su filtro', async () => {
    api('experto')
    montar('/explorar?f=peso_nacer|numero|1000|2000', <Ubicacion />)
    expect(await screen.findByRole('button', { name: 'Quitar variable Peso al nacer' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar variable Peso al nacer' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Quitar variable Peso al nacer' })).not.toBeInTheDocument())
    expect(screen.getByTestId('ubicacion')).not.toHaveTextContent('peso_nacer')
    // una variable agregada sin filtro también se retira
    fireEvent.change(screen.getByLabelText('Agregar variable'), { target: { value: 'peso_nacer' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar variable Peso al nacer' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Quitar variable Peso al nacer' })).not.toBeInTheDocument())
  })

  it('con menos de 20 niños dice que no hay cifras y no dibuja nada', async () => {
    api('visualizador', { insuficiente: true, ninos: null, minimo: 20 })
    montar('/explorar?f=sexo|lista|F')
    expect(await screen.findByText(/Con menos de 20 niños no se muestran cifras/)).toBeInTheDocument()
    expect(screen.queryByText('niños con algún riesgo alto')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Riesgo del grupo elegido' })).not.toBeInTheDocument()
  })

  it('quien solo consulta no ve los filtros guardados y se le avisa de las cifras aproximadas', async () => {
    const llamadas = api('visualizador')
    montar('/explorar')
    await screen.findByText('niños en el grupo, de 600')
    expect(screen.queryByRole('button', { name: 'Guardar este filtro' })).not.toBeInTheDocument()
    expect(screen.getByText(/se aproximan de 5 en 5/)).toBeInTheDocument()
    expect(llamadas.some((l) => l.url === '/api/muestras')).toBe(false)
  })

  it('un experto guarda el filtro con su nombre', async () => {
    const llamadas = api('experto')
    montar('/explorar?f=sexo|lista|M')
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar este filtro' }))
    fireEvent.change(screen.getByLabelText('Nombre del filtro'), { target: { value: 'Varones' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/muestras' && l.init?.method === 'POST')).toBe(true))
    const envio = llamadas.find((l) => l.url === '/api/muestras' && l.init?.method === 'POST')!
    expect(JSON.parse(String(envio.init!.body))).toMatchObject({ titulo: 'Varones', muestra: { version: 2, y: [{ variable: 'sexo', valores: ['M'] }] } })
  })

  it.each(['admin', 'experto', 'visualizador'] as const)('el menú de %s ya no ofrece «Explorar»: se llega desde la vista clínica', async (rol) => {
    api(rol)
    montar('/explorar')
    expect((await screen.findAllByRole('link', { name: 'Vista clínica' })).length).toBeGreaterThan(0)
    expect(screen.queryAllByRole('link', { name: 'Explorar' })).toHaveLength(0)
  })
})
