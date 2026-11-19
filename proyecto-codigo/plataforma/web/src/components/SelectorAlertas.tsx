// Selector múltiple de alertas: lista con casillas y buscador. Lo elegido se conserva al filtrar.
import { useId, useState } from 'react'
import { cn } from '../lib/cn'
import { coincide, normalizar } from './BuscarMenu'

export interface OpcionAlerta { clave: string; nombre: string }

interface Props {
  id: string
  etiqueta: string
  opciones: OpcionAlerta[]
  value: string[]
  onChange: (claves: string[]) => void
  error?: string
}

export function SelectorAlertas({ id, etiqueta, opciones, value, onChange, error }: Props) {
  const [filtro, setFiltro] = useState('')
  const idAyuda = useId()
  // «coincide» espera el filtro normalizado (sin tildes ni mayúsculas): «READMISION» encuentra «readmisión».
  const visibles = filtro.trim() ? opciones.filter((o) => coincide(o.nombre, normalizar(filtro))) : opciones
  const alternar = (clave: string) => onChange(value.includes(clave) ? value.filter((c) => c !== clave) : [...value, clave])
  const resumen = value.length === 0 ? 'Ninguna alerta elegida' : value.length === 1 ? '1 alerta elegida' : `${value.length} alertas elegidas`
  return (
    <fieldset aria-describedby={idAyuda}>
      <legend className="mb-1.5 text-sm font-semibold text-tinta/90">{etiqueta}</legend>
      <input type="search" id={id} aria-label="Buscar alerta" placeholder="Buscar alerta…" value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        className="mb-2 w-full rounded-control border border-linea bg-papel px-3 py-2 text-[0.95rem]" />
      <ul className="max-h-56 divide-y divide-linea overflow-auto rounded-control border border-linea bg-papel">
        {visibles.map((o) => (
          <li key={o.clave}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[0.95rem] hover:bg-fondo">
              <input type="checkbox" className="size-4 accent-teal" checked={value.includes(o.clave)} onChange={() => alternar(o.clave)} />
              {o.nombre}
            </label>
          </li>
        ))}
        {visibles.length === 0 && <li className="px-3 py-2 text-sm text-salvia">Ninguna alerta coincide.</li>}
      </ul>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p id={idAyuda} className={cn(error ? 'text-coral-hondo' : 'text-salvia')} role={error ? 'alert' : undefined}>
          {error ?? resumen}
        </p>
        <span className="flex gap-3">
          <button type="button" className="text-teal underline" onClick={() => onChange(opciones.map((o) => o.clave))}>Elegir todas</button>
          <button type="button" className="text-teal underline" onClick={() => onChange([])}>Quitar todas</button>
        </span>
      </div>
    </fieldset>
  )
}
