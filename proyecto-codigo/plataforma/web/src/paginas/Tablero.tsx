// Tablero: en escritorio cabe entero en la ventana. Las cifras van en una franja y los cuatro paneles en una grilla
// que llena el resto del alto; cada panel desplaza su contenido por dentro si no le alcanza el espacio.
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorApi, pedir } from '../api/cliente'
import type { AlarmaGrupo, CrecimientoEtapa, Desempeno, ResumenTablero } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { Aviso, Cargando, Encabezado, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { CAPAS, dec, dec2, fecha, indicador, num, pct, riesgo } from '../lib/formato'

export default function Tablero() {
  const { usuario } = useSesion()
  const resumen = useQuery({ queryKey: ['tablero', 'resumen'], queryFn: () => pedir<ResumenTablero>('/tablero/resumen') })

  if (resumen.isPending) return <Cargando />
  if (resumen.error) {
    if (resumen.error instanceof ErrorApi && resumen.error.estado === 404) {
      return (
        <>
          <Encabezado titulo="Tablero" />
          <Vacio titulo="Todavía no hay resultados">
            {puede(usuario, ['admin'])
              ? <>Active un paquete de modelos y ejecute una corrida en <Link className="text-teal underline" to="/admin/corridas">Corridas</Link>.</>
              : 'La administración debe ejecutar la primera corrida.'}
          </Vacio>
        </>
      )
    }
    return <Aviso>{resumen.error.message}</Aviso>
  }
  const r = resumen.data
  const altos = r.riesgos_por_desenlace.reduce((s, x) => s + x.altos, 0)
  const pendientes = Math.max(0, (r.datos_revisar ?? 0) - r.datos_revisados)

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      <Encabezado titulo="Tablero">
        Corte del {fecha(r.corte)} · paquete {r.paquete ?? '—'} · corrida {r.corrida.id}, terminada el {fecha(r.corrida.terminada)}.
      </Encabezado>

      <div className="-mt-1 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Indicador valor={num(r.ninos)} texto="niños en el corte" />
        <Indicador valor={num(r.datos)} texto="datos leídos" />
        <Indicador valor={num(r.datos_revisar)} texto={`datos por revisar · ${dec(r.alertas_por_1000)} por mil`} tono="coral"
          a={puede(usuario, ['admin', 'experto']) ? '/revision/datos' : undefined} />
        <Indicador valor={num(pendientes)} texto="sin respuesta del experto" />
        <Indicador valor={num(altos)} texto="en riesgo alto (posición ≥ 90)" tono="coral" a="/ninos?percentil_min=90" />
        <Indicador valor={num(r.alarmas_grupo)} texto="alarmas de grupo" />
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-2">
        <DesempenoModelo className="lg:col-span-7" />

        <Panel llenar className="lg:col-span-5"
          titulo={<h2 className="text-base" title="Un dato puede caer en varias capas; la cola pone primero los que marcan más.">Datos por revisar, por capa</h2>}
          accion={puede(usuario, ['admin', 'experto']) && pendientes > 0 &&
            <Link to="/revision/datos" className="text-sm font-semibold text-teal hover:underline">Revisar</Link>}>
          <Capas r={r} />
          <AlarmasGrupo />
        </Panel>

        <Panel llenar titulo="Riesgo por desenlace" className="lg:col-span-5"
          accion={<Link className="text-sm font-semibold text-teal hover:underline" to="/ninos?percentil_min=90">Ver riesgo alto</Link>}>
          {r.riesgos_por_desenlace.length === 0 ? (
            <p className="text-sm text-salvia">
              Ningún niño tiene una visita con riesgo calculado en este corte. El riesgo se calcula en la visita en que se
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
                      <Link to={`/ninos?desenlace=${d.clave}&percentil_min=90`} className={d.altos ? 'font-semibold text-coral-hondo underline' : ''}>
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

        <Panel llenar className="lg:col-span-7"
          titulo={<h2 className="text-base">Crecimiento frente a la OMS</h2>}
          accion={<span className="text-xs text-salvia">% bajo −2 DE · ↓ caída de más de 1 DE · EC: edad corregida</span>}>
          <Crecimiento filas={r.crecimiento_por_etapa} />
        </Panel>
      </div>
    </div>
  )
}

function Indicador({ valor, texto, tono, a }: { valor: string; texto: string; tono?: 'coral'; a?: string }) {
  const contenido = (
    <>
      <div className={cn('text-2xl font-bold leading-none tracking-tight', tono === 'coral' ? 'text-coral-hondo' : 'text-teal')}>{valor}</div>
      <div className="mt-1.5 text-xs leading-snug text-salvia">{texto}</div>
    </>
  )
  const clase = 'block animate-aparecer rounded-panel border border-linea/80 bg-papel px-4 py-2.5 shadow-suave'
  return a
    ? <Link to={a} className={cn(clase, 'transition-colors hover:border-teal/40')}>{contenido}</Link>
    : <div className={clase}>{contenido}</div>
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
              <span><span className="text-salvia">Capa {capa}.</span> {CAPAS[capa] ?? capa}</span>
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
                  title={c ? `Bajo −2 DE: ${pct(c.pct_bajo)} · caída: ${pct(c.pct_caida)} · z mediano: ${dec2(c.z_mediano)} · ${num(c.datos)} datos` : undefined}>
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

function DesempenoModelo({ className }: { className?: string }) {
  const q = useQuery({ queryKey: ['tablero', 'desempeno'], queryFn: () => pedir<Desempeno>('/tablero/desempeno') })
  const filas = q.data?.desenlaces.filter((d) => typeof d.auc === 'number') ?? []
  return (
    <Panel llenar className={className}
      titulo={<h2 className="text-base" title="Validación con los niños más recientes, que el modelo no vio al entrenar. AUC: 0,5 es azar (línea punteada) y 1 es perfecto. La regla simple usa solo las variables que hoy mira el equipo clínico.">¿El modelo ordena mejor que la regla simple?</h2>}
      accion={<span className="text-xs text-salvia">AUC en validación · modelo {q.data?.modelo_clinico ?? '—'}</span>}>
      {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : filas.length === 0 ? (
        <p className="text-sm text-salvia">El paquete activo no trae validación de desenlaces.</p>
      ) : (
        <div className="grid gap-4 md:h-full 2xl:grid-cols-[1.25fr_1fr]">
          <div className="h-56 min-h-0 md:h-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filas} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid horizontal={false} stroke="#e3e9e8" />
                <XAxis type="number" domain={[0.4, 1]} tickFormatter={(v: number) => dec2(v)} stroke="#5b716d" fontSize={11} />
                <YAxis type="category" dataKey="desenlace" width={150} stroke="#5b716d" fontSize={11} tickLine={false} />
                <ReferenceLine x={0.5} stroke="#8a9b98" strokeDasharray="4 3" />
                <Tooltip formatter={(v) => dec2(Number(v))} cursor={{ fill: '#f6f8f8' }} />
                <Legend verticalAlign="top" height={22} iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="auc" name="Modelo" fill="#008f99" radius={[0, 4, 4, 0]} />
                <Bar dataKey="auc_regla" name="Regla simple" fill="#8a9b98" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Tabla densa className="hidden 2xl:block">
            <thead><tr><th>Desenlace</th><th className="text-right">AUC</th><th className="text-right">Regla</th><th className="text-right">Top 10 %</th></tr></thead>
            <tbody>
              {filas.map((d) => (
                <tr key={d.clave}>
                  <td>{d.desenlace}</td>
                  <td className="text-right font-semibold">{dec2(d.auc as number)}</td>
                  <td className="text-right">{dec2(d.auc_regla as number)}</td>
                  <td className="text-right">{typeof d.top10 === 'number' ? pct(d.top10) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      )}
    </Panel>
  )
}

function AlarmasGrupo() {
  const q = useQuery({ queryKey: ['tablero', 'alarmas'], queryFn: () => pedir<AlarmaGrupo[]>('/tablero/alarmas-grupo') })
  if (q.isPending || q.error || q.data.length === 0) return null
  return (
    <div className="mt-4 border-t border-linea pt-3">
      <h3 className="mb-2 text-sm">Alarmas de grupo</h3>
      <p className="mb-2 text-xs text-salvia">Cambios de un trimestre a otro en todo un grupo: suelen venir de un cambio en la forma de medir.</p>
      <ul className="space-y-2 text-sm">
        {q.data.slice(0, 30).map((a, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-salvia">{a.periodo}</span>
            {a.grupo && <Insignia>{a.grupo}</Insignia>}
            <span className="font-semibold">{a.etiqueta ?? a.variable}</span>
            <span>{a.que_paso}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
