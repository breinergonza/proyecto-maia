// Consultas de Explorar y de las muestras guardadas. Las cifras de Explorar dependen del filtro: la llave de la consulta
// lo lleva completo para que cada filtro tenga la suya.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pedir } from './cliente'
import type { CuerpoExplorar, MuestraGuardada, MuestraJson, RespuestaExplorar, RespuestaFacetas } from './tipos'

export const useResumenExplorar = (cuerpo: CuerpoExplorar) =>
  useQuery({
    queryKey: ['explorar', 'resumen', cuerpo],
    queryFn: () => pedir<RespuestaExplorar>('/exploracion/resumen', { metodo: 'POST', cuerpo }),
    placeholderData: keepPreviousData,
  })

export const useFacetasExplorar = (cuerpo: CuerpoExplorar) =>
  useQuery({
    queryKey: ['explorar', 'facetas', cuerpo],
    queryFn: () => pedir<RespuestaFacetas>('/exploracion/facetas', { metodo: 'POST', cuerpo }),
    placeholderData: keepPreviousData,
  })

/** Los filtros guardados: solo administración y expertos (quien consulta recibe 403). */
export const useMuestras = (activo: boolean) =>
  useQuery({ queryKey: ['muestras'], queryFn: () => pedir<MuestraGuardada[]>('/muestras'), enabled: activo })

export function useGuardarMuestra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { titulo: string; descripcion?: string; muestra: MuestraJson }) =>
      pedir<MuestraGuardada>('/muestras', { metodo: 'POST', cuerpo: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['muestras'] }),
  })
}
