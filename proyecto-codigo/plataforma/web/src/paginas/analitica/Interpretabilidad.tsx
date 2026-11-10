// Qué datos pesan más en el riesgo, cómo cambia el riesgo con un dato, qué motivos se repiten en las alertas y cómo se
// combinan dos datos. Solo agregados; el modelo asocia, no prueba causa.
import { useState } from 'react'
import { useSubmodulo } from '../../api/analitica'
import type { DatosInterpretabilidad } from '../../api/tipos'
import { Grafica, TablaDatos } from '../../components/grafica'
import { MapaCalor } from '../../components/graficos/equidad'
import { CurvaXY } from '../../components/graficos/xy'
import { Aviso, Selector, Tabla, Vacio } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num, pct } from '../../lib/formato'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { Guia, muestraDe, PorDesenlace } from './comun'
import { useContextoAnalitica } from './contexto'

const fmt = (v: number) => (Math.abs(v) >= 100 ? num(Math.round(v)) : dec2(v))

/** Texto de la caja `i` de una variable cortada en `cortes`: «hasta 1.200», «1.200 a 1.500», «desde 1.800». */
function tramo(cortes: number[], i: number): string {
  if (i === 0) return `hasta ${fmt(cortes[0])}`
  if (i >= cortes.length) return `desde ${fmt(cortes[cortes.length - 1])}`
  return `${fmt(cortes[i - 1])} a ${fmt(cortes[i])}`
}

function CurvaDependencia({ d, muestra }: { d: NonNullable<DatosInterpretabilidad['pdp']>; muestra?: string }) {
  const [elegida, setElegida] = useState(d.variables[0]?.variable)
  const dCambia = descripcionDe('cambia_con_variable')
  const v = d.variables.find((x) => x.variable === elegida) ?? d.variables[0]
  if (!v) return null
  const xs = v.puntos.map((p) => p[0])
  const tope = Math.max(0.02, ...v.puntos.map((p) => p[1])) * 1.15
  return (
    <Grafica titulo={dCambia.titulo} descripcion={dCambia.descripcion}
      accion={
        <Selector aria-label="Dato que cambia" value={v.variable} onChange={(e) => setElegida(e.target.value)}>
          {d.variables.map((x) => <option key={x.variable} value={x.variable}>{x.etiqueta}</option>)}
        </Selector>
      }
      exportar={{ nombre: `interpretabilidad-riesgo-${v.variable}`, filas: v.puntos.map((p) => ({ dato: v.etiqueta, valor: p[0], riesgo_medio: p[1] })), muestra }}>
      <CurvaXY etiqueta={`Riesgo medio según ${v.etiqueta}`} ejeX={v.etiqueta} ejeY="Riesgo medio" dominioX={[Math.min(...xs), Math.max(...xs)]} dominioY={[0, tope]}
        formatoX={fmt} formatoY={(x) => pct(100 * x)}
        series={[{ clave: 'pdp', nombre: 'Riesgo medio del grupo', color: 0, puntos: v.puntos }]} referenciaY={d.riesgo_medio} />
      <p className="mt-1 text-xs text-salvia">La línea punteada es el riesgo medio de todos los niños.</p>
    </Grafica>
  )
}

function Combinacion({ d, muestra }: { d: NonNullable<DatosInterpretabilidad['interaccion']>; muestra?: string }) {
  const [k, setK] = useState(0)
  const dInt = descripcionDe('interaccion')
  const par = d.pares[Math.min(k, d.pares.length - 1)]
  if (!par) return null
  const riesgos = par.celdas.map((c) => c.riesgo_medio).filter((x): x is number => x != null)
  const escala: [number, number] = [Math.min(...riesgos, 0), Math.max(...riesgos, 0.01)]
  const filas = Array.from({ length: par.cortes_a.length + 1 }, (_, i) => ({
    etiqueta: `${par.etiqueta_a}: ${tramo(par.cortes_a, i)}`,
    celdas: Array.from({ length: par.cortes_b.length + 1 }, (_, j) => {
      const c = par.celdas.find((x) => x.i === i && x.j === j)
      return { valor: c?.riesgo_medio ?? null, texto: c?.riesgo_medio == null ? '—' : pct(100 * c.riesgo_medio), pequena: c?.n == null }
    }),
  }))
  const columnas = Array.from({ length: par.cortes_b.length + 1 }, (_, j) => `${par.etiqueta_b}: ${tramo(par.cortes_b, j)}`)
  return (
    <Grafica titulo={dInt.titulo} descripcion={dInt.descripcion}
      accion={d.pares.length > 1 && (
        <Selector aria-label="Par de datos" value={String(k)} onChange={(e) => setK(Number(e.target.value))}>
          {d.pares.map((p, i) => <option key={i} value={i}>{p.etiqueta_a} y {p.etiqueta_b}</option>)}
        </Selector>
      )}
      exportar={{ nombre: 'interpretabilidad-combinacion', muestra,
        filas: par.celdas.map((c) => ({ [par.etiqueta_a]: tramo(par.cortes_a, c.i), [par.etiqueta_b]: tramo(par.cortes_b, c.j), ninos: c.n ?? N_MENOR_QUE_5, riesgo_medio: c.riesgo_medio })) }}>
      <MapaCalor etiqueta={`Riesgo medio según ${par.etiqueta_a} y ${par.etiqueta_b}`} columnas={columnas} filas={filas} escala={escala} />
      <p className="mt-1 text-xs text-salvia">Más oscuro es más riesgo. Las celdas con menos de 5 niños dicen «{N_MENOR_QUE_5}».</p>
    </Grafica>
  )
}

export default function Interpretabilidad() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosInterpretabilidad>(entrenamiento, 'interpretabilidad', desenlace)
  const dPesan = descripcionDe('variables_pesan'), dMot = descripcionDe('motivos_frecuentes')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Muestra los datos que más pesan en el riesgo que calcula el modelo, cómo cambia el riesgo cuando cambia uno de ellos y qué razones se repiten entre los niños con alerta.</p>
        <p>Que un dato pese mucho no prueba que cause el desenlace: solo dice que el modelo lo usa para ordenar a los niños.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(datos) => {
          const sg = datos.shap_global
          const filas = sg ? sg.variables.map((i) => ({ variable: i.variable, etiqueta: i.etiqueta, pct: i.importancia_pct }))
            : datos.importancia.map((i) => ({ variable: i.variable, etiqueta: i.variable, pct: i.importancia_pct }))
          const max = Math.max(1, ...filas.map((i) => i.pct))
          const muestra = muestraDe(sg?.n)
          const completo = !!(sg || datos.pdp || datos.motivos_frecuentes || datos.interaccion)
          const mot = datos.motivos_frecuentes
          return (
            <>
              {datos.avisos.map((a) => <Aviso key={a} tono="teal">{a}</Aviso>)}
              {!completo && (
                <Vacio titulo="Este entrenamiento no trae el detalle de interpretabilidad">
                  Solo tiene la importancia general de los datos. Para ver cómo cambia el riesgo, los motivos frecuentes y la combinación de datos, vuelva a entrenar el modelo; no se recalcula en silencio.
                </Vacio>
              )}
              <Grafica titulo={dPesan.titulo} descripcion={dPesan.descripcion}
                exportar={{ nombre: 'interpretabilidad', muestra, filas: filas.map((i) => ({ dato: i.etiqueta, peso_pct: i.pct })) }}>
                <ul role="figure" aria-label="Qué datos pesan más en el riesgo" className="space-y-2">
                  {filas.map((i) => (
                    <li key={i.variable} className="grid grid-cols-[minmax(8rem,14rem)_1fr_4rem] items-center gap-2 text-sm">
                      <span className="truncate" title={i.etiqueta}>{i.etiqueta}</span>
                      <span className="h-3 rounded-full bg-fondo"><span className="block h-3 rounded-full" style={{ width: `${(100 * i.pct) / max}%`, background: 'var(--color-serie-1)' }} /></span>
                      <span className="text-right tabular-nums">{pct(i.pct)}</span>
                    </li>
                  ))}
                </ul>
                {sg && <p className="mt-2 text-xs text-salvia">{sg.advertencia}</p>}
              </Grafica>
              {datos.pdp && <CurvaDependencia d={datos.pdp} muestra={muestraDe(datos.pdp.n)} />}
              {mot && (
                <TablaDatos titulo={dMot.titulo} descripcion={dMot.descripcion}
                  exportar={{ nombre: 'interpretabilidad-motivos', muestra: `${mot.n_alertas} niños con alerta`,
                    filas: mot.motivos.map((m) => ({ motivo: m.etiqueta, ninos_con_alerta: m.n ?? N_MENOR_QUE_5, pct_de_las_alertas: m.pct })) }}>
                  <Tabla densa>
                    <thead><tr><th>Dato</th><th>Niños con alerta</th><th>% de las alertas</th></tr></thead>
                    <tbody>{mot.motivos.map((m) => (
                      <tr key={m.variable}><td>{m.etiqueta}</td><td>{m.n == null ? N_MENOR_QUE_5 : num(m.n)}</td><td>{m.pct == null ? '—' : pct(m.pct)}</td></tr>
                    ))}</tbody>
                  </Tabla>
                </TablaDatos>
              )}
              {datos.interaccion && <Combinacion d={datos.interaccion} muestra={muestraDe(datos.interaccion.n)} />}
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
