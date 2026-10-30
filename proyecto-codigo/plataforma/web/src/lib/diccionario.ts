// El diccionario de variables: lo que comparten la página, el menú (insignia) y el tablero (aviso).
import { useQuery } from '@tanstack/react-query'
import { pedir, pedirArchivo } from '../api/cliente'
import type { OrigenVersion, PorClasificar, VersionDiccionario } from '../api/tipos-diccionario'

/** Variables por clasificar de la vigente y, si hay, la actualización con variables nuevas que falta agregar. */
export const usePorClasificar = (habilitado = true) =>
  useQuery({
    queryKey: ['diccionario', 'por-clasificar'],
    queryFn: () => pedir<PorClasificar>('/diccionario/por-clasificar'),
    enabled: habilitado,
    refetchInterval: 5 * 60_000,
  })

export const ORIGENES: Record<OrigenVersion, string> = {
  subido: 'Subida desde la web',
  corrida: 'Actualización con la base',
  semilla: 'Diccionario inicial',
}

export const origen = (v: VersionDiccionario) =>
  v.origen === 'subido' && v.creado_por ? `Subida por ${v.creado_por}` : ORIGENES[v.origen]

/** Descarga una versión como .xlsx (con la sesión en la cabecera). */
export async function descargarVersion(v: Pick<VersionDiccionario, 'id' | 'version'> | null) {
  const blob = await pedirArchivo(v ? `/diccionario/versiones/${v.id}/archivo` : '/diccionario/vigente/archivo')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = v ? `diccionario_v${v.version}.xlsx` : 'diccionario.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
