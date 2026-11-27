import type { Respuesta, Rol } from '../api/tipos'

const nf = new Intl.NumberFormat('es-CO')
const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })
const nf3 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 })
/** Hasta un decimal, sin «,0» que no dice nada (34 semanas, 28,5 semanas). */
const nf01 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

const nfLibre = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6 })

export const num = (v: number | null | undefined) => (v == null ? '—' : nf.format(v))
/** Un parámetro tal como es (0,0005; 2.147.483.647), con la coma decimal del resto de la app. */
export const numero = (v: number | null | undefined) => (v == null ? '—' : nfLibre.format(v))
/** Un parámetro registrado como texto (MLflow guarda «0.05»): si es un número, con coma decimal; si no, tal cual. */
export const parametro = (v: string | number | null | undefined) =>
  v == null ? '—' : typeof v === 'number' ? numero(v) : /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(v.trim()) ? numero(Number(v)) : v
export const dec = (v: number | null | undefined) => (v == null ? '—' : nf01.format(v))
export const dec2 = (v: number | null | undefined) => (v == null ? '—' : nf2.format(v))
/** Errores pequeños (Brier, ECE): con dos decimales 0,073 y 0,078 se leerían iguales. */
export const dec3 = (v: number | null | undefined) => (v == null ? '—' : nf3.format(v))
/** Un valor estimado (p. ej. el rango esperado de un peso) con los decimales que importan para su tamaño:
 * 2.185 g, 47,3 cm, 1,23. */
export const aproximado = (v: number | null | undefined) => {
  if (v == null) return '—'
  const a = Math.abs(v)
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 }).format(v)
}
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${nf1.format(v)} %`)
/** «1 niño», «58 niños». */
export const ninos = (n: number) => `${num(n)} ${n === 1 ? 'niño' : 'niños'}`
/** Riesgo (0 a 1) como porcentaje. Un modelo nunca está seguro: lo que se redondearía a 0,0 % o a 100,0 % se dice
 * «menos de 0,1 %» o «más de 99,9 %». */
export const riesgo = (v: number | null | undefined) =>
  v == null ? '—'
    : v > 0 && 100 * v < 0.05 ? 'menos de 0,1 %'
      : 100 * v >= 99.95 ? 'más de 99,9 %'
        : `${nf1.format(100 * v)} %`
export const posicion = (v: number | null | undefined) => (v == null ? '—' : nf.format(Math.round(v)))
/** Valor medido tal como llega de la base (texto): si es un número, sin ruido de coma flotante y con hasta 3
 * decimales, para que un dato mal registrado (p. ej. un peso en kilos donde van gramos) se siga viendo como es. */
// las unidades como las trae la base («GRAMOS», «CMS», «DIAS»), dichas como se escriben en clínica
const UNIDADES: Record<string, string> = {
  gramos: 'g', gramo: 'g', gr: 'g', g: 'g', kg: 'kg', kilos: 'kg', kilogramos: 'kg', cms: 'cm', cm: 'cm', centimetros: 'cm',
  dias: 'días', dia: 'día', semanas: 'semanas', semana: 'semana', meses: 'meses', mes: 'mes', horas: 'horas', hora: 'hora',
  anos: 'años', ano: 'año',
}
/** La unidad de una medición para ponerla junto a su valor: «GRAMOS» → «g», «CMS» → «cm», «DIAS» → «días». Una unidad que
 * no está en la lista sale tal cual. */
export const unidad = (u: string | null | undefined): string => {
  const limpia = (u ?? '').trim()
  if (!limpia) return ''
  const clave = limpia.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.$/, '')
  return UNIDADES[clave] ?? limpia
}

export const medida = (v: string | null | undefined) => {
  if (v == null || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(v.trim()) ? nf3.format(n) : v
}

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

/** Cierra una frase que termina en un valor: «p. m.» ya trae su punto y no lleva otro. */
export const conPunto = (texto: string) => (texto.endsWith('.') ? texto : `${texto}.`)

/** Edad corregida (días) en meses, para un eje que no mezcle unidades: 0,5 m, 3 m, 13 m. Redondea antes de formatear y
 * suma 0 para que un valor que redondea a cero desde abajo (un día antes del nacimiento corregido) sea «0 m», no «-0 m». */
export const meses = (dias: number) => `${nf01.format(Math.round((dias / 30.4375) * 10) / 10 + 0)} m`

/** Edad corregida en días, en palabras cortas. */
export function edad(dias: number | null | undefined): string {
  if (dias == null) return '—'
  if (Math.abs(dias) < 60) return `${Math.round(dias)} d`
  const meses = dias / 30.4375
  if (meses < 24) return `${nf01.format(meses)} m`
  return `${nf01.format(meses / 12)} a`
}

/** «Riesgo alto»: entre el 10 % de mayor riesgo de su desenlace (igual que PERCENTIL_ALTO en maia_comun.modelos_db;
 * api/pruebas/test_umbrales.py los mantiene iguales). */
export const RIESGO_ALTO = 90

export const ROLES: Record<Rol, string> = { admin: 'Administración', experto: 'Experto clínico', datos: 'Experto en datos', visualizador: 'Consulta' }
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
  peso_para_talla: 'Peso para la talla',
}
export const indicador = (k: string) => INDICADORES[k] ?? k.replaceAll('_', ' ')
export const ESTADOS_CORRIDA: Record<string, string> = { en_curso: 'En curso', ok: 'Terminada', error: 'Con error' }

/** Primera letra en mayúscula (los motivos del modelo vienen en minúscula). */
export const frase = (v: string | null | undefined) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '')
export const TIPOS_CORRIDA: Record<string, string> = {
  demo: 'Recálculo con el corte vigente', completa: 'Extracción y cálculo', revision: 'Solo revisión de datos', riesgos: 'Solo riesgos',
}
export const ESTADOS_EJECUCION: Record<string, string> = {
  pendiente: 'En cola', en_curso: 'En curso', ok: 'Terminada', error: 'Con error',
}
export const TIPOS_EJECUCION: Record<string, string> = { corrida: 'Corrida', entrenamiento: 'Entrenamiento', aprobacion: 'Aprobación de modelos' }
export const FUENTES: Record<string, string> = { kmc: 'Base de la Fundación', simulado: 'Datos simulados' }
export const MODELOS: Record<string, string> = { anomalias: 'Anomalías (revisión de datos)', clinico: 'Alertas clínicas' }

const ETIQUETAS_HEREDADAS: Readonly<Record<string, string>> = {
  'Hasta que mes trabajo en el embarazo': '¿Hasta qué mes del embarazo trabajó la madre?',
  'Numero de personas que viven en el hogar con este ingreso': 'Número de personas que viven en el hogar con este ingreso',
  'Educacion del padre': 'Nivel educativo del padre',
  'Educacion de la madre': 'Nivel educativo de la madre',
  'Edad materna (años)': 'Edad de la madre',
  'Peso de la madre (Kg)': 'Peso de la madre',
  'Numero de controles hechos por ARO': 'Número de controles por ARO',
}

/** Presenta las etiquetas heredadas y añade la unidad cuando aún no figura en la etiqueta. */
export function etiquetaCampo(etiqueta: string, unidad?: string | null): string {
  const texto = Object.hasOwn(ETIQUETAS_HEREDADAS, etiqueta) ? ETIQUETAS_HEREDADAS[etiqueta] : etiqueta
  const normalizar = (valor: string) => valor.toLowerCase().replace(/[.\s]/g, '')
  const unidadEnEtiqueta = /\(([^()]+)\)\s*$/.exec(texto)?.[1]
  return unidad && (!unidadEnEtiqueta || normalizar(unidadEnEtiqueta) !== normalizar(unidad))
    ? `${texto} (${unidad})`
    : texto
}
