// Resumen del programa (antes «Tablero»): en escritorio cabe entero en la ventana. Las cifras van en una franja y los cuatro paneles en una grilla
// que llena el resto del alto; cada panel desplaza su contenido por dentro si no le alcanza el espacio. La validación
// técnica de los modelos no va aquí: está en Administración › Modelos.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ErrorApi, pedir } from '../api/cliente'
import type { AlarmaGrupo, AlarmasTrimestre, CrecimientoEtapa, ResumenTablero } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { BarrasApiladas, LeyendaSeries, LineasSeries, type ColorSerie, type FilaSeries, type Serie } from '../components/graficos'
import { Grafica } from '../components/grafica'
import { Cargando, Encabezado, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { ErrorConReintento } from '../components/ErrorConReintento'
import { cn } from '../lib/cn'
import { descripcionDe } from '../lib/descripciones'
import { usePorClasificar } from '../lib/diccionario'
import { dec, dec2, fecha, indicador, INDICADORES, num, pct, riesgo } from '../lib/formato'
import { alerta, AYUDA_OMS, AYUDA_RIESGO_ALTO, ayudaAlerta, datosAl, senal, trimestre, trimestresSeguidos } from '../lib/lenguaje'

export default function Tablero() {
  const { usuario } = useSesion()
  const resumen = useQuery({ queryKey: ['tablero', 'resumen'], queryFn: () => pedir<ResumenTablero>('/tablero/resumen') })
  const porClasificar = usePorClasificar(puede(usuario, ['admin', 'experto'])).data?.total ?? 0

  if (resumen.isPending) return <Cargando />
  if (resumen.error) {
    if (resumen.error instanceof ErrorApi && resumen.error.estado === 404) {
      return (
        <>
          <Encabezado titulo="Resumen del programa" />
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
        <Encabezado titulo="Resumen del programa" />
        <ErrorConReintento error={resumen.error} que="el resumen del programa" reintentando={resumen.isFetching} reintentar={() => void resumen.refetch()} />
      </>
    )
  }
  const r = resumen.data
  const verAltos = `/ninos?percentil_min=${r.percentil_alto}`
  const pendientes = Math.max(0, (r.datos_revisar ?? 0) - r.datos_revisados)

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      <Encabezado titulo="Resumen del programa">
        {datosAl(r.corte)}, actualizados el {fecha(r.corrida.terminada)}.
        {puede(usuario, ['admin']) && r.paquete && <> Paquete {r.paquete}.</>}
      </Encabezado>

      {porClasificar > 0 && <AvisoDiccionario n={porClasificar} />}

      <div className="-mt-1 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Indicador valor={num(r.ninos)} texto="niños con datos" />
        <Indicador valor={num(r.datos)} texto="datos leídos" />
        <Indicador valor={num(r.datos_revisar)} texto={`datos por revisar · ${dec(r.alertas_por_1000)} por mil`} tono="coral"
          a={puede(usuario, ['admin']) ? '/revision/datos' : undefined} />
        <Indicador valor={num(r.datos_revisados)} texto="datos ya respondidos por expertos" />
        <Indicador valor={num(r.ninos_riesgo_alto)} texto="niños con algún riesgo alto" tono="coral" a={verAltos}
          ayuda={`${AYUDA_RIESGO_ALTO} Un niño puede tenerlo en varios desenlaces: son ${num(r.riesgos_altos)} riesgos altos en total.`} />
        <Indicador valor={num(r.alarmas_grupo)} texto="alarmas de grupo" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-2">
        <Grafica llenar titulo={descripcionDe('riesgo_por_desenlace').titulo} descripcion={descripcionDe('riesgo_por_desenlace').descripcion}
          exportar={{ nombre: 'riesgo-por-desenlace' }} className="lg:col-span-7"
          accion={<Link className="text-sm font-semibold text-teal hover:underline" to={verAltos}>Ver riesgo alto</Link>}>
          {r.riesgos_por_desenlace.length === 0 ? (
            <p className="text-sm text-salvia">
              Ningún niño tiene una visita con riesgo calculado con estos datos. El riesgo se calcula en la visita en que se
              mide cada desenlace, cuando la siguiente aún no ha pasado.
            </p>
          ) : (
            <Tabla densa>
              <thead>
                <tr><th>Desenlace</th><th className="text-right">Niños</th><th className="text-right">Alto</th><th className="text-right" title="Riesgo promedio de los niños en ese desenlace">Promedio</th></tr>
              </thead>
              <tbody>
                {r.riesgos_por_desenlace.map((d) => (
                  <tr key={d.clave}>
                    <td>
                      <span className="font-semibold">{d.desenlace}</span>
                      <span className="block text-xs text-salvia">Visita: {d.momento_nombre}</span>
                    </td>
                    <td className="text-right">{num(d.ninos)}</td>
                    <td className="text-right">
                      <Link to={`/ninos?desenlace=${d.clave}&percentil_min=${r.percentil_alto}`} className={d.altos ? 'font-semibold text-coral-hondo underline' : ''}>
                        {num(d.altos)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-right">{riesgo(d.riesgo_medio)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Grafica>

        <Panel llenar className="lg:col-span-5"
          titulo={<h2 className="text-base" title="Un dato puede tener varias alertas; la cola pone primero los que tienen más.">Datos por revisar, por tipo de alerta</h2>}
          accion={puede(usuario, ['admin']) && pendientes > 0 &&
            <Link to="/revision/datos" className="text-sm font-semibold text-teal hover:underline">Revisar</Link>}>
          <Capas r={r} />
        </Panel>

        <Grafica llenar className="lg:col-span-7" titulo={descripcionDe('crecimiento_oms').titulo}
          descripcion={descripcionDe('crecimiento_oms').descripcion} exportar={{ nombre: 'crecimiento-oms' }}
          accion={<span className="text-xs text-salvia" title={AYUDA_OMS}>% de los niños medidos con crecimiento bajo frente a la OMS · EC: edad corregida</span>}>
          <Crecimiento filas={r.crecimiento_por_etapa} />
        </Grafica>

        <AlarmasGrupo total={r.alarmas_grupo} className="lg:col-span-5" />
      </div>
    </div>
  )
}

function Indicador({ valor, texto, tono, a, ayuda }: { valor: string; texto: string; tono?: 'coral'; a?: string; ayuda?: string }) {
  const contenido = (
    <>
      <div className={cn('text-2xl font-bold leading-none tracking-tight', tono === 'coral' ? 'text-coral-hondo' : 'text-teal')}>{valor}</div>
      <div className="mt-1.5 text-xs leading-snug text-salvia">{texto}</div>
    </>
  )
  const clase = 'block animate-aparecer rounded-panel border border-linea/80 bg-papel px-4 py-2.5 shadow-suave'
  return a
    ? <Link to={a} title={ayuda} className={cn(clase, 'transition-colors hover:border-teal/40')}>{contenido}</Link>
    : <div title={ayuda} className={clase}>{contenido}</div>
}

function Capas({ r }: { r: ResumenTablero }) {
  const capas = [...Object.entries(r.alertas_por_capa), ['4', r.alarmas_grupo] as [string, number]]
  const max = Math.max(1, ...capas.map(([, n]) => n))
  return (
    <>
      <ul className="space-y-2">
        {capas.map(([capa, n]) => (
          <li key={capa}>
            <div className="flex items-baseline justify-between text-sm">
              <span title={ayudaAlerta(capa)}>{alerta(capa)}</span>
              <span className="font-semibold">{num(n)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-fondo">
              <div className="h-full rounded-full bg-serie-1/70" style={{ width: `${(n / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </>
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

/** Una línea por medida con el % de niños medidos con crecimiento bajo (bajo para la edad, o para la talla) en cada visita; la tabla con la caída y los datos queda
 * debajo, plegada. Cada medida conserva su color aunque falte en alguna visita. */
function Crecimiento({ filas }: { filas: CrecimientoEtapa[] }) {
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
      <LineasSeries filas={datos} series={series} alto={200} formatoY={(v) => `${num(v)} %`}
        etiqueta={`Porcentaje de niños medidos con crecimiento bajo frente a la OMS en cada visita: ${series.map((s) =>
          `${s.nombre}, ${datos.map((f) => `${f.x} ${typeof f[s.clave] === 'number' ? pct(f[s.clave] as number) : 'sin dato'}`).join(', ')}`).join('; ')}`}
        formatoTooltip={(v, f, s) => `${pct(v)} bajo · ${pct(Number(f[`${s.clave}:caida`]))} cayó · ${num(Number(f[`${s.clave}:datos`]))} datos`} />
      {series.length < medidas.length && <p className="mt-1 text-sm">Las demás medidas están en la tabla.</p>}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-teal">Ver la tabla</summary>
        <TablaCrecimiento etapas={etapas} medidas={medidas} celda={celda} />
      </details>
    </>
  )
}

function TablaCrecimiento({ etapas, medidas, celda }: {
  etapas: [string, string][]; medidas: string[]; celda: Map<string, CrecimientoEtapa>
}) {
  return (
    <Tabla densa>
      <thead>
        <tr><th>Visita</th>{medidas.map((m) => <th key={m} className="text-right">{indicador(m)}</th>)}</tr>
      </thead>
      <tbody>
        {etapas.map(([etapa, nombre]) => (
          <tr key={etapa}>
            <td className="font-semibold whitespace-nowrap">{nombre}</td>
            {medidas.map((m) => {
              const c = celda.get(`${etapa}|${m}`)
              return (
                <td key={m} className="text-right whitespace-nowrap"
                  title={c ? `Bajo para la edad: ${pct(c.pct_bajo)} · cayó desde el control anterior: ${pct(c.pct_caida)} · ${num(c.datos)} datos (puntaje z mediano: ${dec2(c.z_mediano)})` : undefined}>
                  {c ? (
                    <>
                      <span className={cn('font-semibold', (c.pct_bajo ?? 0) >= 10 && 'text-ocre-hondo')}>{pct(c.pct_bajo)}</span>
                      <span className="ml-1.5 text-xs text-salvia">↓{pct(c.pct_caida)}</span>
                    </>
                  ) : '—'}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </Tabla>
  )
}

/** En su propio panel, con desplazamiento propio: las frases son largas y pueden ser decenas. */
function AlarmasGrupo({ total, className }: { total: number | null; className?: string }) {
  const q = useQuery({ queryKey: ['tablero', 'alarmas'], queryFn: () => pedir<AlarmaGrupo[]>('/tablero/alarmas-grupo') })
  return (
    <Grafica llenar className={cn('max-lg:[&>div]:max-h-[26rem]', className)}
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
          <p className="mb-3 text-xs text-salvia">Cambios de un trimestre a otro en todo un grupo: suelen venir de un cambio en la forma de medir.</p>
          <AlarmasPorTrimestre />
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
function AlarmasPorTrimestre() {
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
  return (
    <>
      <LeyendaSeries series={series} marca="barra" />
      <BarrasApiladas filas={datos} series={series}
        formatoX={(x) => (trimestre(x)?.t === 1 || datos.length <= 8 ? (datos.length <= 8 ? x : x.slice(0, 4)) : '')}
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
