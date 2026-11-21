// Pestañas compartidas: lo que no cabe en una pantalla se reparte en pestañas (sin desplazarse en escritorio).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { PanelesPestana, PanelPestana, Pestanas, usePestanaEnUrl } from '../components/ui/Pestanas'

const CLAVES = ['curva', 'tabla', 'cortes'] as const
const PESTANAS = [{ clave: 'curva', texto: 'Curva' }, { clave: 'tabla', texto: 'Tabla' }, { clave: 'cortes', texto: 'Cortes' }] as const

function Prueba() {
  const [activa, elegir] = usePestanaEnUrl('ver', CLAVES)
  const { search } = useLocation()
  return (
    <>
      <Pestanas prefijo="ver" etiqueta="Qué ver" pestanas={PESTANAS} activa={activa} elegir={elegir} />
      <PanelPestana prefijo="ver" activa={activa}>Contenido de {activa}</PanelPestana>
      <p>dirección: {search}</p>
    </>
  )
}

const montar = (ruta: string) => render(<MemoryRouter initialEntries={[ruta]}><Prueba /></MemoryRouter>)

describe('Pestanas', () => {
  it('muestra la pestaña de la dirección, y la primera si no hay o no existe', () => {
    montar('/x?ver=tabla')
    expect(screen.getByRole('tab', { name: 'Tabla' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Tabla' })).toHaveTextContent('Contenido de tabla')
  })

  it('sin pestaña en la dirección, o con una que no existe, abre la primera', () => {
    montar('/x?ver=otra')
    expect(screen.getByRole('tab', { name: 'Curva' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Tabla' })).toHaveAttribute('tabindex', '-1')
  })

  it('al elegir una pestaña cambia el panel y la dirección, sin perder los demás parámetros', async () => {
    montar('/x?desenlace=d1')
    await userEvent.click(screen.getByRole('tab', { name: 'Cortes' }))
    expect(screen.getByRole('tabpanel', { name: 'Cortes' })).toHaveTextContent('Contenido de cortes')
    expect(screen.getByText(/^dirección:/)).toHaveTextContent('desenlace=d1&ver=cortes')
  })

  it('las flechas, Inicio y Fin cambian de pestaña y llevan el foco', async () => {
    montar('/x')
    screen.getByRole('tab', { name: 'Curva' }).focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Cortes' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Cortes' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Curva' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Tabla' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Cortes' })).toHaveFocus()
  })
})

function Formulario() {
  const [activa, setActiva] = useState<'datos' | 'notas'>('datos')
  return (
    <>
      <Pestanas prefijo="f" etiqueta="Partes" pestanas={[{ clave: 'datos', texto: 'Datos' }, { clave: 'notas', texto: 'Notas' }]} activa={activa} elegir={setActiva} />
      <PanelesPestana prefijo="f" activa={activa} paneles={[
        { clave: 'datos', contenido: <label>Peso<input /></label> },
        { clave: 'notas', contenido: <p>Notas del control</p> },
      ]} />
    </>
  )
}

describe('PanelesPestana', () => {
  it('lo escrito en una pestaña sobrevive al cambiar de pestaña, y las ocultas se imprimen', async () => {
    render(<Formulario />)
    await userEvent.type(screen.getByLabelText('Peso'), '1240')
    await userEvent.click(screen.getByRole('tab', { name: 'Notas' }))
    expect(screen.getByRole('tabpanel', { name: 'Notas' })).toHaveTextContent('Notas del control')
    const oculto = screen.getByLabelText('Peso').closest('div')!
    expect(oculto).toHaveClass('hidden', 'print:block')
    expect(oculto).not.toHaveAttribute('role')
    await userEvent.click(screen.getByRole('tab', { name: 'Datos' }))
    expect(screen.getByLabelText('Peso')).toHaveValue('1240')
    expect(screen.getByRole('tabpanel', { name: 'Datos' })).toContainElement(screen.getByLabelText('Peso'))
  })
})
