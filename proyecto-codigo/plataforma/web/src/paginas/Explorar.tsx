// Explorar: las cifras del Tablero para el grupo de niños que se elija con un filtro. El filtro vive en la dirección
// (useFiltros). Con menos de 20 niños no se muestran cifras (D46); quien solo consulta ve los conteos menores de 100
// aproximados de 5 en 5.
import { ErrorApi } from '../api/cliente'
import { useFacetasExplorar, useResumenExplorar } from '../api/exploracion'
import type { CuerpoExplorar, ExplorarResumen } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { CrecimientoGrupo } from '../components/explorar/CrecimientoGrupo'
import { Indicador } from '../components/explorar/Indicador'
import { QuienesSon } from '../components/explorar/QuienesSon'
import { RiesgoGrupo } from '../components/explorar/RiesgoGrupo'
import { Grafica } from '../components/grafica'
import { PanelFacetas } from '../components/PanelFacetas'
import { Aviso, Boton, Cargando, Encabezado, Vacio } from '../components/ui'
import { descripcionDe } from '../lib/descripciones'
import { datosAl } from '../lib/lenguaje'
import { num, pct } from '../lib/formato'
import { useFiltros } from '../lib/useFiltros'

export default function Explorar() {
  const { usuario } = useSesion()
  const filtros = useFiltros()
  const esExperto = puede(usuario, ['admin', 'experto'])
  // una muestra guardada sin cambios se pide por su número: conserva el tiempo y el muestreo que tenga
  const cuerpo: CuerpoExplorar = filtros.guardada ? { muestra_id: filtros.guardada } : { muestra: filtros.muestra }
  const resumen = useResumenExplorar(cuerpo)
  // las variables agregadas al panel solo afectan a las opciones, no a las cifras del grupo
  const facetas = useFacetasExplorar(filtros.extras.length ? { ...cuerpo, variables: filtros.extras } : cuerpo)
  const r = resumen.data

  return (
    <div className="flex flex-col gap-4">
      <Encabezado titulo="Explorar">
        {r && !r.insuficiente ? <>{datosAl(r.corte)}. </> : null}
        Elija un grupo de niños y vea su riesgo, su crecimiento y quiénes son, frente a todos.
      </Encabezado>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <aside className="lg:col-span-4 xl:col-span-3">
          <PanelFacetas facetas={facetas.data} cargando={facetas.isPending} filtros={filtros} esExperto={esExperto} conTiempo />
        </aside>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8 xl:col-span-9">
          {resumen.isPending ? <Cargando />
            : resumen.error ? <Error error={resumen.error} />
              : r?.insuficiente && r.vacio ? (
                <Vacio titulo="Ningún niño cumple estos filtros">
                  Son 0 niños de este corte. Quite algún filtro o cambie el tiempo para ver un grupo.
                  <div className="mt-3"><Boton variante="secundario" chico onClick={filtros.limpiar}>Quitar todos los filtros</Boton></div>
                </Vacio>
              ) : r?.insuficiente ? (
                <Aviso tono="teal">
                  <strong>Con menos de {r.minimo} niños no se muestran cifras.</strong> Quite algún filtro para ver el grupo.
                </Aviso>
              ) : r ? <Cifras r={r} aproximado={usuario?.rol === 'visualizador'} filtros={filtros.entradas.length + (filtros.tiempo ? 1 : 0)} /> : null}
        </div>
      </div>
    </div>
  )
}

function Error({ error }: { error: Error }) {
  if (error instanceof ErrorApi && error.estado === 404) {
    return <Vacio titulo="Todavía no hay resultados">Cuando se procesen los datos podrá explorar grupos de niños.</Vacio>
  }
  return <Aviso>{error.message}</Aviso>
}

function Cifras({ r, aproximado, filtros }: { r: ExplorarResumen; aproximado: boolean; filtros: number }) {
  const muestra = `${filtros ? 'Grupo elegido' : 'Todos los niños'}: ${num(r.ninos)} niños de ${num(r.ninos_total)}`
  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador valor={num(r.ninos)} texto={`niños en el grupo, de ${num(r.ninos_total)}`} />
        <Indicador valor={num(r.datos)} texto="datos leídos" />
        <Indicador valor={num(r.ninos_riesgo_alto)} texto="niños con algún riesgo alto" tono="coral"
          ayuda={`Un niño puede tenerlo en varios desenlaces: son ${num(r.riesgos_altos)} riesgos altos en total.`} />
        <Indicador valor={pct(r.pct_crecimiento_bajo)} texto="de los datos de crecimiento, bajos frente a la OMS" />
      </div>
      {r.muestreo && (
        <p className="text-xs text-salvia">
          Estas cifras son las del grupo completo. Al entrenar con el tope de {num(r.muestreo.maximo_por_categoria)} niños por categoría
          {r.muestreo.ninos == null ? ' quedarían menos de 20 niños.' : ` quedarían ${num(r.muestreo.ninos)} niños.`}
        </p>
      )}
      {aproximado && <p className="text-xs text-salvia">Para proteger a los niños, las cifras menores de 100 se aproximan de 5 en 5.</p>}
      <div className="grid gap-4 2xl:grid-cols-2 [&>*]:min-w-0">
        <Grafica titulo={descripcionDe('explorar_riesgo').titulo} descripcion={descripcionDe('explorar_riesgo').descripcion}
          exportar={{ nombre: 'explorar-riesgo', muestra }}>
          <RiesgoGrupo filas={r.riesgos_por_desenlace} />
        </Grafica>
        <Grafica titulo={descripcionDe('explorar_crecimiento').titulo} descripcion={descripcionDe('explorar_crecimiento').descripcion}
          exportar={{ nombre: 'explorar-crecimiento', muestra }}>
          <CrecimientoGrupo filas={r.crecimiento_por_etapa} />
        </Grafica>
      </div>
      <Grafica titulo={descripcionDe('explorar_quienes').titulo} descripcion={descripcionDe('explorar_quienes').descripcion}
        exportar={{ nombre: 'explorar-quienes', muestra }}>
        <QuienesSon distribuciones={r.distribuciones} />
      </Grafica>
    </>
  )
}
