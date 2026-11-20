// Comparar grupos: dos grupos de niños, A y B, cada uno con su nombre, criterios, período y tamaño, y una pestaña por
// pregunta clínica (¿crecen distinto?, ¿les pasa algo distinto?, ¿faltan datos distintos?). El grupo A es el grupo activo
// (vive en la dirección); el B lo elige la persona y se conserva en la página, así que una falla de red no lo pierde: el
// reintento pide exactamente los mismos dos grupos. El rendimiento del modelo no se compara aquí sino en Modelos.
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ErrorApi } from '../../api/cliente'
import { useComparaGruposClinico, type GruposClinicoOk } from '../../api/comparar'
import { useFiltros } from '../../lib/useFiltros'
import { DesenlaceObservado } from '../comparar/DesenlaceObservado'
import { FaltantesPorVisita } from '../comparar/FaltantesPorVisita'
import { estadoDe, grupoVacio, restoDe, useGrupoLocal } from '../comparar/grupoLocal'
import { LadoComparado } from '../comparar/LadoComparado'
import { ID_PANEL, idPestana, preguntaDe, Preguntas, type Pregunta } from '../comparar/Preguntas'
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

function Respuesta({ r, pregunta }: { r: GruposClinicoOk; pregunta: Pregunta }) {
  const talla = r.desenlaces.find((d) => d.clave === DESENLACE_DE_TALLA)
  if (pregunta === 'faltan') return <FaltantesPorVisita r={r} />
  if (pregunta === 'pasa') {
    return r.desenlaces.length === 0
      ? <Vacio titulo="Sin desenlaces a los 12 meses">La corrida activa no trae lo observado a los 12 meses de ningún desenlace.</Vacio>
      : <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">{r.desenlaces.map((d) => <DesenlaceObservado key={d.clave} d={d} r={r} conRiesgo />)}</div>
  }
  return (
    <div className="flex flex-col gap-4">
      {talla ? <DesenlaceObservado d={talla} r={r} conRiesgo={false} />
        : <Aviso tono="teal">La corrida activa no trae la talla baja a los 12 meses observada; abajo se ve la talla por visita.</Aviso>}
      <TallaPorVisita r={r} />
    </div>
  )
}

export default function CompararGrupos() {
  const a = useFiltros()
  const b = useGrupoLocal()
  const [params, setParams] = useSearchParams()
  const [editando, setEditando] = useState<'a' | 'b' | null>(null)
  const pregunta = preguntaDe(params.get('pregunta'))
  const consulta = useComparaGruposClinico(b.elegido ? { a: cuerpoDeFiltros(a), b: cuerpoDeFiltros(b.filtros) } : null)
  const r = consulta.data

  const elegirPregunta = (p: Pregunta) => setParams((previo) => {
    const nuevo = new URLSearchParams(previo)
    nuevo.set('pregunta', p)
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
    <div className="flex flex-col gap-4">
      <Encabezado titulo="Comparar grupos"
        accion={<Boton variante="secundario" onClick={intercambiar} disabled={!b.elegido}>Intercambiar A y B</Boton>}>
        Elija dos grupos de niños y vea en qué se parecen y en qué se diferencian.
      </Encabezado>
      <div className="grid items-start gap-3 md:grid-cols-2">
        <LadoComparado serie={SERIE_A} filtros={a} elegido resumen={resumen('a')} contando={consulta.isFetching} error={consulta.isError}
          abierto={editando === 'a'} alternar={() => alternar('a')} nota="El grupo A es el grupo activo: si lo cambia, también cambia en la Vista clínica." />
        <LadoComparado serie={SERIE_B} filtros={b.filtros} elegido={b.elegido} resumen={resumen('b')} contando={consulta.isFetching}
          error={consulta.isError} abierto={editando === 'b'} alternar={() => alternar('b')} />
      </div>
      {!b.elegido ? (
        <Vacio titulo="Elija el grupo B para comparar">
          <p>Use «Elegir grupo B» para definir sus criterios, o compare el grupo A con todos los niños.</p>
          <Boton variante="secundario" className="mt-3" onClick={() => b.poner(grupoVacio)}>Comparar con todos los niños</Boton>
        </Vacio>
      ) : consulta.isError ? <Falla error={consulta.error} reintentar={() => void consulta.refetch()} reintentando={consulta.isFetching} />
        : !r ? <Cargando texto="Comparando los grupos…" />
          : r.estado === 'insuficiente' ? (
            <Aviso tono="teal">
              <strong>{r.mensaje}</strong> Grupo A: {ninos(r.a.n)} niños. Grupo B: {ninos(r.b.n)} niños.
            </Aviso>
          ) : (
            <>
              <Preguntas activa={pregunta} elegir={elegirPregunta} />
              <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestana(pregunta)} aria-busy={consulta.isPlaceholderData}
                className={consulta.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
                <Respuesta r={r} pregunta={pregunta} />
              </div>
            </>
          )}
    </div>
  )
}
