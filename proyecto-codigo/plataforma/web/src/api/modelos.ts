// Lo que la pantalla de Modelos necesita saber del paquete de modelos en uso para trazar un entrenamiento.
import type { Paquete } from './tipos'

/** La versión del paquete activo si lleva el modelo clínico de este entrenamiento (la versión del modelo coincide); si no, null:
 * un entrenamiento que no se aprobó no está en ningún paquete y no se le inventa uno. */
export function paqueteQueContiene(paquete: Paquete | null | undefined, versionModelo: string | number | null | undefined): string | null {
  const clinico: unknown = paquete?.modelos?.clinico
  const delPaquete = typeof clinico === 'object' && clinico !== null && 'version_modelo' in clinico ? clinico.version_modelo : undefined
  return paquete && delPaquete != null && versionModelo != null && String(delPaquete) === String(versionModelo) ? paquete.version : null
}
