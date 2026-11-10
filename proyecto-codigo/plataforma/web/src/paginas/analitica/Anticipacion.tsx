// Anticipación: con cuánta ventaja avisa el modelo (D12, D19, D20, D50). Un mismo desenlace se predice desde varias visitas:
// cuántos casos se detectan y cuántas alertas aciertan según la visita de cálculo, a cuántos casos se avisó al menos una
// visita antes, en qué visita entró cada caso por primera vez al grupo de más riesgo y, para quien puede verlos, el riesgo
// de tres niños visita por visita.
import { useState } from 'react'
import { Link } from 'react-router'
import { useSubmodulo } from '../../api/analitica'
import { useRiesgoPorVisita } from '../../api/anticipacion'
import type { DatosAnticipacion, NinoRiesgoVisita } from '../../api/tipos'
import { puede, useSesion } from '../../auth/sesion'
import { BarrasApiladas, LineasSeries, MiniSerie, Muestra, type PuntoSerie } from '../../components/graficos'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Aviso, Cargando, Cifra, Selector, Tabla, Vacio } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num, pct, RIESGO_ALTO } from '../../lib/formato'
import { cuantosMenos, familia, N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { EnPrueba, Guia, pctN, Resultado } from './comun'
import { useContextoAnalitica } from './contexto'

const TOPS_PRECIO = [5, 10, 20, 40]

export default function Anticipacion() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  // sin pedir un desenlace: llegan todas las familias; esta pantalla elige la suya (el contexto trae los desenlaces de un
  // modelo, no las familias de anticipación)
  const consulta = useSubmodulo<DatosAnticipacion>(entrenamiento, 'anticipacion')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Muestra qué tan temprano avisa el modelo: el mismo desenlace se calcula desde cada visita y se compara.</p>
        <p>Una alerta es entrar al grupo de niños con más riesgo en esa visita. Avisar antes da más ventaja al equipo, pero suele detectar menos casos.</p>
      </Guia>
      <Resultado consulta={consulta}>
        {(r) => <Familias entrenamiento={r.entrenamiento} desenlaces={r.desenlaces ?? {}} preferida={desenlace} />}
      </Resultado>
    </div>
  )
}

function Familias({ entrenamiento, desenlaces, preferida }: { entrenamiento: number; desenlaces: Record<string, DatosAnticipacion>; preferida: string | null }) {
  const claves = Object.keys(desenlaces)
  const [elegida, setElegida] = useState<string | null>(null)
  if (claves.length === 0) return <Vacio titulo="Sin visitas de cálculo">Este entrenamiento no calculó ningún desenlace desde varias visitas.</Vacio>
  const clave = (elegida && claves.includes(elegida) ? elegida : null)
    ?? claves.find((c) => c === preferida || (preferida != null && c === familia(preferida))) ?? claves[0]
  const nombre = (c: string) => desenlaces[c].nombre ?? c
  return (
    <>
      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        Desenlace
        <Selector value={clave} onChange={(e) => setElegida(e.target.value)} className="max-w-full sm:w-96">
          {claves.map((c) => <option key={c} value={c}>{nombre(c)}</option>)}
        </Selector>
      </label>
      <Detalle key={clave} clave={clave} entrenamiento={entrenamiento} a={desenlaces[clave]} />
    </>
  )
}

function Detalle({ clave, entrenamiento, a }: { clave: string; entrenamiento: number; a: DatosAnticipacion }) {
  const { usuario } = useSesion()
  const m = a.metricas_por_visita
  const tops = m?.tops ?? (a.top_pct ? [a.top_pct] : [10])
  const [top, setTop] = useState<number>(a.top_pct && tops.includes(a.top_pct) ? a.top_pct : tops[0])
  const nombre = a.nombre ?? clave
  const av = a.avisados_antes
  const dAv = descripcionDe('anticipacion_avisados'), dVen = descripcionDe('anticipacion_ventaja'), dPre = descripcionDe('anticipacion_precio')
  const dTem = descripcionDe('anticipacion'), dTab = descripcionDe('anticipacion_tabla')

  // una fila por visita de partida con los números del porcentaje de alerta elegido
  const filas = (m?.visitas ?? []).map((v) => {
    const t = v.por_top.find((x) => x.top_pct === top)
    return { desde: v.desde, ventaja: v.ventaja_visitas, casos: v.casos, auc: v.auc as number | null,
      alertas: t?.alertas ?? null, detectados: t?.casos_detectados_pct ?? null, acertadas: t?.alertas_acertadas_pct ?? null }
  })
  const base = filas.length ? filas : (a.visitas ?? []).map((v) => ({ desde: v.desde, ventaja: v.ventaja_visitas, casos: v.casos, auc: null as number | null,
    alertas: v.alertas as number | null, detectados: v.casos_detectados_pct, acertadas: v.alertas_acertadas_pct }))
  const muestra = `Se alerta al ${top} % de mayor riesgo`
  const pa = a.primera_alerta

  return (
    <>
      {a.etiqueta === 'En prueba' && <p className="flex items-center gap-2 text-sm"><EnPrueba /> {nombre}: este desenlace aún se está validando.</p>}
      {clave.startsWith('desarrollo') && (
        <Aviso tono="teal">Desarrollo bajo es relativo: es el 10 % más bajo de los niños de entrenamiento. Mide «peor que sus pares», no un retraso clínico.</Aviso>
      )}
      {av && (
        <Grafica titulo={dAv.titulo} descripcion={dAv.descripcion}
          exportar={{ nombre: 'anticipacion-avisados', muestra: a.top_pct ? `Se alerta al ${a.top_pct} % de mayor riesgo` : undefined,
            filas: [{ desenlace: nombre, casos: av.casos, avisados: av.avisados, avisados_antes_pct: av.pct, meta: av.meta }] }}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Cifra valor={av.pct == null ? N_MENOR_QUE_5 : pct(av.pct)} texto="Casos avisados al menos una visita antes" />
            <Cifra valor={av.casos == null ? N_MENOR_QUE_5 : num(av.casos)} texto="Casos del desenlace" />
            <Cifra valor={av.avisados == null ? N_MENOR_QUE_5 : num(av.avisados)} texto="Casos que recibieron aviso antes" />
          </div>
          <p className="mt-2 text-sm text-salvia">Meta: {av.meta}.</p>
        </Grafica>
      )}

      {pa && pa.distribucion.length > 0 && (
        <Grafica titulo={dVen.titulo} descripcion={dVen.descripcion}
          exportar={{ nombre: 'anticipacion-ventaja', muestra: `Se alerta al ${pa.top_pct} % de mayor riesgo`,
            filas: [...pa.distribucion.map((f) => ({ primera_alerta_en: f.desde, visitas_de_ventaja: f.ventaja_visitas, casos: f.casos, casos_pct: f.pct })),
              { primera_alerta_en: 'sin aviso previo', visitas_de_ventaja: null, casos: pa.sin_alerta.casos, casos_pct: pa.sin_alerta.pct }] }}>
          <BarrasApiladas etiqueta="Porcentaje de casos según la visita en que entraron por primera vez al grupo de más riesgo" alto={200}
            series={[{ clave: 'pct', nombre: 'Porcentaje de los casos', color: 0 }]}
            filas={[...pa.distribucion.map((f) => ({ x: `${f.desde} (${f.ventaja_visitas} ${f.ventaja_visitas === 1 ? 'visita' : 'visitas'})`, pct: f.pct ?? 0 })),
              { x: 'Sin aviso previo', pct: pa.sin_alerta.pct ?? 0 }]} />
          <p className="mt-2 text-sm">
            {pa.ventaja_visitas.mediana != null
              ? `Ventaja mediana: ${dec2(pa.ventaja_visitas.mediana)} visitas (media ${dec2(pa.ventaja_visitas.media)}), entre los casos que recibieron aviso.`
              : `Las visitas de ventaja se resumen con 20 o más casos con aviso; ${pctN(pa.sin_alerta.pct)} de los casos no recibió aviso antes.`}
            {' '}Las partes con menos de 5 casos se omiten ({N_MENOR_QUE_5}).
          </p>
        </Grafica>
      )}

      {base.length === 0 ? <Aviso tono="teal">Este desenlace no tiene visitas de cálculo para comparar.</Aviso> : (
        <>
          {tops.length > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              Alertar a los niños con más riesgo
              <Selector value={top} onChange={(e) => setTop(Number(e.target.value))} className="w-28">
                {tops.map((t) => <option key={t} value={t}>{t} %</option>)}
              </Selector>
            </label>
          )}
          <Grafica titulo={dTem.titulo} descripcion={dTem.descripcion}
            exportar={{ nombre: 'anticipacion-visitas', muestra,
              filas: base.map((v) => ({ calculado_en: v.desde, visitas_de_ventaja: v.ventaja, casos: v.casos, alertas: v.alertas,
                casos_detectados_pct: v.detectados, alertas_acertadas_pct: v.acertadas })) }}>
            <LineasSeries etiqueta="Casos detectados y alertas acertadas según la visita en que se calcula el riesgo" alto={240}
              dominioY={[0, 100]} formatoY={(v) => `${Math.round(v)} %`}
              series={[{ clave: 'det', nombre: 'Casos detectados', color: 0 }, { clave: 'ac', nombre: 'Alertas acertadas', color: 1 }]}
              filas={base.map((v) => ({ x: v.desde, det: v.detectados, ac: v.acertadas }))} />
            <p className="mt-2 text-sm">Avisar antes detecta menos casos y da más ventaja.</p>
          </Grafica>

          {m && m.visitas.length > 0 && (
            <Grafica titulo={dPre.titulo} descripcion={dPre.descripcion}
              exportar={{ nombre: 'anticipacion-precio',
                filas: m.visitas.flatMap((v) => v.por_top.map((t) => ({ calculado_en: v.desde, visitas_de_ventaja: v.ventaja_visitas, alertar_al_pct: t.top_pct,
                  casos_detectados_pct: t.casos_detectados_pct, alertas_acertadas_pct: t.alertas_acertadas_pct }))) }}>
              <LineasSeries etiqueta="Casos detectados según la visita de cálculo, para distintos porcentajes de alerta" alto={240}
                dominioY={[0, 100]} formatoY={(v) => `${Math.round(v)} %`}
                series={TOPS_PRECIO.filter((t) => tops.includes(t)).map((t, i) => ({ clave: `t${t}`, nombre: `Alerta al ${t} %`, color: i as 0 | 1 | 2 | 3 }))}
                filas={m.visitas.map((v) => ({ x: v.desde, ...Object.fromEntries(TOPS_PRECIO.map((t) => [`t${t}`, v.por_top.find((x) => x.top_pct === t)?.casos_detectados_pct ?? null])) }))} />
              <p className="mt-2 text-sm">Alertar a más niños detecta más casos, pero gasta más alertas; avisar antes cuesta casos detectados.</p>
            </Grafica>
          )}

          <TablaDatos titulo={dTab.titulo} descripcion={dTab.descripcion}
            exportar={{ nombre: 'anticipacion-tabla', muestra,
              filas: base.map((v) => ({ visita: v.desde, ventaja_visitas: v.ventaja, casos: v.casos, alertas: v.alertas, auc: v.auc,
                casos_detectados_pct: v.detectados, alertas_acertadas_pct: v.acertadas })) }}>
            <Tabla densa>
              <thead><tr><th>Se calcula en</th><th>Ventaja (visitas)</th><th>Casos</th><th>Alertas</th><th>AUC</th><th>Casos detectados</th><th>Alertas acertadas</th></tr></thead>
              <tbody>{base.map((v) => (
                <tr key={v.desde}><td>{v.desde}</td><td>{num(v.ventaja)}</td><td>{v.casos == null ? N_MENOR_QUE_5 : num(v.casos)}</td>
                  <td>{num(v.alertas)}</td><td>{v.auc == null ? '—' : dec2(v.auc)}</td><td>{pctN(v.detectados)}</td><td>{pctN(v.acertadas)}</td></tr>
              ))}</tbody>
            </Tabla>
          </TablaDatos>
        </>
      )}

      {puede(usuario, ['admin', 'experto']) && <NinosDeEjemplo desenlace={clave} entrenamiento={entrenamiento} />}
    </>
  )
}

/** Tres niños de la corrida con más riesgo en este desenlace, visita por visita; solo experto y administrador. */
function NinosDeEjemplo({ desenlace, entrenamiento }: { desenlace: string; entrenamiento: number }) {
  const d = descripcionDe('anticipacion_ninos')
  const q = useRiesgoPorVisita({ desenlace, n: 3 })
  if (q.isPending) return <Grafica titulo={d.titulo} descripcion={d.descripcion}><Cargando /></Grafica>
  if (q.isError) {
    return <Grafica titulo={d.titulo} descripcion={d.descripcion}>
      <Aviso tono="teal">Todavía no hay una corrida con un modelo activo para mostrar niños de ejemplo.</Aviso>
    </Grafica>
  }
  const ninos = q.data.ninos.filter((n): n is NinoRiesgoVisita & { puntos: NonNullable<NinoRiesgoVisita['puntos']> } => !!n.puntos?.length)
  const nombres = new Map<number, string>()
  ninos.forEach((n) => n.puntos.forEach((p) => nombres.set(p.orden, p.momento_nombre)))
  const ordenes = [...nombres.keys()].sort((a, b) => a - b)
  const dominioX: [number, number] = ordenes.length > 1 ? [ordenes[0], ordenes[ordenes.length - 1]] : [(ordenes[0] ?? 0) - 0.5, (ordenes[0] ?? 0) + 0.5]
  return (
    <Grafica titulo={d.titulo} descripcion={d.descripcion} exportar={{ nombre: `anticipacion-ninos-${entrenamiento}` }}
      accion={<span className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <Muestra tipo="alerta">10 % con más riesgo</Muestra>
        <Muestra tipo="estrella">primera alerta</Muestra>
      </span>}>
      {ninos.length === 0 ? <p className="text-sm">La corrida no tiene niños con riesgo calculado para este desenlace.</p> : (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-3">
          {ninos.map((n) => (
            <li key={n.sujeto}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm"><Link to={`/ninos/${encodeURIComponent(n.sujeto)}`} className="font-semibold text-teal underline">{n.sujeto}</Link></h3>
                <span className="shrink-0 text-xs text-salvia">
                  {n.primera_alerta ? `Primera alerta: ${n.primera_alerta.momento_nombre}` : 'Sin alerta en ninguna visita'}
                </span>
              </div>
              <MiniSerie alto={120}
                etiqueta={`${n.sujeto}: ${n.puntos.map((p) => `${p.momento_nombre}, más riesgo que ${cuantosMenos(p.percentil)} de cada 10`).join('; ')}`}
                puntos={n.puntos.map((p): PuntoSerie => ({
                  x: p.orden, y: p.percentil, marcado: p.percentil >= RIESGO_ALTO, estrella: p.orden === n.primera_alerta?.orden,
                  titulo: `${p.momento_nombre}: ${p.desenlace}`,
                  detalle: [`Más riesgo que ${cuantosMenos(p.percentil)} de cada 10 niños`] }))}
                dominioY={[0, 100]} ticksY={[0, 50, RIESGO_ALTO]} formatoY={(v) => String(Math.round(v))}
                franjas={[{ desde: RIESGO_ALTO, hasta: 100, tono: 'alerta' }]}
                dominioX={dominioX} ticksX={ordenes} formatoX={(v) => nombres.get(v) ?? ''} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-salvia">Son los niños con más riesgo de la última corrida, que solo ven el experto y el administrador.</p>
    </Grafica>
  )
}
