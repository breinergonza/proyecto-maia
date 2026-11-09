// Rendimiento: qué tan bien ordena el modelo, a cuántos niños alertar (control deslizante, calculado en el navegador),
// aciertos y errores, lift y revisión de los primeros.
import { useState } from 'react'
import { useSubmodulo } from '../../api/analitica'
import type { DatosRendimiento } from '../../api/tipos'
import { CurvaXY } from '../../components/graficos/xy'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Cifra, Panel, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num, pct } from '../../lib/formato'
import { jerga } from '../../lib/lenguaje'
import { decN, Guia, ic, muestraDe, omitida, PorDesenlace, pctN, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

/** El control de «a cuántos niños se alerta»: recalcula en el navegador desde los 100 puntos de `metricas_por_percentil`. */
export function ControlAlerta({ datos }: { datos: DatosRendimiento }) {
  const [p, setP] = useState(10)   // D19: por defecto el 10 % con más riesgo
  const { tecnico } = useTecnico()
  const fila = datos.metricas_por_percentil.find((x) => x.percentil === p)
  const d1 = descripcionDe('a_cuantos_se_alerta')
  const d2 = descripcionDe('casos_detectados')
  return (
    <Panel titulo={d1.titulo} descripcion={d1.descripcion}>
      <label className="block text-sm font-semibold" htmlFor="pct-alerta">
        {jerga(tecnico, 'A cuántos niños se alerta', 'Umbral (percentil de riesgo)')}: <output htmlFor="pct-alerta" data-testid="pct-alerta">{p} %</output>
      </label>
      <input id="pct-alerta" type="range" min={1} max={100} step={1} value={p} onChange={(e) => setP(Number(e.target.value))}
        aria-valuetext={`${p} % de los niños con más riesgo`} className="mt-2 w-full accent-teal" />
      <p className="mt-1 text-xs text-salvia">Se alerta al {p} % de los niños con más riesgo.</p>
      <h3 className="mt-4 text-sm font-semibold">{d2.titulo}</h3>
      <p className="text-sm text-salvia">{d2.descripcion}</p>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
        <Cifra valor={<span data-testid="cifra-detectados">{pctN(fila?.casos_detectados_pct)}</span>}
          texto={jerga(tecnico, 'Casos detectados: de cada 100 casos, cuántos se alertan', 'Sensibilidad (recall)')} />
        <Cifra valor={<span data-testid="cifra-acertadas">{pctN(fila?.alertas_acertadas_pct)}</span>}
          texto={jerga(tecnico, 'Alertas acertadas: de cada 100 alertas, cuántas son un caso', 'Valor predictivo positivo (VPP)')} />
        <Cifra valor={<span data-testid="cifra-sin-falsa">{pctN(fila?.sin_falsa_alarma_pct)}</span>}
          texto={jerga(tecnico, 'Niños sin falsa alarma', 'Especificidad')} />
        <Cifra valor={<span data-testid="cifra-por-mil">{fila?.alertas_por_1000 != null ? num(fila.alertas_por_1000) : '—'}</span>}
          texto="Alertas por cada 1.000 niños" />
      </dl>
    </Panel>
  )
}

export default function Rendimiento() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosRendimiento>(entrenamiento, 'rendimiento', desenlace)
  const { tecnico } = useTecnico()
  const dRoc = descripcionDe('roc'), dPr = descripcionDe('curva_pr'), dLinea = descripcionDe('que_pasa_segun_linea')
  const dAe = descripcionDe('aciertos_errores'), dLift = descripcionDe('lift'), dK = descripcionDe('a_cuantos_revisar')
  const dOrd = descripcionDe('ordena_por_desenlace')
  return (
    <div className="space-y-4">
      <Guia>
        <p>«Qué tan bien ordena» dice si el modelo pone primero a los niños que sí tendrán el desenlace. Con el control deslizante se elige a cuántos niños alertar y se ve cuántos casos se detectan y cuántas alertas aciertan.</p>
        <p>Alertar a más niños detecta más casos, pero también da más falsas alarmas: el equipo decide el equilibrio.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(d) => {
          const muestra = muestraDe(d.auc_desenlace.n, d.auc_desenlace.casos)
          return (
            <>
              <Panel titulo={dOrd.titulo} descripcion={dOrd.descripcion}>
                <Cifra valor={d.auc_desenlace.auc != null ? dec2(d.auc_desenlace.auc) : '—'}
                  texto={`${jerga(tecnico, 'Qué tan bien ordena a los niños', 'AUC con intervalo de confianza')}: ${ic(d.auc_desenlace)}. ${muestra ?? ''}`} />
              </Panel>
              <ControlAlerta datos={d} />
              <div className="grid gap-4 xl:grid-cols-2">
                <Grafica titulo={dRoc.titulo} descripcion={dRoc.descripcion}
                  exportar={{ nombre: 'rendimiento-roc', filas: d.roc.puntos.map(([x, y]) => ({ falsas_alarmas: x, casos_detectados: y })), muestra }}>
                  <CurvaXY etiqueta="Aciertos frente a falsas alarmas" ejeX="Falsas alarmas" ejeY="Casos detectados" diagonal
                    formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                    series={[{ clave: 'roc', nombre: jerga(tecnico, 'Modelo', 'Curva ROC'), color: 0, puntos: d.roc.puntos, sinPuntos: true }]} />
                </Grafica>
                <Grafica titulo={dPr.titulo} descripcion={dPr.descripcion}
                  exportar={{ nombre: 'rendimiento-pr', filas: d.pr.puntos.map(([x, y]) => ({ casos_detectados: x, alertas_acertadas: y })), muestra }}>
                  <CurvaXY etiqueta="Alertas acertadas frente a casos detectados" ejeX="Casos detectados" ejeY="Alertas acertadas" referenciaY={d.pr.prevalencia}
                    formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                    series={[{ clave: 'pr', nombre: jerga(tecnico, 'Modelo', 'Curva precisión-exhaustividad'), color: 0, puntos: d.pr.puntos, sinPuntos: true }]} />
                </Grafica>
              </div>
              <TablaDatos titulo={dLinea.titulo} descripcion={dLinea.descripcion}
                exportar={{ nombre: 'rendimiento-por-top', filas: d.metricas_por_top.map((t) => ({ porcentaje_alertado: t.top_pct, alertas: t.alertas, casos_detectados_pct: t.casos_detectados_pct, alertas_acertadas_pct: t.alertas_acertadas_pct, sin_falsa_alarma_pct: t.sin_falsa_alarma_pct, alertas_por_1000: t.alertas_por_1000 })), muestra }}>
                <Tabla densa>
                  <thead><tr><th>Se alerta al</th><th>{jerga(tecnico, 'Casos detectados', 'Sensibilidad')}</th><th>{jerga(tecnico, 'Alertas acertadas', 'VPP')}</th>
                    <th>{jerga(tecnico, 'Niños sin falsa alarma', 'Especificidad')}</th><th>Alertas por 1.000</th></tr></thead>
                  <tbody>
                    {d.metricas_por_top.map((t) => (
                      <tr key={t.top_pct}><td>{t.top_pct} %</td><td>{pctN(t.casos_detectados_pct)}</td><td>{pctN(t.alertas_acertadas_pct)}</td>
                        <td>{pctN(t.sin_falsa_alarma_pct)}</td><td>{omitida(t.alertas_por_1000, num)}</td></tr>
                    ))}
                  </tbody>
                </Tabla>
              </TablaDatos>
              <TablaDatos titulo={dAe.titulo} descripcion={dAe.descripcion}
                exportar={{ nombre: 'rendimiento-confusion', filas: d.confusion_por_top.map((c) => ({ porcentaje_alertado: c.top_pct, casos_detectados: c.tp, falsas_alarmas: c.fp, casos_no_detectados: c.fn, sin_falsa_alarma: c.tn })), muestra }}>
                <Tabla densa>
                  <thead><tr><th>Se alerta al</th><th>Casos detectados</th><th>Falsas alarmas</th><th>Casos no detectados</th><th>Niños sin falsa alarma</th></tr></thead>
                  <tbody>
                    {d.confusion_por_top.map((c) => (
                      <tr key={c.top_pct}><td>{c.top_pct} %</td><td>{omitida(c.tp, num)}</td><td>{omitida(c.fp, num)}</td><td>{omitida(c.fn, num)}</td><td>{omitida(c.tn, num)}</td></tr>
                    ))}
                  </tbody>
                </Tabla>
              </TablaDatos>
              <div className="grid gap-4 xl:grid-cols-2">
                <TablaDatos titulo={dLift.titulo} descripcion={dLift.descripcion}
                  exportar={{ nombre: 'rendimiento-lift', filas: d.lift.deciles.map((x) => ({ grupo_de_10: x.decil, ninos: x.niños, tasa: x.tasa, veces_la_tasa_general: x.lift })), muestra }}>
                  <Tabla densa>
                    <thead><tr><th>Grupo de 10 (1 = más riesgo)</th><th>Niños</th><th>{jerga(tecnico, 'Casos entre ellos', 'Tasa del decil')}</th><th>{jerga(tecnico, 'Veces la tasa general', 'Lift')}</th></tr></thead>
                    <tbody>
                      {d.lift.deciles.map((x) => (
                        <tr key={x.decil}><td>{x.decil}</td><td>{num(x.niños)}</td><td>{x.tasa == null ? decN(null) : pct(100 * x.tasa)}</td><td>{decN(x.lift)}</td></tr>
                      ))}
                    </tbody>
                  </Tabla>
                </TablaDatos>
                <TablaDatos titulo={dK.titulo} descripcion={dK.descripcion}
                  exportar={{ nombre: 'rendimiento-revisar', filas: d.top_k.map((x) => ({ ninos_revisados: x.k, casos: x.casos, alertas_acertadas_pct: x.acertadas_pct, casos_detectados_pct: x.detectados_pct })), muestra }}>
                  <Tabla densa>
                    <thead><tr><th>Niños que se revisan</th><th>Casos encontrados</th><th>Alertas acertadas</th><th>Casos detectados</th></tr></thead>
                    <tbody>
                      {d.top_k.map((x) => (
                        <tr key={x.k}><td>{num(x.k)}</td><td>{omitida(x.casos, num)}</td><td>{pctN(x.acertadas_pct)}</td><td>{pctN(x.detectados_pct)}</td></tr>
                      ))}
                    </tbody>
                  </Tabla>
                </TablaDatos>
              </div>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
