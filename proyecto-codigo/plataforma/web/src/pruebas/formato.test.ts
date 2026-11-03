import { describe, expect, it } from 'vitest'
import { aproximado, dec, edad, frase, medida, numero, parametro, posicion, riesgo } from '../lib/formato'

describe('formatos', () => {
  it('valor medido sin ruido de coma flotante, sin esconder un dato mal registrado', () => {
    expect(medida('12644.800000000001')).toBe('12.644,8')
    expect(medida('3.123')).toBe('3,123')
    expect(medida('positivo')).toBe('positivo')
    expect(medida(null)).toBe('—')
  })
  it('edad corregida en días, meses o años', () => {
    expect(edad(30)).toBe('30 d')
    expect(edad(91)).toBe('3 m')
    expect(edad(1100)).toBe('3 a')
    expect(edad(200)).toBe('6,6 m')
    expect(edad(null)).toBe('—')
  })
  it('riesgo como porcentaje y posición entera', () => {
    expect(riesgo(0.857)).toBe('85,7 %')
    expect(riesgo(0.0003)).toBe('menos de 0,1 %')
    expect(riesgo(0)).toBe('0,0 %')
    expect(posicion(98.6)).toBe('99')
  })
  it('primera letra en mayúscula', () => expect(frase('valor atípico')).toBe('Valor atípico'))
  it('sin «,0» que no dice nada: 34 semanas, no 34,0', () => {
    expect(dec(34)).toBe('34')
    expect(dec(28.46)).toBe('28,5')
    expect(dec(null)).toBe('—')
  })
  it('un rango esperado con los decimales que importan para su tamaño', () => {
    expect(aproximado(2185.11)).toBe('2.185')
    expect(aproximado(47.26)).toBe('47,3')
    expect(aproximado(1.234)).toBe('1,23')
  })
  it('un parámetro tal como es, con coma decimal', () => {
    expect(numero(0.0005)).toBe('0,0005')
    expect(numero(2147483647)).toBe('2.147.483.647')
    expect(parametro('0.05')).toBe('0,05')
    expect(parametro('cpu')).toBe('cpu')
    expect(parametro('{"rondas": 800}')).toBe('{"rondas": 800}')
  })
})
