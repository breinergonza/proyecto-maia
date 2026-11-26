// Gráfica y tabla con su descripción siempre visible (D53) y botones para llevarse el dato: PNG de la gráfica y CSV de las filas.
import { useRef, useState, type ReactNode } from 'react'
import { aCsv, descargar, nombreArchivo, svgAPng, type FilaCsv } from '../lib/exportar'
import { LimiteError } from './LimiteError'
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

/** Lo que cada persona eligió ver (gráfico o tabla) mientras la página siga abierta; sobrevive a cambiar de pestaña. */
const eleccionTabla = new Map<string, boolean>()

function celda(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—'
  return typeof v === 'number' ? String(v).replace('.', ',') : v
}

/** Los mismos datos de la gráfica como tabla HTML (columnas de `exportar.columnas` o las claves de la primera fila). */
function TablaDeFilas({ titulo, filas, columnas }: { titulo: string; filas: FilaCsv[]; columnas?: string[] }) {
  const cols = columnas ?? Object.keys(filas[0] ?? {})
  return (
    <div className="max-h-80 overflow-auto lg:max-h-[min(28rem,60vh)] rounded-control border border-linea">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Datos de la gráfica: {titulo}</caption>
        <thead className="sticky top-0 bg-fondo text-xs font-semibold text-salvia">
          <tr>{cols.map((c) => <th key={c} scope="col" className="px-3 py-2">{c}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-t border-linea">
              {cols.map((c) => <td key={c} className="px-3 py-1.5 tabular-nums">{celda(f[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BotonCsv({ titulo, exportar }: { titulo: string; exportar: Exportar }) {
  if (!exportar.filas) return null
  const filas = exportar.filas
  return (
    <Boton variante="secundario" chico aria-label={`Descargar CSV: ${titulo}`}
      onClick={() => descargar(new Blob([aCsv(filas, exportar.columnas)], { type: 'text/csv;charset=utf-8' }), nombreArchivo(exportar.nombre, 'csv'))}>
      Descargar datos (CSV)
    </Boton>
  )
}

function Botones({ titulo, descripcion, exportar, png, contenedor, tabla, alternarTabla }: {
  titulo: string; descripcion: string; exportar?: Exportar; png: boolean; contenedor: React.RefObject<HTMLDivElement | null>
  /** Solo en gráficas con filas: si se está viendo la tabla y cómo alternar. */
  tabla?: boolean; alternarTabla?: () => void
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
      {alternarTabla && (
        <Boton variante={tabla ? 'primario' : 'secundario'} chico aria-pressed={!!tabla} onClick={alternarTabla}>
          Ver como tabla
        </Boton>
      )}
      {png && !tabla && <Boton variante="secundario" chico aria-label={`Descargar PNG: ${titulo}`} onClick={bajarPng}>Descargar gráfica (PNG)</Boton>}
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
  const filas = exportar?.filas && exportar.filas.length > 0 ? exportar.filas : undefined
  const [tabla, setTabla] = useState(() => !!filas && eleccionTabla.get(titulo) === true)
  const alternar = () => { eleccionTabla.set(titulo, !tabla); setTabla(!tabla) }
  const verTabla = !!filas && tabla
  return (
    <Panel titulo={titulo} descripcion={descripcion} className={className} llenar={llenar}
      accion={(accion || exportar) && (
        <span className="flex flex-wrap items-center gap-2">
          {accion}
          <Botones titulo={titulo} descripcion={descripcion} exportar={exportar} png contenedor={ref} tabla={verTabla}
            alternarTabla={filas ? alternar : undefined} />
        </span>
      )}>
      <div ref={ref}>
        {verTabla
          ? <TablaDeFilas titulo={titulo} filas={filas} columnas={exportar?.columnas} />
          : <LimiteError nombre={`la gráfica «${titulo}»`}>{children}</LimiteError>}
      </div>
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
      <div ref={ref}><LimiteError nombre={`la tabla «${titulo}»`}>{children}</LimiteError></div>
      <Pie exportar={exportar} />
    </Panel>
  )
}
