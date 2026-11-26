// Comparar: dos entrenamientos (con réplicas bootstrap, en Modelos), dos grupos de niños (Comparar grupos) y «Aprobar B»
// (administración y experto en datos), que usa el mismo endpoint de aprobación que Entrenar y aprobar modelos.
import { keepPreviousData, skipToken, useMutation, useQuery } from '@tanstack/react-query'
import { pedir } from './cliente'
import type { CuerpoExplorar, Ejecucion, Entrenamientos } from './tipos'

export interface MedidaComparada {
  id: string; texto: string; unidad: 'abs' | 'pp'; a: number | null; b: number | null; diferencia: number | null
  ic_bajo: number | null; ic_alto: number | null; clara: boolean | null; n_a: number | null; n_b: number | null
}
export interface LadoEntrenamiento {
  entrenamiento: number; fuente?: string | null; corte?: string | null; registro?: string | null
  version_registro?: string | number | null; version_modelo?: string | number | null; creada?: string | null; n: number | null; casos: number | null
}
export interface ComparaEntrenamientos {
  estado: 'ok' | 'sin_artefactos' | 'insuficiente'; desenlace?: string; mensaje?: string
  a?: LadoEntrenamiento; b?: LadoEntrenamiento; replicas?: number; aviso?: string; minimo_ninos?: number
  metricas?: MedidaComparada[]
  calibracion?: { id: string; texto: string; a: number | null; b: number | null; diferencia: number | null }[]
  por_grupo?: { variable: string; grupo: string; a: number | null; b: number | null; diferencia: number | null
    ic_bajo: number | null; ic_alto: number | null; clara: boolean | null; n_a: number | null; n_b: number | null }[]
}

/** Dos entrenamientos para un desenlace. Solo lee agregados: nunca recalcula nada. */
export const useComparaEntrenamientos = (a: number | null, b: number | null, desenlace: string | null | undefined) =>
  useQuery({
    queryKey: ['analitica', 'comparar', a, b, desenlace ?? null],
    enabled: a != null && b != null && a !== b && !!desenlace,
    queryFn: () => pedir<ComparaEntrenamientos>('/analitica/comparar', { params: { a, b, desenlace } }),
  })

// ---- grupos de niños, por pregunta clínica (POST /analitica/comparar/grupos/clinico), a mano hasta que el esquema tenga tipos
/** Un lado del cuerpo es un grupo como el de Explorar: el filtro guardado por su número o la muestra completa. */
export interface CuerpoGruposClinico { a: CuerpoExplorar; b: CuerpoExplorar; corrida_id?: number }
export interface LadoClinico { nombre: string; n: number | null }
/** Niños con el desenlace entre los que tienen dato a los 12 meses. Los conteos nulos siguen las reglas de
 *  la Vista clínica; ``pct`` es nulo con menos de 20 niños con dato. */
export interface ObservadoLado { casos: number | null; con_dato: number | null; sin_dato: number | null; pct: number | null; pct_sin_dato: number | null }
/** B frente a A en puntos porcentuales, con su intervalo del 95 %; todo nulo si un lado tiene menos de 20 niños con dato. */
export interface DiferenciaObservada { valor: number | null; ic_bajo: number | null; ic_alto: number | null; clara: boolean | null }
export interface RiesgoDeCorte { calculados: number | null; en_alerta: number | null; pct_en_alerta: number | null }
/** El riesgo estimado por el modelo en un corte (visita desde la que se predice); ``estado`` dice si el modelo está «En prueba». */
export interface RiesgoPorCorteLados {
  momento: string; momento_nombre: string; clave: string; estado: 'en_uso' | 'en_prueba'
  a: RiesgoDeCorte | null; b: RiesgoDeCorte | null
}
export interface DesenlaceComparado {
  clave: string; nombre: string; definicion: string; estado: 'en_uso' | 'en_prueba'; indicador: string | null
  /** La visita entre cuyos asistentes se cuenta lo observado: por eso su «con dato» no es el de la talla por visita. */
  desde?: string | null
  a: ObservadoLado | null; b: ObservadoLado | null; dif: DiferenciaObservada; riesgo: RiesgoPorCorteLados[]
  /** La corrida calcula el riesgo de este desenlace para algún niño (aunque ninguno de los grupos lo tenga ahora). */
  riesgo_con_modelo: boolean
}
/** Lo de un grupo en una visita: niños con z de talla, su mediana y los que no tienen dato (con su porcentaje). */
export interface TallaDeVisita { n: number; mediana: number; sin_dato: number; pct_sin_dato: number }
export interface VisitaComparada { etapa: string; etapa_nombre: string; a: TallaDeVisita | null; b: TallaDeVisita | null }
export interface GruposClinicoOk {
  estado: 'ok'; corrida_id: number; minimo_ninos: number; alerta_percentil: number
  /** Con ``ok`` los dos lados tienen 20 niños o más: ``n`` y ``n_total`` van siempre. */
  a: { nombre: string; n: number; n_total: number }; b: { nombre: string; n: number; n_total: number }
  desenlaces: DesenlaceComparado[]
  trayectoria: { indicador: string; nombre: string; unidad: string; referencia: string; umbral: number; etapas: VisitaComparada[] }
}
export interface GruposClinicoInsuficiente { estado: 'insuficiente'; corrida_id: number; minimo_ninos: number; mensaje: string; a: LadoClinico; b: LadoClinico }
export type RespuestaGruposClinico = GruposClinicoOk | GruposClinicoInsuficiente

/** Los dos grupos a la vez; sin el grupo B elegido (``null``) no se pide nada. La llave lleva ambos cuerpos, así que
 *  reintentar tras una falla pide lo mismo. */
export const useComparaGruposClinico = (cuerpo: CuerpoGruposClinico | null) =>
  useQuery({
    queryKey: ['analitica', 'comparar', 'grupos', 'clinico', cuerpo],
    queryFn: cuerpo ? () => pedir<RespuestaGruposClinico>('/analitica/comparar/grupos/clinico', { cuerpo }) : skipToken,
    placeholderData: keepPreviousData,
  })

// ---- aprobar B (solo administración)
/** La versión de anomalías que hoy está en producción (o, si no hay, la más reciente): «Aprobar» promueve las dos. */
export function anomaliasVigente(e: Entrenamientos | undefined): string | null {
  const con = (e?.anomalias ?? []).filter((x) => x.modelo)
  const prod = con.find((x) => x.modelo?.alias?.includes('produccion'))
  if (prod?.modelo) return prod.modelo.version
  const orden = [...con].sort((x, y) => Number(y.modelo?.version) - Number(x.modelo?.version))
  return orden[0]?.modelo?.version ?? null
}

export const useEntrenamientosRegistrados = (fuente: 'kmc' | 'simulado', activo: boolean) =>
  useQuery({
    queryKey: ['entrenamientos', fuente], enabled: activo, retry: false,
    queryFn: () => pedir<Entrenamientos>('/entrenamientos', { params: { fuente } }),
  })

export const useAprobarB = () =>
  useMutation({
    mutationFn: (v: { fuente: 'kmc' | 'simulado'; anomalias: string; clinico: string }) =>
      pedir<Ejecucion>('/entrenamientos/aprobar', { cuerpo: v }),
  })
