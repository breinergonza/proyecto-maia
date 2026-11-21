// Servidor de correo (Notificaciones): los datos SMTP guardados en la base. La clave va cifrada y nunca vuelve a la pantalla.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { pedir } from '../api/cliente'
import type { ServidorSalida } from '../api/tipos'
import { useConfirmar } from '../components/Confirmar'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Panel } from '../components/ui'
import { esCorreo } from '../lib/correos'

export default function NotifServidor() {
  const q = useQuery({ queryKey: ['notificaciones', 'servidor'], queryFn: () => pedir<ServidorSalida>('/notificaciones/servidor') })
  return (
    <>
      <Encabezado titulo="Configuración del correo saliente">
        Desde aquí se configura el servidor por donde salen los avisos. Lo que se guarda en esta pantalla es lo único que se
        usa; la clave se guarda cifrada y nunca se vuelve a mostrar.
      </Encabezado>
      {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          {/* key: al reestablecer, el formulario se monta de nuevo y su estado vuelve a los valores vacíos del GET */}
          <Formulario key={q.data.configurado ? 'cfg' : 'vacio'} s={q.data} />
          <Prueba activo={q.data.configurado} />
        </div>
      )}
    </>
  )
}

function Formulario({ s }: { s: ServidorSalida }) {
  const cliente = useQueryClient()
  const [host, setHost] = useState(s.host)
  const [puerto, setPuerto] = useState(String(s.puerto))
  const [usuario, setUsuario] = useState(s.usuario ?? '')
  const [remitente, setRemitente] = useState(s.remitente)
  const [tls, setTls] = useState(s.tls)
  const [cambiarClave, setCambiarClave] = useState(!s.clave_guardada)
  const [clave, setClave] = useState('')
  const p = Number(puerto)
  const errores = {
    host: host.trim() && !/\s/.test(host.trim()) ? undefined : 'Escriba el servidor, por ejemplo smtp.miorganizacion.org.',
    puerto: Number.isInteger(p) && p >= 1 && p <= 65535 ? undefined : 'Un número de 1 a 65535.',
    remitente: esCorreo(remitente) ? undefined : 'Escriba un correo válido.',
    clave: usuario.trim() && cambiarClave && !clave ? 'Escriba la clave del usuario.' : undefined,
  }
  const hayError = Object.values(errores).some(Boolean)
  const guardar = useMutation({
    mutationFn: () => pedir<ServidorSalida>('/notificaciones/servidor', {
      metodo: 'PUT',
      cuerpo: { host: host.trim(), puerto: p, usuario: usuario.trim() || null, remitente: remitente.trim(), tls,
        ...(cambiarClave ? { clave } : {}) },
    }),
    onSuccess: () => {
      setClave('')
      setCambiarClave(false)
      void cliente.invalidateQueries({ queryKey: ['notificaciones', 'servidor'] })
    },
  })
  const { confirmar, dialogo } = useConfirmar()
  const reestablecer = useMutation({
    mutationFn: () => pedir('/notificaciones/servidor', { metodo: 'DELETE' }),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ['notificaciones', 'servidor'] }),
  })
  async function pedirReestablecer() {
    const ok = await confirmar({
      titulo: 'Reestablecer el servidor de correo',
      mensaje: `Se borrarán el servidor «${s.host}», el usuario y la clave guardada.`,
      efecto: 'Mientras no se configure de nuevo, no saldrá ningún correo de alertas.',
      reversible: false, textoConfirmar: 'Reestablecer', tono: 'peligro',
    })
    if (ok) reestablecer.mutate()
  }
  return (
    <Panel titulo={<div className="flex items-center gap-2"><h2 className="text-base">Datos del servidor de correo (SMTP)</h2>
      {s.configurado ? <Insignia tono="teal">Configurado</Insignia> : <Insignia tono="ocre">Sin configurar</Insignia>}</div>}>
      <form className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
        <Campo id="smtp-host" etiqueta="Servidor (host)" error={errores.host}>
          <Entrada id="smtp-host" value={host} placeholder="smtp.miorganizacion.org" aria-invalid={!!errores.host}
            onChange={(e) => setHost(e.target.value)} />
        </Campo>
        <Campo id="smtp-puerto" etiqueta="Puerto" error={errores.puerto} ayuda="Suele ser 587 con TLS, 25 sin TLS y 1025 en Mailpit.">
          <Entrada id="smtp-puerto" type="number" min={1} max={65535} step={1} value={puerto} aria-invalid={!!errores.puerto}
            onChange={(e) => setPuerto(e.target.value)} />
        </Campo>
        <Campo id="smtp-remitente" etiqueta="Correo remitente" error={errores.remitente} ayuda="Desde qué dirección salen los avisos.">
          <Entrada id="smtp-remitente" type="email" value={remitente} placeholder="alertas@miorganizacion.org"
            aria-invalid={!!errores.remitente} onChange={(e) => setRemitente(e.target.value)} />
        </Campo>
        <Campo id="smtp-usuario" etiqueta="Usuario" ayuda="Déjelo vacío si el servidor no pide usuario.">
          <Entrada id="smtp-usuario" value={usuario} autoComplete="off" onChange={(e) => setUsuario(e.target.value)} />
        </Campo>
        {s.clave_guardada && !cambiarClave ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-tinta/90">Clave</span>
            <div className="flex items-center gap-2">
              <Insignia tono="teal">Clave guardada</Insignia>
              <Boton chico type="button" variante="secundario" onClick={() => setCambiarClave(true)}>Cambiar</Boton>
            </div>
          </div>
        ) : (
          <Campo id="smtp-clave" etiqueta="Clave" error={errores.clave}
            ayuda="Se guarda cifrada. Déjela vacía si el servidor no la pide.">
            <Entrada id="smtp-clave" type="password" autoComplete="new-password" value={clave} aria-invalid={!!errores.clave}
              onChange={(e) => setClave(e.target.value)} />
          </Campo>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4 accent-teal" checked={tls} onChange={(e) => setTls(e.target.checked)} />
          Usar TLS (STARTTLS)
        </label>
        {!s.puede_guardar_clave && cambiarClave && clave && (
          <div className="sm:col-span-2">
            <Aviso>Falta MAIA_CIFRADO_CLAVE en el servidor: sin ella no se puede guardar la clave.</Aviso>
          </div>
        )}
        {(guardar.error || reestablecer.error) && <div className="sm:col-span-2"><Aviso>{(guardar.error ?? reestablecer.error)?.message}</Aviso></div>}
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          {guardar.isSuccess && <span className="text-sm text-teal" role="status">Guardado.</span>}
          {s.configurado && (
            <Boton chico type="button" variante="atencion" disabled={reestablecer.isPending} onClick={() => void pedirReestablecer()}>
              Reestablecer
            </Boton>
          )}
          <Boton chico type="submit" disabled={guardar.isPending || hayError}>Guardar configuración de correo</Boton>
        </div>
      </form>
      {dialogo}
    </Panel>
  )
}

/** Máscara del correo de prueba: minúscula, sin espacios y, si se pegan varios (separados por coma, punto y coma o línea), solo el primero. */
const normalizarCorreo = (x: string) => x.toLowerCase().split(/[,;\n]/)[0].replace(/\s+/g, '')

function Prueba({ activo }: { activo: boolean }) {
  const [correo, setCorreo] = useState('')
  const invalido = correo !== '' && !esCorreo(correo)
  const m = useMutation({ mutationFn: () => pedir('/notificaciones/servidor/prueba', { cuerpo: { destinatario: correo } }) })
  return (
    <Panel titulo="Probar el correo">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (activo && esCorreo(correo)) m.mutate() }}>
        <Campo id="prueba" etiqueta="Enviar un correo de prueba a"
          error={invalido ? 'Escriba un correo válido, por ejemplo nombre@dominio.org.' : undefined}
          ayuda={activo ? undefined : 'Guarde primero los datos del servidor.'}>
          <div className="flex gap-2">
            <Entrada id="prueba" type="email" value={correo} placeholder="nombre@dominio.org" aria-invalid={invalido}
              onChange={(e) => setCorreo(normalizarCorreo(e.target.value))} />
            <Boton type="submit" variante="secundario" className="shrink-0" disabled={!activo || !esCorreo(correo) || m.isPending}>Enviar correo de prueba</Boton>
          </div>
        </Campo>
        {m.error && <Aviso>{m.error.message}</Aviso>}
        {m.isSuccess && <Aviso tono="teal">Enviado. Si no llega en unos minutos, revise los datos del servidor.</Aviso>}
      </form>
    </Panel>
  )
}
