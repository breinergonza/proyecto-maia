// Página tolerante para los submódulos que el backend completa por partes (anticipación, trayectorias, perfiles): con
// `pendiente` o `sin_artefactos` muestra el estado vacío; con datos, cada lista de filas planas se muestra como tabla y
// cada cifra suelta como tarjeta. Toda celda de un grupo con menos de 5 niños dice «n menor que 5».
import type { ReactNode } from 'react'
import { useSubmodulo } from '../../api/analitica'
import { TablaDatos } from '../../components/grafica'
import { Cifra, Panel, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { frase } from '../../lib/formato'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { Guia, PorDesenlace } from './comun'
import { useContextoAnalitica } from './contexto'

type Fila = Record<string, string | number | boolean | null>
const esFila = (v: unknown): v is Fila => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => x == null || typeof x !== 'object')
const esLista = (v: unknown): v is Fila[] => Array.isArray(v) && v.length > 0 && v.every(esFila)

function celda(v: string | number | boolean | null | undefined): string {
  if (v == null) return N_MENOR_QUE_5
  if (v === 'n<5') return N_MENOR_QUE_5
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('es-CO') : v.toLocaleString('es-CO', { maximumFractionDigits: 3 })
  return String(v)
}

function Lista({ nombre, filas, clave }: { nombre: string; filas: Fila[]; clave: string }) {
  const d = descripcionDe(clave)
  const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))]
  // un grupo con menos de 5 niños no enseña ninguna cifra
  const visibles = filas.slice(0, 60).map((f) => (typeof f.n === 'number' && f.n < 5 ? Object.fromEntries(columnas.map((c) => [c, 'n<5'])) as Fila : f))
  return (
    <TablaDatos titulo={`${d.titulo}: ${frase(nombre.replaceAll('_', ' '))}`} descripcion={d.descripcion}
      exportar={{ nombre: `${clave}-${nombre}`, filas: visibles as Record<string, string | number | null>[] }}>
      <Tabla densa>
        <thead><tr>{columnas.map((c) => <th key={c}>{frase(c.replaceAll('_', ' '))}</th>)}</tr></thead>
        <tbody>{visibles.map((f, i) => <tr key={i}>{columnas.map((c) => <td key={c}>{celda(f[c])}</td>)}</tr>)}</tbody>
      </Tabla>
    </TablaDatos>
  )
}

export default function PaginaGenerica({ submodulo, clave, guia }: { submodulo: string; clave: string; guia: ReactNode }) {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<Record<string, unknown>>(entrenamiento, submodulo, desenlace)
  return (
    <div className="space-y-4">
      <Guia>{guia}</Guia>
      <PorDesenlace consulta={consulta}>
        {(datos) => {
          const entradas = Object.entries(datos)
          const sueltas = entradas.filter(([, v]) => typeof v === 'number' || typeof v === 'string')
          const listas = entradas.filter(([, v]) => esLista(v)) as [string, Fila[]][]
          return (
            <>
              {sueltas.length > 0 && (
                <Panel titulo={descripcionDe(clave).titulo} descripcion={descripcionDe(clave).descripcion}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {sueltas.map(([k, v]) => <Cifra key={k} valor={celda(v as string | number)} texto={frase(k.replaceAll('_', ' '))} />)}
                  </div>
                </Panel>
              )}
              {listas.map(([k, filas]) => <Lista key={k} nombre={k} filas={filas} clave={clave} />)}
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
