// Exportación de gráficas y tablas: CSV (con BOM UTF-8) y PNG (el primer <svg> del contenido, sin librerías externas).
// Regla de privacidad: las filas con menos niños que el mínimo se reemplazan por «n<5» (D52: distribuciones y cuantiles, 20).

export type FilaCsv = Record<string, string | number | null>

export const MINIMO_NINOS = 5
export const MINIMO_NINOS_DISTRIBUCION = 20

/** Reemplaza por «n<mínimo» todas las celdas (menos el campo de conteo) de las filas con menos niños que el mínimo. */
export function ocultarCeldasPequenas(filas: FilaCsv[], campoN: string, minimo = MINIMO_NINOS): FilaCsv[] {
  return filas.map((fila) => {
    const n = fila[campoN]
    if (typeof n !== 'number' || !(n < minimo)) return fila
    return Object.fromEntries(Object.entries(fila).map(([k, v]) => [k, k === campoN ? `n<${minimo}` : (v == null ? v : `n<${minimo}`)]))
  })
}

function celda(v: string | number | null | undefined): string {
  if (v == null) return ''
  const t = String(v)
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** CSV con cabecera, separador coma y BOM UTF-8 al inicio. */
export function aCsv(filas: FilaCsv[], columnas?: string[]): string {
  const cols = columnas ?? [...new Set(filas.flatMap((f) => Object.keys(f)))]
  const lineas = [cols.map(celda).join(','), ...filas.map((f) => cols.map((c) => celda(f[c])).join(','))]
  return `﻿${lineas.join('\r\n')}\r\n`
}

export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const nombreArchivo = (base: string, ext: string) =>
  `${base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'grafica'}.${ext}`

function partirLineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const salida: string[] = []
  let actual = ''
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (actual && ctx.measureText(prueba).width > ancho) { salida.push(actual); actual = palabra } else actual = prueba
  }
  if (actual) salida.push(actual)
  return salida
}

/** Serializa el <svg> a PNG con un encabezado (título, descripción, muestra y fecha). */
export async function svgAPng(svg: SVGSVGElement, encabezado: { titulo: string; descripcion?: string; muestra?: string; fecha?: string }): Promise<Blob> {
  const caja = svg.getBoundingClientRect()
  const ancho = Math.max(320, Math.round(caja.width || svg.viewBox.baseVal?.width || 640))
  const alto = Math.max(160, Math.round(caja.height || svg.viewBox.baseVal?.height || 320))
  const clon = svg.cloneNode(true) as SVGSVGElement
  clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clon.setAttribute('width', String(ancho))
  clon.setAttribute('height', String(alto))
  const xml = new XMLSerializer().serializeToString(clon)
  const img = new Image()
  await new Promise<void>((ok, mal) => {
    img.onload = () => ok()
    img.onerror = () => mal(new Error('No se pudo generar la imagen.'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  })
  const escala = 2
  const margen = 16
  const medidor = document.createElement('canvas').getContext('2d')!
  medidor.font = '13px sans-serif'
  const textos = [encabezado.descripcion, [encabezado.muestra, encabezado.fecha ?? new Date().toLocaleDateString('es-CO')].filter(Boolean).join(' · ')]
    .filter((t): t is string => !!t).flatMap((t) => partirLineas(medidor, t, ancho - margen * 2))
  const altoCabecera = margen + 22 + textos.length * 18 + 8
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho * escala
  lienzo.height = (alto + altoCabecera + margen) * escala
  const ctx = lienzo.getContext('2d')!
  ctx.scale(escala, escala)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ancho, alto + altoCabecera + margen)
  ctx.fillStyle = '#1f2933'
  ctx.font = 'bold 16px sans-serif'
  ctx.fillText(encabezado.titulo, margen, margen + 14)
  ctx.font = '13px sans-serif'
  ctx.fillStyle = '#52606d'
  textos.forEach((t, i) => ctx.fillText(t, margen, margen + 22 + 14 + i * 18))
  ctx.drawImage(img, 0, altoCabecera, ancho, alto)
  return new Promise<Blob>((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo generar el PNG.'))), 'image/png'))
}
