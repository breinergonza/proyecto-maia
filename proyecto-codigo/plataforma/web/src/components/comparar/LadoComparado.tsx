// Un lado de la comparación (A o B): su nombre, sus criterios, su período y cuántos niños elegibles tiene, con un control
// para editarlo que abre el mismo panel de filtros de Explorar como cajón lateral. Cada lado describe SU grupo: los criterios nunca se
// mezclan con los del otro.
import { useFacetasExplorar, useMuestras } from '../../api/exploracion'
import type { RespuestaFacetas, TiempoJson } from '../../api/tipos'
import { puede, useSesion } from '../../auth/sesion'
import { num } from '../../lib/formato'
import type { Filtros } from '../../lib/useFiltros'
import { cuerpoDeFacetas, nombreDelGrupo, textoCriterios } from '../GrupoActivo'
import { CajonFacetas, criteriosActivos } from '../PanelFacetas'
import { SERIES_COLOR, type Serie } from '../graficos'
import { Boton } from '../ui'

/** Los niños del lado en la respuesta de la comparación: ausente mientras no hay respuesta; ``n`` nulo si son menos de 20 (D46). */
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
  const esExperto = puede(usuario, ['admin', 'experto', 'datos'])   // guardan grupos como muestras
  const facetas = useFacetasExplorar(cuerpoDeFacetas(filtros))
  const guardadas = useMuestras(esExperto)
  const criterios = criteriosActivos(filtros, facetas.data).filter((c) => c.id !== 'tiempo' && c.id !== 'muestreo')
  const guardado = filtros.guardada ? guardadas.data?.find((m) => m.id === filtros.guardada)?.titulo : undefined
  const letra = serie.nombre

  // El tamaño sale de la comparación; mientras no la hay (B sin elegir, o A y B iguales), del conteo del panel de filtros.
  const propio = elegido && facetas.data ? { n: facetas.data.n, ...(facetas.data.n_base == null ? {} : { n_total: facetas.data.n_base }) } : undefined
  const tamano = resumen ?? (error ? undefined : propio)
  const cuantos = tamano ? (tamano.n == null ? 'Menos de 20 niños elegibles'
    : `${num(tamano.n)} niños elegibles${tamano.n_total == null ? '' : ` de ${num(tamano.n_total)}`}`)
    : error ? 'No se pudo contar los niños del grupo.' : contando ? 'Contando niños…' : null

  return (
    <section aria-label={letra} className="flex min-w-0 flex-col gap-2">
      <div className="rounded-panel border border-t-4 border-linea/80 bg-papel px-4 py-2.5 shadow-suave sm:px-5" style={{ borderTopColor: SERIES_COLOR[serie.color] }}>
        <div className="flex items-start justify-between gap-x-4">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <p className="text-sm font-semibold" aria-hidden>{letra}</p>
            <h2 className="text-lg leading-tight">{elegido ? nombreDelGrupo(guardado, criterios.length) : 'Grupo B sin seleccionar'}</h2>
            {cuantos && <p className="text-sm font-semibold text-teal">{cuantos}</p>}
          </div>
          <Boton variante="secundario" chico aria-haspopup="dialog" onClick={alternar}>
            {elegido ? `Cambiar criterios del grupo ${letra.slice(-1)}` : 'Elegir grupo B'}
          </Boton>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-4 text-sm">
          {elegido ? (
            <>
              <p>{textoCriterios(criterios)}</p>
              <p>Período: {textoPeriodo(filtros.tiempo, facetas.data)}</p>
            </>
          ) : <p>Elija un grupo para compararlo con el grupo A.</p>}
        </div>
      </div>
      <CajonFacetas abierto={abierto} alCerrar={alternar} titulo={`Elija el grupo ${letra.slice(-1)}`} nota={nota} facetas={facetas.data}
        cargando={facetas.isPending} filtros={filtros} esExperto={esExperto} conTiempo error={facetas.isError} reintentar={() => void facetas.refetch()}
        conteo={{ ninos: tamano?.n, total: tamano?.n_total, error }} />
    </section>
  )
}
