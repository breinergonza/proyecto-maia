import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PuntoHistoria } from '../api/tipos'
import { ordenPrimeraAlerta, PerfilDelNino } from '../components/ficha'
import { DESCRIPCIONES } from '../lib/descripciones'

const punto = (clave: string, orden: number): PuntoHistoria =>
  ({ clave, desenlace: clave, momento: `v${orden}`, momento_nombre: `Visita ${orden}`, orden, riesgo: 0.2, percentil: 50, fecha_visita: null }) as PuntoHistoria

describe('PerfilDelNino', () => {
  it('muestra chips con categorías, la visita y la descripción del catálogo, sin cifras', () => {
    render(<PerfilDelNino perfil={{ eg: 'muy_prematuro', eg_etiqueta: 'Muy prematuro', lubchenco: 'adecuado',
      lubchenco_etiqueta: 'Peso adecuado', visita: '6 meses', etiqueta_corta: 'Muy prematuro · Peso adecuado' }} />)
    expect(screen.getByText(DESCRIPCIONES.perfil_nino.descripcion)).toBeInTheDocument()
    expect(screen.getByText('Muy prematuro')).toBeInTheDocument()
    expect(screen.getByText('Peso adecuado')).toBeInTheDocument()
    expect(screen.getByText('Visita actual: 6 meses')).toBeInTheDocument()
  })
  it('sin clasificar cuando faltan datos y sin perfil no pinta nada', () => {
    const { container, rerender } = render(<PerfilDelNino perfil={{ eg: null, eg_etiqueta: null, lubchenco: null,
      lubchenco_etiqueta: null, visita: null, etiqueta_corta: 'Sin clasificar' }} />)
    expect(screen.getByText('Lubchenco sin clasificar')).toBeInTheDocument()
    rerender(<PerfilDelNino />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ordenPrimeraAlerta', () => {
  const f = { puntos: [punto('a', 1), punto('a', 2), punto('b', 1)] }
  it('toma la visita más temprana entre las claves de la familia', () => {
    expect(ordenPrimeraAlerta(f, { a: { momento: 'v2', momento_nombre: 'Visita 2', orden: 2 }, b: { momento: 'v3', momento_nombre: 'V3', orden: 3 } })).toBe(2)
  })
  it('es null si nunca hubo alerta o no hay datos', () => {
    expect(ordenPrimeraAlerta(f, { a: null, b: null })).toBeNull()
    expect(ordenPrimeraAlerta(f, undefined)).toBeNull()
  })
})
