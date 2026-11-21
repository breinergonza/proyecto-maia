import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Grafica, TablaDatos } from '../components/grafica'
import { Panel } from '../components/ui'
import { DESCRIPCIONES } from '../lib/descripciones'
import { aCsv, ocultarCeldasPequenas } from '../lib/exportar'

describe('Panel.descripcion', () => {
  it('se pinta siempre bajo el título y se enlaza con aria-describedby', () => {
    render(<Panel titulo="Mi panel" descripcion="Qué muestra esto."><p>contenido</p></Panel>)
    const texto = screen.getByText('Qué muestra esto.')
    expect(texto.className).toContain('text-salvia')
    expect(texto.closest('section')?.getAttribute('aria-describedby')).toBe(texto.id)
  })
  it('sin descripción no agrega aria-describedby', () => {
    render(<Panel titulo="Mi panel"><p>contenido</p></Panel>)
    expect(screen.getByText('contenido').closest('section')?.hasAttribute('aria-describedby')).toBe(false)
  })
})

describe('Panel denso', () => {
  it('deja menos relleno arriba y abajo, para las pantallas que deben verse enteras sin bajar', () => {
    render(<><Panel denso titulo="Apretado"><p>contenido denso</p></Panel><Panel titulo="Normal"><p>contenido normal</p></Panel></>)
    expect(screen.getByText('contenido denso').parentElement).toHaveClass('py-3')
    expect(screen.getByText('contenido denso').parentElement).not.toHaveClass('sm:p-5')
    // el panel de siempre no cambia
    expect(screen.getByText('contenido normal').parentElement).toHaveClass('sm:p-5')
  })
})

describe('Grafica', () => {
  it('muestra la descripción y los botones PNG y CSV con filas', () => {
    render(<Grafica titulo="G" descripcion="Una frase." exportar={{ nombre: 'g', filas: [{ a: 1 }] }}><svg /></Grafica>)
    expect(screen.getByText('Una frase.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar PNG: G' })).toHaveTextContent('PNG')
    expect(screen.getByRole('button', { name: 'Descargar CSV: G' })).toHaveTextContent('CSV')
  })
  it('sin filas no hay botón CSV; la tabla no tiene PNG', () => {
    render(<><Grafica titulo="G" descripcion="d" exportar={{ nombre: 'g' }}><svg /></Grafica>
      <TablaDatos titulo="T" descripcion="d" exportar={{ nombre: 't', filas: [{ a: 1 }] }}><table /></TablaDatos></>)
    expect(screen.queryByRole('button', { name: 'Descargar CSV: G' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar CSV: T' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descargar PNG: T' })).not.toBeInTheDocument()
  })
  it('el CSV se descarga como Blob', () => {
    const crear = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', { createObjectURL: crear, revokeObjectURL: vi.fn() })
    render(<TablaDatos titulo="T" descripcion="d" exportar={{ nombre: 't', filas: [{ a: 1 }] }}><table /></TablaDatos>)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV: T' }))
    expect(crear).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})

describe('exportar', () => {
  it('CSV con BOM, cabecera, coma y comillas escapadas', () => {
    const csv = aCsv([{ a: 1, b: 'x, "y"' }, { a: null, b: 'z' }])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toEqual(['a,b', '1,"x, ""y"""', ',z', ''])
  })
  it('respeta el orden de columnas indicado', () => {
    expect(aCsv([{ a: 1, b: 2 }], ['b', 'a']).slice(1)).toBe('b,a\r\n2,1\r\n')
  })
  it('una fila de 1 a 4 niños se exporta con su cifra: solo el mínimo de 20 de las distribuciones oculta', () => {
    const r = ocultarCeldasPequenas([{ g: 'A', n: 3, v: 0.5 }, { g: 'B', n: 20, v: 0.4 }], 'n', 3)
    expect(r[0]).toEqual({ g: 'A', n: 3, v: 0.5 })
    expect(r[1]).toEqual({ g: 'B', n: 20, v: 0.4 })
  })
  it('con mínimo 20 para distribuciones', () => {
    expect(ocultarCeldasPequenas([{ n: 19, v: 1 }], 'n', 20)[0]).toEqual({ n: 'n<20', v: 'n<20' })
  })
})

describe('catálogo de descripciones', () => {
  it('toda entrada tiene título y descripción de hasta 160 caracteres', () => {
    const entradas = Object.entries(DESCRIPCIONES)
    expect(entradas.length).toBeGreaterThan(60)
    for (const [clave, d] of entradas) {
      expect(d.titulo.trim(), clave).not.toBe('')
      expect(d.descripcion.trim(), clave).not.toBe('')
      expect(d.descripcion.length, clave).toBeLessThanOrEqual(160)
    }
  })
})

describe('Ver como tabla', () => {
  const filas = [{ Grupo: 'A', Valor: 1.5 }, { Grupo: 'B', Valor: null }]
  it('alterna entre el gráfico y la tabla con aria-pressed y recuerda la elección', () => {
    const { unmount } = render(<Grafica titulo="Alterna" descripcion="d" exportar={{ nombre: 'a', filas }}><p>el gráfico</p></Grafica>)
    const boton = screen.getByRole('button', { name: 'Ver como tabla' })
    expect(boton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('el gráfico')).toBeInTheDocument()
    fireEvent.click(boton)
    expect(boton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('el gráfico')).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Valor' })).toBeInTheDocument()
    expect(screen.getByText('1,5')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descargar PNG: Alterna' })).not.toBeInTheDocument()
    unmount()
    render(<Grafica titulo="Alterna" descripcion="d" exportar={{ nombre: 'a', filas }}><p>el gráfico</p></Grafica>)
    expect(screen.getByRole('button', { name: 'Ver como tabla' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabla' }))
    expect(screen.getByText('el gráfico')).toBeInTheDocument()
  })
  it('sin filas no hay botón', () => {
    render(<Grafica titulo="SinFilas" descripcion="d" exportar={{ nombre: 'a' }}><p>x</p></Grafica>)
    expect(screen.queryByRole('button', { name: 'Ver como tabla' })).not.toBeInTheDocument()
  })
})

describe('Grafica con un hijo que falla', () => {
  it('muestra el aviso sin stack y Reintentar recupera', () => {
    let falla = true
    function Roto() { if (falla) throw new Error('detalle técnico secreto'); return <p>ya funciona</p> }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<><Grafica titulo="Rota" descripcion="d"><Roto /></Grafica><p>otra parte</p></>)
    const aviso = screen.getByRole('alert')
    expect(aviso).toHaveTextContent('No se pudo mostrar la gráfica «Rota». Los demás datos de la pantalla siguen disponibles.')
    expect(aviso).not.toHaveTextContent('secreto')
    expect(screen.getByText('otra parte')).toBeInTheDocument()
    falla = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByText('ya funciona')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })
})
