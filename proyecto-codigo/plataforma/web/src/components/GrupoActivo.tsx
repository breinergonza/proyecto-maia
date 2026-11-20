// Barra «Grupo activo»: el grupo de niños que mira la página (su nombre, sus criterios legibles y cuántos niños son frente
// al total). El grupo vive en la dirección (useFiltros), así que la barra se actualiza sola cuando cambia el filtro y
// «Cambiar grupo» abre el mismo panel de filtros de Explorar sin sacar a nadie de la página. Cabe en una línea en escritorio:
// sin criterios el nombre «Todos los niños» ya lo dice, y un grupo que es el total no lo repite («5.000 de 5.000»).
import { useId, useState } from 'react'
import { useFacetasExplorar, useMuestras } from '../api/exploracion'
import type { CuerpoExplorar } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { num } from '../lib/formato'
import { useFiltros, type Filtros } from '../lib/useFiltros'
import { criteriosActivos, PanelFacetas } from './PanelFacetas'
import { Boton } from './ui'

/** El grupo de la dirección como cuerpo de consulta: una muestra guardada sin cambios se pide por su número. */
export const cuerpoDeFiltros = (filtros: Filtros): CuerpoExplorar =>
  filtros.guardada ? { muestra_id: filtros.guardada } : { muestra: filtros.muestra }

/** Las variables agregadas al panel solo afectan a las opciones, no a las cifras del grupo. */
export const cuerpoDeFacetas = (filtros: Filtros): CuerpoExplorar =>
  filtros.extras.length ? { ...cuerpoDeFiltros(filtros), variables: filtros.extras } : cuerpoDeFiltros(filtros)

/** El nombre de un grupo: el de su muestra guardada, «Todos los niños» sin filtros, o cuántos criterios tiene. */
export function nombreDelGrupo(guardado: string | undefined, criterios: number): string {
  if (guardado) return guardado
  if (criterios === 0) return 'Todos los niños'
  return `Grupo con ${criterios} ${criterios === 1 ? 'criterio' : 'criterios'}`
}

/** Los criterios de un grupo en una línea legible; sin criterios, que están todos los niños. */
export const textoCriterios = (criterios: { texto: string }[]): string =>
  criterios.length ? criterios.map((c) => c.texto).join(' · ') : 'Sin filtros: están todos los niños del programa.'

export function GrupoActivo({ ninos, total, minimo, error, conDato, conPanel = true }: {
  /** Niños del grupo en la respuesta de la página: sin valor mientras carga, nulo si son muy pocos para mostrar la cifra. */
  ninos?: number | null
  total?: number
  /** El mínimo de niños para mostrar cifras, para decir «menos de N» cuando el grupo no lo alcanza. */
  minimo?: number
  /** La consulta de la página falló: no se sabe cuántos son. */
  error?: boolean
  /** Cuántos niños del grupo tienen el dato del desenlace que muestra la página (nulo si son menos de 5). */
  conDato?: { n: number | null; desenlace: string }
  /** La página ya trae el panel de filtros a la vista (Explorar): no hace falta el botón. */
  conPanel?: boolean
}) {
  const { usuario } = useSesion()
  const filtros = useFiltros()
  const esExperto = puede(usuario, ['admin', 'experto'])
  const [abierto, setAbierto] = useState(false)
  const idPanel = useId()
  const facetas = useFacetasExplorar(cuerpoDeFacetas(filtros))
  const guardadas = useMuestras(esExperto)
  const criterios = criteriosActivos(filtros, facetas.data)
  const guardado = filtros.guardada ? guardadas.data?.find((m) => m.id === filtros.guardada)?.titulo : undefined

  const cuantos = error ? 'No se pudo contar los niños del grupo.'
    : ninos === undefined ? 'Contando niños…'
    : ninos === null ? `Menos de ${minimo ?? 20} niños elegibles${total == null ? '' : ` de ${num(total)}`}`
      : ninos === total ? `${num(ninos)} niños elegibles`
        : `${num(ninos)} niños elegibles${total == null ? '' : ` de ${num(total)}`}`

  return (
    <>
      {/* quién es el grupo y cuántos son, en una línea: deja la altura de la pantalla para las cifras */}
      <section aria-label="Grupo activo" className="rounded-panel border border-linea/80 bg-papel px-4 py-2 shadow-suave lg:sticky lg:top-0 lg:z-20 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-salvia" aria-hidden>Grupo activo:</span>
            <h2 className="text-base leading-tight">{nombreDelGrupo(guardado, criterios.length)}</h2>
            {criterios.length > 0 && <p className="text-sm">{textoCriterios(criterios)}</p>}
            <p className="flex flex-wrap gap-x-3 text-sm">
              <span className="font-semibold text-teal">{cuantos}</span>
              {conDato && <span>{conDato.n === null ? 'Menos de 5' : num(conDato.n)} con el dato de «{conDato.desenlace}»</span>}
            </p>
          </div>
          {conPanel && (
            <Boton variante="secundario" chico aria-expanded={abierto} aria-controls={idPanel} onClick={() => setAbierto(!abierto)}>
              Cambiar grupo
            </Boton>
          )}
        </div>
      </section>
      {conPanel && abierto && (
        <div id={idPanel} className="max-h-[70vh] overflow-y-auto rounded-panel">
          <PanelFacetas facetas={facetas.data} cargando={facetas.isPending} filtros={filtros} esExperto={esExperto} conTiempo
            error={facetas.isError} reintentar={() => facetas.refetch()} />
        </div>
      )}
    </>
  )
}
