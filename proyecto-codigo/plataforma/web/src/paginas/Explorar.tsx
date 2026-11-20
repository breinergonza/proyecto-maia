// Explorar: las cifras del Tablero para el grupo de niños que se elija con un filtro. El filtro vive en la dirección
// (useFiltros). Con menos de 20 niños no se muestran cifras (D46); las demás son exactas para todos los perfiles (D64).
import { ErrorApi } from '../api/cliente'
import { useFacetasExplorar, useResumenExplorar } from '../api/exploracion'
import type { ExplorarResumen } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { CrecimientoGrupo } from '../components/explorar/CrecimientoGrupo'
import { Indicador } from '../components/explorar/Indicador'
import { QuienesSon } from '../components/explorar/QuienesSon'
import { RiesgoGrupo } from '../components/explorar/RiesgoGrupo'
import { Grafica } from '../components/grafica'
import { cuerpoDeFacetas, cuerpoDeFiltros, GrupoActivo } from '../components/GrupoActivo'
import { PanelFacetas } from '../components/PanelFacetas'
import { Aviso, Boton, Cargando, Encabezado, Vacio } from '../components/ui'
import { PanelPestana, Pestanas, usePestanaEnUrl } from '../components/ui/Pestanas'
import { descripcionDe } from '../lib/descripciones'
import { datosAl } from '../lib/lenguaje'
import { num, pct } from '../lib/formato'
import { useFiltros } from '../lib/useFiltros'

export default function Explorar() {
  const { usuario } = useSesion()
  const filtros = useFiltros()
  const esExperto = puede(usuario, ['admin', 'experto'])
  // una muestra guardada sin cambios se pide por su número: conserva el tiempo y el muestreo que tenga
  const resumen = useResumenExplorar(cuerpoDeFiltros(filtros))
  // las variables agregadas al panel solo afectan a las opciones, no a las cifras del grupo
  const facetas = useFacetasExplorar(cuerpoDeFacetas(filtros))
  const r = resumen.data

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      <Encabezado titulo="Explorar">
        {r && !r.insuficiente ? <>{datosAl(r.corte)}. </> : null}
        Elija un grupo de niños y vea su riesgo, su crecimiento y quiénes son, frente a todos.
      </Encabezado>
      {/* el panel de filtros ya está a la vista en esta página: la barra solo dice qué grupo es */}
      <GrupoActivo conPanel={false} ninos={r?.ninos} total={r && !r.insuficiente ? r.ninos_total : undefined} minimo={r?.minimo} error={resumen.isError} />
      {/* en escritorio los filtros y los resultados se desplazan cada uno por su lado: el grupo activo y el encabezado quedan a la vista */}
      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
        <aside className="lg:col-span-4 lg:min-h-0 lg:overflow-y-auto xl:col-span-3">
          <PanelFacetas facetas={facetas.data} cargando={facetas.isPending} filtros={filtros} esExperto={esExperto} conTiempo
            error={facetas.isError} reintentar={() => facetas.refetch()} />
        </aside>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8 lg:min-h-0 lg:overflow-y-auto xl:col-span-9">
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
              ) : r ? <Cifras r={r} filtros={filtros.entradas.length + (filtros.tiempo ? 1 : 0)} /> : null}
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

const GRAFICAS = [
  { clave: 'riesgo', texto: 'Riesgo' },
  { clave: 'crecimiento', texto: 'Crecimiento' },
  { clave: 'quienes', texto: 'Quiénes son' },
] as const
const CLAVES = GRAFICAS.map((g) => g.clave)

function Cifras({ r, filtros }: { r: ExplorarResumen; filtros: number }) {
  // una gráfica por pestaña: apiladas, la página (o la columna) se desplazaba casi tres pantallas
  const [ver, elegir] = usePestanaEnUrl('ver', CLAVES)
  const muestra = `${filtros ? 'Grupo elegido' : 'Todos los niños'}: ${num(r.ninos)} niños de ${num(r.ninos_total)}`
  return (
    <>
      {/* cuántos niños son el grupo y el total ya lo dice la barra del grupo activo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Indicador valor={num(r.datos)} texto="datos registrados de los niños del grupo" />
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
      <Pestanas prefijo="explorar" etiqueta="Qué ver del grupo" pestanas={GRAFICAS} activa={ver} elegir={elegir} />
      {/* la gráfica llena lo que queda de alto; una lista larga (riesgo de muchos desenlaces) se desplaza dentro de ella */}
      <PanelPestana prefijo="explorar" activa={ver} className="flex min-h-0 flex-1 flex-col [&>*]:min-w-0">
        {ver === 'riesgo' ? (
          <Grafica llenar titulo={descripcionDe('explorar_riesgo').titulo} descripcion={descripcionDe('explorar_riesgo').descripcion}
            exportar={{ nombre: 'explorar-riesgo', muestra, unidad: 'Niños con riesgo alto (percentil 90 o más) de los niños del grupo con riesgo calculado desde esa visita: el denominador está junto a cada barra' }}>
            <RiesgoGrupo filas={r.riesgos_por_desenlace} />
          </Grafica>
        ) : ver === 'crecimiento' ? (
          <Grafica llenar titulo={descripcionDe('explorar_crecimiento').titulo} descripcion={descripcionDe('explorar_crecimiento').descripcion}
            exportar={{ nombre: 'explorar-crecimiento', muestra, unidad: '% de las medidas del grupo en cada visita con z menor que −2 frente a la OMS: cada punto dice cuántos datos usa' }}>
            <CrecimientoGrupo filas={r.crecimiento_por_etapa} />
          </Grafica>
        ) : (
          <Grafica llenar titulo={descripcionDe('explorar_quienes').titulo} descripcion={descripcionDe('explorar_quienes').descripcion}
            exportar={{ nombre: 'explorar-quienes', muestra, unidad: '% de los niños con el dato, en el grupo y en todos' }}>
            <QuienesSon distribuciones={r.distribuciones} />
          </Grafica>
        )}
      </PanelPestana>
    </>
  )
}
