// Aviso persistente y no bloqueante cuando la sesión está por vencer o venció. No saca a la persona de su pantalla:
// puede guardar su trabajo y, cuando quiera, ingresar de nuevo: al soltar la sesión, ``Requiere`` lo lleva a /ingresar
// guardando la dirección actual (con filtros) y al ingresar vuelve a ella.
import { useSyncExternalStore } from 'react'
import { alCambiarEstadoSesion, estadoSesion } from '../api/cliente'
import { useSesion } from '../auth/sesion'
import { Boton } from './ui'

export function AvisoSesion() {
  const estado = useSyncExternalStore(alCambiarEstadoSesion, estadoSesion)
  const { descartar } = useSesion()
  if (estado === 'ok') return null
  return (
    <div role={estado === 'vencida' ? 'alert' : 'status'}
      className="flex flex-wrap items-center justify-between gap-3 border-b border-coral/40 bg-coral-tinte px-4 py-2.5 text-sm text-coral-hondo">
      <p>
        {estado === 'vencida' ? 'Su sesión venció.' : 'Su sesión está por vencer.'} Guarde su trabajo e ingrese de nuevo.
      </p>
      <Boton chico variante="secundario"
        onClick={descartar}>
        Ingresar de nuevo
      </Boton>
    </div>
  )
}
