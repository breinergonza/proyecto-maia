// Término con definición: se abre con foco, cursor o clic, se cierra con Escape y todas las definiciones son breves.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Termino } from '../components/Termino'
import { GLOSARIO } from '../lib/glosario'

describe('Termino', () => {
  it('relaciona el botón con su definición y la oculta al inicio', () => {
    render(<Termino id="auc">AUC</Termino>)
    const boton = screen.getByRole('button', { name: /AUC/ })
    const def = document.getElementById(boton.getAttribute('aria-describedby')!)!
    expect(def).toHaveTextContent(GLOSARIO.auc)
    expect(def).not.toBeVisible()
  })
  it('muestra la definición al enfocar y la cierra con Escape', async () => {
    const u = userEvent.setup()
    render(<Termino id="psi">PSI</Termino>)
    await u.tab()
    expect(screen.getByRole('tooltip', { hidden: true })).toBeVisible()
    await u.keyboard('{Escape}')
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible()
  })
  it('la muestra al pasar el cursor y al hacer clic', async () => {
    const u = userEvent.setup()
    render(<Termino id="percentil">percentil</Termino>)
    const boton = screen.getByRole('button', { name: /percentil/ })
    await u.hover(boton)
    expect(screen.getByRole('tooltip', { hidden: true })).toBeVisible()
    await u.unhover(boton)
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible()
    await u.click(boton)
    expect(screen.getByRole('tooltip', { hidden: true })).toBeVisible()
    await u.unhover(boton)
    expect(screen.getByRole('tooltip', { hidden: true })).toBeVisible()
    await u.click(boton)
    await u.unhover(boton)
    expect(screen.getByRole('tooltip', { hidden: true })).not.toBeVisible()
  })
  it('todas las definiciones tienen 160 caracteres o menos', () => {
    for (const [id, texto] of Object.entries(GLOSARIO)) expect(texto.length, id).toBeLessThanOrEqual(160)
  })
})
