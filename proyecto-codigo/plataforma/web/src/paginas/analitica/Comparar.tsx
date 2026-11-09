// Comparar dos entrenamientos (A y B): las métricas de rendimiento lado a lado, con la diferencia de B frente a A.
// Sin aprobar ni bootstrap por ahora: «Aprobar B» queda deshabilitado.
import { useState } from 'react'
import { useEntrenamientosAnalitica, useSubmodulo } from '../../api/analitica'
import type { DatosRendimiento } from '../../api/tipos'
import { puede, useSesion } from '../../auth/sesion'
import { CurvaXY } from '../../components/graficos/xy'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Boton, Selector, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, fechaHora, num, pct } from '../../lib/formato'
import { jerga, N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { Guia, Resultado, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

interface Medida { id: string; texto: string; valor: (d: DatosRendimiento) => number | null; formato: (v: number) => string; unidad: 'pp' | 'abs' }

const fila = (d: DatosRendimiento, top: number) => d.metricas_por_top.find((t) => t.top_pct === top)

export default function Comparar() {
  const { desenlace, entrenamiento } = useContextoAnalitica()
  const { usuario } = useSesion()
  const { tecnico } = useTecnico()
  const lista = useEntrenamientosAnalitica()
  const todos = lista.data?.entrenamientos ?? []
  const [elegidoA, setA] = useState<number | null>(null)
  const [elegidoB, setB] = useState<number | null>(null)
  const b = elegidoB ?? entrenamiento ?? todos[0]?.entrenamiento ?? null
  const a = elegidoA ?? todos.find((m) => m.entrenamiento !== b)?.entrenamiento ?? b
  const ra = useSubmodulo<DatosRendimiento>(a, 'rendimiento', desenlace)
  const rb = useSubmodulo<DatosRendimiento>(b, 'rendimiento', desenlace)
  const dMet = descripcionDe('comparar_metricas'), dRoc = descripcionDe('comparar_roc')

  const medidas: Medida[] = [
    { id: 'auc', texto: jerga(tecnico, 'Qué tan bien ordena a los niños', 'AUC'), valor: (d) => d.auc_desenlace.auc, formato: dec2, unidad: 'abs' },
    { id: 'pr', texto: jerga(tecnico, 'Alertas acertadas en promedio', 'Precisión promedio (PR-AUC)'), valor: (d) => d.pr_auc ?? null, formato: dec2, unidad: 'abs' },
    ...[10, 20].flatMap((t): Medida[] => [
      { id: `det${t}`, texto: `${jerga(tecnico, 'Casos detectados', 'Sensibilidad')} si se alerta al ${t} %`, valor: (d) => fila(d, t)?.casos_detectados_pct ?? null, formato: pct, unidad: 'pp' },
      { id: `ac${t}`, texto: `${jerga(tecnico, 'Alertas acertadas', 'VPP')} si se alerta al ${t} %`, valor: (d) => fila(d, t)?.alertas_acertadas_pct ?? null, formato: pct, unidad: 'pp' },
    ]),
    { id: 'mil', texto: 'Alertas por 1.000 niños si se alerta al 10 %', valor: (d) => fila(d, 10)?.alertas_por_1000 ?? null, formato: num, unidad: 'abs' },
  ]
  const datoA = desenlace ? ra.data?.desenlaces?.[desenlace] : undefined
  const datoB = desenlace ? rb.data?.desenlaces?.[desenlace] : undefined

  const diferencia = (m: Medida, A: DatosRendimiento, B: DatosRendimiento) => {
    const va = m.valor(A), vb = m.valor(B)
    if (va == null || vb == null) return N_MENOR_QUE_5
    const d = vb - va
    const signo = d > 0 ? '+' : d < 0 ? '−' : ''
    return `${signo}${m.unidad === 'pp' ? `${Math.abs(d).toLocaleString('es-CO', { maximumFractionDigits: 1 })} puntos` : m.formato(Math.abs(d))}`
  }

  const selector = (etiqueta: string, valor: number | null, cambiar: (v: number) => void) => (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">{etiqueta}</span>
      <Selector value={valor ?? ''} onChange={(e) => cambiar(Number(e.target.value))}>
        {todos.map((m) => <option key={m.entrenamiento} value={m.entrenamiento}>Entrenamiento {m.entrenamiento}{m.creada ? ` · ${fechaHora(m.creada)}` : ''}</option>)}
      </Selector>
    </label>
  )

  return (
    <div className="space-y-4">
      <Guia>
        <p>Elija dos entrenamientos. A es el de referencia y B el que se quiere comparar. La última columna dice cuánto cambia B frente a A.</p>
        <p>Por ahora solo se comparan las cifras; todavía no se dice si la diferencia es clara.</p>
      </Guia>
      <div className="grid items-end gap-3 sm:grid-cols-3">
        {selector('Entrenamiento A (referencia)', a, setA)}
        {selector('Entrenamiento B', b, setB)}
        {puede(usuario, ['admin']) && (
          <div><Boton disabled title="Próximamente" aria-label="Aprobar B (próximamente)">Aprobar B</Boton></div>
        )}
      </div>
      <Resultado consulta={rb}>
        {() => (
          <Resultado consulta={ra}>
            {() => {
              if (!datoA || !datoB || datoA.estado === 'insuficiente' || datoB.estado === 'insuficiente') {
                return <p className="text-salvia">No hay datos suficientes de este desenlace en alguno de los dos entrenamientos.</p>
              }
              return (
                <>
                  <TablaDatos titulo={dMet.titulo} descripcion={dMet.descripcion}
                    exportar={{ nombre: 'comparar-metricas', filas: medidas.map((m) => ({ medida: m.texto, A: m.valor(datoA), B: m.valor(datoB) })) }}>
                    <Tabla densa>
                      <thead><tr><th>Medida</th><th>A (entrenamiento {a})</th><th>B (entrenamiento {b})</th><th>Diferencia de B frente a A</th></tr></thead>
                      <tbody>
                        {medidas.map((m) => (
                          <tr key={m.id}>
                            <td>{m.texto}</td>
                            <td>{m.valor(datoA) != null ? m.formato(m.valor(datoA) as number) : N_MENOR_QUE_5}</td>
                            <td>{m.valor(datoB) != null ? m.formato(m.valor(datoB) as number) : N_MENOR_QUE_5}</td>
                            <td>{diferencia(m, datoA, datoB)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Tabla>
                  </TablaDatos>
                  <Grafica titulo={dRoc.titulo} descripcion={dRoc.descripcion}
                    exportar={{ nombre: 'comparar-roc', filas: [...datoA.roc.puntos.map(([x, y]) => ({ entrenamiento: 'A', falsas_alarmas: x, casos_detectados: y })), ...datoB.roc.puntos.map(([x, y]) => ({ entrenamiento: 'B', falsas_alarmas: x, casos_detectados: y }))] }}>
                    <CurvaXY etiqueta="Aciertos frente a falsas alarmas en A y en B" ejeX="Falsas alarmas" ejeY="Casos detectados" diagonal
                      formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                      series={[
                        { clave: 'a', nombre: `A (entrenamiento ${a})`, color: 0, puntos: datoA.roc.puntos, sinPuntos: true },
                        { clave: 'b', nombre: `B (entrenamiento ${b})`, color: 2, puntos: datoB.roc.puntos, sinPuntos: true },
                      ]} />
                  </Grafica>
                </>
              )
            }}
          </Resultado>
        )}
      </Resultado>
    </div>
  )
}
