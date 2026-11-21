// Resumen (antes «Tablero» y «Resumen»): en escritorio cabe entero en la ventana. Las cifras van en una sola franja y los paneles
// en dos columnas que llenan el resto del alto: las gráficas conservan su alto completo (dependiendo del de la ventana) y lo que
// cede es la lista (la tabla de desenlaces y las alarmas recientes), que se desplaza por dentro con su encabezado fijo.
// La validación técnica de los modelos no va aquí: está en Administración › Modelos.
import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { ErrorApi, pedir } from '../api/cliente'
import type { AlarmaGrupo, AlarmasTrimestre, CrecimientoEtapa, ResumenTablero } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { ROLES_CLINICOS } from '../components/Marco'
import { BarrasApiladas, LeyendaSeries, LineasSeries, type ColorSerie, type FilaSeries, type Serie } from '../components/graficos'
import { Grafica, TablaDatos } from '../components/grafica'
import { Cargando, Encabezado, Insignia, Panel, Vacio } from '../components/ui'
import { Termino } from '../components/Termino'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { cn } from '../lib/cn'
import { descripcionDe } from '../lib/descripciones'
import { usePorClasificar } from '../lib/diccionario'
import { dec, fecha, indicador, INDICADORES, num, pct, riesgo } from '../lib/formato'
import { alerta, AYUDA_RIESGO_ALTO, ayudaAlerta, datosAl, definicionAlto, senal, trimestre, trimestresSeguidos } from '../lib/lenguaje'

/** Alto de las gráficas: con una ventana baja (1366×768) se achican para que el panel quepa sin cortarlas. */
const altoVentana = () => window.innerHeight
const alVentana = (avisar: () => void) => {
  window.addEventListener('resize', avisar)
  return () => window.removeEventListener('resize', avisar)
}
const useAltoGrafica = () => {
  const ventana = useSyncExternalStore(alVentana, altoVentana)
  return ventana < 820 ? 150 : ventana < 1000 ? 165 : 200
}

const DESCRIPCION_CRECIMIENTO = 'Porcentaje de los niños medidos en cada visita con crecimiento bajo frente a la OMS, por medida.'

/** «3 meses (edad corregida)» → «3 meses EC», como en el eje de la gráfica de crecimiento. */
const corto = (visita: string | null) => (visita ?? '').replace(' (edad corregida)', ' EC')

/** El nombre del desenlace sin «(riesgo calculado a …)»: la visita ya se dice en su propia línea. */
const sinVisita = (desenlace: string) => desenlace.replace(/\s*\(riesgo calculado a [^)]*\)\s*$/, '')

export default function Tablero() {
  const { usuario } = useSesion()
  const resumen = useQuery({ queryKey: ['tablero', 'resumen'], queryFn: () => pedir<ResumenTablero>('/tablero/resumen') })
  const porClasificar = usePorClasificar(puede(usuario, ['admin', 'experto'])).data?.total ?? 0
  const altoGrafica = useAltoGrafica()

  if (resumen.isPending) return <Cargando />
  if (resumen.error) {
    if (resumen.error instanceof ErrorApi && resumen.error.estado === 404) {
      return (
        <>
          <Encabezado titulo="Resumen" />
          <Vacio titulo="Todavía no hay resultados">
            {puede(usuario, ['admin'])
              ? <>Active un paquete de modelos y ejecute una corrida en <Link className="text-teal underline" to="/admin/corridas">Corridas</Link>.</>
              : 'Todavía no se han procesado los datos: la administración debe hacer la primera actualización.'}
          </Vacio>
        </>
      )
    }
    return (
      <>
        <Encabezado titulo="Resumen" />
        <ErrorConReintento error={resumen.error} que="el resumen del programa" reintentando={resumen.isFetching} reintentar={() => void resumen.refetch()} />
      </>
    )
  }
  const r = resumen.data
  // la lista de niños es de experto y administración: quien solo consulta ve la cifra, sin enlace (D65)
  const verNinos = puede(usuario, ROLES_CLINICOS)
  const verAltos = verNinos ? `/ninos?percentil_min=${r.percentil_alto}` : undefined
  const pendientes = Math.max(0, (r.datos_revisar ?? 0) - r.datos_revisados)
  const filasRiesgo = r.riesgos_por_desenlace.map((d) => ({
    Desenlace: sinVisita(d.desenlace), Visita: d.momento_nombre ?? '', Niños: d.ninos, 'Riesgo alto': d.altos, 'Riesgo promedio': riesgo(d.riesgo_medio),
  }))

  return (
    <div className="flex flex-col gap-3 lg:h-full">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-0.5">
        <h1>Resumen</h1>
        <p className="text-sm text-salvia">
          {datosAl(r.corte)}, actualizados el {fecha(r.corrida.terminada)}.
          {puede(usuario, ['admin']) && r.paquete && <> Paquete {r.paquete}.</>}
        </p>
      </div>

      {porClasificar > 0 && <AvisoDiccionario n={porClasificar} />}

      <div className="flex shrink-0 flex-wrap items-baseline gap-x-7 gap-y-1.5 rounded-panel border border-linea/80 bg-papel px-4 py-2.5 shadow-suave">
        <Indicador valor={num(r.ninos)} texto="niños con datos" />
        <Indicador valor={num(r.datos_revisar)} texto={`datos por revisar · ${dec(r.alertas_por_1000)} por mil`} tono="coral"
          a={puede(usuario, ['admin']) ? '/revision/datos' : undefined}
          ayuda={`${dec(r.alertas_por_1000)} por cada mil de los ${num(r.datos)} datos leídos.`} />
        <Indicador valor={num(r.datos_revisados)} texto="datos ya respondidos por expertos" />
        <Indicador valor={num(r.ninos_riesgo_alto)} texto="niños con algún riesgo alto" tono="coral" a={verAltos}
          ayuda={`${AYUDA_RIESGO_ALTO} Un niño puede tenerlo en varios desenlaces: son ${num(r.riesgos_altos)} riesgos altos en total.`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8 lg:min-h-0">
          <TablaDatos llenar titulo={descripcionDe('riesgo_por_desenlace').titulo} descripcion={descripcionDe('riesgo_por_desenlace').descripcion}
            exportar={{ nombre: 'riesgo-por-desenlace', filas: filasRiesgo }} className="max-lg:max-h-[26rem] lg:min-h-0 lg:flex-1"
            accion={<span className="text-xs text-salvia" title={AYUDA_RIESGO_ALTO}>{definicionAlto(r.percentil_alto)}</span>}>
            {r.riesgos_por_desenlace.length === 0 ? (
              <p className="text-sm text-salvia">
                Ningún niño tiene una visita con riesgo calculado con estos datos. El riesgo se calcula en la visita en que se
                mide cada desenlace, cuando la siguiente aún no ha pasado.
              </p>
            ) : (
              // encabezado fijo: sube 1rem (el relleno del panel) para que no se vea pasar el contenido por encima
              <table className="w-full border-collapse text-sm [&_td]:border-b [&_td]:border-linea/70 [&_td]:px-2.5 [&_td]:py-1 [&_td]:leading-snug [&_th]:sticky [&_th]:-top-4 [&_th]:z-10 [&_th]:border-b [&_th]:border-linea [&_th]:bg-papel [&_th]:px-2.5 [&_th]:pb-2 [&_th]:pt-4 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-salvia [&_th]:whitespace-nowrap [&_tbody_tr:last-child_td]:border-b-0">
                <thead>
                  <tr><th className="text-left">Desenlace</th><th className="text-right">Niños</th><th className="text-right">Alto</th><th className="text-right" title="Riesgo promedio de los niños en ese desenlace">Promedio</th></tr>
                </thead>
                <tbody>
                  {r.riesgos_por_desenlace.map((d) => (
                    <tr key={d.clave}>
                      <td>
                        <span className="font-semibold">{sinVisita(d.desenlace)}</span>
                        <span className="block whitespace-nowrap text-xs text-salvia sm:ml-2 sm:inline" title={d.momento_nombre ?? undefined}>Visita: {corto(d.momento_nombre)}</span>
                      </td>
                      <td className="text-right">{num(d.ninos)}</td>
                      <td className="text-right">
                        {verNinos
                          ? <Link to={`/ninos?desenlace=${d.clave}&percentil_min=${r.percentil_alto}`} className={d.altos ? 'font-semibold text-coral-hondo underline' : ''}>{num(d.altos)}</Link>
                          : <span className={d.altos ? 'font-semibold text-coral-hondo' : ''}>{num(d.altos)}</span>}
                      </td>
                      <td className="whitespace-nowrap text-right">{riesgo(d.riesgo_medio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TablaDatos>

          <Grafica className="shrink-0" titulo={descripcionDe('crecimiento_oms').titulo} descripcion={DESCRIPCION_CRECIMIENTO}
            exportar={{ nombre: 'crecimiento-oms', ...tablaCrecimiento(r.crecimiento_por_etapa) }}
            accion={<span className="text-xs text-salvia">EC: <Termino id="edad_corregida">edad corregida</Termino></span>}>
            <Crecimiento filas={r.crecimiento_por_etapa} alto={altoGrafica} />
          </Grafica>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4 lg:min-h-0">
          <Panel className="shrink-0"
            titulo={<h2 className="text-base" title="Un dato puede tener varias alertas; la cola pone primero los que tienen más.">Datos por revisar, por tipo de alerta</h2>}
            accion={puede(usuario, ['admin']) && pendientes > 0 &&
              <Link to="/revision/datos" className="text-sm font-semibold text-teal hover:underline">Revisar</Link>}>
            <Capas r={r} />
          </Panel>

          <AlarmasGrupo total={r.alarmas_grupo} alto={Math.round(altoGrafica * 0.75)} className="max-lg:max-h-[26rem] lg:min-h-0 lg:flex-1" />
        </div>
      </div>
    </div>
  )
}

/** Una cifra con lo que cuenta, en la franja de arriba; con enlace cuando lleva a la lista de esos niños o datos. */
function Indicador({ valor, texto, tono, a, ayuda }: { valor: string; texto: string; tono?: 'coral'; a?: string; ayuda?: string }) {
  const contenido = (
    <>
      <span className={cn('text-2xl font-bold leading-none tracking-tight', tono === 'coral' ? 'text-coral-hondo' : 'text-teal')}>{valor}</span>
      <span className="text-sm leading-snug text-salvia">{texto}</span>
    </>
  )
  const clase = 'inline-flex items-baseline gap-2'
  return a
    ? <Link to={a} title={ayuda} className={cn(clase, 'hover:underline')}>{contenido}</Link>
    : <div title={ayuda} className={clase}>{contenido}</div>
}

/** Una fila por tipo de alerta: nombre, barra y cuántos datos. */
function Capas({ r }: { r: ResumenTablero }) {
  const capas = [...Object.entries(r.alertas_por_capa), ['4', r.alarmas_grupo] as [string, number]]
  const max = Math.max(1, ...capas.map(([, n]) => n))
  return (
    <ul className="space-y-2">
      {capas.map(([capa, n]) => (
        <li key={capa} title={ayudaAlerta(capa)}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span>{alerta(capa)}</span><span className="font-semibold">{num(n)}</span></div>
          <div className="mt-0.5 h-1.5 rounded-full bg-fondo"><div className="h-full rounded-full bg-serie-1/70" style={{ width: `${(n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

const nombreVisita = (f: { etapa: string; etapa_nombre: string | null }) => (f.etapa_nombre ?? f.etapa).replace(' (edad corregida)', ' EC')

/** Una serie por medida de crecimiento. Las conocidas (peso, talla, perímetro, peso para la talla) tienen su color fijo,
 * venga o no el resto; una medida que el diccionario llame de otro modo toma, en orden alfabético, un color que no use
 * ninguna conocida presente. Si hay más medidas que colores, las que sobran quedan solo en la tabla. */
export function seriesCrecimiento(medidas: string[]): Serie[] {
  const fijas = Object.keys(INDICADORES)
  const colores: ColorSerie[] = [0, 1, 2, 3]   // uno por color de SERIES_COLOR
  const conocidas = fijas.flatMap((m, i) => (medidas.includes(m) && colores[i] !== undefined
    ? [{ clave: m, nombre: indicador(m), color: colores[i] }] : []))
  const libres = colores.filter((c) => !medidas.includes(fijas[c] ?? ''))
  const otras = medidas.filter((m) => !fijas.includes(m)).sort().slice(0, libres.length)
    .map((m, i) => ({ clave: m, nombre: indicador(m), color: libres[i] }))
  return [...conocidas, ...otras]
}

/** Cada visita y medida como fila de la tabla de la gráfica (con la caída y los datos). */
function tablaCrecimiento(filas: CrecimientoEtapa[]) {
  return {
    columnas: ['Visita', 'Medida', 'Con crecimiento bajo (%)', 'Cayó desde el control anterior (%)', 'Datos'],
    filas: [...filas].sort((a, b) => a.orden - b.orden || a.indicador.localeCompare(b.indicador)).map((f) => ({
      Visita: nombreVisita(f), Medida: indicador(f.indicador), 'Con crecimiento bajo (%)': f.pct_bajo, 'Cayó desde el control anterior (%)': f.pct_caida, Datos: f.datos,
    })),
  }
}

/** Una línea por medida con el % de niños medidos con crecimiento bajo (bajo para la edad, o para la talla) en cada visita; la
 * tabla, con la caída y los datos de cada visita, va en el botón «Ver como tabla». Cada medida conserva su color aunque falte en
 * alguna visita. */
function Crecimiento({ filas, alto }: { filas: CrecimientoEtapa[]; alto: number }) {
  if (filas.length === 0) return <p className="text-sm text-salvia">Sin datos de crecimiento.</p>
  const etapas = [...new Map([...filas].sort((a, b) => a.orden - b.orden).map((f) => [f.etapa, nombreVisita(f)])).entries()]
  const medidas = [...new Set(filas.map((f) => f.indicador))]
  const celda = new Map(filas.map((f) => [`${f.etapa}|${f.indicador}`, f]))
  const series = seriesCrecimiento(medidas)
  const datos: FilaSeries[] = etapas.map(([etapa, nombre]) => {
    const fila: FilaSeries = { x: nombre }
    for (const m of medidas) {
      const c = celda.get(`${etapa}|${m}`)
      fila[m] = c ? c.pct_bajo : null
      fila[`${m}:caida`] = c ? c.pct_caida : null
      fila[`${m}:datos`] = c ? c.datos : null
    }
    return fila
  })
  return (
    <>
      <LeyendaSeries series={series} />
      <LineasSeries filas={datos} series={series} alto={alto} formatoY={(v) => `${num(v)} %`}
        etiqueta={`Porcentaje de niños medidos con crecimiento bajo frente a la OMS en cada visita: ${series.map((s) =>
          `${s.nombre}, ${datos.map((f) => `${f.x} ${typeof f[s.clave] === 'number' ? pct(f[s.clave] as number) : 'sin dato'}`).join(', ')}`).join('; ')}`}
        formatoTooltip={(v, f, s) => `${pct(v)} bajo · ${pct(Number(f[`${s.clave}:caida`]))} cayó · ${num(Number(f[`${s.clave}:datos`]))} datos`} />
      {series.length < medidas.length && <p className="mt-1 text-sm">Las demás medidas están en «Ver como tabla».</p>}
    </>
  )
}

/** En su propio panel, con desplazamiento propio: las frases son largas y pueden ser decenas. */
function AlarmasGrupo({ total, alto, className }: { total: number | null; alto: number; className?: string }) {
  const q = useQuery({ queryKey: ['tablero', 'alarmas'], queryFn: () => pedir<AlarmaGrupo[]>('/tablero/alarmas-grupo') })
  return (
    <Grafica llenar className={className}
      titulo={descripcionDe('alarmas_grupo').titulo} descripcion={descripcionDe('alarmas_grupo').descripcion}
      exportar={{ nombre: 'alarmas-de-grupo' }}
      accion={q.data && q.data.length > 0 && (
        <span className="text-xs text-salvia">
          {total != null && total > q.data.length
            ? `${num(total)} · se muestran las ${num(q.data.length)} más recientes`
            : `${num(q.data.length)} · las más recientes primero`}
        </span>
      )}>
      {q.isPending ? <Cargando /> : q.error ? <ErrorConReintento error={q.error} que="las alarmas por grupo" reintentando={q.isFetching} reintentar={() => void q.refetch()} /> : q.data.length === 0 ? (
        <p className="text-sm text-salvia">Ningún grupo cambió de forma llamativa de un trimestre a otro.</p>
      ) : (
        <>
          <AlarmasPorTrimestre alto={alto} />
          <h3 className="mb-1 mt-4 text-sm">Las más recientes</h3>
          <ul className="divide-y divide-linea/70 text-sm">
            {q.data.map((a, i) => (
              <li key={i} className="py-2 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">{a.etiqueta ?? a.variable}</span>
                  {a.grupo && <Insignia>{a.grupo}</Insignia>}
                  <span className="text-xs text-salvia">{a.periodo}</span>
                </div>
                {a.que_paso && <p className="mt-0.5 text-salvia">{a.que_paso}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Grafica>
  )
}

/** Todas las alarmas de la corrida por trimestre, apiladas por señal; los trimestres sin alarma también ocupan su lugar. */
function AlarmasPorTrimestre({ alto }: { alto: number }) {
  const q = useQuery({ queryKey: ['tablero', 'alarmas-trimestre'], queryFn: () => pedir<AlarmasTrimestre[]>('/tablero/alarmas-por-trimestre') })
  if (!q.data?.length) return null
  // hasta tres señales con color propio; si el motor sumara más, van juntas en «Otras señales»
  const nombres = [...new Set(q.data.map((a) => a.senal))].sort()
  const propias = nombres.slice(0, nombres.length > 3 ? 2 : 3)
  const clave = (s: string) => (propias.includes(s) ? s : 'otras')
  const series: Serie[] = [...propias, ...(nombres.length > 3 ? ['otras'] : [])]
    .map((s, i) => ({ clave: s, nombre: s === 'otras' ? 'Otras señales' : senal(s), color: i === 0 ? 0 : i === 1 ? 1 : 2 }))
  const filas = new Map<string, FilaSeries>(trimestresSeguidos(q.data.map((a) => a.periodo))
    .map((p) => [p, Object.fromEntries([['x', p], ...series.map((s) => [s.clave, 0])]) as FilaSeries]))
  for (const a of q.data) {
    const f = filas.get(a.periodo)
    if (f) f[clave(a.senal)] = Number(f[clave(a.senal)] ?? 0) + a.alarmas
  }
  const datos = [...filas.values()]
  const total = q.data.reduce((n, a) => n + a.alarmas, 0)
  const primerAnio = trimestre(datos[0].x)?.anio ?? 0
  const cadaAnios = Math.max(1, Math.ceil(((trimestre(datos[datos.length - 1].x)?.anio ?? 0) - primerAnio + 1) / 6))
  return (
    <>
      <LeyendaSeries series={series} marca="barra" />
      <BarrasApiladas filas={datos} series={series} alto={alto}
        formatoX={(x) => {
          if (datos.length <= 8) return x
          // un año de cada `cadaAnios` en el primer trimestre: con muchos años los rótulos se pisarían
          const t = trimestre(x)
          return t?.t === 1 && (t.anio - primerAnio) % cadaAnios === 0 ? String(t.anio) : ''
        }}
        etiqueta={`${num(total)} alarmas de grupo entre ${datos[0].x} y ${datos[datos.length - 1].x}: ${q.data.map((a) =>
          `${a.periodo}, ${num(a.alarmas)} por ${senal(a.senal).toLowerCase()}`).join('; ')}`} />
    </>
  )
}

/** La base trajo variables que nadie ha revisado: el sistema no las usa hasta que un experto las clasifique. */
function AvisoDiccionario({ n }: { n: number }) {
  return (
    <div role="status" className="-mt-1 flex shrink-0 flex-col gap-1 rounded-control border border-ocre/40 bg-ocre-tinte/60 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span>
        {n === 1 ? 'Hay 1 variable nueva de la base sin revisar' : `Hay ${num(n)} variables nuevas de la base sin revisar`}: no se usan
        hasta clasificarlas.
      </span>
      <Link to="/diccionario" className="shrink-0 font-semibold text-teal hover:underline">Revisarlas en Diccionario</Link>
    </div>
  )
}
