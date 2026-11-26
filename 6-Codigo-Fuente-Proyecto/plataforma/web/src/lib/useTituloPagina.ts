// Título de la pestaña del navegador según la ruta. La tabla ruta → título vive aquí, en un solo lugar.
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { SUBMODULOS } from '../paginas/analitica/submodulos'

export const NOMBRE_APP = 'KMCPred'
/** Qué es la plataforma, en una frase (D78). */
export const DESCRIPCION_APP =
  'Sistema interpretable de alertas y predicción temprana de riesgos en niños prematuros y de bajo peso del Programa Madre Canguro'
/** Versión corta para el menú lateral, donde la frase completa no cabe. */
export const LEMA_APP = 'Alertas y predicción temprana'

const TITULOS: Record<string, string> = {
  '/ingresar': 'Iniciar sesión',
  '/': 'Seguimiento clínico',
  '/tablero': 'Resumen de riesgos y calidad de datos',
  '/comparar': 'Comparar grupos de niños',
  '/explorar': 'Explorar grupos de niños',
  '/ninos': 'Listado de niños',
  '/revision/riesgos': 'Revisión clínica de casos',
  '/prediccion': 'Estimar riesgo',
  '/mis-modelos': 'Entrenamientos propios',
  '/diccionario': 'Guía de variables y unidades',
  '/admin/calidad-datos': 'Mediciones por revisar',
  '/admin/configuracion': 'Configuración del sistema y del entrenamiento',
  '/admin/programacion': 'Programar ejecuciones automáticas',
  '/admin/entrenamientos': 'Entrenar y aprobar modelos',
  '/admin/modelos': 'Modelos disponibles',
  '/admin/corridas': 'Recalcular riesgos',
  '/admin/usuarios': 'Usuarios y permisos',
  '/notificaciones/servidor': 'Configuración del correo saliente',
  '/notificaciones/alertas': 'Reglas y envíos de alertas por correo',
  '/analitica': 'Ficha del modelo',
}

/** Nombre de la página para una ruta (sin el nombre de la aplicación). */
export function nombrePagina(pathname: string): string {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (TITULOS[ruta]) return TITULOS[ruta]
  const analitica = /^\/analitica\/([^/]+)$/.exec(ruta)
  if (analitica) {
    const sub = SUBMODULOS.find((s) => s.id === analitica[1])
    return sub ? sub.titulo : 'Evaluación de modelos'
  }
  const nino = /^\/ninos\/([^/]+)$/.exec(ruta)
  if (nino) {
    try { return `Ficha clínica · ${decodeURIComponent(nino[1])}` } catch { return 'Ficha clínica del niño' }
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
