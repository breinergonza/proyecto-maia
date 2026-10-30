// Programación (administración): horarios de la corrida (extraer, entrenar, registrar en MLflow, revisar y calcular
// riesgos) y la cola de ejecuciones que vacía el programador en el servidor con GPU.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { pedir } from '../api/cliente'
import type { Calendario, Ejecucion, Programacion, ProgramacionEntrada } from '../api/tipos'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Panel, Selector, Tabla, Vacio } from '../components/ui'
import { ESTADOS_EJECUCION, fechaHora, FUENTES, TIPOS_EJECUCION } from '../lib/formato'

const PRESETS: Record<string, { texto: string; cron: string }> = {
  semestral: { texto: 'Cada semestre (1 de enero y 1 de julio, 02:00)', cron: '0 2 1 1,7 *' },
  trimestral: { texto: 'Cada trimestre (día 1, 02:00)', cron: '0 2 1 1,4,7,10 *' },
  mensual: { texto: 'Cada mes (día 1, 02:00)', cron: '0 2 1 * *' },
  semanal: { texto: 'Cada semana (domingo, 02:00)', cron: '0 2 * * 0' },
  diaria: { texto: 'Cada día (02:00)', cron: '0 2 * * *' },
}
const VACIA: ProgramacionEntrada = {
  nombre: 'Corrida semestral', fuente: 'kmc', cron: PRESETS.semestral.cron, activo: true, silencio: false,
  solo_si_nuevo: true, parametros: {},
}
const TONO: Record<string, 'teal' | 'coral' | 'ocre' | 'neutro'> = { ok: 'teal', error: 'coral', en_curso: 'ocre', pendiente: 'neutro' }
type Filtro = 'anio_desde' | 'anio_hasta' | 'ventana_meses'

function useDemorado<T>(valor: T, ms = 400): T {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

export default function AdminProgramacion() {
  const [editando, setEditando] = useState<Programacion | null>(null)
  return (
    <>
      <Encabezado titulo="Programación">
        Cada ejecución extrae la base de la entidad con los filtros indicados, entrena los dos modelos (con los
        hiperparámetros de Configuración), los registra en MLflow como candidatos, revisa los datos y calcula los riesgos.
        Los modelos nuevos se usan en la solución cuando se aprueban en <Link className="text-teal underline" to="/admin/entrenamientos">Entrenamientos</Link>.
      </Encabezado>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <ListaProgramaciones editar={setEditando} />
          <ListaEjecuciones />
        </div>
        <FormProgramacion key={editando?.id ?? 'nueva'} p={editando} listo={() => setEditando(null)} />
      </div>
    </>
  )
}

function ListaProgramaciones({ editar }: { editar: (p: Programacion) => void }) {
  const cliente = useQueryClient()
  const lista = useQuery({ queryKey: ['administracion', 'programaciones'], queryFn: () => pedir<Programacion[]>('/administracion/programaciones') })
  const refrescar = () => {
    for (const k of ['programaciones', 'ejecuciones', 'resumen']) void cliente.invalidateQueries({ queryKey: ['administracion', k] })
  }
  const ejecutar = useMutation({ mutationFn: (id: number) => pedir<Ejecucion>(`/administracion/programaciones/${id}/ejecutar`, { metodo: 'POST' }), onSuccess: refrescar })
  const borrar = useMutation({ mutationFn: (id: number) => pedir<void>(`/administracion/programaciones/${id}`, { metodo: 'DELETE' }), onSuccess: refrescar })
  const error = ejecutar.error ?? borrar.error
  return (
    <Panel titulo="Horarios">
      {lista.isPending ? <Cargando /> : lista.error ? <Aviso>{lista.error.message}</Aviso> : lista.data.length === 0 ? (
        <Vacio titulo="Sin horarios">Cree uno con el formulario: la corrida semestral es el punto de partida.</Vacio>
      ) : (
        <Tabla>
          <thead><tr><th>Nombre</th><th>Cuándo</th><th>Próxima</th><th>Última</th><th></th></tr></thead>
          <tbody>
            {lista.data.map((p) => (
              <tr key={p.id}>
                <td>
                  <p className="font-semibold">{p.nombre} {!p.activo && <Insignia>Pausada</Insignia>}</p>
                  <p className="text-sm text-salvia">{FUENTES[p.fuente] ?? p.fuente}{p.silencio && ' · en silencio'}{p.solo_si_nuevo && p.fuente === 'kmc' && ' · solo si hay datos nuevos'}</p>
                </td>
                <td className="text-sm">{p.descripcion}<br /><code className="text-salvia">{p.cron}</code> <span className="text-salvia">({p.zona})</span></td>
                <td className="whitespace-nowrap">{p.activo ? fechaHora(p.proxima) : '—'}</td>
                <td className="whitespace-nowrap">{fechaHora(p.ultima)}</td>
                <td className="space-x-1 whitespace-nowrap text-right">
                  <Boton chico variante="secundario" disabled={ejecutar.isPending} onClick={() => ejecutar.mutate(p.id)}>Ejecutar ahora</Boton>
                  <Boton chico variante="fantasma" onClick={() => editar(p)}>Editar</Boton>
                  <Boton chico variante="fantasma" disabled={borrar.isPending}
                    onClick={() => window.confirm(`¿Borrar la programación «${p.nombre}»?`) && borrar.mutate(p.id)}>Borrar</Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      {error && <div className="mt-3"><Aviso>{error.message}</Aviso></div>}
    </Panel>
  )
}

function FormProgramacion({ p, listo }: { p: Programacion | null; listo: () => void }) {
  const cliente = useQueryClient()
  const [d, setD] = useState<ProgramacionEntrada>(p ? {
    nombre: p.nombre, fuente: p.fuente as ProgramacionEntrada['fuente'], cron: p.cron, zona: p.zona, activo: p.activo,
    silencio: p.silencio, solo_si_nuevo: p.solo_si_nuevo, parametros: p.parametros,
  } : VACIA)
  const preset = Object.entries(PRESETS).find(([, v]) => v.cron === d.cron)?.[0] ?? 'otra'
  const cron = useDemorado(d.cron)
  const cal = useQuery({
    queryKey: ['administracion', 'calendario', cron, d.zona],
    queryFn: () => pedir<Calendario>('/administracion/calendario', { params: { cron, ...(d.zona ? { zona: d.zona } : {}) } }),
    enabled: cron.trim().split(/\s+/).length === 5,
    retry: false,
  })
  const guardar = useMutation({
    mutationFn: () => pedir<Programacion>(p ? `/administracion/programaciones/${p.id}` : '/administracion/programaciones',
      { metodo: p ? 'PUT' : 'POST', cuerpo: d }),
    onSuccess: () => {
      for (const k of ['programaciones', 'resumen']) void cliente.invalidateQueries({ queryKey: ['administracion', k] })
      listo()
    },
  })
  const par = d.parametros ?? {}
  const num = (k: Filtro) => (e: ChangeEvent<HTMLInputElement>) =>
    setD({ ...d, parametros: { ...par, [k]: e.target.value === '' ? null : Number(e.target.value) } })
  const kmc = d.fuente === 'kmc'
  return (
    <Panel titulo={p ? `Editar «${p.nombre}»` : 'Nueva programación'} accion={p && <Boton chico variante="fantasma" onClick={listo}>Cancelar</Boton>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
        <Campo id="p-nombre" etiqueta="Nombre"><Entrada id="p-nombre" required maxLength={120} value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} /></Campo>
        <Campo id="p-fuente" etiqueta="Datos">
          <Selector id="p-fuente" value={d.fuente} onChange={(e) => setD({ ...d, fuente: e.target.value as ProgramacionEntrada['fuente'], parametros: {} })}>
            {Object.entries(FUENTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selector>
        </Campo>
        <Campo id="p-preset" etiqueta="Frecuencia">
          <Selector id="p-preset" value={preset} onChange={(e) => e.target.value !== 'otra' && setD({ ...d, cron: PRESETS[e.target.value].cron })}>
            {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
            <option value="otra">Otra (expresión cron)</option>
          </Selector>
        </Campo>
        <Campo id="p-cron" etiqueta="Expresión cron" ayuda="minuto hora día-del-mes mes día-de-la-semana (domingo = 0)" error={cal.error?.message}>
          <Entrada id="p-cron" className="font-mono" value={d.cron} onChange={(e) => setD({ ...d, cron: e.target.value })} aria-invalid={!!cal.error} />
        </Campo>
        {cal.data && (
          <div className="rounded-control bg-fondo p-3 text-sm" aria-live="polite">
            <p className="font-semibold">{cal.data.descripcion} <span className="font-normal text-salvia">({cal.data.zona})</span></p>
            <p className="text-salvia">Próximas: {cal.data.proximas.slice(0, 3).map((x) => fechaHora(x)).join(' · ')}</p>
          </div>
        )}
        {kmc && (
          <fieldset className="space-y-3 rounded-control border border-linea p-3">
            <legend className="px-1 text-sm font-semibold">Filtros de la extracción (opcionales)</legend>
            <div className="grid grid-cols-2 gap-3">
              <Campo id="p-desde" etiqueta="Nacidos desde (año)"><Entrada id="p-desde" type="number" min={1990} max={2100} value={par.anio_desde ?? ''} onChange={num('anio_desde')} /></Campo>
              <Campo id="p-hasta" etiqueta="Nacidos hasta (año)"><Entrada id="p-hasta" type="number" min={1990} max={2100} value={par.anio_hasta ?? ''} onChange={num('anio_hasta')} /></Campo>
            </div>
            <Campo id="p-ventana" etiqueta="Solo niños con visitas en los últimos (meses)" ayuda="Conservan su historia completa. Vacío: todos.">
              <Entrada id="p-ventana" type="number" min={1} max={240} value={par.ventana_meses ?? ''} onChange={num('ventana_meses')} />
            </Campo>
          </fieldset>
        )}
        <div className="space-y-2 text-sm">
          {kmc && (
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={d.solo_si_nuevo} onChange={(e) => setD({ ...d, solo_si_nuevo: e.target.checked })} />
              <span>Solo si la base cambió desde el último corte <span className="text-salvia">(si no, no entrena)</span></span></label>
          )}
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={d.silencio} onChange={(e) => setD({ ...d, silencio: e.target.checked })} />
            <span>En silencio <span className="text-salvia">(guarda los riesgos sin mostrarlos ni enviar correos)</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} />
            <span>Activa</span></label>
        </div>
        {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
        <Boton type="submit" className="w-full" disabled={guardar.isPending || !!cal.error}>{p ? 'Guardar cambios' : 'Crear programación'}</Boton>
      </form>
    </Panel>
  )
}

function ListaEjecuciones() {
  const cliente = useQueryClient()
  const [fuente, setFuente] = useState<'kmc' | 'simulado'>('kmc')
  const lista = useQuery({
    queryKey: ['administracion', 'ejecuciones'],
    queryFn: () => pedir<Ejecucion[]>('/administracion/ejecuciones'),
    // mientras haya algo en cola o en curso, se consulta cada 5 s
    refetchInterval: (q) => (q.state.data?.some((e) => e.estado === 'pendiente' || e.estado === 'en_curso') ? 5000 : false),
  })
  const ahora = useMutation({
    mutationFn: () => pedir<Ejecucion>('/administracion/ejecuciones', { cuerpo: { fuente, solo_si_nuevo: false } }),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ['administracion', 'ejecuciones'] }),
  })
  return (
    <Panel titulo="Ejecuciones" accion={
      <div className="flex items-center gap-2">
        <label htmlFor="e-fuente" className="sr-only">Datos de la corrida</label>
        <Selector id="e-fuente" className="h-9 w-48 text-sm sm:h-8" value={fuente} onChange={(e) => setFuente(e.target.value as 'kmc' | 'simulado')}>
          {Object.entries(FUENTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Selector>
        <Boton chico disabled={ahora.isPending} onClick={() => ahora.mutate()}>Corrida ahora</Boton>
      </div>
    }>
      {ahora.error && <div className="mb-3"><Aviso>{ahora.error.message}</Aviso></div>}
      {lista.isPending ? <Cargando /> : lista.error ? <Aviso>{lista.error.message}</Aviso> : lista.data.length === 0 ? (
        <Vacio titulo="Todavía no hay ejecuciones">Las programadas aparecen aquí cuando llega su hora; el programador las toma en menos de un minuto.</Vacio>
      ) : (
        <ul className="divide-y divide-linea">
          {lista.data.map((e) => <FilaEjecucion key={e.id} e={e} />)}
        </ul>
      )}
    </Panel>
  )
}

type Modelo = { version?: string } | string | undefined
const version = (m: Modelo) => (typeof m === 'string' ? m : m?.version)

function FilaEjecucion({ e }: { e: Ejecucion }) {
  const r = (e.resultado ?? {}) as Record<string, unknown>
  const modelos = r.modelos as Record<string, Modelo> | undefined
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">N.º {e.id}</span>
        <Insignia tono={TONO[e.estado]}>{ESTADOS_EJECUCION[e.estado] ?? e.estado}</Insignia>
        <span>{TIPOS_EJECUCION[e.tipo]} · {FUENTES[e.fuente] ?? e.fuente}</span>
        <span className="text-sm text-salvia">{e.origen === 'programada' ? 'programada' : 'pedida a mano'} · {fechaHora(e.creada_en)}{e.terminada && ` → ${fechaHora(e.terminada)}`}</span>
      </div>
      {e.mensaje && <p className={e.estado === 'error' ? 'mt-1 text-sm text-coral-hondo' : 'mt-1 text-sm'}>{e.mensaje}</p>}
      {(modelos || r.corrida != null || r.paquete != null) && (
        <p className="mt-1 text-sm text-salvia">
          {modelos && <>Modelos: anomalías v{version(modelos.anomalias)} · clínico v{version(modelos.clinico)}. </>}
          {r.corrida != null && <>Corrida {String(r.corrida)}. </>}
          {r.paquete != null && <>Paquete {String(r.paquete)}{r.activado === true ? ' (activo)' : r.error_activacion ? ` (no se activó: ${String(r.error_activacion)})` : ' (activándose…)'}.</>}
        </p>
      )}
      {e.registro && (
        <details className="mt-1">
          <summary className="cursor-pointer text-sm text-teal">Ver detalle técnico</summary>
          <pre className="mt-1 max-h-72 overflow-auto rounded-control bg-tinta/95 p-3 text-xs leading-relaxed text-white">{e.registro}</pre>
        </details>
      )}
    </li>
  )
}
