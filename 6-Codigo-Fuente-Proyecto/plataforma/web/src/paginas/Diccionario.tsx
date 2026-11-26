// Guía de variables y unidades (experto y administración). Se edita aquí con formularios (EditorDiccionario): cada hoja
// es una pestaña y cada fila un formulario; antes de guardar se ven los cambios frente al vigente. El Excel queda para
// exportar e importar. Las variables nuevas que trae una actualización se clasifican aquí con un clic (Lista / No usar)
// o se completan en su formulario, y cada cambio queda como una versión a la que se puede volver.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router'
import { pedir } from '../api/cliente'
import type {
  Clasificacion, DiferenciasDiccionario as Diferencias, VariableDiccionario, VersionDiccionario, VistaDiccionario,
} from '../api/tipos-diccionario'
import DiferenciasDiccionario from '../components/DiferenciasDiccionario'
import EditorDiccionario, { type FilaPedida } from '../components/EditorDiccionario'
import { PanelesPestana, PanelPestana, Pestanas, usePestanaEnUrl } from '../components/ui/Pestanas'
import { cn } from '../lib/cn'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { descargarVersion, origen, usePorClasificar } from '../lib/diccionario'
import { conPunto, fechaHora, num } from '../lib/formato'

type Seccion = 'editar' | 'clasificar' | 'versiones'
const SECCIONES: readonly Seccion[] = ['editar', 'clasificar', 'versiones']
/** Una tabla dentro de un panel que se desplaza: el encabezado queda fijo. */
const ENCABEZADO_FIJO = 'xl:overflow-visible [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-papel'

const ESTADOS: Record<VersionDiccionario['estado'], { texto: string; tono: 'teal' | 'ocre' | 'neutro' }> = {
  vigente: { texto: 'En uso', tono: 'teal' },
  borrador: { texto: 'Sin activar', tono: 'ocre' },
  archivado: { texto: 'Anterior', tono: 'neutro' },
}

export default function Diccionario() {
  const cliente = useQueryClient()
  const pendientes = usePorClasificar()
  const versiones = useQuery({ queryKey: ['diccionario', 'versiones'], queryFn: () => pedir<VersionDiccionario[]>('/diccionario/versiones') })
  const [aviso, setAviso] = useState<string | null>(null)
  const [viendo, setViendo] = useState<VersionDiccionario | null>(null)
  const [pedida, setPedida] = useState<FilaPedida | null>(null)
  const abierta = useCallback(() => setPedida(null), [])
  const vigente = versiones.data?.find((v) => v.estado === 'vigente')
  const refrescar = (texto: string) => {
    setAviso(texto)
    void cliente.invalidateQueries({ queryKey: ['diccionario'] })
  }
  const descargar = useMutation({ mutationFn: descargarVersion })
  const activar = useMutation({
    mutationFn: (v: VersionDiccionario) => pedir<VersionDiccionario>(`/diccionario/versiones/${v.id}/activar`, { metodo: 'POST' }),
    onSuccess: (v) => refrescar(`La versión ${v.version} quedó en uso.`),
  })
  const clasificar = useMutation({
    mutationFn: (c: Clasificacion) => pedir<VersionDiccionario>('/diccionario/clasificar', { cuerpo: c }),
    onSuccess: (_, c) => refrescar(`«${c.variable}» quedó como «${c.estado}».`),
  })
  const error = descargar.error ?? activar.error ?? clasificar.error
  const [activa, elegir] = usePestanaEnUrl('ver', SECCIONES)
  const [, ponerParams] = useSearchParams()
  const [sinGuardar, setSinGuardar] = useState(0)
  const porClasificar = pendientes.data?.variables.length ?? 0
  const pestanas = [
    {
      clave: 'editar',
      texto: <>Editar definiciones{sinGuardar > 0 && <span className="ml-1 text-ocre-hondo">• {sinGuardar} sin guardar</span>}</>,
    },
    { clave: 'clasificar', texto: <>Variables pendientes de clasificar <span className="font-normal opacity-70">{num(porClasificar)}</span></> },
    { clave: 'versiones', texto: 'Importar diccionario y ver versiones' },
  ] as const

  const clasificacion = (
    <>
      {pendientes.data?.borrador && (
        <Actualizacion nuevas={pendientes.data.borrador.nuevas} version={pendientes.data.borrador.version}
          ocupado={activar.isPending} alAgregar={() => activar.mutate(pendientes.data!.borrador!.version)} />
      )}
      {pendientes.error ? <Aviso>{pendientes.error.message}</Aviso> : porClasificar > 0 ? (
        <Panel llenar titulo={<div className="flex items-center gap-2"><h2 className="text-base">Variables nuevas por clasificar</h2>
          <Insignia tono="ocre">{porClasificar}</Insignia></div>}>
          <ul className="divide-y divide-linea/70">
            {pendientes.data!.variables.map((v) => (
              <Pendiente key={v.variable} v={v} ocupado={clasificar.isPending && clasificar.variables?.variable === v.variable}
                deshabilitado={clasificar.isPending} alElegir={(estado) => clasificar.mutate({ variable: v.variable, estado })}
                alCompletar={() => {
                  setPedida({ hoja: 'Variables', clave: v.variable })
                  // la sección y la hoja en un solo cambio de la dirección: dos seguidos se pisarían
                  ponerParams((previo) => {
                    const nuevo = new URLSearchParams(previo)
                    nuevo.set('ver', 'editar')
                    nuevo.set('hoja', 'Variables')
                    return nuevo
                  }, { replace: true })
                }} />
            ))}
          </ul>
        </Panel>
      ) : !pendientes.isPending && !pendientes.data?.borrador && (
        <Vacio titulo="No hay variables por clasificar">Las variables nuevas de cada actualización de la base aparecen aquí.</Vacio>
      )}
    </>
  )

  const versionesEImportacion = (
    <div className="grid grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-rows-[minmax(0,1fr)] xl:items-start">
      <Panel llenar titulo="Historial de versiones" className="min-w-0 xl:max-h-full">
        {versiones.isPending ? <Cargando /> : versiones.error ? <Aviso>{versiones.error.message}</Aviso>
          : versiones.data.length === 0 ? <Vacio titulo="Todavía no hay versiones">Suba el primer diccionario.</Vacio> : (
            <Tabla apilar className={ENCABEZADO_FIJO}>
              <thead><tr><th>Versión</th><th>Detalle</th><th data-acciones className="sticky right-0 bg-papel"><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {versiones.data.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <p className="font-semibold">{num(v.version)}</p>
                      <Insignia tono={ESTADOS[v.estado].tono}>{ESTADOS[v.estado].texto}</Insignia>
                    </td>
                    <td className="min-w-40">
                      <p>{origen(v)}</p>
                      <p className="text-xs text-salvia">{fechaHora(v.creado_en)}</p>
                      {v.nota && <p className="mt-0.5 text-sm text-salvia">{v.nota}</p>}
                    </td>
                    <td className="sticky right-0 bg-papel">
                      <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                        <Boton chico variante="fantasma" onClick={() => setViendo(v)}
                          aria-label={`Ver la versión ${v.version}`}><Eye size={15} aria-hidden />Ver</Boton>
                        <Boton chico variante="fantasma" onClick={() => descargar.mutate(v)} disabled={descargar.isPending}
                          aria-label={`Descargar la versión ${v.version}`}>Descargar</Boton>
                        {v.estado !== 'vigente' && (
                          <Boton chico variante="secundario" onClick={() => activar.mutate(v)} disabled={activar.isPending}
                            aria-label={`Volver a la versión ${v.version}`}>
                            {activar.isPending && activar.variables?.id === v.id ? 'Activando…' : 'Volver a esta'}
                          </Boton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
      </Panel>

      <Subir alGuardar={(v) => refrescar(`La versión ${v.version} quedó en uso.`)} />
    </div>
  )

  // en escritorio la página ocupa la pantalla sin desplazarse: la tabla de la hoja y las listas se desplazan por dentro.
  // Los paneles quedan montados: los cambios sin guardar del editor sobreviven al cambiar de pestaña.
  return (
    <div className="flex flex-col xl:h-full">
      <Encabezado titulo="Guía de variables y unidades"
        accion={<Boton variante="secundario" onClick={() => descargar.mutate(null)} disabled={descargar.isPending}>
          <Download size={16} aria-hidden />{descargar.isPending ? 'Descargando…' : 'Exportar a Excel'}
        </Boton>}>
        Define qué es cada variable de la base, en qué visita se mide y si el sistema la usa. Se edita aquí: elija una hoja, abra
        una fila y guarde; antes de guardar verá qué cambia. Cada cambio queda como una versión y se puede volver a una anterior.
      </Encabezado>

      {(aviso || error) && (
        <div className="mb-3 space-y-3">
          {aviso && <Aviso tono="teal">{aviso}</Aviso>}
          {error && <Aviso><span className="whitespace-pre-line">{error.message}</span></Aviso>}
        </div>
      )}

      <Pestanas prefijo="diccionario" etiqueta="Secciones del diccionario" pestanas={pestanas} activa={activa} elegir={elegir} />
      <PanelesPestana prefijo="diccionario" activa={activa} className="mt-3 flex min-h-0 flex-col gap-3 xl:flex-1" paneles={[
        {
          clave: 'editar',
          contenido: vigente ? <EditorDiccionario vigente={vigente} pedida={pedida} alAbrirPedida={abierta} alCambiar={setSinGuardar}
            alGuardar={(v) => refrescar(`La versión ${v.version} quedó en uso.`)} /> : versiones.isPending && <Cargando />,
        },
        { clave: 'clasificar', contenido: clasificacion },
        { clave: 'versiones', contenido: versionesEImportacion },
      ]} />

      {viendo && <Vista v={viendo} alCerrar={() => setViendo(null)} alDescargar={() => descargar.mutate(viendo)}
        descargando={descargar.isPending} />}
    </div>
  )
}

/** Previsualización de una versión: sus hojas como se ven en el Excel, sin descargarlo. */
function Vista({ v, alCerrar, alDescargar, descargando }: {
  v: VersionDiccionario; alCerrar: () => void; alDescargar: () => void; descargando: boolean
}) {
  const vista = useQuery({
    queryKey: ['diccionario', 'vista', v.id],
    queryFn: () => pedir<VistaDiccionario>(`/diccionario/versiones/${v.id}/vista`),
    staleTime: Infinity,   // una versión guardada no cambia
  })
  const [hoja, setHoja] = useState(0)
  const [buscar, setBuscar] = useState('')
  const actual = vista.data?.hojas[hoja]
  const filas = useMemo(() => {
    const t = buscar.trim().toLocaleLowerCase('es')
    if (!actual || !t) return actual?.filas ?? []
    return actual.filas.filter((f) => f.some((c) => c?.toLocaleLowerCase('es').includes(t)))
  }, [actual, buscar])

  // abierta: Escape la cierra y la página de fondo no se desplaza
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar()
    document.addEventListener('keydown', cerrar)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', cerrar)
      document.body.style.overflow = ''
    }
  }, [alCerrar])

  // en el body: la página entra con una animación (transform) que, si no, ataría el `fixed` a ella y no a la ventana
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-tinta/40 backdrop-blur-[2px]" onClick={alCerrar} />
      <div role="dialog" aria-modal="true" aria-labelledby="vista-titulo"
        className="relative flex h-[92dvh] w-full max-w-6xl animate-aparecer flex-col rounded-t-panel bg-papel shadow-elevada sm:h-[85dvh] sm:rounded-panel">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-linea px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="vista-titulo" className="text-base">Diccionario · versión {num(v.version)}</h2>
              <Insignia tono={ESTADOS[v.estado].tono}>{ESTADOS[v.estado].texto}</Insignia>
            </div>
            <p className="text-sm text-salvia">{origen(v)} · {fechaHora(v.creado_en)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Boton chico variante="secundario" onClick={alDescargar} disabled={descargando}>
              <Download size={15} aria-hidden /><span className="hidden sm:inline">{descargando ? 'Descargando…' : 'Descargar'}</span>
            </Boton>
            <button type="button" onClick={alCerrar} aria-label="Cerrar la vista previa"
              className="grid size-10 place-items-center rounded-control text-salvia hover:bg-fondo hover:text-tinta">
              <X size={20} aria-hidden />
            </button>
          </div>
        </header>

        {vista.isPending ? <div className="p-6"><Cargando /></div>
          : vista.error ? <div className="p-6"><Aviso><span className="whitespace-pre-line">{vista.error.message}</span></Aviso></div> : (
            <>
              <div className="shrink-0 space-y-3 px-4 pt-3 sm:px-6">
                {actual && (
                  <Pestanas prefijo="vista-hoja" etiqueta="Hojas del diccionario" activa={actual.nombre}
                    pestanas={vista.data.hojas.map((h) => ({ clave: h.nombre, texto: <>{h.nombre} <span className="font-normal opacity-70">{num(h.filas.length)}</span></> }))}
                    elegir={(nombre) => {
                      setHoja(vista.data.hojas.findIndex((h) => h.nombre === nombre))
                      setBuscar('')
                    }} />
                )}
                {actual && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-salvia">{actual.describe}</p>
                    <label className="relative block sm:w-72">
                      <span className="sr-only">Buscar en la hoja {actual.nombre}</span>
                      <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-salvia" />
                      <Entrada value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar…" className="h-10 pl-9" />
                    </label>
                  </div>
                )}
              </div>
              <PanelPestana prefijo="vista-hoja" activa={actual?.nombre ?? ''} className="min-h-0 flex-1 overflow-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
                {actual && (filas.length === 0
                  ? <Vacio titulo={buscar ? 'Nada coincide con la búsqueda' : 'Esta hoja está vacía'} />
                  : (
                    <Tabla densa className="mx-0 overflow-visible px-0">
                      <thead className="sticky top-0 z-10 bg-papel">
                        <tr>{actual.columnas.map((c) => <th key={c.clave}>{c.titulo}</th>)}</tr>
                      </thead>
                      <tbody>
                        {filas.map((f, i) => (
                          <tr key={i}>
                            {f.map((c, j) => (
                              <td key={j} className={cn('max-w-80 align-top', j === 0 && 'font-mono text-xs whitespace-nowrap')}>
                                {c ?? <span className="text-salvia/60">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </Tabla>
                  ))}
              </PanelPestana>
              {actual && buscar && (
                <p className="shrink-0 border-t border-linea px-4 py-2 text-xs text-salvia sm:px-6">
                  {num(filas.length)} de {num(actual.filas.length)} filas
                </p>
              )}
            </>
          )}
      </div>
    </div>,
    document.body,
  )
}

function Pendiente({ v, ocupado, deshabilitado, alElegir, alCompletar }: {
  v: VariableDiccionario; ocupado: boolean; deshabilitado: boolean; alElegir: (e: Clasificacion['estado']) => void
  alCompletar: () => void
}) {
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold">{v.etiqueta ?? v.variable}</p>
        <p className="text-sm text-salvia">
          <span className="font-mono text-xs">{v.variable}</span>
          {' · '}{v.visita ? <>visita sugerida: {v.visita}</> : 'sin visita sugerida'}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Boton chico variante="fantasma" onClick={alCompletar} aria-label={`Completar ${v.variable}`}>Completar</Boton>
        <Boton chico onClick={() => alElegir('Lista')} disabled={deshabilitado} aria-label={`Marcar ${v.variable} como Lista`}>
          {ocupado ? 'Guardando…' : 'Lista'}
        </Boton>
        <Boton chico variante="secundario" onClick={() => alElegir('No usar')} disabled={deshabilitado}
          aria-label={`Marcar ${v.variable} como No usar`}>No usar</Boton>
      </div>
    </li>
  )
}

function Actualizacion({ nuevas, version, ocupado, alAgregar }: {
  nuevas: VariableDiccionario[]; version: VersionDiccionario; ocupado: boolean; alAgregar: () => void
}) {
  const n = nuevas.length
  return (
    <section className="animate-aparecer rounded-panel border border-ocre/40 bg-ocre-tinte/60 p-4 sm:p-5" aria-label="Actualización con variables nuevas">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base">La última actualización trajo {n} variable{n === 1 ? '' : 's'} nueva{n === 1 ? '' : 's'}</h2>
          <p className="mt-1 text-sm text-tinta/75">
            Del {conPunto(fechaHora(version.creado_en))} Al agregarlas al diccionario quedan «Variables pendientes de clasificar»: el sistema no las usa
            hasta que alguien las marque como «Lista».
          </p>
        </div>
        <Boton className="shrink-0" onClick={alAgregar} disabled={ocupado}>{ocupado ? 'Agregando…' : 'Agregarlas al diccionario'}</Boton>
      </div>
      <ul className="mt-3 grid max-h-40 grid-cols-1 gap-x-6 gap-y-1 overflow-auto text-sm sm:grid-cols-[repeat(2,minmax(0,1fr))]">
        {nuevas.map((v) => (
          <li key={v.variable} className="min-w-0 truncate">
            <span className="font-semibold">{v.etiqueta ?? v.variable}</span>
            <span className="text-salvia"> · {v.visita ?? 'sin visita'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Subir({ alGuardar }: { alGuardar: (v: VersionDiccionario) => void }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nota, setNota] = useState('')
  const formulario = (f: File) => {
    const fd = new FormData()
    fd.append('archivo', f)
    return fd
  }
  const comparar = useMutation({
    mutationFn: (f: File) => pedir<Diferencias>('/diccionario/comparar', { formulario: formulario(f) }),
  })
  const reiniciar = () => {
    setArchivo(null)
    setNota('')
    comparar.reset()
    if (entrada.current) entrada.current.value = ''
  }
  const guardar = useMutation({
    mutationFn: (f: File) => {
      const fd = formulario(f)
      if (nota.trim()) fd.append('nota', nota.trim())
      return pedir<VersionDiccionario>('/diccionario/versiones', { formulario: fd })
    },
    onSuccess: (v) => {
      reiniciar()
      alGuardar(v)
    },
  })

  return (
    <Panel llenar titulo="Importar desde Excel" className="xl:max-h-full">
      <p className="mb-3 text-sm text-salvia">Para cambios grandes: exporte el vigente, edítelo en Excel y súbalo aquí. Antes de
        publicar verá qué cambia. Al publicar, esta versión pasa a ser la vigente para todo el equipo.</p>
      <form className="flex flex-col gap-3" onSubmit={(e) => {
        e.preventDefault()
        if (archivo) comparar.mutate(archivo)
      }}>
        <label htmlFor="diccionario" className="text-sm font-semibold text-tinta/90">Archivo de Excel (.xlsx)</label>
        <input ref={entrada} id="diccionario" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null)
            comparar.reset()
            guardar.reset()
          }}
          className="min-w-0 text-sm file:mr-3 file:h-10 file:rounded-control file:border file:border-linea file:bg-papel file:px-4 file:font-semibold file:text-tinta" />
        {!comparar.data && (
          <Boton type="submit" disabled={!archivo || comparar.isPending}>{comparar.isPending ? 'Revisando…' : 'Revisar cambios'}</Boton>
        )}
      </form>
      {comparar.error && <div className="mt-3"><Aviso><span className="whitespace-pre-line">{comparar.error.message}</span></Aviso></div>}
      {comparar.data && archivo && (
        <div className="mt-4 space-y-4">
          <DiferenciasDiccionario d={comparar.data} />
          <Campo id="nota-diccionario" etiqueta="Nota (opcional)" ayuda="Qué cambió y por qué, para quien lo revise después.">
            <Entrada id="nota-diccionario" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} />
          </Campo>
          {guardar.error && <Aviso><span className="whitespace-pre-line">{guardar.error.message}</span></Aviso>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Boton onClick={() => guardar.mutate(archivo)} disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : 'Publicar como versión vigente'}
            </Boton>
            <Boton variante="secundario" onClick={reiniciar} disabled={guardar.isPending}>Cancelar</Boton>
          </div>
        </div>
      )}
    </Panel>
  )
}
