import { describe, expect, it } from 'vitest'
import { edad, frase, medida, posicion, riesgo } from '../lib/formato'

describe('formatos', () => {
  it('valor medido sin ruido de coma flotante, sin esconder un dato mal registrado', () => {
    expect(medida('12644.800000000001')).toBe('12.644,8')
    expect(medida('3.123')).toBe('3,123')
    expect(medida('positivo')).toBe('positivo')
    expect(medida(null)).toBe('—')
  })
  it('edad corregida en días, meses o años', () => {
    expect(edad(30)).toBe('30 d')
    expect(edad(91)).toBe('3,0 m')
    expect(edad(1100)).toBe('3,0 a')
    expect(edad(null)).toBe('—')
  })
  it('riesgo como porcentaje y posición entera', () => {
    expect(riesgo(0.857)).toBe('85,7 %')
    expect(riesgo(0.0003)).toBe('menos de 0,1 %')
    expect(riesgo(0)).toBe('0,0 %')
    expect(posicion(98.6)).toBe('99')
  })
  it('primera letra en mayúscula', () => expect(frase('valor atípico')).toBe('Valor atípico'))
})
