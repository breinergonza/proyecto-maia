// Modelos (S9): la puerta de entrada de lo técnico. De un entrenamiento, un desenlace y la visita desde la que se calcula, en tres
// pestañas: «Resultados de validación» (Evaluación en prueba con niños que no vio, Comparación técnica con una regla simple y el semáforo de
// cada área con el enlace a su detalle), «Aciertos y calibración» (la matriz de la alerta y la calibración de esa evaluación) y,
// al final, «Datos y configuración del entrenamiento» (Configuración, Trazabilidad e hiperparámetros: lo solo técnico, S22). Todo sale de los artefactos que dejó el
// entrenamiento: no se calcula nada aquí.
import { useSubmodulo } from '../../api/analitica'
import type { DatosCalibracion, DatosRendimiento, DatosResumen } from '../../api/tipos'
import { ComparacionTecnica } from '../../components/modelos/ComparacionTecnica'
import { ConfiguracionModelo, HiperparametrosModelo, TrazabilidadModelo } from '../../components/modelos/ConfiguracionYTrazabilidad'
import { corteDe, nombreSinCorte } from '../../components/modelos/desenlaces'
import { ErrorConReintento } from '../../components/ErrorConReintento'
import { EvaluacionAciertos, EvaluacionCalibracion, EvaluacionMetricas } from '../../components/modelos/EvaluacionEnPrueba'
import { RevisionRapida } from '../../components/modelos/RevisionRapida'
import { Cargando } from '../../components/ui'
import { cn } from '../../lib/cn'
import type { Pestana } from '../../components/ui/Pestanas'
import { ConPestanas, EstadoVacio, Guia, useNombreDesenlace } from './comun'
import { useContextoAnalitica } from './contexto'

type Ver = 'entrenamiento' | 'evaluacion' | 'graficas'

const SIN_EVALUACION = (
  <p className="rounded-panel border border-linea/80 bg-papel p-4 text-sm shadow-suave">Este desenlace no tiene evaluación en prueba: hay muy pocos niños o falta una de las dos clases.</p>
)

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
  const conReferencia = evaluacion?.referencia?.auc_desenlace.auc != null && evaluacion.auc_desenlace.auc != null
  // primero lo que le importa a quien decide (cómo le fue) y al final lo solo técnico (cómo se entrenó, S22)
  const pestanas: Pestana<Ver>[] = [
    { clave: 'evaluacion', texto: 'Resultados de validación' },
    ...(evaluacion ? [{ clave: 'graficas', texto: 'Aciertos y calibración' } satisfies Pestana<Ver>] : []),
    { clave: 'entrenamiento', texto: 'Datos y configuración del entrenamiento' },
  ]
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
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
        <ConPestanas etiqueta="Qué ver del modelo" pestanas={pestanas}>
          {(ver) => {
            const evaluar = evaluacion && {
              rend: evaluacion, cal: cal.data?.estado === 'ok' && desenlace ? cal.data.desenlaces?.[desenlace] : undefined,
              desenlace: nombreSinCorte(elegido?.nombre ?? (desenlace ? nombre(desenlace).nombre : '')), corte: elegido ? corteDe(elegido) : '—',
            }
            if (ver === 'entrenamiento') {
              return (
                <div className="grid gap-4 [&>*]:min-w-0">
                  <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
                    <ConfiguracionModelo meta={meta} />
                    <TrazabilidadModelo meta={meta} />
                  </div>
                  <HiperparametrosModelo meta={meta} />
                </div>
              )
            }
            if (ver === 'evaluacion') {
              const semaforos = (resumen.data?.estado === 'ok' && desenlace ? resumen.data.desenlaces?.[desenlace]?.semaforos : undefined) ?? []
              return (
                <div className={cn('grid gap-4 xl:grid-cols-2 [&>*]:min-w-0', !conReferencia && 'xl:items-start')}>
                  {evaluar ? <EvaluacionMetricas {...evaluar} /> : SIN_EVALUACION}
                  <div className="flex flex-col gap-4 [&>*]:min-w-0">
                    {evaluacion && <ComparacionTecnica rend={evaluacion} />}
                    <RevisionRapida semaforos={semaforos} />
                  </div>
                </div>
              )
            }
            return evaluar && (
              <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
                <EvaluacionAciertos {...evaluar} />
                <EvaluacionCalibracion {...evaluar} />
              </div>
            )
          }}
        </ConPestanas>
      )}
    </div>
  )
}
