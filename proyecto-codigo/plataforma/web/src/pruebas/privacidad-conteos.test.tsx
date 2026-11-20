// Un conteo de 1 a 4 niños se dice con su cifra: ninguna gráfica ni tabla lo reemplaza por «<5» ni por «n menor que 5»
// (decisión del 2026-11-20, que reemplaza a D4). Un cero verdadero dice 0. Lo que no se calcula dice «sin cifra» y su
// motivo (un mínimo de 20 niños para un promedio o un AUC, no de privacidad).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BarrasAgrupadas } from '../components/graficos/distribuciones'
import { Bosque, MapaCalor } from '../components/graficos/equidad'
import { Histograma } from '../components/graficos/xy'
import { aCsv, ocultarCeldasPequenas } from '../lib/exportar'
import { SIN_CIFRA, SIN_INTERVALO } from '../lib/lenguaje'

const ya_no_se_oculta = /n menor que 5|n<5|<5\b|menos de 5 niños/i

describe('conteos de 1 a 4 niños', () => {
  it('el histograma dice cuántos niños tiene cada tramo, también 1 y 4, y un tramo vacío dice 0', () => {
    render(<Histograma etiqueta="Edades" tramos={[{ desde: 1, hasta: 2, n: 1 }, { desde: 2, hasta: 3, n: 4 }, { desde: 3, hasta: 4, n: 0 }]} />)
    const h = screen.getByRole('figure', { name: 'Edades' })
    fireEvent.keyDown(h, { key: 'ArrowRight' })
    expect(h).toHaveTextContent('1 de 3. 1. 1 niños')
    fireEvent.keyDown(h, { key: 'ArrowRight' })
    expect(h).toHaveTextContent('2 de 3. 2. 4 niños')
    fireEvent.keyDown(h, { key: 'ArrowRight' })
    expect(h).toHaveTextContent('3 de 3. 3. 0 niños')
    expect(h).not.toHaveTextContent(ya_no_se_oculta)
  })

  it('las barras agrupadas dicen un porcentaje chico tal cual, y lo que no se pudo calcular dice «sin cifra»', () => {
    render(<BarrasAgrupadas etiqueta="Sexo frente a todos" series={[{ clave: 'a', nombre: 'Muestra', color: 0 }, { clave: 'b', nombre: 'Todos', color: 1 }]}
      filas={[{ x: 'Niñas', a: 1.5, b: 45 }, { x: 'Niños', a: null, b: 55 }]} />)
    const fig = screen.getByRole('figure', { name: 'Sexo frente a todos' })
    fireEvent.keyDown(fig, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Niñas. Muestra: 1.5 %; Todos: 45 %')
    fireEvent.keyDown(fig, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent(`Muestra: ${SIN_CIFRA}; Todos: 55 %`)
  })

  it('el mapa de calor y el bosque muestran la cifra de un grupo chico y dicen por qué falta la que no se calcula', () => {
    render(<>
      <MapaCalor etiqueta="AUC por grupo" columnas={['Niñas', 'Otro']} filas={[{ etiqueta: 'Desenlace', celdas: [{ valor: 0.8, texto: '0,8' }, { valor: null, texto: '—' }] }]} />
      <Bosque etiqueta="Bosque" puntos={[{ etiqueta: 'Otro · 3 niños', valor: null, bajo: null, alto: null, nota: 'Pide 20 niños o más para calcularlo' }]} />
    </>)
    const mapa = screen.getByRole('table', { name: 'AUC por grupo' })
    expect(within(mapa).getByText('0,8')).toBeInTheDocument()
    expect(within(mapa).getByText('—')).toBeInTheDocument()
    expect(screen.getByRole('figure', { name: 'Bosque' })).toHaveTextContent('Otro · 3 niñosPide 20 niños o más para calcularlo')
    expect(document.body).not.toHaveTextContent(ya_no_se_oculta)
  })

  it('la exportación no oculta filas de 1 a 4 niños; solo el mínimo de 20 de las distribuciones', () => {
    const filas = [{ g: 'A', n: 3, v: 0.5 }, { g: 'B', n: 1, v: 0.4 }]
    expect(ocultarCeldasPequenas(filas, 'n', 1)).toEqual(filas)
    expect(aCsv(filas, ['g', 'n', 'v'])).not.toMatch(/n<5/)
    expect(ocultarCeldasPequenas(filas, 'n')[0]).toEqual({ g: 'n<20', n: 'n<20', v: 'n<20' })
  })

  it('el texto de ayuda dice que el límite del intervalo de un AUC es estadístico, no de privacidad', () => {
    expect(SIN_INTERVALO).toMatch(/5 niños con el desenlace y 5 sin él/)
    expect(SIN_INTERVALO).not.toMatch(/privacidad/i)
  })
})
