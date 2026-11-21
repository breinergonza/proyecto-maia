// Alertas por correo (Notificaciones): cada notificación junta una o varias alertas y tiene sus propios correos.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { pedir } from '../api/cliente'
import type { AvisoEnviado, NotificacionConfig, OpcionAlertaApi, Pagina, ResultadoEnvio } from '../api/tipos'
import { CampoCorreos } from '../components/CampoCorreos'
import { useConfirmar } from '../components/Confirmar'
import { SelectorAlertas } from '../components/SelectorAlertas'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Paginador, Panel, Tabla, Vacio } from '../components/ui'
import { fechaHora, num, RIESGO_ALTO } from '../lib/formato'
import { ayudaMinimo, definicionAlto, RIESGO_MUY_ALTO } from '../lib/lenguaje'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export default function NotifAlertas() {
  const cliente = useQueryClient()
  const lista = useQuery({ queryKey: ['notificaciones', 'alertas'], queryFn: () => pedir<NotificacionConfig[]>('/notificaciones/alertas') })
  const catalogo = useQuery({ queryKey: ['notificaciones', 'desenlaces'], queryFn: () => pedir<OpcionAlertaApi[]>('/notificaciones/alertas/desenlaces') })
  const [editando, setEditando] = useState<NotificacionConfig | 'nueva' | null>(null)
  const [resultado, setResultado] = useState<{ tono: 'coral' | 'teal'; texto: string }>()
  const { confirmar, dialogo } = useConfirmar()
  const nombres = new Map((catalogo.data ?? []).map((o) => [o.clave, o.nombre]))

  const enviar = useMutation({
    mutationFn: (id: number) => pedir<ResultadoEnvio>(`/notificaciones/alertas/${id}/enviar`, { metodo: 'POST' }),
    onSuccess: (r) => {
      setResultado(r.errores
        ? { tono: 'coral', texto: `Se enviaron ${plural(r.correos, 'correo', 'correos')}; ${plural(r.errores, 'falló', 'fallaron')}. Vea el historial.` }
        : r.correos === 0
          ? { tono: 'teal', texto: 'No hay niños con riesgo alto para esta notificación en la última actualización.' }
          : { tono: 'teal', texto: `Se enviaron ${plural(r.correos, 'correo', 'correos')} con ${plural(r.ninos, 'niño', 'niños')}.` })
      void cliente.invalidateQueries({ queryKey: ['notificaciones', 'historial'] })
    },
    onError: (e) => setResultado({ tono: 'coral', texto: e.message }),
  })
  async function pedirEnvio(n: NotificacionConfig) {
    setResultado(undefined)
    const ok = await confirmar({
      titulo: 'Enviar ahora',
      mensaje: `Se enviará el resumen y el Excel de «${n.nombre}» a ${plural(n.destinatarios.length, 'correo', 'correos')}, con todos los niños de riesgo alto de la última actualización.`,
      efecto: 'Cada correo recibe el aviso, aunque ya se le hubiera avisado de esos niños.',
      textoConfirmar: 'Enviar',
    })
    if (ok) enviar.mutate(n.id)
  }

  return (
    <>
      <Encabezado titulo="Reglas y envíos de alertas por correo"
        accion={<Boton type="button" onClick={() => { setResultado(undefined); setEditando('nueva') }}>Crear regla de envío</Boton>}>
        Cada notificación junta una o varias alertas y tiene sus propios correos: así cada grupo de especialistas recibe solo lo
        que le corresponde. Cree todas las que necesite, con las combinaciones que quiera. Se envían al terminar cada
        actualización de resultados (solo con los niños nuevos para cada correo), con un resumen y un Excel adjunto con el
        listado de niños en riesgo alto. Los correos llevan solo el código del niño; nunca valores clínicos.
      </Encabezado>
      {resultado && <div className="mb-4"><Aviso tono={resultado.tono}>{resultado.texto}</Aviso></div>}
      {editando && (
        <div className="mb-4">
          <Formulario key={editando === 'nueva' ? 'nueva' : editando.id} inicial={editando === 'nueva' ? null : editando}
            opciones={catalogo.data ?? []} alCerrar={() => setEditando(null)} />
        </div>
      )}
      {lista.isPending ? <Cargando /> : lista.error ? <Aviso>{lista.error.message}</Aviso> : lista.data.length === 0 ? (
        <Vacio titulo="Todavía no hay notificaciones">Cree la primera para avisar a un grupo de especialistas.</Vacio>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {lista.data.map((n) => (
            <Panel key={n.id}
              titulo={<div className="flex min-w-0 items-center gap-2"><h2 className="text-base">{n.nombre}</h2>
                {n.activo ? <Insignia tono="teal">Activa</Insignia> : <Insignia>Apagada</Insignia>}</div>}
              accion={<div className="flex gap-2">
                <Boton chico variante="secundario" type="button" disabled={!n.destinatarios.length || enviar.isPending}
                  onClick={() => void pedirEnvio(n)}>Enviar ahora</Boton>
                <Boton chico variante="secundario" type="button" onClick={() => { setResultado(undefined); setEditando(n) }}>Editar</Boton>
              </div>}>
              <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Alertas clínicas incluidas">
                {n.alertas.map((c) => <li key={c}><Insignia tono="teal">{nombres.get(c) ?? c}</Insignia></li>)}
              </ul>
              <p className="text-sm text-salvia">
                <span title={n.destinatarios.join(', ')}>{plural(n.destinatarios.length, 'correo', 'correos')}</span>
                {' · '}{ayudaMinimo(n.percentil_minimo)}
              </p>
            </Panel>
          ))}
        </div>
      )}
      <div className="mt-4"><Historial /></div>
      {dialogo}
    </>
  )
}

function Formulario({ inicial, opciones, alCerrar }: { inicial: NotificacionConfig | null; opciones: OpcionAlertaApi[]; alCerrar: () => void }) {
  const cliente = useQueryClient()
  const { confirmar, dialogo } = useConfirmar()
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [alertas, setAlertas] = useState<string[]>(inicial?.alertas ?? [])
  const [correos, setCorreos] = useState<string[]>(inicial?.destinatarios ?? [])
  const [minimo, setMinimo] = useState(String(inicial?.percentil_minimo ?? 95))
  const [activo, setActivo] = useState(inicial?.activo ?? false)
  const n = Number(minimo)
  const errores = {
    nombre: nombre.trim() ? undefined : 'Escriba un nombre, por ejemplo «Neonatología».',
    alertas: alertas.length ? undefined : 'Elija al menos una alerta.',
    minimo: Number.isNaN(n) || n < 0 || n > 100 ? 'Un número de 0 a 100.' : undefined,
    correos: activo && !correos.length ? 'Para activar, agregue al menos un correo.' : undefined,
  }
  const hayError = Object.values(errores).some(Boolean)
  const refrescar = () => void cliente.invalidateQueries({ queryKey: ['notificaciones'] })
  const guardar = useMutation({
    mutationFn: () => pedir<NotificacionConfig>(inicial ? `/notificaciones/alertas/${inicial.id}` : '/notificaciones/alertas', {
      metodo: inicial ? 'PUT' : 'POST',
      cuerpo: { nombre: nombre.trim(), percentil_minimo: n, destinatarios: correos, alertas, activo },
    }),
    onSuccess: () => { refrescar(); alCerrar() },
  })
  const borrar = useMutation({
    mutationFn: () => pedir(`/notificaciones/alertas/${inicial?.id}`, { metodo: 'DELETE' }),
    onSuccess: () => { refrescar(); alCerrar() },
  })
  async function pedirBorrado() {
    const ok = await confirmar({
      titulo: 'Eliminar la notificación', mensaje: `Se eliminará «${inicial?.nombre}».`, efecto: 'Deja de enviar avisos; el historial se conserva.',
      reversible: false, textoConfirmar: 'Eliminar', tono: 'peligro',
    })
    if (ok) borrar.mutate()
  }
  return (
    <Panel titulo={inicial ? `Editar «${inicial.nombre}»` : 'Crear regla de envío'}>
      <form className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
        <div className="space-y-4">
          <Campo id="notif-nombre" etiqueta="Nombre" error={errores.nombre} ayuda="Cómo se llama el grupo, por ejemplo «Neonatología».">
            <Entrada id="notif-nombre" value={nombre} aria-invalid={!!errores.nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo id="notif-min" etiqueta="Riesgo mínimo" error={errores.minimo} ayuda={errores.minimo ? undefined : ayudaMinimo(n)}>
            <Entrada id="notif-min" type="number" min={0} max={100} step={1} value={minimo} aria-invalid={!!errores.minimo}
              onChange={(e) => setMinimo(e.target.value)} />
          </Campo>
          <CampoCorreos id="notif-correos" etiqueta="Correos que reciben el aviso" value={correos} onChange={setCorreos} />
          {errores.correos && <Aviso>{errores.correos}</Aviso>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-teal" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Enviar avisos
          </label>
        </div>
        <SelectorAlertas id="notif-alertas" etiqueta="Alertas clínicas que activan el correo" opciones={opciones}
          value={alertas} onChange={setAlertas} error={errores.alertas} />
        {(guardar.error || borrar.error) && <div className="lg:col-span-2"><Aviso>{(guardar.error ?? borrar.error)?.message}</Aviso></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
          <div>{inicial && <Boton chico type="button" variante="atencion" disabled={borrar.isPending} onClick={() => void pedirBorrado()}>Eliminar</Boton>}</div>
          <div className="flex items-center gap-2">
            <Boton chico type="button" variante="secundario" onClick={alCerrar}>Cancelar</Boton>
            <Boton chico type="submit" disabled={guardar.isPending || hayError}>Guardar</Boton>
          </div>
        </div>
      </form>
      {dialogo}
    </Panel>
  )
}

/** «3 muy alto · 2 alto»: cuántos niños del aviso hay en cada nivel, con las palabras del resto de la web. */
function resumenRiesgo(r: AvisoEnviado['riesgo']): string {
  const partes = [[r.muy_alto, 'muy alto'], [r.alto, 'alto'], [r.otros, 'por debajo de alto']] as const
  return partes.filter(([n]) => n > 0).map(([n, nivel]) => `${num(n)} ${nivel}`).join(' · ') || '—'
}
const AYUDA_RIESGO_AVISO = `${definicionAlto(RIESGO_ALTO, RIESGO_MUY_ALTO)}. De cada niño cuenta su riesgo más alto en este aviso.`

/** El estado de un registro: si llegó a todos sus correos, a algunos o a ninguno. */
function EstadoAviso({ a }: { a: AvisoEnviado }) {
  if (a.estado === 'enviado') return <Insignia tono="teal">Enviado</Insignia>
  const fallaron = a.destinatarios.filter((d) => d.estado === 'error').length
  return a.estado === 'error' ? (
    <><Insignia tono="coral">Error</Insignia><p className="mt-0.5 text-xs text-coral-hondo">No se envió a ningún correo</p></>
  ) : (
    <><Insignia tono="ocre">Con errores</Insignia><p className="mt-0.5 text-xs">Falló {fallaron} de {plural(a.destinatarios.length, 'correo', 'correos')}</p></>
  )
}

/** «Historial de correos enviados»: un registro por notificación y actualización de resultados, con todos sus destinatarios, cuántos niños
 *  fueron, su nivel de riesgo y si llegó. El detalle niño por niño va en el Excel de cada correo, no en esta tabla. */
function Historial() {
  const [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ['notificaciones', 'historial', pagina],
    queryFn: () => pedir<Pagina<AvisoEnviado>>('/notificaciones/historial', { params: { pagina, tamano: 20 } }),
  })
  return (
    <Panel titulo="Historial de correos enviados">
      {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : q.data.items.length === 0 ? (
        <p className="text-salvia">Todavía no se ha enviado ningún aviso.</p>
      ) : (
        <>
          <Tabla apilar>
            <thead><tr><th>Fecha</th><th>Notificación</th><th>Destinatarios</th><th>Niños</th><th>Riesgo</th><th>Estado</th></tr></thead>
            <tbody>{q.data.items.map((a) => (
              <tr key={`${a.notificacion_id ?? 'eliminada'}-${a.corrida_id}`} className="align-top">
                <td className="whitespace-nowrap">{fechaHora(a.enviado_en)}</td>
                <td className="font-semibold">{a.notificacion ?? <span className="font-normal text-salvia">Notificación eliminada</span>}</td>
                <td>
                  <ul aria-label="Destinatarios" className="space-y-0.5">
                    {a.destinatarios.map((d) => (
                      <li key={d.correo} className={d.estado === 'error' ? 'text-coral-hondo' : undefined}>
                        <span className="break-all">{d.correo}</span>
                        {d.estado === 'error' && <span className="block text-xs">No se envió{d.error ? `: ${d.error}` : ''}</span>}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="tabular-nums">
                  <span className="font-semibold">{num(a.ninos)}</span>
                  {/* con una sola alerta el total ya lo dice todo; con varias, cuántos niños por cada una */}
                  {a.alertas.length > 1 && (
                    <ul aria-label="Niños por alerta" className="mt-0.5 space-y-0.5 text-xs">
                      {a.alertas.map((x) => <li key={x.desenlace}>{num(x.ninos)} · {x.desenlace}</li>)}
                    </ul>
                  )}
                </td>
                <td title={AYUDA_RIESGO_AVISO}>{resumenRiesgo(a.riesgo)}</td>
                <td><EstadoAviso a={a} /></td>
              </tr>
            ))}</tbody>
          </Tabla>
          <Paginador pagina={pagina} tamano={20} total={q.data.total} cambiar={setPagina} />
        </>
      )}
    </Panel>
  )
}
