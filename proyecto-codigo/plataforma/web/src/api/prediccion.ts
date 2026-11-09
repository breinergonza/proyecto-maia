// Consultas de Predicción. Nada de lo que se calcula se guarda: las mutaciones solo devuelven el resultado.
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { conParams, pedir, pedirArchivo } from './cliente'
import type {
  BibliotecaEjemplos, CuerpoPrediccionMuestra, EjemploPrediccion, ModelosPrediccion, PrediccionNino, RespuestaPrediccionMuestra,
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
