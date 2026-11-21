// Comparar grupos: dos grupos de niños, A y B, cada uno con su nombre, criterios, período y tamaño, y una pestaña por
// pregunta clínica (¿crecen distinto?, ¿les pasa algo distinto?, ¿faltan datos distintos?). El grupo A es el grupo activo
// (vive en la dirección); el B lo elige la persona y se conserva en la página, así que una falla de red no lo pierde: el
// reintento pide exactamente los mismos dos grupos. Dos grupos con los mismos criterios no se comparan (darían A = B). El
// rendimiento del modelo es técnico y no se enlaza desde aquí: lo clínico y lo técnico van aparte.
import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ErrorApi } from '../../api/cliente'
import { useComparaGruposClinico, type GruposClinicoOk } from '../../api/comparar'
import { cn } from '../../lib/cn'
import { useFiltros } from '../../lib/useFiltros'
import { AmbasVistas, DesenlaceObservado, ElegirVista, vistaDe, type Vista } from '../comparar/DesenlaceObservado'
import { FaltantesPorVisita } from '../comparar/FaltantesPorVisita'
import { estadoDe, grupoVacio, restoDe, useGrupoLocal } from '../comparar/grupoLocal'
import { LadoComparado } from '../comparar/LadoComparado'
import { usePantallaAlta } from '../comparar/pantalla'
import { PREFIJO_PREGUNTA, preguntaDe, Preguntas, type Pregunta } from '../comparar/Preguntas'
import { PanelPestana } from '../ui/Pestanas'
import { SERIE_A, SERIE_B, ninos } from '../comparar/comun'
import { TallaPorVisita } from '../comparar/TallaPorVisita'
import { cuerpoDeFiltros } from '../GrupoActivo'
import { Aviso, Boton, Cargando, Encabezado, Vacio } from '../ui'
import { ErrorConReintento } from '../ErrorConReintento'

const DESENLACE_DE_TALLA = 'talla_baja_12m'

function Falla({ error, reintentar, reintentando }: { error: Error; reintentar: () => void; reintentando: boolean }) {
  if (error instanceof ErrorApi && error.estado === 404) {
    return <Vacio titulo="Todavía no hay resultados">Cuando se procesen los datos podrá comparar aquí a los niños de dos grupos.</Vacio>
  }
  return <ErrorConReintento error={error} que="la comparación" conserva="Los grupos elegidos siguen aquí: al reintentar se pide la misma comparación." reintentar={reintentar} reintentando={reintentando} />
}

function Respuesta({ r, pregunta, vista, elegirVista }: {
  r: GruposClinicoOk; pregunta: Pregunta; vista: Vista; elegirVista: (v: Vista) => void
}) {
  const talla = r.desenlaces.find((d) => d.clave === DESENLACE_DE_TALLA)
  // En una pantalla alta (1920×1080) hay sitio para lo que en un portátil se alterna: se usa en lugar de dejarlo vacío.
  const alta = usePantallaAlta()
  if (pregunta === 'faltan') return <FaltantesPorVisita r={r} alta={alta} />
  if (pregunta === 'pasa') {
    return r.desenlaces.length === 0
      ? <Vacio titulo="Sin desenlaces a los 12 meses">La corrida activa no trae lo observado a los 12 meses de ningún desenlace.</Vacio>
      : (
        <div className="flex flex-col gap-3">
          {alta ? <AmbasVistas alerta={r.alerta_percentil} /> : <ElegirVista vista={vista} elegir={elegirVista} alerta={r.alerta_percentil} />}
          <div className="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            {r.desenlaces.map((d) => <DesenlaceObservado key={d.clave} d={d} r={r} vista={alta ? 'ambas' : vista} />)}
          </div>
        </div>
      )
  }
  // En escritorio ancho lo observado a los 12 meses y la talla visita por visita van lado a lado; la gráfica se lleva el
  // lado ancho para que se lean sus cuatro visitas y los niños con dato de cada una. En una pantalla alta van una debajo
  // de la otra, a todo lo ancho, y la gráfica crece con la altura que queda.
  return (
    <div className={cn('grid items-start gap-4 [&>*]:min-w-0', !alta && 'xl:grid-cols-[minmax(0,4fr)_minmax(0,5fr)]')}>
      {talla ? <DesenlaceObservado d={talla} r={r} ancho={alta} />
        : <Aviso tono="teal">La corrida activa no trae la talla baja a los 12 meses observada; se ve la talla por visita.</Aviso>}
      <TallaPorVisita r={r} alta={alta} />
    </div>
  )
}

export default function CompararGrupos() {
  const a = useFiltros()
  const b = useGrupoLocal()
  const [params, setParams] = useSearchParams()
  const [editando, setEditando] = useState<'a' | 'b' | null>(null)
  const pregunta = preguntaDe(params.get('pregunta'))
  const vista = vistaDe(params.get('vista'))
  // Sin B elegido, B son todos los niños: si A tampoco tiene criterios, compararlos daría A = B. Lo mismo si A y B
  // terminan con los mismos criterios: no se pide nada y no se muestran cifras de una consulta anterior.
  const mismos = JSON.stringify(cuerpoDeFiltros(a)) === JSON.stringify(cuerpoDeFiltros(b.filtros))
  const consulta = useComparaGruposClinico(b.elegido && !mismos ? { a: cuerpoDeFiltros(a), b: cuerpoDeFiltros(b.filtros) } : null)
  const r = mismos ? undefined : consulta.data
  const contando = !mismos && consulta.isFetching
  const fallo = !mismos && consulta.isError

  const ponerParam = (clave: string, valor: string) => setParams((previo) => {
    const nuevo = new URLSearchParams(previo)
    nuevo.set(clave, valor)
    return nuevo
  }, { replace: true })
  const alternar = (lado: 'a' | 'b') => setEditando(editando === lado ? null : lado)

  /** B pasa a ser el grupo activo (la dirección) y A, el grupo B: cada lado se lleva sus propios criterios. */
  const intercambiar = () => {
    if (!b.estado) return
    const antes = estadoDe(a)
    a.ponerTodas(b.estado.entradas, b.estado.guardada, restoDe(b.estado))
    b.poner(antes)
    setEditando(null)
  }

  const ok = r?.estado === 'ok' ? r : undefined
  const resumen = (lado: 'a' | 'b') => (r ? { n: r[lado].n, ...(ok ? { n_total: ok[lado].n_total } : {}) } : undefined)

  return (
    <div className="flex flex-col gap-3">
      <Encabezado titulo="Comparar grupos">
        Elija dos grupos de niños y vea en qué se parecen y en qué se diferencian.
      </Encabezado>
      <div className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <LadoComparado serie={SERIE_A} filtros={a} elegido resumen={resumen('a')} contando={contando} error={fallo}
          abierto={editando === 'a'} alternar={() => alternar('a')} nota="El grupo A es el grupo activo: si lo cambia, también cambia en la Vista clínica." />
        {/* Intercambiar es secundario: un botón con icono entre los dos grupos, con su nombre para lectores de pantalla. */}
        <button type="button" onClick={intercambiar} disabled={!b.elegido} aria-label="Intercambiar A y B" title="Intercambiar A y B"
          className="grid size-9 place-items-center justify-self-center rounded-full border border-linea bg-papel text-teal shadow-suave transition-colors hover:border-teal/40 disabled:cursor-not-allowed disabled:opacity-40 md:mt-5">
          <ArrowLeftRight aria-hidden className="size-4 rotate-90 md:rotate-0" />
        </button>
        <LadoComparado serie={SERIE_B} filtros={b.filtros} elegido={b.elegido} resumen={resumen('b')} contando={contando}
          error={fallo} abierto={editando === 'b'} alternar={() => alternar('b')} />
      </div>
      {!b.elegido ? (
        <Vacio titulo="Elija el grupo B para comparar">
          {mismos ? (
            <>
              <p>El grupo A ya son todos los niños: compararlo con todos daría dos grupos iguales. Elija los criterios del grupo B.</p>
              <Boton variante="secundario" className="mt-3" onClick={() => setEditando('b')}>Elegir los criterios del grupo B</Boton>
            </>
          ) : (
            <>
              <p>Use «Elegir grupo B» para definir sus criterios, o compare el grupo A con todos los niños.</p>
              <Boton variante="secundario" className="mt-3" onClick={() => b.poner(grupoVacio)}>Comparar con todos los niños</Boton>
            </>
          )}
        </Vacio>
      ) : mismos ? (
        <Aviso tono="teal">Los grupos A y B tienen los mismos criterios: cambie uno de los dos para compararlos.</Aviso>
      ) : consulta.isError ? <Falla error={consulta.error} reintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
        : !r ? <Cargando texto="Comparando los grupos…" />
          : r.estado === 'insuficiente' ? (
            <Aviso tono="teal">
              <strong>{r.mensaje}</strong> Grupo A: {ninos(r.a.n)} niños. Grupo B: {ninos(r.b.n)} niños.
            </Aviso>
          ) : (
            <>
              <Preguntas activa={pregunta} elegir={(p) => ponerParam('pregunta', p)} />
              <PanelPestana prefijo={PREFIJO_PREGUNTA} activa={pregunta} ocupado={consulta.isPlaceholderData}
                className={consulta.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
                <Respuesta r={r} pregunta={pregunta} vista={vista} elegirVista={(v) => ponerParam('vista', v)} />
              </PanelPestana>
            </>
          )}
    </div>
  )
}
