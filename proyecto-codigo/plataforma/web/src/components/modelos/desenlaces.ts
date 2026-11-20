// Los desenlaces de un entrenamiento vistos como la pantalla de Modelos los elige: primero el desenlace (la familia: el mismo
// desenlace medido a 12 meses) y luego «Calculado a», la visita desde la que se calcula el riesgo. Cada pareja es una clave
// del entrenamiento (la que va en la dirección y la que piden las consultas de analítica).
import type { AnaliticaDesenlace } from '../../api/tipos'
import { familiaDe, familiaDesde } from '../../lib/familias'

export interface CorteDeModelo {
  clave: string
  /** La visita desde la que se calcula el riesgo, dicha como la dice el diccionario («3 m EC»). */
  corte: string
  enPrueba: boolean
}

export interface FamiliaDeModelo {
  clave: string
  nombre: string
  cortes: CorteDeModelo[]
}

const SUFIJO = /\s*\(riesgo calculado a (?<visita>[^()]*)\)\s*$/

/** El nombre del desenlace sin la visita desde la que se calcula: «… (riesgo calculado a 3 m EC)» -> «…». */
export const nombreSinCorte = (nombre: string) => nombre.replace(SUFIJO, '')

/** La visita desde la que se calcula un desenlace: la del nombre, la del entrenamiento o, si no hay, la de la clave. */
export function corteDe(d: Pick<AnaliticaDesenlace, 'clave' | 'nombre' | 'momento'>): string {
  const delNombre = d.nombre ? SUFIJO.exec(d.nombre)?.groups?.visita?.trim() : undefined
  return delNombre || d.momento || familiaDesde(d.clave)?.visita || 'Modelo en uso'
}

/** Agrupa los desenlaces por familia conservando el orden en que llegan; dentro de cada una, el que no trae visita en su clave
 * (el desenlace «En uso») va primero. */
export function familiasDeModelo(desenlaces: readonly AnaliticaDesenlace[]): FamiliaDeModelo[] {
  const familias = new Map<string, FamiliaDeModelo>()
  for (const d of desenlaces) {
    const clave = familiaDe(d.clave)
    const familia = familias.get(clave) ?? { clave, nombre: nombreSinCorte(d.nombre ?? d.clave), cortes: [] }
    familia.cortes.push({ clave: d.clave, corte: corteDe(d), enPrueba: d.etiqueta === 'En prueba' })
    familias.set(clave, familia)
  }
  return [...familias.values()].map((f) => ({ ...f, cortes: f.cortes.toSorted((a, b) => Number(familiaDesde(a.clave) != null) - Number(familiaDesde(b.clave) != null)) }))
}
