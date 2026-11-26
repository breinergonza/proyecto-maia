import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LimiteError } from '../components/LimiteError'

afterEach(() => vi.restoreAllMocks())

describe('LimiteError', () => {
  it('muestra el aviso con el nombre y Reintentar vuelve a dibujar', () => {
    let falla = true
    function Roto() { if (falla) throw new Error('boom'); return <p>listo</p> }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LimiteError nombre="el resumen"><Roto /></LimiteError>)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo mostrar el resumen. Los demás datos de la pantalla siguen disponibles.')
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument()
    expect(log).toHaveBeenCalled()
    falla = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByText('listo')).toBeInTheDocument()
  })
  it('sin nombre dice «esto»', () => {
    function Roto(): never { throw new Error('x') }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LimiteError compacto><Roto /></LimiteError>)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo mostrar esto.')
  })
})
