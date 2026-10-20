import type { Respuesta, Rol } from '../api/tipos'

const nf = new Intl.NumberFormat('es-CO')
const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

export const num = (v: number | null | undefined) => (v == null ? '—' : nf.format(v))
export const dec = (v: number | null | undefined) => (v == null ? '—' : nf1.format(v))
export const dec2 = (v: number | null | undefined) => (v == null ? '—' : nf2.format(v))
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${nf1.format(v)} %`)
/** Riesgo (0 a 1) como porcentaje. */
export const riesgo = (v: number | null | undefined) => (v == null ? '—' : `${nf1.format(100 * v)} %`)
export const posicion = (v: number | null | undefined) => (v == null ? '—' : nf.format(Math.round(v)))

export function fecha(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fechaHora(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Edad corregida en días, en palabras cortas. */
export function edad(dias: number | null | undefined): string {
  if (dias == null) return '—'
  if (Math.abs(dias) < 60) return `${Math.round(dias)} d`
  const meses = dias / 30.4375
  if (meses < 24) return `${nf1.format(meses)} m`
  return `${nf1.format(meses / 12)} a`
}

export const ROLES: Record<Rol, string> = { admin: 'Administración', experto: 'Experto clínico', visualizador: 'Consulta' }
export const RESPUESTAS: Record<Respuesta, string> = { si: 'Sí', no: 'No', no_se: 'No sé' }
export const CAPAS: Record<string, string> = {
  '1': 'Valor',
  '2': 'Contexto',
  '3': 'Trayectoria',
  '4': 'Grupo y tiempo',
}
export const INDICADORES: Record<string, string> = {
  peso: 'Peso para la edad',
  talla: 'Talla para la edad',
  perimetro_cefalico: 'Perímetro cefálico',
}
export const indicador = (k: string) => INDICADORES[k] ?? k.replaceAll('_', ' ')
export const ESTADOS_CORRIDA: Record<string, string> = { en_curso: 'En curso', ok: 'Terminada', error: 'Con error' }

/** Primera letra en mayúscula (los motivos del modelo vienen en minúscula). */
export const frase = (v: string | null | undefined) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '')
export const TIPOS_CORRIDA: Record<string, string> = {
  demo: 'Desde la plataforma', completa: 'Semestral (equipo local)', revision: 'Solo revisión de datos', riesgos: 'Solo riesgos',
}
