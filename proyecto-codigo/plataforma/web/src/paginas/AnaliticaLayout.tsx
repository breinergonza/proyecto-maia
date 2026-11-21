// Analítica de los modelos: encabezado con el submódulo y su pregunta, contexto de análisis (entrenamiento, modelo y
// versión, desenlace, evaluación) guardado en la URL y, solo en el teléfono, las fichas de los submódulos (en el
// computador ya están en el menú lateral). En el teléfono el contexto se pliega en una tarjeta.
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { SelectoresModelo } from '../components/modelos/SelectoresModelo'
import { Cargando } from '../components/ui'
import { cn } from '../lib/cn'
import { datosAl } from '../lib/lenguaje'
import { RanuraGuia } from './analitica/comun'
import { useContextoAnalitica } from './analitica/contexto'
import { SUBMODULOS } from './analitica/submodulos'

const NOMBRE_MODELO: Record<string, string> = { clinico: 'Clínico', anomalias: 'Anomalías', crecimiento: 'Crecimiento' }

/** El contexto de análisis: desenlace, visita desde la que se calcula y entrenamiento (en la dirección), el estado del desenlace
 *  y de dónde salen los datos, todo en la misma tarjeta. El Resumen ya dice de dónde salen en Configuración y Trazabilidad:
 *  allí la línea de origen sobra. */
function Contexto({ conOrigen }: { conOrigen: boolean }) {
  const { modelo } = useContextoAnalitica()
  const modeloTexto = modelo?.modelo ? `${NOMBRE_MODELO[modelo.modelo] ?? `${modelo.modelo.charAt(0).toUpperCase()}${modelo.modelo.slice(1)}`}${modelo.version_registro != null ? ` · versión ${modelo.version_registro}` : ''}` : null
  const fuente = modelo?.fuente ? (modelo.fuente === 'simulado' ? 'Datos simulados' : 'Base de la Fundación') : null
  const origen = conOrigen ? [fuente, modelo?.corte ? datosAl(modelo.corte) : null, modeloTexto].filter(Boolean).join(' · ') : null
  return <SelectoresModelo origen={origen} />
}

export default function AnaliticaLayout() {
  const { submodulo } = useParams()
  const { consulta, search, entrenamiento, desenlace, desenlaces, contexto } = useContextoAnalitica()
  const [plegado, setPlegado] = useState(true)
  const estados = new Map((contexto?.submodulos ?? []).map((s) => [s.id, s.estado]))
  const elegido = desenlaces.find((d) => d.clave === desenlace)
  const actual = SUBMODULOS.find((s) => s.id === submodulo)
  const [ranura, setRanura] = useState<HTMLElement | null>(null)

  return (
    <RanuraGuia.Provider value={ranura}>
      {/* en escritorio la página ocupa justo la ventana: el título, el contexto y la pregunta en pocas líneas dejan el alto a los datos */}
      <div className="flex flex-col lg:h-full">
      <header className="mb-3 flex animate-aparecer flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <p className="text-sm font-semibold text-teal-medio">Analítica ›</p>
          <h1>{actual?.titulo ?? 'Analítica de los modelos'}</h1>
        </div>
        <p className="min-w-0 max-w-[110ch] basis-72 text-sm text-salvia lg:flex-1">{actual?.pregunta ?? 'Cómo se comporta el modelo: qué tan bien ordena, si su riesgo es fiable y si funciona igual para todos.'}</p>
        <div ref={setRanura} />
      </header>

      <section aria-label="Contexto de análisis" className="mb-3 rounded-panel border border-linea/80 bg-papel p-3 shadow-suave">
        <button type="button" className="flex w-full items-center justify-between gap-2 text-left lg:hidden" aria-expanded={!plegado}
          aria-controls="contexto-analisis" onClick={() => setPlegado(!plegado)}>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Contexto de análisis</span>
            <span className="block truncate text-xs text-salvia">
              {entrenamiento != null ? `Entrenamiento ${entrenamiento}` : 'Sin entrenamiento'}{elegido ? ` · ${elegido.nombre ?? elegido.clave}` : ''}
              {elegido?.etiqueta === 'En prueba' ? ' · En prueba' : ''}
            </span>
          </span>
          <ChevronDown size={18} aria-hidden className={cn('shrink-0 transition-transform', !plegado && 'rotate-180')} />
        </button>
        <div id="contexto-analisis" className={cn('mt-3 lg:mt-0', plegado && 'hidden lg:block')}>
          {consulta.isPending ? <Cargando /> : consulta.isError ? (
            <ErrorConReintento error={consulta.error} que="el contexto de análisis" reintentando={consulta.isFetching} reintentar={() => void consulta.refetch()} />
          ) : <Contexto conOrigen={submodulo !== 'resumen'} />}
        </div>
      </section>

      <nav aria-label="Submódulos de analítica" className="-mx-4 mb-4 sm:mx-0 lg:hidden">
        <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:px-0">
          {SUBMODULOS.map((s) => (
            <li key={s.id} className="snap-start">
              <NavLink to={{ pathname: `/analitica/${s.id}`, search }} aria-current={submodulo === s.id ? 'page' : undefined}
                className={cn('flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm transition-colors',
                  submodulo === s.id ? 'border-teal bg-teal-tinte font-semibold text-teal' : 'border-linea bg-papel text-tinta/75 hover:bg-fondo')}>
                {s.texto}
                {estados.get(s.id) === 'pendiente' && <span className="text-xs text-salvia">· pronto</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col lg:min-h-0 lg:flex-1"><Outlet /></div>
      </div>
    </RanuraGuia.Provider>
  )
}
