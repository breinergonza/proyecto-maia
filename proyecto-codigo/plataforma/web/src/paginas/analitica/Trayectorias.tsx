// Trayectorias: cómo crece cada grupo de niños frente a la curva de la OMS (z = 0). Se calcula al pedirlo, con el
// indicador, la agrupación y el eje que se elijan. Cada grupo y visita dice cuántos niños tiene, también si son pocos; el
// desvío pide 20 o más. Los selectores valen
// para todo; debajo, una pestaña por pregunta (?ver=): la trayectoria media, la distancia a la OMS y cada niño.
import { useState } from 'react'
import { Link } from 'react-router'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTrayectorias } from '../../api/analitica'
import type { AgruparTrayectoria, EjeTrayectoria, GrupoTrayectoria, IndicadorTrayectoria } from '../../api/tipos'
import { COLOR, LeyendaSeries, SERIES_COLOR, type ColorSerie, type Serie } from '../../components/graficos'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Aviso, Boton, Selector, Tabla, Vacio } from '../../components/ui'
import { PanelPestana, Pestanas, usePestanaEnUrl } from '../../components/ui/Pestanas'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num } from '../../lib/formato'
import { SIN_CIFRA } from '../../lib/lenguaje'
import { EnPrueba, Guia } from './comun'
import { useContextoAnalitica } from './contexto'
import { ResultadoVivo } from './vivo'

const INDICADORES: [IndicadorTrayectoria, string][] = [
  ['peso', 'Peso'], ['talla', 'Talla'], ['perimetro_cefalico', 'Perímetro cefálico'], ['peso_para_talla', 'Peso para la talla'],
]
const AGRUPACIONES: [AgruparTrayectoria, string][] = [
  ['riesgo', 'Riesgo del niño'], ['sexo', 'Sexo'], ['perfil', 'Perfil'], ['sede', 'Sede'],
]
const EJES: [EjeTrayectoria, string][] = [['edad_corregida', 'Edad corregida'], ['cronologica', 'Edad cronológica']]

const PESTANAS = [
  { clave: 'media', texto: 'Trayectoria media' },
  { clave: 'oms', texto: 'Frente a la OMS' },
  { clave: 'ninos', texto: 'Niños individuales' },
] as const
const CLAVES = PESTANAS.map((p) => p.clave)
/** El contenido de una pestaña ocupa el alto que queda: las tarjetas con lista (`llenar`) se encogen y la desplazan por dentro. */
const PANEL = 'flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:-mx-1 lg:overflow-y-auto lg:px-1 lg:pb-1'
/** Encabezado de columna fijo mientras la tabla se desplaza dentro de su tarjeta. */
const ENCABEZADO_FIJO = 'xl:overflow-visible [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-papel'

const z = (v: number | null | undefined) => (v == null ? SIN_CIFRA : dec2(v))
const valorUnidad = (v: number | null, u: string | null) => (v == null ? SIN_CIFRA : `${dec2(v)}${u ? ` ${u}` : ''}`)
// el coral nunca es color de serie: hay cuatro colores y los grupos que pasan de cuatro se resumen en la tabla
const colorDe = (i: number): ColorSerie => (i % 4) as ColorSerie

function GraficaZ({ grupos }: { grupos: GrupoTrayectoria[] }) {
  const visibles = grupos.slice(0, 4)
  const etapas = [...new Map(grupos.flatMap((g) => g.etapas).map((e) => [e.etapa, e])).values()].sort((a, b) => a.orden - b.orden)
  const series: Serie[] = visibles.map((g, i) => ({ clave: `g${i}`, nombre: g.grupo, color: colorDe(i) }))
  const filas = etapas.map((e) => {
    const f: Record<string, string | number | [number, number] | null> = { x: e.nombre }
    visibles.forEach((g, i) => {
      const c = g.etapas.find((x) => x.etapa === e.etapa)
      f[`g${i}`] = c?.z_media ?? null
      f[`b${i}`] = c?.z_media != null && c.z_desvio != null ? [c.z_media - c.z_desvio, c.z_media + c.z_desvio] : null
    })
    return f
  })
  return (
    <>
      <LeyendaSeries series={series} />
      <div style={{ height: 'clamp(200px, 30vh, 340px)' }} role="figure" aria-label="Puntaje z medio de cada grupo en cada visita, con su banda de variación y la franja de la OMS de −2 a +2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={filas} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid stroke={COLOR.rejilla} vertical={false} />
            <ReferenceArea y1={-2} y2={2} fill={COLOR.franja} fillOpacity={1} strokeOpacity={0} ifOverflow="extendDomain" />
            <ReferenceLine y={0} stroke={COLOR.referencia} strokeDasharray="4 3" />
            <XAxis dataKey="x" stroke={COLOR.eje} fontSize={12} tickLine={false} interval="preserveStartEnd" padding={{ left: 12, right: 12 }} />
            <YAxis domain={[-3, 3]} ticks={[-3, -2, 0, 2, 3]} stroke={COLOR.eje} fontSize={12} width={36} tickLine={false} axisLine={false}
              allowDataOverflow tickFormatter={(v: number) => dec2(v)} />
            <Tooltip cursor={{ stroke: COLOR.referencia, strokeDasharray: '3 3' }}
              content={({ active, payload, label }) => active && payload?.length ? (
                <div role="status" className="rounded-control border border-linea bg-papel px-3 py-2 text-sm shadow-elevada">
                  <p className="font-semibold">{String(label)}</p>
                  {series.map((s) => { const v = (payload[0].payload as Record<string, unknown>)[s.clave]
                    return typeof v === 'number' ? <p key={s.clave}>{s.nombre}: {dec2(v)}</p> : null })}
                </div>
              ) : null} />
            {visibles.map((g, i) => (
              <Area key={`b${i}`} dataKey={`b${i}`} stroke="none" fill={SERIES_COLOR[colorDe(i)]} fillOpacity={0.14} isAnimationActive={false}
                connectNulls name={`${g.grupo} (variación)`} />
            ))}
            {visibles.map((g, i) => (
              <Line key={`g${i}`} dataKey={`g${i}`} name={g.grupo} stroke={SERIES_COLOR[colorDe(i)]} strokeWidth={2} isAnimationActive={false}
                connectNulls dot={{ r: 4, strokeWidth: 2, fill: COLOR.papel }} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-salvia">Franja clara: de −2 a +2 desviaciones estándar (DE) de la OMS, lo esperado. Línea punteada: la OMS (0). Banda de cada grupo: una DE arriba y abajo del promedio (con 20 niños o más por visita).</p>
      {grupos.length > 4 && <p className="mt-1 text-xs text-salvia">Se dibujan los cuatro grupos más grandes; la tabla los muestra todos.</p>}
    </>
  )
}

function Individuales({ ninos, grupos }: { ninos: NonNullable<ReturnType<typeof useTrayectorias>['data']>['individuales']; grupos: GrupoTrayectoria[] }) {
  if (!ninos?.length) return null
  const d = descripcionDe('tray_ninos')
  return (
    <TablaDatos llenar titulo={d.titulo} descripcion={d.descripcion} exportar={{
      nombre: 'trayectorias-ninos',
      filas: ninos.flatMap((n) => n.serie.map((s) => ({ codigo: n.codigo, grupo: n.grupo, visita: s.nombre, edad_meses: s.edad_meses, z: s.z }))),
    }}>
      <p className="mb-2 text-xs text-salvia">Hasta 30 niños de {grupos.length} {grupos.length === 1 ? 'grupo' : 'grupos'}; solo los ve el equipo experto.</p>
      <Tabla densa className={ENCABEZADO_FIJO}>
        <thead><tr><th>Niño</th><th>Grupo</th><th>Visitas</th><th>Puntaje z por visita</th></tr></thead>
        <tbody>{ninos.map((n) => (
          <tr key={n.codigo}>
            <td><Link to={`/ninos/${encodeURIComponent(n.codigo)}`} className="font-semibold text-teal underline">{n.codigo}</Link></td>
            <td>{n.grupo}</td><td>{n.serie.length}</td>
            <td>{n.serie.map((s) => `${s.nombre}: ${s.z == null ? '—' : dec2(s.z)}`).join(' · ')}</td>
          </tr>
        ))}</tbody>
      </Tabla>
    </TablaDatos>
  )
}

export default function Trayectorias() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const [indicador, setIndicador] = useState<IndicadorTrayectoria>('peso')
  const [agrupar, setAgrupar] = useState<AgruparTrayectoria>('riesgo')
  const [eje, setEje] = useState<EjeTrayectoria>('edad_corregida')
  const [ver, elegir] = usePestanaEnUrl('ver', CLAVES)
  const consulta = useTrayectorias(entrenamiento, { indicador, agrupar, eje }, desenlace)
  const dMedia = descripcionDe('tray_media'), dOms = descripcionDe('tray_oms')
  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <Guia>
        <p>Muestra cómo crece cada grupo de niños frente a la curva de la OMS (puntaje z = 0). Sirve para ver en qué visita un grupo empieza a separarse de lo esperado.</p>
        <p>El puntaje z cuenta desviaciones estándar (DE) frente a la OMS. Entre −2 y +2 DE es lo esperado; por debajo de −2 DE el niño está bajo para la edad.</p>
      </Guia>
      <div className="grid shrink-0 gap-3 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm font-semibold"><span className="shrink-0">Indicador</span>
          <Selector className="min-w-0" value={indicador} onChange={(e) => setIndicador(e.target.value as IndicadorTrayectoria)}>
            {INDICADORES.map(([v, t]) => <option key={v} value={v}>{t}{v === 'peso_para_talla' ? ' (en prueba)' : ''}</option>)}
          </Selector>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold"><span className="shrink-0">Agrupar por</span>
          <Selector className="min-w-0" value={agrupar} onChange={(e) => setAgrupar(e.target.value as AgruparTrayectoria)}>
            {AGRUPACIONES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </Selector>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold"><span className="shrink-0">Edad en el eje</span>
          <Selector className="min-w-0" value={eje} onChange={(e) => setEje(e.target.value as EjeTrayectoria)}>
            {EJES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </Selector>
        </label>
      </div>
      <ResultadoVivo consulta={consulta} pendiente={(r) => r.motivo !== 'sin_riesgo' ? null : (
        <Vacio titulo="Sin riesgo calculado para este desenlace">
          <p>{r.mensaje}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="font-semibold">Ver agrupado por:</span>
            <Boton variante="secundario" chico onClick={() => setAgrupar('perfil')}>Perfil</Boton>
            <Boton variante="secundario" chico onClick={() => setAgrupar('sexo')}>Sexo</Boton>
          </div>
        </Vacio>
      )}>
        {(r) => {
          const grupos = r.grupos ?? []
          const base = `trayectorias-${indicador}-${agrupar}`
          const muestra = `${grupos.reduce((a, g) => a + g.ninos, 0)} niños`
          const filasOms = grupos.flatMap((g) => g.etapas.map((e) => ({
            grupo: g.grupo, visita: e.nombre, ninos: e.n, edad_media_meses: e.edad_media_meses, diferencia_oms_z: e.diferencia_oms,
            valor_medio: e.valor_medio, unidad: e.unidad,
          })))
          // «Niños individuales» solo existe si la respuesta los trae (solo los ve el equipo experto)
          const hayNinos = (r.individuales?.length ?? 0) > 0
          const pestanas = hayNinos ? PESTANAS : PESTANAS.filter((p) => p.clave !== 'ninos')
          const activa = ver === 'ninos' && !hayNinos ? 'media' : ver
          return (
            <>
              {r.fuente === 'validacion' && r.nota && <p className="shrink-0 text-sm text-salvia">{r.nota}</p>}
              {(r.etiqueta === 'En prueba' || indicador === 'peso_para_talla') && (
                <p className="flex shrink-0 items-center gap-2 text-sm"><EnPrueba /> El peso para la talla aún se está validando.</p>
              )}
              {grupos.length === 0 ? (
                <Aviso tono="teal">{r.mensaje ?? 'Ningún grupo tiene niños con este indicador.'}</Aviso>
              ) : (
                <>
                  <Pestanas prefijo="trayectorias" etiqueta="Qué ver" pestanas={pestanas} activa={activa} elegir={elegir} />
                  <PanelPestana prefijo="trayectorias" activa={activa} className={PANEL}>
                    {activa === 'media' && (
                      <Grafica titulo={dMedia.titulo} descripcion={dMedia.descripcion}
                        exportar={{ nombre: base, muestra, filas: filasOms.map((f) => ({ ...f })) }}>
                        <GraficaZ grupos={grupos} />
                      </Grafica>
                    )}
                    {activa === 'oms' && (
                      <TablaDatos llenar titulo={dOms.titulo} descripcion={dOms.descripcion} exportar={{ nombre: `${base}-oms`, muestra, filas: filasOms }}>
                        <Tabla densa className={ENCABEZADO_FIJO}>
                          <thead><tr><th>Grupo</th><th>Visita</th><th>Niños</th><th>Edad media (meses)</th><th>Diferencia con la OMS (z)</th><th>Valor medio</th></tr></thead>
                          <tbody>{grupos.flatMap((g) => g.etapas.map((e) => (
                            <tr key={`${g.grupo}-${e.etapa}`}>
                              <td>{g.grupo}</td><td>{e.nombre}</td><td>{num(e.n)}</td>
                              <td>{e.edad_media_meses == null ? '—' : dec2(e.edad_media_meses)}</td>
                              <td>{z(e.diferencia_oms)}</td><td>{valorUnidad(e.valor_medio, e.unidad)}</td>
                            </tr>
                          )))}</tbody>
                        </Tabla>
                      </TablaDatos>
                    )}
                    {activa === 'ninos' && <Individuales ninos={r.individuales} grupos={grupos} />}
                  </PanelPestana>
                </>
              )}
            </>
          )
        }}
      </ResultadoVivo>
    </div>
  )
}
