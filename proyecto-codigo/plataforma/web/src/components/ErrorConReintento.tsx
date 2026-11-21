// Aviso de una consulta que falló: dice qué pasó con las palabras de la API y ofrece reintentar. Quien lo usa deja los filtros
// y selectores donde estaban (viven en la pantalla o en la dirección), así que reintentar pide lo mismo y no pierde lo elegido.
import { Aviso, Boton } from './ui'

export function ErrorConReintento({ error, reintentar, reintentando, que, verbo = 'cargar', conserva = 'Lo que eligió sigue igual: al reintentar se pide lo mismo.' }: {
  error: Error
  /** Lo que se intentó, para «No se pudo {verbo} {que}»: «cargar» una consulta, «calcular» un envío. */
  verbo?: string
  reintentar: () => void
  reintentando: boolean
  /** Qué no se pudo cargar, dicho para completar «No se pudo cargar …»: «la lista de mediciones». */
  que: string
  /** Qué se conserva al reintentar, dicho para quien mira esta página. */
  conserva?: string
}) {
  return (
    <Aviso>
      <p className="font-semibold">No se pudo {verbo} {que}.</p>
      <p className="mt-0.5">{error.message}</p>
      <p className="mt-0.5">{conserva}</p>
      <Boton variante="secundario" chico className="mt-2" onClick={reintentar} disabled={reintentando}>
        {reintentando ? 'Reintentando…' : 'Reintentar'}
      </Boton>
    </Aviso>
  )
}
