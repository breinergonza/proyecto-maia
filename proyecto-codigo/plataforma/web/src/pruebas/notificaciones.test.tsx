import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ServidorSalida } from '../api/tipos'
import { montar, simularApi, usuario } from './util'

const SERVIDOR_VACIO: ServidorSalida = { configurado: false, host: '', puerto: 587, usuario: null, remitente: '', tls: true, clave_guardada: false, puede_guardar_clave: true }
const SERVIDOR_LISTO: ServidorSalida = { configurado: true, host: 'smtp.maia.prueba', puerto: 587, usuario: 'u', remitente: 'alertas@maia.prueba', tls: true, clave_guardada: true, puede_guardar_clave: true }
const CATALOGO = [{ clave: 'readm', nombre: 'readmisión a los 3 meses' }, { clave: 'crec', nombre: 'crecimiento bajo a los 6 meses' }]
const NOTIF = { id: 7, nombre: 'Neonatología', percentil_minimo: 95, destinatarios: ['a@maia.prueba', 'b@maia.prueba'], alertas: ['readm'], activo: true }

type Resp = { estado?: number; cuerpo?: unknown }
function api(extra: (url: string, init?: RequestInit) => Resp | undefined = () => undefined, servidor = SERVIDOR_LISTO, lista = [NOTIF]) {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('admin') } }
    const r = extra(url, init)
    if (r) return r
    if (url === '/api/notificaciones/servidor') return { cuerpo: servidor }
    if (url === '/api/notificaciones/alertas') return { cuerpo: lista }
    if (url === '/api/notificaciones/alertas/desenlaces') return { cuerpo: CATALOGO }
    if (url.startsWith('/api/notificaciones/historial')) return { cuerpo: { total: 0, pagina: 1, tamano: 20, items: [] } }
    return undefined
  })
}
const cuerpoDe = (llamadas: { url: string; init?: RequestInit }[], metodo: string) =>
  // se ignora «/api/auth/refrescar», que también es POST pero sin cuerpo
  JSON.parse(String(llamadas.find((l) => l.init?.method === metodo && !l.url.startsWith('/api/auth/'))?.init?.body ?? 'null'))

describe('Servidor de correo', () => {
  it('muestra «Sin configurar» y valida el puerto y el remitente', async () => {
    const u = userEvent.setup()
    api(() => undefined, SERVIDOR_VACIO)
    montar('/notificaciones/servidor')
    expect(await screen.findByText('Sin configurar')).toBeInTheDocument()
    await u.clear(screen.getByLabelText('Puerto'))
    await u.type(screen.getByLabelText('Puerto'), '0')
    expect(screen.getByText('Un número de 1 a 65535.')).toBeInTheDocument()
    await u.type(screen.getByLabelText('Correo remitente'), 'x')
    expect(screen.getByText('Escriba un correo válido.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })
  it('no muestra la clave guardada y solo la envía si se cambia', async () => {
    const u = userEvent.setup()
    const llamadas = api((url, init) => url === '/api/notificaciones/servidor' && init?.method === 'PUT' ? { cuerpo: SERVIDOR_LISTO } : undefined)
    montar('/notificaciones/servidor')
    expect(await screen.findByText('Clave guardada')).toBeInTheDocument()
    expect(screen.queryByLabelText('Clave')).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(cuerpoDe(llamadas, 'PUT')).toMatchObject({ host: 'smtp.maia.prueba', puerto: 587, tls: true }))
    expect(cuerpoDe(llamadas, 'PUT')).not.toHaveProperty('clave')
    await u.click(await screen.findByRole('button', { name: 'Cambiar' }))
    await u.type(screen.getByLabelText('Clave'), 'nueva')
    await u.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(llamadas.filter((l) => l.init?.method === 'PUT')).toHaveLength(2))
    expect(JSON.parse(String(llamadas.filter((l) => l.init?.method === 'PUT')[1].init?.body))).toMatchObject({ clave: 'nueva' })
  })
  it('avisa si falta la llave para guardar la clave', async () => {
    const u = userEvent.setup()
    api(() => undefined, { ...SERVIDOR_VACIO, puede_guardar_clave: false })
    montar('/notificaciones/servidor')
    await u.type(await screen.findByLabelText('Clave'), 'x')
    expect(screen.getByText(/MAIA_CIFRADO_CLAVE/)).toBeInTheDocument()
  })
})

describe('Reestablecer el servidor', () => {
  it('no aparece si no hay servidor guardado', async () => {
    api(() => undefined, SERVIDOR_VACIO)
    montar('/notificaciones/servidor')
    expect(await screen.findByText('Sin configurar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reestablecer' })).toBeNull()
  })
  it('aparece si está configurado, pide confirmar y al confirmar borra y vuelve a «Sin configurar»', async () => {
    const u = userEvent.setup()
    let borrado = false
    const llamadas = api((url, init) => {
      if (url === '/api/notificaciones/servidor' && init?.method === 'DELETE') { borrado = true; return { estado: 204 } }
      if (url === '/api/notificaciones/servidor' && borrado) return { cuerpo: SERVIDOR_VACIO }
      return undefined
    })
    montar('/notificaciones/servidor')
    expect(await screen.findByDisplayValue('smtp.maia.prueba')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Reestablecer' }))
    const d = await screen.findByRole('alertdialog')
    expect(within(d).getByText(/No se puede deshacer/)).toBeInTheDocument()
    expect(within(d).getByText(/no saldrá ningún correo de alertas/)).toBeInTheDocument()
    expect(llamadas.some((l) => l.init?.method === 'DELETE')).toBe(false)   // todavía no: falta confirmar
    await u.click(within(d).getByRole('button', { name: 'Reestablecer' }))
    expect(await screen.findByText('Sin configurar')).toBeInTheDocument()
    expect(llamadas.some((l) => l.url === '/api/notificaciones/servidor' && l.init?.method === 'DELETE')).toBe(true)
    expect(screen.getByLabelText('Servidor (host)')).toHaveValue('')
    expect(screen.getByLabelText('Correo remitente')).toHaveValue('')
    expect(screen.getByLabelText('Usuario')).toHaveValue('')
    expect(screen.getByLabelText('Clave')).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: /TLS/ })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Reestablecer' })).toBeNull()
    expect(screen.getByText('Guarde primero los datos del servidor.')).toBeInTheDocument()
  })
  it('cancelar no borra nada', async () => {
    const u = userEvent.setup()
    const llamadas = api()
    montar('/notificaciones/servidor')
    await u.click(await screen.findByRole('button', { name: 'Reestablecer' }))
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(llamadas.some((l) => l.init?.method === 'DELETE')).toBe(false)
    expect(screen.getByDisplayValue('smtp.maia.prueba')).toBeInTheDocument()
  })
})

describe('Probar el correo', () => {
  it('normaliza lo escrito: sin espacios y en minúscula', async () => {
    const u = userEvent.setup()
    api()
    montar('/notificaciones/servidor')
    const campo = await screen.findByLabelText('Enviar un correo de prueba a')
    await u.type(campo, ' Ana @Maia.Prueba ')
    expect(campo).toHaveValue('ana@maia.prueba')
  })
  it('con un correo inválido muestra el error y no deja enviar', async () => {
    const u = userEvent.setup()
    const llamadas = api()
    montar('/notificaciones/servidor')
    const campo = await screen.findByLabelText('Enviar un correo de prueba a')
    expect(screen.queryByText(/Escriba un correo válido, por ejemplo/)).toBeNull()
    await u.type(campo, 'ana@maia')
    expect(screen.getByText('Escriba un correo válido, por ejemplo nombre@dominio.org.')).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    await u.type(campo, '{Enter}')
    expect(llamadas.some((l) => l.url.endsWith('/servidor/prueba'))).toBe(false)
  })
  it('con un correo válido habilita «Enviar» y envía el correo normalizado', async () => {
    const u = userEvent.setup()
    const llamadas = api((url, init) => url === '/api/notificaciones/servidor/prueba' && init?.method === 'POST' ? { estado: 204 } : undefined)
    montar('/notificaciones/servidor')
    const campo = await screen.findByLabelText('Enviar un correo de prueba a')
    await u.type(campo, 'Ana@Maia.Prueba')
    expect(screen.queryByText(/Escriba un correo válido, por ejemplo/)).toBeNull()
    await u.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(cuerpoDe(llamadas, 'POST')).toEqual({ destinatario: 'ana@maia.prueba' }))
  })
  it('al pegar varios correos se queda con el primero', async () => {
    const u = userEvent.setup()
    api()
    montar('/notificaciones/servidor')
    const campo = await screen.findByLabelText('Enviar un correo de prueba a')
    await u.click(campo)
    await u.paste('Ana@maia.prueba, otro@maia.prueba')
    expect(campo).toHaveValue('ana@maia.prueba')
  })
})

describe('Alertas', () => {
  it('lista las notificaciones con sus alertas y la cantidad de correos', async () => {
    api()
    montar('/notificaciones/alertas')
    expect(await screen.findByText('Neonatología')).toBeInTheDocument()
    expect(screen.getByText('readmisión a los 3 meses')).toBeInTheDocument()
    expect(screen.getByText('2 correos')).toBeInTheDocument()
    expect(screen.getByText('Activa')).toBeInTheDocument()
  })
  it('crea una notificación con varias alertas y varios correos', async () => {
    const u = userEvent.setup()
    const llamadas = api((url, init) => url === '/api/notificaciones/alertas' && init?.method === 'POST'
      ? { estado: 201, cuerpo: { ...NOTIF, id: 8 } } : undefined, SERVIDOR_LISTO, [])
    montar('/notificaciones/alertas')
    await u.click(await screen.findByRole('button', { name: 'Nueva notificación' }))
    await u.type(screen.getByLabelText('Nombre'), 'Jefatura')
    await u.click(screen.getByRole('checkbox', { name: /readmisión/ }))
    await u.click(screen.getByRole('checkbox', { name: /crecimiento/ }))
    await u.type(screen.getByRole('textbox', { name: 'Correos que reciben el aviso' }), 'x@maia.prueba{Enter}y@maia.prueba{Enter}')
    await u.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(cuerpoDe(llamadas, 'POST')).toEqual({
      nombre: 'Jefatura', alertas: ['readm', 'crec'], destinatarios: ['x@maia.prueba', 'y@maia.prueba'], percentil_minimo: 95, activo: false,
    }))
  })
  it('no deja guardar sin nombre, sin alertas, o activa sin correos', async () => {
    const u = userEvent.setup()
    api(() => undefined, SERVIDOR_LISTO, [])
    montar('/notificaciones/alertas')
    await u.click(await screen.findByRole('button', { name: 'Nueva notificación' }))
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(screen.getByText('Elija al menos una alerta.')).toBeInTheDocument()
    await u.type(screen.getByLabelText('Nombre'), 'Solo')
    await u.click(screen.getByRole('checkbox', { name: /readmisión/ }))
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    await u.click(screen.getByRole('checkbox', { name: 'Enviar avisos' }))
    expect(screen.getByText('Para activar, agregue al menos un correo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })
  it('«Enviar ahora» pide confirmar y muestra el resultado', async () => {
    const u = userEvent.setup()
    const llamadas = api((url, init) => url === '/api/notificaciones/alertas/7/enviar' && init?.method === 'POST'
      ? { cuerpo: { correos: 2, ninos: 5, errores: 0, sin_servidor: false } } : undefined)
    montar('/notificaciones/alertas')
    await u.click(await screen.findByRole('button', { name: 'Enviar ahora' }))
    expect(llamadas.some((l) => l.url.endsWith('/enviar'))).toBe(false)   // todavía no: falta confirmar
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('Se enviaron 2 correos con 5 niños.')).toBeInTheDocument()
  })
  it('muestra el aviso cuando falta el servidor de correo', async () => {
    const u = userEvent.setup()
    api((url, init) => url === '/api/notificaciones/alertas/7/enviar' && init?.method === 'POST'
      ? { estado: 422, cuerpo: { detail: 'Configure el servidor de correo en Notificaciones › Servidor de correo.' } } : undefined)
    montar('/notificaciones/alertas')
    await u.click(await screen.findByRole('button', { name: 'Enviar ahora' }))
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText(/Configure el servidor de correo/)).toBeInTheDocument()
  })
  it('eliminar pide confirmación y solo borra al confirmar', async () => {
    const u = userEvent.setup()
    const llamadas = api((url, init) => url === '/api/notificaciones/alertas/7' && init?.method === 'DELETE' ? { estado: 204 } : undefined)
    montar('/notificaciones/alertas')
    await u.click(await screen.findByRole('button', { name: 'Editar' }))
    await u.click(screen.getByRole('button', { name: 'Eliminar' }))
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(llamadas.some((l) => l.init?.method === 'DELETE')).toBe(false)
    await u.click(screen.getByRole('button', { name: 'Eliminar' }))
    await u.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(llamadas.some((l) => l.init?.method === 'DELETE')).toBe(true))
  })
})
