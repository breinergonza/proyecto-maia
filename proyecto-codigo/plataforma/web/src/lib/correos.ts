// Máscara de correo: la misma regla de la API (texto@dominio.ext, sin espacios ni doble @), en minúscula.
const CORREO = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/

export const esCorreo = (x: string) => CORREO.test(x.trim())

export interface Analisis { validos: string[]; invalidos: string[]; repetidos: string[] }

/** Separa un texto por comas, punto y coma, espacios o saltos de línea y lo clasifica frente a los correos que ya hay. */
export function analizarCorreos(texto: string, existentes: string[]): Analisis {
  const vistos = new Set(existentes.map((c) => c.toLowerCase()))
  const r: Analisis = { validos: [], invalidos: [], repetidos: [] }
  for (const crudo of texto.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (!esCorreo(crudo)) r.invalidos.push(crudo)
    else if (vistos.has(crudo)) r.repetidos.push(crudo)
    else { vistos.add(crudo); r.validos.push(crudo) }
  }
  return r
}
