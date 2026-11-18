import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CampoCorreos } from '../components/CampoCorreos'
import { analizarCorreos, esCorreo } from '../lib/correos'

function Caja({ inicial = [] as string[] }) {
  const [v, setV] = useState(inicial)
  return <CampoCorreos id="c" etiqueta="Correos" value={v} onChange={setV} />
}

describe('máscara de correo', () => {
  it('acepta correos válidos y rechaza los que no', () => {
    expect(esCorreo('ana@maia.org')).toBe(true)
    for (const malo of ['ana', 'ana@', '@maia.org', 'ana@maia', 'a na@maia.org', 'ana@@maia.org']) expect(esCorreo(malo)).toBe(false)
  })
  it('separa una lista pegada y avisa de lo malo y lo repetido', () => {
    expect(analizarCorreos('A@maia.org, b@maia.org;malo\nB@maia.org', ['a@maia.org']))
      .toEqual({ validos: ['b@maia.org'], invalidos: ['malo'], repetidos: ['a@maia.org', 'b@maia.org'] })
  })
})

describe('CampoCorreos', () => {
  it('agrega con Enter, coma o espacio y los muestra como etiquetas', async () => {
    const u = userEvent.setup()
    render(<Caja />)
    const campo = screen.getByRole('textbox', { name: 'Correos' })
    await u.type(campo, 'ana@maia.org{Enter}')
    await u.type(campo, 'luis@maia.org,')
    await u.type(campo, 'eva@maia.org ')
    for (const c of ['ana@maia.org', 'luis@maia.org', 'eva@maia.org']) expect(screen.getByText(c)).toBeInTheDocument()
    expect(campo).toHaveValue('')
  })
  it('muestra el error al instante y no agrega un correo inválido', async () => {
    const u = userEvent.setup()
    render(<Caja />)
    const campo = screen.getByRole('textbox', { name: 'Correos' })
    await u.type(campo, 'ana@maia{Enter}')
    expect(screen.getByText(/no es un correo válido/i)).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull()
  })
  it('no repite un correo (sin distinguir mayúsculas)', async () => {
    const u = userEvent.setup()
    render(<Caja inicial={['ana@maia.org']} />)
    await u.type(screen.getByRole('textbox', { name: 'Correos' }), 'ANA@maia.org{Enter}')
    expect(screen.getByText(/ya está en la lista/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Quitar/ })).toHaveLength(1)
  })
  it('acepta una lista pegada', async () => {
    const u = userEvent.setup()
    render(<Caja />)
    await u.click(screen.getByRole('textbox', { name: 'Correos' }))
    await u.paste('a@maia.org, b@maia.org\nc@maia.org')
    expect(screen.getAllByRole('button', { name: /Quitar/ })).toHaveLength(3)
  })
  it('quita con la × y con Retroceso en el campo vacío', async () => {
    const u = userEvent.setup()
    render(<Caja inicial={['a@maia.org', 'b@maia.org']} />)
    await u.click(screen.getByRole('button', { name: 'Quitar a@maia.org' }))
    expect(screen.queryByText('a@maia.org')).toBeNull()
    await u.click(screen.getByRole('textbox', { name: 'Correos' }))
    await u.keyboard('{Backspace}')
    expect(screen.queryByText('b@maia.org')).toBeNull()
  })
  it('agrega al salir del campo si quedó algo escrito', async () => {
    const u = userEvent.setup()
    render(<><Caja /><button>otro</button></>)
    await u.type(screen.getByRole('textbox', { name: 'Correos' }), 'ana@maia.org')
    await u.click(screen.getByRole('button', { name: 'otro' }))
    expect(screen.getByText('ana@maia.org')).toBeInTheDocument()
  })
  it('Enter dentro del campo no envía el formulario que lo contiene', async () => {
    const u = userEvent.setup()
    let enviado = 0
    render(<form onSubmit={(e) => { e.preventDefault(); enviado++ }}><Caja /></form>)
    const campo = screen.getByRole('textbox', { name: 'Correos' })
    await u.type(campo, '{Enter}')           // vacío
    await u.type(campo, 'ana@maia.org{Enter}')
    await u.type(campo, 'mal{Enter}')        // inválido
    expect(enviado).toBe(0)
  })
  describe('texto que llega de golpe (teclado móvil, autocompletado)', () => {
    const campo = () => screen.getByRole('textbox', { name: 'Correos' })
    it('agrega un correo que termina en espacio y vacía el campo', () => {
      render(<Caja />)
      fireEvent.change(campo(), { target: { value: 'ana@maia.org ' } })
      expect(screen.getByText('ana@maia.org')).toBeInTheDocument()
      expect(campo()).toHaveValue('')
    })
    it('agrega varios correos separados por comas', () => {
      render(<Caja />)
      fireEvent.change(campo(), { target: { value: 'a@x.co,b@x.co,' } })
      expect(screen.getAllByRole('button', { name: /Quitar/ })).toHaveLength(2)
    })
    it('no agrega un inválido, muestra el error y lo deja para corregir', () => {
      render(<Caja />)
      fireEvent.change(campo(), { target: { value: 'ana@maia,' } })
      expect(screen.getByText(/no es un correo válido/i)).toBeInTheDocument()
      expect(campo()).toHaveValue('ana@maia')
      expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull()
    })
    it('sin separador final solo guarda el texto', () => {
      render(<Caja />)
      fireEvent.change(campo(), { target: { value: 'ana@maia.org' } })
      expect(campo()).toHaveValue('ana@maia.org')
      expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull()
    })
  })
})
