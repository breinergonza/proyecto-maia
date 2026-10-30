// Entrenar ya (administración): el formulario que manda a entrenar con los hiperparámetros escritos aquí y el estado
// en vivo del entrenamiento (en cola → trayendo datos → entrenando cada modelo → entrenado).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, LoaderCircle, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { pedir } from '../api/cliente'
import type { Ejecucion, Hiperparametros } from '../api/tipos'
import { cn } from '../lib/cn'
import { fechaHora, FUENTES, MODELOS } from '../lib/formato'
import { Aviso, Boton, Campo, Cargando, Entrada, Insignia, Panel } from './ui'

type Tipo = 'anomalias' | 'clinico'
type Fuente = 'kmc' | 'simulado'
const TIPOS: Tipo[] = ['anomalias', 'clinico']
export const enMarcha = (e?: Ejecucion) => !!e && (e.estado === 'pendiente' || e.estado === 'en_curso')

/** Los últimos entrenamientos pedidos desde la web; mientras uno corre se consulta cada 4 s. */
export function useEntrenamientos(habilitado = true) {
  return useQuery({
    queryKey: ['entrenamientos', 'ejecuciones'],
    queryFn: () => pedir<Ejecucion[]>('/entrenamientos/ejecuciones', { params: { limite: '5' } }),
    enabled: habilitado,
    refetchInterval: (q) => (enMarcha(q.state.data?.[0]) ? 4000 : false),
  })
}

export function EntrenarAhora({ fuente }: { fuente: Fuente }) {
  const cliente = useQueryClient()
  const hp = useQuery({ queryKey: ['administracion', 'hiperparametros'], queryFn: () => pedir<Hiperparametros[]>('/administracion/hiperparametros') })
  const lista = useEntrenamientos()
  const [modelos, setModelos] = useState<Record<Tipo, boolean>>({ anomalias: true, clinico: true })
  const [extraer, setExtraer] = useState(true)
  const [guardar, setGuardar] = useState(false)
  const [valores, setValores] = useState<Record<string, Record<string, string>>>({})
  // los valores de partida: el ajuste guardado o, si no hay, el del núcleo
  useEffect(() => {
    if (hp.data) {
      setValores(Object.fromEntries(hp.data.map((h) => [h.modelo, Object.fromEntries(
        h.campos.map((c) => [c.nombre, String(c.valor ?? c.defecto ?? '')]))])))
    }
  }, [hp.data])
  const entrenar = useMutation({
    mutationFn: () => {
      const elegidos = TIPOS.filter((t) => modelos[t])
      return pedir<Ejecucion>('/entrenamientos/entrenar', {
        cuerpo: {
          fuente, modelos: elegidos, extraer, guardar,
          hiperparametros: Object.fromEntries(elegidos.map((t) => [t, Object.fromEntries(
            Object.entries(valores[t] ?? {}).map(([k, v]) => [k, v === '' ? null : Number(v)]))])),
        },
      })
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['entrenamientos', 'ejecuciones'] })
      if (guardar) void cliente.invalidateQueries({ queryKey: ['administracion'] })
    },
  })
  // al terminar un entrenamiento, la tabla de MLflow trae la versión nueva
  const ultimo = lista.data?.[0]
  const antes = useRef(false)
  useEffect(() => {
    if (antes.current && !enMarcha(ultimo)) void cliente.invalidateQueries({ queryKey: ['entrenamientos', fuente] })
    antes.current = enMarcha(ultimo)
  }, [ultimo, fuente, cliente])
  const ocupado = enMarcha(ultimo)
  const ninguno = !TIPOS.some((t) => modelos[t])

  return (
    <Panel titulo="Entrenar ahora">
      {ultimo && <EstadoEntrenamiento e={ultimo} />}
      {hp.isPending ? <Cargando /> : hp.error ? <Aviso>{hp.error.message}</Aviso> : (
        <form className="mt-4 space-y-4" onSubmit={(ev) => { ev.preventDefault(); entrenar.mutate() }}>
          <p className="text-sm text-salvia">
            Trae los datos de <strong>{FUENTES[fuente]}</strong> y entrena con los hiperparámetros de abajo (parten del
            ajuste guardado o del núcleo). El modelo queda en MLflow como <em>candidato</em>; para usarlo en la solución,
            apruébelo más abajo.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {TIPOS.map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-teal" checked={modelos[t]}
                  onChange={(ev) => setModelos({ ...modelos, [t]: ev.target.checked })} />
                {MODELOS[t]}
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-teal" checked={extraer} onChange={(ev) => setExtraer(ev.target.checked)} />
              {fuente === 'kmc' ? 'Extraer datos nuevos de la base de la entidad' : 'Generar una cohorte simulada nueva'}
              <span className="text-salvia">(si no, usa el último corte)</span>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {hp.data.filter((h) => modelos[h.modelo]).map((h) => (
              <fieldset key={h.modelo} className="rounded-control border border-linea p-3">
                <legend className="px-1 text-sm font-semibold">Hiperparámetros · {MODELOS[h.modelo]}</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {h.campos.map((c) => (
                    <Campo key={c.nombre} id={`ea-${h.modelo}-${c.nombre}`} etiqueta={c.etiqueta} ayuda={`${c.minimo}–${c.maximo} · núcleo: ${c.defecto}`}>
                      <Entrada id={`ea-${h.modelo}-${c.nombre}`} type="number" inputMode="decimal" min={c.minimo} max={c.maximo}
                        step={c.tipo === 'int' ? 1 : 'any'} value={valores[h.modelo]?.[c.nombre] ?? ''}
                        onChange={(ev) => setValores({ ...valores, [h.modelo]: { ...valores[h.modelo], [c.nombre]: ev.target.value } })} />
                    </Campo>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-teal" checked={guardar} onChange={(ev) => setGuardar(ev.target.checked)} />
            Guardar también estos valores para las ejecuciones programadas
          </label>
          {entrenar.error && <Aviso>{entrenar.error.message}</Aviso>}
          <Boton type="submit" disabled={ninguno || ocupado || entrenar.isPending}>
            {ocupado ? 'Hay un entrenamiento en curso' : 'Entrenar ahora'}
          </Boton>
        </form>
      )}
    </Panel>
  )
}

const NOMBRE_PASO: Record<string, string> = {
  pendiente: 'En cola', extrayendo: 'Trayendo los datos de la fuente', entrenando_anomalias: 'Entrenando anomalías',
  entrenando_clinico: 'Entrenando alertas clínicas', entrenado: 'Entrenado y registrado en MLflow',
}

/** El avance de un entrenamiento, paso por paso. */
export function EstadoEntrenamiento({ e }: { e: Ejecucion }) {
  const p = (e.parametros ?? {}) as { extraer?: boolean; modelos?: Tipo[] }
  const r = (e.resultado ?? {}) as { paso?: string; hechos?: string[]; modelos?: Record<string, { version: string }> }
  const pasos = ['pendiente', ...(p.extraer ? ['extrayendo'] : []), ...(p.modelos ?? TIPOS).map((t) => `entrenando_${t}`), 'entrenado']
  const actual = e.estado === 'pendiente' ? 'pendiente' : e.estado === 'ok' ? 'entrenado' : r.paso ?? 'pendiente'
  const hechos = new Set([...(e.estado === 'pendiente' ? [] : ['pendiente']), ...(r.hechos ?? []), ...(e.estado === 'ok' ? pasos : [])])
  const titulo = e.estado === 'ok' ? 'Modelo entrenado' : e.estado === 'error' ? 'El entrenamiento falló'
    : e.estado === 'en_curso' ? 'Entrenando el modelo…' : 'Entrenamiento en cola'
  return (
    <div role="status" aria-live="polite" className={cn('rounded-control border p-3',
      e.estado === 'ok' ? 'border-teal/30 bg-teal-tinte' : e.estado === 'error' ? 'border-coral/40 bg-coral-tinte' : 'border-ocre/40 bg-fondo')}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{titulo}</p>
        <Insignia>N.º {e.id} · {FUENTES[e.fuente] ?? e.fuente}</Insignia>
        <span className="text-sm text-salvia">{fechaHora(e.creada_en)}{e.terminada && ` → ${fechaHora(e.terminada)}`}</span>
      </div>
      <ol className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {pasos.map((paso) => {
          const fallo = e.estado === 'error' && paso === actual
          const enCurso = !fallo && paso === actual && enMarcha(e)
          const hecho = !fallo && !enCurso && hechos.has(paso)
          const Icono = fallo ? XCircle : enCurso ? LoaderCircle : hecho ? CheckCircle2 : Circle
          return (
            <li key={paso} className={cn('flex items-center gap-1.5', !hecho && !enCurso && !fallo && 'text-salvia')}>
              <Icono size={16} aria-hidden className={cn(fallo ? 'text-coral-hondo' : hecho ? 'text-teal' : enCurso ? 'animate-spin text-ocre' : '')} />
              <span className={cn(enCurso && 'font-semibold')}>{NOMBRE_PASO[paso] ?? paso}</span>
            </li>
          )
        })}
      </ol>
      {e.mensaje && <p className={cn('mt-2 text-sm', e.estado === 'error' && 'text-coral-hondo')}>{e.mensaje}</p>}
      {r.modelos && Object.keys(r.modelos).length > 0 && (
        <p className="mt-1 text-sm">Versiones: {Object.entries(r.modelos).map(([t, m]) => `${MODELOS[t] ?? t} v${m.version}`).join(' · ')} (candidato)</p>
      )}
      {e.registro && (
        <details className="mt-1">
          <summary className="cursor-pointer text-sm text-teal">Ver detalle técnico</summary>
          <pre className="mt-1 max-h-60 overflow-auto rounded-control bg-tinta/95 p-3 text-xs leading-relaxed text-white">{e.registro}</pre>
        </details>
      )}
    </div>
  )
}
