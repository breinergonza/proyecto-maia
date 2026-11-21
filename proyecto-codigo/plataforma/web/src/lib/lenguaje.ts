// Glosario clínico: cómo se dicen en las pantallas del equipo clínico los términos técnicos del modelo. El término
// técnico no desaparece: queda al pasar el mouse (title) y en Administración, donde sí hace falta. Es el único lugar
// que hay que tocar cuando los médicos de la Fundación ajusten las palabras.
import { CAPAS, dec2, fecha, frase, indicador, numero, RIESGO_ALTO } from './formato'

// ------------------------------------------------------------------ riesgo (posición = percentil dentro del desenlace)

/** El 5 % con más riesgo; es también el mínimo por defecto de los correos de alerta. */
export const RIESGO_MUY_ALTO = 95

/** Por qué no hay riesgo estimado que mostrar: el paquete no calcula el desenlace, o lo calcula pero ningún niño elegido
 *  lo tiene ahora (solo se calcula para quienes siguen en seguimiento). */
export const sinRiesgoEstimado = (conModelo: boolean, quienes: string) => conModelo
  ? `Ningún niño ${quienes} tiene riesgo estimado ahora: se calcula solo para los niños que siguen en seguimiento.`
  : `El paquete de modelos activo aún no calcula este desenlace: no hay riesgo estimado ${quienes}.`

/** Contra quiénes se ordena el riesgo de cada niño: los niños con que se calibró el modelo de ese desenlace (los más
 *  recientes con desenlace conocido), no el grupo que se está mirando. Por eso un grupo puede tener más o menos del 10 %
 *  en alerta. */
export const REFERENCIA_RIESGO = 'los niños más recientes con desenlace conocido, con quienes se calibró el modelo'

export const AYUDA_RIESGO_ALTO = `Riesgo alto: entre el ${100 - RIESGO_ALTO} % más alto de ${REFERENCIA_RIESGO}; en un grupo pueden ser ` +
  `más o menos del ${100 - RIESGO_ALTO} %. Es una comparación, no un umbral clínico.`

/** «En alerta» con su referencia, para el panel que cuenta los niños en alerta de un grupo. */
export const definicionAlerta = (percentil: number) =>
  `En alerta: riesgo entre el ${100 - percentil} % más alto de ${REFERENCIA_RIESGO}. ` +
  `Por eso, en un grupo pueden ser más o menos del ${100 - percentil} %.`

/** «Alto» (y «muy alto») en una línea, para listas que mezclan desenlaces: cada uno con su modelo. */
export const definicionAlto = (alto: number, muyAlto?: number) =>
  `Alto: entre el ${100 - alto} % más alto de los niños con que se calibró cada modelo` +
  (muyAlto == null ? '' : `; muy alto: el ${100 - muyAlto} %`)

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
  '−2 desviaciones estándar (DE). Cayó: bajó más de 1 DE desde el control anterior. El peso para la talla se ' +
  'compara con la talla medida, no con la edad.'
export const BAJO_EDAD = 'Bajo para la edad'
export const CAYO = 'Cayó desde el último control'

export function frenteOms(z: number | null | undefined): string {
  if (z == null) return '—'
  if (z < -2) return 'Bajo para la edad'
  if (z > 2) return 'Alto para la edad'
  return 'En el rango esperado'
}

export const ayudaZ = (z: number | null | undefined) => (z == null ? '' : `Puntaje z frente a la OMS: ${dec2(z)}`)

/** Un puntaje z dicho sin la palabra técnica: «1,2 desviaciones por debajo», «0,4 por encima», «justo en lo esperado». */
export function desviaciones(z: number): string {
  const a = Math.abs(z)
  if (a < 0.05) return 'justo en lo esperado'
  const n = `${dec2(Math.round(a * 10) / 10)} ${a >= 0.95 && a < 1.05 ? 'desviación' : 'desviaciones'}`
  return `${n} ${z < 0 ? 'por debajo' : 'por encima'}`
}

/** La comparación con los demás niños para un texto visible (sin «posición»): «Más riesgo que 9 de cada 10 niños». */
export const frenteDemas = (p: number) => `Más riesgo que ${cuantosMenos(p)} de cada 10 niños`

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

// las señales de las alarmas de grupo (nucleo/anomalias), dichas para el equipo clínico
const SENALES: Record<string, string> = {
  redondeo: 'Más valores redondeados',
  'datos faltantes': 'Más datos faltantes',
  'residuo del contexto': 'Valores que no cuadran con el resto',
}
export const senal = (s: string) => SENALES[s] ?? frase(s)

/** «2021 T3» → año y trimestre; null si el periodo tiene otra forma. */
export function trimestre(periodo: string): { anio: number; t: number } | null {
  const m = periodo.match(/^(\d{4}) T([1-4])$/)
  return m ? { anio: Number(m[1]), t: Number(m[2]) } : null
}

/** Todos los trimestres entre el primero y el último dados (los que no tuvieron alarma también cuentan en el eje). */
export function trimestresSeguidos(periodos: string[]): string[] {
  const ts = periodos.map(trimestre).filter((t): t is { anio: number; t: number } => t != null)
  if (ts.length !== periodos.length || !ts.length) return [...new Set(periodos)].sort()
  const indice = (t: { anio: number; t: number }) => t.anio * 4 + t.t - 1
  const [desde, hasta] = [Math.min(...ts.map(indice)), Math.max(...ts.map(indice))]
  return Array.from({ length: hasta - desde + 1 }, (_, i) => `${Math.floor((desde + i) / 4)} T${((desde + i) % 4) + 1}`)
}

// los motivos que solo repiten el tipo de alerta (la etiqueta ya lo dice)
const REPITEN_ALERTA = new Set(['valor atípico', 'lejos de lo esperado para este caso', 'cambio atípico para el tiempo transcurrido'])

/** Lo que el motivo agrega a las etiquetas del tipo de alerta (unidad, código especial, fecha), o '' si solo las repite. */
export const motivoExtra = (texto: string | null | undefined) =>
  motivo((texto ?? '').split(';').map((m) => m.trim()).filter((m) => m && !REPITEN_ALERTA.has(m)).join('; '))

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
const esFalta = (valor: string) => /^(sin dato|no hay dato)\b/i.test(valor.trim())   // la API puede agregar la unidad: «sin dato cm»

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

/** Qué son los motivos de un riesgo: las tres contribuciones TreeSHAP de mayor magnitud positiva. */
export const AYUDA_MOTIVOS = 'Las tres contribuciones TreeSHAP de mayor magnitud positiva: los datos que más subieron el riesgo ' +
  'de este niño. Describen asociaciones que aprendió el modelo, no causas, y no justifican por sí solas una decisión clínica.'

/** La frase que separa las dos cifras del riesgo: la probabilidad y la comparación con los demás niños. */
export const AYUDA_DOS_CIFRAS = 'El porcentaje es la probabilidad estimada de que pase. «N de 10» compara a este niño con ' +
  'los demás niños del programa para ese mismo desenlace: un porcentaje bajo puede ser alto frente a los demás si el ' +
  'desenlace es poco frecuente.'

// ------------------------------------------------------------------ familias de desenlaces (trayectoria de riesgo)

/** Desenlaces que son el mismo evento visto desde distintas visitas: «readm_3m» y «readm_6m» son «readm»;
 * «talla_baja_12m_desde_3» es «talla_baja_12m»; «readm_6m_desde_pmc» (desde la entrada al programa), «readm_6m». */
export const familia = (clave: string) => clave.replace(/_(desde_[0-9a-z]+|\d+[a-z]*)$/, '')

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

// ------------------------------------------------------------------ analítica de los modelos (entradas nuevas)

/** Lo que dice una celda sin cifra. Ningún conteo se oculta por ser de pocos niños (1 a 4 se dicen con su número): sin
 *  cifra es lo que no se pudo calcular (un desvío o un intervalo pide 20 niños; el intervalo de un AUC, 5 de cada
 *  clase) o lo que un entrenamiento anterior no guardó. */
export const SIN_CIFRA = 'sin cifra'

/** Por qué un AUC puede venir sin intervalo: es un límite estadístico, no de privacidad. */
export const SIN_INTERVALO = 'Sin intervalo: hacen falta al menos 5 niños con el desenlace y 5 sin él para estimarlo.'

/** El nombre clínico del estado de un semáforo. */
export const SEMAFORO: Record<string, string> = { verde: 'Confiable', ambar: 'Mirar con cuidado', rojo: 'No confiable', gris: 'Sin datos para decidir' }

// ------------------------------------------------------------------ nombres de variables del modelo
// Los artefactos de analítica traen el código de cada variable; la pantalla muestra su nombre clínico. Mientras no
// haya un servicio con las etiquetas del Diccionario para todas las variables del modelo, se traducen los códigos
// conocidos y el resto se vuelve legible (guiones bajos a espacios, «z_» como «frente a la OMS»).
const NOMBRES_VARIABLE: Record<string, string> = {
  ingreso_hogar: 'Ingreso del hogar', personas_hogar: 'Personas en el hogar', edad_madre: 'Edad de la madre',
  controles_prenatales: 'Controles prenatales', eg_semanas: 'Edad gestacional', sexo: 'Sexo', dias_uci: 'Días en UCI',
  peso_nacer: 'Peso al nacer', talla_nacer: 'Talla al nacer', peso_salida: 'Peso al salir', hematocrito: 'Hematocrito',
  peso_40: 'Peso a las 40 semanas', talla_40: 'Talla a las 40 semanas', pc_40: 'Perímetro cefálico a las 40 semanas',
  z_peso_40_sem: 'Peso a las 40 semanas frente a la OMS', z_talla_40_sem: 'Talla a las 40 semanas frente a la OMS',
  z_perimetro_cefalico_40_sem: 'Perímetro cefálico a las 40 semanas frente a la OMS',
  quiebre_cambio_de_sistema_2022: 'Cambio de sistema de registro (2022)', oxigeno_salida: 'Oxígeno al salir',
}
export function nombreVariable(codigo: string): string {
  if (NOMBRES_VARIABLE[codigo]) return NOMBRES_VARIABLE[codigo]
  if (!/^[a-z0-9_]+$/.test(codigo)) return codigo   // ya es un nombre legible
  const oms = codigo.startsWith('z_')
  const base = (oms ? codigo.slice(2) : codigo).replace(/_(\d+)(_sem)?$/, ' a las $1 semanas').replaceAll('_', ' ')
  const texto = base.charAt(0).toUpperCase() + base.slice(1)
  return oms ? `${texto} frente a la OMS` : texto
}
