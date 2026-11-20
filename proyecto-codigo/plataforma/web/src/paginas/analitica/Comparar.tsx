// Comparar entrenamientos: pone A (referencia) frente a B (candidato) con la diferencia, su intervalo por réplicas bootstrap
// y los niños detrás de cada cifra; el administrador puede aprobar B (el mismo endpoint de Administración › Entrenamientos,
// que deja la ejecución y la auditoría) o mantener A. Comparar dos grupos de niños no se hace aquí (S8: un grupo no es un
// entrenamiento): vive en Comparar grupos (/comparar) y esta pantalla solo lo señala.
import { useState } from 'react'
import { Link } from 'react-router'
import { useEntrenamientosAnalitica, useSubmodulo } from '../../api/analitica'
import { anomaliasVigente, useAprobarB, useComparaEntrenamientos, useEntrenamientosRegistrados, type MedidaComparada } from '../../api/comparar'
import type { DatosRendimiento } from '../../api/tipos'
import { puede, useSesion } from '../../auth/sesion'
import { CurvaXY } from '../../components/graficos/xy'
import { useConfirmar } from '../../components/Confirmar'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Aviso, Boton, Selector, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, fecha, num, pct } from '../../lib/formato'
import { jerga, N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { difTexto } from './ComparaGrupos'
import { Guia, Resultado, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

interface Medida { id: string; texto: string; valor: (d: DatosRendimiento) => number | null; formato: (v: number) => string; unidad: 'pp' | 'abs' }

const fila = (d: DatosRendimiento, top: number) => d.metricas_por_top.find((t) => t.top_pct === top)

export default function Comparar() {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        Aquí se comparan entrenamientos. Para comparar dos grupos de niños, use{' '}
        <Link to="/comparar" className="font-semibold text-teal underline-offset-2 hover:underline">Comparar grupos</Link>.
      </p>
      <ComparaEntrenamientos />
    </div>
  )
}

const unidadTexto = (m: MedidaComparada, v: number) => difTexto(v, m.unidad)

function ComparaEntrenamientos() {
  const { desenlace, entrenamiento } = useContextoAnalitica()
  const { usuario } = useSesion()
  const { tecnico } = useTecnico()
  const lista = useEntrenamientosAnalitica()
  const todos = lista.data?.entrenamientos ?? []
  const [elegidoA, setA] = useState<number | null>(null)
  const [elegidoB, setB] = useState<number | null>(null)
  const [mantiene, setMantiene] = useState(false)
  const b = elegidoB ?? entrenamiento ?? todos[0]?.entrenamiento ?? null
  const a = elegidoA ?? todos.find((m) => m.entrenamiento !== b)?.entrenamiento ?? b
  const ra = useSubmodulo<DatosRendimiento>(a, 'rendimiento', desenlace)
  const rb = useSubmodulo<DatosRendimiento>(b, 'rendimiento', desenlace)
  const cmp = useComparaEntrenamientos(a, b, desenlace)
  const dMet = descripcionDe('comparar_metricas'), dRoc = descripcionDe('comparar_roc'), dGrp = descripcionDe('comparar_grupo'), dMu = descripcionDe('comparar_muestra')

  const esAdmin = puede(usuario, ['admin'])
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
      efecto: 'Cambia el modelo oficial de la solución para todos los usuarios: lo usarán el tablero, las corridas y el cálculo de un niño.',
      reversible: true, textoConfirmar: 'Aprobar B',
    })
    if (ok) aprobacion.mutate({ fuente: fuenteB, anomalias, clinico: clinicoB })
  }
  const porQueNo = !esAdmin ? '' : registrados.isError ? 'No se pudo consultar el registro de modelos.'
    : clinicoB == null ? 'Este entrenamiento no tiene una versión registrada.' : anomalias == null ? 'No hay una versión de anomalías para aprobar con B.' : ''

  const medidas: Medida[] = [
    { id: 'auc', texto: jerga(tecnico, 'Qué tan bien ordena a los niños', 'AUC'), valor: (d) => d.auc_desenlace.auc, formato: dec2, unidad: 'abs' },
    { id: 'pr', texto: jerga(tecnico, 'Alertas acertadas en promedio', 'Precisión promedio (PR-AUC)'), valor: (d) => d.pr_auc ?? null, formato: dec2, unidad: 'abs' },
    ...[10, 20].flatMap((t): Medida[] => [
      { id: `det${t}`, texto: `${jerga(tecnico, 'Casos detectados', 'Sensibilidad')} si se alerta al ${t} %`, valor: (d) => fila(d, t)?.casos_detectados_pct ?? null, formato: pct, unidad: 'pp' },
      { id: `ac${t}`, texto: `${jerga(tecnico, 'Alertas acertadas', 'VPP')} si se alerta al ${t} %`, valor: (d) => fila(d, t)?.alertas_acertadas_pct ?? null, formato: pct, unidad: 'pp' },
    ]),
    { id: 'mil', texto: 'Alertas por 1.000 niños si se alerta al 10 %', valor: (d) => fila(d, 10)?.alertas_por_1000 ?? null, formato: num, unidad: 'abs' },
  ]
  const datoA = desenlace ? ra.data?.desenlaces?.[desenlace] : undefined
  const datoB = desenlace ? rb.data?.desenlaces?.[desenlace] : undefined
  const intervalos = new Map((cmp.data?.estado === 'ok' ? cmp.data.metricas ?? [] : []).map((m) => [m.id, m]))

  const diferencia = (m: Medida, A: DatosRendimiento, B: DatosRendimiento) => {
    const va = m.valor(A), vb = m.valor(B)
    if (va == null || vb == null) return N_MENOR_QUE_5
    const d = vb - va
    return `${d > 0 ? '+' : d < 0 ? '−' : ''}${m.unidad === 'pp' ? `${Math.abs(d).toLocaleString('es-CO', { maximumFractionDigits: 1 })} puntos` : m.formato(Math.abs(d))}`
  }
  const certeza = (id: string) => {
    const i = intervalos.get(id)
    if (!i || i.ic_bajo == null || i.ic_alto == null) return <span className="text-salvia">Sin intervalo</span>
    return (
      <>
        <strong>{i.clara ? 'Diferencia clara *' : 'No es clara'}</strong>
        <span className="block text-xs text-salvia">IC 95 %: {unidadTexto(i, i.ic_bajo)} a {unidadTexto(i, i.ic_alto)}</span>
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
    <div className="space-y-4">
      <Guia>
        <p>Elija dos entrenamientos. A es el de referencia y B el que se quiere comparar. La última columna dice si la diferencia de B frente a A es clara.</p>
        <p>Como no se guardan predicciones por niño, el intervalo es aproximado: se repite el cálculo de cada entrenamiento por separado, {cmp.data?.replicas ?? 500} veces. Un asterisco (*) marca una diferencia clara.</p>
      </Guia>
      <div className="grid items-end gap-3 sm:grid-cols-3">
        {selector('Entrenamiento A (referencia)', a, setA)}
        {selector('Entrenamiento B', b, setB)}
      </div>
      {a === b && <Aviso tono="teal">Elija dos entrenamientos distintos para compararlos.</Aviso>}
      {esAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-panel border border-linea p-3">
          {dialogo}
          <Boton onClick={() => void aprobar()} disabled={!puedeAprobar} title={porQueNo || undefined}>Aprobar B</Boton>
          <Boton variante="secundario" onClick={() => setMantiene(true)} disabled={aprobacion.isPending}>Mantener A</Boton>
          <span className="text-sm text-salvia">
            {porQueNo || 'Aprobar B lo deja en la solución; queda en la auditoría y en las ejecuciones.'}
          </span>
          {aprobacion.isSuccess && <p role="status" className="w-full text-sm font-semibold text-teal">Aprobación en cola (ejecución n.º {aprobacion.data.id}). Siga el avance en Administración › Entrenamientos.</p>}
          {aprobacion.isError && <p role="alert" className="w-full text-sm text-coral-hondo">{aprobacion.error.message}</p>}
          {mantiene && !aprobacion.isSuccess && <p role="status" className="w-full text-sm">Se mantiene A. No se cambió nada.</p>}
        </div>
      )}
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
                  <TablaDatos titulo={dMet.titulo} descripcion={dMet.descripcion}
                    exportar={{ nombre: 'comparar-metricas', muestra: c ? `A: ${num(c.a?.n)} niños, ${num(c.a?.casos)} casos · B: ${num(c.b?.n)} niños, ${num(c.b?.casos)} casos` : undefined,
                      filas: medidas.map((m) => ({ medida: m.texto, A: m.valor(datoA), B: m.valor(datoB), diferencia: intervalos.get(m.id)?.diferencia ?? null, ic_bajo: intervalos.get(m.id)?.ic_bajo ?? null, ic_alto: intervalos.get(m.id)?.ic_alto ?? null, clara: intervalos.get(m.id)?.clara ? 'sí' : 'no' })) }}>
                    <Tabla densa apilar>
                      <thead><tr><th>Medida</th><th>A (entrenamiento {a})</th><th>B (entrenamiento {b})</th><th>Diferencia de B frente a A</th><th>Certeza</th></tr></thead>
                      <tbody>
                        {medidas.map((m) => (
                          <tr key={m.id}>
                            <td>{m.texto}</td>
                            <td>{m.valor(datoA) != null ? m.formato(m.valor(datoA) as number) : N_MENOR_QUE_5}</td>
                            <td>{m.valor(datoB) != null ? m.formato(m.valor(datoB) as number) : N_MENOR_QUE_5}</td>
                            <td>{diferencia(m, datoA, datoB)}</td>
                            <td>{certeza(m.id)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Tabla>
                    {c?.aviso && <p className="mt-2 text-xs text-salvia">{c.aviso}</p>}
                  </TablaDatos>
                  <Grafica titulo={dRoc.titulo} descripcion={dRoc.descripcion}
                    exportar={{ nombre: 'comparar-roc', filas: [...datoA.roc.puntos.map(([x, y]) => ({ entrenamiento: 'A', falsas_alarmas: x, casos_detectados: y })), ...datoB.roc.puntos.map(([x, y]) => ({ entrenamiento: 'B', falsas_alarmas: x, casos_detectados: y }))] }}>
                    <CurvaXY etiqueta="Aciertos frente a falsas alarmas en A y en B" ejeX="Falsas alarmas" ejeY="Casos detectados" diagonal
                      formatoX={(v) => `${Math.round(v * 100)} %`} formatoY={(v) => `${Math.round(v * 100)} %`}
                      series={[
                        { clave: 'a', nombre: `A (entrenamiento ${a})`, color: 0, puntos: datoA.roc.puntos, sinPuntos: true },
                        { clave: 'b', nombre: `B (entrenamiento ${b})`, color: 2, puntos: datoB.roc.puntos, sinPuntos: true },
                      ]} />
                  </Grafica>
                  {c && (c.por_grupo ?? []).length > 0 && (
                    <TablaDatos titulo={dGrp.titulo} descripcion={dGrp.descripcion}
                      exportar={{ nombre: 'comparar-por-grupo', filas: (c.por_grupo ?? []).map((g) => ({ variable: g.variable, grupo: g.grupo, auc_a: g.a, auc_b: g.b, diferencia: g.diferencia, ic_bajo: g.ic_bajo, ic_alto: g.ic_alto, n_a: g.n_a, n_b: g.n_b })) }}>
                      <Tabla densa apilar>
                        <thead><tr><th>Grupo</th><th>Niños en A</th><th>Niños en B</th><th>AUC en A</th><th>AUC en B</th><th>Diferencia de B frente a A</th></tr></thead>
                        <tbody>
                          {(c.por_grupo ?? []).map((g) => (
                            <tr key={`${g.variable}-${g.grupo}`}>
                              <td>{g.variable}: {g.grupo}</td><td>{num(g.n_a)}</td><td>{num(g.n_b)}</td>
                              <td>{g.a != null ? dec2(g.a) : N_MENOR_QUE_5}</td><td>{g.b != null ? dec2(g.b) : N_MENOR_QUE_5}</td>
                              <td>{g.diferencia == null ? N_MENOR_QUE_5 : <>{difTexto(g.diferencia, 'abs')}{g.clara ? ' *' : ''}
                                {g.ic_bajo != null && g.ic_alto != null && <span className="block text-xs text-salvia">IC 95 %: {difTexto(g.ic_bajo, 'abs')} a {difTexto(g.ic_alto, 'abs')}</span>}</>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Tabla>
                    </TablaDatos>
                  )}
                  {c?.a && c.b && (
                    <TablaDatos titulo={dMu.titulo} descripcion={dMu.descripcion}
                      exportar={{ nombre: 'comparar-muestra', filas: [c.a, c.b].map((x, i) => ({ entrenamiento: i ? 'B' : 'A', numero: x.entrenamiento, ninos: x.n, casos: x.casos, corte: x.corte ?? null, datos: x.fuente ?? null, version: x.version_registro ?? null })) }}>
                      <Tabla densa apilar>
                        <thead><tr><th>Entrenamiento</th><th>Niños evaluados</th><th>Casos</th><th>Corte de datos</th><th>Datos</th><th>Versión del modelo</th></tr></thead>
                        <tbody>
                          {[{ nombre: 'A', l: c.a }, { nombre: 'B', l: c.b }].map(({ nombre, l }) => (
                            <tr key={nombre}><td>{nombre} (n.º {l.entrenamiento})</td><td>{num(l.n)}</td><td>{l.casos == null ? N_MENOR_QUE_5 : num(l.casos)}</td><td>{l.corte ?? '—'}</td><td>{l.fuente ?? '—'}</td><td>{l.version_registro ?? '—'}</td></tr>
                          ))}
                        </tbody>
                      </Tabla>
                    </TablaDatos>
                  )}
                </>
              )
            }}
          </Resultado>
        )}
      </Resultado>
    </div>
  )
}
