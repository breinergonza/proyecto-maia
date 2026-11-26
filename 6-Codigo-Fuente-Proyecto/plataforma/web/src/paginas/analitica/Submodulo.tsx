// Elige la página del submódulo según la ruta: cada una se descarga cuando se abre.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { useParams } from 'react-router'
import { Vacio } from '../../components/ui'
import { esSubmodulo, type IdSubmodulo } from './submodulos'

const PAGINAS: Record<IdSubmodulo, LazyExoticComponent<ComponentType>> = {
  resumen: lazy(() => import('./Resumen')),
  rendimiento: lazy(() => import('./Rendimiento')),
  anticipacion: lazy(() => import('./Anticipacion')),
  calibracion: lazy(() => import('./Calibracion')),
  interpretabilidad: lazy(() => import('./Interpretabilidad')),
  poblacion: lazy(() => import('./Poblacion')),
  equidad: lazy(() => import('./Equidad')),
  estabilidad: lazy(() => import('./Estabilidad')),
  trayectorias: lazy(() => import('./Trayectorias')),
  perfiles: lazy(() => import('./Perfiles')),
  comparar: lazy(() => import('./Comparar')),
}

export default function Submodulo() {
  const { submodulo } = useParams()
  if (!esSubmodulo(submodulo)) return <Vacio titulo="No existe ese análisis">Elija uno de los submódulos de arriba.</Vacio>
  const Pagina = PAGINAS[submodulo]
  return <Pagina />
}
