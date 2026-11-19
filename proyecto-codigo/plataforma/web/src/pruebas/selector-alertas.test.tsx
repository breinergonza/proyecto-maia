import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SelectorAlertas } from '../components/SelectorAlertas'

const OPCIONES = [
  { clave: 'readm3', nombre: 'readmisión a los 3 meses' },
  { clave: 'crec6', nombre: 'crecimiento bajo a los 6 meses' },
  { clave: 'dpm12', nombre: 'desarrollo psicomotor bajo a los 12 meses' },
]
function Caja({ inicial = [] as string[] }) {
  const [v, setV] = useState(inicial)
  return <SelectorAlertas id="a" etiqueta="Alertas" opciones={OPCIONES} value={v} onChange={setV} />
}

describe('SelectorAlertas', () => {
  it('marca varias alertas y dice cuántas hay', async () => {
    const u = userEvent.setup()
    render(<Caja />)
    await u.click(screen.getByRole('checkbox', { name: /readmisión/ }))
    await u.click(screen.getByRole('checkbox', { name: /crecimiento/ }))
    expect(screen.getByRole('checkbox', { name: /readmisión/ })).toBeChecked()
    expect(screen.getByText('2 alertas elegidas')).toBeInTheDocument()
  })
  it('filtra con el buscador sin perder lo elegido', async () => {
    const u = userEvent.setup()
    render(<Caja inicial={['dpm12']} />)
    await u.type(screen.getByRole('searchbox', { name: /Buscar alerta/ }), 'crec')
    expect(screen.queryByRole('checkbox', { name: /readmisión/ })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /crecimiento/ })).toBeInTheDocument()
    await u.clear(screen.getByRole('searchbox'))
    expect(screen.getByRole('checkbox', { name: /desarrollo/ })).toBeChecked()
  })
  it('permite elegir o limpiar todas', async () => {
    const u = userEvent.setup()
    render(<Caja />)
    await u.click(screen.getByRole('button', { name: 'Elegir todas' }))
    expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).checked)).toBe(true)
    await u.click(screen.getByRole('button', { name: 'Quitar todas' }))
    expect(screen.getByText('Ninguna alerta elegida')).toBeInTheDocument()
  })
  it('busca sin distinguir tildes ni mayúsculas', async () => {
    const u = userEvent.setup()
    render(<Caja />)
    await u.type(screen.getByRole('searchbox'), 'READMISION')
    expect(screen.getByRole('checkbox', { name: /readmisión/ })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /crecimiento/ })).toBeNull()
  })
})
