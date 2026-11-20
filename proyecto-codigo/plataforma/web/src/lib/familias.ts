// Familias de desenlaces: el mismo desenlace visto desde varias visitas. Espejo de ``maia_comun.clinica`` (``familia_de``,
// ``estado_de``, ``FAMILIAS_PRIORIZADAS``) y de ``maia_comun.analitica.familia_desde``: una clave ``<familia>_desde_<visita>``
// es de la familia ``<familia>``; una clave sin ``_desde_`` es su propia familia. Aquí también se arma lo que la ficha dice de
// cada familia: una columna por visita con riesgo y el cambio frente a la visita anterior.
import type { CorteDeFamilia, EstadoDesenlace, FamiliaDelPaquete, MotivoSinRiesgo, PuntoPorCorte, RiesgoPorCorte } from '../api/ninos'

/** Los desenlaces a 12 meses que se presentan primero, en este orden. */
export const FAMILIAS_PRIORIZADAS = ['talla_baja_12m', 'desarrollo_12m'] as const
const PRIORIDAD: readonly string[] = FAMILIAS_PRIORIZADAS

/** Cómo se dice cada priorizada cuando el paquete activo no la trae. */
const NOMBRE_PRIORIZADA: Record<string, string> = {
  talla_baja_12m: 'talla baja a los 12 meses',
  desarrollo_12m: 'desarrollo psicomotor bajo a los 12 meses',
}

const DESDE = /^(?<familia>.+)_desde_(?<visita>[0-9a-z]+)$/

/** ``talla_baja_12m_desde_3`` -> ``{ familia: 'talla_baja_12m', visita: '3' }``; null si la clave no es de una familia. */
export function familiaDesde(clave: string): { familia: string; visita: string } | null {
  const g = DESDE.exec(clave)?.groups
  return g ? { familia: g.familia, visita: g.visita } : null
}

export const familiaDe = (clave: string) => familiaDesde(clave)?.familia ?? clave

/** Las filas ``_desde_`` están «En prueba» (no dan alertas); la fila base de una familia, «En uso». */
export const estadoDe = (clave: string): EstadoDesenlace => (familiaDesde(clave) ? 'en_prueba' : 'en_uso')

export const es12Meses = (familia: string) => familia.endsWith('_12m')

/** Solo las familias de 12 meses: primero las priorizadas en su orden y luego las demás por clave. */
export function ordenarFamilias12m<T extends { clave: string }>(familias: readonly T[]): T[] {
  const lugar = (clave: string) => { const i = PRIORIDAD.indexOf(clave); return i < 0 ? PRIORIDAD.length : i }
  return familias.filter((f) => es12Meses(f.clave)).sort((a, b) => lugar(a.clave) - lugar(b.clave) || a.clave.localeCompare(b.clave))
}

// ------------------------------------------------------------------ lo que se dice de cada familia

export interface CambioDeRiesgo {
  sentido: 'subio' | 'bajo' | 'igual'
  /** Puntos porcentuales de riesgo, sin signo y redondeados. */
  puntos: number
  texto: string
}

/** El riesgo del niño con lo medido hasta una visita de la familia. */
export interface ColumnaDeRiesgo {
  corte: CorteDeFamilia
  punto: PuntoPorCorte
  /** Frente a la visita anterior con riesgo; null en la primera. */
  cambio: CambioDeRiesgo | null
}

export interface FamiliaDelNino {
  familia: FamiliaDelPaquete
  columnas: ColumnaDeRiesgo[]
  /** Las visitas de la familia donde no hay riesgo, cada una con su motivo. */
  sinRiesgo: (CorteDeFamilia & { motivo_sin_riesgo: MotivoSinRiesgo })[]
}

export interface FamiliaAusente {
  clave: string
  nombre: string
}

/** El riesgo (0 a 1) como porcentaje entero, que es lo que se compara de una visita a otra: «22 %». */
export const porcentaje = (riesgo: number) => Math.round(100 * riesgo)
export const textoPorcentaje = (riesgo: number) => {
  const n = porcentaje(riesgo)
  return n < 1 ? 'menos de 1 %' : n > 99 ? 'más de 99 %' : `${n} %`
}

/** ``Subió 13 puntos con la visita de 3 meses``: lo que cambió el riesgo al sumar la visita ``visita``, en puntos de los
 * porcentajes que se muestran (el cambio es la resta de lo que se lee, no de decimales que no se ven). */
export function cambioDeRiesgo(antes: number, ahora: number, visita: string): CambioDeRiesgo {
  const dif = porcentaje(ahora) - porcentaje(antes)
  const puntos = Math.abs(dif)
  const sentido = dif === 0 ? 'igual' : dif > 0 ? 'subio' : 'bajo'
  const que = { subio: 'Subió', bajo: 'Bajó' } as const
  const texto = sentido === 'igual' ? `Sin cambio con la visita de ${visita}`
    : `${que[sentido]} ${puntos} ${puntos === 1 ? 'punto' : 'puntos'} con la visita de ${visita}`
  return { sentido, puntos, texto }
}

/** Las familias de 12 meses del paquete con lo que el niño tiene en cada una, y las priorizadas que el paquete no trae. */
export function familiasDelNino(historia: RiesgoPorCorte): { mostradas: FamiliaDelNino[]; ausentes: FamiliaAusente[] } {
  const familias = historia.familias ?? []
  const puntos = new Map(historia.puntos.map((p) => [p.clave, p]))
  const mostradas = ordenarFamilias12m(familias).map((familia): FamiliaDelNino => {
    const cortes = [...familia.cortes].sort((a, b) => a.orden - b.orden)
    const columnas: ColumnaDeRiesgo[] = []
    for (const corte of cortes) {
      const punto = puntos.get(corte.clave)
      if (!punto) continue
      const anterior = columnas[columnas.length - 1]
      columnas.push({ corte, punto, cambio: anterior ? cambioDeRiesgo(anterior.punto.riesgo, punto.riesgo, corte.momento_nombre) : null })
    }
    const sinRiesgo = cortes.flatMap((c) => (!puntos.has(c.clave) && c.motivo_sin_riesgo ? [{ ...c, motivo_sin_riesgo: c.motivo_sin_riesgo }] : []))
    return { familia, columnas, sinRiesgo }
  })
  const presentes = new Set(familias.map((f) => f.clave))
  const ausentes = FAMILIAS_PRIORIZADAS.filter((c) => !presentes.has(c)).map((clave) => ({ clave, nombre: NOMBRE_PRIORIZADA[clave] }))
  return { mostradas, ausentes }
}

/** Las familias que la ficha ya cuenta con su riesgo por visita: sus tarjetas sueltas de la última visita sobran. */
export const familiasConRiesgo = (historia: RiesgoPorCorte | null | undefined): Set<string> =>
  new Set(historia?.familias ? familiasDelNino(historia).mostradas.filter((f) => f.columnas.length > 0).map((f) => f.familia.clave) : [])

const SIN_RIESGO: Record<MotivoSinRiesgo, (visita: string) => string> = {
  no_asistio: (v) => `Aún no hay datos de la visita de ${v}.`,
  no_entrenado: (v) => `El paquete de modelos activo no tiene el modelo para la visita de ${v}.`,
  sin_datos: (v) => `El paquete de modelos activo no puede calcularlo con los datos de la visita de ${v}.`,
  fuera_de_poblacion: (v) => `El desenlace no aplica a este niño desde la visita de ${v}.`,
}
export const razonSinRiesgo = (c: { momento_nombre: string; motivo_sin_riesgo: MotivoSinRiesgo }) => SIN_RIESGO[c.motivo_sin_riesgo](c.momento_nombre)

export const sinFamilia = (nombre: string) => `El paquete de modelos activo no calcula ${nombre}.`

/** La probabilidad dicha como lo que pasó con otros niños: el modelo está calibrado con los niños más recientes. */
export function fraseCalibrada(riesgo: number, desenlace: string): string {
  const n = porcentaje(riesgo)
  return n < 1
    ? `De cada 100 niños con un riesgo menor de 1 %, menos de 1 tuvo ${desenlace}.`
    : `De cada 100 niños con un riesgo de ${n} %, unos ${n} tuvieron ${desenlace}.`
}
