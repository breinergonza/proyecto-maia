// Los submódulos de la analítica, en el orden en que se muestran (menú, fichas y rutas). `titulo` es el nombre completo
// del encabezado y `pregunta` la única pregunta que responde cada uno (plan v3.7, sección 6.2).
export const SUBMODULOS = [
  { id: 'resumen', texto: 'Resumen', titulo: 'Resumen', pregunta: '¿Cómo está este entrenamiento de un vistazo?' },
  { id: 'rendimiento', texto: 'Rendimiento', titulo: 'Rendimiento', pregunta: '¿Qué tan bien separa a los niños que tendrán el desenlace de los que no, y cuántas alertas daría?' },
  { id: 'anticipacion', texto: 'Anticipación', titulo: 'Anticipación', pregunta: '¿Con cuánta ventaja avisa la alerta antes de que pase el desenlace?' },
  { id: 'calibracion', texto: 'Calibración', titulo: 'Calibración y decisión', pregunta: '¿El riesgo que da el modelo es creíble, y a cuántos niños conviene revisar?' },
  { id: 'interpretabilidad', texto: 'Qué datos pesan', titulo: 'Qué datos pesan', pregunta: '¿Qué datos del niño explican el riesgo que da el modelo?' },
  { id: 'poblacion', texto: 'Población', titulo: 'Población', pregunta: '¿Quiénes están en la muestra y qué tan completos están sus datos?' },
  { id: 'equidad', texto: 'Equidad', titulo: 'Equidad', pregunta: '¿Funciona igual de bien en cada grupo de niños?' },
  { id: 'estabilidad', texto: 'Estabilidad', titulo: 'Estabilidad temporal', pregunta: '¿El modelo se mantiene con el tiempo o hay que reentrenarlo?' },
  { id: 'trayectorias', texto: 'Trayectorias', titulo: 'Trayectorias', pregunta: '¿Cómo crecen los niños según su riesgo?' },
  { id: 'perfiles', texto: 'Perfiles', titulo: 'Perfiles', pregunta: '¿A qué grupo de niños parecidos pertenece cada niño, y qué les suele pasar?' },
  { id: 'comparar', texto: 'Comparar', titulo: 'Comparar', pregunta: '¿Qué entrenamiento, o qué grupo de niños, es distinto?' },
] as const

export type IdSubmodulo = (typeof SUBMODULOS)[number]['id']
export const esSubmodulo = (id: string | undefined): id is IdSubmodulo => SUBMODULOS.some((s) => s.id === id)
