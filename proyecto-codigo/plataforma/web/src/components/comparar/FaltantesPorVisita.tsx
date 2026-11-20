// «¿Faltan datos distintos?»: el porcentaje de niños de cada grupo sin una talla válida en cada visita y sin dato a los
// 12 meses, cada uno con su denominador (los niños elegibles del grupo). Un grupo que llegó menos a una visita se ve aquí
// antes de leer sus medianas.
import type { GruposClinicoOk } from '../../api/comparar'
import { num } from '../../lib/formato'
import { Grafica } from '../grafica'
import { BarrasAgrupadas } from '../graficos/distribuciones'
import { Tabla } from '../ui'
import { FichaDelDato, MENOS_DE_5, ninos, porcentaje, SERIES_AB } from './comun'

const sinDato = (sin: number, de: number, pct: number) => `${num(sin)} de ${num(de)} (${porcentaje(pct)})`

export function FaltantesPorVisita({ r }: { r: GruposClinicoOk }) {
  const etapas = r.trayectoria.etapas
  const filas = etapas.map((e) => ({ x: e.etapa, a: e.a?.pct_sin_dato ?? null, b: e.b?.pct_sin_dato ?? null }))
  const csv = etapas.map((e) => ({
    Visita: e.etapa, 'Grupo A: sin dato': e.a?.sin_dato ?? null, 'Grupo A: %': e.a?.pct_sin_dato ?? null,
    'Grupo B: sin dato': e.b?.sin_dato ?? null, 'Grupo B: %': e.b?.pct_sin_dato ?? null,
  }))
  const doce = r.desenlaces.filter((d) => d.a != null || d.b != null)
  return (
    <div className="flex flex-col gap-4">
      <Grafica titulo="Niños sin dato de talla, visita por visita"
        descripcion="Porcentaje de los niños de cada grupo sin una talla válida en cada visita. Incluye a quienes aún no llegan a esa visita, no asistieron o no tienen una medida válida."
        exportar={{ nombre: 'comparar-grupos-sin-dato-por-visita', filas: csv, columnas: Object.keys(csv[0] ?? {}) }}>
        <BarrasAgrupadas etiqueta="Niños sin dato de talla en cada visita, grupo A frente a grupo B (%)" filas={filas} series={SERIES_AB}
          dominioY={[0, 'auto']} />
        <div className="mt-4">
          <Tabla densa apilar>
            <caption className="sr-only">Niños sin dato de talla en cada visita</caption>
            <thead><tr><th>Visita</th><th>Grupo A</th><th>Grupo B</th></tr></thead>
            <tbody>
              {etapas.map((e) => (
                <tr key={e.etapa}>
                  <td>{e.etapa}</td>
                  <td>{e.a ? sinDato(e.a.sin_dato, r.a.n, e.a.pct_sin_dato) : MENOS_DE_5}</td>
                  <td>{e.b ? sinDato(e.b.sin_dato, r.b.n, e.b.pct_sin_dato) : MENOS_DE_5}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </div>
        <FichaDelDato items={{
          variable: 'medición de talla para la edad (puntaje z, referencia OMS)', unidad: '% de los niños elegibles del grupo sin dato',
          momento: 'cada visita, en edad corregida',
          poblacion: `niños elegibles de cada grupo (Grupo A: ${ninos(r.a.n)}; Grupo B: ${ninos(r.b.n)})`,
          validos: 'denominador: los niños elegibles del grupo; una visita con menos de 5 niños con dato no da cifra',
        }} />
      </Grafica>
      {doce.length > 0 && (
        <Grafica titulo="Desenlaces a los 12 meses sin dato"
          descripcion="Niños de cada grupo de los que no se sabe si tuvieron el desenlace a los 12 meses, sobre todos los niños elegibles del grupo.">
          <Tabla densa apilar>
            <caption className="sr-only">Niños sin dato de cada desenlace a los 12 meses</caption>
            <thead><tr><th>Desenlace</th><th>Grupo A</th><th>Grupo B</th></tr></thead>
            <tbody>
              {doce.map((d) => (
                <tr key={d.clave}>
                  <td>{d.nombre}</td>
                  <td>{d.a?.sin_dato != null ? sinDato(d.a.sin_dato, r.a.n, (100 * d.a.sin_dato) / r.a.n) : 'menos de 5 niños con dato'}</td>
                  <td>{d.b?.sin_dato != null ? sinDato(d.b.sin_dato, r.b.n, (100 * d.b.sin_dato) / r.b.n) : 'menos de 5 niños con dato'}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <FichaDelDato items={{
            variable: 'desenlace observado a los 12 meses', unidad: '% de los niños elegibles del grupo sin dato', momento: '12 meses de edad corregida',
            poblacion: `niños elegibles de cada grupo (Grupo A: ${ninos(r.a.n)}; Grupo B: ${ninos(r.b.n)})`,
            validos: 'denominador: los niños elegibles del grupo',
          }} />
        </Grafica>
      )}
    </div>
  )
}
