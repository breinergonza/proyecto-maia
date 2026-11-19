// Diálogo de confirmación: devuelve true/false, foco inicial, Escape, clic fuera, trampa de foco y retorno del foco.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useConfirmar, type OpcionesConfirmar } from '../components/Confirmar'

function Prueba({ opciones, alResolver }: { opciones: OpcionesConfirmar; alResolver: (ok: boolean) => void }) {
  const { confirmar, dialogo } = useConfirmar()
  return (
    <>
      <button type="button" onClick={async () => alResolver(await confirmar(opciones))}>Abrir</button>
      {dialogo}
    </>
  )
}
const base: OpcionesConfirmar = { titulo: 'Borrar programación', mensaje: 'Se borrará «Mensual».', efecto: 'Deja de ejecutarse.', reversible: false, textoConfirmar: 'Borrar programación', tono: 'peligro' }

function montarPrueba(opciones = base) {
  const r: boolean[] = []
  render(<Prueba opciones={opciones} alResolver={(ok) => r.push(ok)} />)
  return r
}

describe('Confirmar', () => {
  it('muestra el título, lo que cambia, si se puede deshacer y el botón con su acción', async () => {
    montarPrueba()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const d = await screen.findByRole('alertdialog', { name: 'Borrar programación' })
    expect(d).toHaveAttribute('aria-modal', 'true')
    expect(d).toHaveAccessibleDescription(/Se borrará «Mensual»/)
    expect(d).toHaveTextContent('Deja de ejecutarse.')
    expect(d).toHaveTextContent('No se puede deshacer')
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument()
  })

  it('en tono de peligro el foco inicial está en «Cancelar»; en tono normal, en la acción', async () => {
    const { unmount } = render(<Prueba opciones={base} alResolver={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(await screen.findByRole('button', { name: 'Cancelar' })).toHaveFocus()
    unmount()
    render(<Prueba opciones={{ ...base, tono: 'normal', reversible: true, textoConfirmar: 'Cambiar perfil' }} alResolver={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(await screen.findByRole('button', { name: 'Cambiar perfil' })).toHaveFocus()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Se puede deshacer')
  })

  it('devuelve true al confirmar y false al cancelar', async () => {
    const r = montarPrueba()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Borrar programación' }))
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(r).toEqual([true, false])
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('Escape y el clic fuera cancelan, y el foco vuelve a quien lo abrió', async () => {
    const r = montarPrueba()
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    await userEvent.click(abrir)
    await screen.findByRole('alertdialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await vi_esperar()
    expect(abrir).toHaveFocus()
    await userEvent.click(abrir)
    const d = await screen.findByRole('alertdialog')
    await userEvent.pointer({ keys: '[MouseLeft]', target: d.parentElement! })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(r).toEqual([false, false])
  })

  it('el foco no sale del diálogo con Tab', async () => {
    montarPrueba()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const cancelar = await screen.findByRole('button', { name: 'Cancelar' })
    const accion = screen.getByRole('button', { name: 'Borrar programación' })
    await userEvent.tab()
    expect(accion).toHaveFocus()
    await userEvent.tab()
    expect(cancelar).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(accion).toHaveFocus()
  })
})

const vi_esperar = () => new Promise((ok) => setTimeout(ok, 10))
