// Calibración: si el porcentaje de riesgo que da el modelo es el que ocurre en realidad, y el beneficio de alertar.
import { useSubmodulo } from '../../api/analitica'
import type { DatosCalibracion } from '../../api/tipos'
import { CurvaXY, Histograma } from '../../components/graficos/xy'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Cifra, Panel, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num } from '../../lib/formato'
import { jerga, N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { fracPct, Guia, muestraDe, PorDesenlace, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

export default function Calibracion() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosCalibracion>(entrenamiento, 'calibracion', desenlace)
  const { tecnico } = useTecnico()
  const dCal = descripcionDe('calibracion'), dErr = descripcionDe('calibracion_error'), dHist = descripcionDe('histograma_riesgo')
  const dBen = descripcionDe('beneficio_alertar')
  return (
    <div className="space-y-4">
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
          return (
            <>
              <Panel titulo={dErr.titulo} descripcion={dErr.descripcion}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Cifra valor={fracPct(d.riesgo_medio)} texto="Riesgo medio que da el modelo" />
                  <Cifra valor={fracPct(d.observado)} texto="Niños que tuvieron el desenlace" />
                  <Cifra valor={d.razon_riesgo_observado != null ? dec2(d.razon_riesgo_observado) : '—'}
                    texto={jerga(tecnico, 'Riesgo dicho entre riesgo real (1 es lo ideal)', 'Razón riesgo medio / observado')} />
                  <Cifra valor={d.brier == null ? '—' : tecnico ? String(d.brier) : dec2(d.brier)} texto={jerga(tecnico, 'Error del porcentaje de riesgo', 'Puntaje de Brier')} />
                </div>
                {d.ece != null && <p className="mt-3 text-sm text-salvia">{jerga(tecnico, 'Error medio entre el riesgo dicho y el real', 'ECE (error de calibración esperado)')}: {tecnico ? d.ece : dec2(d.ece)}</p>}
              </Panel>
              <Grafica titulo={dCal.titulo} descripcion={dCal.descripcion}
                exportar={{ nombre: 'calibracion', filas: d.bins.map((b) => ({ grupo_de_10: b.bin, ninos: b.n, riesgo_medio: b.riesgo_medio, observado: b.observado })), muestra }}>
                <CurvaXY etiqueta="Riesgo dicho frente a riesgo real" ejeX="Riesgo que da el modelo" ejeY="Lo que ocurre en realidad" diagonal
                  dominioX={[0, tope]} dominioY={[0, tope]}
                  formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                  series={[{ clave: 'obs', nombre: 'Grupos de niños', color: 0, puntos: puntos.map((p) => [p.riesgo_medio as number, p.observado]) }]} />
              </Grafica>
              <div className="grid gap-4 xl:grid-cols-2">
                <Grafica titulo={dHist.titulo} descripcion={dHist.descripcion}
                  exportar={{ nombre: 'calibracion-histograma', filas: d.histograma.map((h) => ({ desde: h.desde, hasta: h.hasta, ninos: h.n })), muestra }}>
                  <Histograma etiqueta="Cómo se reparte el riesgo" tramos={d.histograma} formatoX={(v) => `${Math.round(v * 100)} %`} />
                  {d.histograma.some((h) => h.n == null) && <p className="mt-1 text-xs text-salvia">Los tramos vacíos tienen {N_MENOR_QUE_5}.</p>}
                </Grafica>
                <TablaDatos titulo="Por grupos de niños" descripcion="Diez grupos del mismo tamaño, del menor al mayor riesgo."
                  exportar={{ nombre: 'calibracion-grupos', filas: d.bins.map((b) => ({ grupo: b.bin, ninos: b.n, riesgo_medio: b.riesgo_medio, observado: b.observado })), muestra }}>
                  <Tabla densa>
                    <thead><tr><th>Grupo</th><th>Niños</th><th>Riesgo dicho</th><th>Real</th></tr></thead>
                    <tbody>{d.bins.map((b) => <tr key={b.bin}><td>{b.bin}</td><td>{num(b.n)}</td><td>{fracPct(b.riesgo_medio)}</td><td>{fracPct(b.observado)}</td></tr>)}</tbody>
                  </Tabla>
                </TablaDatos>
              </div>
              {dec && (
                <Grafica titulo={dBen.titulo} descripcion={dBen.descripcion}
                  exportar={{ nombre: 'calibracion-beneficio', filas: dec.puntos.map((p) => ({ umbral: p.umbral, modelo: p.modelo, alertar_a_todos: p.todos, alertar_a_ninguno: p.ninguno, alertados_pct: p.alertas_pct })), muestra }}>
                  <CurvaXY etiqueta="Beneficio de alertar con el modelo, a todos o a ninguno" ejeX={jerga(tecnico, 'Riesgo desde el que se alerta', 'Umbral de riesgo')} ejeY="Beneficio" dominioX={[0, 0.5]} dominioY={[-0.1, 'auto']}
                    formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => dec2(v)}
                    series={[
                      { clave: 'modelo', nombre: 'Con el modelo', color: 0, puntos: dec.puntos.map((p) => [p.umbral, p.modelo]), sinPuntos: true },
                      { clave: 'todos', nombre: 'Alertar a todos', color: 1, puntos: dec.puntos.map((p) => [p.umbral, p.todos]), sinPuntos: true },
                      { clave: 'ninguno', nombre: 'No alertar a nadie', color: 2, puntos: dec.puntos.map((p) => [p.umbral, p.ninguno]), sinPuntos: true },
                    ]} />
                  {dec.lectura && <p className="mt-2 text-sm text-salvia">{dec.lectura}</p>}
                </Grafica>
              )}
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
