// El riesgo de un niño en cada visita, por familia de desenlace (S7). Lo trae ``GET /ninos/{sujeto}/historia-riesgo``
// con ``motivos=true`` y ``POST /inferencia`` (campo ``historia``): el mismo cálculo, con el paquete activo y con cada punto
// usando solo lo medido hasta su visita. Los campos nuevos de la API son opcionales: una respuesta anterior sigue valiendo.
import { pedir } from './cliente'
import type { PuntoHistoria } from './tipos'

export type EstadoDesenlace = 'en_uso' | 'en_prueba'

/** Por qué un niño no tiene riesgo en una visita de la familia. */
export type MotivoSinRiesgo = 'no_asistio' | 'no_entrenado' | 'sin_datos' | 'fuera_de_poblacion'

export interface PuntoPorCorte extends PuntoHistoria {
  estado?: EstadoDesenlace
  /** Lo que más subió el riesgo, tal como lo escribe el modelo; solo si se pidió (``motivos=true``) o en «Calcular un niño». */
  motivos?: string[]
}

/** Una visita desde la que se predice la familia, con o sin riesgo para este niño. */
export interface CorteDeFamilia {
  clave: string
  momento: string
  momento_nombre: string
  orden: number
  estado: EstadoDesenlace
  /** null si hay un punto de riesgo en esta visita. */
  motivo_sin_riesgo: MotivoSinRiesgo | null
  /** Con qué niños se calibró el modelo de esta visita, p. ej. «nacidos de 2019 a 2021». */
  calibrado_con: string | null
}

export interface FamiliaDelPaquete {
  clave: string
  nombre: string
  definicion: string | null
  /** «En uso» si existe la fila base de la familia; si solo hay filas ``_desde_``, «En prueba». */
  estado: EstadoDesenlace
  cortes: CorteDeFamilia[]
}

export interface ModeloUsado {
  version: string
  entrenado: string | null
  corte_datos: string | null
}

export interface RiesgoPorCorte {
  /** Versión del paquete de modelos con que se calculó. */
  paquete: string
  puntos: PuntoPorCorte[]
  familias?: FamiliaDelPaquete[]
  modelo?: ModeloUsado
}

/** La consulta del riesgo por visita de un niño de la base, con lo que más pesó en cada una. */
export const historiaPorCorte = (sujeto: string) => ({
  queryKey: ['nino', sujeto, 'historia-riesgo', 'motivos'] as const,
  queryFn: () => pedir<RiesgoPorCorte>(`/ninos/${encodeURIComponent(sujeto)}/historia-riesgo?motivos=true`),
  staleTime: 5 * 60_000,
})
