// Estados de las respuestas que se calculan al pedirlas (trayectorias, perfiles): cargando, error con reintento, anterior a la
// analítica y pendiente con el mensaje del servidor.
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErrorConReintento } from '../../components/ErrorConReintento'
import { Cargando, Vacio } from '../../components/ui'
import { EstadoVacio } from './comun'

export function ResultadoVivo<T extends { estado: 'ok' | 'pendiente' | 'sin_artefactos'; mensaje?: string }>({ consulta, children, pendiente }: {
  consulta: UseQueryResult<T>; children: (r: T) => ReactNode
  /** Para dibujar un «pendiente» propio (p. ej. con atajos); si devuelve null se usa el aviso de siempre. */
  pendiente?: (r: T) => ReactNode
}) {
  if (consulta.isPending) return consulta.fetchStatus === 'idle' ? <Cargando texto="Buscando el entrenamiento…" /> : <Cargando />
  if (consulta.isError) {
    return <ErrorConReintento error={consulta.error} que="este análisis" reintentando={consulta.isFetching} reintentar={() => void consulta.refetch()} />
  }
  const r = consulta.data
  if (r.estado === 'sin_artefactos') return <EstadoVacio estado="sin_artefactos" />
  if (r.estado === 'pendiente' && pendiente) {
    const propio = pendiente(r)
    if (propio != null) return <>{propio}</>
  }
  if (r.estado === 'pendiente') return <Vacio titulo="Este análisis estará disponible pronto">{r.mensaje ?? 'Todavía no se calcula para este modelo. Cuando esté listo aparecerá aquí.'}</Vacio>
  return <>{children(r)}</>
}
