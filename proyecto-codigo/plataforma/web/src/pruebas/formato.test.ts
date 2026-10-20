import { describe, expect, it } from 'vitest'
import { edad, frase, posicion, riesgo } from '../lib/formato'

describe('formatos', () => {
  it('edad corregida en días, meses o años', () => {
    expect(edad(30)).toBe('30 d')
    expect(edad(91)).toBe('3,0 m')
    expect(edad(1100)).toBe('3,0 a')
    expect(edad(null)).toBe('—')
  })
  it('riesgo como porcentaje y posición entera', () => {
    expect(riesgo(0.857)).toBe('85,7 %')
    expect(posicion(98.6)).toBe('99')
  })
  it('primera letra en mayúscula', () => expect(frase('valor atípico')).toBe('Valor atípico'))
})
