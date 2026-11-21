// Calidad de datos (Administración): la cola de mediciones por revisar, sus cifras, su completitud por visita y las dos
// medidas de cómo acierta la revisión.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pedir } from './cliente'
import type { AciertosRevision, ConcentracionAlertas, DatoRevision, Pagina, Respuesta } from './tipos'

export const useAciertos = () => useQuery({
  queryKey: ['revision', 'aciertos'],
  queryFn: () => pedir<AciertosRevision>('/revision/datos/aciertos'),
})

export const useConcentracion = () => useQuery({
  queryKey: ['revision', 'concentracion'],
  queryFn: () => pedir<ConcentracionAlertas>('/revision/datos/concentracion'),
})

/** GET /revision/datos/resumen: las cifras de la pantalla, lo que se puede filtrar y la completitud de la talla por visita. */
export interface ResumenCalidad {
  corrida_id: number
  por_revisar: number
  revisadas: number
  revisadas_mes: number
  etapas: { etapa: string; etapa_nombre: string | null; alertas: number }[]
  variables: { variable: string; etiqueta: string | null; alertas: number }[]
  completitud: {
    indicador: string
    nombre: string
    etapas: { etapa: string; etapa_nombre: string | null; con_dato: number; con_visita: number; pct: number; a_12_meses: boolean }[]
  }
}

export const useResumenCalidad = () => useQuery({
  queryKey: ['revision', 'resumen-datos'],
  queryFn: () => pedir<ResumenCalidad>('/revision/datos/resumen'),
})

export type EstadoCola = 'pendiente' | 'revisado' | 'todos'
export interface FiltrosCola { estado: EstadoCola; capa: string; variable: string; etapa: string; pagina: number }
export const TAMANO_COLA = 12

/** La cola de mediciones por revisar con sus filtros; al cambiar de filtro o de página se sigue mostrando la anterior. */
export const useColaDatos = (f: FiltrosCola) => useQuery({
  queryKey: ['revision', 'datos', f],
  queryFn: () => pedir<Pagina<DatoRevision>>('/revision/datos', { params: { ...f, tamano: TAMANO_COLA } }),
  placeholderData: keepPreviousData,
})

/** Guarda la respuesta del administrador a una medición («¿es un error de registro?») y refresca la cola y sus cifras. */
export function useResponderDato(id: number) {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (r: { es_error: Respuesta; comentario: string }) =>
      pedir(`/revision/datos/${id}`, { cuerpo: { es_error: r.es_error, comentario: r.comentario.trim() || null } }),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['revision'] })
      void cliente.invalidateQueries({ queryKey: ['tablero', 'resumen'] })
    },
  })
}
