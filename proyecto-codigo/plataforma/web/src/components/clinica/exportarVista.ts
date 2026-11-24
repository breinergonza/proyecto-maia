// Las cifras de la Vista clínica como filas de un CSV (sección, dato, valor): el grupo, lo observado a los 12 meses, el riesgo
// por visita de cálculo y el crecimiento por visita, cada cifra con su denominador. Lleva lo mismo que la pantalla dice del
// grupo; no lleva niños individuales. Los conteos van como números y los porcentajes y medianas con coma decimal.
import type { ClinicaResumen } from '../../api/tipos'
import type { FilaCsv } from '../../lib/exportar'
import { indicador as nombreIndicador, numero } from '../../lib/formato'
import { aMomento } from './RiesgoPorCorte'

export const COLUMNAS_VISTA = ['Sección', 'Dato', 'Valor']

const esPuntajeZ = (unidad: string) => /(^|\s)z(\s|$)/i.test(unidad)
const nombreVisita = (etapa: string) => etapa.replace(' (edad corregida)', ' EC')

export function filasDeLaVista(r: ClinicaResumen): FilaCsv[] {
  const filas: FilaCsv[] = []
  const agregar = (seccion: string, dato: string, valor: string | number | null | undefined) => {
    if (valor != null) filas.push({ Sección: seccion, Dato: dato, Valor: valor })
  }
  // el grupo son todos los niños: la población como referencia repetiría las mismas cifras
  const esPoblacion = r.grupo.n === r.grupo.n_total

  agregar('Grupo', 'Niños elegibles del grupo', r.grupo.n)
  agregar('Grupo', 'Niños elegibles en total', r.grupo.n_total)
  agregar('Grupo', 'Desenlace', r.familias.find((f) => f.clave === r.familia)?.nombre ?? r.familia)
  agregar('Grupo', 'Datos al', r.datos_al)

  const observado = 'Observado a los 12 meses'
  if (r.observado.grupo) {
    const o = r.observado.grupo
    agregar(observado, 'Grupo: % con el desenlace', numero(o.pct))
    agregar(observado, 'Grupo: casos', o.casos)
    agregar(observado, 'Grupo: niños con dato', o.con_dato)
    agregar(observado, 'Grupo: niños sin dato', o.sin_dato)
  }
  if (r.observado.poblacion && !esPoblacion) {
    const o = r.observado.poblacion
    agregar(observado, 'Toda la población: % con el desenlace', numero(o.pct))
    agregar(observado, 'Toda la población: casos', o.casos)
    agregar(observado, 'Toda la población: niños con dato', o.con_dato)
  }

  for (const f of r.riesgo) {
    const visita = `Calculado ${aMomento(f.momento)}`
    agregar('Riesgo estimado', `${visita}: niños en alerta`, f.en_alerta)
    agregar('Riesgo estimado', `${visita}: niños con riesgo calculado`, f.calculados)
    agregar('Riesgo estimado', `${visita}: % en alerta`, numero(f.pct_en_alerta))
  }

  const { indicador, unidad, etapas } = r.trayectoria
  const crecimiento = `Crecimiento: ${nombreIndicador(indicador).toLowerCase()} (${esPuntajeZ(unidad) ? 'puntaje z' : unidad})`
  for (const e of etapas) {
    const visita = nombreVisita(e.etapa)
    if (e.grupo) {
      agregar(crecimiento, `${visita}: niños del grupo con dato`, e.grupo.n)
      if (e.grupo.mediana != null) agregar(crecimiento, `${visita}: mediana del grupo`, numero(e.grupo.mediana))
      if (e.grupo.p25 != null && e.grupo.p75 != null) {
        agregar(crecimiento, `${visita}: mitad central del grupo`, `${numero(e.grupo.p25)} a ${numero(e.grupo.p75)}`)
      }
      // las dos pestañas de la gráfica (D79): promedio, DE y varianza, y los bigotes de la caja de cuartiles
      if (e.grupo.media != null) agregar(crecimiento, `${visita}: promedio del grupo`, numero(e.grupo.media))
      if (e.grupo.de != null) agregar(crecimiento, `${visita}: DE del grupo`, numero(e.grupo.de))
      if (e.grupo.varianza != null) agregar(crecimiento, `${visita}: varianza del grupo`, numero(e.grupo.varianza))
      if (e.grupo.bigote_bajo != null && e.grupo.bigote_alto != null) {
        agregar(crecimiento, `${visita}: mínimo y máximo no atípicos del grupo`, `${numero(e.grupo.bigote_bajo)} a ${numero(e.grupo.bigote_alto)}`)
      }
    }
    if (e.poblacion?.mediana != null && !esPoblacion) agregar(crecimiento, `${visita}: mediana de toda la población`, numero(e.poblacion.mediana))
    if (e.poblacion?.media != null && !esPoblacion) agregar(crecimiento, `${visita}: promedio de toda la población`, numero(e.poblacion.media))
  }
  return filas
}
