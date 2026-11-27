// Vista clínica: lo que pasó con los niños del grupo activo a los 12 meses (talla baja o desarrollo psicomotor bajo), cómo
// crecen visita por visita, a cuántos se alerta en cada momento de cálculo y quiénes tienen más riesgo. El grupo y el
// desenlace viven en la dirección: un enlace abre la misma vista y un error de red no los pierde al reintentar.
// En escritorio cabe en la pantalla sin desplazarse: el encabezado y la barra del grupo ocupan una línea cada uno, y
// debajo van dos columnas, «qué pasó» (la cifra observada y el crecimiento) y «a quién mirar» (el riesgo por corte y los
// niños con más riesgo, que se desplazan dentro de su panel si no caben).
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useResumenClinico } from '../api/clinica'
import { ErrorApi } from '../api/cliente'
import type { ClinicaResumen, CuerpoClinica } from '../api/tipos'
import { GrupoActivo, cuerpoDeFiltros } from '../components/GrupoActivo'
import { COLUMNAS_VISTA, filasDeLaVista } from '../components/clinica/exportarVista'
import { NinosMasRiesgo } from '../components/clinica/NinosMasRiesgo'
import { Observado } from '../components/clinica/Observado'
import { RiesgoPorCorte } from '../components/clinica/RiesgoPorCorte'
import { idPestana, PANEL_DESENLACE, SelectorDesenlace } from '../components/clinica/SelectorDesenlace'
import { Trayectoria } from '../components/clinica/Trayectoria'
import { Aviso, Vacio } from '../components/ui'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { aCsv, descargar, nombreArchivo } from '../lib/exportar'
import { num } from '../lib/formato'
import { datosAl } from '../lib/lenguaje'
import { cn } from '../lib/cn'
import { useFiltros } from '../lib/useFiltros'

/** El desenlace con que abre la vista cuando existe. */
const DESENLACE_INICIAL = 'talla_baja_12m'

const enlace = 'inline-flex h-9 items-center rounded-control border border-linea bg-papel px-3.5 text-sm font-semibold text-tinta shadow-suave transition-colors hover:border-teal/40 hover:text-teal'

export default function VistaClinica() {
  const filtros = useFiltros()
  const [params, setParams] = useSearchParams()
  const familiaUrl = params.get('familia')
  const indicadorUrl = params.get('indicador')
  const cuerpo: CuerpoClinica = {
    ...cuerpoDeFiltros(filtros),
    ...(familiaUrl ? { familia: familiaUrl } : {}),
    ...(indicadorUrl ? { indicador: indicadorUrl } : {}),
  }
  const consulta = useResumenClinico(cuerpo)
  const r = consulta.data && !consulta.data.insuficiente ? consulta.data : undefined

  const elegir = (clave: string) => setParams((previo) => {
    const p = new URLSearchParams(previo)
    p.set('familia', clave)
    p.delete('indicador')   // cada desenlace trae su propio indicador
    return p
  }, { replace: true })

  // sin desenlace en la dirección, la vista abre con talla baja si el paquete la trae
  const inicial = !familiaUrl && r && r.familia !== DESENLACE_INICIAL && r.familias.some((f) => f.clave === DESENLACE_INICIAL)
    ? DESENLACE_INICIAL : null
  useEffect(() => {
    if (inicial) setParams((previo) => { const p = new URLSearchParams(previo); p.set('familia', inicial); return p }, { replace: true })
  }, [inicial, setParams])

  const total = consulta.data?.insuficiente ? undefined : r?.grupo.n_total
  const ninos = !consulta.data ? undefined : consulta.data.insuficiente ? consulta.data.ninos : consulta.data.grupo.n
  const minimo = consulta.data?.insuficiente ? consulta.data.minimo : undefined
  const conDato = r?.observado.grupo
    ? { n: r.observado.grupo.con_dato, desenlace: r.familias.find((f) => f.clave === r.familia)?.nombre ?? r.familia }
    : undefined

  return (
    // en escritorio la vista ocupa la pantalla sin desplazarse: los paneles largos se desplazan por dentro
    <div className="flex flex-col gap-3 xl:h-full">
      <div className="flex animate-aparecer flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1>Seguimiento clínico</h1>
          <p className="text-sm text-salvia">
            {r?.datos_al ? `${datosAl(r.datos_al)} · qué pasó` : 'Qué pasó'} a los 12 meses y a quién mirar primero
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={enlace} to={{ pathname: '/comparar', search: params.toString() }}>Comparar con otro grupo</Link>
          <Link className={enlace} to={{ pathname: '/explorar', search: params.toString() }}>Explorar más variables</Link>
          {/* las cifras de la vista (no los niños uno por uno) en un CSV, cada una con su denominador */}
          <button type="button" className={cn(enlace, 'disabled:cursor-not-allowed disabled:opacity-50')} disabled={!r} title="Descargar las cifras de esta vista (CSV)"
            onClick={() => r && descargar(new Blob([aCsv(filasDeLaVista(r), COLUMNAS_VISTA)], { type: 'text/csv;charset=utf-8' }), nombreArchivo(`vista-clinica-${r.familia}`, 'csv'))}>
            Exportar
          </button>
        </div>
      </div>
      <GrupoActivo ninos={ninos} total={total} minimo={minimo} error={consulta.isError} conDato={conDato} />
      {consulta.isError ? <Falla error={consulta.error} reintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
        : !consulta.data ? <p role="status" className="py-6 text-salvia">Cargando…</p>
          : consulta.data.insuficiente ? (
            consulta.data.vacio ? (
              <Vacio titulo="Ningún niño cumple estos filtros">Son 0 niños. Cambie el grupo para ver sus cifras.</Vacio>
            ) : (
              <Aviso tono="teal">
                <strong>Con menos de {consulta.data.minimo} niños no se muestran cifras.</strong> Cambie el grupo para ver más niños.
              </Aviso>
            )
          ) : r ? (
            <div aria-busy={consulta.isPlaceholderData} className={cn('flex flex-col gap-3 xl:min-h-0 xl:flex-1', consulta.isPlaceholderData && 'opacity-60 transition-opacity')}>
              <Contenido r={r} activa={familiaUrl ?? inicial ?? r.familia} elegir={elegir} />
            </div>
          ) : null}
    </div>
  )
}

function Falla({ error, reintentar, reintentando }: { error: Error; reintentar: () => void; reintentando: boolean }) {
  if (error instanceof ErrorApi && error.estado === 404) {
    return <Vacio titulo="Todavía no hay resultados">Cuando se procesen los datos podrá ver aquí a los niños de cada grupo.</Vacio>
  }
  return <ErrorConReintento error={error} que="la vista clínica" conserva="El grupo elegido sigue en la dirección: al reintentar se pide lo mismo." reintentar={reintentar} reintentando={reintentando} />
}

function Contenido({ r, activa, elegir }: { r: ClinicaResumen; activa: string; elegir: (clave: string) => void }) {
  const pestana = (r.familias.find((f) => f.clave === activa) ?? r.familias[0])?.clave ?? r.familia
  // el grupo son todos los niños: la población como referencia repetiría las mismas cifras
  const esPoblacion = r.grupo.n === r.grupo.n_total
  const muestra = esPoblacion ? `Grupo activo: todos los niños (${num(r.grupo.n)})` : `Grupo activo: ${num(r.grupo.n)} niños de ${num(r.grupo.n_total)}`
  return (
    <>
      <SelectorDesenlace familias={r.familias} activa={activa} elegir={elegir} />
      {/* escritorio: dos columnas a la altura que queda, «qué pasó» y «a quién mirar primero» */}
      <div role="tabpanel" id={PANEL_DESENLACE} aria-labelledby={idPestana(pestana)}
        className="grid gap-3 lg:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-rows-[minmax(0,1fr)] [&>*]:min-w-0">
        <div className="flex flex-col gap-3 xl:min-h-0">
          <Observado grupo={r.observado.grupo} poblacion={r.observado.poblacion} esPoblacion={esPoblacion} desde={r.observado.desde} className="shrink-0" />
          <Trayectoria indicador={r.trayectoria.indicador} unidad={r.trayectoria.unidad} etapas={r.trayectoria.etapas} extremos={r.extremos} muestra={muestra}
            conPoblacion={!esPoblacion} className="xl:flex-1" />
        </div>
        <div className="flex flex-col gap-3 xl:min-h-0">
          <RiesgoPorCorte filas={r.riesgo} conModelo={r.riesgo_con_modelo} alertaPercentil={r.alerta_percentil}
            desenlace={r.familias.find((f) => f.clave === r.familia)?.nombre} className="shrink-0" />
          {r.ninos && <NinosMasRiesgo ninos={r.ninos} riesgos={r.riesgo} medida={r.trayectoria.indicador === 'talla' ? 'Último puntaje Z de talla para la edad' : 'Último puntaje Z de la medida'}
            alertaPercentil={r.alerta_percentil} esPoblacion={esPoblacion} className="xl:min-h-0 xl:flex-1" />}
        </div>
      </div>
    </>
  )
}
