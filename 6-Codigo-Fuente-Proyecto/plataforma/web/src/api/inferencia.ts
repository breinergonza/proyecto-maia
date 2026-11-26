// «Calcular un niño» con el riesgo de cada visita: ``POST /inferencia`` trae, además de lo de siempre, ``historia`` cuando la
// petición es de un solo niño (con varios no se compara visita por visita).
import type { RiesgoPorCorte } from './ninos'
import type { ResultadoInferencia } from './tipos'

export type ResultadoConHistoria = ResultadoInferencia & { historia?: RiesgoPorCorte | null }
