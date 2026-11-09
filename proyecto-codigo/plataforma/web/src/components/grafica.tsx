// Gráfica y tabla con su descripción siempre visible (D53) y botones para llevarse el dato: PNG de la gráfica y CSV de las filas.
import { useRef, useState, type ReactNode } from 'react'
import { aCsv, descargar, nombreArchivo, svgAPng, type FilaCsv } from '../lib/exportar'
import { Boton, Panel } from './ui'

export type Exportar = {
  nombre: string
  filas?: FilaCsv[]
  columnas?: string[]
  muestra?: string
  unidad?: string
}

type Comunes = {
  titulo: string
  /** Obligatoria: una frase que diga qué muestra la gráfica o la tabla. */
  descripcion: string
  exportar?: Exportar
  accion?: ReactNode
  className?: string
  llenar?: boolean
  children: ReactNode
}

function BotonCsv({ titulo, exportar }: { titulo: string; exportar: Exportar }) {
  if (!exportar.filas) return null
  const filas = exportar.filas
  return (
    <Boton variante="secundario" chico aria-label={`Descargar CSV: ${titulo}`}
      onClick={() => descargar(new Blob([aCsv(filas, exportar.columnas)], { type: 'text/csv;charset=utf-8' }), nombreArchivo(exportar.nombre, 'csv'))}>
      CSV
    </Boton>
  )
}

function Botones({ titulo, descripcion, exportar, png, contenedor }: {
  titulo: string; descripcion: string; exportar?: Exportar; png: boolean; contenedor: React.RefObject<HTMLDivElement | null>
}) {
  const [error, setError] = useState(false)
  if (!exportar) return null
  const bajarPng = async () => {
    const svg = contenedor.current?.querySelector('svg')
    if (!svg) { setError(true); return }
    try {
      setError(false)
      const blob = await svgAPng(svg, { titulo, descripcion, muestra: exportar.muestra, fecha: new Date().toLocaleDateString('es-CO') })
      descargar(blob, nombreArchivo(exportar.nombre, 'png'))
    } catch { setError(true) }
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {error && <span role="alert" className="text-xs text-coral-hondo">No se pudo exportar.</span>}
      {png && <Boton variante="secundario" chico aria-label={`Descargar PNG: ${titulo}`} onClick={bajarPng}>PNG</Boton>}
      <BotonCsv titulo={titulo} exportar={exportar} />
    </span>
  )
}

function Pie({ exportar }: { exportar?: Exportar }) {
  if (!exportar?.muestra && !exportar?.unidad) return null
  return <p className="mt-2 text-xs text-salvia">{[exportar.muestra, exportar.unidad].filter(Boolean).join(' · ')}</p>
}

/** Panel de gráfica: descripción visible, botón PNG (primer <svg> del contenido) y CSV si hay filas. */
export function Grafica({ titulo, descripcion, exportar, accion, className, llenar, children }: Comunes) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <Panel titulo={titulo} descripcion={descripcion} className={className} llenar={llenar}
      accion={(accion || exportar) && (
        <span className="flex flex-wrap items-center gap-2">
          {accion}
          <Botones titulo={titulo} descripcion={descripcion} exportar={exportar} png contenedor={ref} />
        </span>
      )}>
      <div ref={ref}>{children}</div>
      <Pie exportar={exportar} />
    </Panel>
  )
}

/** Panel de tabla: descripción visible y CSV de las filas. */
export function TablaDatos({ titulo, descripcion, exportar, accion, className, llenar, children }: Comunes) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <Panel titulo={titulo} descripcion={descripcion} className={className} llenar={llenar}
      accion={(accion || exportar) && (
        <span className="flex flex-wrap items-center gap-2">
          {accion}
          <Botones titulo={titulo} descripcion={descripcion} exportar={exportar} png={false} contenedor={ref} />
        </span>
      )}>
      <div ref={ref}>{children}</div>
      <Pie exportar={exportar} />
    </Panel>
  )
}
