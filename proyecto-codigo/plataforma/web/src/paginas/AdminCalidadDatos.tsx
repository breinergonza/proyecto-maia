// Calidad de datos (S9): mediciones dudosas o faltantes que conviene revisar antes de usarlas, no riesgos clínicos. La ven
// administración y los expertos clínicos. Arriba tres cifras (por revisar, revisadas este mes y completitud de la talla a los 12
// meses); debajo, la cola de mediciones por revisar con sus filtros y acciones y, al lado, la completitud por visita. Más abajo,
// en un detalle, cómo se comportan las alertas (por tipo, aciertos frente a la revisión y dónde se concentran).
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useResumenCalidad, type ResumenCalidad } from '../api/calidad'
import { ColaDatos } from '../components/calidad/ColaDatos'
import { CompletitudPorVisita } from '../components/calidad/CompletitudPorVisita'
import { MedidasDeRevision } from '../components/calidad/MedidasDeRevision'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { Cargando, Encabezado } from '../components/ui'
import { num, pct } from '../lib/formato'

function Cifra({ valor, texto, titulo }: { valor: string; texto: string; titulo?: string }) {
  return (
    <p className="flex items-baseline gap-2" title={titulo}>
      <b className="text-3xl font-bold tracking-tight text-teal">{valor}</b><span className="text-sm text-salvia">{texto}</span>
    </p>
  )
}

function Cifras({ r }: { r: ResumenCalidad }) {
  // la tercera cifra es la barra de 12 meses de «Completitud por visita»; sin esa visita no hay cifra que mostrar
  const doce = r.completitud.etapas.find((e) => e.a_12_meses)
  return (
    <section aria-label="Cifras de calidad de datos" className="mb-3 flex flex-wrap items-baseline gap-x-10 gap-y-1">
      <Cifra valor={num(r.por_revisar)} texto="mediciones por revisar" />
      <Cifra valor={num(r.revisadas_mes)} texto="revisadas este mes" />
      {doce && (
        <Cifra valor={pct(doce.pct)} texto="completitud a los 12 meses"
          titulo={`${num(doce.con_dato)} de ${num(doce.elegibles)} niños elegibles tienen talla medida a los 12 meses`} />
      )}
    </section>
  )
}

export default function AdminCalidadDatos() {
  const resumen = useResumenCalidad()
  const [detalle, setDetalle] = useState(false)   // las tres medidas piden sus datos solo si se abre el detalle
  return (
    <div className="flex flex-col lg:h-full">
      <Encabezado titulo="Mediciones por revisar">
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
          Resumen de alertas de calidad de datos
        </summary>
        {detalle && <div className="mt-3"><MedidasDeRevision /></div>}
      </details>
    </div>
  )
}
