// Cómo se comportan las alertas de datos: cuántas hay por tipo, cuántas confirmó el equipo al revisar las primeras y dónde se
// concentran. Alimentan la exigencia del siguiente entrenamiento; la cola de mediciones por revisar está arriba, en la página.
import { useQuery } from '@tanstack/react-query'
import { pedir } from '../../api/cliente'
import { useAciertos, useConcentracion } from '../../api/calidad'
import type { ConcentracionAlertas, ResumenTablero } from '../../api/tipos'
import { alerta } from '../../lib/lenguaje'
import { num, numero, pct } from '../../lib/formato'
import { BarrasApiladas, LineasSeries, type FilaSeries, type Serie } from '../graficos'
import { Aviso, Cargando, Cifra, Panel } from '../ui'
import { NotaGrafica } from '../modelos/NotaGrafica'

const SERIE_ALERTAS: Serie[] = [{ clave: 'alertas', nombre: 'Alertas', color: 0 }]
const SERIE_ACIERTOS: Serie[] = [{ clave: 'precision', nombre: 'Confirmadas como error', color: 0 }]

/** Lo que dicen las alertas de la corrida y qué tanto aciertan frente a lo que respondió el equipo. */
export function MedidasDeRevision() {
  const resumen = useQuery({ queryKey: ['tablero', 'resumen'], queryFn: () => pedir<ResumenTablero>('/tablero/resumen') })
  const aciertos = useAciertos()
  const concentracion = useConcentracion()
  const r = resumen.data
  const porCapa: FilaSeries[] = Object.entries(r?.alertas_por_capa ?? {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([capa, n]) => ({ x: alerta(capa), alertas: n }))
  const puntos: FilaSeries[] = (aciertos.data?.serie ?? []).filter((p) => p.precision != null)
    .map((p) => ({ x: `${p.k}`, precision: p.precision, respondidas: p.respondidas }))
  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Cifra valor={r ? num(r.datos_revisar) : '—'} texto="datos por revisar" />
          <Cifra valor={r ? numero(r.alertas_por_1000) : '—'} texto="alertas por cada mil datos" />
          <Cifra valor={pct(aciertos.data?.confirmadas_error_pct)} texto="de los respondidos, confirmados como error" />
          <Cifra valor={r ? num(r.alarmas_grupo) : '—'} texto="alarmas de grupo" />
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel titulo="Alertas por tipo">
          <p className="mb-2 text-sm text-tinta/80">Cuántos datos raros encontró cada revisión.</p>
          {resumen.isPending ? <Cargando /> : porCapa.length === 0 ? <p className="text-sm text-tinta/80">No hay alertas con los últimos datos.</p> : (
            <BarrasApiladas filas={porCapa} series={SERIE_ALERTAS} alto={200}
              etiqueta={`Alertas por tipo: ${porCapa.map((f) => `${f.x}, ${f.alertas}`).join('; ')}`} />
          )}
          <NotaGrafica className="mt-3 border-t border-linea/70 pt-3" datos={{
            variable: 'Mediciones marcadas como raras, por tipo de alerta', unidad: 'Número de alertas (conteo)',
            momento: 'Todas las visitas, con los últimos datos', poblacion: 'Mediciones de todos los niños del programa',
            validos: `${num(porCapa.reduce((a, f) => a + Number(f.alertas), 0))} alertas`,
            porcentaje: 'No aplica: son conteos, sin porcentaje ni denominador',
          }} />
        </Panel>
        <Panel titulo="Aciertos frente a la revisión">
          <p className="mb-2 text-sm text-tinta/80">Cuántas alertas confirmó el equipo al revisar las primeras.</p>
          {aciertos.isPending ? <Cargando /> : puntos.length === 0 ? (
            <p className="text-sm text-tinta/80">Todavía no hay alertas respondidas.</p>
          ) : (
            <>
              <LineasSeries filas={puntos} series={SERIE_ACIERTOS} alto={200} dominioY={[0, 100]} formatoY={(v) => `${v} %`}
                formatoTooltip={(v, f) => `${pct(v)} de ${num(Number(f.respondidas))} respondidas`}
                etiqueta={`Porcentaje de alertas confirmadas como error entre las primeras: ${puntos.map((f) => `${f.x}, ${pct(Number(f.precision))}`).join('; ')}`} />
              <p className="mt-1 text-xs text-tinta/80">Eje inferior: las primeras alertas de la cola.</p>
              <NotaGrafica className="mt-3 border-t border-linea/70 pt-3" datos={{
                variable: 'Alertas confirmadas como error de registro', unidad: '% de alertas respondidas',
                momento: 'Las k primeras alertas de la cola actual',
                poblacion: 'Alertas de esa cola que el equipo ya respondió',
                validos: `${num(aciertos.data?.respondidas)} alertas respondidas`,
                porcentaje: 'Respondidas «es un error» entre respondidas (las «no sé» cuentan en el denominador); el denominador está en cada punto',
              }} />
            </>
          )}
        </Panel>
        <Panel titulo="Dónde se concentran">
          <p className="mb-2 text-sm text-tinta/80">Sede y dato con más alertas.</p>
          {concentracion.isPending ? <Cargando /> : concentracion.error ? <Aviso>{concentracion.error.message}</Aviso>
            : <Concentracion c={concentracion.data} />}
          {concentracion.data && (
            <NotaGrafica className="mt-3 border-t border-linea/70 pt-3" datos={{
              variable: 'Mediciones marcadas como raras, por sede y medición', unidad: 'Número de alertas (conteo)',
              momento: 'Todas las visitas, con los últimos datos', poblacion: 'Mediciones de todos los niños del programa',
              validos: `${num((concentracion.data.hay_sede ? concentracion.data.celdas : concentracion.data.por_variable).reduce((a, x) => a + x.alertas, 0))} alertas en celdas de ${concentracion.data.minimo_celda} o más`,
              porcentaje: 'No aplica: son conteos; lo que tiene menos alertas que ese mínimo se suma en «Otras»',
            }} />
          )}
        </Panel>
      </div>
    </div>
  )
}

/** Mapa de calor simple: sede por dato si hay sedes; si no, solo los datos con más alertas. Sin celdas pequeñas. */
function Concentracion({ c }: { c: ConcentracionAlertas }) {
  const otras = c.hay_sede ? c.otras_celdas : c.otras_variables
  const filas = c.hay_sede
    ? c.celdas.slice(0, 8).map((x) => ({ clave: `${x.grupo}|${x.variable}`, titulo: x.etiqueta ?? x.variable, sub: x.grupo, n: x.alertas }))
    : c.por_variable.slice(0, 8).map((x) => ({ clave: x.variable, titulo: x.etiqueta ?? x.variable, sub: '', n: x.alertas }))
  const maximo = Math.max(1, ...filas.map((x) => x.n))
  const tono = (n: number) => ({ background: `color-mix(in srgb, var(--color-teal) ${Math.round(15 + 70 * n / maximo)}%, transparent)` })
  if (filas.length === 0) return <p className="text-sm text-tinta/80">Todavía no hay alertas suficientes para mostrar.</p>
  return (
    <div>
      <ul className="grid grid-cols-2 gap-1.5" aria-label="Alertas por sede y dato">
        {filas.map((x) => (
          <li key={x.clave} className="rounded-lg px-2 py-1.5 text-sm" style={tono(x.n)}>
            <span className="block truncate font-semibold" title={x.titulo}>{x.titulo}</span>
            <span className="block truncate text-xs">{x.sub && <>{x.sub} · </>}{num(x.n)} alertas</span>
          </li>
        ))}
      </ul>
      {!c.hay_sede && <p className="mt-2 text-xs text-tinta/80">Este corte no trae sedes: solo se muestra por dato.</p>}
      {otras > 0 && <p className="mt-2 text-xs text-tinta/80">Otras: {num(otras)} alertas en grupos con menos de {c.minimo_celda}.</p>}
    </div>
  )
}
