// Explorar: las cifras del grupo, el filtro en la dirección, el aviso con menos de 20 niños y el enlace del menú.
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
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
    eg_semanas: { etiqueta: 'Edad gestacional (semanas)', tipo: 'numero', cuando: null, opciones: [
      { valor: 'muy_prematuro', etiqueta: 'Muy prematuro', n: 80, texto: '80', rango: [28, 31.999] },
      { valor: 'a_termino', etiqueta: 'A término', n: 90, texto: '90', rango: [37, null] }] },
    peso_nacer: { etiqueta: 'Peso al nacer', tipo: 'numero', cuando: 'primera', min: 900, max: 4200, bins: [] },
  },
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
    montar('/explorar?f=sexo|lista|F&f=eg_semanas|numero|28;31.999')
    await screen.findByText('niños en el grupo, de 600')
    const cuerpo = JSON.parse(String(llamadas.find((l) => l.url === '/api/exploracion/resumen')!.init!.body))
    expect(cuerpo.muestra.y).toEqual([
      { variable: 'sexo', tipo: 'lista', op: 'en', valores: ['F'], cuando: 'primera' },
      { variable: 'eg_semanas', tipo: 'numero', op: 'entre', valores: [28, 31.999] },
    ])
    // fichas de los filtros activos
    expect(screen.getByRole('button', { name: 'Quitar filtro Sexo' })).toBeInTheDocument()
    expect(screen.getByText('Edad gestacional (semanas): Muy prematuro')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Femenino/ })).toBeChecked()
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

  it.each(['admin', 'experto', 'visualizador'] as const)('el menú de %s tiene «Explorar» debajo de «Tablero»', async (rol) => {
    api(rol)
    montar('/')
    const enlaces = await screen.findAllByRole('link', { name: /^(Tablero|Explorar)$/ })
    const texto = enlaces.map((e) => e.textContent)
    expect(texto.indexOf('Tablero')).toBeGreaterThanOrEqual(0)
    expect(texto.indexOf('Explorar')).toBe(texto.indexOf('Tablero') + 1)
    expect(enlaces.find((e) => e.textContent === 'Explorar')).toHaveAttribute('href', '/explorar')
  })
})
