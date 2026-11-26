// Consulta de la Vista clínica. El cuerpo es el de Explorar (el grupo activo) más el desenlace; la llave de la consulta lo
// lleva completo, así que cada grupo y cada desenlace tienen la suya.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { pedir } from './cliente'
import type { CuerpoClinica, RespuestaClinica } from './tipos'

export const useResumenClinico = (cuerpo: CuerpoClinica) =>
  useQuery({
    queryKey: ['clinica', 'resumen', cuerpo],
    queryFn: () => pedir<RespuestaClinica>('/clinica/resumen', { metodo: 'POST', cuerpo }),
    placeholderData: keepPreviousData,
  })
