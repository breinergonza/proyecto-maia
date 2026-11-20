// Las tres preguntas de Comparar grupos como pestañas, una por pregunta. El rendimiento del modelo no es una pestaña: vive
// en Modelos, porque en esta pantalla se comparan grupos de niños, no entrenamientos.
import { Pestanas } from '../ui/Pestanas'

export const PREGUNTAS = [
  { clave: 'crecen', texto: '¿Crecen distinto?' },
  { clave: 'pasa', texto: '¿Les pasa algo distinto?' },
  { clave: 'faltan', texto: '¿Faltan datos distintos?' },
] as const
export type Pregunta = (typeof PREGUNTAS)[number]['clave']

/** La pregunta de la dirección (``?pregunta=``); sin ella o con una que no existe, la primera. */
export const preguntaDe = (v: string | null): Pregunta => PREGUNTAS.find((p) => p.clave === v)?.clave ?? PREGUNTAS[0].clave

/** Prefijo de los ids de las pestañas y del panel de las preguntas. */
export const PREFIJO_PREGUNTA = 'pregunta'

export function Preguntas({ activa, elegir }: { activa: Pregunta; elegir: (p: Pregunta) => void }) {
  return <Pestanas prefijo={PREFIJO_PREGUNTA} etiqueta="Pregunta" pestanas={PREGUNTAS} activa={activa} elegir={elegir} />
}
