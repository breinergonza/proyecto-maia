// La cola de mediciones por revisar: filtros (visita, medición, detectado por, estado) y una tabla con el niño, la visita, la
// medición, el valor, por qué es dudosa, quién la detectó, su estado y la acción. Responder «¿es un error de registro?»
// guarda la respuesta del administrador; el dato en su contexto (la serie del niño) se abre aparte para no alargar la fila.
import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { TAMANO_COLA, useColaDatos, useResponderDato, type EstadoCola, type FiltrosCola, type ResumenCalidad } from '../../api/calidad'
import type { DatoRevision, Respuesta } from '../../api/tipos'
import { cn } from '../../lib/cn'
import { aproximado, fecha, frase, medida, num } from '../../lib/formato'
import { alerta, ayudaAlerta, motivoExtra } from '../../lib/lenguaje'
import { ErrorConReintento } from '../ErrorConReintento'
import { Boton, Cargando, Paginador, Selector, Tabla, Texto, Vacio } from '../ui'
import { SerieDato } from './SerieDato'

/** Lo que cada respuesta significa, dicho en la acción y en el estado de la fila. */
const ACCION: Record<Respuesta, { boton: string; estado: string }> = {
  si: { boton: 'Es un error', estado: 'Es un error' },
  no: { boton: 'No es un error', estado: 'No es un error' },
  no_se: { boton: 'No sé', estado: 'Sin saber' },
}
const TIPOS_ALERTA = ['1', '2', '3'] as const
const COLUMNAS = 5

export const FILTROS_INICIALES: FiltrosCola = { estado: 'pendiente', capa: '', variable: '', etapa: '', pagina: 1 }

function Filtro({ id, etiqueta, children, ...p }: { id: string; etiqueta: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">{etiqueta}</label>
      <Selector id={id} {...p}>{children}</Selector>
    </div>
  )
}

export function ColaDatos({ resumen }: { resumen: ResumenCalidad | undefined }) {
  const [filtros, setFiltros] = useState<FiltrosCola>(FILTROS_INICIALES)
  const cola = useColaDatos(filtros)
  const cambiar = (cambio: Partial<FiltrosCola>) => setFiltros((f) => ({ ...f, ...cambio, pagina: 1 }))
  return (
    <section aria-labelledby="titulo-cola" className="min-w-0 rounded-panel border border-linea/80 bg-papel p-4 shadow-suave sm:p-5">
      <h2 id="titulo-cola" className="text-base">Mediciones por revisar</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Filtro id="filtro-visita" etiqueta="Visita" value={filtros.etapa} onChange={(e) => cambiar({ etapa: e.target.value })}>
          <option value="">Todas</option>
          {filtros.etapa && !resumen?.etapas.some((e) => e.etapa === filtros.etapa) && <option value={filtros.etapa}>{filtros.etapa}</option>}
          {resumen?.etapas.map((e) => <option key={e.etapa} value={e.etapa}>{e.etapa_nombre ?? e.etapa} ({num(e.alertas)})</option>)}
        </Filtro>
        <Filtro id="filtro-medicion" etiqueta="Medición" value={filtros.variable} onChange={(e) => cambiar({ variable: e.target.value })}>
          <option value="">Todas</option>
          {filtros.variable && !resumen?.variables.some((v) => v.variable === filtros.variable) && <option value={filtros.variable}>{filtros.variable}</option>}
          {resumen?.variables.map((v) => <option key={v.variable} value={v.variable}>{v.etiqueta ?? v.variable} ({num(v.alertas)})</option>)}
        </Filtro>
        <Filtro id="filtro-detectado" etiqueta="Detectado por" value={filtros.capa} onChange={(e) => cambiar({ capa: e.target.value })}>
          <option value="">Todos</option>
          {TIPOS_ALERTA.map((c) => <option key={c} value={c}>{alerta(c)}</option>)}
        </Filtro>
        <Filtro id="filtro-estado" etiqueta="Estado" value={filtros.estado} onChange={(e) => cambiar({ estado: e.target.value as EstadoCola })}>
          <option value="pendiente">Por revisar</option>
          <option value="revisado">Ya revisadas</option>
          <option value="todos">Todos</option>
        </Filtro>
      </div>

      <div className="mt-4">
        {cola.isPending ? <Cargando />
          : cola.isError ? (
            <ErrorConReintento error={cola.error} que="la lista de mediciones" reintentando={cola.isFetching} reintentar={() => void cola.refetch()} />
          ) : cola.data.items.length === 0 ? (
            <Vacio titulo={filtros.estado === 'pendiente' ? 'No queda nada por revisar' : 'No hay mediciones con estos filtros'}>
              {filtros.estado === 'pendiente' ? 'Cuando lleguen datos nuevos, aquí aparecerán los que parezcan raros.' : undefined}
            </Vacio>
          ) : (
            <>
              <p className="mb-2 text-sm">{num(cola.data.total)} {cola.data.total === 1 ? 'medición' : 'mediciones'}. Primero las que tienen más alertas y más fuertes.</p>
              <Tabla densa apilar>
                <thead>
                  <tr>
                    <th>Niño</th><th>Medición</th><th>Valor registrado</th><th>Por qué es dudosa</th><th>Revisión</th>
                  </tr>
                </thead>
                <tbody>
                  {cola.data.items.map((d) => <FilaDato key={d.id} dato={d} />)}
                </tbody>
              </Tabla>
              <Paginador pagina={filtros.pagina} tamano={TAMANO_COLA} total={cola.data.total} cambiar={(pagina) => setFiltros((f) => ({ ...f, pagina }))} />
            </>
          )}
      </div>
    </section>
  )
}

function Estado({ respuesta }: { respuesta: Respuesta | null }) {
  return respuesta ? (
    <span className="inline-flex items-center gap-1.5 font-semibold text-teal"><Check size={16} aria-hidden />Revisada: {ACCION[respuesta].estado.toLowerCase()}</span>
  ) : (
    <span className="inline-flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-full bg-ocre" aria-hidden />Por revisar</span>
  )
}

function FilaDato({ dato }: { dato: DatoRevision }) {
  const [comentario, setComentario] = useState(dato.comentario ?? '')
  const [comentando, setComentando] = useState(Boolean(dato.comentario))
  const [contexto, setContexto] = useState(false)
  const [elegida, setElegida] = useState<Respuesta | null>(dato.es_error)
  const m = useResponderDato(dato.id)
  const responder = (es_error: Respuesta) => m.mutate({ es_error, comentario }, { onSuccess: () => setElegida(es_error) })
  const unidad = dato.unidad ? ` ${dato.unidad}` : ''
  const extra = motivoExtra(dato.motivo)
  const rango = dato.rango_bajo != null || dato.rango_alto != null
  const nombre = dato.etiqueta ?? dato.variable
  return (
    <>
      <tr>
        <td className="whitespace-nowrap font-semibold">
          <Link className="text-teal underline-offset-2 hover:underline" to={`/ninos/${encodeURIComponent(dato.sujeto)}`}>{dato.sujeto}</Link>
        </td>
        <td>
          <span className="font-semibold">{nombre}</span>
          <span className="block text-xs">{dato.etapa_nombre ?? 'Visita sin nombre'}{dato.fecha && <>, {fecha(dato.fecha)}</>}</span>
        </td>
        <td className="whitespace-nowrap font-semibold tabular-nums text-coral-hondo">{medida(dato.valor)}{unidad}</td>
        <td className="min-w-[12rem]">
          {rango && (
            <p>
              Para este niño se esperaba entre {aproximado(dato.rango_bajo)} y {aproximado(dato.rango_alto)}{unidad}
              {dato.esperado != null && <> (lo más probable: {aproximado(dato.esperado)})</>}.
            </p>
          )}
          {extra && <p>{frase(extra)}.</p>}
          {!rango && !extra && <p>El modelo de anomalías lo marcó como raro para este niño.</p>}
          <p className="mt-1 text-xs">
            Detectado por:{' '}
            {dato.capas.map((c, i) => <span key={c} title={ayudaAlerta(c)}>{i > 0 && ', '}{alerta(c)}</span>)}
          </p>
          <button type="button" aria-expanded={contexto} onClick={() => setContexto(!contexto)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-teal hover:underline">
            Ver en el tiempo<ChevronDown size={14} aria-hidden className={cn('transition-transform', contexto && 'rotate-180')} />
          </button>
        </td>
        <td className="min-w-[11rem]">
          <p className="mb-1.5"><Estado respuesta={elegida} /></p>
          <div role="group" aria-label={`¿Es un error de registro? ${nombre} de ${dato.sujeto}`} className="flex flex-wrap gap-1.5">
            {(['si', 'no', 'no_se'] as Respuesta[]).map((r) => (
              <Boton key={r} chico className="whitespace-nowrap" variante={elegida === r ? 'primario' : 'secundario'} aria-pressed={elegida === r}
                disabled={m.isPending} onClick={() => responder(r)}>
                {ACCION[r].boton}
              </Boton>
            ))}
            <button type="button" aria-expanded={comentando} onClick={() => setComentando(!comentando)}
              className="h-8 px-1 text-xs font-semibold text-teal hover:underline">Comentar</button>
          </div>
          {comentando && (
            <>
              <label className="sr-only" htmlFor={`com-${dato.id}`}>Comentario</label>
              <Texto id={`com-${dato.id}`} rows={2} maxLength={2000} className="mt-1.5 text-sm" placeholder="Comentario (opcional)"
                value={comentario} onChange={(e) => setComentario(e.target.value)} />
            </>
          )}
          <p className={cn('mt-1 text-xs', m.error ? 'text-coral-hondo' : 'text-tinta/80')} role="status">
            {m.error ? m.error.message : m.isSuccess ? 'Respuesta guardada.' : ''}
          </p>
        </td>
      </tr>
      {contexto && (
        <tr>
          <td colSpan={COLUMNAS}>
            <div className="max-w-xl">
              <SerieDato dato={dato} />
              {dato.serie.length < 2 && !rango && <p className="text-sm">No hay otras visitas de este niño para comparar.</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
