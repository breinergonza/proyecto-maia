import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { pedir } from '../api/cliente'
import type { ConfigNotificacionSalida, Notificacion, Pagina } from '../api/tipos'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Paginador, Panel, Tabla, Texto, Vacio } from '../components/ui'
import { fechaHora, posicion } from '../lib/formato'

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function AdminNotificaciones() {
  const configs = useQuery({ queryKey: ['notificaciones', 'config'], queryFn: () => pedir<ConfigNotificacionSalida[]>('/notificaciones/config') })
  return (
    <>
      <Encabezado titulo="Notificaciones">
        Después de cada corrida que no es en silencio, se envía un correo por desenlace activo con los niños cuya posición de
        riesgo es igual o mayor que la mínima. El correo lleva solo el código del niño, el desenlace, la posición y un
        enlace; nunca valores clínicos. A cada destinatario se le avisa una sola vez por niño y corrida.
      </Encabezado>
      {configs.isPending ? <Cargando /> : configs.error ? <Aviso>{configs.error.message}</Aviso> : configs.data.length === 0 ? (
        <Vacio titulo="No hay desenlaces para configurar">Se crean al activar un paquete de modelos.</Vacio>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">{configs.data.map((c) => <Config key={c.desenlace} c={c} />)}</div>
      )}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[22rem_1fr]">
        <Prueba />
        <Historial />
      </div>
    </>
  )
}

function Config({ c }: { c: ConfigNotificacionSalida }) {
  const cliente = useQueryClient()
  const [minimo, setMinimo] = useState(String(c.percentil_minimo))
  const [correos, setCorreos] = useState(c.destinatarios.join('\n'))
  const [activo, setActivo] = useState(c.activo)
  const lista = correos.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)
  const malos = lista.filter((x) => !CORREO.test(x))
  const n = Number(minimo)
  const errorMinimo = Number.isNaN(n) || n < 0 || n > 100 ? 'Un número de 0 a 100.' : undefined
  const guardar = useMutation({
    mutationFn: () => pedir<ConfigNotificacionSalida>(`/notificaciones/config/${encodeURIComponent(c.desenlace)}`, {
      metodo: 'PUT', cuerpo: { desenlace: c.desenlace, nombre: c.nombre, percentil_minimo: n, destinatarios: lista, activo },
    }),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ['notificaciones', 'config'] }),
  })
  const id = `cfg-${c.desenlace}`
  return (
    <Panel titulo={<div className="flex min-w-0 items-center gap-2"><h2 className="text-base">{c.nombre ?? c.desenlace}</h2>{c.activo ? <Insignia tono="teal">Activa</Insignia> : <Insignia>Apagada</Insignia>}</div>}
      accion={
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-teal" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Enviar avisos
        </label>
      }>
      <form className="grid items-start gap-3 sm:grid-cols-[9rem_1fr]" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
        <Campo id={`${id}-min`} etiqueta="Posición mínima" error={errorMinimo} ayuda="95: el 5 % con más riesgo.">
          <Entrada id={`${id}-min`} type="number" min={0} max={100} step={1} value={minimo}
            aria-invalid={!!errorMinimo} onChange={(e) => setMinimo(e.target.value)} />
        </Campo>
        <Campo id={`${id}-dest`} etiqueta="Destinatarios" ayuda="Un correo por línea."
          error={malos.length ? `No son correos válidos: ${malos.join(', ')}` : undefined}>
          <Texto id={`${id}-dest`} rows={2} value={correos} aria-invalid={malos.length > 0} onChange={(e) => setCorreos(e.target.value)} />
        </Campo>
        {guardar.error && <div className="sm:col-span-2"><Aviso>{guardar.error.message}</Aviso></div>}
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          {activo && !lista.length && <span className="text-sm text-salvia">Para activar, agregue al menos un destinatario.</span>}
          {guardar.isSuccess && <span className="text-sm text-teal" role="status">Guardado.</span>}
          <Boton chico type="submit" disabled={guardar.isPending || !!errorMinimo || malos.length > 0 || (activo && !lista.length)}>Guardar</Boton>
        </div>
      </form>
    </Panel>
  )
}

function Prueba() {
  const [correo, setCorreo] = useState('')
  const m = useMutation({ mutationFn: () => pedir('/notificaciones/prueba', { cuerpo: { destinatario: correo.trim() } }) })
  return (
    <Panel titulo="Probar el correo">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
        <Campo id="prueba" etiqueta="Enviar un correo de prueba a">
          <div className="flex gap-2">
            <Entrada id="prueba" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
            <Boton type="submit" variante="secundario" className="shrink-0" disabled={!CORREO.test(correo.trim()) || m.isPending}>Enviar</Boton>
          </div>
        </Campo>
        {m.error && <Aviso>{m.error.message}</Aviso>}
        {m.isSuccess && <Aviso tono="teal">Enviado. Si no llega en unos minutos, revise la configuración SMTP.</Aviso>}
      </form>
    </Panel>
  )
}

function Historial() {
  const [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ['notificaciones', 'historial', pagina],
    queryFn: () => pedir<Pagina<Notificacion>>('/notificaciones/historial', { params: { pagina, tamano: 20 } }),
  })
  return (
    <Panel titulo="Avisos enviados">
      {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : q.data.items.length === 0 ? (
        <p className="text-salvia">Todavía no se ha enviado ningún aviso.</p>
      ) : (
        <>
          <Tabla>
            <thead><tr><th>Fecha</th><th>Destinatario</th><th>Niño</th><th>Desenlace</th><th className="text-right">Posición</th><th>Estado</th></tr></thead>
            <tbody>{q.data.items.map((n) => (
              <tr key={n.id}>
                <td className="whitespace-nowrap">{fechaHora(n.enviado_en)}</td>
                <td>{n.destinatario}</td>
                <td>{n.sujeto}</td>
                <td>{n.desenlace}</td>
                <td className="text-right">{posicion(n.percentil)}</td>
                <td>{n.estado === 'enviado' ? <Insignia tono="teal">Enviado</Insignia> : <Insignia tono="coral">Error</Insignia>}{n.error && <p className="text-xs text-coral-hondo">{n.error}</p>}</td>
              </tr>
            ))}</tbody>
          </Tabla>
          <Paginador pagina={pagina} tamano={20} total={q.data.total} cambiar={setPagina} />
        </>
      )}
    </Panel>
  )
}
