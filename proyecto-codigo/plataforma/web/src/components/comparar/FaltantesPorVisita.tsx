// «¿Faltan datos distintos?»: el porcentaje de niños de cada grupo sin una talla válida en cada visita y sin dato a los
// 12 meses, cada uno con su denominador (los niños elegibles del grupo). Cada cifra va en una tabla con su barra al lado,
// así la tabla es la gráfica y no la repite. Un grupo que llegó menos a una visita se ve aquí antes de leer sus medianas.
import type { GruposClinicoOk } from '../../api/comparar'
import { cn } from '../../lib/cn'
import { TablaDatos } from '../grafica'
import type { Serie } from '../graficos'
import { Tabla } from '../ui'
import { Barra, FichaDelDato, MENOS_DE_5, PctDe, poblacionAB, SERIE_A, SERIE_B, techoDe } from './comun'

/** Los sin dato de un grupo sobre sus elegibles, o el texto que dice por qué no hay cifra. */
type Celda = { sin: number; de: number; pct: number } | string

function CeldaSinDato({ c, serie, techo, grande }: { c: Celda; serie: Serie; techo: number; grande: boolean }) {
  if (typeof c === 'string') return <td>{c}</td>
  // La cifra arriba y la barra debajo, a todo lo ancho de la columna: las dos columnas tienen el mismo ancho, así las
  // barras de A y de B comparten escala.
  return (
    <td>
      <PctDe pct={c.pct} x={c.sin} de={c.de} />
      <Barra pct={c.pct} techo={techo} serie={serie} className={grande ? 'mt-1.5 h-6 w-full' : 'mt-1 w-full'} />
    </td>
  )
}

/** ``grande``: en una pantalla alta, barras como las de lo observado (las de las otras preguntas) y filas más holgadas. */
function TablaSinDato({ titulo, primera, filas, grande }: {
  titulo: string; primera: string; filas: { clave: string; nombre: string; a: Celda; b: Celda }[]; grande: boolean
}) {
  const techo = techoDe(filas.flatMap((f) => [f.a, f.b].map((c) => (typeof c === 'string' ? null : c.pct))))
  return (
    <Tabla densa className={cn(grande && '[&_td]:py-3!')}>
      <caption className="sr-only">{titulo}</caption>
      <colgroup><col /><col className="w-[38%]" /><col className="w-[38%]" /></colgroup>
      {/* En el teléfono los títulos de columna pueden partirse en dos líneas; las cifras no. */}
      <thead><tr><th>{primera}</th><th className="whitespace-normal!">Grupo A sin dato</th><th className="whitespace-normal!">Grupo B sin dato</th></tr></thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.clave}>
            <td className="min-w-[4.5rem] font-semibold">{f.nombre}</td>
            <CeldaSinDato c={f.a} serie={SERIE_A} techo={techo} grande={grande} />
            <CeldaSinDato c={f.b} serie={SERIE_B} techo={techo} grande={grande} />
          </tr>
        ))}
      </tbody>
    </Tabla>
  )
}

export function FaltantesPorVisita({ r, alta = false }: { r: GruposClinicoOk; alta?: boolean }) {
  const etapas = r.trayectoria.etapas
  const poblacion = poblacionAB(r.a.n, r.b.n)
  const visitas = etapas.map((e) => ({
    clave: e.etapa, nombre: e.etapa,
    a: e.a ? { sin: e.a.sin_dato, de: r.a.n, pct: e.a.pct_sin_dato } : MENOS_DE_5,
    b: e.b ? { sin: e.b.sin_dato, de: r.b.n, pct: e.b.pct_sin_dato } : MENOS_DE_5,
  }))
  const csv = etapas.map((e) => ({
    Visita: e.etapa, 'Grupo A: sin dato': e.a?.sin_dato ?? null, 'Grupo A: %': e.a?.pct_sin_dato ?? null, 'Grupo A: elegibles': r.a.n,
    'Grupo B: sin dato': e.b?.sin_dato ?? null, 'Grupo B: %': e.b?.pct_sin_dato ?? null, 'Grupo B: elegibles': r.b.n,
  }))
  const doce = r.desenlaces.filter((d) => d.a != null || d.b != null).map((d) => ({
    clave: d.clave, nombre: d.nombre.replace(/ a los 12 meses$/, ''),   // el título ya dice «a los 12 meses»
    a: d.a?.sin_dato != null && d.a.pct_sin_dato != null ? { sin: d.a.sin_dato, de: r.a.n, pct: d.a.pct_sin_dato } : 'menos de 5 niños con dato',
    b: d.b?.sin_dato != null && d.b.pct_sin_dato != null ? { sin: d.b.sin_dato, de: r.b.n, pct: d.b.pct_sin_dato } : 'menos de 5 niños con dato',
  }))
  return (
    <div className="grid items-start gap-4 xl:grid-cols-2 [&>*]:min-w-0">
      <TablaDatos titulo="Niños sin dato de talla, visita por visita"
        descripcion="Niños de cada grupo sin una talla válida en cada visita: aún no llegan a ella, no asistieron o no tienen una medida válida."
        exportar={{ nombre: 'comparar-grupos-sin-dato-por-visita', filas: csv, columnas: Object.keys(csv[0] ?? {}) }}>
        <TablaSinDato titulo="Niños sin dato de talla en cada visita" primera="Visita" filas={visitas} grande={alta} />
        <FichaDelDato items={{
          variable: 'medición de talla para la edad (puntaje z, referencia OMS)', unidad: '% de los niños elegibles del grupo sin dato',
          momento: 'cada visita, en edad corregida', poblacion,
          validos: 'los elegibles de cada grupo (el denominador); con menos de 5 niños con dato no se da cifra',
        }} />
      </TablaDatos>
      {doce.length > 0 && (
        <TablaDatos titulo="Desenlaces a los 12 meses sin dato"
          descripcion="Niños de cada grupo de los que no se sabe si tuvieron el desenlace a los 12 meses.">
          <TablaSinDato titulo="Niños sin dato de cada desenlace a los 12 meses" primera="Desenlace" filas={doce} grande={alta} />
          <FichaDelDato items={{
            variable: 'desenlace observado a los 12 meses', unidad: '% de los niños elegibles del grupo sin dato', momento: '12 meses de edad corregida',
            poblacion, validos: 'los elegibles de cada grupo (el denominador)',
          }} />
        </TablaDatos>
      )}
    </div>
  )
}
