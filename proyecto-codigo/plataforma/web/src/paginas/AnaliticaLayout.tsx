// Analítica de los modelos: contexto de análisis (entrenamiento, modelo y versión, desenlace, evaluación) guardado en la
// URL y las fichas de los submódulos. En el teléfono el contexto se pliega en una tarjeta y las fichas se deslizan.
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useParams } from 'react-router'
import { useEntrenamientosAnalitica } from '../api/analitica'
import { Aviso, Cargando, Encabezado, Insignia, Selector } from '../components/ui'
import { cn } from '../lib/cn'
import { fechaHora } from '../lib/formato'
import { datosAl } from '../lib/lenguaje'
import { EnPrueba, ProveedorTecnico } from './analitica/comun'
import { useContextoAnalitica } from './analitica/contexto'
import { SUBMODULOS } from './analitica/submodulos'

function Contexto() {
  const { entrenamiento, desenlace, desenlaces, contexto, modelo, fijar } = useContextoAnalitica()
  const lista = useEntrenamientosAnalitica().data?.entrenamientos ?? []
  const elegido = desenlaces.find((d) => d.clave === desenlace)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Entrenamiento</span>
        <Selector value={entrenamiento ?? ''} onChange={(e) => fijar({ entrenamiento: Number(e.target.value) })}>
          {entrenamiento != null && !lista.some((m) => m.entrenamiento === entrenamiento) && <option value={entrenamiento}>Entrenamiento {entrenamiento}</option>}
          {lista.map((m) => (
            <option key={m.entrenamiento} value={m.entrenamiento}>
              Entrenamiento {m.entrenamiento}{m.creada ? ` · ${fechaHora(m.creada)}` : ''}
            </option>
          ))}
        </Selector>
      </label>
      <div className="text-sm">
        <span className="mb-1 block font-semibold">Modelo y versión</span>
        <p>{modelo?.modelo ?? '—'}{modelo?.version_registro != null ? ` · versión ${modelo.version_registro}` : ''}</p>
      </div>
      <div className="text-sm">
        <label className="block">
          <span className="mb-1 block font-semibold">Desenlace</span>
          <Selector value={desenlace ?? ''} disabled={!desenlaces.length} onChange={(e) => fijar({ desenlace: e.target.value })}>
            {desenlaces.map((d) => <option key={d.clave} value={d.clave}>{d.nombre ?? d.clave}{d.etiqueta === 'En prueba' ? ' (En prueba)' : ''}</option>)}
          </Selector>
        </label>
        {elegido?.etiqueta === 'En prueba' && <span className="mt-1 inline-block"><EnPrueba /></span>}
      </div>
      <div className="text-sm">
        <span className="mb-1 block font-semibold">Evaluación</span>
        <p>{modelo?.corte ? datosAl(modelo.corte) : '—'}</p>
        {modelo?.fuente && <p className="text-salvia">{modelo.fuente === 'simulado' ? 'Datos simulados' : 'Base de la Fundación'}</p>}
      </div>
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

  return (
    <ProveedorTecnico>
      <Encabezado titulo="Analítica de los modelos">
        Cómo se comporta el modelo: qué tan bien ordena a los niños, si su riesgo es fiable y si funciona igual para todos.
      </Encabezado>

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

      <nav aria-label="Submódulos de analítica" className="-mx-4 mb-4 sm:mx-0">
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
    </ProveedorTecnico>
  )
}
