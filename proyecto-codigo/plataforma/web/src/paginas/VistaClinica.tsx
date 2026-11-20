// Vista clínica: lo que pasó con los niños del grupo activo a los 12 meses (talla baja o desarrollo psicomotor bajo), cómo
// crecen visita por visita, a cuántos se alerta en cada momento de cálculo y quiénes tienen más riesgo. El grupo y el
// desenlace viven en la dirección: un enlace abre la misma vista y un error de red no los pierde al reintentar.
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useResumenClinico } from '../api/clinica'
import { ErrorApi } from '../api/cliente'
import type { ClinicaResumen, CuerpoClinica } from '../api/tipos'
import { GrupoActivo, cuerpoDeFiltros } from '../components/GrupoActivo'
import { NinosMasRiesgo } from '../components/clinica/NinosMasRiesgo'
import { Observado } from '../components/clinica/Observado'
import { RiesgoPorCorte } from '../components/clinica/RiesgoPorCorte'
import { SelectorDesenlace } from '../components/clinica/SelectorDesenlace'
import { Trayectoria } from '../components/clinica/Trayectoria'
import { Aviso, Encabezado, Vacio } from '../components/ui'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { num } from '../lib/formato'
import { datosAl } from '../lib/lenguaje'
import { useFiltros } from '../lib/useFiltros'

/** El desenlace con que abre la vista cuando existe. */
const DESENLACE_INICIAL = 'talla_baja_12m'

const enlace = 'inline-flex h-10 items-center rounded-control border border-linea bg-papel px-4 text-sm font-semibold text-tinta shadow-suave transition-colors hover:border-teal/40 hover:text-teal'

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
    <div className="flex flex-col gap-4">
      <Encabezado titulo="Vista clínica"
        accion={(
          <div className="flex flex-wrap gap-2">
            <Link className={enlace} to={{ pathname: '/comparar', search: params.toString() }}>Comparar con otro grupo</Link>
            <Link className={enlace} to={{ pathname: '/explorar', search: params.toString() }}>Explorar más variables</Link>
          </div>
        )}>
        {r?.datos_al ? <>{datosAl(r.datos_al)}. </> : null}
        Qué pasó con los niños del grupo a los 12 meses y a cuántos conviene mirar primero.
      </Encabezado>
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
            <div aria-busy={consulta.isPlaceholderData} className={consulta.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
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
  const familia = r.familias.find((f) => f.clave === r.familia) ?? r.familias[0]
  const muestra = `Grupo activo: ${num(r.grupo.n)} niños de ${num(r.grupo.n_total)}`
  return (
    <div className="flex flex-col gap-4">
      <SelectorDesenlace familias={r.familias} activa={activa} elegir={elegir} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] [&>*]:min-w-0">
        <Observado grupo={r.observado.grupo} poblacion={r.observado.poblacion} />
        <Trayectoria indicador={r.trayectoria.indicador} unidad={r.trayectoria.unidad} etapas={r.trayectoria.etapas} muestra={muestra} />
        <RiesgoPorCorte nombre={familia?.nombre ?? r.familia} filas={r.riesgo} alertaPercentil={r.alerta_percentil} />
        {r.ninos && <NinosMasRiesgo ninos={r.ninos} medida={r.trayectoria.indicador === 'talla' ? 'Última talla (z)' : 'Última medida (z)'} />}
      </div>
    </div>
  )
}
