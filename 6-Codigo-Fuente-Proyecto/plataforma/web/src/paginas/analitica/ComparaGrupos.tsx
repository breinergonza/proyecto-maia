// Cómo se dice una diferencia de B frente a A en Modelos › Comparar (entrenamientos): con su signo y, en puntos
// porcentuales, con la palabra «puntos». La comparación de dos grupos de niños vive ahora en Comparar grupos
// (components/comparar), con sus propias preguntas.
const signo = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '')

export const difTexto = (v: number, unidad: string) =>
  `${signo(v)}${Math.abs(v).toLocaleString('es-CO', { maximumFractionDigits: unidad === 'pp' ? 1 : 2 })}${unidad === 'pp' ? ' puntos' : ''}`
