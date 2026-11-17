// Resumen: la puerta de entrada de la analítica (plan v3.7, 6.3.1). Cifras clave del desenlace elegido, revisión rápida
// con un semáforo de una línea por área, qué tan bien ordena por desenlace, la ficha de la muestra y tres miniaturas que
// llevan a su submódulo. Las cifras salen de los artefactos de Resumen, Rendimiento, Calibración e Interpretabilidad.
import type { ReactNode } from 'react'
import { useSubmodulo } from '../../api/analitica'
import type { DatosCalibracion, DatosInterpretabilidad, DatosRendimiento, DatosResumen, Semaforo } from '../../api/tipos'
import { Bosque } from '../../components/graficos/equidad'
import { CurvaXY } from '../../components/graficos/xy'
import { Panel } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num, pct } from '../../lib/formato'
import { datosAl, jerga, SEMAFORO, variable } from '../../lib/lenguaje'
import { EnPrueba, Guia, IrA, MatrizAlerta, pctN, Resultado, useNombreDesenlace, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

/** A qué submódulo lleva cada semáforo y cómo se llama su área. */
const DESTINO: Record<string, string> = { auc: 'rendimiento', calibracion: 'calibracion', equidad: 'equidad', estabilidad: 'estabilidad', poblacion: 'poblacion' }
const AREA: Record<string, string> = { auc: 'Rendimiento', calibracion: 'Calibración', equidad: 'Equidad', estabilidad: 'Estabilidad', poblacion: 'Población' }

/** El ícono del semáforo: además del color, una forma (✓, ! o ✕) para no depender solo del tono. */
function Luz({ estado }: { estado: Semaforo['estado'] }) {
  const fondo = { verde: 'var(--color-teal-medio)', ambar: 'var(--color-ocre)', rojo: 'var(--color-coral-hondo)', gris: 'var(--color-referencia)' }[estado]
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
      <circle cx="9" cy="9" r="8" fill={fondo} />
      {estado === 'verde' && <path d="M5 9.5l2.5 2.5L13 6.5" stroke="#fff" strokeWidth="2" fill="none" />}
      {estado === 'ambar' && <path d="M9 4.5v6M9 13v.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
      {estado === 'rojo' && <path d="M6 6l6 6M12 6l-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
      {estado === 'gris' && <path d="M5.5 9h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}

function Kpi({ valor, texto }: { valor: ReactNode; texto: ReactNode }) {
  return (
    <div className="rounded-panel border border-linea/80 bg-papel px-4 py-3 shadow-suave">
      <p className="text-2xl font-bold leading-tight tracking-tight text-teal tabular-nums sm:text-3xl">{valor}</p>
      <p className="mt-1 text-sm leading-snug text-salvia">{texto}</p>
    </div>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-linea/70 py-1.5 text-sm first:border-t-0">
      <span className="text-salvia">{etiqueta}</span><span className="text-right font-semibold tabular-nums">{valor}</span>
    </div>
  )
}

export default function Resumen() {
  const { entrenamiento, desenlace, modelo } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosResumen>(entrenamiento, 'resumen')
  const rend = useSubmodulo<DatosRendimiento>(entrenamiento, 'rendimiento', desenlace)
  const cal = useSubmodulo<DatosCalibracion>(entrenamiento, 'calibracion', desenlace)
  const interp = useSubmodulo<DatosInterpretabilidad>(entrenamiento, 'interpretabilidad', desenlace)
  const nombre = useNombreDesenlace()
  const { tecnico } = useTecnico()
  const dOrd = descripcionDe('ordena_por_desenlace'), dSem = descripcionDe('revision_rapida'), dMue = descripcionDe('muestra_entrenamiento')
  const dAe = descripcionDe('aciertos_errores_10'), dCal = descripcionDe('riesgo_real'), dPesan = descripcionDe('variables_pesan')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Las cifras de arriba son del desenlace elegido en el contexto. «Qué tan bien ordena» dice si el modelo pone primero a los niños que sí tendrán el desenlace: 1 sería perfecto y 0,5 lo mismo que tirar una moneda.</p>
        <p>La revisión rápida da un semáforo por área. Al pasar el puntero sobre una línea se ve la regla que decide su color.</p>
        <p>Las gráficas pequeñas llevan a su submódulo para ver el detalle.</p>
      </Guia>
      <Resultado consulta={consulta}>
        {(r) => {
          const filas = Object.keys(r.desenlaces ?? {}).map((c) => ({ clave: c, ...(r.desenlaces?.[c] ?? {}) }))
          const actual = filas.find((f) => f.clave === desenlace) ?? filas[0]
          const d = rend.data?.estado === 'ok' && desenlace ? rend.data.desenlaces?.[desenlace] : undefined
          const top10 = d && !d.estado ? d.metricas_por_top.find((t) => t.top_pct === 10) : undefined
          const conf10 = d && !d.estado ? d.confusion_por_top.find((t) => t.top_pct === 10) : undefined
          const c = cal.data?.estado === 'ok' && desenlace ? cal.data.desenlaces?.[desenlace] : undefined
          const i = interp.data?.estado === 'ok' && desenlace ? interp.data.desenlaces?.[desenlace] : undefined
          const pesan = (i?.shap_global?.variables.map((v) => ({ variable: v.variable, pct: v.importancia_pct }))
            ?? i?.importancia?.map((v) => ({ variable: v.variable, pct: v.importancia_pct })) ?? []).slice(0, 5)
          const maxPesa = Math.max(1, ...pesan.map((p) => p.pct))
          const bins = (c?.bins ?? []).filter((b) => b.riesgo_medio != null && b.observado != null)
          const tope = Math.min(1, Math.ceil(10 * Math.max(0.1, ...bins.map((b) => Math.max(b.riesgo_medio ?? 0, b.observado ?? 0)))) / 10)
          return (
            <>
              <section aria-label="Cifras clave" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <Kpi valor={actual?.auc != null ? dec2(actual.auc) : '—'}
                  texto={<>{jerga(tecnico, 'Qué tan bien ordena', 'AUC')}{actual?.ic_bajo != null && actual?.ic_alto != null ? <span className="block tabular-nums">({dec2(actual.ic_bajo)} a {dec2(actual.ic_alto)})</span> : null}</>} />
                <Kpi valor={pctN(top10?.alertas_acertadas_pct)} texto={jerga(tecnico, 'Alertas acertadas, alertando al 10 %', 'VPP en el 10 % de más riesgo')} />
                <Kpi valor={pctN(top10?.casos_detectados_pct)} texto={jerga(tecnico, 'Casos detectados, alertando al 10 %', 'Sensibilidad en el 10 % de más riesgo')} />
                <Kpi valor={pctN(top10?.sin_falsa_alarma_pct)} texto={jerga(tecnico, 'Niños sin falsa alarma', 'Especificidad en el 10 % de más riesgo')} />
                <Kpi valor={c?.brier != null ? dec2(c.brier) : '—'} texto={jerga(tecnico, 'Error del riesgo (0 es perfecto)', 'Brier')} />
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                <Panel titulo={dSem.titulo} descripcion={dSem.descripcion}>
                  <ul className="divide-y divide-linea/70">
                    {(actual?.semaforos ?? []).map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-2 text-sm" title={`${s.detalle} Regla: ${s.umbral}`}>
                        <Luz estado={s.estado} />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{AREA[s.id] ?? s.nombre}</span>
                          <span className="block text-xs text-salvia">{SEMAFORO[s.estado]}{s.valor != null ? ` · ${tecnico ? s.valor : dec2(s.valor)}` : ''}</span>
                        </span>
                        {DESTINO[s.id] && <IrA submodulo={DESTINO[s.id]}>Ver</IrA>}
                      </li>
                    ))}
                  </ul>
                  {actual && nombre(actual.clave).enPrueba && <p className="mt-2"><EnPrueba /></p>}
                </Panel>

                <Panel titulo={dOrd.titulo} descripcion={dOrd.descripcion}>
                  <Bosque etiqueta="Qué tan bien ordena el modelo, por desenlace" nombreValor={jerga(tecnico, 'Ordena', 'AUC')}
                    puntos={filas.map((f) => ({ etiqueta: nombre(f.clave).nombre + (nombre(f.clave).enPrueba ? ' (En prueba)' : ''), valor: f.auc ?? null, bajo: f.ic_bajo ?? null, alto: f.ic_alto ?? null, ref: f.auc_ref ?? null }))} />
                </Panel>

                <Panel titulo={dMue.titulo} descripcion={dMue.descripcion} accion={<IrA submodulo="poblacion">Población</IrA>}>
                  <Fila etiqueta="Entrenamiento" valor={entrenamiento != null ? `N.º ${entrenamiento}` : '—'} />
                  <Fila etiqueta="Niños de validación" valor={actual?.n != null ? num(actual.n) : '—'} />
                  <Fila etiqueta="Casos del desenlace" valor={actual?.casos != null && actual.n ? `${num(actual.casos)} (${pct((100 * actual.casos) / actual.n)})` : '—'} />
                  <Fila etiqueta="Datos" valor={modelo?.corte ? datosAl(modelo.corte) : '—'} />
                  <Fila etiqueta="Fuente" valor={modelo?.fuente === 'simulado' ? 'Datos simulados' : modelo?.fuente ? 'Base de la Fundación' : '—'} />
                </Panel>
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                <Panel titulo={dAe.titulo} descripcion={dAe.descripcion} accion={<IrA submodulo="rendimiento">Rendimiento</IrA>}>
                  {conf10 ? <MatrizAlerta c={conf10} compacta /> : <p className="text-sm text-salvia">Sin datos de rendimiento para este desenlace.</p>}
                </Panel>
                <Panel titulo={dCal.titulo} descripcion={dCal.descripcion} accion={<IrA submodulo="calibracion">Calibración</IrA>}>
                  {bins.length > 1 ? (
                    <CurvaXY etiqueta="Riesgo dicho frente al real, por grupos de niños" ejeX="Riesgo que da el modelo" ejeY="Lo que ocurrió" diagonal alto={220}
                      dominioX={[0, tope]} dominioY={[0, tope]} formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                      series={[{ clave: 'cal', nombre: 'Grupos de niños', color: 0, puntos: bins.map((b) => [b.riesgo_medio as number, b.observado as number]) }]} />
                  ) : <p className="text-sm text-salvia">Sin datos de calibración para este desenlace.</p>}
                </Panel>
                <Panel titulo={dPesan.titulo} descripcion={dPesan.descripcion} accion={<IrA submodulo="interpretabilidad">Ver todos</IrA>}>
                  {pesan.length ? (
                    <ul className="space-y-2.5">
                      {pesan.map((p) => (
                        <li key={p.variable} className="grid grid-cols-[minmax(7rem,12rem)_1fr_3.5rem] items-center gap-2 text-sm">
                          <span className="leading-tight">{variable(tecnico, p.variable)}</span>
                          <span className="h-2.5 rounded-full bg-teal-tinte"><span className="block h-full rounded-full bg-teal-medio" style={{ width: `${(100 * p.pct) / maxPesa}%` }} /></span>
                          <span className="text-right tabular-nums">{pct(p.pct)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-salvia">Sin datos de interpretabilidad para este desenlace.</p>}
                </Panel>
              </section>
            </>
          )
        }}
      </Resultado>
    </div>
  )
}
