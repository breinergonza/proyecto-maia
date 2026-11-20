import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PorClasificar, VersionDiccionario } from '../api/tipos-diccionario'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const como = (rol: 'experto' | 'visualizador') => (url: string) =>
  url === '/api/auth/refrescar' ? { cuerpo: { acceso: 't', usuario: usuario(rol) } } : undefined

const version = (v: number, estado: VersionDiccionario['estado'], origen: VersionDiccionario['origen'], extra = {}): VersionDiccionario => ({
  id: v * 10, version: v, estado, origen, nota: null, sha256: 'x', tamano: 50_000, creado_por: null,
  creado_en: '2026-10-30T10:00:00Z', ...extra,
})
const variable = (nombre: string, etiqueta: string) => ({
  variable: nombre, etiqueta, estado: 'Por clasificar', tema: null, etapa: '3 m EC', visita: '3 meses (edad corregida)', nota: null,
})
const versiones = [version(2, 'vigente', 'subido', { creado_por: 'Experta', nota: 'Dos nuevas' }), version(1, 'archivado', 'semilla')]
const pendientes: PorClasificar = {
  vigente: versiones[0], variables: [variable('var_simulada_a', 'Variable simulada A')], total: 3,
  borrador: { version: version(3, 'borrador', 'corrida'), nuevas: [variable('var_simulada_b', 'Variable simulada B'), variable('var_simulada_c', 'Variable simulada C')] },
}
const diferencias = {
  nuevas: [variable('var_simulada_d', 'Variable simulada D')], quitadas: [], estados: [],
  desenlaces_activados: [{ clave: 'apnea_40s', nombre: 'apnea a las 40 semanas', antes: 'En prueba', despues: 'En uso' }],
  desenlaces_apagados: [], sin_cambios: false, vigente: 2,
}

function api(extra?: (url: string, init?: RequestInit) => { estado?: number; cuerpo?: unknown } | undefined) {
  return simularApi((url, init) => como('experto')(url) ?? extra?.(url, init) ?? (
    url === '/api/diccionario/por-clasificar' ? { cuerpo: pendientes }
      : url === '/api/diccionario/versiones' && (init?.method ?? 'GET') === 'GET' ? { cuerpo: versiones }
        : url === '/api/diccionario/clasificar' ? { cuerpo: version(4, 'vigente', 'subido') }
          : url.endsWith('/activar') ? { cuerpo: version(5, 'vigente', 'corrida') }
            : url === '/api/diccionario/comparar' ? { cuerpo: diferencias }
              : url === '/api/diccionario/versiones' ? { estado: 201, cuerpo: version(6, 'vigente', 'subido') }
                : undefined))
}

describe('diccionario de variables', () => {
  it('la bandeja clasifica con un clic y el menú muestra cuántas faltan', async () => {
    const llamadas = api()
    montar('/diccionario')
    expect(await screen.findByText('Variable simulada A')).toBeInTheDocument()
    expect(screen.getByText(/visita sugerida: 3 meses \(edad corregida\)/)).toBeInTheDocument()
    const enlace = screen.getAllByRole('link', { name: /Diccionario/ })[0]
    expect(within(enlace).getByText('3')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Calcular un niño' }).length).toBeGreaterThan(0)
    // sin palabras técnicas para el equipo clínico
    expect(document.body.textContent).not.toMatch(/sha|corte|corrida/i)
    await userEvent.click(screen.getByRole('button', { name: 'Marcar var_simulada_a como Lista' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/diccionario/clasificar')).toBe(true))
    const post = llamadas.find((l) => l.url === '/api/diccionario/clasificar')!
    expect(JSON.parse(String(post.init!.body))).toEqual({ variable: 'var_simulada_a', estado: 'Lista' })
    expect(await screen.findByText('«var_simulada_a» quedó como «Lista».')).toBeInTheDocument()
  })

  it('muestra la actualización con variables nuevas y permite agregarlas; el historial permite volver', async () => {
    const llamadas = api()
    montar('/diccionario')
    expect(await screen.findByText('La última actualización trajo 2 variables nuevas')).toBeInTheDocument()
    expect(screen.getByText('Variable simulada B')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Agregarlas al diccionario' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/diccionario/versiones/30/activar')).toBe(true))
    expect(await screen.findByText('Subida por Experta')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver a la versión 1' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/diccionario/versiones/10/activar')).toBe(true))
  })

  it('al subir muestra los cambios antes de confirmar', async () => {
    const llamadas = api()
    montar('/diccionario')
    const entrada = await screen.findByLabelText('Archivo de Excel (.xlsx)')
    await userEvent.upload(entrada, new File(['xlsx'], 'diccionario.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    await userEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
    expect(await screen.findByText('Variables nuevas (1)')).toBeInTheDocument()
    expect(screen.getByText(/apnea a las 40 semanas/)).toBeInTheDocument()
    expect(llamadas.some((l) => l.url === '/api/diccionario/versiones' && l.init?.method === 'POST')).toBe(false)
    await userEvent.type(screen.getByLabelText('Nota (opcional)'), 'Agrego D')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y usar esta versión' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/diccionario/versiones' && l.init?.method === 'POST')).toBe(true))
    const post = llamadas.find((l) => l.url === '/api/diccionario/versiones' && l.init?.method === 'POST')!
    const fd = post.init!.body as FormData
    expect(fd.get('nota')).toBe('Agrego D')
    expect((fd.get('archivo') as File).name).toBe('diccionario.xlsx')
    expect(await screen.findByText('La versión 6 quedó en uso.')).toBeInTheDocument()
  })

  it('el historial previsualiza una versión por hojas, con búsqueda, sin descargarla', async () => {
    const vista = {
      version: versiones[1],
      hojas: [
        { nombre: 'Variables', describe: 'Una fila por variable', columnas: [{ clave: 'variable', titulo: 'Variable' }, { clave: 'estado', titulo: 'Estado' }],
          filas: [['var_simulada_a', 'Lista'], ['var_simulada_b', null]] },
        { nombre: 'Visitas', describe: 'Una fila por visita', columnas: [{ clave: 'etapa', titulo: 'Visita' }], filas: [['40 sem']] },
      ],
    }
    const llamadas = api((url) => url === '/api/diccionario/versiones/10/vista' ? { cuerpo: vista } : undefined)
    montar('/diccionario')
    await userEvent.click(await screen.findByRole('button', { name: 'Ver la versión 1' }))
    const dialogo = await screen.findByRole('dialog', { name: /versión 1/ })
    expect(await within(dialogo).findByText('var_simulada_a')).toBeInTheDocument()
    expect(within(dialogo).getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument()
    await userEvent.type(within(dialogo).getByPlaceholderText('Buscar…'), 'simulada_b')
    expect(within(dialogo).queryByText('var_simulada_a')).not.toBeInTheDocument()
    expect(within(dialogo).getByText('1 de 2 filas')).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('tab', { name: /Visitas/ }))
    expect(within(dialogo).getByText('40 sem')).toBeInTheDocument()
    expect(llamadas.some((l) => l.url.endsWith('/archivo'))).toBe(false)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /versión 1/ })).not.toBeInTheDocument()
  })

  it('en el teléfono el historial se apila: cada celda lleva el título de su columna', async () => {
    api()
    montar('/diccionario')
    const celda = (await screen.findByText('Subida por Experta')).closest('td')!
    const fila = celda.closest('tr')!
    expect(celda.closest('.tabla-apilada')).not.toBeNull()
    expect([...fila.children].map((td) => td.getAttribute('data-etiqueta'))).toEqual(['Versión', 'Detalle', ''])
  })

  it('un archivo con errores los muestra en español sin guardar', async () => {
    api((url) => url === '/api/diccionario/comparar'
      ? { estado: 422, cuerpo: { detail: 'El diccionario mio.xlsx tiene 1 problema(s) por corregir:\n- hoja "Variables", fila 4: Tipo "Texto libre" no es válido.' } }
      : undefined)
    montar('/diccionario')
    await userEvent.upload(await screen.findByLabelText('Archivo de Excel (.xlsx)'), new File(['x'], 'mio.xlsx'))
    await userEvent.click(screen.getByRole('button', { name: 'Revisar cambios' }))
    expect(await screen.findByText(/hoja "Variables", fila 4/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar y usar esta versión' })).not.toBeInTheDocument()
  })

  it('la consulta no ve el diccionario', async () => {
    simularApi(como('visualizador'))
    montar('/diccionario')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(screen.queryAllByRole('link', { name: /Diccionario/ })).toHaveLength(0)
  })
})
