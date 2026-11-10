// Contexto de análisis (entrenamiento y desenlace) guardado en la URL: ?entrenamiento=&desenlace=. Así un enlace
// copiado abre la misma vista y el contexto sobrevive al cambiar de submódulo.
import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { useContextoApi } from '../../api/analitica'

// Lo último que eligió la persona en esta pestaña (desenlace y visita) se recuerda en sessionStorage para no tener que
// volver a elegirlo al entrar de nuevo a Analítica. La URL manda; si el navegador no deja guardar, simplemente no se recuerda.
const CLAVE = 'maia.analitica.'
export function recordado(nombre: 'desenlace' | 'visita'): string | null {
  try {
    return window.sessionStorage.getItem(CLAVE + nombre)
  } catch {
    return null
  }
}
function recordar(nombre: 'desenlace' | 'visita', valor: string | null) {
  try {
    if (valor == null) window.sessionStorage.removeItem(CLAVE + nombre)
    else window.sessionStorage.setItem(CLAVE + nombre, valor)
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

export function useContextoAnalitica() {
  const [params, setParams] = useSearchParams()
  const crudo = params.get('entrenamiento')
  const delaUrl = crudo && /^\d+$/.test(crudo) ? Number(crudo) : null
  const consulta = useContextoApi(delaUrl)
  const contexto = consulta.data
  const entrenamiento = delaUrl ?? contexto?.entrenamiento ?? null
  const desenlaces = contexto?.desenlaces ?? []
  const enUrl = params.get('desenlace')
  // la URL manda; solo si no trae desenlace se usa el recordado (y únicamente si este entrenamiento lo tiene)
  const guardado = enUrl ? null : recordado('desenlace')
  const pedido = enUrl ?? (guardado && desenlaces.some((d) => d.clave === guardado) ? guardado : null)
  const desenlace = pedido && desenlaces.some((d) => d.clave === pedido) ? pedido : (desenlaces[0]?.clave ?? pedido)
  const visita = params.get('visita') ?? recordado('visita')

  const fijar = useCallback((cambios: { entrenamiento?: number | null; desenlace?: string | null; visita?: string | null }) => {
    setParams((previo) => {
      const sig = new URLSearchParams(previo)
      if ('entrenamiento' in cambios) {
        if (cambios.entrenamiento == null) sig.delete('entrenamiento'); else sig.set('entrenamiento', String(cambios.entrenamiento))
        if (!('desenlace' in cambios)) sig.delete('desenlace')   // otro entrenamiento puede tener otros desenlaces
      }
      if ('desenlace' in cambios) {
        if (cambios.desenlace == null) sig.delete('desenlace'); else sig.set('desenlace', cambios.desenlace)
        recordar('desenlace', cambios.desenlace ?? null)
      }
      if ('visita' in cambios) {
        if (cambios.visita == null) sig.delete('visita'); else sig.set('visita', cambios.visita)
        recordar('visita', cambios.visita ?? null)
      }
      return sig
    }, { replace: true })
  }, [setParams])

  const modelo = contexto?.modelos[0] ?? null
  return { entrenamiento, desenlace, visita, desenlaces, contexto, modelo, consulta, fijar, search: params.toString() ? `?${params.toString()}` : '' }
}
