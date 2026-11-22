// Comparar entrenamientos: pone A (referencia) frente a B (candidato) con la diferencia, su intervalo por réplicas bootstrap
// y los niños detrás de cada cifra; el administrador puede aprobar B (el mismo endpoint de Administración › Entrenamientos,
// que deja la ejecución y la auditoría) o mantener A. Comparar dos grupos de niños no se hace aquí (S8: un grupo no es un
// entrenamiento): vive en Comparar grupos (/comparar) y esta pantalla solo lo señala. Los dos entrenamientos y su aprobación
// quedan fijos arriba; debajo, una pestaña por pregunta (?ver=): las medidas de A y B con su diferencia, la curva ROC y los
// niños y grupos con que se evaluó cada uno.
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useEntrenamientosAnalitica, useSubmodulo } from '../../api/analitica'
import { anomaliasVigente, useAprobarB, useComparaEntrenamientos, useEntrenamientosRegistrados, type MedidaComparada } from '../../api/comparar'
import type { DatosRendimiento } from '../../api/tipos'
import { puede, useSesion } from '../../auth/sesion'
import { CurvaXY } from '../../components/graficos/xy'
import { useConfirmar } from '../../components/Confirmar'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Termino } from '../../components/Termino'
import { Aviso, Boton, Selector, Tabla } from '../../components/ui'
import { PanelPestana, Pestanas, usePestanaEnUrl } from '../../components/ui/Pestanas'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, fecha, num, pct } from '../../lib/formato'
import type { IdTermino } from '../../lib/glosario'
import { SIN_CIFRA } from '../../lib/lenguaje'
import { difTexto } from './ComparaGrupos'
import { Guia, Resultado } from './comun'
import { useContextoAnalitica } from './contexto'

const PESTANAS = [
  { clave: 'medidas', texto: 'Métricas de validación' },
  { clave: 'roc', texto: 'Curva ROC' },
  { clave: 'ninos', texto: 'Niños y grupos' },
] as const
const CLAVES = PESTANAS.map((p) => p.clave)
/** El contenido de una pestaña ocupa el alto que queda: las tarjetas con lista (`llenar`) se encogen y la desplazan por dentro. */
const PANEL = 'flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:-mx-1 lg:overflow-y-auto lg:px-1 lg:pb-1'
/** Encabezado de columna fijo mientras la tabla se desplaza dentro de su tarjeta. */
const ENCABEZADO_FIJO = 'xl:overflow-visible [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-papel [&_th]:whitespace-normal!'

interface Medida { id: string; texto: string; termino?: IdTermino; valor: (d: DatosRendimiento) => number | null; formato: (v: number) => string; unidad: 'pp' | 'abs' }

const fila = (d: DatosRendimiento, top: number) => d.metricas_por_top.find((t) => t.top_pct === top)

export default function Comparar() {
  return <ComparaEntrenamientos />
}

const unidadTexto = (m: MedidaComparada, v: number) => difTexto(v, m.unidad)

/** Alto de una gráfica según la ventana: más baja en pantallas bajas para que la pestaña quepa sin desplazarse. */
const altoSegunVentana = (fraccion: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, window.innerHeight * fraccion)))
function useAltoSegunVentana(fraccion: number, min: number, max: number) {
  const [alto, setAlto] = useState(() => altoSegunVentana(fraccion, min, max))
  useEffect(() => {
    const alCambiar = () => setAlto(altoSegunVentana(fraccion, min, max))
    window.addEventListener('resize', alCambiar)
    return () => window.removeEventListener('resize', alCambiar)
  }, [fraccion, min, max])
  return alto
}

function ComparaEntrenamientos() {
  const { desenlace, entrenamiento } = useContextoAnalitica()
  const { usuario } = useSesion()
  const lista = useEntrenamientosAnalitica()
  const todos = lista.data?.entrenamientos ?? []
  const [elegidoA, setA] = useState<number | null>(null)
  const [elegidoB, setB] = useState<number | null>(null)
  const [mantiene, setMantiene] = useState(false)
  const [ver, elegir] = usePestanaEnUrl('ver', CLAVES)
  const altoRoc = useAltoSegunVentana(0.38, 220, 340)
  const b = elegidoB ?? entrenamiento ?? todos[0]?.entrenamiento ?? null
  const a = elegidoA ?? todos.find((m) => m.entrenamiento !== b)?.entrenamiento ?? b
  const ra = useSubmodulo<DatosRendimiento>(a, 'rendimiento', desenlace)
  const rb = useSubmodulo<DatosRendimiento>(b, 'rendimiento', desenlace)
  const cmp = useComparaEntrenamientos(a, b, desenlace)
  const dMet = descripcionDe('comparar_metricas'), dRoc = descripcionDe('comparar_roc'), dGrp = descripcionDe('comparar_grupo'), dMu = descripcionDe('comparar_muestra')

  const esAdmin = puede(usuario, ['admin', 'datos'])   // aprueba: administración y el experto en datos
  const metaB = rb.data?.meta ?? lista.data?.entrenamientos.find((m) => m.entrenamiento === b)
  const fuenteB = metaB?.fuente === 'simulado' ? 'simulado' : 'kmc'
  const registrados = useEntrenamientosRegistrados(fuenteB, esAdmin)
  const clinicoB = metaB?.version_registro != null ? String(metaB.version_registro) : null
  const anomalias = anomaliasVigente(registrados.data)
  const aprobacion = useAprobarB()
  const puedeAprobar = esAdmin && a !== b && clinicoB != null && anomalias != null && !aprobacion.isPending
  const { confirmar, dialogo } = useConfirmar()
  const aprobar = async () => {
    if (!clinicoB || !anomalias) return
    const ok = await confirmar({
      titulo: 'Aprobar el entrenamiento B',
      mensaje: `Se aprueba el entrenamiento B (n.º ${b}, alertas clínicas v${clinicoB}) junto con la versión de anomalías v${anomalias} que hoy está en producción. Queda registrado en la auditoría.`,
      efecto: 'Cambia el modelo oficial de la solución para todos los usuarios: lo usarán el tablero, los recálculos de riesgo y la estimación individual.',
      reversible: true, textoConfirmar: 'Aprobar y activar el modelo B',
    })
    if (ok) aprobacion.mutate({ fuente: fuenteB, anomalias, clinico: clinicoB })
  }
  const porQueNo = !esAdmin ? '' : registrados.isError ? 'No se pudo consultar el registro de modelos.'
    : clinicoB == null ? 'Este entrenamiento no tiene una versión registrada.' : anomalias == null ? 'No hay una versión de anomalías para aprobar con B.' : ''

  const medidas: Medida[] = [
    { id: 'auc', texto: 'Qué tan bien ordena a los niños', termino: 'auc', valor: (d) => d.auc_desenlace.auc, formato: dec2, unidad: 'abs' },
    { id: 'pr', texto: 'Alertas acertadas en promedio', termino: 'pr_auc', valor: (d) => d.pr_auc ?? null, formato: dec2, unidad: 'abs' },
    ...[10, 20].flatMap((t): Medida[] => [
      { id: `det${t}`, texto: `Casos detectados si se alerta al ${t} %`, termino: 'sensibilidad', valor: (d) => fila(d, t)?.casos_detectados_pct ?? null, formato: pct, unidad: 'pp' },
      { id: `ac${t}`, texto: `Alertas acertadas si se alerta al ${t} %`, termino: 'vpp', valor: (d) => fila(d, t)?.alertas_acertadas_pct ?? null, formato: pct, unidad: 'pp' },
    ]),
    { id: 'mil', texto: 'Alertas por 1.000 niños si se alerta al 10 %', valor: (d) => fila(d, 10)?.alertas_por_1000 ?? null, formato: num, unidad: 'abs' },
  ]
  const datoA = desenlace ? ra.data?.desenlaces?.[desenlace] : undefined
  const datoB = desenlace ? rb.data?.desenlaces?.[desenlace] : undefined
  const intervalos = new Map((cmp.data?.estado === 'ok' ? cmp.data.metricas ?? [] : []).map((m) => [m.id, m]))

  const diferencia = (m: Medida, A: DatosRendimiento, B: DatosRendimiento) => {
    const va = m.valor(A), vb = m.valor(B)
    if (va == null || vb == null) return SIN_CIFRA
    const d = vb - va
    return `${d > 0 ? '+' : d < 0 ? '−' : ''}${m.unidad === 'pp' ? `${Math.abs(d).toLocaleString('es-CO', { maximumFractionDigits: 1 })} puntos` : m.formato(Math.abs(d))}`
  }
  const certeza = (id: string) => {
    const i = intervalos.get(id)
    if (!i || i.ic_bajo == null || i.ic_alto == null) return <span className="text-salvia">Sin intervalo</span>
    return (
      <>
        <strong className="whitespace-nowrap">{i.clara ? 'Diferencia clara *' : 'No es clara'}</strong>
        <span className="block text-xs text-salvia lg:ml-2 lg:inline lg:whitespace-nowrap">IC 95 %: {unidadTexto(i, i.ic_bajo)} a {unidadTexto(i, i.ic_alto)}</span>
      </>
    )
  }

  const selector = (etiqueta: string, valor: number | null, cambiar: (v: number) => void) => (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">{etiqueta}</span>
      <Selector value={valor ?? ''} onChange={(e) => { cambiar(Number(e.target.value)); setMantiene(false); aprobacion.reset() }}>
        {todos.map((m) => <option key={m.entrenamiento} value={m.entrenamiento}>N.º {m.entrenamiento}{m.creada ? ` · ${fecha(m.creada)}` : ''}</option>)}
      </Selector>
    </label>
  )

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <Guia>
        <p>Elija dos entrenamientos. A es el de referencia y B el que se quiere comparar. La última columna dice si la diferencia de B frente a A es clara.</p>
        <p>Como no se guardan predicciones por niño, el intervalo es aproximado: se repite el cálculo de cada entrenamiento por separado, {cmp.data?.replicas ?? 500} veces. Un asterisco (*) marca una diferencia clara.</p>
      </Guia>
      {/* los dos entrenamientos y, para administración, su aprobación: en una fila y a la vista en todas las pestañas */}
      <div className="flex shrink-0 flex-wrap items-end gap-x-3 gap-y-2">
        <div className="w-full sm:w-88">{selector('Entrenamiento A (referencia)', a, setA)}</div>
        <div className="w-full sm:w-88">{selector('Entrenamiento B', b, setB)}</div>
        {esAdmin && (
          <div className="flex min-w-0 flex-1 basis-80 flex-wrap items-center gap-2">
            {dialogo}
            <Boton onClick={() => void aprobar()} disabled={!puedeAprobar} title={porQueNo || undefined}>Aprobar y activar el modelo B</Boton>
            <Boton variante="secundario" onClick={() => setMantiene(true)} disabled={aprobacion.isPending}>Mantener el entrenamiento de referencia</Boton>
            <span className="min-w-0 flex-1 basis-60 text-sm text-salvia">
              {porQueNo || 'Al activar el modelo B, se convierte en el modelo oficial y el cambio queda registrado en la auditoría.'}
            </span>
          </div>
        )}
      </div>
      {a === b && <Aviso tono="teal">Elija dos entrenamientos distintos para compararlos.</Aviso>}
      {esAdmin && aprobacion.isSuccess && <p role="status" className="shrink-0 text-sm font-semibold text-teal">Aprobación en cola (ejecución n.º {aprobacion.data.id}). Siga el avance en Administración › Entrenamientos.</p>}
      {esAdmin && aprobacion.isError && <p role="alert" className="shrink-0 text-sm text-coral-hondo">{aprobacion.error.message}</p>}
      {esAdmin && mantiene && !aprobacion.isSuccess && <p role="status" className="shrink-0 text-sm">Se mantiene A. No se cambió nada.</p>}
      {/* las pestañas están siempre; a su lado, la frase que separa los entrenamientos de los grupos de niños (S8) */}
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-4 border-b border-linea">
        <Pestanas className="border-b-0" prefijo="comparar" etiqueta="Qué ver" pestanas={PESTANAS} activa={ver} elegir={elegir} />
        <p className="pb-2 text-sm">
          Aquí se comparan entrenamientos. Para comparar dos grupos de niños, use{' '}
          <Link to="/comparar" className="font-semibold text-teal underline-offset-2 hover:underline">Comparar grupos de niños</Link>.
        </p>
      </div>
      <PanelPestana prefijo="comparar" activa={ver} className={PANEL}>
      <Resultado consulta={rb}>
        {() => (
          <Resultado consulta={ra}>
            {() => {
              if (!datoA || !datoB || datoA.estado === 'insuficiente' || datoB.estado === 'insuficiente') {
                return <p className="text-salvia">No hay datos suficientes de este desenlace en alguno de los dos entrenamientos.</p>
              }
              const c = cmp.data?.estado === 'ok' ? cmp.data : undefined
              return (
                <>
                    {ver === 'medidas' && (
                      <TablaDatos llenar titulo={dMet.titulo} descripcion={dMet.descripcion}
                        exportar={{ nombre: 'comparar-metricas', muestra: c ? `A: ${num(c.a?.n)} niños, ${num(c.a?.casos)} casos · B: ${num(c.b?.n)} niños, ${num(c.b?.casos)} casos` : undefined,
                          filas: medidas.map((m) => ({ medida: m.texto, A: m.valor(datoA), B: m.valor(datoB), diferencia: intervalos.get(m.id)?.diferencia ?? null, ic_bajo: intervalos.get(m.id)?.ic_bajo ?? null, ic_alto: intervalos.get(m.id)?.ic_alto ?? null, clara: intervalos.get(m.id)?.clara ? 'sí' : 'no' })) }}>
                        <Tabla densa apilar className={ENCABEZADO_FIJO}>
                          <thead><tr><th>Medida</th><th>A (entrenamiento {a})</th><th>B (entrenamiento {b})</th><th>Diferencia de B frente a A</th><th>Certeza</th></tr></thead>
                          <tbody>
                            {medidas.map((m) => (
                              <tr key={m.id}>
                                <td className="lg:whitespace-nowrap">{m.termino ? <Termino id={m.termino}>{m.texto}</Termino> : m.texto}</td>
                                <td>{m.valor(datoA) != null ? m.formato(m.valor(datoA) as number) : SIN_CIFRA}</td>
                                <td>{m.valor(datoB) != null ? m.formato(m.valor(datoB) as number) : SIN_CIFRA}</td>
                                <td>{diferencia(m, datoA, datoB)}</td>
                                <td>{certeza(m.id)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Tabla>
                        {c?.aviso && <p className="mt-2 text-xs text-salvia">{c.aviso}</p>}
                      </TablaDatos>
                    )}
                    {ver === 'roc' && (
                      <Grafica titulo={dRoc.titulo} descripcion={dRoc.descripcion}
                        exportar={{ nombre: 'comparar-roc', filas: [...datoA.roc.puntos.map(([x, y]) => ({ entrenamiento: 'A', falsas_alarmas: x, casos_detectados: y })), ...datoB.roc.puntos.map(([x, y]) => ({ entrenamiento: 'B', falsas_alarmas: x, casos_detectados: y }))] }}>
                        <CurvaXY etiqueta="Casos detectados frente a falsas alertas en A y en B" ejeX="Proporción de falsas alertas" ejeY="Proporción de casos detectados" diagonal alto={altoRoc}
                          formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                          series={[
                            { clave: 'a', nombre: `A (entrenamiento ${a})`, color: 0, puntos: datoA.roc.puntos, sinPuntos: true },
                            { clave: 'b', nombre: `B (entrenamiento ${b})`, color: 2, puntos: datoB.roc.puntos, sinPuntos: true },
                          ]} />
                      </Grafica>
                    )}
                    {ver === 'ninos' && (
                      <>
                        {c?.a && c.b && (
                          <TablaDatos titulo={dMu.titulo} descripcion={dMu.descripcion}
                            exportar={{ nombre: 'comparar-muestra', filas: [c.a, c.b].map((x, i) => ({ entrenamiento: i ? 'B' : 'A', numero: x.entrenamiento, ninos: x.n, casos: x.casos, corte: x.corte ?? null, datos: x.fuente ?? null, version: x.version_registro ?? null })) }}>
                            <Tabla densa apilar>
                              <thead><tr><th>Entrenamiento</th><th>Niños evaluados</th><th>Casos</th><th>Corte de datos</th><th>Datos</th><th>Versión del modelo</th></tr></thead>
                              <tbody>
                                {[{ nombre: 'A', l: c.a }, { nombre: 'B', l: c.b }].map(({ nombre, l }) => (
                                  <tr key={nombre}><td>{nombre} (n.º {l.entrenamiento})</td><td>{num(l.n)}</td><td>{l.casos == null ? SIN_CIFRA : num(l.casos)}</td><td>{l.corte ?? '—'}</td><td>{l.fuente ?? '—'}</td><td>{l.version_registro ?? '—'}</td></tr>
                                ))}
                              </tbody>
                            </Tabla>
                          </TablaDatos>
                        )}
                        {c && (c.por_grupo ?? []).length > 0 && (
                          <TablaDatos llenar titulo={dGrp.titulo} descripcion={dGrp.descripcion}
                            exportar={{ nombre: 'comparar-por-grupo', filas: (c.por_grupo ?? []).map((g) => ({ variable: g.variable, grupo: g.grupo, auc_a: g.a, auc_b: g.b, diferencia: g.diferencia, ic_bajo: g.ic_bajo, ic_alto: g.ic_alto, n_a: g.n_a, n_b: g.n_b })) }}>
                            <Tabla densa apilar className={ENCABEZADO_FIJO}>
                              <thead><tr><th>Grupo</th><th>Niños en A</th><th>Niños en B</th><th>AUC en A</th><th>AUC en B</th><th>Diferencia de B frente a A</th></tr></thead>
                              <tbody>
                                {(c.por_grupo ?? []).map((g) => (
                                  <tr key={`${g.variable}-${g.grupo}`}>
                                    <td>{g.variable}: {g.grupo}</td><td>{num(g.n_a)}</td><td>{num(g.n_b)}</td>
                                    <td>{g.a != null ? dec2(g.a) : SIN_CIFRA}</td><td>{g.b != null ? dec2(g.b) : SIN_CIFRA}</td>
                                    <td>{g.diferencia == null ? SIN_CIFRA : <>{difTexto(g.diferencia, 'abs')}{g.clara ? ' *' : ''}
                                      {g.ic_bajo != null && g.ic_alto != null && <span className="block text-xs text-salvia lg:ml-2 lg:inline lg:whitespace-nowrap">IC 95 %: {difTexto(g.ic_bajo, 'abs')} a {difTexto(g.ic_alto, 'abs')}</span>}</>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Tabla>
                          </TablaDatos>
                        )}
                        {!c && <p className="text-salvia">Todavía no se calcula la comparación de los niños y grupos de cada entrenamiento.</p>}
                      </>
                    )}
                </>
              )
            }}
          </Resultado>
        )}
      </Resultado>
      </PanelPestana>
    </div>
  )
}
