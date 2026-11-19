import { describe, expect, it } from 'vitest'
import { aproximado, conPunto, dec, edad, fechaHora, frase, medida, meses, numero, parametro, posicion, riesgo } from '../lib/formato'
import { anchoEje, escalaRedonda } from '../components/graficos'

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
  it('edad en meses para un eje que no mezcle unidades', () => {
    expect(meses(91.3125)).toBe('3 m')
    expect(meses(15)).toBe('0,5 m')
    expect(meses(400)).toBe('13,1 m')
  })
  it('riesgo como porcentaje y posición entera', () => {
    expect(riesgo(0.857)).toBe('85,7 %')
    expect(riesgo(0.0003)).toBe('menos de 0,1 %')
    expect(riesgo(0)).toBe('0,0 %')
    expect(riesgo(0.9996)).toBe('más de 99,9 %')   // un modelo nunca está seguro: no «100,0 %»
    expect(riesgo(0.999)).toBe('99,9 %')
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

  it('cierra una frase con una fecha sin dejar dos puntos ni ninguno', () => {
    expect(conPunto('2 de nov. de 2026, 09:43 p. m.')).toBe('2 de nov. de 2026, 09:43 p. m.')
    expect(conPunto('2 de nov. de 2026, 21:43')).toBe('2 de nov. de 2026, 21:43.')
    expect(conPunto(fechaHora('2026-11-02T21:43:00')).endsWith('..')).toBe(false)
    expect(conPunto(fechaHora('2026-11-02T21:43:00')).endsWith('.')).toBe(true)
  })
})

describe('ancho del eje', () => {
  it('cabe la etiqueta más larga y nunca queda más angosto que lo mínimo', () => {
    expect(anchoEje(['0', '5.000', '10.000'])).toBe(55)
    expect(anchoEje(['+3', '−3'])).toBe(32)
  })
})

describe('eje redondo', () => {
  it('marcas en valores redondos que cubren todos los datos', () => {
    // la serie de la revisión: de 2.139 a 9.177 g
    expect(escalaRedonda([2139, 9177])).toEqual({ dominio: [2000, 10000], ticks: [2000, 4000, 6000, 8000, 10000] })
    expect(escalaRedonda([3.2, 4.1])).toEqual({ dominio: [3, 4.5], ticks: [3, 3.5, 4, 4.5] })
    // un solo valor: igual hay un eje
    expect(escalaRedonda([50, 50]).ticks.length).toBeGreaterThan(1)
    expect(escalaRedonda([0, 0])).toEqual({ dominio: [-0.5, 0.5], ticks: [-0.5, 0, 0.5] })
    expect(escalaRedonda([0.1, 0.3]).ticks).toEqual([0.1, 0.15, 0.2, 0.25, 0.3])
    // un rango casi nulo por coma flotante no se divide en pasos diminutos
    expect(escalaRedonda([1.001, 1001 * 0.001]).ticks.length).toBeLessThanOrEqual(6)
    expect(escalaRedonda([-7, -2])).toEqual({ dominio: [-8, -2], ticks: [-8, -6, -4, -2] })
  })
})
