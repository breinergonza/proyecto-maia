// Contexto de análisis (entrenamiento y desenlace) guardado en la URL: ?entrenamiento=&desenlace=. Así un enlace
// copiado abre la misma vista y el contexto sobrevive al cambiar de submódulo.
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { useContextoApi } from '../../api/analitica'

export function useContextoAnalitica() {
  const [params, setParams] = useSearchParams()
  const crudo = params.get('entrenamiento')
  const delaUrl = crudo && /^\d+$/.test(crudo) ? Number(crudo) : null
  const consulta = useContextoApi(delaUrl)
  const contexto = consulta.data
  const entrenamiento = delaUrl ?? contexto?.entrenamiento ?? null
  const desenlaces = contexto?.desenlaces ?? []
  const pedido = params.get('desenlace')
  const desenlace = pedido && desenlaces.some((d) => d.clave === pedido) ? pedido : (desenlaces[0]?.clave ?? pedido)

  const fijar = useCallback((cambios: { entrenamiento?: number | null; desenlace?: string | null }) => {
    setParams((previo) => {
      const sig = new URLSearchParams(previo)
      if ('entrenamiento' in cambios) {
        if (cambios.entrenamiento == null) sig.delete('entrenamiento'); else sig.set('entrenamiento', String(cambios.entrenamiento))
        if (!('desenlace' in cambios)) sig.delete('desenlace')   // otro entrenamiento puede tener otros desenlaces
      }
      if ('desenlace' in cambios) {
        if (cambios.desenlace == null) sig.delete('desenlace'); else sig.set('desenlace', cambios.desenlace)
      }
      return sig
    }, { replace: true })
  }, [setParams])

  const modelo = contexto?.modelos[0] ?? null
  return { entrenamiento, desenlace, desenlaces, contexto, modelo, consulta, fijar, search: params.toString() ? `?${params.toString()}` : '' }
}
