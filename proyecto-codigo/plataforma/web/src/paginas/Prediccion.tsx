// Predicción: el riesgo de una muestra, de todo el universo o de un niño nuevo, con el modelo que se elija. Muestra y universo se
// calculan en segundo plano (estado y avance) y la tabla por niño se pide por páginas; del riesgo por niño no se guarda nada. La
// muestra se arma con las mismas facetas de Explorar (PanelFacetas); el CSV por niño es solo de administración. Solo el «niño
// nuevo» y las plantillas se guardan, y solo si la persona lo pide.
import { Download } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useFacetasExplorar } from '../api/exploracion'
import {
  EN_CURSO, pedirCsvPrediccion, useBibliotecaEjemplos, useBorrarNinoGuardado, useEjemplo, useGuardarNino, useLanzarPrediccion,
  useModelosPrediccion, useNinosGuardados, usePredecirNino, useTablaPrediccion, useTrabajoPrediccion,
} from '../api/prediccion'
import type {
  CampoEjemplo, CeldaVisitaPrediccion, CuerpoExplorar, CuerpoPrediccionMuestra, FilaPrediccion, MuestraJson, NinoGuardado,
  PrediccionNino, ResultadoTrabajoPrediccion, TrabajoPrediccion,
} from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { TarjetaRiesgo } from '../components/ficha'
import { Grafica, TablaDatos } from '../components/grafica'
import { Termino } from '../components/Termino'
import { PanelFacetas } from '../components/PanelFacetas'
import { LeyendaSeries, LineasSeries, type FilaSeries, type Serie } from '../components/graficos'
import { Aviso, Boton, Campo, Cargando, Cifra, Encabezado, Entrada, Insignia, Paginador, Panel, Selector, Tabla, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { descripcionDe } from '../lib/descripciones'
import { descargar, nombreArchivo } from '../lib/exportar'
import { num, riesgo as formatoRiesgo } from '../lib/formato'
import { cuantosMenos, nivelAlto } from '../lib/lenguaje'
import { useFiltros } from '../lib/useFiltros'

type Modo = 'muestra' | 'universo' | 'nino'
const MODOS: { id: Modo; texto: string }[] = [
  { id: 'muestra', texto: 'Muestra' },
  { id: 'universo', texto: 'Todo el universo' },
  { id: 'nino', texto: 'Niño nuevo desde un perfil' },
]

export default function Prediccion() {
  const [modo, setModo] = useState<Modo>('muestra')
  const [modelo, setModelo] = useState<string>('')
  return (
    <div>
      <Encabezado titulo="Calcular un grupo de niños">
        Calcule el riesgo de un grupo de niños o de un niño nuevo con el modelo que elija. Los resultados no se guardan: existen solo en esta pantalla.
      </Encabezado>
      <div role="tablist" aria-label="Qué calcular" className="mb-4 flex flex-wrap gap-2">
        {MODOS.map((m) => (
          <button key={m.id} role="tab" type="button" aria-selected={modo === m.id} onClick={() => setModo(m.id)}
            className={cn('rounded-control border px-3 py-1.5 text-sm font-semibold',
              modo === m.id ? 'border-teal bg-teal-tinte text-teal' : 'border-linea bg-papel text-salvia hover:border-teal/50')}>
            {m.texto}
          </button>
        ))}
      </div>
      <div className="mb-4 max-w-xl"><SelectorModelo valor={modelo} cambiar={setModelo} /></div>
      {modo === 'nino' ? <NinoNuevo modelo={modelo} key={`n${modelo}`} />
        : modo === 'universo' ? <Universo modelo={modelo} key={`u${modelo}`} /> : <Muestra modelo={modelo} key={`m${modelo}`} />}
    </div>
  )
}

// ------------------------------------------------------------------ modelo

function SelectorModelo({ valor, cambiar }: { valor: string; cambiar: (v: string) => void }) {
  const modelos = useModelosPrediccion()
  const lista = modelos.data?.modelos ?? []
  const elegido = lista.find((m) => m.version === valor) ?? lista.find((m) => m.activo)
  return (
    <div>
      <Campo etiqueta="Modelo" id="modelo-prediccion">
        <Selector id="modelo-prediccion" value={valor} onChange={(e) => cambiar(e.target.value)} disabled={!lista.length}>
          <option value="">{lista.length ? 'El modelo activo' : 'Sin modelos'}</option>
          {lista.map((m) => (
            <option key={m.version} value={m.version}>
              {m.version} · {m.origen === 'personal' ? `personal${m.dueno ? ` de ${m.dueno}` : ''}` : 'oficial'}
              {m.activo ? ' (activo)' : ''}{m.corte_anterior ? ' · corte anterior' : ''}
            </option>
          ))}
        </Selector>
      </Campo>
      {elegido?.aviso && <div className="mt-2"><Aviso tono="coral">Corte anterior. {elegido.aviso}</Aviso></div>}
    </div>
  )
}

// ------------------------------------------------------------------ muestra y universo

/** Muestra: el grupo se arma con las facetas (o un filtro guardado) de Explorar. */
function Muestra({ modelo }: { modelo: string }) {
  const filtros = useFiltros()
  const { usuario } = useSesion()
  const grupo: CuerpoExplorar = filtros.guardada ? { muestra_id: filtros.guardada } : { muestra: filtros.muestra }
  const facetas = useFacetasExplorar(grupo)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <aside className="lg:col-span-4 xl:col-span-3">
        <PanelFacetas facetas={facetas.data} cargando={facetas.isPending} filtros={filtros} esExperto={puede(usuario, ['admin', 'experto'])} />
      </aside>
      <div className="min-w-0 lg:col-span-8 xl:col-span-9">
        <Calculo modelo={modelo} universo={false} grupo={grupo}
          listo={filtros.guardada !== null || filtros.entradas.length > 0} />
      </div>
    </div>
  )
}

function Universo({ modelo }: { modelo: string }) {
  return <Calculo modelo={modelo} universo grupo={{}} listo />
}

/** Lanza el cálculo (asíncrono: estado y progreso), y muestra los agregados y la tabla por páginas cuando termina. */
function Calculo({ modelo, universo, grupo, listo }: {
  modelo: string; universo: boolean; grupo: { muestra?: MuestraJson; muestra_id?: number }; listo: boolean
}) {
  const { usuario } = useSesion()
  const admin = puede(usuario, ['admin'])
  const biblioteca = useBibliotecaEjemplos(modelo || null)
  const [visita, setVisita] = useState('')
  const [excluir, setExcluir] = useState(false)
  const [trabajoId, setTrabajoId] = useState<number | null>(null)
  const lanzar = useLanzarPrediccion()
  const trabajo = useTrabajoPrediccion(trabajoId)
  const cuerpo: CuerpoPrediccionMuestra = {
    modelo: modelo || null, ...grupo, excluir_entrenamiento: excluir, visita: visita || null,
  }
  const t = trabajo.data
  const corriendo = lanzar.isPending || (t !== undefined && EN_CURSO.includes(t.estado))
  return (
    <div className="space-y-4">
      <Panel titulo={universo ? 'Todo el universo' : 'Muestra'}
        descripcion={universo ? 'Todos los niños del corte vigente, con la visita que elija.' : 'Los niños que cumplen el grupo que armó a la izquierda.'}>
        <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={(e) => { e.preventDefault(); lanzar.mutate(cuerpo, { onSuccess: (x) => setTrabajoId(x.id) }) }}>
          <Campo etiqueta="Visita" id="visita-prediccion">
            <Selector id="visita-prediccion" value={visita} onChange={(e) => setVisita(e.target.value)}>
              <option value="">La última a la que fue cada niño</option>
              {(biblioteca.data?.visitas ?? []).map((v) => <option key={v.etapa} value={v.etapa}>{v.nombre}</option>)}
            </Selector>
          </Campo>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={excluir} onChange={(e) => setExcluir(e.target.checked)} />
            Dejar fuera a los niños con que se entrenó el modelo
          </label>
          <div className="sm:col-span-2">
            <Boton type="submit" disabled={corriendo || !listo}>{corriendo ? 'Calculando…' : 'Calcular el riesgo'}</Boton>
            {!listo && <p className="mt-1 text-xs text-salvia">Marque al menos una opción o elija un filtro guardado para armar la muestra.</p>}
          </div>
        </form>
      </Panel>
      {lanzar.isError && <Aviso>{lanzar.error.message}</Aviso>}
      {trabajo.isError && <Aviso>{trabajo.error.message}</Aviso>}
      {t && EN_CURSO.includes(t.estado) && <Avance t={t} />}
      {t?.estado === 'error' && <Aviso>{t.mensaje ?? 'El cálculo falló. Intente de nuevo.'}</Aviso>}
      {t?.estado === 'ok' && t.resultado && <Resultado t={t} r={t.resultado} admin={admin} />}
      {t?.estado === 'ok' && !t.resultado && <Aviso tono="teal">Este cálculo ya venció (se conserva una hora). Vuelva a calcular.</Aviso>}
    </div>
  )
}

function Avance({ t }: { t: TrabajoPrediccion }) {
  return (
    <div role="status" aria-live="polite" className="rounded-panel border border-linea bg-papel p-4">
      <p className="text-sm font-semibold">{t.estado === 'pendiente' ? 'En cola…' : t.paso ?? 'Calculando…'}</p>
      <progress className="mt-2 h-2 w-full" value={t.progreso} max={100} aria-label="Avance del cálculo" />
      <p className="mt-1 text-xs text-salvia">{t.progreso} %{t.n_filtro ? ` · ${num(t.n_filtro)} niños` : ''}. Puede esperar aquí: el resultado aparece solo.</p>
    </div>
  )
}

function Resultado({ t, r, admin }: { t: TrabajoPrediccion; r: ResultadoTrabajoPrediccion; admin: boolean }) {
  if (r.insuficiente) {
    return (
      <Aviso tono="teal">
        <strong>Muy pocos niños.</strong> {r.mensaje} Elija un grupo más grande.
      </Aviso>
    )
  }
  return <ResultadoMuestra t={t} r={r} admin={admin} />
}

function ResultadoMuestra({ t, r, admin }: { t: TrabajoPrediccion; r: Extract<ResultadoTrabajoPrediccion, { insuficiente: false }>; admin: boolean }) {
  const a = r.agregados
  const cuerpo = t.parametros
  const [error, setError] = useState<string | null>(null)
  const [bajando, setBajando] = useState(false)
  const bajar = async () => {
    setError(null)
    setBajando(true)
    try {
      descargar(await pedirCsvPrediccion(cuerpo), nombreArchivo('prediccion', 'csv'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el archivo.')
    } finally {
      setBajando(false)
    }
  }
  const dist = descripcionDe('distribucion_riesgo')
  const maximo = Math.max(1, ...a.histograma.map((b) => b.n))
  return (
    <div className="space-y-4">
      {r.aviso_corte && <Aviso tono="coral">{r.aviso_corte}</Aviso>}
      {r.excluidos > 0 && <Aviso tono="teal">Se dejaron fuera {num(r.excluidos)} niños con que se entrenó el modelo.</Aviso>}
      {!r.fuga_no_verificable && r.en_entrenamiento === 0 && (
        <Aviso tono="teal">Ninguno de estos niños estaba en el entrenamiento del modelo: el riesgo es el de niños que no conocía.</Aviso>
      )}
      {r.fuga_no_verificable && cuerpo.excluir_entrenamiento && (
        <Aviso tono="coral">Este modelo no trae la lista de niños con que se entrenó: no se pudieron dejar fuera.</Aviso>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Cifra valor={num(a.n_puntuados)} texto="niños con el riesgo calculado" />
        <Cifra valor={num(a.niveles.muy_alto)} texto={`con riesgo muy alto (percentil ${a.niveles.percentil_muy_alto} o más)`} tono="coral" />
        <Cifra valor={num(a.niveles.alto)} texto={`con riesgo alto (percentil ${a.niveles.percentil_alto} a ${a.niveles.percentil_muy_alto})`} tono="coral" />
      </div>
      <p className="text-xs text-salvia">El <Termino id="percentil">percentil</Termino> ordena a los niños de menor a mayor riesgo.</p>
      <Grafica titulo={dist.titulo} descripcion={dist.descripcion}
        exportar={{ nombre: 'distribucion-del-riesgo', filas: a.histograma.map((b) => ({ 'Percentil desde': b.desde, 'Percentil hasta': b.hasta, Niños: b.n })),
          muestra: `${num(a.n_puntuados)} niños · modelo ${r.modelo.version}` }}>
        <svg role="img" aria-label={dist.titulo} viewBox="0 0 400 140" className="w-full max-w-xl">
          {a.histograma.map((b, i) => {
            const alto = (b.n / maximo) * 90
            return (
              <g key={b.desde}>
                <rect x={10 + i * 38} y={110 - alto} width={32} height={alto} rx={3}
                  fill={b.desde >= a.niveles.percentil_alto ? 'var(--color-coral)' : 'var(--color-teal)'} />
                <text x={26 + i * 38} y={105 - alto} textAnchor="middle" fontSize={9} fill="currentColor">{b.n}</text>
                <text x={26 + i * 38} y={125} textAnchor="middle" fontSize={9} fill="currentColor">{b.desde}</text>
              </g>
            )
          })}
        </svg>
        <p className="mt-1 text-xs text-salvia">Cada barra es un tramo de 10 puntos de <Termino id="percentil">percentil</Termino>; en coral, el riesgo alto.</p>
      </Grafica>
      <TablaDatos titulo={descripcionDe('riesgo_por_desenlace').titulo} descripcion={descripcionDe('riesgo_por_desenlace').descripcion}
        exportar={{ nombre: 'riesgo-por-desenlace', filas: a.por_desenlace.map((d) => ({ Desenlace: d.desenlace, Visita: d.momento_nombre, Niños: d.n, 'Riesgo mediano': d.riesgo_mediano, Altos: d.altos, 'Muy altos': d.muy_altos })) }}>
        <Tabla apilar>
          <thead><tr><th>Desenlace</th><th>Visita</th><th className="text-right">Niños</th><th className="text-right">Riesgo <Termino id="mediana">mediano</Termino></th><th className="text-right">Riesgo alto</th></tr></thead>
          <tbody>
            {a.por_desenlace.map((d) => (
              <tr key={d.clave}>
                <td>{d.desenlace}</td><td>{d.momento_nombre}</td>
                <td className="text-right">{num(d.n)}</td><td className="text-right">{formatoRiesgo(d.riesgo_mediano)}</td>
                <td className="text-right">{num(d.altos)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </TablaDatos>
      <RiesgoPorVisita celdas={r.por_visita} muestra={`${num(a.n_puntuados)} niños · modelo ${r.modelo.version}`} />
      <TablaNinos t={t} total={r.tabla_total} accion={admin && (
        <Boton variante="secundario" chico onClick={bajar} disabled={bajando}>
          <Download aria-hidden className="size-4" /> Exportar CSV
        </Boton>
      )} />
      {error && <Aviso>{error}</Aviso>}
    </div>
  )
}

/** El porcentaje de niños con riesgo alto en cada visita, para los tres desenlaces con más casos; sin cifras si la celda tiene menos de 5. */
function RiesgoPorVisita({ celdas, muestra }: { celdas: CeldaVisitaPrediccion[]; muestra: string }) {
  const { titulo, descripcion } = descripcionDe('riesgo_alto_visita')
  const { series, filas } = useMemo(() => {
    const maximo = new Map<string, { nombre: string; p: number }>()
    for (const c of celdas) {
      if (c.pct_altos === null) continue
      const previo = maximo.get(c.clave)
      if (!previo || c.pct_altos > previo.p) maximo.set(c.clave, { nombre: c.desenlace, p: c.pct_altos })
    }
    const principales = [...maximo.entries()].sort((x, y) => y[1].p - x[1].p).slice(0, 3)
    const orden = new Map<string, number>()
    celdas.forEach((c) => orden.set(c.momento_nombre, c.orden))
    const visitas = [...orden.entries()].sort((x, y) => x[1] - y[1]).map(([n]) => n)
    const s: Serie[] = principales.map(([clave, d], i) => ({ clave, nombre: d.nombre, color: i as 0 | 1 | 2 }))
    const f: FilaSeries[] = visitas.map((x) => {
      const fila: FilaSeries = { x }
      for (const [clave] of principales) fila[clave] = celdas.find((c) => c.momento_nombre === x && c.clave === clave)?.pct_altos ?? null
      return fila
    })
    return { series: s, filas: f }
  }, [celdas])
  if (series.length === 0) return null
  return (
    <Grafica titulo={titulo} descripcion={descripcion}
      exportar={{ nombre: 'riesgo-alto-por-visita', muestra,
        filas: celdas.filter((c) => !c.oculta).map((c) => ({ Desenlace: c.desenlace, Visita: c.momento_nombre, Niños: c.n, 'Riesgo mediano': c.riesgo_mediano, 'Con riesgo alto (%)': c.pct_altos })) }}>
      <LeyendaSeries series={series} />
      <LineasSeries filas={filas} series={series} etiqueta={titulo} formatoY={(v) => `${Math.round(v)} %`} dominioY={[0, 100]} />
    </Grafica>
  )
}

function TablaNinos({ t, total, accion }: { t: TrabajoPrediccion; total: number; accion?: ReactNode }) {
  const d = descripcionDe('riesgo_calculado')
  const [pagina, setPagina] = useState(1)
  const tabla = useTablaPrediccion(t.id, pagina, t.tabla_disponible)
  const filas = tabla.data?.filas ?? []
  const limite = tabla.data?.limite ?? 200
  return (
    <TablaDatos titulo="Niños con más riesgo" accion={accion}
      descripcion={`${d.descripcion} De mayor a menor riesgo, ${num(limite)} niños por página, de ${num(total)} niños.`}>
      {!t.tabla_disponible || tabla.isError ? (
        <Aviso tono="teal">La tabla por niño ya no está disponible (se conserva una hora). Vuelva a calcular.</Aviso>
      ) : tabla.isPending ? <Cargando /> : (
        <>
          <Tabla apilar>
            <thead>
              <tr><th>Niño</th><th>Desenlace</th><th className="text-right">Riesgo</th><th>Frente a los demás</th><th>Perfil</th><th>Primera alerta</th><th>Motivos</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => <FilaNino key={`${f.sujeto}-${f.clave}`} f={f} />)}
            </tbody>
          </Tabla>
          <Paginador pagina={pagina} tamano={limite} total={total} cambiar={setPagina} />
        </>
      )}
    </TablaDatos>
  )
}

function FilaNino({ f }: { f: FilaPrediccion }) {
  return (
    <tr>
      <td><Link className="font-semibold text-teal underline" to={`/ninos/${encodeURIComponent(f.sujeto)}`}>{f.sujeto}</Link></td>
      <td>{f.desenlace}<span className="block text-xs text-salvia">{f.momento_nombre}</span></td>
      <td className="text-right">{formatoRiesgo(f.riesgo)}</td>
      <td>
        {nivelAlto(f.percentil) && <Insignia tono="coral" className="mr-1">{nivelAlto(f.percentil)}</Insignia>}
        {cuantosMenos(f.percentil)} de 10
      </td>
      <td>{f.perfil ?? '—'}</td>
      <td>{f.primera_alerta ?? 'Aún no'}</td>
      <td>{f.motivos.slice(0, 2).join('; ') || '—'}</td>
    </tr>
  )
}

// ------------------------------------------------------------------ niño nuevo desde un perfil

function NinoNuevo({ modelo }: { modelo: string }) {
  const biblioteca = useBibliotecaEjemplos(modelo || null)
  const [visita, setVisita] = useState<string | null>(null)
  const [perfil, setPerfil] = useState<string | null>(null)
  const ejemplo = useEjemplo(visita, perfil, modelo || null)
  const predecir = usePredecirNino()
  const [cambios, setCambios] = useState<Record<string, string>>({})
  const [todos, setTodos] = useState(false)
  const usar = (n: NinoGuardado) => {
    setVisita(n.visita)
    setPerfil(n.perfil)
    setCambios(Object.fromEntries(Object.entries(n.cambios).map(([k, v]) => [k, v === null ? '' : String(v)])))
    predecir.reset()
  }

  if (biblioteca.isPending) return <Cargando />
  if (biblioteca.isError) return <Aviso>{biblioteca.error.message}</Aviso>
  const b = biblioteca.data
  const elegir = (v: string | null, p: string | null) => {
    setVisita(v)
    setPerfil(p)
    setCambios({})
    predecir.reset()
  }
  const e = ejemplo.data
  return (
    <div className="space-y-4">
      <Panel titulo={descripcionDe('biblioteca_ejemplos').titulo}
        descripcion={descripcionDe('biblioteca_ejemplos').descripcion}>
        <p className="mb-2 text-sm font-semibold">Visita</p>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Visita">
          {b.visitas.map((v) => (
            <button key={v.etapa} type="button" aria-pressed={visita === v.etapa} onClick={() => elegir(v.etapa, perfil)}
              className={cn('rounded-control border px-3 py-1.5 text-sm', visita === v.etapa ? 'border-teal bg-teal-tinte font-semibold text-teal' : 'border-linea bg-papel')}>
              {v.nombre}
            </button>
          ))}
        </div>
        <p className="mb-2 text-sm font-semibold">Perfil</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6" role="group" aria-label="Perfil">
          {b.perfiles.map((p) => (
            <button key={p.perfil} type="button" disabled={p.insuficiente} aria-pressed={perfil === p.perfil} onClick={() => elegir(visita, p.perfil)}
              className={cn('rounded-panel border p-3 text-left text-sm disabled:opacity-50',
                perfil === p.perfil ? 'border-teal bg-teal-tinte' : 'border-linea bg-papel')}>
              <span className="block font-semibold">{p.etiqueta}</span>
              <span className="text-xs text-salvia">{p.insuficiente ? 'Muy pocos niños' : `${num(p.n)} niños`}</span>
            </button>
          ))}
        </div>
      </Panel>
      {!visita || !perfil ? (
        <Vacio titulo="Elija una visita y un perfil">Con las dos cosas aparece el niño de ejemplo para editar.</Vacio>
      ) : ejemplo.isPending ? <Cargando /> : ejemplo.isError ? <Aviso>{ejemplo.error.message}</Aviso> : e?.insuficiente ? (
        <Aviso tono="teal"><strong>Muy pocos niños.</strong> Con menos de {e.minimo} niños en ese grupo no se da un ejemplo típico.</Aviso>
      ) : e ? (
        <>
          <EditorEjemplo campos={e.campos} visitas={e.visitas} cambios={cambios} todos={todos} verTodos={() => setTodos(!todos)}
            cambiar={(v, valor) => setCambios((c) => ({ ...c, [v]: valor }))}
            etiqueta={`${e.perfil_etiqueta} · ${e.visita_nombre} · ${num(e.n)} niños`} />
          <div>
            <Boton disabled={predecir.isPending} onClick={() => predecir.mutate({
              modelo: modelo || null, visita, perfil, cambios: valoresCambiados(e.campos, cambios),
            })}>
              {predecir.isPending ? 'Calculando…' : 'Calcular el riesgo'}
            </Boton>
          </div>
        </>
      ) : null}
      {predecir.isError && <Aviso>{predecir.error.message}</Aviso>}
      {predecir.data && <ResultadoNino r={predecir.data} />}
      {e && !e.insuficiente && visita && perfil && (
        <GuardarNino modelo={modelo} visita={visita} perfil={perfil} cambios={valoresCambiados(e.campos, cambios)} />
      )}
      <NinosGuardados usar={usar} />
    </div>
  )
}

/** «Guardar como niño nuevo» (o como plantilla de un perfil): va a su propia tabla, aparte del corte oficial. */
function GuardarNino({ modelo, visita, perfil, cambios }: {
  modelo: string; visita: string; perfil: string; cambios: Record<string, string | number | null>
}) {
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<'nino' | 'plantilla'>('nino')
  const guardar = useGuardarNino()
  return (
    <Panel titulo={descripcionDe('guardar_nino').titulo} descripcion={descripcionDe('guardar_nino').descripcion}>
      <form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
        onSubmit={(ev) => { ev.preventDefault(); guardar.mutate({ modelo: modelo || null, visita, perfil, cambios, titulo: titulo.trim(), tipo }, { onSuccess: () => setTitulo('') }) }}>
        <Campo etiqueta="Nombre" id="guardar-nino-titulo">
          <Entrada id="guardar-nino-titulo" value={titulo} maxLength={120} onChange={(ev) => setTitulo(ev.target.value)} />
        </Campo>
        <Campo etiqueta="Guardar como" id="guardar-nino-tipo">
          <Selector id="guardar-nino-tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value as 'nino' | 'plantilla')}>
            <option value="nino">Niño nuevo</option>
            <option value="plantilla">Plantilla del perfil</option>
          </Selector>
        </Campo>
        <Boton type="submit" disabled={!titulo.trim() || guardar.isPending}>{tipo === 'nino' ? 'Guardar como niño nuevo' : 'Guardar como plantilla'}</Boton>
      </form>
      {guardar.isError && <div className="mt-2"><Aviso>{guardar.error.message}</Aviso></div>}
      {guardar.isSuccess && <p role="status" className="mt-2 text-sm text-teal">Guardado: «{guardar.data.titulo}».</p>}
    </Panel>
  )
}

function NinosGuardados({ usar }: { usar: (n: NinoGuardado) => void }) {
  const lista = useNinosGuardados()
  const borrar = useBorrarNinoGuardado()
  const filas = lista.data ?? []
  if (lista.isPending || filas.length === 0) return null
  return (
    <TablaDatos titulo={descripcionDe('ninos_guardados').titulo}
      descripcion={descripcionDe('ninos_guardados').descripcion}>
      <Tabla apilar>
        <thead><tr><th>Nombre</th><th>Clase</th><th>Perfil</th><th>Visita</th><th>De</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>
          {filas.map((n) => (
            <tr key={n.id}>
              <td className="font-semibold">{n.titulo}</td>
              <td><Insignia tono={n.tipo === 'plantilla' ? 'teal' : 'neutro'}>{n.tipo === 'plantilla' ? 'Plantilla' : 'Niño nuevo'}</Insignia></td>
              <td>{n.perfil ?? '—'}</td>
              <td>{n.visita}</td>
              <td>{n.propio ? 'Usted' : n.dueno ?? '—'}</td>
              <td className="whitespace-nowrap text-right">
                <Boton variante="secundario" chico onClick={() => usar(n)} aria-label={`Usar ${n.titulo}`}>Usar</Boton>{' '}
                {n.propio && <Boton variante="fantasma" chico disabled={borrar.isPending} onClick={() => borrar.mutate(n.id)} aria-label={`Borrar ${n.titulo}`}>Borrar</Boton>}
              </td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </TablaDatos>
  )
}

const igual = (c: CampoEjemplo, v: string | undefined) => v === undefined || v === String(c.valor)

function valoresCambiados(campos: CampoEjemplo[], cambios: Record<string, string>): Record<string, string | number | null> {
  const salida: Record<string, string | number | null> = {}
  for (const c of campos) {
    const v = cambios[c.variable]
    if (v === undefined || igual(c, v)) continue
    salida[c.variable] = v === '' ? null : c.tipo === 'numero' || c.tipo === 'si_no' ? Number(v) : v
  }
  return salida
}

function EditorEjemplo({ campos, visitas, cambios, todos, verTodos, cambiar, etiqueta }: {
  campos: CampoEjemplo[]; visitas: { etapa: string; nombre: string }[]; cambios: Record<string, string>; todos: boolean
  verTodos: () => void; cambiar: (variable: string, valor: string) => void; etiqueta: string
}) {
  const nombres = useMemo(() => Object.fromEntries(visitas.map((v) => [v.etapa, v.nombre])), [visitas])
  const grupos = useMemo(() => {
    const m = new Map<string, CampoEjemplo[]>()
    for (const c of campos) if (todos || c.principal) m.set(c.etapa ?? '', [...(m.get(c.etapa ?? '') ?? []), c])
    return [...m.entries()]
  }, [campos, todos])
  return (
    <Panel titulo="Niño de ejemplo" descripcion={`${etiqueta}. Cambie solo lo que sea distinto: lo demás queda con el valor típico.`}
      accion={<Boton variante="secundario" chico onClick={verTodos}>{todos ? 'Solo los datos principales' : 'Ver todos los datos'}</Boton>}>
      <div className="space-y-5">
        {grupos.map(([etapa, lista]) => (
          <fieldset key={etapa}>
            <legend className="mb-2 text-sm font-semibold">{etapa ? nombres[etapa] ?? etapa : 'Datos generales'}</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {lista.map((c) => {
                const v = cambios[c.variable]
                const cambiado = !igual(c, v)
                const id = `ej-${c.variable}`
                const opciones = c.tipo === 'si_no' ? [{ valor: 1, etiqueta: 'Sí' }, { valor: 0, etiqueta: 'No' }] : c.opciones
                return (
                  <div key={c.variable}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label htmlFor={id} className="text-sm">{c.etiqueta}{c.unidad ? ` (${c.unidad})` : ''}</label>
                      <Insignia tono={cambiado ? 'coral' : 'teal'}>{cambiado ? 'cambiado' : 'típico'}</Insignia>
                    </div>
                    {c.tipo === 'lista' || c.tipo === 'si_no' ? (
                      <Selector id={id} value={v ?? String(c.valor)} onChange={(e) => cambiar(c.variable, e.target.value)}>
                        {opciones.map((o) => <option key={String(o.valor)} value={String(o.valor)}>{o.etiqueta}</option>)}
                        {!opciones.some((o) => String(o.valor) === String(c.valor)) && <option value={String(c.valor)}>{String(c.valor)}</option>}
                      </Selector>
                    ) : (
                      <Entrada id={id} type={c.tipo === 'numero' ? 'number' : 'text'} step="any" value={v ?? String(c.valor)}
                        onChange={(e) => cambiar(c.variable, e.target.value)} />
                    )}
                  </div>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </Panel>
  )
}

function ResultadoNino({ r }: { r: PrediccionNino }) {
  const trayectoria = r.insuficiente ? [] : r.trayectoria
  const visitas = useMemo(() => {
    const orden = new Map<string, number>()
    trayectoria.forEach((t) => orden.set(t.momento_nombre, t.orden))
    return [...orden.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n)
  }, [trayectoria])
  const principales = useMemo(() => {
    const maximo = new Map<string, { nombre: string; p: number }>()
    for (const t of trayectoria) {
      const previo = maximo.get(t.clave)
      if (!previo || t.percentil > previo.p) maximo.set(t.clave, { nombre: t.desenlace, p: t.percentil })
    }
    return [...maximo.entries()].sort((a, b) => b[1].p - a[1].p).slice(0, 3)
  }, [trayectoria])
  if (r.insuficiente) return <Aviso tono="teal"><strong>Muy pocos niños.</strong> {r.mensaje}</Aviso>
  const perfil = descripcionDe('se_parece_perfil')
  const series: Serie[] = [
    ...principales.map(([clave, d], i) => ({ clave, nombre: d.nombre, color: i as 0 | 1 | 2 })),
    { clave: 'alerta', nombre: `Línea de alerta (percentil ${r.linea_alerta})`, color: 3 },
  ]
  const filas: FilaSeries[] = visitas.map((x) => {
    const fila: FilaSeries = { x, alerta: r.linea_alerta }
    for (const [clave] of principales) fila[clave] = trayectoria.find((t) => t.momento_nombre === x && t.clave === clave)?.percentil ?? null
    return fila
  })
  const d = descripcionDe('riesgo_visita')
  return (
    <div className="space-y-4">
      <Panel titulo={perfil.titulo} descripcion={perfil.descripcion}>
        <ul className="flex flex-wrap gap-2" aria-label={perfil.titulo}>
          <li><Insignia tono="neutro">{r.perfil.eg_etiqueta ?? 'Edad gestacional sin clasificar'}</Insignia></li>
          <li><Insignia tono="neutro">{r.perfil.lubchenco_etiqueta ?? 'Lubchenco sin clasificar'}</Insignia></li>
          <li><Insignia tono="teal">Ejemplo de {num(r.n)} niños: {r.perfil_ejemplo}</Insignia></li>
        </ul>
        <p className="mt-2 text-sm text-salvia">{r.nota}</p>
      </Panel>
      {r.riesgos.length === 0 ? (
        <Vacio titulo="Sin riesgo que calcular">Con los datos de esta visita no hay un desenlace por predecir.</Vacio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {r.riesgos.map((x) => <TarjetaRiesgo key={x.clave} r={x} nota={x.momento_nombre} />)}
        </div>
      )}
      {filas.length > 0 && (
        <Grafica titulo={d.titulo} descripcion={d.descripcion}
          exportar={{ nombre: 'riesgo-nino-nuevo', filas: trayectoria.map((t) => ({ Desenlace: t.desenlace, Visita: t.momento_nombre, Riesgo: t.riesgo, Percentil: t.percentil })) }}>
          <LeyendaSeries series={series} />
          <LineasSeries filas={filas} series={series} etiqueta={d.titulo} formatoY={(v) => String(Math.round(v))} dominioY={[0, 100]} />
          <p className="mt-1 text-xs text-salvia">El eje es el <Termino id="percentil">percentil</Termino>: sobre la línea de alerta, el niño está entre el 10 % con más riesgo.</p>
        </Grafica>
      )}
    </div>
  )
}
