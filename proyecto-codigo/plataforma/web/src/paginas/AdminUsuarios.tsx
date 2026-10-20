import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { pedir } from '../api/cliente'
import type { Rol, Usuario, UsuarioCambio } from '../api/tipos'
import { useSesion } from '../auth/sesion'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Panel, Selector, Tabla } from '../components/ui'
import { fechaHora, ROLES } from '../lib/formato'

const nuevo = z.object({
  nombre: z.string().trim().min(2, 'Escriba el nombre.'),
  email: z.string().trim().email('Ese correo no es válido.'),
  rol: z.enum(['admin', 'experto', 'visualizador']),
  clave: z.string().min(10, 'Mínimo 10 caracteres.'),
})
type Nuevo = z.infer<typeof nuevo>

export default function AdminUsuarios() {
  const cliente = useQueryClient()
  const lista = useQuery({ queryKey: ['usuarios'], queryFn: () => pedir<Usuario[]>('/usuarios') })
  const f = useForm<Nuevo>({ resolver: zodResolver(nuevo), defaultValues: { rol: 'experto' } })
  const crear = useMutation({
    mutationFn: (d: Nuevo) => pedir<Usuario>('/usuarios', { cuerpo: d }),
    onSuccess: () => {
      f.reset({ nombre: '', email: '', rol: 'experto', clave: '' })
      void cliente.invalidateQueries({ queryKey: ['usuarios'] })
    },
  })
  const e = f.formState.errors

  return (
    <>
      <Encabezado titulo="Usuarios">
        Administración crea usuarios y cambia todo; un experto clínico responde las revisiones y calcula niños; consulta solo
        ve el tablero y la lista de niños.
      </Encabezado>
      <div className="grid gap-6 2xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          {lista.isPending ? <Cargando /> : lista.error ? <Aviso>{lista.error.message}</Aviso> : (
            <div className="rounded-panel border border-linea bg-papel p-2">
              <Tabla>
                <thead><tr><th>Nombre</th><th>Perfil</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead>
                <tbody>{lista.data.map((u) => <Fila key={u.id} u={u} />)}</tbody>
              </Tabla>
            </div>
          )}
        </div>
        <Panel titulo="Nuevo usuario" className="max-w-xl 2xl:max-w-none">
          <form className="space-y-4" noValidate onSubmit={f.handleSubmit((d) => crear.mutate(d))}>
            <Campo id="n-nombre" etiqueta="Nombre" error={e.nombre?.message}><Entrada id="n-nombre" aria-invalid={!!e.nombre} {...f.register('nombre')} /></Campo>
            <Campo id="n-email" etiqueta="Correo" error={e.email?.message}><Entrada id="n-email" type="email" aria-invalid={!!e.email} {...f.register('email')} /></Campo>
            <Campo id="n-rol" etiqueta="Perfil"><Selector id="n-rol" {...f.register('rol')}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selector></Campo>
            <Campo id="n-clave" etiqueta="Contraseña inicial" error={e.clave?.message} ayuda="Compártala por un canal seguro.">
              <Entrada id="n-clave" type="password" autoComplete="new-password" aria-invalid={!!e.clave} {...f.register('clave')} />
            </Campo>
            {crear.error && <Aviso>{crear.error.message}</Aviso>}
            {crear.isSuccess && <Aviso tono="teal">Usuario creado.</Aviso>}
            <Boton type="submit" className="w-full" disabled={crear.isPending}>Crear usuario</Boton>
          </form>
        </Panel>
      </div>
    </>
  )
}

function Fila({ u }: { u: Usuario }) {
  const cliente = useQueryClient()
  const { usuario: yo } = useSesion()
  const [clave, setClave] = useState<string | null>(null)
  const cambiar = useMutation({
    mutationFn: (c: UsuarioCambio) => pedir<Usuario>(`/usuarios/${u.id}`, { metodo: 'PATCH', cuerpo: c }),
    onSuccess: () => {
      setClave(null)
      void cliente.invalidateQueries({ queryKey: ['usuarios'] })
    },
  })
  const soyYo = yo?.id === u.id
  return (
    <>
      <tr>
        <td><p className="font-semibold">{u.nombre}</p><p className="text-salvia">{u.email}</p></td>
        <td>
          <label className="sr-only" htmlFor={`rol-${u.id}`}>Perfil de {u.nombre}</label>
          <Selector id={`rol-${u.id}`} className="h-8 w-44 text-sm" value={u.rol} disabled={soyYo || cambiar.isPending}
            onChange={(e) => cambiar.mutate({ rol: e.target.value as Rol })}>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selector>
        </td>
        <td className="whitespace-nowrap">{fechaHora(u.ultimo_ingreso)}</td>
        <td>{u.activo ? <Insignia tono="teal">Activo</Insignia> : <Insignia>Inactivo</Insignia>}</td>
        <td className="space-x-1 whitespace-nowrap text-right">
          <Boton chico variante="fantasma" onClick={() => setClave(clave === null ? '' : null)}>Contraseña</Boton>
          {!soyYo && (
            <Boton chico variante="fantasma" disabled={cambiar.isPending} onClick={() => cambiar.mutate({ activo: !u.activo })}>
              {u.activo ? 'Desactivar' : 'Activar'}
            </Boton>
          )}
        </td>
      </tr>
      {(clave !== null || cambiar.error) && (
        <tr>
          <td colSpan={5}>
            {clave !== null && (
              <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); cambiar.mutate({ clave }) }}>
                <label htmlFor={`clave-${u.id}`} className="text-sm">Nueva contraseña para {u.nombre}</label>
                <Entrada id={`clave-${u.id}`} type="password" autoComplete="new-password" className="h-8 w-60" value={clave}
                  onChange={(e) => setClave(e.target.value)} minLength={10} />
                <Boton chico type="submit" disabled={clave.length < 10 || cambiar.isPending}>Guardar contraseña</Boton>
                <span className="text-sm text-salvia">Mínimo 10 caracteres. Cierra sus sesiones abiertas.</span>
              </form>
            )}
            {cambiar.error && <p className="mt-1 text-sm text-coral-hondo" role="alert">{cambiar.error.message}</p>}
          </td>
        </tr>
      )}
    </>
  )
}
