// Calidad de datos (S9): mediciones dudosas o faltantes que conviene revisar antes de usarlas, no riesgos clínicos. Arriba tres
// cifras; debajo, la cola de mediciones por revisar con sus filtros y acciones y la completitud por visita. Más abajo, en un
// detalle, cómo se comportan las alertas (por tipo, aciertos frente a la revisión y dónde se concentran).
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useResumenCalidad, type ResumenCalidad } from '../api/calidad'
import { ColaDatos } from '../components/calidad/ColaDatos'
import { CompletitudPorVisita } from '../components/calidad/CompletitudPorVisita'
import { MedidasDeRevision } from '../components/calidad/MedidasDeRevision'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { Cargando, Cifra, Encabezado } from '../components/ui'
import { num, pct } from '../lib/formato'

const doceMeses = (r: ResumenCalidad) => r.completitud.etapas.find((e) => e.a_12_meses)

function Cifras({ r }: { r: ResumenCalidad }) {
  const doce = doceMeses(r)
  return (
    <section aria-label="Cifras de calidad de datos"
      className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-linea sm:[&>*]:px-6 sm:[&>*:first-child]:pl-0">
      <Cifra valor={num(r.por_revisar)} texto="mediciones por revisar" />
      <Cifra valor={num(r.revisadas_mes)} texto="revisadas este mes" />
      {doce && (
        <Cifra valor={pct(doce.pct)}
          texto={`Completitud a los 12 meses: ${num(doce.con_dato)} de ${num(doce.con_visita)} niños con talla medida`} />
      )}
    </section>
  )
}

export default function AdminCalidadDatos() {
  const resumen = useResumenCalidad()
  const [detalle, setDetalle] = useState(false)   // las tres medidas piden sus datos solo si se abre el detalle
  return (
    <div className="flex flex-col">
      <Encabezado titulo="Calidad de datos">
        Mediciones dudosas o faltantes. No son riesgos clínicos: son datos a revisar antes de usarlos.
      </Encabezado>
      {resumen.isPending ? <Cargando />
        : resumen.isError ? (
          <div className="mb-4">
            <ErrorConReintento error={resumen.error} que="las cifras de calidad de datos" reintentando={resumen.isFetching}
              reintentar={() => void resumen.refetch()} />
          </div>
        ) : <Cifras r={resumen.data} />}
      {/* la cola es la tarea: junto al panel de completitud solo cuando hay ancho para que su acción quede a la vista */}
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] [&>*]:min-w-0">
        <ColaDatos resumen={resumen.data} />
        {resumen.data && <CompletitudPorVisita completitud={resumen.data.completitud} />}
      </div>
      <details className="group mt-6" onToggle={(e) => setDetalle(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-base font-semibold [&::-webkit-details-marker]:hidden">
          <ChevronDown size={18} aria-hidden className="transition-transform group-open:rotate-180" />
          Cómo se comportan las alertas
        </summary>
        {detalle && <div className="mt-3"><MedidasDeRevision /></div>}
      </details>
    </div>
  )
}
