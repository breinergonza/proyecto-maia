// Analítica de los modelos: encabezado con el submódulo y su pregunta, contexto de análisis (entrenamiento, modelo y
// versión, desenlace, evaluación) guardado en la URL y, solo en el teléfono, las fichas de los submódulos (en el
// computador ya están en el menú lateral). En el teléfono el contexto se pliega en una tarjeta.
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router'
import { useEntrenamientosAnalitica } from '../api/analitica'
import { Aviso, Cargando, Insignia, Selector } from '../components/ui'
import { cn } from '../lib/cn'
import { fechaHora } from '../lib/formato'
import { datosAl } from '../lib/lenguaje'
import { EnPrueba, InterruptorTecnico, ProveedorTecnico, RanuraGuia } from './analitica/comun'
import { useContextoAnalitica } from './analitica/contexto'
import { SUBMODULOS } from './analitica/submodulos'

const NOMBRE_MODELO: Record<string, string> = { clinico: 'Clínico', anomalias: 'Anomalías', crecimiento: 'Crecimiento' }

function Contexto() {
  const { entrenamiento, desenlace, desenlaces, contexto, modelo, fijar } = useContextoAnalitica()
  const lista = useEntrenamientosAnalitica().data?.entrenamientos ?? []
  const elegido = desenlaces.find((d) => d.clave === desenlace)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Entrenamiento</span>
        <Selector value={entrenamiento ?? ''} onChange={(e) => fijar({ entrenamiento: Number(e.target.value) })}>
          {entrenamiento != null && !lista.some((m) => m.entrenamiento === entrenamiento) && <option value={entrenamiento}>Entrenamiento {entrenamiento}</option>}
          {lista.map((m) => (
            <option key={m.entrenamiento} value={m.entrenamiento}>
              N.º {m.entrenamiento}{m.creada ? ` · ${fechaHora(m.creada)}` : ''}
            </option>
          ))}
        </Selector>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Modelo y versión</span>
        <Selector value="0" disabled={(contexto?.modelos.length ?? 0) < 2} onChange={() => {}}>
          {(contexto?.modelos.length ? contexto.modelos : [null]).map((m, i) => (
            <option key={i} value={String(i)}>
              {m?.modelo ? (NOMBRE_MODELO[m.modelo] ?? `${m.modelo.charAt(0).toUpperCase()}${m.modelo.slice(1)}`) : '—'}{m?.version_registro != null ? ` · versión ${m.version_registro}` : ''}
            </option>
          ))}
        </Selector>
      </label>
      <div className="text-sm">
        <label className="block">
          <span className="mb-1 block font-semibold">Desenlace</span>
          <Selector value={desenlace ?? ''} disabled={!desenlaces.length} onChange={(e) => fijar({ desenlace: e.target.value })}>
            {desenlaces.map((d) => <option key={d.clave} value={d.clave}>{d.nombre ?? d.clave}{d.etiqueta === 'En prueba' ? ' (En prueba)' : ''}</option>)}
          </Selector>
        </label>
        {elegido?.etiqueta === 'En prueba' && <span className="mt-1 inline-block"><EnPrueba /></span>}
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Evaluación</span>
        <Selector value="0" disabled onChange={() => {}}>
          <option value="0">Validación temporal</option>
        </Selector>
      </label>
      <p className="flex flex-wrap items-center gap-2 text-xs text-salvia sm:col-span-2 lg:col-span-4">
        {modelo?.corte && <span className="rounded-full bg-teal-tinte px-2.5 py-1 font-semibold text-teal">{datosAl(modelo.corte)}</span>}
        {modelo?.fuente && <span className="rounded-full bg-teal-tinte px-2.5 py-1 font-semibold text-teal">{modelo.fuente === 'simulado' ? 'Datos simulados' : 'Base de la Fundación'}</span>}
        <span>El contexto vive en el enlace y se conserva al cambiar de submódulo.</span>
      </p>
      {contexto?.estado === 'sin_artefactos' && entrenamiento != null && (
        <p className="sm:col-span-2 lg:col-span-4"><Insignia tono="ocre">Sin analítica</Insignia></p>
      )}
    </div>
  )
}

export default function AnaliticaLayout() {
  const { submodulo } = useParams()
  const { consulta, search, entrenamiento, desenlace, desenlaces, contexto } = useContextoAnalitica()
  const [plegado, setPlegado] = useState(true)
  const estados = new Map((contexto?.submodulos ?? []).map((s) => [s.id, s.estado]))
  const elegido = desenlaces.find((d) => d.clave === desenlace)
  const actual = SUBMODULOS.find((s) => s.id === submodulo)
  const [ranura, setRanura] = useState<HTMLElement | null>(null)

  return (
    <ProveedorTecnico>
      <RanuraGuia.Provider value={ranura}>
      <header className="mb-4 flex animate-aparecer flex-wrap items-end justify-between gap-3 lg:mb-3">
        <div className="max-w-[110ch]">
          <p className="text-sm font-semibold text-teal-medio">Analítica ›</p>
          <h1>{actual?.titulo ?? 'Analítica de los modelos'}</h1>
          <p className="mt-1 text-sm text-salvia">{actual?.pregunta ?? 'Cómo se comporta el modelo: qué tan bien ordena, si su riesgo es fiable y si funciona igual para todos.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div ref={setRanura} />
          <InterruptorTecnico />
        </div>
      </header>

      <section aria-label="Contexto de análisis" className="mb-4 rounded-panel border border-linea/80 bg-papel p-4 shadow-suave">
        <button type="button" className="flex w-full items-center justify-between gap-2 text-left lg:hidden" aria-expanded={!plegado}
          aria-controls="contexto-analisis" onClick={() => setPlegado(!plegado)}>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Contexto de análisis</span>
            <span className="block truncate text-xs text-salvia">
              {entrenamiento != null ? `Entrenamiento ${entrenamiento}` : 'Sin entrenamiento'}{elegido ? ` · ${elegido.nombre ?? elegido.clave}` : ''}
              {elegido?.etiqueta === 'En prueba' ? ' · En prueba' : ''}
            </span>
          </span>
          <ChevronDown size={18} aria-hidden className={cn('shrink-0 transition-transform', !plegado && 'rotate-180')} />
        </button>
        <div id="contexto-analisis" className={cn('mt-3 lg:mt-0', plegado && 'hidden lg:block')}>
          {consulta.isPending ? <Cargando /> : consulta.isError ? <Aviso>No se pudo cargar el contexto de análisis.</Aviso> : <Contexto />}
        </div>
      </section>

      <nav aria-label="Submódulos de analítica" className="-mx-4 mb-4 sm:mx-0 lg:hidden">
        <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:px-0">
          {SUBMODULOS.map((s) => (
            <li key={s.id} className="snap-start">
              <NavLink to={{ pathname: `/analitica/${s.id}`, search }} aria-current={submodulo === s.id ? 'page' : undefined}
                className={cn('flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm transition-colors',
                  submodulo === s.id ? 'border-teal bg-teal-tinte font-semibold text-teal' : 'border-linea bg-papel text-tinta/75 hover:bg-fondo')}>
                {s.texto}
                {estados.get(s.id) === 'pendiente' && <span className="text-xs text-salvia">· pronto</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
      </RanuraGuia.Provider>
    </ProveedorTecnico>
  )
}
