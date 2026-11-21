// Calidad de datos (S9): mediciones dudosas o faltantes que conviene revisar antes de usarlas, no riesgos clínicos. Arriba dos
// cifras; debajo, la cola de mediciones por revisar con sus filtros y acciones y, al lado, la completitud por visita. Más abajo, en un
// detalle, cómo se comportan las alertas (por tipo, aciertos frente a la revisión y dónde se concentran).
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useResumenCalidad, type ResumenCalidad } from '../api/calidad'
import { ColaDatos } from '../components/calidad/ColaDatos'
import { CompletitudPorVisita } from '../components/calidad/CompletitudPorVisita'
import { MedidasDeRevision } from '../components/calidad/MedidasDeRevision'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { Cargando, Encabezado } from '../components/ui'
import { num } from '../lib/formato'

function Cifras({ r }: { r: ResumenCalidad }) {
  // la completitud a los 12 meses ya está en su celda de «Completitud por visita»: aquí no se repite
  return (
    <section aria-label="Cifras de calidad de datos" className="mb-3 flex flex-wrap items-baseline gap-x-8 gap-y-1">
      <p className="flex items-baseline gap-2"><b className="text-2xl font-bold tracking-tight text-teal">{num(r.por_revisar)}</b><span className="text-sm text-salvia">mediciones por revisar</span></p>
      <p className="flex items-baseline gap-2"><b className="text-2xl font-bold tracking-tight text-teal">{num(r.revisadas_mes)}</b><span className="text-sm text-salvia">revisadas este mes</span></p>
    </section>
  )
}

export default function AdminCalidadDatos() {
  const resumen = useResumenCalidad()
  const [detalle, setDetalle] = useState(false)   // las tres medidas piden sus datos solo si se abre el detalle
  return (
    <div className="flex flex-col lg:h-full">
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
      {/* la cola es la tarea: en pantallas anchas ocupa el alto de la ventana y se desplaza por dentro, con la completitud al lado */}
      <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[minmax(0,1fr)] [&>*]:min-w-0">
        <ColaDatos resumen={resumen.data} />
        {resumen.data && <CompletitudPorVisita completitud={resumen.data.completitud} />}
      </div>
      <details className="group mt-4 shrink-0" onToggle={(e) => setDetalle(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-base font-semibold [&::-webkit-details-marker]:hidden">
          <ChevronDown size={18} aria-hidden className="transition-transform group-open:rotate-180" />
          Cómo se comportan las alertas
        </summary>
        {detalle && <div className="mt-3"><MedidasDeRevision /></div>}
      </details>
    </div>
  )
}
