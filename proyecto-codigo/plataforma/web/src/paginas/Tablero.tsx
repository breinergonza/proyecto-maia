// Tablero: en escritorio cabe entero en la ventana. Las cifras van en una franja y los cuatro paneles en una grilla
// que llena el resto del alto; cada panel desplaza su contenido por dentro si no le alcanza el espacio. La validación
// técnica de los modelos no va aquí: está en Administración › Modelos.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ErrorApi, pedir } from '../api/cliente'
import type { AlarmaGrupo, CrecimientoEtapa, ResumenTablero } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { Aviso, Cargando, Encabezado, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { usePorClasificar } from '../lib/diccionario'
import { dec, dec2, fecha, indicador, num, pct, riesgo } from '../lib/formato'
import { alerta, AYUDA_OMS, AYUDA_RIESGO_ALTO, ayudaAlerta, datosAl } from '../lib/lenguaje'

export default function Tablero() {
  const { usuario } = useSesion()
  const resumen = useQuery({ queryKey: ['tablero', 'resumen'], queryFn: () => pedir<ResumenTablero>('/tablero/resumen') })
  const porClasificar = usePorClasificar(puede(usuario, ['admin', 'experto'])).data?.total ?? 0

  if (resumen.isPending) return <Cargando />
  if (resumen.error) {
    if (resumen.error instanceof ErrorApi && resumen.error.estado === 404) {
      return (
        <>
          <Encabezado titulo="Tablero" />
          <Vacio titulo="Todavía no hay resultados">
            {puede(usuario, ['admin'])
              ? <>Active un paquete de modelos y ejecute una corrida en <Link className="text-teal underline" to="/admin/corridas">Corridas</Link>.</>
              : 'Todavía no se han procesado los datos: la administración debe hacer la primera actualización.'}
          </Vacio>
        </>
      )
    }
    return <Aviso>{resumen.error.message}</Aviso>
  }
  const r = resumen.data
  const verAltos = `/ninos?percentil_min=${r.percentil_alto}`
  const pendientes = Math.max(0, (r.datos_revisar ?? 0) - r.datos_revisados)

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      <Encabezado titulo="Tablero">
        {datosAl(r.corte)}, actualizados el {fecha(r.corrida.terminada)}.
        {puede(usuario, ['admin']) && r.paquete && <> Paquete {r.paquete}.</>}
      </Encabezado>

      {porClasificar > 0 && <AvisoDiccionario n={porClasificar} />}

      <div className="-mt-1 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Indicador valor={num(r.ninos)} texto="niños con datos" />
        <Indicador valor={num(r.datos)} texto="datos leídos" />
        <Indicador valor={num(r.datos_revisar)} texto={`datos por revisar · ${dec(r.alertas_por_1000)} por mil`} tono="coral"
          a={puede(usuario, ['admin', 'experto']) ? '/revision/datos' : undefined} />
        <Indicador valor={num(r.datos_revisados)} texto="datos ya respondidos por expertos" />
        <Indicador valor={num(r.ninos_riesgo_alto)} texto="niños con algún riesgo alto" tono="coral" a={verAltos}
          ayuda={`${AYUDA_RIESGO_ALTO} Un niño puede tenerlo en varios desenlaces: son ${num(r.riesgos_altos)} riesgos altos en total.`} />
        <Indicador valor={num(r.alarmas_grupo)} texto="alarmas de grupo" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-2">
        <Panel llenar titulo="Riesgo por desenlace" className="lg:col-span-7"
          accion={<Link className="text-sm font-semibold text-teal hover:underline" to={verAltos}>Ver riesgo alto</Link>}>
          {r.riesgos_por_desenlace.length === 0 ? (
            <p className="text-sm text-salvia">
              Ningún niño tiene una visita con riesgo calculado con estos datos. El riesgo se calcula en la visita en que se
              mide cada desenlace, cuando la siguiente aún no ha pasado.
            </p>
          ) : (
            <Tabla densa>
              <thead>
                <tr><th>Desenlace</th><th className="text-right">Niños</th><th className="text-right">Alto</th><th className="text-right">Medio</th></tr>
              </thead>
              <tbody>
                {r.riesgos_por_desenlace.map((d) => (
                  <tr key={d.clave}>
                    <td>
                      <span className="font-semibold">{d.desenlace}</span>
                      <span className="block text-xs text-salvia">se calcula a los {d.momento_nombre}</span>
                    </td>
                    <td className="text-right">{num(d.ninos)}</td>
                    <td className="text-right">
                      <Link to={`/ninos?desenlace=${d.clave}&percentil_min=${r.percentil_alto}`} className={d.altos ? 'font-semibold text-coral-hondo underline' : ''}>
                        {num(d.altos)}
                      </Link>
                    </td>
                    <td className="text-right">{riesgo(d.riesgo_medio)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Panel>

        <Panel llenar className="lg:col-span-5"
          titulo={<h2 className="text-base" title="Un dato puede tener varias alertas; la cola pone primero los que tienen más.">Datos por revisar, por tipo de alerta</h2>}
          accion={puede(usuario, ['admin', 'experto']) && pendientes > 0 &&
            <Link to="/revision/datos" className="text-sm font-semibold text-teal hover:underline">Revisar</Link>}>
          <Capas r={r} />
        </Panel>

        <Panel llenar className="lg:col-span-7"
          titulo={<h2 className="text-base">Crecimiento frente a la OMS</h2>}
          accion={<span className="text-xs text-salvia" title={AYUDA_OMS}>% bajo para la edad · ↓ % que cayó desde el control anterior · EC: edad corregida</span>}>
          <Crecimiento filas={r.crecimiento_por_etapa} />
        </Panel>

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

/** Visitas en filas y medidas en columnas: las 12 filas de antes caben en una matriz de 4 × 3. */
function Crecimiento({ filas }: { filas: CrecimientoEtapa[] }) {
  if (filas.length === 0) return <p className="text-sm text-salvia">Sin datos de crecimiento.</p>
  const etapas = [...new Map(filas.map((f) => [f.etapa, f.etapa_nombre])).entries()]
  const medidas = [...new Set(filas.map((f) => f.indicador))]
  const celda = new Map(filas.map((f) => [`${f.etapa}|${f.indicador}`, f]))
  return (
    <Tabla densa>
      <thead>
        <tr><th>Visita</th>{medidas.map((m) => <th key={m} className="text-right">{indicador(m)}</th>)}</tr>
      </thead>
      <tbody>
        {etapas.map(([etapa, nombre]) => (
          <tr key={etapa}>
            <td className="font-semibold whitespace-nowrap">{(nombre ?? etapa).replace(' (edad corregida)', ' EC')}</td>
            {medidas.map((m) => {
              const c = celda.get(`${etapa}|${m}`)
              return (
                <td key={m} className="text-right whitespace-nowrap"
                  title={c ? `Bajo para la edad: ${pct(c.pct_bajo)} · cayó desde el control anterior: ${pct(c.pct_caida)} · ${num(c.datos)} datos (puntaje z mediano: ${dec2(c.z_mediano)})` : undefined}>
                  {c ? (
                    <>
                      <span className={cn('font-semibold', (c.pct_bajo ?? 0) >= 10 && 'text-ocre')}>{pct(c.pct_bajo)}</span>
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
    <Panel llenar className={cn('max-lg:[&>div]:max-h-[26rem]', className)}
      titulo={<h2 className="text-base" title="Cambios de un trimestre a otro en todo un grupo: suelen venir de un cambio en la forma de medir.">Alarmas de grupo</h2>}
      accion={q.data && q.data.length > 0 && (
        <span className="text-xs text-salvia">
          {total != null && total > q.data.length
            ? `${num(total)} · se muestran las ${num(q.data.length)} más recientes`
            : `${num(q.data.length)} · las más recientes primero`}
        </span>
      )}>
      {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : q.data.length === 0 ? (
        <p className="text-sm text-salvia">Ningún grupo cambió de forma llamativa de un trimestre a otro.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-salvia">Cambios de un trimestre a otro en todo un grupo: suelen venir de un cambio en la forma de medir.</p>
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
    </Panel>
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
