// Calidad de datos (Administración): las dos medidas de la cola de datos por revisar.
import { useQuery } from '@tanstack/react-query'
import { pedir } from './cliente'
import type { AciertosRevision, ConcentracionAlertas } from './tipos'

export const useAciertos = () => useQuery({
  queryKey: ['revision', 'aciertos'],
  queryFn: () => pedir<AciertosRevision>('/revision/datos/aciertos'),
})

export const useConcentracion = () => useQuery({
  queryKey: ['revision', 'concentracion'],
  queryFn: () => pedir<ConcentracionAlertas>('/revision/datos/concentracion'),
})
