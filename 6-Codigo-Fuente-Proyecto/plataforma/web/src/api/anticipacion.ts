// Riesgo de algunos niños visita por visita y su primera visita con alerta (`GET /analitica/riesgo-por-visita`). Lo usan
// Anticipación (tres niños de ejemplo) y Predicción (los niños que la pantalla elija con `sujetos`). Solo experto y administrador.
import { useQuery } from '@tanstack/react-query'
import { pedir } from './cliente'
import type { RespuestaRiesgoPorVisita } from './tipos'

export interface ParamsRiesgoPorVisita {
  /** Desenlace o familia de anticipación (`readm_6m` junta la fila base y las `_desde_`). */
  desenlace: string
  /** Códigos de los niños; sin ellos, los `n` de más riesgo de la corrida. */
  sujetos?: string[]
  n?: number
  corridaId?: number | null
}

export const useRiesgoPorVisita = (p: ParamsRiesgoPorVisita, habilitada = true) =>
  useQuery({
    queryKey: ['analitica', 'riesgo-por-visita', p],
    enabled: habilitada && !!p.desenlace,
    retry: false,
    queryFn: () => {
      const q = new URLSearchParams({ desenlace: p.desenlace })
      if (p.sujetos?.length) q.set('sujetos', p.sujetos.join(','))
      if (p.n) q.set('n', String(p.n))
      if (p.corridaId != null) q.set('corrida_id', String(p.corridaId))
      return pedir<RespuestaRiesgoPorVisita>(`/analitica/riesgo-por-visita?${q}`)
    },
  })
