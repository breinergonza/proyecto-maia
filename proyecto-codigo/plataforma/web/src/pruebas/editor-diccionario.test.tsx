import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VersionDiccionario, VistaDiccionario } from '../api/tipos-diccionario'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const version = (v: number, estado: VersionDiccionario['estado']): VersionDiccionario => ({
  id: v * 10, version: v, estado, origen: 'subido', nota: null, sha256: 'x', tamano: 50_000, creado_por: null,
  creado_en: '2026-10-30T10:00:00Z',
})
const col = (clave: string, titulo: string, extra = {}) => ({
  clave, titulo, explica: `Ayuda de ${titulo}.`, opciones: [], lista: null, largo: false, tipo: 'texto' as const, obligatoria: false, ...extra,
})
const vigente = version(2, 'vigente')
const vista: VistaDiccionario = {
  version: vigente,
  hojas: [
    { nombre: 'Variables', describe: 'Una fila por variable de la base', clave: 'variable', agregar: false,
      columnas: [col('variable', 'Variable', { obligatoria: true }),
        col('estado', 'Estado', { opciones: ['Lista', 'Por clasificar', 'No usar'], obligatoria: true }),
        col('etiqueta', 'Nombre'), col('etapa', 'Visita', { lista: 'Visitas' }), col('tolerancia', 'Tolerancia', { tipo: 'numero' })],
      filas: [['var_simulada_a', 'Por clasificar', 'Variable simulada A', '3 m EC', null],
        ['var_simulada_b', 'Lista', 'Variable simulada B', null, '2']] },
    { nombre: 'Visitas', describe: 'Las visitas del seguimiento', clave: 'etapa', agregar: true,
      columnas: [col('etapa', 'Visita', { obligatoria: true }), col('nombre', 'Nombre'), col('orden', 'Orden', { tipo: 'numero', obligatoria: true })],
      filas: [['3 m EC', '3 meses', '3']] },
  ],
}
const diferencias = {
  nuevas: [], quitadas: [], desenlaces_activados: [], desenlaces_apagados: [], sin_cambios: false, vigente: 2,
  estados: [{ variable: 'var_simulada_a', etiqueta: 'Nombre corregido', estado: 'Lista', tema: null, etapa: '3 m EC', visita: '3 meses',
    nota: null, antes: 'Por clasificar', despues: 'Lista' }],
}
const pendientes = {
  vigente, total: 1, borrador: null,
  variables: [{ variable: 'var_simulada_a', etiqueta: 'Variable simulada A', estado: 'Por clasificar', tema: null, etapa: '3 m EC',
    visita: '3 meses', nota: null }],
}

function api(extra?: (url: string, init?: RequestInit) => { estado?: number; cuerpo?: unknown } | undefined) {
  return simularApi((url, init) => (url === '/api/auth/refrescar' ? { cuerpo: { acceso: 't', usuario: usuario('experto') } } : undefined)
    ?? extra?.(url, init) ?? (
    url === '/api/diccionario/por-clasificar' ? { cuerpo: pendientes }
      : url === '/api/diccionario/versiones' ? { cuerpo: [vigente, version(1, 'archivado')] }
        : url === '/api/diccionario/versiones/20/vista' ? { cuerpo: vista }
          : url === '/api/diccionario/editar/revisar' ? { cuerpo: diferencias }
            : url === '/api/diccionario/editar' ? { estado: 201, cuerpo: version(3, 'vigente') }
              : undefined))
}

const cuerpo = (llamadas: { url: string; init?: RequestInit }[], url: string) =>
  JSON.parse(String(llamadas.find((l) => l.url === url)!.init!.body))

describe('editar el diccionario con formularios', () => {
  it('edita una variable y agrega una visita; revisa los cambios y guarda una versión nueva', async () => {
    const llamadas = api()
    montar('/diccionario')
    const editor = await screen.findByRole('region', { name: 'Editar el diccionario' })
    await userEvent.click(await within(editor).findByRole('button', { name: 'Editar var_simulada_a' }))
    let formulario = await screen.findByRole('dialog', { name: /var_simulada_a/ })
    expect(within(formulario).getByText('Ayuda de Nombre.')).toBeInTheDocument()
    expect(within(formulario).getByLabelText(/^Variable/)).toBeDisabled()   // el código no se cambia
    await userEvent.selectOptions(within(formulario).getByLabelText(/^Estado/), 'Lista')
    const nombre = within(formulario).getByLabelText('Nombre')
    await userEvent.clear(nombre)
    await userEvent.type(nombre, 'Nombre corregido')
    await userEvent.click(within(formulario).getByRole('button', { name: 'Aplicar' }))
    expect(screen.queryByRole('dialog', { name: /var_simulada_a/ })).not.toBeInTheDocument()
    expect(within(editor).getByText('Nombre corregido')).toBeInTheDocument()
    expect(within(editor).getByText('1 fila con cambios sin guardar')).toBeInTheDocument()

    await userEvent.click(within(editor).getByRole('tab', { name: /Visitas/ }))
    await userEvent.click(within(editor).getByRole('button', { name: 'Agregar fila' }))
    formulario = await screen.findByRole('dialog', { name: /Fila nueva/ })
    await userEvent.type(within(formulario).getByLabelText(/^Visita/), '6 m EC')
    await userEvent.type(within(formulario).getByLabelText('Nombre'), '6 meses')
    await userEvent.type(within(formulario).getByLabelText(/^Orden/), '4')
    await userEvent.click(within(formulario).getByRole('button', { name: 'Aplicar' }))
    expect(within(editor).getByText('2 filas con cambios sin guardar')).toBeInTheDocument()

    await userEvent.click(within(editor).getByRole('button', { name: 'Revisar y guardar' }))
    const revision = await screen.findByRole('dialog', { name: 'Revisar los cambios' })
    expect(await within(revision).findByText(/Por clasificar → /)).toBeInTheDocument()
    expect(within(revision).getByText('Variable simulada A → Nombre corregido')).toBeInTheDocument()
    expect(cuerpo(llamadas, '/api/diccionario/editar/revisar')).toEqual({
      base: 20, nota: null,
      cambios: [
        { hoja: 'Variables', accion: 'editar', clave: 'var_simulada_a', valores: { estado: 'Lista', etiqueta: 'Nombre corregido' } },
        { hoja: 'Visitas', accion: 'agregar', clave: null, valores: { etapa: '6 m EC', nombre: '6 meses', orden: '4' } },
      ],
    })
    expect(llamadas.some((l) => l.url === '/api/diccionario/editar')).toBe(false)   // revisar no guarda
    await userEvent.type(within(revision).getByLabelText('Nota (opcional)'), 'Corrijo A')
    await userEvent.click(within(revision).getByRole('button', { name: 'Guardar versión nueva' }))
    expect(await screen.findByText('La versión 3 quedó en uso.')).toBeInTheDocument()
    expect(cuerpo(llamadas, '/api/diccionario/editar').nota).toBe('Corrijo A')
    await waitFor(() => expect(within(editor).queryByText(/sin guardar/)).not.toBeInTheDocument())
  }, 15_000)   // recorre dos formularios y la revisión: con la suite en paralelo pasa de 5 s

  it('los errores del núcleo se muestran sin dejar guardar, y un cambio de otra persona pide revisar otra vez', async () => {
    let conflicto = false
    api((url) => url === '/api/diccionario/editar/revisar'
      ? conflicto ? { estado: 409, cuerpo: { detail: 'Mientras editaba se guardó la versión 3. Sus cambios siguen aquí.' } }
        : { estado: 422, cuerpo: { detail: 'El diccionario tiene 1 problema(s) por corregir:\n- Variables · var_simulada_a: falta Rol.' } }
      : undefined)
    montar('/diccionario')
    const editor = await screen.findByRole('region', { name: 'Editar el diccionario' })
    await userEvent.click(await within(editor).findByRole('button', { name: 'Editar var_simulada_a' }))
    const formulario = await screen.findByRole('dialog', { name: /var_simulada_a/ })
    await userEvent.selectOptions(within(formulario).getByLabelText(/^Estado/), 'Lista')
    await userEvent.click(within(formulario).getByRole('button', { name: 'Aplicar' }))
    await userEvent.click(within(editor).getByRole('button', { name: 'Revisar y guardar' }))
    let revision = await screen.findByRole('dialog', { name: 'Revisar los cambios' })
    expect(await within(revision).findByText(/Variables · var_simulada_a: falta Rol/)).toBeInTheDocument()
    expect(within(revision).queryByRole('button', { name: 'Guardar versión nueva' })).not.toBeInTheDocument()
    await userEvent.click(within(revision).getByRole('button', { name: 'Seguir editando' }))
    conflicto = true
    await userEvent.click(within(editor).getByRole('button', { name: 'Revisar y guardar' }))
    revision = await screen.findByRole('dialog', { name: 'Revisar los cambios' })
    expect(await within(revision).findByText(/Mientras editaba se guardó la versión 3/)).toBeInTheDocument()
    expect(within(editor).getByText('1 fila con cambios sin guardar')).toBeInTheDocument()   // no se pierden
  })

  it('«Completar» abre el formulario de una variable por clasificar; las variables no se agregan ni se borran', async () => {
    api()
    montar('/diccionario?ver=clasificar')
    await userEvent.click(await screen.findByRole('button', { name: 'Completar var_simulada_a' }))
    const formulario = await screen.findByRole('dialog', { name: /var_simulada_a/ })
    expect(within(formulario).queryByRole('button', { name: 'Quitar la fila' })).not.toBeInTheDocument()
    const editor = screen.getByRole('region', { name: 'Editar el diccionario' })
    expect(within(editor).queryByRole('button', { name: 'Agregar fila' })).not.toBeInTheDocument()
  })
})
