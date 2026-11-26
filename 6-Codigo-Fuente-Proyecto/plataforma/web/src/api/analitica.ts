// Consultas de la analítica de los modelos. Solo leen los artefactos que dejó el entrenamiento (D32): no recalculan nada.
import { useQuery } from '@tanstack/react-query'
import type { AgruparTrayectoria, AnaliticaContexto, AnaliticaEntrenamientos, EjeTrayectoria, IndicadorTrayectoria, RespuestaAnalitica,
  RespuestaPerfiles, RespuestaTrayectorias } from './tipos'
import { pedir } from './cliente'

export const useEntrenamientosAnalitica = () =>
  useQuery({ queryKey: ['analitica', 'entrenamientos'], queryFn: () => pedir<AnaliticaEntrenamientos>('/analitica/entrenamientos') })

export const useContextoApi = (entrenamiento: number | null) =>
  useQuery({
    queryKey: ['analitica', 'contexto', entrenamiento],
    queryFn: () => pedir<AnaliticaContexto>(`/analitica/contexto${entrenamiento != null ? `?entrenamiento=${entrenamiento}` : ''}`),
  })

/** Un submódulo de un entrenamiento. Sin ``desenlace`` llegan todos los desenlaces. */
export function useSubmodulo<T = Record<string, unknown>>(entrenamiento: number | null, submodulo: string, desenlace?: string | null) {
  return useQuery({
    queryKey: ['analitica', entrenamiento, submodulo, desenlace ?? null],
    enabled: entrenamiento != null,
    queryFn: () => pedir<RespuestaAnalitica<T>>(
      `/analitica/${entrenamiento}/${submodulo}${desenlace ? `?desenlace=${encodeURIComponent(desenlace)}` : ''}`),
  })
}

export interface ParamsTrayectorias { indicador: IndicadorTrayectoria; agrupar: AgruparTrayectoria; eje: EjeTrayectoria }

/** Trayectorias de crecimiento: se calculan al pedirlas, con el indicador, la agrupación y el eje elegidos. */
export const useTrayectorias = (entrenamiento: number | null, p: ParamsTrayectorias, desenlace?: string | null) =>
  useQuery({
    queryKey: ['analitica', entrenamiento, 'trayectorias', p, desenlace ?? null],
    enabled: entrenamiento != null,
    queryFn: () => pedir<RespuestaTrayectorias>(
      `/analitica/${entrenamiento}/trayectorias?indicador=${p.indicador}&agrupar=${p.agrupar}&eje=${p.eje}${desenlace ? `&desenlace=${encodeURIComponent(desenlace)}` : ''}`),
  })

export const usePerfiles = (entrenamiento: number | null, desenlace?: string | null) =>
  useQuery({
    queryKey: ['analitica', entrenamiento, 'perfiles', desenlace ?? null],
    enabled: entrenamiento != null,
    queryFn: () => pedir<RespuestaPerfiles>(`/analitica/${entrenamiento}/perfiles${desenlace ? `?desenlace=${encodeURIComponent(desenlace)}` : ''}`),
  })
