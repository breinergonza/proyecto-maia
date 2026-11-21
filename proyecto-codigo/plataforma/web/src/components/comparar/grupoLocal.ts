// El grupo B de Comparar grupos: el mismo grupo que el activo (``useFiltros``), con las mismas reglas de cambio
// (``operacionesFiltros``), pero en el estado de la página en lugar de la dirección, que ya es del grupo A. Mientras la
// persona no elige nada, B está «sin elegir».
import { useMemo, useState } from 'react'
import type { MuestraJson } from '../../api/tipos'
import { muestraDe, operacionesFiltros, type EstadoFiltros, type Filtros } from '../../lib/useFiltros'

export interface EstadoGrupo extends EstadoFiltros {
  /** El filtro guardado que se usa sin cambios, si es el caso. */
  guardada: number | null
}

export const grupoVacio: EstadoGrupo = { entradas: [], tiempo: null, muestreo: null, extras: [], guardada: null }

/** El grupo de una página que lo tiene en la dirección, para llevarlo al otro lado (al intercambiar A y B). */
export const estadoDe = (f: Filtros): EstadoGrupo =>
  ({ entradas: f.entradas, tiempo: f.tiempo, muestreo: f.muestreo, extras: f.extras, guardada: f.guardada })

/** Lo que ``Filtros.ponerTodas`` recibe de un grupo: su tiempo y su muestreo, si los tiene. */
export const restoDe = (e: EstadoGrupo): Pick<MuestraJson, 'tiempo' | 'muestreo'> =>
  ({ ...(e.tiempo ? { tiempo: e.tiempo } : {}), ...(e.muestreo ? { muestreo: e.muestreo } : {}) })

export function useGrupoLocal() {
  const [estado, setEstado] = useState<EstadoGrupo | null>(null)
  const filtros: Filtros = useMemo(() => {
    const actual = estado ?? grupoVacio
    const { guardada, ...grupo } = actual
    return {
      ...grupo, guardada, muestra: muestraDe(grupo),
      ...operacionesFiltros(grupo, (nuevo, idGuardada) => setEstado({ ...nuevo, guardada: idGuardada })),
    }
  }, [estado])
  return { filtros, elegido: estado !== null, estado, poner: setEstado }
}
