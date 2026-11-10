// Población: embudo de la muestra, casos por desenlace y datos faltantes.
import { useSubmodulo } from '../../api/analitica'
import type { DatosPoblacion } from '../../api/tipos'
import { Grafica, TablaDatos } from '../../components/grafica'
import { BarrasAgrupadas } from '../../components/graficos/distribuciones'
import { Aviso, Cifra, Panel, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, frase, num, pct } from '../../lib/formato'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { Guia, omitida, PorDesenlace, pctN } from './comun'
import { useContextoAnalitica } from './contexto'

const textoEtapa = (e: Record<string, string | number | null>) => String(e.etapa ?? e.nombre ?? e.paso ?? e.filtro ?? e.descripcion ?? '—')

export default function Poblacion() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosPoblacion>(entrenamiento, 'poblacion', desenlace)
  const dEmb = descripcionDe('embudo'), dEv = descripcionDe('eventos'), dNul = descripcionDe('datos_faltantes')
  const dMu = descripcionDe('muestra_universo'), dMuNum = descripcionDe('muestra_universo_numerica')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Dice con qué niños se evaluó el modelo: cuántos quedan después de cada filtro, cuántos casos hay y qué datos faltan. Con pocos casos, cualquier cifra del modelo es poco confiable.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(d) => {
          const max = Math.max(1, ...d.embudo.map((e) => Number(e.n ?? 0)))
          const mu = d.distribuciones_muestra_universo
          const categoricas = Object.entries(mu?.categoricas ?? {})
          const numericas = Object.entries(mu?.numericas ?? {})
          return (
            <>
              <Panel titulo={dEv.titulo} descripcion={dEv.descripcion}>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Cifra valor={num(d.eventos.niños)} texto="niños evaluados" />
                  <Cifra valor={omitida(d.eventos.casos, num)} texto="casos del desenlace" />
                  <Cifra valor={d.eventos.tasa != null ? pct(100 * d.eventos.tasa) : '—'} texto="de los niños tuvo el desenlace" />
                </div>
              </Panel>
              {d.embudo.length > 0 && (
                <Grafica titulo={dEmb.titulo} descripcion={dEmb.descripcion}
                  exportar={{ nombre: 'poblacion-embudo', filas: d.embudo.map((e) => ({ etapa: textoEtapa(e), ninos: e.n })) }}>
                  <ul role="figure" aria-label="Niños que quedan después de cada filtro" className="space-y-2">
                    {d.embudo.map((e, i) => (
                      <li key={i} className="grid grid-cols-[minmax(8rem,16rem)_1fr_5rem] items-center gap-2 text-sm">
                        <span>{frase(textoEtapa(e))}</span>
                        <span className="h-3 rounded-full bg-fondo"><span className="block h-3 rounded-full" style={{ width: `${(100 * Number(e.n ?? 0)) / max}%`, background: 'var(--color-serie-1)' }} /></span>
                        <span className="text-right tabular-nums">{omitida(typeof e.n === 'number' ? e.n : null, num)}</span>
                      </li>
                    ))}
                  </ul>
                </Grafica>
              )}
              {mu == null ? (
                <Aviso tono="teal">Este entrenamiento no trae la comparación de la muestra con todos los niños. Para verla, vuelva a entrenar el modelo.</Aviso>
              ) : mu.estado === 'insuficiente' ? (
                <Aviso tono="teal">Hay menos de {mu.minimo_ninos} niños en la muestra o en el universo: no se muestran distribuciones.</Aviso>
              ) : (
                <>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {categoricas.map(([variable, v]) => (
                      <Grafica key={variable} titulo={`${dMu.titulo}: ${variable}`} descripcion={dMu.descripcion}
                        exportar={{ nombre: `poblacion-muestra-universo-${variable.replaceAll(' ', '-')}`, muestra: `${v.n_muestra} niños en la muestra de ${v.n_universo}`,
                          filas: v.categorias.map((c) => ({ categoria: c.categoria, pct_muestra: c.pct_muestra, pct_universo: c.pct_universo, diferencia_puntos: c.diferencia_pp })) }}>
                        <BarrasAgrupadas etiqueta={`${variable}: la muestra frente a todos los niños`}
                          filas={v.categorias.map((c) => ({ x: frase(c.categoria), muestra: c.pct_muestra, universo: c.pct_universo }))}
                          series={[{ clave: 'muestra', nombre: 'Muestra', color: 0 }, { clave: 'universo', nombre: 'Todos los niños', color: 1 }]} />
                        <p className="mt-2 text-xs text-salvia">
                          {v.diferencia_maxima_pp != null ? `La mayor diferencia es de ${dec2(Math.abs(v.diferencia_maxima_pp))} puntos. ` : ''}
                          Una categoría con menos de 5 niños queda sin barra ({N_MENOR_QUE_5}).
                        </p>
                      </Grafica>
                    ))}
                  </div>
                  {numericas.map(([variable, q]) => (
                    <TablaDatos key={variable} titulo={dMuNum.titulo} descripcion={dMuNum.descripcion}
                      exportar={{ nombre: 'poblacion-muestra-universo-numerica',
                        filas: (['p5', 'p25', 'p50', 'p75', 'p95'] as const).map((k) => ({ cuantil: k, muestra: q.muestra[k], todos_los_ninos: q.universo[k] })) }}>
                      <Tabla densa>
                        <thead><tr><th>Valor</th><th>Muestra ({num(q.n_muestra)} niños)</th><th>Todos los niños ({num(q.n_universo)})</th></tr></thead>
                        <tbody>
                          {(['p5', 'p25', 'p50', 'p75', 'p95'] as const).map((k) => (
                            <tr key={k}><td>{k === 'p50' ? 'Mediana' : `Percentil ${k.slice(1)}`}</td><td>{q.muestra[k] != null ? dec2(q.muestra[k]) : '—'}</td><td>{q.universo[k] != null ? dec2(q.universo[k]) : '—'}</td></tr>
                          ))}
                        </tbody>
                      </Tabla>
                    </TablaDatos>
                  ))}
                </>
              )}
              <TablaDatos titulo={dNul.titulo} descripcion={dNul.descripcion}
                exportar={{ nombre: 'poblacion-faltantes', filas: d.nulos.map((n) => ({ dato: n.variable, sin_dato_pct: n.nulos_pct })) }}>
                <Tabla densa>
                  <thead><tr><th>Dato</th><th>Niños sin el dato</th></tr></thead>
                  <tbody>{d.nulos.map((n) => <tr key={n.variable}><td>{n.variable}</td><td>{pctN(n.nulos_pct)}</td></tr>)}</tbody>
                </Tabla>
              </TablaDatos>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
