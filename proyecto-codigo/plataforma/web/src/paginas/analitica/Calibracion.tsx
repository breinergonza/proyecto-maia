// Calibración y decisión (plan v3.7, 6.3.4), en cuatro pestañas por pregunta: «Es creíble el riesgo» (si el porcentaje de riesgo
// es el que ocurre en realidad), «Cómo se reparte» (el riesgo de los niños con y sin el desenlace y en general), «A cuántos
// revisar» (los casos que se capturan al revisar primero a los de más riesgo y cuántos niños cabe revisar según la capacidad
// del equipo) y «Beneficio y costo» (el beneficio de alertar y el costo de equivocarse con un porcentaje sugerido).
import { useState } from 'react'
import { useSubmodulo } from '../../api/analitica'
import type { DatosCalibracion, DatosRendimiento } from '../../api/tipos'
import { HistogramaDosGrupos } from '../../components/graficos/distribuciones'
import { CurvaXY, Histograma } from '../../components/graficos/xy'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Cifra, Panel, Tabla } from '../../components/ui'
import type { Pestana } from '../../components/ui/Pestanas'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num } from '../../lib/formato'
import { jerga, N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { ConPestanas, fracPct, Guia, IrA, muestraDe, omitida, PorDesenlace, pctN, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

type Ver = 'creible' | 'reparto' | 'revisar' | 'beneficio'

export default function Calibracion() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosCalibracion>(entrenamiento, 'calibracion', desenlace)
  const rend = useSubmodulo<DatosRendimiento>(entrenamiento, 'rendimiento', desenlace)
  const rdCrudo = rend.data?.estado === 'ok' && desenlace ? rend.data.desenlaces?.[desenlace] : undefined
  const rd = rdCrudo && !rdCrudo.estado ? rdCrudo : undefined
  const { tecnico } = useTecnico()
  // lo que la persona elige vive aquí y no en cada pestaña: al cambiar de pestaña y volver se conserva
  const [capacidadElegida, setCapacidad] = useState<number | null>(null)
  const [peso, setPeso] = useState(10)   // plan: por defecto, no detectar un caso pesa como 10 falsas alarmas
  const dCal = descripcionDe('calibracion'), dErr = descripcionDe('calibracion_error'), dHist = descripcionDe('histograma_riesgo')
  const dBen = descripcionDe('beneficio_alertar'), dHr = descripcionDe('hist_riesgo_desenlace')
  const dCap = descripcionDe('casos_capturados'), dK = descripcionDe('a_cuantos_revisar'), dCosto = descripcionDe('costo_equivocarse')
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <Guia>
        <p>Si el modelo dice «20 % de riesgo», de cada 100 niños así calificados unos 20 deberían tener el desenlace. Cuando los puntos caen sobre la diagonal, el porcentaje es el real.</p>
        <p>Si quedan por encima, el modelo se queda corto; por debajo, exagera el riesgo.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(d) => {
          const muestra = muestraDe(d.n)
          const puntos = d.bins.filter((b) => b.riesgo_medio != null && b.observado != null)
          const tope = Math.max(0.05, ...puntos.map((p) => p.riesgo_medio ?? 0), ...puntos.map((p) => p.observado ?? 0)) * 1.1
          const dec = d.decision
          // revisar primero a los de más riesgo y el costo de equivocarse salen de la evaluación (rendimiento)
          const n = rd?.auc_desenlace.n, casos = rd?.auc_desenlace.casos
          const capacidad = capacidadElegida ?? Math.max(1, Math.round((n ?? 0) / 10))
          // casos capturados acumulados por grupos de 10 (1 = más riesgo); si algún grupo trae menos de 5 casos no se dibuja
          const conCasos = (rd?.lift.deciles ?? []).map((x) => (x.tasa == null ? null : x.niños * x.tasa))
          const totalCasos = rd && conCasos.every((v) => v != null) ? conCasos.reduce<number>((a, b) => a + (b ?? 0), 0) : null
          let acum = 0
          const capturados: [number, number][] = rd && totalCasos ? [[0, 0], ...rd.lift.deciles.map((x, i): [number, number] => { acum += conCasos[i] ?? 0; return [x.decil / 10, acum / totalCasos] })] : []
          const al20 = capturados.find(([x]) => Math.abs(x - 0.2) < 1e-9)?.[1]
          // costo de equivocarse: peso × casos no detectados + falsas alarmas, para cada porcentaje alertado
          const costos = rd == null || n == null || casos == null ? [] : rd.metricas_por_percentil
            .filter((f) => f.casos_detectados_pct != null && f.sin_falsa_alarma_pct != null)
            .map((f) => ({ p: f.percentil, costo: peso * casos * (1 - (f.casos_detectados_pct as number) / 100) + (n - casos) * (1 - (f.sin_falsa_alarma_pct as number) / 100), f }))
          const mejor = costos.length ? costos.reduce((a, b) => (b.costo < a.costo ? b : a)) : null
          const pestanas: Pestana<Ver>[] = [
            { clave: 'creible', texto: 'Es creíble el riesgo' },
            { clave: 'reparto', texto: 'Cómo se reparte' },
            ...(rd ? [{ clave: 'revisar', texto: 'A cuántos revisar' } satisfies Pestana<Ver>] : []),
            ...(dec || rd ? [{ clave: 'beneficio', texto: 'Beneficio y costo' } satisfies Pestana<Ver>] : []),
          ]
          return (
            <ConPestanas etiqueta="Qué ver de la calibración" pestanas={pestanas}>
              {(ver) => ver === 'creible' ? (
                <div className="grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
                  {/* llenar: las cifras se reparten a lo alto de la tarjeta, que iguala a sus vecinas */}
                  <Panel llenar titulo={dErr.titulo} descripcion={dErr.descripcion}>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:flex xl:min-h-full xl:flex-col xl:justify-between">
                      <Cifra valor={fracPct(d.riesgo_medio)} texto="Riesgo medio que da el modelo" />
                      <Cifra valor={fracPct(d.observado)} texto="Niños que tuvieron el desenlace" />
                      <Cifra valor={d.razon_riesgo_observado != null ? dec2(d.razon_riesgo_observado) : '—'}
                        texto={jerga(tecnico, 'Riesgo dicho entre riesgo real (1 es lo ideal)', 'Razón riesgo medio / observado')} />
                      <Cifra valor={d.brier == null ? '—' : tecnico ? String(d.brier) : dec2(d.brier)} texto={jerga(tecnico, 'Error del porcentaje de riesgo', 'Puntaje de Brier')} />
                      {d.ece != null && <p className="text-sm text-salvia sm:col-span-2 lg:col-span-4">{jerga(tecnico, 'Error medio entre el riesgo dicho y el real', 'ECE (error de calibración esperado)')}: {tecnico ? d.ece : dec2(d.ece)}</p>}
                    </div>
                  </Panel>
                  <Grafica titulo={dCal.titulo} descripcion={dCal.descripcion}
                    exportar={{ nombre: 'calibracion', filas: d.bins.map((b) => ({ grupo_de_10: b.bin, ninos: b.n, riesgo_medio: b.riesgo_medio, observado: b.observado })), muestra }}>
                    <CurvaXY etiqueta="Riesgo dicho frente a riesgo real" ejeX="Riesgo que da el modelo" ejeY="Lo que ocurre en realidad" diagonal
                      dominioX={[0, tope]} dominioY={[0, tope]}
                      formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                      series={[{ clave: 'obs', nombre: 'Grupos de niños', color: 0, puntos: puntos.map((p) => [p.riesgo_medio as number, p.observado]) }]} />
                  </Grafica>
                  <TablaDatos titulo="Por grupos de niños" descripcion="Diez grupos del mismo tamaño, del menor al mayor riesgo."
                    exportar={{ nombre: 'calibracion-grupos', filas: d.bins.map((b) => ({ grupo: b.bin, ninos: b.n, riesgo_medio: b.riesgo_medio, observado: b.observado })), muestra }}>
                    <Tabla densa>
                      <thead><tr><th>Grupo</th><th>Niños</th><th>Riesgo dicho</th><th>Real</th></tr></thead>
                      <tbody>{d.bins.map((b) => <tr key={b.bin}><td>{b.bin}</td><td>{num(b.n)}</td><td>{fracPct(b.riesgo_medio)}</td><td>{fracPct(b.observado)}</td></tr>)}</tbody>
                    </Tabla>
                  </TablaDatos>
                </div>
              ) : ver === 'reparto' ? (
                <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
                  {d.hist_riesgo?.estado === 'ok' && (
                    <Grafica titulo={dHr.titulo} descripcion={dHr.descripcion}
                      exportar={{ nombre: 'calibracion-riesgo-por-desenlace', muestra,
                        filas: d.hist_riesgo.tramos.map((t) => ({ desde: t.desde, hasta: t.hasta, con_el_desenlace: t.con, sin_el_desenlace: t.sin })) }}>
                      {d.hist_riesgo.casos != null ? (
                        <HistogramaDosGrupos etiqueta="Riesgo de los niños con y sin el desenlace" tramos={d.hist_riesgo.tramos} casos={d.hist_riesgo.casos}
                          total={d.hist_riesgo.n} nombres={['Con el desenlace', 'Sin el desenlace']} formatoX={(v) => `${Math.round(v * 100)} %`} />
                      ) : <p className="text-sm text-salvia">Hay menos de 5 niños con el desenlace: no se dibuja la comparación.</p>}
                      <p className="mt-2 text-sm text-salvia">
                        Riesgo típico (mediana): con el desenlace {d.hist_riesgo.mediana_con != null ? fracPct(d.hist_riesgo.mediana_con) : 'n menor que 20'};
                        sin el desenlace {d.hist_riesgo.mediana_sin != null ? fracPct(d.hist_riesgo.mediana_sin) : 'n menor que 20'}.
                        Los tramos con menos de 5 niños quedan sin barra.
                      </p>
                    </Grafica>
                  )}
                  <Grafica titulo={dHist.titulo} descripcion={dHist.descripcion}
                    exportar={{ nombre: 'calibracion-histograma', filas: d.histograma.map((h) => ({ desde: h.desde, hasta: h.hasta, ninos: h.n })), muestra }}>
                    <Histograma etiqueta="Cómo se reparte el riesgo" tramos={d.histograma} alto={300} formatoX={(v) => `${Math.round(v * 100)} %`} />
                    {d.histograma.some((h) => h.n == null) && <p className="mt-1 text-xs text-salvia">Los tramos vacíos tienen {N_MENOR_QUE_5}.</p>}
                  </Grafica>
                </div>
              ) : ver === 'revisar' && rd ? (
                <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
                  <Grafica titulo={dCap.titulo} descripcion={al20 != null ? `Revisando al 20 % con más riesgo se encuentra a ${Math.round(100 * al20)} de cada 100 casos.` : dCap.descripcion}
                    exportar={{ nombre: 'calibracion-capturados', filas: rd.lift.deciles.map((x) => ({ grupo_de_10: x.decil, ninos: x.niños, tasa: x.tasa, veces_la_tasa_general: x.lift })), muestra: muestraDe(n, casos) }}>
                    {capturados.length ? (
                      <CurvaXY etiqueta="Casos capturados al revisar primero a los de más riesgo" ejeX="Niños revisados" ejeY="Casos encontrados" diagonal alto={240}
                        formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                        series={[{ clave: 'cap', nombre: 'Con el modelo', color: 0, puntos: capturados }]} />
                    ) : <p className="text-sm text-salvia">Algún grupo tiene {N_MENOR_QUE_5} casos: no se dibuja la curva.</p>}
                  </Grafica>
                  <TablaDatos titulo={dK.titulo} descripcion={dK.descripcion}
                    exportar={{ nombre: 'calibracion-revisar', filas: rd.top_k.map((x) => ({ ninos_revisados: x.k, casos: x.casos, alertas_acertadas_pct: x.acertadas_pct, casos_detectados_pct: x.detectados_pct })), muestra: muestraDe(n, casos) }}>
                    <label className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
                      Niños que el equipo puede revisar
                      <input type="number" min={1} max={n} value={capacidad} onChange={(e) => setCapacidad(Math.max(0, Number(e.target.value) || 0))}
                        className="w-24 rounded-control border border-linea bg-papel px-2 py-1 text-sm tabular-nums" />
                    </label>
                    <p className="mb-2 text-xs text-salvia">✓ cabe en la capacidad del equipo; en gris, no cabe.</p>
                    <Tabla densa>
                      <thead><tr><th>Revisar</th><th>Casos hallados</th><th>Acertadas</th></tr></thead>
                      <tbody>
                        {rd.top_k.map((x) => (
                          <tr key={x.k} className={x.k <= capacidad ? '' : 'text-salvia'}>
                            <td className="whitespace-nowrap">{x.k <= capacidad ? '✓ ' : ''}{num(x.k)}<span className="sr-only">{x.k <= capacidad ? ' niños, cabe en el equipo' : ' niños, no cabe en el equipo'}</span></td>
                            <td>{omitida(x.casos, num)}</td><td>{pctN(x.acertadas_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Tabla>
                  </TablaDatos>
                </div>
              ) : (
                // el beneficio es un gráfico alto y el costo un control con su sugerencia: cada tarjeta con su propio alto
                <div className="grid items-start gap-4 xl:grid-cols-2 [&>*]:min-w-0">
                  {dec && (
                    <Grafica titulo={dBen.titulo} descripcion={dBen.descripcion}
                      exportar={{ nombre: 'calibracion-beneficio', filas: dec.puntos.map((p) => ({ umbral: p.umbral, modelo: p.modelo, alertar_a_todos: p.todos, alertar_a_ninguno: p.ninguno, alertados_pct: p.alertas_pct })), muestra }}>
                      {(() => {
                        // el plan pide el beneficio según a cuántos niños se alerta; si el artefacto no trae ese dato, según el umbral de riesgo
                        const porPct = dec.puntos.every((p) => p.alertas_pct != null)
                        const x = (p: (typeof dec.puntos)[number]) => (porPct ? (p.alertas_pct as number) / 100 : p.umbral)
                        const pts = [...dec.puntos].sort((a, b) => x(a) - x(b))
                        return (
                          <CurvaXY etiqueta="Beneficio de alertar con el modelo, a todos o a ninguno" dominioX={porPct ? [0, 1] : [0, 0.5]} dominioY={[-0.1, 'auto']}
                            ejeX={porPct ? 'Niños alertados (los de más riesgo)' : jerga(tecnico, 'Riesgo desde el que se alerta', 'Umbral de riesgo')} ejeY="Beneficio"
                            formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => dec2(v)}
                            series={[
                              { clave: 'modelo', nombre: 'Con el modelo', color: 0, puntos: pts.map((p) => [x(p), p.modelo]), sinPuntos: true },
                              { clave: 'todos', nombre: 'Alertar a todos', color: 1, puntos: pts.map((p) => [x(p), p.todos]), sinPuntos: true },
                              { clave: 'ninguno', nombre: 'No alertar a nadie', color: 2, puntos: pts.map((p) => [x(p), p.ninguno]), sinPuntos: true },
                            ]} />
                        )
                      })()}
                      {dec.lectura && <p className="mt-2 text-sm text-salvia">{dec.lectura}</p>}
                    </Grafica>
                  )}
                  {rd && (
                    <Panel titulo={dCosto.titulo} descripcion={dCosto.descripcion}>
                      <label className="flex items-baseline justify-between gap-2 text-sm font-semibold" htmlFor="peso-caso">
                        No detectar un caso pesa como
                        <output htmlFor="peso-caso" className="tabular-nums text-teal">{peso} falsas alarmas</output>
                      </label>
                      <input id="peso-caso" type="range" min={1} max={30} value={peso} onChange={(e) => setPeso(Number(e.target.value))} className="mt-2 w-full accent-teal"
                        aria-valuetext={`Un caso no detectado pesa como ${peso} falsas alarmas`} />
                      {mejor ? (
                        <div className="mt-3 rounded-control bg-teal-tinte p-3 text-sm" aria-live="polite">
                          <p>Sugerido: <b>alertar al {mejor.p} %</b> con más riesgo.</p>
                          <p className="mt-1 text-salvia">Detectaría {pctN(mejor.f.casos_detectados_pct)} de los casos y acertaría {pctN(mejor.f.alertas_acertadas_pct)} de las alertas.</p>
                        </div>
                      ) : <p className="mt-3 text-sm text-salvia">Sin datos suficientes para sugerir un porcentaje.</p>}
                      <p className="mt-2"><IrA submodulo="rendimiento">Verlo en Rendimiento</IrA></p>
                    </Panel>
                  )}
                </div>
              )}
            </ConPestanas>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
