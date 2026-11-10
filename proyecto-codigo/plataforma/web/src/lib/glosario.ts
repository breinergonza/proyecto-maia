// Definiciones cortas, en lenguaje no técnico, de los términos que aparecen en las pantallas de modelos y programación.
// Cada una cabe en 160 caracteres para mostrarse en un globo breve.
export const GLOSARIO = {
  auc: 'Mide qué tan bien el modelo separa a los niños con y sin el problema. 1 es perfecto; 0,5 equivale a lanzar una moneda.',
  roc: 'Curva que compara los aciertos con las falsas alarmas del modelo. Mientras más se aleje de la diagonal, mejor es el modelo.',
  psi: 'Indica cuánto cambió el grupo de niños actual frente al de entrenamiento. Si es alto, conviene revisar el modelo.',
  percentil: 'Lugar del niño entre todos, de 0 a 100. Un percentil 95 significa que solo 5 de cada 100 niños tienen más riesgo.',
  calibracion: 'Qué tanto coincide el riesgo que dice el modelo con lo que ocurre de verdad. Con 20 % de riesgo, debería pasar en 2 de cada 10.',
  sensibilidad: 'De los niños que sí tendrán el problema, qué parte detecta el modelo. Alta quiere decir que se le escapan pocos.',
  especificidad: 'De los niños que no tendrán el problema, qué parte descarta bien el modelo. Alta quiere decir pocas falsas alarmas.',
  brier: 'Error promedio de las probabilidades del modelo. Va de 0 a 1; mientras más cerca de 0, más confiable es el riesgo.',
  pr_auc: 'Mide qué tan bien el modelo acierta cuando marca a un niño en riesgo, sobre todo si el problema es poco frecuente.',
  falsas_por_1000: 'Niños marcados en riesgo que al final no tenían el problema, por cada 1.000 revisados.',
  mediana: 'Valor del medio: la mitad de los niños tiene un riesgo menor y la otra mitad, mayor.',
  cron: 'Forma corta de indicar cuándo se repite una tarea con cinco campos: minuto, hora, día del mes, mes y día de la semana.',
} as const

export type IdTermino = keyof typeof GLOSARIO
