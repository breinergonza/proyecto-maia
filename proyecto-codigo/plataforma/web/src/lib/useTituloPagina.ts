// Título de la pestaña del navegador según la ruta. La tabla ruta → título vive aquí, en un solo lugar.
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { SUBMODULOS } from '../paginas/analitica/submodulos'

export const NOMBRE_APP = 'Observatorio Canguro'

const TITULOS: Record<string, string> = {
  '/': 'Vista clínica',
  '/tablero': 'Resumen',
  '/comparar': 'Comparar grupos',
  '/explorar': 'Explorar',
  '/ninos': 'Niños',
  '/revision/riesgos': 'Revisión de riesgos',
  '/prediccion': 'Calcular un niño',
  '/mis-modelos': 'Mis modelos',
  '/diccionario': 'Diccionario',
  '/admin/calidad-datos': 'Calidad de datos',
  '/admin/configuracion': 'Configuración',
  '/admin/programacion': 'Programación',
  '/admin/entrenamientos': 'Entrenamientos',
  '/admin/modelos': 'Modelos',
  '/admin/corridas': 'Corridas',
  '/admin/usuarios': 'Usuarios',
  '/notificaciones/servidor': 'Servidor de correo',
  '/notificaciones/alertas': 'Alertas por correo',
  '/analitica': 'Analítica',
}

/** Nombre de la página para una ruta (sin el nombre de la aplicación). */
export function nombrePagina(pathname: string): string {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (TITULOS[ruta]) return TITULOS[ruta]
  const analitica = /^\/analitica\/([^/]+)$/.exec(ruta)
  if (analitica) {
    const sub = SUBMODULOS.find((s) => s.id === analitica[1])
    return sub ? `Analítica: ${sub.texto}` : 'Analítica'
  }
  const nino = /^\/ninos\/([^/]+)$/.exec(ruta)
  if (nino) {
    try { return `Niño ${decodeURIComponent(nino[1])}` } catch { return 'Ficha del niño' }
  }
  return 'No existe esa página'
}

export const tituloDocumento = (pathname: string) => `${nombrePagina(pathname)} · ${NOMBRE_APP}`

/** Pone el título de la pestaña según la ruta y lo devuelve para anunciarlo a lectores de pantalla. */
export function useTituloPagina(): string {
  const { pathname } = useLocation()
  const titulo = tituloDocumento(pathname)
  useEffect(() => { document.title = titulo }, [titulo])
  return titulo
}
