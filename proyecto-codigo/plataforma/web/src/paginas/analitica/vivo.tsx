// Estados de las respuestas que se calculan al pedirlas (trayectorias, perfiles): cargando, error, anterior a la analítica
// y pendiente con el mensaje del servidor.
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Aviso, Cargando, Vacio } from '../../components/ui'
import { EstadoVacio } from './comun'

export function ResultadoVivo<T extends { estado: 'ok' | 'pendiente' | 'sin_artefactos'; mensaje?: string }>({ consulta, children }: {
  consulta: UseQueryResult<T>; children: (r: T) => ReactNode
}) {
  if (consulta.isPending) return consulta.fetchStatus === 'idle' ? <Cargando texto="Buscando el entrenamiento…" /> : <Cargando />
  if (consulta.isError) return <Aviso>No se pudo cargar este análisis. Intente de nuevo en un momento.</Aviso>
  const r = consulta.data
  if (r.estado === 'sin_artefactos') return <EstadoVacio estado="sin_artefactos" />
  if (r.estado === 'pendiente') return <Vacio titulo="Este análisis estará disponible pronto">{r.mensaje ?? 'Todavía no se calcula para este modelo. Cuando esté listo aparecerá aquí.'}</Vacio>
  return <>{children(r)}</>
}
