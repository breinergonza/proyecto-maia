// Impresión de la ficha: el botón abre el diálogo de impresión y lo que no sirve en papel lleva la marca de no imprimir.
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const nino = {
  sujeto: 'K-001', grupo: 'A', eg_semanas: 31, anio_nacimiento: 2024, corte: '2026-06-30', corrida_id: 1,
  visitas: [], contexto: [], crecimiento: {}, nombre_etapa: {},
}

function api() {
  simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
    if (url.includes('/linea-temporal')) return { cuerpo: nino }
    return { cuerpo: [] }
  })
}

describe('imprimir la ficha', () => {
  it('«Imprimir ficha» llama a window.print y el título trae el código y el corte', async () => {
    api()
    const imprimir = vi.fn()
    vi.stubGlobal('print', imprimir)
    montar('/ninos/K-001')
    const boton = await screen.findByRole('button', { name: /Imprimir ficha/ })
    fireEvent.click(boton)
    expect(imprimir).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Niño K-001')
    expect(screen.getByText(/Datos al 30 de jun/)).toBeInTheDocument()
  })

  it('las acciones llevan no-imprimir y el pie de impresión dice que no reemplaza el criterio médico', async () => {
    api()
    montar('/ninos/K-001')
    const boton = await screen.findByRole('button', { name: /Imprimir ficha/ })
    expect(boton.closest('.no-imprimir')).not.toBeNull()
    expect(screen.getByRole('link', { name: /Todos los niños/ }).closest('.no-imprimir')).not.toBeNull()
    expect(document.querySelector('.solo-imprimir')?.textContent).toMatch(/Impreso el .* · KMCPred · Documento de apoyo clínico: no reemplaza el criterio médico/)
  })
})
