// Un lado de la comparación (A o B): su nombre, sus criterios, su período y cuántos niños elegibles tiene, con un control
// para editarlo que abre el mismo panel de filtros de Explorar. Cada lado describe SU grupo: los criterios nunca se
// mezclan con los del otro.
import { useId } from 'react'
import { useFacetasExplorar, useMuestras } from '../../api/exploracion'
import type { RespuestaFacetas, TiempoJson } from '../../api/tipos'
import { puede, useSesion } from '../../auth/sesion'
import { num } from '../../lib/formato'
import type { Filtros } from '../../lib/useFiltros'
import { cuerpoDeFacetas, nombreDelGrupo, textoCriterios } from '../GrupoActivo'
import { criteriosActivos, PanelFacetas } from '../PanelFacetas'
import { SERIES_COLOR, type Serie } from '../graficos'
import { Boton } from '../ui'

/** Los niños del lado en la respuesta de la comparación: ausente mientras no hay respuesta; ``n`` nulo si son menos de 5. */
export interface ResumenLado { n: number | null; n_total?: number }

function textoPeriodo(t: TiempoJson | null, facetas?: RespuestaFacetas): string {
  if (!t) return 'todo el período'
  const campo = facetas?.tiempo?.campos.find((c) => c.valor === t.fecha)?.etiqueta ?? t.fecha
  const rango = t.modo === 'ultimos_meses' ? `últimos ${t.desde} meses` : [t.desde, t.hasta].filter(Boolean).join(' a ') || 'sin límite'
  return `${rango} (${campo.toLowerCase()})`
}

export function LadoComparado({ serie, filtros, elegido, resumen, contando, error, abierto, alternar, nota }: {
  serie: Serie
  filtros: Filtros
  /** El grupo B empieza sin elegir; el A siempre es el grupo activo. */
  elegido: boolean
  resumen?: ResumenLado
  contando: boolean
  /** La consulta de la página falló: no se sabe cuántos niños son. */
  error: boolean
  abierto: boolean
  alternar: () => void
  /** Una aclaración encima del panel de filtros. */
  nota?: string
}) {
  const { usuario } = useSesion()
  const esExperto = puede(usuario, ['admin', 'experto'])
  const idPanel = useId()
  const facetas = useFacetasExplorar(cuerpoDeFacetas(filtros))
  const guardadas = useMuestras(esExperto)
  const criterios = criteriosActivos(filtros, facetas.data).filter((c) => c.id !== 'tiempo' && c.id !== 'muestreo')
  const guardado = filtros.guardada ? guardadas.data?.find((m) => m.id === filtros.guardada)?.titulo : undefined
  const letra = serie.nombre

  const cuantos = error ? 'No se pudo contar los niños del grupo.'
    : !resumen ? (contando ? 'Contando niños…' : null)
      : resumen.n == null ? 'Menos de 5 niños elegibles'
        : `${num(resumen.n)} niños elegibles${resumen.n_total == null ? '' : ` de ${num(resumen.n_total)}`}`

  return (
    <section aria-label={letra} className="flex min-w-0 flex-col gap-2">
      <div className="rounded-panel border border-t-4 border-linea/80 bg-papel px-4 py-3 shadow-suave sm:px-5" style={{ borderTopColor: SERIES_COLOR[serie.color] }}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold" aria-hidden>{letra}</p>
            <h2 className="mt-0.5 text-lg leading-tight">{elegido ? nombreDelGrupo(guardado, criterios.length) : 'Sin elegir'}</h2>
            {elegido ? (
              <>
                <p className="mt-1 text-sm">{textoCriterios(criterios)}</p>
                <p className="mt-0.5 text-sm">Período: {textoPeriodo(filtros.tiempo, facetas.data)}</p>
              </>
            ) : <p className="mt-1 text-sm">Elija un grupo para compararlo con el grupo A.</p>}
            {cuantos && <p className="mt-0.5 text-sm font-semibold text-teal">{cuantos}</p>}
          </div>
          <Boton variante="secundario" chico aria-expanded={abierto} aria-controls={idPanel} onClick={alternar}
            aria-label={elegido ? `Editar grupo ${letra.slice(-1)}` : undefined}>
            {elegido ? 'Editar' : 'Elegir grupo B'}
          </Boton>
        </div>
      </div>
      {abierto && (
        <div id={idPanel} className="max-h-[70vh] overflow-y-auto rounded-panel">
          {nota && <p className="mb-2 text-sm">{nota}</p>}
          <PanelFacetas facetas={facetas.data} cargando={facetas.isPending} filtros={filtros} esExperto={esExperto} conTiempo
            error={facetas.isError} reintentar={() => void facetas.refetch()} />
        </div>
      )}
    </section>
  )
}
