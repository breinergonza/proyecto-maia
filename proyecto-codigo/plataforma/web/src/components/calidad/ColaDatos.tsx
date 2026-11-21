// La cola de mediciones por revisar: filtros (visita, medición, detectado por, estado) y una tabla de una fila por medición con
// el niño, la visita, la medición, el valor, por qué es dudosa, quién la detectó, su estado y la acción. «Confirmar» dice que el
// valor registrado es correcto; «Corregir» lo marca como error de registro (solo lo marca: el valor no cambia aquí); «No sé»
// queda para quien no puede decidir. Bajo los botones se ve quién la revisó por última vez y cuándo, y el detalle (el botón de
// la flecha) trae lo que sobra para decidir: lo más probable, cuándo se midió, la serie del niño, las respuestas de todo el
// equipo y el comentario. En escritorio las filas se desplazan por dentro con el encabezado fijo, para que los filtros y la
// completitud sigan a la vista.
import { Check, ChevronDown, Circle, CircleHelp, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { TAMANO_COLA, useColaDatos, useResponderDato, type EstadoCola, type FiltrosCola, type ResumenCalidad } from '../../api/calidad'
import type { DatoRevision, Respuesta, RevisionDelEquipo } from '../../api/tipos'
import { cn } from '../../lib/cn'
import { aproximado, fecha, fechaHora, frase, medida, num, unidad as unidadLegible } from '../../lib/formato'
import { alerta, ayudaAlerta, motivoExtra } from '../../lib/lenguaje'
import { ErrorConReintento } from '../ErrorConReintento'
import { Boton, Cargando, Paginador, Selector, Tabla, Texto, Vacio } from '../ui'
import { SerieDato } from './SerieDato'

/** Lo que cada respuesta significa, dicho en el botón, en su ayuda y en el estado de la fila. La base guarda la respuesta a
 *  «¿es un error de registro?»: confirmar es «no» y corregir es «sí». */
const ACCION: Record<Respuesta, { boton: string; ayuda: string; estado: string }> = {
  no: { boton: 'Confirmar valor correcto', ayuda: 'El valor registrado es correcto', estado: 'Confirmado' },
  si: { boton: 'Corregir', ayuda: 'Corregir: es un error de registro (se marca; el valor no cambia)', estado: 'Por corregir' },
  no_se: { boton: 'No puedo determinarlo', ayuda: 'No se puede determinar si el valor es correcto', estado: 'Sin saber' },
}
const RESPUESTAS: Respuesta[] = ['no', 'si', 'no_se']
const TIPOS_ALERTA = ['1', '2', '3'] as const
const COLUMNAS = 8

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
        <Filtro id="filtro-detectado" etiqueta="Regla o modelo que detectó la medición" value={filtros.capa} onChange={(e) => cambiar({ capa: e.target.value })}>
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
              <Tabla densa apilar className="relative xl:min-h-0 xl:flex-1 xl:overflow-y-auto [&_th]:whitespace-normal!">
                <thead className="sticky top-0 z-10 bg-papel">
                  <tr>
                    <th>Niño</th><th>Visita</th><th>Medición</th><th>Valor registrado</th><th>Por qué es dudosa</th>
                    <th>Regla o modelo que detectó la medición</th><th>Estado</th><th>Acción</th>
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

/** El estado de la fila en palabras: «Por revisar» con un punto mientras nadie responde y, después, lo que se respondió. */
function Estado({ respuesta }: { respuesta: Respuesta | null }) {
  if (!respuesta) {
    return <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><Circle size={10} aria-hidden fill="currentColor" className="text-ocre" />Por revisar</span>
  }
  const Icono = respuesta === 'no' ? Check : respuesta === 'si' ? Pencil : CircleHelp
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap font-semibold', respuesta === 'no' && 'text-teal', respuesta === 'si' && 'text-coral-hondo')}>
      <Icono size={15} aria-hidden />{ACCION[respuesta].estado}
    </span>
  )
}

/** Quién respondió: «Tú» para quien consulta, el nombre para el resto del equipo. */
const quien = (r: RevisionDelEquipo) => (r.propia ? 'Tú' : r.usuario)

function FilaDato({ dato }: { dato: DatoRevision }) {
  const [comentario, setComentario] = useState(dato.comentario ?? '')
  const [abierta, setAbierta] = useState(Boolean(dato.comentario))   // el detalle se abre solo si ya hay un comentario
  const [elegida, setElegida] = useState<Respuesta | null>(dato.es_error)
  const m = useResponderDato(dato.id)
  const responder = (es_error: Respuesta) => m.mutate({ es_error, comentario }, { onSuccess: () => setElegida(es_error) })
  const u = unidadLegible(dato.unidad)
  const unidad = u ? ` ${u}` : ''
  const extra = motivoExtra(dato.motivo)
  const rango = dato.rango_bajo != null || dato.rango_alto != null
  const nombre = dato.etiqueta ?? dato.variable
  const visita = dato.etapa_nombre?.replace(' (edad corregida)', ' EC') ?? '—'
  const [ultima] = dato.revisiones
  const otras = dato.revisiones.length - 1
  const conContexto = dato.esperado != null || Boolean(dato.fecha)
  return (
    <>
      <tr>
        <td className="whitespace-nowrap font-semibold">
          <Link className="text-teal underline-offset-2 hover:underline" to={`/ninos/${encodeURIComponent(dato.sujeto)}`}>{dato.sujeto}</Link>
        </td>
        <td className="whitespace-nowrap">{visita}</td>
        <td className="font-semibold">{nombre}</td>
        <td className="whitespace-nowrap font-semibold tabular-nums text-coral-hondo">{medida(dato.valor)}{unidad}</td>
        <td className="min-w-[9rem]">
          {rango && <span>Esperado entre {aproximado(dato.rango_bajo)} y {aproximado(dato.rango_alto)}{unidad}.</span>}
          {extra && <> <span>{frase(extra)}.</span></>}
          {!rango && !extra && <span>El modelo de anomalías lo marcó como raro para este niño.</span>}
        </td>
        <td>{dato.capas.map((c) => <span key={c} className="block" title={ayudaAlerta(c)}>{alerta(c)}</span>)}</td>
        <td><Estado respuesta={elegida} /></td>
        <td>
          {/* dos por línea: confirmar y corregir arriba; «no sé» y el detalle debajo. Así la columna no ensancha la tabla */}
          <div role="group" aria-label={`Revisar ${nombre} de ${dato.sujeto}`} className="grid w-max grid-cols-2 items-center gap-1">
            {RESPUESTAS.map((r) => (
              <Boton key={r} chico className="whitespace-nowrap px-2.5" variante={elegida === r ? 'primario' : 'secundario'} aria-pressed={elegida === r}
                title={ACCION[r].ayuda} disabled={m.isPending} onClick={() => responder(r)}>
                {ACCION[r].boton}
              </Boton>
            ))}
            <button type="button" aria-expanded={abierta} aria-label="Ver detalle y comentar" title="Ver detalle y comentar: lo más probable, las otras visitas y un comentario"
              onClick={() => setAbierta(!abierta)} className="grid size-8 shrink-0 place-content-center rounded-control text-teal hover:bg-teal-tinte/60">
              <ChevronDown size={16} aria-hidden className={cn('transition-transform', abierta && 'rotate-180')} />
            </button>
          </div>
          {ultima && (
            <p className="mt-0.5 text-xs">
              Última revisión: {quien(ultima)}, {ACCION[ultima.es_error].estado.toLowerCase()}, {fecha(ultima.cuando)}
              {otras > 0 && ` · y ${otras} ${otras === 1 ? 'respuesta más' : 'respuestas más'}`}
            </p>
          )}
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
                  {conContexto && (
                    <p>
                      {dato.esperado != null && <>Lo más probable para este niño: {aproximado(dato.esperado)}{unidad}. </>}
                      {dato.fecha && <>Medido el {fecha(dato.fecha)}.</>}
                    </p>
                  )}
                  <SerieDato dato={dato} />
                  {dato.serie.length < 2 && !rango && <p>No hay otras visitas de este niño para comparar.</p>}
                  {dato.revisiones.length > 0 && (
                    <>
                      <p className="mt-2 font-semibold" aria-hidden>Respuestas del equipo</p>
                      <ul aria-label="Respuestas del equipo">
                        {dato.revisiones.map((r) => (
                          <li key={`${r.usuario}-${r.cuando}`}>{quien(r)}: {ACCION[r.es_error].estado.toLowerCase()} · {fechaHora(r.cuando)}</li>
                        ))}
                      </ul>
                    </>
                  )}
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
