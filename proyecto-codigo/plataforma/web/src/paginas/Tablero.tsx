import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorApi, pedir } from '../api/cliente'
import type { AlarmaGrupo, Desempeno, ResumenTablero } from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { Aviso, Cargando, Cifra, Encabezado, Insignia, Panel, Tabla, Vacio } from '../components/ui'
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
    <>
      <Encabezado titulo="Tablero">
        Corte del {fecha(r.corte)}, con el paquete de modelos {r.paquete ?? '—'}. Corrida {r.corrida.id}, terminada el{' '}
        {fecha(r.corrida.terminada)}.
      </Encabezado>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-panel border border-linea bg-papel p-5 sm:grid-cols-3 lg:grid-cols-6">
        <Cifra valor={num(r.ninos)} texto="niños en el corte" />
        <Cifra valor={num(r.datos)} texto="datos leídos" />
        <Cifra valor={num(r.datos_revisar)} texto={`datos por revisar (${dec(r.alertas_por_1000)} por mil)`} tono="coral" />
        <Cifra valor={num(pendientes)} texto="aún sin respuesta del experto" />
        <Cifra valor={num(altos)} texto="niños-desenlace en riesgo alto (posición 90 o más)" tono="coral" />
        <Cifra valor={num(r.alarmas_grupo)} texto="alarmas de grupo" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Panel titulo="Riesgo por desenlace"
          accion={<Link className="text-sm text-teal underline" to="/ninos?percentil_min=90">Ver los niños en riesgo alto</Link>}>
          {r.riesgos_por_desenlace.length === 0 ? (
            <Vacio titulo="Ningún niño tiene una visita con riesgo calculado en este corte">
              El riesgo se calcula en la visita en que se mide cada desenlace, cuando la siguiente aún no ha pasado.
            </Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr><th>Desenlace</th><th>Se calcula en</th><th className="text-right">Niños</th><th className="text-right">Riesgo alto</th><th className="text-right">Riesgo medio</th></tr>
              </thead>
              <tbody>
                {r.riesgos_por_desenlace.map((d) => (
                  <tr key={d.clave}>
                    <td className="font-semibold">{d.desenlace}</td>
                    <td>{d.momento_nombre}</td>
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

        <Panel titulo="Datos por revisar, por capa del modelo">
          <p className="mb-3 text-sm text-salvia">Un mismo dato puede caer en varias capas. La cola los ordena: primero los que marcan más capas.</p>
          <ul className="divide-y divide-linea">
            {Object.entries(r.alertas_por_capa).map(([capa, n]) => (
              <li key={capa} className="flex items-baseline justify-between py-2">
                <span><span className="text-salvia">Capa {capa}.</span> {CAPAS[capa] ?? capa}</span>
                <span className="font-semibold">{num(n)}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between py-2">
              <span><span className="text-salvia">Capa 4.</span> {CAPAS['4']}</span>
              <span className="font-semibold">{num(r.alarmas_grupo)}</span>
            </li>
          </ul>
          {puede(usuario, ['admin', 'experto']) && pendientes > 0 && (
            <Link to="/revision/datos" className="mt-4 inline-block font-semibold text-teal underline">Revisar los datos pendientes</Link>
          )}
        </Panel>
      </div>

      <Desempeno />

      <Panel titulo="Crecimiento frente al estándar de la OMS" className="mt-6">
        <p className="mb-3 text-sm text-salvia">
          Por visita, en edad corregida. «Bajo −2 DE»: puntaje z menor que −2. «Caída»: bajó más de una desviación estándar
          desde la visita anterior. No incluye los datos improbables.
        </p>
        {r.crecimiento_por_etapa.length === 0 ? <Vacio titulo="Sin datos de crecimiento" /> : (
          <Tabla>
            <thead><tr><th>Visita</th><th>Medida</th><th className="text-right">Datos</th><th className="text-right">Bajo −2 DE</th><th className="text-right">Caída</th><th className="text-right">z mediano</th></tr></thead>
            <tbody>
              {r.crecimiento_por_etapa.map((c) => (
                <tr key={`${c.etapa}-${c.indicador}`}>
                  <td>{c.etapa_nombre}</td>
                  <td>{indicador(c.indicador)}</td>
                  <td className="text-right">{num(c.datos)}</td>
                  <td className="text-right">{pct(c.pct_bajo)}</td>
                  <td className="text-right">{pct(c.pct_caida)}</td>
                  <td className="text-right">{dec2(c.z_mediano)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>

      <AlarmasGrupo />
    </>
  )
}

function Desempeno() {
  const q = useQuery({ queryKey: ['tablero', 'desempeno'], queryFn: () => pedir<Desempeno>('/tablero/desempeno') })
  if (q.isPending) return null
  if (q.error) return <div className="mt-6"><Aviso>{q.error.message}</Aviso></div>
  const filas = q.data.desenlaces.filter((d) => typeof d.auc === 'number')
  return (
    <Panel titulo="¿El modelo ordena mejor que la regla simple?" className="mt-6"
      accion={<span className="text-sm text-salvia">Modelo clínico {q.data.modelo_clinico ?? '—'}</span>}>
      <p className="mb-4 max-w-[75ch] text-sm text-salvia">
        Validación con los niños más recientes, que el modelo no vio al entrenar. El AUC mide qué tan bien separa a quienes
        tuvieron el desenlace de quienes no: 0,5 es azar (la línea punteada) y 1 es perfecto. La regla simple usa solo las variables que hoy
        mira el equipo clínico.
      </p>
      {filas.length === 0 ? <Vacio titulo="El paquete activo no trae validación de desenlaces" /> : (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="h-[max(220px,calc(52px*var(--n)))]" style={{ ['--n' as string]: filas.length }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filas} layout="vertical" margin={{ left: 8, right: 24 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid horizontal={false} stroke="#e4ebea" />
                <XAxis type="number" domain={[0.4, 1]} tickFormatter={(v: number) => dec2(v)} stroke="#56736d" fontSize={12} />
                <YAxis type="category" dataKey="desenlace" width={170} stroke="#56736d" fontSize={12} tickLine={false} />
                <ReferenceLine x={0.5} stroke="#8a9b98" strokeDasharray="4 3" />
                <Tooltip formatter={(v) => dec2(Number(v))} cursor={{ fill: '#f3f6f5' }} />
                <Legend verticalAlign="top" height={28} iconType="square" />
                <Bar dataKey="auc" name="Modelo" fill="#008f99" radius={[0, 4, 4, 0]} />
                <Bar dataKey="auc_regla" name="Regla simple" fill="#8a9b98" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Tabla>
            <thead><tr><th>Desenlace</th><th className="text-right">AUC</th><th className="text-right">Regla</th><th className="text-right">Casos en el 10 % más alto</th></tr></thead>
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
    <Panel titulo="Alarmas de grupo" className="mt-6">
      <p className="mb-3 text-sm text-salvia">Cambios de un trimestre a otro en todo un grupo de niños: suelen venir de un cambio en la forma de medir o de registrar.</p>
      <Tabla>
        <thead><tr><th>Trimestre</th><th>Grupo</th><th>Variable</th><th>Qué pasó</th></tr></thead>
        <tbody>
          {q.data.slice(0, 30).map((a, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{a.periodo}</td>
              <td>{a.grupo ? <Insignia>{a.grupo}</Insignia> : '—'}</td>
              <td>{a.etiqueta ?? a.variable}</td>
              <td>{a.que_paso}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </Panel>
  )
}
