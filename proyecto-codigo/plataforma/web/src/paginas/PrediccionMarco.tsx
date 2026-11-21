// Predicción: una sola entrada con dos pestañas, «Un niño» y «Un grupo de niños». La pestaña vive en la URL
// (/prediccion y /prediccion?vista=grupo), así que se puede enlazar y el botón Atrás la respeta. Cada vista llena el alto que
// queda bajo las pestañas y reparte lo suyo en sus propias pestañas, para que no haya que desplazar la página.
import { lazy, Suspense } from 'react'
import { Cargando } from '../components/ui'
import { PanelPestana, Pestanas, usePestanaEnUrl } from '../components/ui/Pestanas'

const Inferencia = lazy(() => import('./Inferencia'))
const Prediccion = lazy(() => import('./Prediccion'))

const VISTAS = [
  { clave: 'nino', texto: 'Estimación individual' },
  { clave: 'grupo', texto: 'Estimación por grupo' },
] as const

export default function PrediccionMarco() {
  const [vista, elegir] = usePestanaEnUrl('vista', VISTAS.map((v) => v.clave))
  return (
    <div className="flex flex-col lg:h-full">
      <Pestanas prefijo="prediccion" etiqueta="Qué desea predecir" pestanas={VISTAS} activa={vista} elegir={elegir} className="mb-3" />
      <PanelPestana prefijo="prediccion" activa={vista} className="lg:min-h-0 lg:flex-1">
        <Suspense fallback={<Cargando />}>{vista === 'grupo' ? <Prediccion /> : <Inferencia />}</Suspense>
      </PanelPestana>
    </div>
  )
}
