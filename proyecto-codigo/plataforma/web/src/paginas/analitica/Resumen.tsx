// Modelos (S9): la puerta de entrada de lo técnico. De un entrenamiento, un desenlace y la visita desde la que se calcula, dice con
// qué datos y cómo se entrenó (Configuración), qué entrenamiento es (Trazabilidad), cómo le fue con niños que no vio
// (Evaluación en prueba), cómo se compara con una regla simple (Comparación técnica) y, al final, el semáforo de cada área con
// el enlace a su detalle. Todo sale de los artefactos que dejó el entrenamiento: no se calcula nada aquí.
import { useSubmodulo } from '../../api/analitica'
import type { DatosCalibracion, DatosRendimiento, DatosResumen } from '../../api/tipos'
import { ComparacionTecnica } from '../../components/modelos/ComparacionTecnica'
import { ConfiguracionModelo, TrazabilidadModelo } from '../../components/modelos/ConfiguracionYTrazabilidad'
import { corteDe, nombreSinCorte } from '../../components/modelos/desenlaces'
import { ErrorConReintento } from '../../components/ErrorConReintento'
import { EvaluacionEnPrueba } from '../../components/modelos/EvaluacionEnPrueba'
import { RevisionRapida } from '../../components/modelos/RevisionRapida'
import { Cargando } from '../../components/ui'
import { EstadoVacio, Guia, useNombreDesenlace } from './comun'
import { useContextoAnalitica } from './contexto'

export default function Resumen() {
  const { entrenamiento, desenlace, desenlaces, contexto } = useContextoAnalitica()
  const resumen = useSubmodulo<DatosResumen>(entrenamiento, 'resumen', desenlace)
  const rend = useSubmodulo<DatosRendimiento>(entrenamiento, 'rendimiento', desenlace)
  const cal = useSubmodulo<DatosCalibracion>(entrenamiento, 'calibracion', desenlace)
  const nombre = useNombreDesenlace()
  const elegido = desenlaces.find((d) => d.clave === desenlace)
  const consultas = [rend, cal, resumen]
  const fallida = consultas.find((c) => c.isError)
  const meta = rend.data?.meta ?? resumen.data?.meta
  const r = rend.data?.estado === 'ok' && desenlace ? rend.data.desenlaces?.[desenlace] : undefined
  const evaluacion = r && r.estado !== 'insuficiente' ? r : undefined
  const sinAnalitica = [rend.data, resumen.data].find((d) => d && d.estado !== 'ok')
  const cargando = entrenamiento != null && consultas.some((c) => c.isPending && c.fetchStatus !== 'idle')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Esta pantalla es la parte técnica de un modelo: con qué datos se entrenó, cuál entrenamiento es y qué tan bien funciona con niños que no vio al entrenar.</p>
        <p>Cada cifra trae una frase que dice qué mide. Cada gráfica dice su variable, su unidad, su momento, su población, cuántos datos válidos usa y su denominador.</p>
        <p>«En prueba» quiere decir que el modelo aún no está validado y no da alertas.</p>
      </Guia>

      {fallida?.error ? (
        <ErrorConReintento error={fallida.error} que="este análisis" reintentando={consultas.some((c) => c.isFetching)}
          reintentar={() => consultas.filter((c) => c.isError).forEach((c) => void c.refetch())} />
      ) : contexto?.estado === 'sin_artefactos' ? <EstadoVacio estado="sin_artefactos" />
        : sinAnalitica && sinAnalitica.estado !== 'ok' ? (
        <EstadoVacio estado={sinAnalitica.estado} mensaje={sinAnalitica.estado === 'pendiente' ? sinAnalitica.mensaje : undefined} />
      ) : cargando ? <Cargando /> : (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <ConfiguracionModelo meta={meta} />
            <TrazabilidadModelo meta={meta} />
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:min-w-0">
            {evaluacion ? (
              <EvaluacionEnPrueba rend={evaluacion} cal={cal.data?.estado === 'ok' && desenlace ? cal.data.desenlaces?.[desenlace] : undefined}
                desenlace={nombreSinCorte(elegido?.nombre ?? (desenlace ? nombre(desenlace).nombre : ''))}
                corte={elegido ? corteDe(elegido) : '—'} />
            ) : <p className="rounded-panel border border-linea/80 bg-papel p-4 text-sm shadow-suave">Este desenlace no tiene evaluación en prueba: hay muy pocos niños o falta una de las dos clases.</p>}
            {evaluacion && <ComparacionTecnica rend={evaluacion} />}
          </div>
          <RevisionRapida semaforos={(resumen.data?.estado === 'ok' && desenlace ? resumen.data.desenlaces?.[desenlace]?.semaforos : undefined) ?? []} />
        </>
      )}
    </div>
  )
}
