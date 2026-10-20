// Revisión ciega: el experto ve lo que vería en consulta, sin el riesgo ni la posición, y dice si el niño le
// preocupa. Al comparar con el modelo se sabe si los niños de riesgo alto preocupan más que el resto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { pedir } from '../api/cliente'
import type { Respuesta, ResumenRevision, RiesgoRevision } from '../api/tipos'
import { useSesion, puede } from '../auth/sesion'
import { Aviso, Boton, Cargando, Encabezado, Panel, Tabla, Texto, Vacio } from '../components/ui'
import { fecha, num, pct, RESPUESTAS } from '../lib/formato'

export default function RevisionRiesgos() {
  const { usuario } = useSesion()
  const q = useQuery({ queryKey: ['revision', 'riesgos'], queryFn: () => pedir<{ corrida_id: number; items: RiesgoRevision[] }>('/revision/riesgos') })
  const respondidas = q.data?.items.filter((i) => i.preocupa).length ?? 0

  return (
    <>
      <Encabezado titulo="Revisión de riesgos">
        Una muestra de niños, en orden fijo. No se muestra el riesgo calculado, a propósito: responda con su criterio
        clínico si el niño le preocupa para el desenlace indicado.
      </Encabezado>
      {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : q.data.items.length === 0 ? (
        <Vacio titulo="No hay niños con riesgo calculado en la última corrida" />
      ) : (
        <>
          <p className="mb-3 text-sm text-salvia">{respondidas} de {q.data.items.length} respondidos.</p>
          <ol className="space-y-3">{q.data.items.map((r, i) => <Caso key={r.id} caso={r} numero={i + 1} />)}</ol>
        </>
      )}
      {puede(usuario, ['admin']) && <Resultados />}
    </>
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
    <li className="grid gap-4 rounded-panel border border-linea bg-papel p-5 md:grid-cols-[1fr_18rem]">
      <div>
        <p className="text-sm text-salvia">Caso {numero} · niño {caso.sujeto} · {caso.momento_nombre} ({fecha(caso.fecha_visita)})</p>
        <h2 className="mt-1 text-lg">{caso.desenlace}</h2>
        <ul className="mt-2 grid gap-x-6 text-sm sm:grid-cols-2">{caso.resumen.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">¿Le preocupa este niño?</legend>
        <div className="grid grid-cols-3 gap-2">
          {(['si', 'no', 'no_se'] as Respuesta[]).map((r) => (
            <Boton key={r} chico variante={caso.preocupa === r ? 'primario' : 'secundario'} aria-pressed={caso.preocupa === r}
              disabled={m.isPending} onClick={() => m.mutate(r)}>{RESPUESTAS[r]}</Boton>
          ))}
        </div>
        <label className="sr-only" htmlFor={`cr-${caso.id}`}>Comentario</label>
        <Texto id={`cr-${caso.id}`} rows={2} maxLength={2000} className="mt-2 text-sm" placeholder="Comentario (opcional)"
          value={comentario} onChange={(e) => setComentario(e.target.value)} />
        {m.error && <p className="mt-1 text-sm text-coral-hondo" role="alert">{m.error.message}</p>}
      </fieldset>
    </li>
  )
}

function Resultados() {
  const q = useQuery({ queryKey: ['revision', 'resumen'], queryFn: () => pedir<ResumenRevision>('/revision/resumen') })
  if (!q.data || (!q.data.datos_por_capa.length && !q.data.riesgos_por_grupo.length)) return null
  return (
    <Panel titulo="Lo que va de la revisión (todos los expertos)" className="mt-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2">Datos raros que eran errores, por capa</h3>
          <Tabla>
            <thead><tr><th>Capa</th><th className="text-right">Respuestas</th><th className="text-right">Eran error</th></tr></thead>
            <tbody>{q.data.datos_por_capa.map((c) => (
              <tr key={c.capa}><td>{c.capa}</td><td className="text-right">{num(c.respuestas)}</td><td className="text-right">{pct(c.precision_pct)}</td></tr>
            ))}</tbody>
          </Tabla>
        </div>
        <div>
          <h3 className="mb-2">Niños que preocuparon</h3>
          <Tabla>
            <thead><tr><th>Grupo según el modelo</th><th className="text-right">Respuestas</th><th className="text-right">Preocupan</th></tr></thead>
            <tbody>{q.data.riesgos_por_grupo.map((g) => (
              <tr key={g.grupo}><td>{g.grupo === 'riesgo alto' ? 'Riesgo alto (posición 90 o más)' : 'Resto'}</td><td className="text-right">{num(g.respuestas)}</td><td className="text-right">{pct(g.preocupa_pct)}</td></tr>
            ))}</tbody>
          </Tabla>
          <p className="mt-2 text-sm text-salvia">Si el modelo ordena bien, el riesgo alto debería preocupar más que el resto.</p>
        </div>
      </div>
    </Panel>
  )
}
