// Rendimiento (plan v3.7, 6.3.2): aciertos frente a falsas alarmas, casos detectados frente a alertas acertadas, a cuántos
// niños alertar (control deslizante, calculado en el navegador), aciertos y errores en 2×2, qué pasa según dónde se ponga
// la línea y qué tan bien ordena cada desenlace. La revisión de los primeros (lift) y a cuántos revisar viven en Calibración.
import { useState, type ReactNode } from 'react'
import { useSubmodulo } from '../../api/analitica'
import type { DatosRendimiento, DatosResumen } from '../../api/tipos'
import { Bosque } from '../../components/graficos/equidad'
import { CurvaXY } from '../../components/graficos/xy'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Cifra, Panel, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { cn } from '../../lib/cn'
import { dec2, num } from '../../lib/formato'
import { jerga } from '../../lib/lenguaje'
import { Guia, ic, MatrizAlerta, muestraDe, omitida, PorDesenlace, pctN, useNombreDesenlace, useTecnico, type ModoMatriz } from './comun'
import { useContextoAnalitica } from './contexto'

/** El control de «a cuántos niños se alerta»: recalcula en el navegador desde los 100 puntos de `metricas_por_percentil`. */
export function ControlAlerta({ datos, p, setP }: { datos: DatosRendimiento; p: number; setP: (v: number) => void }) {
  const { tecnico } = useTecnico()
  const fila = datos.metricas_por_percentil.find((x) => x.percentil === p)
  const d1 = descripcionDe('a_cuantos_se_alerta')
  const Linea = ({ texto, valor }: { texto: string; valor: ReactNode }) => (
    <div className="flex items-baseline justify-between gap-3 border-t border-linea/70 py-2 text-sm"><dt>{texto}</dt><dd className="text-lg font-bold tabular-nums text-teal">{valor}</dd></div>
  )
  return (
    <Panel titulo={d1.titulo} descripcion={d1.descripcion} className="bg-[#fbfdfc]">
      <label className="flex items-baseline justify-between text-sm font-semibold" htmlFor="pct-alerta">
        {jerga(tecnico, 'Alertar al', 'Umbral (percentil de riesgo)')}
        <output htmlFor="pct-alerta" data-testid="pct-alerta" className="text-xl font-bold tabular-nums text-teal">{p} %</output>
      </label>
      <input id="pct-alerta" type="range" min={1} max={100} step={1} value={p} onChange={(e) => setP(Number(e.target.value))}
        aria-valuetext={`${p} % de los niños con más riesgo`} className="mt-2 w-full accent-teal" />
      <p className="mt-1 text-xs text-salvia">Se alerta al {p} % de los niños con más riesgo. Por defecto, el 10 % (la regla vigente).</p>
      <dl className="mt-3" aria-live="polite">
        <Linea texto={jerga(tecnico, 'Casos detectados', 'Sensibilidad')} valor={<span data-testid="cifra-detectados">{pctN(fila?.casos_detectados_pct)}</span>} />
        <Linea texto={jerga(tecnico, 'Alertas acertadas', 'VPP')} valor={<span data-testid="cifra-acertadas">{pctN(fila?.alertas_acertadas_pct)}</span>} />
        <Linea texto={jerga(tecnico, 'Niños sin falsa alarma', 'Especificidad')} valor={<span data-testid="cifra-sin-falsa">{pctN(fila?.sin_falsa_alarma_pct)}</span>} />
        <Linea texto="Alertas por cada 1.000 niños" valor={<span data-testid="cifra-por-mil">{fila?.alertas_por_1000 != null ? num(fila.alertas_por_1000) : '—'}</span>} />
      </dl>
    </Panel>
  )
}

const MODOS: { id: ModoMatriz; texto: string }[] = [{ id: 'conteos', texto: 'Conteos' }, { id: 'fila', texto: '% por fila' }, { id: 'total', texto: '% del total' }]

export default function Rendimiento() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosRendimiento>(entrenamiento, 'rendimiento', desenlace)
  const resumen = useSubmodulo<DatosResumen>(entrenamiento, 'resumen')
  const nombre = useNombreDesenlace()
  const { tecnico } = useTecnico()
  const [p, setP] = useState(10)   // D19: por defecto el 10 % con más riesgo
  const [modo, setModo] = useState<ModoMatriz>('conteos')
  const dRoc = descripcionDe('roc'), dPr = descripcionDe('curva_pr'), dLinea = descripcionDe('que_pasa_segun_linea')
  const dAe = descripcionDe('aciertos_errores'), dOrd = descripcionDe('ordena_por_desenlace')
  const porDesenlace = resumen.data?.estado === 'ok' ? Object.entries(resumen.data.desenlaces ?? {}) : []
  return (
    <div className="space-y-4">
      <Guia>
        <p>«Qué tan bien ordena» dice si el modelo pone primero a los niños que sí tendrán el desenlace. Con el control deslizante se elige a cuántos niños alertar y se ve cuántos casos se detectan y cuántas alertas aciertan.</p>
        <p>Alertar a más niños detecta más casos, pero también da más falsas alarmas: el equipo decide el equilibrio. La revisión de los primeros y a cuántos niños revisar están en Calibración y decisión.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(d) => {
          const muestra = muestraDe(d.auc_desenlace.n, d.auc_desenlace.casos)
          const tops = d.confusion_por_top.map((c) => c.top_pct)
          // la matriz usa el corte de la tabla más cercano al porcentaje del control
          const topMatriz = tops.length ? tops.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a)) : null
          const conf = d.confusion_por_top.find((c) => c.top_pct === topMatriz)
          return (
            <>
              <div className="grid gap-4 xl:grid-cols-3">
                <Grafica titulo={dRoc.titulo} descripcion={dRoc.descripcion}
                  exportar={{ nombre: 'rendimiento-roc', filas: d.roc.puntos.map(([x, y]) => ({ falsas_alarmas: x, casos_detectados: y })), muestra }}>
                  <CurvaXY etiqueta="Aciertos frente a falsas alarmas" ejeX="Falsas alarmas" ejeY="Casos detectados" diagonal alto={260}
                    formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                    series={[{ clave: 'roc', nombre: `${jerga(tecnico, 'Modelo', 'Curva ROC')} · ${ic(d.auc_desenlace)}`, color: 0, puntos: d.roc.puntos, sinPuntos: true }]} />
                </Grafica>
                <Grafica titulo={dPr.titulo} descripcion={dPr.descripcion}
                  exportar={{ nombre: 'rendimiento-pr', filas: d.pr.puntos.map(([x, y]) => ({ casos_detectados: x, alertas_acertadas: y })), muestra }}>
                  <CurvaXY etiqueta="Alertas acertadas frente a casos detectados" ejeX="Casos detectados" ejeY="Alertas acertadas" referenciaY={d.pr.prevalencia} alto={260}
                    formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                    series={[{ clave: 'pr', nombre: jerga(tecnico, 'Modelo', 'Curva precisión-exhaustividad'), color: 0, puntos: d.pr.puntos, sinPuntos: true }]} />
                </Grafica>
                <ControlAlerta datos={d} p={p} setP={setP} />
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
                <TablaDatos titulo={dAe.titulo} descripcion={topMatriz != null ? `Alertando al ${topMatriz} %: cuántos niños se acertaron y cuántos fueron falsa alarma.` : dAe.descripcion}
                  exportar={{ nombre: 'rendimiento-confusion', filas: d.confusion_por_top.map((c) => ({ porcentaje_alertado: c.top_pct, casos_detectados: c.tp, falsas_alarmas: c.fp, casos_no_detectados: c.fn, sin_falsa_alarma: c.tn })), muestra }}>
                  <div role="group" aria-label="Cómo mostrar la matriz" className="mb-3 flex flex-wrap gap-1.5">
                    {MODOS.map((m) => (
                      <button key={m.id} type="button" aria-pressed={modo === m.id} onClick={() => setModo(m.id)}
                        className={cn('rounded-full border px-3 py-1 text-xs font-semibold', modo === m.id ? 'border-teal bg-teal text-white' : 'border-teal-tinte bg-teal-tinte text-teal')}>
                        {m.texto}
                      </button>
                    ))}
                  </div>
                  {conf ? <MatrizAlerta c={conf} modo={modo} /> : <p className="text-sm text-salvia">Sin datos.</p>}
                </TablaDatos>
                <TablaDatos titulo={dLinea.titulo} descripcion={`${dLinea.descripcion} Resaltada, la elegida en el control.`}
                  exportar={{ nombre: 'rendimiento-por-top', filas: d.metricas_por_top.map((t) => ({ porcentaje_alertado: t.top_pct, alertas: t.alertas, casos_detectados_pct: t.casos_detectados_pct, alertas_acertadas_pct: t.alertas_acertadas_pct, sin_falsa_alarma_pct: t.sin_falsa_alarma_pct, alertas_por_1000: t.alertas_por_1000 })), muestra }}>
                  <Tabla densa>
                    <thead><tr><th>Alertar al</th><th>{jerga(tecnico, 'Detectados', 'Sensibilidad')}</th><th>{jerga(tecnico, 'Acertadas', 'VPP')}</th>
                      <th>{jerga(tecnico, 'Sin falsa alarma', 'Especificidad')}</th><th>Por 1.000</th></tr></thead>
                    <tbody>
                      {d.metricas_por_top.map((t) => (
                        <tr key={t.top_pct} className={cn(t.top_pct === topMatriz && 'bg-teal-tinte font-semibold')}>
                          <td>{t.top_pct} %</td><td>{pctN(t.casos_detectados_pct)}</td><td>{pctN(t.alertas_acertadas_pct)}</td>
                          <td>{pctN(t.sin_falsa_alarma_pct)}</td><td>{omitida(t.alertas_por_1000, num)}</td></tr>
                      ))}
                    </tbody>
                  </Tabla>
                </TablaDatos>
                <Panel titulo={dOrd.titulo} descripcion={dOrd.descripcion}>
                  {porDesenlace.length ? (
                    <Bosque etiqueta="Qué tan bien ordena el modelo, por desenlace" nombreValor={jerga(tecnico, 'Ordena', 'AUC')}
                      puntos={porDesenlace.map(([clave, f]) => ({ etiqueta: nombre(clave).nombre + (nombre(clave).enPrueba ? ' (En prueba)' : ''), valor: f.auc ?? null, bajo: f.ic_bajo ?? null, alto: f.ic_alto ?? null, ref: f.auc_ref ?? null }))} />
                  ) : (
                    <Cifra valor={d.auc_desenlace.auc != null ? dec2(d.auc_desenlace.auc) : '—'}
                      texto={`${jerga(tecnico, 'Qué tan bien ordena a los niños', 'AUC con intervalo de confianza')}: ${ic(d.auc_desenlace)}. ${muestra ?? ''}`} />
                  )}
                  {d.referencia && (
                    <p className="mt-3 text-sm tabular-nums">
                      <strong>Frente a la regla de referencia</strong> (edad gestacional y pesos al nacer): ordena{' '}
                      {d.referencia.auc_desenlace.auc != null ? dec2(d.referencia.auc_desenlace.auc) : '—'} ({ic(d.referencia.auc_desenlace)})
                      contra {d.auc_desenlace.auc != null ? dec2(d.auc_desenlace.auc) : '—'} del modelo
                      {d.referencia.casos_top10_pct != null && <>; el 10 % de mayor riesgo reúne {d.referencia.casos_top10_pct} % de los casos con la regla.</>}
                    </p>
                  )}
                </Panel>
              </div>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
