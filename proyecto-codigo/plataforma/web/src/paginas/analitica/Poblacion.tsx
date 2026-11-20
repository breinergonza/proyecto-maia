// Población (plan v3.7, 6.3.6): cifras de la muestra, embudo, muestra frente a todos los niños, datos faltantes con su
// límite (30 %) y casos por desenlace con aviso de pocos casos (menos de 100) y la nota de psicomotor «por definición».
// Cada pregunta tiene su pestaña (?ver=): la muestra, los casos por desenlace, el reparto por categoría y los valores típicos
// frente a todos los niños, y los datos que faltan; así la página cabe en la pantalla y las listas largas se desplazan dentro de su tarjeta.
import { useSubmodulo } from '../../api/analitica'
import type { DatosPoblacion } from '../../api/tipos'
import { Grafica, TablaDatos } from '../../components/grafica'
import { BarrasAgrupadas } from '../../components/graficos/distribuciones'
import { Aviso, Cifra, Panel, Tabla } from '../../components/ui'
import { PanelPestana, Pestanas, usePestanaEnUrl } from '../../components/ui/Pestanas'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, frase, num, pct } from '../../lib/formato'
import { cn } from '../../lib/cn'
import { nombreVariable, variable } from '../../lib/lenguaje'
import { Guia, omitida, PorDesenlace, pctN, useNombreDesenlace, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

/** Porcentaje de niños sin un dato desde el que se pinta en coral, y casos por debajo de los que se avisa. */
const LIMITE_FALTANTES = 30
const POCOS_CASOS = 100

const PESTANAS = [
  { clave: 'muestra', texto: 'La muestra' },
  { clave: 'casos', texto: 'Casos por desenlace' },
  { clave: 'categorias', texto: 'Reparto por categoría' },
  { clave: 'valores', texto: 'Valores típicos' },
  { clave: 'faltantes', texto: 'Datos faltantes' },
] as const
const CLAVES = PESTANAS.map((p) => p.clave)
/** El contenido de una pestaña ocupa el alto que queda: las tarjetas con lista (`llenar`) se encogen y la desplazan por dentro. */
const PANEL = 'mt-3 flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:-mx-1 lg:overflow-y-auto lg:px-1 lg:pb-1'

const textoEtapa = (e: Record<string, string | number | null>) => String(e.etapa ?? e.nombre ?? e.paso ?? e.filtro ?? e.descripcion ?? '—')

export default function Poblacion() {
  const { tecnico } = useTecnico()
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosPoblacion>(entrenamiento, 'poblacion', desenlace)
  const todos = useSubmodulo<DatosPoblacion>(entrenamiento, 'poblacion')   // todos los desenlaces, para «casos por desenlace»
  const nombreDes = useNombreDesenlace()
  const [ver, elegir] = usePestanaEnUrl('ver', CLAVES)
  const dEmb = descripcionDe('embudo'), dEv = descripcionDe('eventos'), dNul = descripcionDe('datos_faltantes')
  const dMu = descripcionDe('muestra_universo'), dMuNum = descripcionDe('muestra_universo_numerica')
  return (
    <div className="flex flex-col lg:min-h-0 lg:flex-1">
      <Guia>
        <p>Dice con qué niños se evaluó el modelo: cuántos quedan después de cada filtro, cuántos casos hay y qué datos faltan. Con pocos casos, cualquier cifra del modelo es poco confiable.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(d) => {
          const max = Math.max(1, ...d.embudo.map((e) => Number(e.n ?? 0)))
          const mu = d.distribuciones_muestra_universo
          const categoricas = Object.entries(mu?.categoricas ?? {})
          const nulos = [...d.nulos].sort((x, y) => (y.nulos_pct ?? -1) - (x.nulos_pct ?? -1))
          const porDesenlace: [string, DatosPoblacion['eventos']][] = todos.data?.estado === 'ok' && Object.keys(todos.data.desenlaces ?? {}).length
            ? Object.entries(todos.data.desenlaces ?? {}).map(([c, x]) => [c, x.eventos] as [string, DatosPoblacion['eventos']]).sort(([, a], [, b]) => (b.casos ?? 0) - (a.casos ?? 0))
            : [[desenlace ?? '', d.eventos]]
          const maxCasos = Math.max(1, ...porDesenlace.map(([, e]) => e.casos ?? 0))
          const numericas = Object.entries(mu?.numericas ?? {})
          return (
            <>
              <Pestanas prefijo="poblacion" etiqueta="Qué ver" pestanas={PESTANAS} activa={ver} elegir={elegir} />
              <PanelPestana prefijo="poblacion" activa={ver} className={PANEL}>
                {ver === 'muestra' && (
                  <>
                    <Panel titulo="La muestra en cifras" descripcion="Con cuántos niños y casos se valida el modelo para este desenlace.">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
                        <Cifra valor={num(d.eventos.niños)} texto="niños evaluados" />
                        <Cifra valor={omitida(d.eventos.casos, num)} texto="casos del desenlace" />
                        <Cifra valor={d.eventos.tasa != null ? pct(100 * d.eventos.tasa) : '—'} texto="de los niños tuvo el desenlace" />
                        <Cifra valor={num(d.nulos.filter((n) => (n.nulos_pct ?? 0) > 50).length)} tono={d.nulos.some((n) => (n.nulos_pct ?? 0) > 50) ? 'coral' : undefined}
                          texto="datos faltan en más de la mitad de los niños" />
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
                  </>
                )}
                {ver === 'casos' && (
                  <Panel llenar titulo={dEv.titulo} descripcion={`Cuántos casos hay para validar en cada desenlace; con menos de ${POCOS_CASOS} el modelo es poco confiable.`}>
                    {porDesenlace.some(([clave]) => /psicomotor/i.test(nombreDes(clave).nombre)) && (
                      <p className="mb-3 rounded-control bg-ocre-tinte p-3 text-sm text-ocre-hondo">
                        Desarrollo psicomotor bajo es, <b>por definición</b>, el 10 % más bajo de los niños del entrenamiento: sus «casos» no son un retraso clínico diagnosticado.
                      </p>
                    )}
                    <ul className="space-y-2.5">
                      {porDesenlace.map(([clave, ev]) => {
                        const pocos = ev.casos != null && ev.casos < POCOS_CASOS
                        return (
                          <li key={clave} className="grid grid-cols-[minmax(8rem,15rem)_1fr_3.5rem] items-center gap-2 text-sm">
                            <span className={cn('leading-tight', clave === desenlace && 'font-semibold')}>{nombreDes(clave).nombre}{nombreDes(clave).enPrueba ? ' (En prueba)' : ''}</span>
                            <span className="relative h-3 rounded-full bg-fondo">
                              <span className={cn('block h-3 rounded-full', pocos ? 'bg-ocre' : 'bg-teal-medio')} style={{ width: `${(100 * (ev.casos ?? 0)) / maxCasos}%` }} />
                              {maxCasos > POCOS_CASOS && <span className="absolute -inset-y-1 w-0.5 bg-tinta" style={{ left: `${(100 * POCOS_CASOS) / maxCasos}%` }} aria-hidden />}
                            </span>
                            <span className={cn('text-right tabular-nums font-semibold', pocos && 'text-ocre-hondo')}>{omitida(ev.casos, num)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </Panel>
                )}
                {(ver === 'categorias' || ver === 'valores') && (mu == null ? (
                  <Aviso tono="teal">Este entrenamiento no trae la comparación de la muestra con todos los niños. Para verla, vuelva a entrenar el modelo.</Aviso>
                ) : mu.estado === 'insuficiente' ? (
                  <Aviso tono="teal">Hay menos de {mu.minimo_ninos} niños en la muestra o en el universo: no se muestran distribuciones.</Aviso>
                ) : ver === 'categorias' ? (
                  <div className="grid gap-3 xl:grid-cols-3 [&>*]:min-w-0">
                    {categoricas.map(([variable, v]) => (
                      <Grafica key={variable} titulo={`${dMu.titulo}: ${variable}`} descripcion={dMu.descripcion}
                        exportar={{ nombre: `poblacion-muestra-universo-${variable.replaceAll(' ', '-')}`, muestra: `${v.n_muestra} niños en la muestra de ${v.n_universo}`,
                          filas: v.categorias.map((c) => ({ categoria: c.categoria, pct_muestra: c.pct_muestra, pct_universo: c.pct_universo, diferencia_puntos: c.diferencia_pp })) }}>
                        <BarrasAgrupadas etiqueta={`${variable}: la muestra frente a todos los niños`}
                          filas={v.categorias.map((c) => ({ x: frase(c.categoria), muestra: c.pct_muestra, universo: c.pct_universo }))}
                          series={[{ clave: 'muestra', nombre: 'Muestra', color: 0 }, { clave: 'universo', nombre: 'Todos los niños', color: 1 }]} />
                        <p className="mt-2 text-xs text-salvia">
                          {v.diferencia_maxima_pp != null ? `La mayor diferencia es de ${dec2(Math.abs(v.diferencia_maxima_pp))} puntos. ` : ''}
                          Cada categoría dice su porcentaje, también si son pocos niños.
                        </p>
                      </Grafica>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2 [&>*]:min-w-0">
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
                  </div>
                ))}
                {ver === 'faltantes' && (
                  <Grafica llenar titulo={dNul.titulo} descripcion={`Porcentaje de niños sin el dato. La raya es el límite aceptable (${LIMITE_FALTANTES} %); en coral, los que lo pasan.`}
                    exportar={{ nombre: 'poblacion-faltantes', filas: nulos.map((n) => ({ dato: nombreVariable(n.variable), sin_dato_pct: n.nulos_pct })) }}>
                    <ul role="figure" aria-label="Porcentaje de niños sin cada dato" className="space-y-2">
                      {nulos.map((n) => {
                        const alto = (n.nulos_pct ?? 0) > LIMITE_FALTANTES
                        return (
                          <li key={n.variable} className="grid grid-cols-[minmax(8rem,15rem)_1fr_4rem] items-center gap-2 text-sm">
                            <span className="leading-tight">{variable(tecnico, n.variable)}</span>
                            <span className="relative h-3 rounded-full bg-fondo">
                              <span className={cn('block h-3 rounded-full', alto ? 'bg-coral-hondo' : 'bg-teal-medio')} style={{ width: `${n.nulos_pct ?? 0}%` }} />
                              <span className="absolute -inset-y-1 w-0.5 bg-tinta" style={{ left: `${LIMITE_FALTANTES}%` }} aria-hidden />
                            </span>
                            <span className={cn('text-right tabular-nums', alto && 'font-bold text-coral-hondo')}>{pctN(n.nulos_pct)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </Grafica>
                )}
              </PanelPestana>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
