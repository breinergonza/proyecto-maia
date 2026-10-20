// Configuración en tiempo de ejecución: la escribe nginx en /config.js al arrancar el contenedor.
declare global {
  interface Window {
    __MAIA__?: { entorno?: string }
  }
}

export const entorno = (): string => window.__MAIA__?.entorno ?? 'local'
export const esDemo = () => entorno() === 'demo'
