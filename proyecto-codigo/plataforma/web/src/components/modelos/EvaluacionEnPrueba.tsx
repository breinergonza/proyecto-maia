// «Evaluación en prueba»: cómo le fue al modelo con niños que no vio al entrenar (los nacidos más recientemente). Se reparte en
// tres tarjetas que Resumen pone en dos pestañas: el tamaño del conjunto, la frecuencia del desenlace y las cinco métricas con
// una frase que dice qué mide cada una (`EvaluacionMetricas`); la matriz de aciertos y errores con el punto de alerta de la
// aplicación, el 10 % de niños con más riesgo (`EvaluacionAciertos`); y la calibración con su diagonal (`EvaluacionCalibracion`).
import type { DatosCalibracion, DatosRendimiento } from '../../api/tipos'
import { dec2, num, pct } from '../../lib/formato'
import { CurvaXY } from '../graficos/xy'
import { MatrizAlerta, pctN } from '../../paginas/analitica/comun'
import { Panel } from '../ui'
import { NotaGrafica } from './NotaGrafica'

/** El punto de alerta de la aplicación: el 10 % de niños con más riesgo (percentil 90 o más). */
export const TOP_ALERTA = 10

/** F1: la media armónica de sensibilidad y precisión (en porcentaje); sin alguna de las dos no hay F1. */
export function f1De(sensibilidad: number | null | undefined, precision: number | null | undefined): number | null {
  if (sensibilidad == null || precision == null || sensibilidad + precision === 0) return null
  return (2 * sensibilidad * precision) / (sensibilidad + precision) / 100
}

function Metrica({ nombre, valor, detalle, explicacion }: { nombre: string; valor: string; detalle?: string; explicacion: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-baseline gap-x-4 border-t border-linea/70 py-2 first:border-t-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
      <div>
        <dt className="text-sm font-semibold">{nombre}</dt>
        <dd className="text-2xl font-bold leading-tight tabular-nums text-teal">{valor}</dd>
        {detalle && <dd className="text-xs tabular-nums">{detalle}</dd>}
      </div>
      <p className="text-sm">{explicacion}</p>
    </div>
  )
}

interface Props {
  rend: DatosRendimiento
  cal: DatosCalibracion | undefined
  /** Nombre del desenlace, sin la visita desde la que se calcula. */
  desenlace: string
  corte: string
}

/** Lo que comparten las tres tarjetas: la población de prueba, el momento y los grupos de la calibración. */
function derivar({ rend, cal, desenlace, corte }: Props) {
  const { auc_desenlace: auc } = rend
  // un punto por grupo de niños con riesgo parecido: riesgo que dijo el modelo y lo que ocurrió, y cuántos niños tiene el grupo
  const puntos: [number, number][] = []
  const tamanos: number[] = []
  for (const b of cal?.bins ?? []) {
    if (b.riesgo_medio == null || b.observado == null) continue
    puntos.push([b.riesgo_medio, b.observado])
    tamanos.push(b.n)
  }
  return {
    auc, puntos, tamanos, desenlace,
    tope: Math.min(1, Math.ceil(10 * Math.max(0.1, ...puntos.flat())) / 10),
    poblacion: `${num(auc.n)} niños del conjunto de prueba${auc.casos != null ? `, ${num(auc.casos)} con el desenlace` : ''}`,
    momento: `Riesgo calculado a ${corte}; desenlace observado a los 12 meses`,
  }
}

export function EvaluacionMetricas({ rend, cal, desenlace, corte }: Props) {
  const { auc } = derivar({ rend, cal, desenlace, corte })
  const alerta = rend.metricas_por_top.find((t) => t.top_pct === TOP_ALERTA)
  const prevalencia = rend.pr.prevalencia ?? (auc.casos != null && auc.n ? auc.casos / auc.n : null)
  const f1 = f1De(alerta?.casos_detectados_pct, alerta?.alertas_acertadas_pct)
  return (
    <Panel titulo="Evaluación en prueba"
      descripcion="Con niños que el modelo no vio al entrenar: los nacidos más recientemente, apartados antes de entrenar.">
      <p className="text-base font-semibold">
        {num(auc.n)} niños{prevalencia != null && <>, {pct(100 * prevalencia)} con el desenlace</>}
      </p>
      <p className="text-sm">Alertando al {TOP_ALERTA} % de niños con más riesgo, el mismo punto que usa la aplicación.</p>

      <dl className="mt-3">
        <Metrica nombre="AUROC" valor={auc.auc != null ? dec2(auc.auc) : '—'}
          detalle={auc.ic_bajo != null && auc.ic_alto != null ? `(${dec2(auc.ic_bajo)} a ${dec2(auc.ic_alto)})` : undefined}
          explicacion="Qué tan bien ordena: la probabilidad de que un niño que tuvo el desenlace reciba más riesgo que uno que no. 0,5 es azar; 1 es perfecto." />
        <Metrica nombre="PR-AUC" valor={rend.pr_auc != null ? dec2(rend.pr_auc) : '—'}
          explicacion={`Qué tan bien se sostienen los aciertos al alertar a más niños. Compárela con ${prevalencia != null ? dec2(prevalencia) : 'la frecuencia del desenlace'}, lo que daría el azar.`} />
        <Metrica nombre="Sensibilidad" valor={pctN(alerta?.casos_detectados_pct)}
          explicacion="De cada 100 niños que tuvieron el desenlace, a cuántos se les dio alerta." />
        <Metrica nombre="Precisión" valor={pctN(alerta?.alertas_acertadas_pct)}
          explicacion="De cada 100 niños en alerta, cuántos sí tuvieron el desenlace." />
        <Metrica nombre="F1" valor={f1 != null ? dec2(f1) : '—'}
          explicacion="Una sola cifra que junta sensibilidad y precisión: 1 es perfecto y 0, que no acierta nada." />
      </dl>
    </Panel>
  )
}

export function EvaluacionAciertos(props: Props) {
  const { auc, desenlace, poblacion, momento } = derivar(props)
  const confusion = props.rend.confusion_por_top.find((t) => t.top_pct === TOP_ALERTA)
  const ninosMatriz = confusion && [confusion.tp, confusion.fp, confusion.fn, confusion.tn].every((v) => v != null)
    ? (confusion.tp ?? 0) + (confusion.fp ?? 0) + (confusion.fn ?? 0) + (confusion.tn ?? 0) : null
  return (
    <Panel titulo="Aciertos y errores" descripcion={`Alertando al ${TOP_ALERTA} % de niños con más riesgo, con niños que el modelo no vio al entrenar.`}>
      {confusion ? (
        <>
          <div className="overflow-x-auto"><MatrizAlerta c={confusion} /></div>
          <NotaGrafica className="mt-3" datos={{
            variable: `Alerta del modelo frente a si el niño tuvo ${desenlace}`,
            unidad: 'Número de niños',
            momento,
            poblacion,
            validos: ninosMatriz != null ? `${num(ninosMatriz)} niños` : `${num(auc.n)} niños; las celdas con menos de 5 no se muestran`,
            porcentaje: 'Cada celda es un conteo. Sensibilidad = detectados entre los niños que tuvieron el desenlace; precisión = detectados entre los niños en alerta',
          }} />
        </>
      ) : <p className="text-sm">Sin datos de aciertos y errores para este desenlace.</p>}
    </Panel>
  )
}

export function EvaluacionCalibracion(props: Props) {
  const { desenlace, puntos, tamanos, tope, poblacion, momento } = derivar(props)
  return (
    <Panel titulo="Calibración" descripcion="Si el riesgo que da el modelo es creíble: lo que dijo frente a lo que pasó. Sobre la diagonal, el riesgo es justo.">
      {puntos.length > 1 ? (
        <>
          <CurvaXY etiqueta={`Riesgo estimado frente a riesgo observado de ${desenlace}, por grupos de niños`}
            ejeX="Riesgo predicho (%)" ejeY="Riesgo observado (%)" diagonal alto={240}
            dominioX={[0, tope]} dominioY={[0, tope]} formatoX={(v) => `${Math.round(v * 100)}`} formatoY={(v) => `${Math.round(v * 100)}`}
            series={[{ clave: 'cal', nombre: 'Grupos de niños', color: 0, puntos }]} />
          <p className="text-center text-xs">Línea punteada: referencia ideal (el riesgo dicho es el que ocurre).</p>
          <NotaGrafica className="mt-3" datos={{
            variable: `Riesgo estimado y frecuencia observada de ${desenlace}`,
            unidad: '% de niños',
            momento,
            poblacion,
            validos: `${num(puntos.length)} grupos de niños con riesgo parecido (${tamanos.map((n) => num(n)).join(', ')} niños)`,
            porcentaje: 'Cada punto: el porcentaje de niños del grupo que tuvo el desenlace (denominador: los niños de ese grupo) frente al riesgo promedio que les dio el modelo',
          }} />
        </>
      ) : <p className="text-sm">Sin datos de calibración para este desenlace.</p>}
    </Panel>
  )
}
