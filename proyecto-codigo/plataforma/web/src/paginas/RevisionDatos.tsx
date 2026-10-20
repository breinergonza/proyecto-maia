import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { pedir } from '../api/cliente'
import type { DatoRevision, Pagina, Respuesta } from '../api/tipos'
import { Aviso, Boton, Cargando, Encabezado, Insignia, Paginador, Selector, Texto, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { CAPAS, dec2, fecha, frase, RESPUESTAS } from '../lib/formato'

const TAMANO = 10

export default function RevisionDatos() {
  const [estado, setEstado] = useState<'pendiente' | 'revisado' | 'todos'>('pendiente')
  const [capa, setCapa] = useState('')
  const [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ['revision', 'datos', estado, capa, pagina],
    queryFn: () => pedir<Pagina<DatoRevision>>('/revision/datos', { params: { estado, capa, pagina, tamano: TAMANO } }),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <Encabezado titulo="Datos por revisar">
        Datos que el modelo de anomalías encontró raros. Para cada uno, diga si cree que es un error de registro. Sus
        respuestas miden qué tan bien acierta cada capa y sirven para decidir qué tan exigente debe ser el modelo en el
        siguiente entrenamiento.
      </Encabezado>
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="sr-only" htmlFor="estado">Estado</label>
        <Selector id="estado" className="w-52" value={estado} onChange={(e) => { setEstado(e.target.value as typeof estado); setPagina(1) }}>
          <option value="pendiente">Sin responder</option>
          <option value="revisado">Ya respondidos</option>
          <option value="todos">Todos</option>
        </Selector>
        <label className="sr-only" htmlFor="capa">Capa</label>
        <Selector id="capa" className="w-56" value={capa} onChange={(e) => { setCapa(e.target.value); setPagina(1) }}>
          <option value="">Todas las capas</option>
          {['1', '2', '3'].map((c) => <option key={c} value={c}>Capa {c}: {CAPAS[c]}</option>)}
        </Selector>
      </div>
      {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : q.data.items.length === 0 ? (
        <Vacio titulo={estado === 'pendiente' ? 'No queda nada por revisar' : 'No hay datos con estos filtros'}>
          {estado === 'pendiente' ? 'Cuando haya una corrida nueva, aquí aparecerán sus datos raros.' : undefined}
        </Vacio>
      ) : (
        <>
          <p className="mb-3 text-sm text-salvia">{q.data.total} datos. Primero los que marcan más capas y con más fuerza.</p>
          <ol className="space-y-3">
            {q.data.items.map((d) => <Tarjeta key={d.id} dato={d} />)}
          </ol>
          <Paginador pagina={pagina} tamano={TAMANO} total={q.data.total} cambiar={setPagina} />
        </>
      )}
    </>
  )
}

function Tarjeta({ dato }: { dato: DatoRevision }) {
  const cliente = useQueryClient()
  const [comentario, setComentario] = useState(dato.comentario ?? '')
  const [elegida, setElegida] = useState<Respuesta | null>(dato.es_error)
  const m = useMutation({
    mutationFn: (es_error: Respuesta) =>
      pedir(`/revision/datos/${dato.id}`, { cuerpo: { es_error, comentario: comentario.trim() || null } }),
    onSuccess: (_, r) => {
      setElegida(r)
      void cliente.invalidateQueries({ queryKey: ['revision'] })
      void cliente.invalidateQueries({ queryKey: ['tablero', 'resumen'] })
    },
  })
  const rango = dato.rango_bajo != null || dato.rango_alto != null
  return (
    <li className="rounded-panel border border-linea bg-papel p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-sm text-salvia">
            <Link className="font-semibold text-teal hover:underline" to={`/ninos/${encodeURIComponent(dato.sujeto)}`}>Niño {dato.sujeto}</Link>
            {dato.etapa_nombre && <> · {dato.etapa_nombre}</>} · {fecha(dato.fecha)}
          </p>
          <h2 className="mt-1 text-lg">
            {dato.etiqueta ?? dato.variable}: <span className="text-coral-hondo">{dato.valor ?? '—'}{dato.unidad ? ` ${dato.unidad}` : ''}</span>
          </h2>
          {rango && (
            <p className="text-sm">
              Para este niño se esperaba entre {dec2(dato.rango_bajo)} y {dec2(dato.rango_alto)}
              {dato.esperado != null && <> (lo más probable: {dec2(dato.esperado)})</>}.
            </p>
          )}
          {dato.motivo && <p className="mt-1 text-sm">{frase(dato.motivo)}.</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {dato.capas.map((c) => <Insignia key={c}>Capa {c}: {CAPAS[c] ?? c}</Insignia>)}
          </div>
        </div>
        <fieldset className="md:w-72">
          <legend className="mb-2 text-sm font-semibold">¿Es un error de registro?</legend>
          <div className="grid grid-cols-3 gap-2">
            {(['si', 'no', 'no_se'] as Respuesta[]).map((r) => (
              <Boton key={r} chico variante={elegida === r ? 'primario' : 'secundario'} aria-pressed={elegida === r}
                disabled={m.isPending} onClick={() => m.mutate(r)}>
                {RESPUESTAS[r]}
              </Boton>
            ))}
          </div>
          <label className="sr-only" htmlFor={`com-${dato.id}`}>Comentario</label>
          <Texto id={`com-${dato.id}`} rows={2} maxLength={2000} className="mt-2 text-sm" placeholder="Comentario (opcional)"
            value={comentario} onChange={(e) => setComentario(e.target.value)} />
          <p className={cn('mt-1 text-sm', m.error ? 'text-coral-hondo' : 'text-salvia')} role="status">
            {m.error ? m.error.message : m.isSuccess ? 'Respuesta guardada.' : elegida ? 'Puede cambiar su respuesta.' : ''}
          </p>
        </fieldset>
      </div>
    </li>
  )
}
