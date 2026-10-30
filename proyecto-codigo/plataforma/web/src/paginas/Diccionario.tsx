// Diccionario de variables (experto y administración). El Excel sigue siendo el formato de trabajo: se descarga, se
// edita y se sube; antes de confirmar se ven los cambios frente al vigente. Las variables nuevas que trae una
// actualización se clasifican aquí con un clic (Lista / No usar) y cada cambio queda como una versión que se puede volver.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { pedir } from '../api/cliente'
import type {
  CambioDesenlace, Clasificacion, DiferenciasDiccionario, VariableDiccionario, VersionDiccionario,
} from '../api/tipos-diccionario'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { descargarVersion, origen, usePorClasificar } from '../lib/diccionario'
import { fechaHora, num } from '../lib/formato'

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

  return (
    <>
      <Encabezado titulo="Diccionario de variables"
        accion={<Boton variante="secundario" onClick={() => descargar.mutate(null)} disabled={descargar.isPending}>
          <Download size={16} aria-hidden />{descargar.isPending ? 'Descargando…' : 'Descargar el vigente'}
        </Boton>}>
        Define qué es cada variable de la base, en qué visita se mide y si el sistema la usa. Se trabaja en Excel: descárguelo,
        edítelo y súbalo; antes de confirmar verá qué cambia. Cada cambio queda guardado y se puede volver a una versión anterior.
      </Encabezado>

      <div className="space-y-4">
        {aviso && <Aviso tono="teal">{aviso}</Aviso>}
        {error && <Aviso><span className="whitespace-pre-line">{error.message}</span></Aviso>}

        {pendientes.data?.borrador && (
          <Actualizacion nuevas={pendientes.data.borrador.nuevas} version={pendientes.data.borrador.version}
            ocupado={activar.isPending} alAgregar={() => activar.mutate(pendientes.data!.borrador!.version)} />
        )}

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="min-w-0 space-y-4">
            <Panel titulo={<div className="flex items-center gap-2"><h2 className="text-base">Variables nuevas por clasificar</h2>
              {!!pendientes.data?.variables.length && <Insignia tono="ocre">{pendientes.data.variables.length}</Insignia>}</div>}>
              {pendientes.isPending ? <Cargando /> : pendientes.error ? <Aviso>{pendientes.error.message}</Aviso>
                : pendientes.data.variables.length === 0 ? (
                  <p className="text-sm text-salvia">No hay variables por clasificar. Cuando la base traiga variables nuevas aparecerán aquí.</p>
                ) : (
                  <ul className="divide-y divide-linea/70">
                    {pendientes.data.variables.map((v) => (
                      <Pendiente key={v.variable} v={v} ocupado={clasificar.isPending && clasificar.variables?.variable === v.variable}
                        deshabilitado={clasificar.isPending} alElegir={(estado) => clasificar.mutate({ variable: v.variable, estado })} />
                    ))}
                  </ul>
                )}
            </Panel>

            <Panel titulo="Historial de versiones">
              {versiones.isPending ? <Cargando /> : versiones.error ? <Aviso>{versiones.error.message}</Aviso>
                : versiones.data.length === 0 ? <Vacio titulo="Todavía no hay versiones">Suba el primer diccionario.</Vacio> : (
                  <Tabla>
                    <thead><tr><th>Versión</th><th>Detalle</th><th className="sticky right-0 bg-papel"><span className="sr-only">Acciones</span></th></tr></thead>
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
          </div>

          <Subir alGuardar={(v) => refrescar(`La versión ${v.version} quedó en uso.`)} />
        </div>
      </div>
    </>
  )
}

function Pendiente({ v, ocupado, deshabilitado, alElegir }: {
  v: VariableDiccionario; ocupado: boolean; deshabilitado: boolean; alElegir: (e: Clasificacion['estado']) => void
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
      <div className="flex shrink-0 gap-2">
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
            Del {fechaHora(version.creado_en)}. Al agregarlas al diccionario quedan «Por clasificar»: el sistema no las usa
            hasta que alguien las marque como «Lista».
          </p>
        </div>
        <Boton className="shrink-0" onClick={alAgregar} disabled={ocupado}>{ocupado ? 'Agregando…' : 'Agregarlas al diccionario'}</Boton>
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[repeat(2,minmax(0,1fr))]">
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
    mutationFn: (f: File) => pedir<DiferenciasDiccionario>('/diccionario/comparar', { formulario: formulario(f) }),
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
    <Panel titulo="Subir una versión nueva" className="xl:sticky xl:top-0">
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
          <Diferencias d={comparar.data} />
          <Campo id="nota-diccionario" etiqueta="Nota (opcional)" ayuda="Qué cambió y por qué, para quien lo revise después.">
            <Entrada id="nota-diccionario" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} />
          </Campo>
          {guardar.error && <Aviso><span className="whitespace-pre-line">{guardar.error.message}</span></Aviso>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Boton onClick={() => guardar.mutate(archivo)} disabled={guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : 'Confirmar y usar esta versión'}
            </Boton>
            <Boton variante="secundario" onClick={reiniciar} disabled={guardar.isPending}>Cancelar</Boton>
          </div>
        </div>
      )}
    </Panel>
  )
}

function Grupo({ titulo, n, children }: { titulo: string; n: number; children: ReactNode }) {
  if (!n) return null
  return (
    <details className="text-sm" open={n <= 8}>
      <summary className="cursor-pointer font-semibold">{titulo} ({num(n)})</summary>
      <ul className="mt-1.5 space-y-1 pl-1">{children}</ul>
    </details>
  )
}

const nombre = (v: VariableDiccionario) => v.etiqueta ? `${v.etiqueta} (${v.variable})` : v.variable
const desenlace = (d: CambioDesenlace) => d.nombre ?? d.clave

function Diferencias({ d }: { d: DiferenciasDiccionario }) {
  if (d.sin_cambios) {
    return (
      <Aviso tono="teal">
        No cambian variables, estados ni desenlaces frente al vigente{d.vigente ? ` (versión ${d.vigente})` : ''}. Si editó otras
        columnas, como nombres o rangos, puede confirmarlo igual.
      </Aviso>
    )
  }
  return (
    <div className="space-y-3 rounded-control border border-linea bg-fondo/50 p-3">
      <p className="text-sm font-semibold">Cambios frente al vigente{d.vigente ? ` (versión ${d.vigente})` : ''}</p>
      <Grupo titulo="Variables nuevas" n={d.nuevas.length}>
        {d.nuevas.map((v) => <li key={v.variable}>{nombre(v)} · {v.estado ?? '—'}</li>)}
      </Grupo>
      <Grupo titulo="Variables quitadas" n={d.quitadas.length}>
        {d.quitadas.map((v) => <li key={v.variable} className="text-coral-hondo">{nombre(v)}</li>)}
      </Grupo>
      <Grupo titulo="Cambios de estado" n={d.estados.length}>
        {d.estados.map((v) => <li key={v.variable}>{nombre(v)}: {v.antes ?? '—'} → <strong>{v.despues ?? '—'}</strong></li>)}
      </Grupo>
      <Grupo titulo="Desenlaces que empiezan a usarse" n={d.desenlaces_activados.length}>
        {d.desenlaces_activados.map((x) => <li key={x.clave}>{desenlace(x)}: {x.antes ?? 'nuevo'} → <strong>{x.despues}</strong></li>)}
      </Grupo>
      <Grupo titulo="Desenlaces que dejan de usarse" n={d.desenlaces_apagados.length}>
        {d.desenlaces_apagados.map((x) => <li key={x.clave} className="text-coral-hondo">{desenlace(x)}: {x.antes} → {x.despues ?? 'quitado'}</li>)}
      </Grupo>
    </div>
  )
}
