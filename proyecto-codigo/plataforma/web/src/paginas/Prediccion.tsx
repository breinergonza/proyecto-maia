// Predicción: el riesgo de una muestra, de todo el universo o de un niño nuevo, con el modelo que se elija. Nada se guarda por
// niño: lo que se ve existe solo en esta pantalla. Los filtros de la muestra son las muestras guardadas en Explorar; el CSV por
// niño es solo de administración.
import { Download } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useMuestras } from '../api/exploracion'
import { pedirCsvPrediccion, useBibliotecaEjemplos, useEjemplo, useModelosPrediccion, usePredecirMuestra, usePredecirNino } from '../api/prediccion'
import type {
  CampoEjemplo, CuerpoPrediccionMuestra, FilaPrediccion, PrediccionMuestra, PrediccionNino, RespuestaPrediccionMuestra,
} from '../api/tipos'
import { puede, useSesion } from '../auth/sesion'
import { TarjetaRiesgo } from '../components/ficha'
import { Grafica, TablaDatos } from '../components/grafica'
import { LeyendaSeries, LineasSeries, type FilaSeries, type Serie } from '../components/graficos'
import { Aviso, Boton, Campo, Cargando, Cifra, Encabezado, Entrada, Insignia, Panel, Selector, Tabla, Vacio } from '../components/ui'
import { cn } from '../lib/cn'
import { descripcionDe } from '../lib/descripciones'
import { descargar, nombreArchivo } from '../lib/exportar'
import { num, riesgo as formatoRiesgo } from '../lib/formato'
import { cuantosMenos, nivelAlto } from '../lib/lenguaje'

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
      <Encabezado titulo="Predicción">
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
      {modo === 'nino' ? <NinoNuevo modelo={modelo} key={`n${modelo}`} /> : <Grupo universo={modo === 'universo'} modelo={modelo} key={`${modo}${modelo}`} />}
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

function Grupo({ universo, modelo }: { universo: boolean; modelo: string }) {
  const { usuario } = useSesion()
  const admin = puede(usuario, ['admin'])
  const muestras = useMuestras(!universo)
  const biblioteca = useBibliotecaEjemplos(modelo || null)
  const [muestraId, setMuestraId] = useState('')
  const [visita, setVisita] = useState('')
  const [excluir, setExcluir] = useState(false)
  const predecir = usePredecirMuestra()
  const cuerpo: CuerpoPrediccionMuestra = {
    modelo: modelo || null, muestra_id: !universo && muestraId ? Number(muestraId) : null, excluir_entrenamiento: excluir,
    visita: visita || null,
  }
  const lista = muestras.data ?? []
  return (
    <div className="space-y-4">
      <Panel titulo={universo ? 'Todo el universo' : 'Muestra'}
        descripcion={universo ? 'Todos los niños del corte vigente, con la visita que elija.' : 'Los niños de una muestra guardada en Explorar.'}>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); predecir.mutate(cuerpo) }}>
          {!universo && (
            <Campo etiqueta="Muestra guardada" id="muestra-prediccion"
              ayuda={!muestras.isPending && !lista.length ? 'Todavía no hay muestras guardadas: arme una en Explorar.' : undefined}>
              <Selector id="muestra-prediccion" value={muestraId} onChange={(e) => setMuestraId(e.target.value)}>
                <option value="">Elija una muestra</option>
                {lista.map((m) => <option key={m.id} value={m.id}>{m.titulo} · {num(m.n_ninos)} niños</option>)}
              </Selector>
            </Campo>
          )}
          <Campo etiqueta="Visita" id="visita-prediccion">
            <Selector id="visita-prediccion" value={visita} onChange={(e) => setVisita(e.target.value)}>
              <option value="">La última a la que fue cada niño</option>
              {(biblioteca.data?.visitas ?? []).map((v) => <option key={v.etapa} value={v.etapa}>{v.nombre}</option>)}
            </Selector>
          </Campo>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={excluir} onChange={(e) => setExcluir(e.target.checked)} />
            Dejar fuera a los niños con que se entrenó el modelo
          </label>
          <div className="sm:col-span-2">
            <Boton type="submit" disabled={predecir.isPending || (!universo && !muestraId)}>
              {predecir.isPending ? 'Calculando…' : 'Calcular el riesgo'}
            </Boton>
          </div>
        </form>
      </Panel>
      {predecir.isError && <Aviso>{predecir.error.message}</Aviso>}
      {predecir.isPending && <Cargando texto="Calculando el riesgo de los niños…" />}
      {predecir.data && !predecir.isPending && <Resultado r={predecir.data} admin={admin} cuerpo={cuerpo} />}
    </div>
  )
}

function Resultado({ r, admin, cuerpo }: { r: RespuestaPrediccionMuestra; admin: boolean; cuerpo: CuerpoPrediccionMuestra }) {
  if (r.insuficiente) {
    return (
      <Aviso tono="teal">
        <strong>Muy pocos niños.</strong> {r.mensaje} Elija un grupo más grande.
      </Aviso>
    )
  }
  return <ResultadoMuestra r={r} admin={admin} cuerpo={cuerpo} />
}

function ResultadoMuestra({ r, admin, cuerpo }: { r: PrediccionMuestra; admin: boolean; cuerpo: CuerpoPrediccionMuestra }) {
  const a = r.agregados
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
      {r.fuga_no_verificable && cuerpo.excluir_entrenamiento && (
        <Aviso tono="coral">Este modelo no trae la lista de niños con que se entrenó: no se pudieron dejar fuera.</Aviso>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Cifra valor={num(a.n_puntuados)} texto="niños con el riesgo calculado" />
        <Cifra valor={num(a.niveles.muy_alto)} texto={`con riesgo muy alto (percentil ${a.niveles.percentil_muy_alto} o más)`} tono="coral" />
        <Cifra valor={num(a.niveles.alto)} texto={`con riesgo alto (percentil ${a.niveles.percentil_alto} a ${a.niveles.percentil_muy_alto})`} tono="coral" />
      </div>
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
        <p className="mt-1 text-xs text-salvia">Cada barra es un tramo de 10 puntos de percentil; en coral, el riesgo alto.</p>
      </Grafica>
      <TablaDatos titulo={descripcionDe('riesgo_por_desenlace').titulo} descripcion={descripcionDe('riesgo_por_desenlace').descripcion}
        exportar={{ nombre: 'riesgo-por-desenlace', filas: a.por_desenlace.map((d) => ({ Desenlace: d.desenlace, Visita: d.momento_nombre, Niños: d.n, 'Riesgo mediano': d.riesgo_mediano, Altos: d.altos, 'Muy altos': d.muy_altos })) }}>
        <Tabla apilar>
          <thead><tr><th>Desenlace</th><th>Visita</th><th className="text-right">Niños</th><th className="text-right">Riesgo mediano</th><th className="text-right">Riesgo alto</th></tr></thead>
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
      <TablaNinos r={r} accion={admin && (
        <Boton variante="secundario" chico onClick={bajar} disabled={bajando}>
          <Download aria-hidden className="size-4" /> Exportar CSV
        </Boton>
      )} />
      {error && <Aviso>{error}</Aviso>}
    </div>
  )
}

function TablaNinos({ r, accion }: { r: PrediccionMuestra; accion?: ReactNode }) {
  const d = descripcionDe('riesgo_calculado')
  const filas = r.tabla.filas
  return (
    <TablaDatos titulo="Niños con más riesgo" accion={accion}
      descripcion={`${d.descripcion} Se muestran los ${num(filas.length)} de mayor riesgo, de ${num(r.tabla.total)} niños.`}>
      <Tabla apilar>
        <thead>
          <tr><th>Niño</th><th>Desenlace</th><th className="text-right">Riesgo</th><th>Frente a los demás</th><th>Perfil</th><th>Primera alerta</th><th>Motivos</th></tr>
        </thead>
        <tbody>
          {filas.map((f) => <FilaNino key={`${f.sujeto}-${f.clave}`} f={f} />)}
        </tbody>
      </Tabla>
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
      <Panel titulo="Biblioteca de niños de ejemplo"
        descripcion="Elija una visita y un perfil: el ejemplo trae el valor típico de los niños de ese grupo en cada dato.">
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Perfil">
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
    </div>
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <p className="mt-1 text-xs text-salvia">El eje es el percentil: sobre la línea de alerta, el niño está entre el 10 % con más riesgo.</p>
        </Grafica>
      )}
    </div>
  )
}
