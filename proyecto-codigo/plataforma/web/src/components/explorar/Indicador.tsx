// Una cifra del grupo elegido con su explicación debajo (la misma franja de cifras del Tablero).
import { Link } from 'react-router'
import { cn } from '../../lib/cn'

export function Indicador({ valor, texto, tono, a, ayuda }: { valor: string; texto: string; tono?: 'coral'; a?: string; ayuda?: string }) {
  const contenido = (
    <>
      <div className={cn('text-2xl font-bold leading-none tracking-tight', tono === 'coral' ? 'text-coral-hondo' : 'text-teal')}>{valor}</div>
      <div className="mt-1.5 text-xs leading-snug text-salvia">{texto}</div>
    </>
  )
  const clase = 'block animate-aparecer rounded-panel border border-linea/80 bg-papel px-4 py-2.5 shadow-suave'
  return a
    ? <Link to={a} title={ayuda} className={cn(clase, 'transition-colors hover:border-teal/40')}>{contenido}</Link>
    : <div title={ayuda} className={clase}>{contenido}</div>
}
