// La cola de mediciones por revisar: filtros (visita, medición, detectado por, estado) y una tabla de una línea por medición con
// el niño (y su estado), la medición con su visita, el valor, por qué es dudosa y la acción. Responder «¿es un error de
// registro?» guarda la respuesta del administrador. Lo que sobra para decidir (quién la detectó, lo más probable, cuándo se
// midió, la serie del niño y el comentario, con el botón de la flecha) se abre aparte para no alargar la fila. En escritorio las filas se desplazan por
// dentro con el encabezado fijo, para que los filtros y la completitud sigan a la vista.
import { Check, ChevronDown, Circle } from 'lucide-react'
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
/** Lo que cada botón dice a la vista: la pregunta está en el encabezado de la columna, así que basta «Sí», «No» o «No sé». */
const CORTO: Record<Respuesta, string> = { si: 'Sí', no: 'No', no_se: 'No sé' }
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
    <section aria-labelledby="titulo-cola"
      className="flex min-w-0 flex-col rounded-panel border border-linea/80 bg-papel p-4 shadow-suave sm:p-5 xl:min-h-0">
      <h2 id="titulo-cola" className="text-base">Mediciones por revisar</h2>
      <div className="mt-2 grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
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

      <div className="mt-3 flex min-h-0 flex-col xl:flex-1">
        {cola.isPending ? <Cargando />
          : cola.isError ? (
            <ErrorConReintento error={cola.error} que="la lista de mediciones" reintentando={cola.isFetching} reintentar={() => void cola.refetch()} />
          ) : cola.data.items.length === 0 ? (
            <Vacio titulo={filtros.estado === 'pendiente' ? 'No queda nada por revisar' : 'No hay mediciones con estos filtros'}>
              {filtros.estado === 'pendiente' ? 'Cuando lleguen datos nuevos, aquí aparecerán los que parezcan raros.' : undefined}
            </Vacio>
          ) : (
            <>
              <p className="mb-1 shrink-0 text-sm">{num(cola.data.total)} {cola.data.total === 1 ? 'medición' : 'mediciones'}. Primero las que tienen más alertas y más fuertes.</p>
              <Tabla densa apilar className="relative xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                <thead className="sticky top-0 z-10 bg-papel">
                  <tr>
                    <th>Niño</th><th>Medición</th><th>Valor registrado</th><th>Por qué es dudosa</th><th>¿Es un error de registro?</th>
                  </tr>
                </thead>
                <tbody>
                  {cola.data.items.map((d) => <FilaDato key={d.id} dato={d} />)}
                </tbody>
              </Tabla>
              <div className="shrink-0">
                <Paginador pagina={filtros.pagina} tamano={TAMANO_COLA} total={cola.data.total} cambiar={(pagina) => setFiltros((f) => ({ ...f, pagina }))} />
              </div>
            </>
          )}
      </div>
    </section>
  )
}

/** El estado de la fila junto al niño: un punto si falta revisarla y una marca si ya tiene respuesta; el texto es para lectores de pantalla. */
function Estado({ respuesta }: { respuesta: Respuesta | null }) {
  return respuesta ? (
    <span className="inline-flex text-teal" title={`Revisada: ${ACCION[respuesta].estado.toLowerCase()}`}>
      <Check size={16} aria-hidden /><span className="sr-only">Revisada: {ACCION[respuesta].estado.toLowerCase()}</span>
    </span>
  ) : (
    <span className="inline-flex text-ocre" title="Por revisar"><Circle size={10} aria-hidden fill="currentColor" /><span className="sr-only">Por revisar</span></span>
  )
}

function FilaDato({ dato }: { dato: DatoRevision }) {
  const [comentario, setComentario] = useState(dato.comentario ?? '')
  const [abierta, setAbierta] = useState(Boolean(dato.comentario))   // el detalle se abre solo si ya hay un comentario
  const [elegida, setElegida] = useState<Respuesta | null>(dato.es_error)
  const m = useResponderDato(dato.id)
  const responder = (es_error: Respuesta) => m.mutate({ es_error, comentario }, { onSuccess: () => setElegida(es_error) })
  const unidad = dato.unidad ? ` ${dato.unidad}` : ''
  const extra = motivoExtra(dato.motivo)
  const rango = dato.rango_bajo != null || dato.rango_alto != null
  const nombre = dato.etiqueta ?? dato.variable
  // la etiqueta del diccionario suele traer la visita («Peso a 6 m EC»): entonces no se repite
  const visita = dato.etapa_nombre?.replace(' (edad corregida)', ' EC') ?? 'Visita sin nombre'
  const visitaEnNombre = dato.etapa != null && nombre.toLowerCase().includes(dato.etapa.toLowerCase())
  return (
    <>
      <tr>
        <td className="whitespace-nowrap font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <Estado respuesta={elegida} />
            <Link className="text-teal underline-offset-2 hover:underline" to={`/ninos/${encodeURIComponent(dato.sujeto)}`}>{dato.sujeto}</Link>
          </span>
        </td>
        <td>
          <span className="font-semibold">{nombre}</span>
          {!visitaEnNombre && <span className="text-xs"> · {visita}</span>}
        </td>
        <td className="whitespace-nowrap font-semibold tabular-nums text-coral-hondo">{medida(dato.valor)}{unidad}</td>
        <td className="min-w-[9rem]">
          {rango && <span>Esperado entre {aproximado(dato.rango_bajo)} y {aproximado(dato.rango_alto)}{unidad}.</span>}
          {extra && <> <span>{frase(extra)}.</span></>}
          {!rango && !extra && <span>El modelo de anomalías lo marcó como raro para este niño.</span>}
        </td>
        <td>
          <div className="flex items-center gap-1">
            <div role="group" aria-label={`¿Es un error de registro? ${nombre} de ${dato.sujeto}`} className="flex gap-1">
              {(['si', 'no', 'no_se'] as Respuesta[]).map((r) => (
                <Boton key={r} chico className="whitespace-nowrap px-2.5" variante={elegida === r ? 'primario' : 'secundario'} aria-pressed={elegida === r}
                  aria-label={ACCION[r].boton} title={ACCION[r].boton} disabled={m.isPending} onClick={() => responder(r)}>
                  {CORTO[r]}
                </Boton>
              ))}
            </div>
            <button type="button" aria-expanded={abierta} aria-label="Ver detalle y comentar" title="Ver detalle y comentar: quién lo detectó, las otras visitas y un comentario"
              onClick={() => setAbierta(!abierta)} className="grid size-8 shrink-0 place-content-center rounded-control text-teal hover:bg-teal-tinte/60">
              <ChevronDown size={16} aria-hidden className={cn('transition-transform', abierta && 'rotate-180')} />
            </button>
          </div>
          <p className={cn('text-xs', m.error ? 'text-coral-hondo' : 'text-tinta/80', !m.error && !m.isSuccess && 'sr-only')} role="status">
            {m.error ? m.error.message : m.isSuccess ? 'Respuesta guardada.' : ''}
          </p>
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={COLUMNAS}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="max-w-xl text-sm">
                  <p>
                    Detectado por:{' '}
                    {dato.capas.map((c, i) => <span key={c} title={ayudaAlerta(c)}>{i > 0 && ', '}{alerta(c)}</span>)}.
                    {dato.esperado != null && <> Lo más probable para este niño: {aproximado(dato.esperado)}{unidad}.</>}
                    {dato.fecha && <> Medido el {fecha(dato.fecha)}.</>}
                  </p>
                  <SerieDato dato={dato} />
                  {dato.serie.length < 2 && !rango && <p>No hay otras visitas de este niño para comparar.</p>}
              </div>
              <div>
                <label className="sr-only" htmlFor={`com-${dato.id}`}>Comentario</label>
                <Texto id={`com-${dato.id}`} rows={2} maxLength={2000} className="text-sm" placeholder="Comentario (opcional): se guarda con tu respuesta"
                  value={comentario} onChange={(e) => setComentario(e.target.value)} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
