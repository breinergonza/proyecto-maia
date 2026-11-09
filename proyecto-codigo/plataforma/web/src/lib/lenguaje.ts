// Glosario clínico: cómo se dicen en las pantallas del equipo clínico los términos técnicos del modelo. El término
// técnico no desaparece: queda al pasar el mouse (title) y en Administración, donde sí hace falta. Es el único lugar
// que hay que tocar cuando los médicos de la Fundación ajusten las palabras.
import { CAPAS, dec2, fecha, frase, indicador, numero, RIESGO_ALTO } from './formato'

// ------------------------------------------------------------------ riesgo (posición = percentil dentro del desenlace)

/** El 5 % con más riesgo; es también el mínimo por defecto de los correos de alerta. */
export const RIESGO_MUY_ALTO = 95

export const AYUDA_RIESGO_ALTO = `Riesgo alto: estar entre el ${100 - RIESGO_ALTO} % de niños con más riesgo para ese desenlace. Es una ` +
  'comparación entre los niños del programa, no un umbral clínico.'

export const esAlto = (p: number | null | undefined) => p != null && p >= RIESGO_ALTO

/** De cada 10 niños, cuántos tienen menos riesgo (posición 87 → 8). */
export const cuantosMenos = (p: number) => Math.max(0, Math.min(9, Math.floor(p / 10)))

/** «Riesgo muy alto», «Riesgo alto» o null si no llega a alto. */
export function nivelAlto(p: number | null | undefined): string | null {
  if (p == null || p < RIESGO_ALTO) return null
  return p >= RIESGO_MUY_ALTO ? 'Riesgo muy alto' : 'Riesgo alto'
}

/** Para una celda: «Muy alto», «Alto» o «Más que 7 de 10». */
export function nivelCorto(p: number | null | undefined): string {
  if (p == null) return '—'
  if (p >= RIESGO_MUY_ALTO) return 'Muy alto'
  if (p >= RIESGO_ALTO) return 'Alto'
  return `Más que ${cuantosMenos(p)} de 10`
}

/** Qué significa el mínimo (0 a 100) con que se configuran los avisos por correo. */
export const ayudaMinimo = (minimo: number) =>
  minimo <= 0 ? 'Con 0 se avisa de todos los niños.' : `Con ${numero(minimo)} se avisa del ${numero(100 - minimo)} % de niños con más riesgo.`

/** La frase completa, con la posición técnica entre paréntesis (para title). */
export const ayudaPosicion = (p: number | null | undefined) =>
  p == null ? '' : `Tiene más riesgo que ${cuantosMenos(p)} de cada 10 niños (posición ${Math.round(p)} de 100).`

// ------------------------------------------------------------------ crecimiento frente a la OMS (puntaje z)

export const AYUDA_OMS = 'Comparado con las curvas de la OMS para la edad corregida. Bajo para la edad: por debajo de ' +
  '−2 desviaciones estándar (DE). Cayó: bajó más de 1 DE desde el control anterior.'
export const BAJO_EDAD = 'Bajo para la edad'
export const CAYO = 'Cayó desde el último control'

export function frenteOms(z: number | null | undefined): string {
  if (z == null) return '—'
  if (z < -2) return 'Bajo para la edad'
  if (z > 2) return 'Alto para la edad'
  return 'En el rango esperado'
}

export const ayudaZ = (z: number | null | undefined) => (z == null ? '' : `Puntaje z frente a la OMS: ${dec2(z)}`)

// ------------------------------------------------------------------ alertas de datos (capas del modelo de anomalías)

export const ALERTAS: Record<string, string> = {
  '1': 'Valor fuera de lo esperado',
  '2': 'No cuadra con el resto de sus datos',
  '3': 'Cambio raro entre controles',
  '4': 'Cambio en todo un grupo',
}
export const alerta = (capa: string | number) => ALERTAS[String(capa)] ?? String(capa)
export const ayudaAlerta = (capa: string | number) =>
  CAPAS[String(capa)] ? `Capa ${capa} del modelo de anomalías (${CAPAS[String(capa)]})` : ''

// los motivos que escribe el motor (nucleo/anomalias), dichos para el equipo clínico
const MOTIVOS: Record<string, string> = {
  'valor atípico': 'valor muy distinto al de los demás niños',
  'posible error de unidad': 'parece anotado en otra unidad (por ejemplo, kilos en lugar de gramos)',
  'código especial': 'tiene un código de «no se hizo» o «sin dato»',
  'lejos de lo esperado para este caso': 'no cuadra con el resto de sus datos',
  'la edad anotada no coincide con la fecha': 'la edad anotada no coincide con la fecha de la visita',
  'fuera de la ventana de la etapa': 'la fecha no corresponde a esta visita',
  'cambio atípico para el tiempo transcurrido': 'cambió demasiado desde el control anterior',
}

/** Un motivo del motor (o varios separados por «;») en palabras del equipo clínico. */
export function motivo(texto: string | null | undefined): string {
  if (!texto) return ''
  return frase(texto.split(';').map((m) => m.trim()).filter(Boolean).map((m) => MOTIVOS[m] ?? m).join('; '))
}

/** Lo que más pesó en un riesgo (lo escribe el modelo clínico: «etiqueta (código) = valor»), sin códigos internos:
 * se quita el código entre paréntesis, «quiebre_X = 1» es nacer después de ese cambio y «z_peso_… = −2,3» se dice
 * frente a la OMS. */
export function peso(texto: string): string {
  const [nombre, ...resto] = texto.split(' = ')
  const valor = resto.join(' = ')
  if (esFalta(valor)) return nombreDato(nombre)
  const quiebre = nombre.match(/^quiebre_(.+)$/)
  if (quiebre) {
    const cambio = quiebre[1].replaceAll('_', ' ')
    return valor.trim() === '1' ? `Nació después del ${cambio}` : `Nació antes del ${cambio}`
  }
  const z = nombre.match(/^z_([a-z]+(?:_[a-z]+)*?)_(.+)$/)
  if (z && INDICADOR_Z.has(z[1])) {
    const numero = Number(valor.replace(',', '.'))
    return `${indicador(z[1])} a ${z[2].replaceAll('_', ' ')}: ${Number.isFinite(numero) ? frenteOms(numero).toLowerCase() : valor}`
  }
  const limpio = nombreDato(nombre)
  return valor ? `${limpio}: ${valor}` : limpio
}
const INDICADOR_Z = new Set(['peso', 'talla', 'perimetro_cefalico', 'peso_para_talla'])

/** El nombre de un dato del modelo sin su código interno: «Peso al nacer (peso_rn)» → «Peso al nacer»;
 * «z_talla_3m» → «Talla para la edad a 3m». */
function nombreDato(nombre: string): string {
  const z = nombre.match(/^z_([a-z]+(?:_[a-z]+)*?)_(.+)$/)
  if (z && INDICADOR_Z.has(z[1])) return `${indicador(z[1])} a ${z[2].replaceAll('_', ' ')}`
  return nombre.replace(/\s*\([a-z0-9_]+\)\s*$/, '')
}

/** El modelo escribe «sin dato» (o la etiqueta «No hay dato» de un código) cuando falta el valor. */
const esFalta = (valor: string) => /^(sin dato|no hay dato)$/i.test(valor.trim())

/** Lo que más pesó en un riesgo, separado en lo que sube el riesgo por su valor y los datos que faltan (que también
 * lo suben: el modelo aprendió que la falta de ese dato acompaña a más casos). */
export function motivosRiesgo(motivos: string[]): { suben: string[]; faltan: string[] } {
  const suben: string[] = []
  const faltan: string[] = []
  for (const m of motivos) {
    const [, ...resto] = m.split(' = ')
    ;(esFalta(resto.join(' = ')) ? faltan : suben).push(peso(m))
  }
  return { suben, faltan }
}

/** La frase que separa las dos cifras del riesgo: la probabilidad y la comparación con los demás niños. */
export const AYUDA_DOS_CIFRAS = 'El porcentaje es la probabilidad estimada de que pase. «N de 10» compara a este niño con ' +
  'los demás niños del programa para ese mismo desenlace: un porcentaje bajo puede ser alto frente a los demás si el ' +
  'desenlace es poco frecuente.'

// ------------------------------------------------------------------ familias de desenlaces (trayectoria de riesgo)

/** Desenlaces que son el mismo evento visto desde distintas visitas: «readm_3m» y «readm_6m» son «readm»;
 * «talla_baja_12m_desde_3» es «talla_baja_12m». */
export const familia = (clave: string) => clave.replace(/_(desde_)?\d+[a-z]*$/, '')

const SUELTAS = new Set(['a', 'al', 'la', 'las', 'los', 'el', 'de', 'del', 'entre', 'antes', 'desde', 'en', 'y'])

/** El nombre común de una familia: lo que comparten las frases de sus desenlaces, sin la visita ni preposiciones sueltas
 * al final («readmisión antes de las 40 semanas» y «readmisión entre los 3 y los 6 meses» → «Readmisión»). */
export function nombreFamilia(desenlaces: string[]): string {
  const frases = [...new Set(desenlaces.map((d) => d.replace(/\s*\([^()]*\)\s*$/, '')))]
  if (frases.length === 1) return frase(frases[0])
  const palabras = frases.map((f) => f.split(/\s+/))
  const comun: string[] = []
  for (let i = 0; palabras.every((p) => i < p.length && p[i] === palabras[0][i]); i++) comun.push(palabras[0][i])
  while (comun.length && SUELTAS.has(comun[comun.length - 1].toLowerCase())) comun.pop()
  return comun.length ? frase(comun.join(' ')) : frase(desenlaces[0])
}

// ------------------------------------------------------------------ cortes y corridas

/** «Datos al 30 de jun de 2026»: el corte, dicho sin la palabra técnica. */
export const datosAl = (corte: string | null | undefined) => `Datos al ${fecha(corte)}`
