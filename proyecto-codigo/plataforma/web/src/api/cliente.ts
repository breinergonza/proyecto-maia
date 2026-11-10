// Cliente de la API. El token de acceso vive solo en memoria (nunca en localStorage); el de refresco va en una
// cookie httpOnly que el navegador manda sola a /api/auth. Ante un 401 se refresca una vez y se repite la petición.
import type { RespuestaLogin } from './tipos'

let acceso: string | null = null
let refrescando: Promise<RespuestaLogin | null> | null = null
const oyentes = new Set<(r: RespuestaLogin | null) => void>()

export class ErrorApi extends Error {
  estado: number
  constructor(estado: number, mensaje: string) {
    super(mensaje)
    this.estado = estado
  }
}

/** Estado de la sesión para el aviso: «ok», «por_vencer» (el refresco falló y el acceso aún sirve) o «vencida». */
export type EstadoSesion = 'ok' | 'por_vencer' | 'vencida'
let estado: EstadoSesion = 'ok'
let venceEn: number | null = null          // milisegundos; sale del campo «exp» del token, si lo trae
let temporizador: ReturnType<typeof setTimeout> | null = null
const oyentesEstado = new Set<() => void>()

/** Milisegundos antes de vencer el acceso en que se intenta renovar (si falla, se avisa). */
const ANTES_DE_VENCER_MS = 60_000

export const estadoSesion = (): EstadoSesion => estado
export function alCambiarEstadoSesion(f: () => void) {
  oyentesEstado.add(f)
  return () => oyentesEstado.delete(f)
}
function marcar(nuevo: EstadoSesion) {
  if (estado === nuevo) return
  estado = nuevo
  oyentesEstado.forEach((f) => f())
}

/** ``exp`` de un JWT en milisegundos, o ``null`` si el token no es un JWT legible (no se valida: solo se lee). */
function vencimientoDe(token: string): number | null {
  try {
    const carga = token.split('.')[1]
    if (!carga) return null
    const b64 = carga.replace(/-/g, '+').replace(/_/g, '/')
    const exp = (JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export function fijarAcceso(token: string | null) {
  acceso = token
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  venceEn = token ? vencimientoDe(token) : null
  marcar('ok')
  if (venceEn !== null) {
    // poco antes de vencer se renueva sola; si no se puede, la persona recibe el aviso mientras aún puede guardar
    temporizador = setTimeout(() => void refrescar(), Math.max(venceEn - Date.now() - ANTES_DE_VENCER_MS, 0))
  }
}

/** El refresco falló con una sesión abierta: se avisa sin sacar a la persona de su pantalla. */
function avisarVencimiento() {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  const resta = venceEn === null ? 0 : venceEn - Date.now()
  if (resta > 0) {
    marcar('por_vencer')
    temporizador = setTimeout(() => marcar('vencida'), resta)
  } else {
    marcar('vencida')
  }
}

/** Avisa cuando la sesión cambia por un refresco (nuevo usuario o sesión terminada). */
export function alCambiarSesion(f: (r: RespuestaLogin | null) => void) {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

function mensajeDe(cuerpo: unknown, estado: number): string {
  const d = (cuerpo as { detail?: unknown } | null)?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d.length) {
    return d
      .map((e: { loc?: (string | number)[]; msg?: string }) => {
        const campo = e.loc?.filter((x) => x !== 'body').join('.')
        return campo ? `${campo}: ${e.msg}` : e.msg
      })
      .join('; ')
  }
  if (estado >= 500) return 'La API no respondió bien. Intente de nuevo en un momento.'
  return `La petición falló (${estado}).`
}

export async function refrescar(): Promise<RespuestaLogin | null> {
  if (!refrescando) {
    refrescando = (async () => {
      const habiaSesion = acceso !== null
      try {
        const r = await fetch('/api/auth/refrescar', { method: 'POST', credentials: 'same-origin' })
        const datos = r.ok ? ((await r.json()) as RespuestaLogin) : null
        if (!datos && habiaSesion) {
          // la sesión estaba abierta: no se tira la pantalla, se avisa para que guarde su trabajo
          avisarVencimiento()
          return null
        }
        fijarAcceso(datos?.acceso ?? null)
        oyentes.forEach((f) => f(datos))
        return datos
      } catch {
        return null
      } finally {
        refrescando = null
      }
    })()
  }
  return refrescando
}

type Opciones = {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  cuerpo?: unknown
  formulario?: FormData
  params?: Record<string, string | number | boolean | null | undefined>
}

export function conParams(ruta: string, params?: Opciones['params']): string {
  if (!params) return ruta
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `${ruta}?${s}` : ruta
}

const SIN_CONEXION = 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.'

/** ``fetch`` que, si la red falla (el navegador solo dice «Failed to fetch»), lo explica en español. */
async function traer(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ErrorApi(0, SIN_CONEXION)
  }
}

/** Un archivo (p. ej. un .xlsx) con la sesión actual: el token va en la cabecera, no en la dirección. */
export async function pedirArchivo(ruta: string, reintento = true): Promise<Blob> {
  const r = await traer(`/api${ruta}`, {
    headers: acceso ? { Authorization: `Bearer ${acceso}` } : {},
    credentials: 'same-origin',
  })
  if (r.status === 401 && reintento && (await refrescar())) return pedirArchivo(ruta, false)
  if (!r.ok) throw new ErrorApi(r.status, mensajeDe(await r.json().catch(() => null), r.status))
  return r.blob()
}

export async function pedir<T>(ruta: string, op: Opciones = {}, reintento = true): Promise<T> {
  const cabeceras: Record<string, string> = {}
  if (acceso) cabeceras.Authorization = `Bearer ${acceso}`
  let cuerpo: BodyInit | undefined
  if (op.formulario) cuerpo = op.formulario
  else if (op.cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json'
    cuerpo = JSON.stringify(op.cuerpo)
  }
  const r = await traer(conParams(`/api${ruta}`, op.params), {
    method: op.metodo ?? (cuerpo ? 'POST' : 'GET'),
    headers: cabeceras,
    body: cuerpo,
    credentials: 'same-origin',
  })
  if (r.status === 401 && reintento && !ruta.startsWith('/auth/')) {
    const nuevo = await refrescar()
    if (nuevo) return pedir<T>(ruta, op, false)
  }
  if (r.status === 204) return undefined as T
  const datos = await r.json().catch(() => null)
  if (!r.ok) throw new ErrorApi(r.status, mensajeDe(datos, r.status))
  return datos as T
}
