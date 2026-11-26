import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BarrasAgrupadas } from '../components/graficos/distribuciones'
import { Bosque } from '../components/graficos/equidad'
import { MiniSerie } from '../components/graficos/index'
import { Histograma } from '../components/graficos/xy'

describe('navegación por teclado en las gráficas', () => {
  it('barras agrupadas: las flechas recorren las categorías y anuncian el valor', () => {
    render(<BarrasAgrupadas etiqueta="Sexo frente a todos" series={[{ clave: 'a', nombre: 'Muestra', color: 0 }, { clave: 'b', nombre: 'Todos', color: 1 }]}
      filas={[{ x: 'Niñas', a: 40, b: 45 }, { x: 'Niños', a: null, b: 55 }]} />)   // un valor nulo (sin cifra)
    const fig = screen.getByRole('figure', { name: 'Sexo frente a todos' })
    expect(fig).toHaveAttribute('tabindex', '0')
    expect(fig).toHaveAttribute('aria-description', expect.stringContaining('Barras: 2 categorías'))
    fig.focus()
    fireEvent.keyDown(fig, { key: 'ArrowRight' })
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('1 de 2. Niñas. Muestra: 40 %; Todos: 45 %')
    fireEvent.keyDown(fig, { key: 'ArrowRight' })
    expect(region).toHaveTextContent('2 de 2. Niños. Muestra: sin cifra; Todos: 55 %')
    fireEvent.keyDown(fig, { key: 'ArrowRight' })
    expect(region).toHaveTextContent('2 de 2')
    fireEvent.keyDown(fig, { key: 'ArrowLeft' })
    expect(region).toHaveTextContent('1 de 2. Niñas')
  })
  it('serie pequeña: anuncia título y detalle de cada punto', () => {
    render(<MiniSerie etiqueta="Peso" dominioY={[0, 10]} puntos={[{ x: 0, y: 3, titulo: 'Nacimiento', detalle: ['3 kg'] }, { x: 1, y: 5, titulo: '1 mes' }]} />)
    const fig = screen.getByRole('figure', { name: 'Peso' })
    fireEvent.keyDown(fig, { key: 'End' })
    expect(screen.getByRole('status')).toHaveTextContent('2 de 2. 1 mes')
    fireEvent.keyDown(fig, { key: 'Home' })
    expect(screen.getByRole('status')).toHaveTextContent('1 de 2. Nacimiento. 3 kg')
  })
  it('histograma y bosque: valores y celdas sin cifra', () => {
    render(<><Histograma etiqueta="Edades" tramos={[{ desde: 1, hasta: 2, n: null }, { desde: 2, hasta: 3, n: 9 }]} />
      <Bosque etiqueta="Bosque" puntos={[{ etiqueta: 'Grupo A', valor: 0.8, bajo: 0.7, alto: 0.9 }, { etiqueta: 'Grupo B', valor: null, bajo: null, alto: null }]} /></>)
    const h = screen.getByRole('figure', { name: 'Edades' })
    fireEvent.keyDown(h, { key: 'ArrowRight' })
    expect(h).toHaveTextContent('1 de 2. 1. sin cifra')
    const b = screen.getByRole('figure', { name: 'Bosque' })
    fireEvent.keyDown(b, { key: 'ArrowRight' })
    expect(b).toHaveTextContent('Grupo A. Valor 0,80, entre 0,70 y 0,90')
    fireEvent.keyDown(b, { key: 'ArrowRight' })
    expect(b).toHaveTextContent('Grupo B. Muy pocos niños para calcularlo')
  })
})
