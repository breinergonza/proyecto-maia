import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const caso = (id: number, extra = {}) => ({
  id, sujeto: `N-${id}`, clave: 'oxigeno', desenlace: 'Oxígeno a los 12 meses', momento: '40s', momento_nombre: '40 semanas',
  fecha_visita: '2026-03-01', preocupa: null, comentario: null, resumen: ['Edad gestacional: 30 semanas'], ...extra,
})

const api = (rol: 'admin' | 'experto' | 'visualizador', items = [caso(1), caso(2), caso(3)]) => (url: string) =>
  url === '/api/auth/refrescar' ? { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    : url === '/api/revision/riesgos' ? { cuerpo: { corrida_id: 3, items } }
      : url === '/api/revision/resumen' ? { cuerpo: { corrida_id: 3, datos_por_capa: [], riesgos_por_grupo: [] } }
        : url.startsWith('/api/revision/riesgos/') ? { estado: 204, cuerpo: null } : undefined

describe('Revisión de riesgos simplificada', () => {
  it('muestra un niño por pantalla, con una pregunta y tres respuestas, sin riesgo ni posición', async () => {
    simularApi(api('experto'))
    montar('/revision/riesgos')
    expect(await screen.findByText(/Niño 1 de 3/)).toBeInTheDocument()
    expect(screen.queryByText(/N-2/)).toBeNull()                                     // solo uno a la vez
    expect(screen.getByText('¿Le preocupa este niño?')).toBeInTheDocument()
    for (const n of ['Sí, me preocupa', 'No me preocupa', 'No lo sé']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Avance de la revisión' })).toHaveAttribute('aria-valuenow', '0')
    expect(document.body.textContent).not.toMatch(/percentil|posici[oó]n|riesgo calculado:/i)
  })

  it('responde con el motivo opcional y pasa al niño siguiente', async () => {
    const llamadas = simularApi(api('experto'))
    montar('/revision/riesgos')
    await screen.findByText(/Niño 1 de 3/)
    await userEvent.type(screen.getByLabelText(/Motivo/), 'Poco peso')
    await userEvent.click(screen.getByRole('button', { name: 'Sí, me preocupa' }))
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/revision/riesgos/1' && l.init?.method === 'POST')).toBe(true))
    expect(JSON.parse(String(llamadas.find((l) => l.url === '/api/revision/riesgos/1')?.init?.body))).toEqual({ preocupa: 'si', comentario: 'Poco peso' })
  })

  it('empieza en el primer niño sin responder y deja volver atrás', async () => {
    simularApi(api('experto', [caso(1, { preocupa: 'no' }), caso(2), caso(3)]))
    montar('/revision/riesgos')
    expect(await screen.findByText(/Niño 2 de 3/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(await screen.findByText(/Niño 1 de 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No me preocupa' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('al terminar lo dice y el experto no ve el resumen', async () => {
    simularApi(api('experto', [caso(1, { preocupa: 'si' })]))
    montar('/revision/riesgos')
    expect(await screen.findByText(/Respondió a todos los niños/)).toBeInTheDocument()
    expect(screen.queryByText('Lo que va de la revisión')).toBeNull()
  })

  it('el admin ve además el resumen de lo que va de la revisión', async () => {
    simularApi(api('admin', [caso(1)]))
    montar('/revision/riesgos')
    expect(await screen.findByText('Lo que va de la revisión')).toBeInTheDocument()
    expect((await screen.findAllByText(/Niño 1 de 1/)).length).toBeGreaterThan(0)
  })

  it('el visualizador no entra', async () => {
    simularApi(api('visualizador'))
    montar('/revision/riesgos')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })
})
