// Revisión ciega: el experto ve lo que vería en consulta, sin el riesgo ni la posición, y dice si el niño le
// preocupa. Al comparar con el modelo se sabe si los niños de riesgo alto preocupan más que el resto.
// En escritorio los casos van en grilla con desplazamiento propio y el resumen (administración) en una columna fija.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { pedir } from '../api/cliente'
import type { Respuesta, ResumenRevision, RiesgoRevision } from '../api/tipos'
import { useSesion, puede } from '../auth/sesion'
import { Aviso, Boton, Cargando, Encabezado, Panel, Tabla, Texto, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { fecha, num, pct, RESPUESTAS } from '../lib/formato'
import { alerta, ayudaAlerta } from '../lib/lenguaje'

export default function RevisionRiesgos() {
  const { usuario } = useSesion()
  const admin = puede(usuario, ['admin'])
  const q = useQuery({ queryKey: ['revision', 'riesgos'], queryFn: () => pedir<{ corrida_id: number; items: RiesgoRevision[] }>('/revision/riesgos') })
  const total = q.data?.items.length ?? 0
  const respondidas = q.data?.items.filter((i) => i.preocupa).length ?? 0

  return (
    <div className="flex flex-col lg:h-full">
      <Encabezado titulo="Revisión de riesgos"
        accion={total > 0 && (
          <div className="w-full sm:w-56">
            <div className="flex justify-between text-xs text-salvia"><span>Respondidos</span><span>{respondidas} de {total}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-linea">
              <div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${(respondidas / total) * 100}%` }} />
            </div>
          </div>
        )}>
        Una muestra de niños, en orden fijo. No se muestra el riesgo calculado, a propósito: responda con su criterio
        clínico si el niño le preocupa para el desenlace indicado.
      </Encabezado>
      <div className={cn('grid gap-4 lg:min-h-0 lg:flex-1', admin && 'xl:grid-cols-[minmax(0,1fr)_22rem]')}>
        <div className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : total === 0 ? (
            <Vacio titulo="No hay niños con riesgo calculado con los datos más recientes" />
          ) : (
            <ol className="grid grid-cols-1 content-start gap-3 2xl:grid-cols-2">{q.data.items.map((r, i) => <Caso key={r.id} caso={r} numero={i + 1} />)}</ol>
          )}
        </div>
        {admin && <Resultados />}
      </div>
    </div>
  )
}

function Caso({ caso, numero }: { caso: RiesgoRevision; numero: number }) {
  const cliente = useQueryClient()
  const [comentario, setComentario] = useState(caso.comentario ?? '')
  const m = useMutation({
    mutationFn: (preocupa: Respuesta) =>
      pedir(`/revision/riesgos/${caso.id}`, { cuerpo: { preocupa, comentario: comentario.trim() || null } }),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ['revision'] }),
  })
  return (
    <li className={cn('flex animate-aparecer flex-col gap-3 rounded-panel border bg-papel p-4 shadow-suave',
      caso.preocupa ? 'border-teal/30' : 'border-linea/80')}>
      <div className="min-w-0">
        <p className="text-xs text-salvia">Caso {numero} · niño {caso.sujeto} · {caso.momento_nombre} ({fecha(caso.fecha_visita)})</p>
        <h2 className="mt-1 text-base">{caso.desenlace}</h2>
        <ul className="mt-1.5 grid grid-cols-1 gap-x-5 gap-y-0.5 text-sm sm:grid-cols-2 2xl:grid-cols-3">{caso.resumen.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
      <fieldset className="mt-auto border-t border-linea/70 pt-3">
        <legend className="float-left pt-1.5 text-sm font-semibold">¿Le preocupa este niño?</legend>
        <div className="flex justify-end">
          <div className="grid grid-cols-3 gap-1.5">
            {(['si', 'no', 'no_se'] as Respuesta[]).map((r) => (
              <Boton key={r} chico variante={caso.preocupa === r ? 'primario' : 'secundario'} aria-pressed={caso.preocupa === r}
                disabled={m.isPending} onClick={() => m.mutate(r)}>{RESPUESTAS[r]}</Boton>
            ))}
          </div>
        </div>
        <label className="sr-only" htmlFor={`cr-${caso.id}`}>Comentario</label>
        <Texto id={`cr-${caso.id}`} rows={1} maxLength={2000} className="clear-both mt-2 min-h-9 resize-y text-sm" placeholder="Comentario (opcional)"
          value={comentario} onChange={(e) => setComentario(e.target.value)} />
        {m.error && <p className="mt-1 text-xs text-coral-hondo" role="alert">{m.error.message}</p>}
      </fieldset>
    </li>
  )
}

function Resultados() {
  const q = useQuery({ queryKey: ['revision', 'resumen'], queryFn: () => pedir<ResumenRevision>('/revision/resumen') })
  const vacio = !q.data || (!q.data.datos_por_capa.length && !q.data.riesgos_por_grupo.length)
  return (
    <Panel llenar titulo="Lo que va de la revisión" className="xl:self-stretch"
      accion={<span className="text-xs text-salvia">todos los expertos</span>}>
      {q.isPending ? <Cargando /> : vacio ? (
        <p className="text-sm text-salvia">Todavía no hay respuestas. Aquí verá qué parte de lo marcado era un error y si el riesgo alto preocupa más.</p>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-1 text-sm">Datos raros que eran errores, por tipo de alerta</h3>
            <Tabla>
              <thead><tr><th>Alerta</th><th className="text-right">Resp.</th><th className="text-right">Error</th></tr></thead>
              <tbody>{q.data!.datos_por_capa.map((c) => (
                <tr key={c.capa}><td title={ayudaAlerta(c.capa)}>{alerta(c.capa)}</td><td className="text-right">{num(c.respuestas)}</td><td className="text-right">{pct(c.precision_pct)}</td></tr>
              ))}</tbody>
            </Tabla>
          </div>
          <div>
            <h3 className="mb-1 text-sm">Niños que preocuparon</h3>
            <Tabla>
              <thead><tr><th>Grupo</th><th className="text-right">Resp.</th><th className="text-right">Preocupan</th></tr></thead>
              <tbody>{q.data!.riesgos_por_grupo.map((g) => (
                <tr key={g.grupo}><td>{g.grupo === 'riesgo alto' ? 'Riesgo alto' : 'Resto'}</td><td className="text-right">{num(g.respuestas)}</td><td className="text-right">{pct(g.preocupa_pct)}</td></tr>
              ))}</tbody>
            </Tabla>
            <p className="mt-2 text-xs text-salvia">Si el modelo ordena bien, el riesgo alto debería preocupar más que el resto.</p>
          </div>
        </div>
      )}
    </Panel>
  )
}
