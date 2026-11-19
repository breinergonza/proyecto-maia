// Consultas de Predicción. Muestra y universo se calculan en un trabajo asíncrono (estado, progreso, resultado y tabla
// por páginas); del riesgo por niño no se guarda nada. Solo el «niño nuevo» y las plantillas se guardan, si la persona lo pide.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { conParams, pedir, pedirArchivo } from './cliente'
import type {
  BibliotecaEjemplos, CuerpoGuardarNino, CuerpoPrediccionMuestra, EjemploPrediccion, ModelosPrediccion, NinoGuardado, PrediccionNino,
  RespuestaPrediccionMuestra, TablaPrediccion, TrabajoPrediccion, TrabajoPrediccionResumen,
} from './tipos'

export const useModelosPrediccion = () =>
  useQuery({ queryKey: ['prediccion', 'modelos'], queryFn: () => pedir<ModelosPrediccion>('/prediccion/modelos') })

export const useBibliotecaEjemplos = (modelo?: string | null) =>
  useQuery({
    queryKey: ['prediccion', 'biblioteca', modelo ?? null],
    queryFn: () => pedir<BibliotecaEjemplos>('/prediccion/ejemplos', { params: { modelo } }),
  })

export const useEjemplo = (visita: string | null, perfil: string | null, modelo?: string | null) =>
  useQuery({
    queryKey: ['prediccion', 'ejemplo', visita, perfil, modelo ?? null],
    queryFn: () => pedir<EjemploPrediccion>('/prediccion/ejemplos', { params: { visita, perfil, modelo } }),
    enabled: !!visita && !!perfil,
    placeholderData: keepPreviousData,
  })

export const usePredecirMuestra = () =>
  useMutation({
    mutationFn: (cuerpo: CuerpoPrediccionMuestra) =>
      pedir<RespuestaPrediccionMuestra>('/prediccion/muestra', { metodo: 'POST', cuerpo }),
  })

export const usePredecirNino = () =>
  useMutation({
    mutationFn: (cuerpo: { modelo?: string | null; visita: string; perfil: string; cambios: Record<string, string | number | null> }) =>
      pedir<PrediccionNino>('/prediccion/nino', { metodo: 'POST', cuerpo }),
  })

/** El CSV por niño (solo administración): sale del servidor al vuelo y no se guarda allí. */
export const pedirCsvPrediccion = (c: CuerpoPrediccionMuestra) =>
  pedirArchivo(conParams('/prediccion/muestra/csv', {
    modelo: c.modelo, muestra_id: c.muestra_id, visita: c.visita, excluir_entrenamiento: c.excluir_entrenamiento,
    muestra: c.muestra ? JSON.stringify(c.muestra) : undefined,
  }))

// ------------------------------------------------------------------ cálculo asíncrono (muestra y universo)

export const EN_CURSO = ['pendiente', 'en_curso']

export const useLanzarPrediccion = () =>
  useMutation({
    mutationFn: (c: Omit<CuerpoPrediccionMuestra, 'pagina'>) =>
      pedir<TrabajoPrediccionResumen>('/prediccion/trabajos', { metodo: 'POST', cuerpo: c }),
  })

/** El estado de un cálculo; mientras corre se consulta cada 2 s. */
export const useTrabajoPrediccion = (id: number | null) =>
  useQuery({
    queryKey: ['prediccion', 'trabajo', id],
    queryFn: () => pedir<TrabajoPrediccion>(`/prediccion/trabajos/${id}`),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data && !EN_CURSO.includes(q.state.data.estado) ? false : 2000),
  })

/** Una página (de 200 niños) de la tabla por niño de un cálculo terminado. */
export const useTablaPrediccion = (id: number | null, pagina: number, activo: boolean) =>
  useQuery({
    queryKey: ['prediccion', 'tabla', id, pagina],
    queryFn: () => pedir<TablaPrediccion>(`/prediccion/trabajos/${id}/tabla`, { params: { pagina } }),
    enabled: id !== null && activo,
    placeholderData: keepPreviousData,
    retry: false,
  })

// ------------------------------------------------------------------ niños nuevos guardados

export const useNinosGuardados = () =>
  useQuery({ queryKey: ['prediccion', 'ninos-nuevos'], queryFn: () => pedir<NinoGuardado[]>('/prediccion/ninos-nuevos') })

export const useGuardarNino = () => {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (c: CuerpoGuardarNino) => pedir<NinoGuardado>('/prediccion/ninos-nuevos', { metodo: 'POST', cuerpo: c }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['prediccion', 'ninos-nuevos'] }),
  })
}

export const useBorrarNinoGuardado = () => {
  const cliente = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => pedir<void>(`/prediccion/ninos-nuevos/${id}`, { metodo: 'DELETE' }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['prediccion', 'ninos-nuevos'] }),
  })
}
