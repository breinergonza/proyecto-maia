// Analítica › Comparar: dos entrenamientos (con réplicas bootstrap) o dos grupos de niños, y «Aprobar B» (solo
// administración), que usa el mismo endpoint de aprobación que Administración › Entrenamientos.
import { useMutation, useQuery } from '@tanstack/react-query'
import { pedir } from './cliente'
import type { Ejecucion, EntradaFiltro, Entrenamientos } from './tipos'

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

// ---- grupos de niños
export interface LadoGrupoEntrada { muestra?: { version: 2; y: EntradaFiltro[] }; muestra_id?: number; nombre?: string }
export interface ValorComparado {
  unidad: string; n_a: number | null; n_b: number | null; a: number | null; b: number | null
  ic_a: [number, number] | null; ic_b: [number, number] | null
  diferencia: number | null; ic_bajo: number | null; ic_alto: number | null; clara: boolean | null
}
export interface ComparaGrupos {
  estado: 'ok' | 'insuficiente'; mensaje?: string; corrida_id: number; minimo_ninos: number; replicas: number
  a: { nombre: string; n: number | null }; b: { nombre: string; n: number | null }
  percentil_alto?: number; aviso?: string
  riesgo?: (ValorComparado & { clave: string; desenlace: string })[]
  crecimiento?: ValorComparado & { indicador: string; etiqueta: string }
  motivos?: { motivo: string; altos_a: number; altos_b: number
    a: { n: number | null; pct: number | null }; b: { n: number | null; pct: number | null } }[]
  faltantes?: { variable: string; etiqueta: string
    a: { faltan: number | null; pct: number | null }; b: { faltan: number | null; pct: number | null } }[]
  composicion?: Record<string, { etiqueta: string
    categorias: { categoria: string; etiqueta: string; n_a: number | null; n_b: number | null; pct_a: number | null; pct_b: number | null }[] }>
}
export interface CuerpoGrupos { a: LadoGrupoEntrada; b: LadoGrupoEntrada; corrida_id?: number; desenlace?: string }

export const useComparaGrupos = () =>
  useMutation({ mutationFn: (cuerpo: CuerpoGrupos) => pedir<ComparaGrupos>('/analitica/comparar/grupos', { cuerpo }) })

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
