// Los submódulos de la analítica, en el orden en que se muestran (menú, fichas y rutas). `titulo` es el nombre completo
// del encabezado y `pregunta` la única pregunta que responde cada uno (plan v3.7, sección 6.2).
export const SUBMODULOS = [
  { id: 'resumen', texto: 'Ficha del modelo', titulo: 'Ficha del modelo', pregunta: '¿Cómo se entrenó este modelo, qué entrenamiento es y qué tan bien funciona con niños que no vio?' },
  { id: 'rendimiento', texto: 'Detección y falsas alertas', titulo: 'Detección y falsas alertas', pregunta: '¿Qué tan bien separa a los niños que tendrán el desenlace de los que no, y cuántas alertas daría?' },
  { id: 'anticipacion', texto: 'Anticipación de las alertas', titulo: 'Anticipación de las alertas', pregunta: '¿Con cuánta anticipación se detectan los casos antes de la evaluación de los 12 meses?' },
  { id: 'calibracion', texto: 'Calibración y umbrales de alerta', titulo: 'Calibración y umbrales de alerta', pregunta: '¿El riesgo que da el modelo es creíble, y a cuántos niños conviene revisar?' },
  { id: 'interpretabilidad', texto: 'Variables que influyen en la estimación', titulo: 'Variables que influyen en la estimación', pregunta: '¿Qué datos influyen más en las estimaciones del modelo?' },
  { id: 'poblacion', texto: 'Niños incluidos y datos disponibles', titulo: 'Niños incluidos y datos disponibles', pregunta: '¿Qué niños incluye la evaluación y qué datos faltan?' },
  { id: 'equidad', texto: 'Rendimiento por grupo de niños', titulo: 'Rendimiento por grupo de niños', pregunta: '¿Cambia la capacidad de detectar casos o la frecuencia de falsas alertas según el grupo?' },
  { id: 'estabilidad', texto: 'Rendimiento del modelo en el tiempo', titulo: 'Rendimiento del modelo en el tiempo', pregunta: '¿El modelo se mantiene con el tiempo o hay que reentrenarlo?' },
  { id: 'trayectorias', texto: 'Evolución del crecimiento', titulo: 'Evolución del crecimiento', pregunta: '¿Cómo crecen los niños según su riesgo?' },
  { id: 'perfiles', texto: 'Perfiles de niños', titulo: 'Grupos de niños con características similares', pregunta: '¿A qué grupo de niños parecidos pertenece cada niño, y qué les suele pasar?' },
  { id: 'comparar', texto: 'Comparar entrenamientos', titulo: 'Comparar entrenamientos', pregunta: '¿En qué se diferencia un entrenamiento de otro?' },
] as const

export type IdSubmodulo = (typeof SUBMODULOS)[number]['id']
export const esSubmodulo = (id: string | undefined): id is IdSubmodulo => SUBMODULOS.some((s) => s.id === id)
