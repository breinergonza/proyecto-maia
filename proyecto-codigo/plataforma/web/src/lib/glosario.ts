// Definiciones cortas, en lenguaje no técnico, de los términos que aparecen en las pantallas de modelos y programación.
// Cada una cabe en 160 caracteres para mostrarse en un globo breve. La pantalla usa la palabra clínica; cuando hay
// término estadístico, la definición lo nombra al final («En estadística: …»), así no hace falta un modo técnico (S22).
export const GLOSARIO = {
  auc: 'Qué tan bien separa el modelo a los niños con y sin el problema. 1 es perfecto; 0,5 es lanzar una moneda. En estadística: AUC.',
  roc: 'Curva de los casos detectados frente a las falsas alarmas. Cuanto más se aleja de la diagonal, mejor ordena. En estadística: curva ROC.',
  curva_pr: 'Curva de las alertas acertadas frente a los casos detectados. En estadística: curva de precisión y exhaustividad.',
  psi: 'Cuánto cambiaron los niños actuales frente a los del entrenamiento. Si es alto, conviene revisar el modelo. En estadística: PSI.',
  percentil: 'Lugar del niño entre todos, de 0 a 100. Un percentil 95 significa que solo 5 de cada 100 niños tienen más riesgo.',
  calibracion: 'Qué tanto coincide el riesgo que dice el modelo con lo que ocurre de verdad. Con 20 % de riesgo, debería pasar en 2 de cada 10.',
  sensibilidad: 'De los niños que tuvieron el problema, cuántos recibieron alerta. Alta: se escapan pocos. En estadística: sensibilidad.',
  vpp: 'De los niños con alerta, cuántos tuvieron el problema. Alta: pocas alarmas en vano. En estadística: valor predictivo positivo (VPP).',
  especificidad: 'De los niños que no tuvieron el problema, cuántos quedaron sin alerta. Alta: pocas falsas alarmas. En estadística: especificidad.',
  umbral: 'Qué parte de los niños, los de más riesgo, recibe alerta. Al 10 %: 1 de cada 10. En estadística: umbral (percentil de riesgo).',
  brier: 'Error promedio del porcentaje de riesgo. Va de 0 a 1; cuanto más cerca de 0, más confiable. En estadística: puntaje de Brier.',
  razon_riesgo: 'El riesgo promedio que dijo el modelo dividido por el que ocurrió. 1 es lo ideal. En estadística: razón esperado / observado.',
  ece: 'Distancia promedio entre el riesgo que dice el modelo y el que ocurre, por tramos. Cerca de 0 es mejor. En estadística: ECE.',
  pr_auc: 'Qué tan bien acierta el modelo cuando marca a un niño, sobre todo si el problema es poco frecuente. En estadística: PR-AUC.',
  falsas_por_1000: 'Niños marcados en riesgo que al final no tenían el problema, por cada 1.000 revisados.',
  mediana: 'Valor del medio: la mitad de los niños tiene un riesgo menor y la otra mitad, mayor.',
  oms: 'Organización Mundial de la Salud. Sus curvas muestran cómo crecen los niños sanos; aquí se comparan con la edad corregida.',
  de: 'Desviación estándar (DE): cuánto se aleja una medida del valor medio de los niños sanos de su edad en la OMS. Bajo −2 DE: bajo para la edad.',
  rango_esperado: 'De −2 a +2 desviaciones estándar (DE) de la curva de la OMS. Ahí queda la medida de unos 95 de cada 100 niños sanos de esa edad.',
  edad_corregida: 'Edad contada desde la fecha en que el niño debía nacer (40 semanas de gestación), no desde el parto. Así se compara bien a un prematuro.',
  cron: 'Forma corta de indicar cuándo se repite una tarea con cinco campos: minuto, hora, día del mes, mes y día de la semana.',
} as const

export type IdTermino = keyof typeof GLOSARIO
