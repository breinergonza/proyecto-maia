// Entrenamientos (administración): lo que MLflow registró de cada entrenamiento (hiperparámetros, métricas de
// validación, versión y alias), la comparación entre entrenamientos y la aprobación de las versiones que usa la solución.
import { useMutation, useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { pedir } from '../api/cliente'
import type { Ejecucion, Entrenamiento, Entrenamientos } from '../api/tipos'
import { useConfirmar } from '../components/Confirmar'
import { EntrenarAhora } from '../components/EntrenarAhora'
import { PanelesPestana, Pestanas, usePestanaEnUrl } from '../components/ui/Pestanas'
import { Aviso, Boton, Cargando, Encabezado, Insignia, Panel, Selector, Tabla, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { dec2, fechaHora, FUENTES, MODELOS, parametro } from '../lib/formato'

type Tipo = 'anomalias' | 'clinico'
type Fuente = 'kmc' | 'simulado'
const HP_VISIBLES = ['rondas', 'tasa', 'hojas', 'min_hoja']
const PESTANAS = [
  { clave: 'clinico', texto: MODELOS.clinico },
  { clave: 'anomalias', texto: MODELOS.anomalias },
  { clave: 'entrenar', texto: 'Entrenar ahora' },
] as const
const CLAVES = PESTANAS.map((p) => p.clave)
/** Una tabla dentro de un panel que se desplaza: el encabezado queda fijo. */
const ENCABEZADO_FIJO = 'xl:overflow-visible [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-papel'

const media = (m: Record<string, number>, f: (k: string) => boolean) => {
  const v = Object.entries(m).filter(([k]) => f(k)).map(([, x]) => x)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Las cifras que resumen un entrenamiento en la tabla. */
function principales(tipo: Tipo, m: Record<string, number>): [string, number | null][] {
  if (tipo === 'clinico') {
    return [['AUC medio', media(m, (k) => k.startsWith('auc__'))], ['Desenlaces con modelo', m.desenlaces_con_modelo ?? null]]
  }
  return [
    ['Falsas por 1.000', m.falsas_por_1000__cualquiera ?? media(m, (k) => k.startsWith('falsas_por_1000__'))],
    ['Detectados % (medio)', media(m, (k) => k.startsWith('detectados_pct__'))],
  ]
}

const etiquetaVersion = (e: Entrenamiento) => (e.modelo ? `v${e.modelo.version}` : '—')

export default function AdminEntrenamientos() {
  const [fuente, setFuente] = useState<Fuente>('kmc')
  const [activa, elegir] = usePestanaEnUrl('ver', CLAVES)
  const datos = useQuery({
    queryKey: ['entrenamientos', fuente],
    queryFn: () => pedir<Entrenamientos>('/entrenamientos', { params: { fuente } }),
  })
  const [comparar, setComparar] = useState<Record<Tipo, string[]>>({ anomalias: [], clinico: [] })
  const [aprobar, setAprobar] = useState<Record<Tipo, string | null>>({ anomalias: null, clinico: null })
  const alternar = (t: Tipo, id: string) =>
    setComparar((c) => ({ ...c, [t]: c[t].includes(id) ? c[t].filter((x) => x !== id) : [...c[t], id].slice(-3) }))
  const aprobacion = useMutation({
    mutationFn: () => pedir<Ejecucion>('/entrenamientos/aprobar', { cuerpo: { fuente, anomalias: aprobar.anomalias, clinico: aprobar.clinico } }),
  })
  const { confirmar, dialogo } = useConfirmar()
  const aprobarVersiones = async () => {
    const ok = await confirmar({
      titulo: 'Aprobar y activar en la solución',
      mensaje: `Se usarán anomalías v${aprobar.anomalias} y alertas clínicas v${aprobar.clinico} (${FUENTES[fuente]}).`,
      efecto: 'El alias produccion pasa a estas versiones y la API activa el paquete: lo usarán el tablero, las corridas y el cálculo de un niño, para todos los usuarios.',
      reversible: true, textoConfirmar: 'Activar en la solución',
    })
    if (ok) aprobacion.mutate()
  }
  const cambiarFuente = (f: Fuente) => {
    setFuente(f)
    setComparar({ anomalias: [], clinico: [] })
    setAprobar({ anomalias: null, clinico: null })
    aprobacion.reset()
  }
  const tabla = (t: Tipo) => datos.isPending ? <Cargando /> : datos.error ? <Aviso>{datos.error.message}</Aviso> : (
    <TablaModelo tipo={t} lista={datos.data[t]} comparar={comparar[t]} alternar={(id) => alternar(t, id)}
      aprobar={aprobar[t]} elegir={(v) => setAprobar((a) => ({ ...a, [t]: v }))} />
  )
  // en escritorio la página ocupa la pantalla sin desplazarse: la tabla se desplaza por dentro y la aprobación, que
  // abarca las dos tablas, queda siempre a la vista debajo de ellas
  return (
    <div className="flex flex-col xl:h-full">
      <Encabezado titulo="Entrenamientos">
        Cada entrenamiento queda en MLflow con sus hiperparámetros, sus métricas de validación (entrena con el pasado y
        mide con lo más reciente) y la versión registrada. Los nuevos entran como <em>candidato</em>; la solución usa los
        que tienen el alias <em>produccion</em>, que se fija al aprobar.
        {datos.data?.mlflow_url && <> <a className="inline-flex items-center gap-1 text-teal underline" href={datos.data.mlflow_url} target="_blank" rel="noreferrer">Abrir MLflow <ExternalLink size={14} aria-hidden /></a></>}
      </Encabezado>
      <div className="flex flex-wrap items-end justify-between gap-x-4 border-b border-linea">
        <Pestanas prefijo="entrenamientos" etiqueta="Qué ver" pestanas={PESTANAS} activa={activa} elegir={elegir} className="border-b-0" />
        <div className="flex items-center gap-2 pb-1.5">
          <label htmlFor="t-fuente" className="text-sm font-semibold">Datos</label>
          <Selector id="t-fuente" className="w-52" value={fuente} onChange={(e) => cambiarFuente(e.target.value as Fuente)}>
            {Object.entries(FUENTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selector>
        </div>
      </div>
      <PanelesPestana prefijo="entrenamientos" activa={activa} className="mt-3 flex min-h-0 flex-col gap-3" paneles={[
        { clave: 'clinico', contenido: tabla('clinico') },
        { clave: 'anomalias', contenido: tabla('anomalias') },
        { clave: 'entrenar', contenido: <EntrenarAhora key={fuente} fuente={fuente} /> },
      ]} />
      {activa !== 'entrenar' && (
        <Panel className="mt-3 shrink-0" titulo="Aprobar para usar en la solución" accion={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p>
              Anomalías: <strong>{aprobar.anomalias ? `v${aprobar.anomalias}` : 'sin elegir'}</strong> · Alertas clínicas:{' '}
              <strong>{aprobar.clinico ? `v${aprobar.clinico}` : 'sin elegir'}</strong>
            </p>
            <Boton disabled={!aprobar.anomalias || !aprobar.clinico || aprobacion.isPending || !!aprobacion.data} onClick={aprobarVersiones}>
              Aprobar y activar
            </Boton>
          </div>
        }>
          {dialogo}
          <p className="text-sm text-salvia">
            Elija una versión de cada modelo en la columna «Aprobar». El programador mueve el alias <em>produccion</em> a
            esas versiones, arma y firma el paquete, y la API lo activa: desde ahí lo usan el tablero, las corridas de la
            plataforma y el cálculo de un niño.
          </p>
          {aprobacion.error && <div className="mt-3"><Aviso>{aprobacion.error.message}</Aviso></div>}
          {aprobacion.data && <div className="mt-3"><Aviso tono="teal">Aprobación en cola (ejecución n.º {aprobacion.data.id}). Siga su avance en <Link className="underline" to="/admin/programacion">Programación</Link>.</Aviso></div>}
        </Panel>
      )}
    </div>
  )
}

function TablaModelo({ tipo, lista, comparar, alternar, aprobar, elegir }: {
  tipo: Tipo; lista: Entrenamiento[]; comparar: string[]; alternar: (id: string) => void
  aprobar: string | null; elegir: (v: string) => void
}) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const elegidos = lista.filter((e) => comparar.includes(e.run_id))
  const nombres = principales(tipo, {}).map(([n]) => n)
  return (
    <Panel llenar titulo={MODELOS[tipo]}>
      {lista.length === 0 ? <Vacio titulo="Sin entrenamientos registrados">Programe una corrida o ejecute una ahora en Programación.</Vacio> : (
        <Tabla densa apilar className={cn(ENCABEZADO_FIJO, '[&_th]:whitespace-normal! [&_th]:align-bottom')}>
          <thead>
            <tr>
              <th><span className="sr-only">Comparar</span></th><th>Fecha</th><th>Corte</th><th>Versión</th>
              {HP_VISIBLES.map((h) => <th key={h} className="text-right">{h}</th>)}
              {nombres.map((n) => <th key={n} className="text-right">{n}</th>)}
              <th>Aprobar</th><th data-acciones><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <Fragment key={e.run_id}>
                <tr>
                  <td><input type="checkbox" className="size-4 accent-teal" aria-label={`Comparar ${e.nombre ?? e.run_id}`}
                    checked={comparar.includes(e.run_id)} onChange={() => alternar(e.run_id)} /></td>
                  <td className="min-w-36 max-w-44">{fechaHora(e.inicio)}{e.estado !== 'FINISHED' && <Insignia tono="coral" className="ml-1">{e.estado}</Insignia>}</td>
                  <td>{e.corte ?? '—'}</td>
                  <td>
                    {etiquetaVersion(e)}
                    {e.modelo?.alias?.map((a) => <Insignia key={a} tono={a === 'produccion' ? 'teal' : 'ocre'} className="ml-1">{a}</Insignia>)}
                    {e.etiquetas?.hiperparametros && e.etiquetas.hiperparametros !== 'nucleo' && <Insignia className="ml-1">ajustado</Insignia>}
                  </td>
                  {HP_VISIBLES.map((h) => <td key={h} className="text-right tabular-nums">{parametro(e.hiperparametros?.[h])}</td>)}
                  {principales(tipo, e.metricas ?? {}).map(([n, v]) => <td key={n} className="text-right tabular-nums">{dec2(v)}</td>)}
                  <td>{e.modelo ? <input type="radio" name={`aprobar-${tipo}`} className="size-4 accent-teal" aria-label={`Aprobar ${etiquetaVersion(e)}`}
                    checked={aprobar === e.modelo.version} onChange={() => elegir(e.modelo!.version)} /> : '—'}</td>
                  <td className="whitespace-nowrap text-right">
                    <Boton chico variante="fantasma" aria-expanded={abierto === e.run_id} onClick={() => setAbierto(abierto === e.run_id ? null : e.run_id)}>
                      {abierto === e.run_id ? 'Ocultar' : 'Detalle'}
                    </Boton>
                    {e.enlace && <a className="ml-1 inline-flex items-center text-teal" href={e.enlace} target="_blank" rel="noreferrer" aria-label="Ver en MLflow"><ExternalLink size={16} aria-hidden /></a>}
                  </td>
                </tr>
                {abierto === e.run_id && <tr><td colSpan={6 + HP_VISIBLES.length + nombres.length}><Detalle e={e} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </Tabla>
      )}
      {/* al elegir dos o más, la comparación queda fija al pie del panel: se ve sin recorrer toda la tabla */}
      {elegidos.length >= 2 && <div className="sticky bottom-0 mt-4 max-h-72 overflow-auto bg-papel"><Comparacion lista={elegidos} /></div>}
    </Panel>
  )
}

function Pares({ titulo, datos, formato, texto = String }: {
  titulo: string; datos?: Record<string, string | number>; formato?: (v: number) => string; texto?: (v: string | number) => string
}) {
  const filas = Object.entries(datos ?? {}).sort(([a], [b]) => a.localeCompare(b))
  if (!filas.length) return null
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">{titulo}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
        {filas.map(([k, v]) => (
          <Fragment key={k}><dt className="text-salvia">{k}</dt><dd className="tabular-nums">{typeof v === 'number' && formato ? formato(v) : texto(v)}</dd></Fragment>
        ))}
      </dl>
    </div>
  )
}

function Detalle({ e }: { e: Entrenamiento }) {
  return (
    <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-3">
      <Pares titulo="Hiperparámetros" datos={e.hiperparametros} texto={parametro} />
      <Pares titulo="Métricas de validación" datos={e.metricas} formato={(v) => dec2(v)} />
      <div className="flex flex-col gap-4">
        <Pares titulo="Extracción" datos={e.extraccion} />
        <Pares titulo="Etiquetas" datos={Object.fromEntries(Object.entries(e.etiquetas ?? {}).filter(([k]) => k !== 'mlflow.runName'))} />
        <p className="text-xs text-salvia">Run {e.run_id}{e.modelo && ` · ${e.modelo.registro} v${e.modelo.version}`}</p>
      </div>
    </div>
  )
}

function Comparacion({ lista }: { lista: Entrenamiento[] }) {
  const [soloDistintos, setSoloDistintos] = useState(true)
  const filas = useMemo(() => {
    const claves = (f: (e: Entrenamiento) => Record<string, unknown> | undefined) => [...new Set(lista.flatMap((e) => Object.keys(f(e) ?? {})))].sort()
    return [
      ...claves((e) => e.hiperparametros).map((k) => ({ grupo: 'Hiperparámetro', clave: k, valores: lista.map((e) => parametro(e.hiperparametros?.[k])) })),
      ...claves((e) => e.metricas).map((k) => ({ grupo: 'Métrica', clave: k, valores: lista.map((e) => dec2(e.metricas?.[k])) })),
    ]
  }, [lista])
  const visibles = filas.filter((f) => !soloDistintos || new Set(f.valores).size > 1)
  return (
    <div className="rounded-control border border-linea p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Comparación de {lista.length} entrenamientos</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-teal" checked={soloDistintos} onChange={(e) => setSoloDistintos(e.target.checked)} />
          Solo lo que cambia
        </label>
      </div>
      <Tabla densa>
        <thead><tr><th>Parámetro o métrica</th>{lista.map((e) => <th key={e.run_id} className="text-right">{etiquetaVersion(e)} · {fechaHora(e.inicio)}</th>)}</tr></thead>
        <tbody>
          {visibles.map((f) => (
            <tr key={f.grupo + f.clave}>
              <td><span className="text-salvia">{f.grupo}:</span> {f.clave}</td>
              {f.valores.map((v, i) => <td key={i} className={cn('text-right tabular-nums', new Set(f.valores).size > 1 && 'font-semibold')}>{v}</td>)}
            </tr>
          ))}
          {!visibles.length && <tr><td colSpan={lista.length + 1} className="text-salvia">No hay diferencias.</td></tr>}
        </tbody>
      </Tabla>
    </div>
  )
}
