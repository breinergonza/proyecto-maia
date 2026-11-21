// «Revisión rápida»: un semáforo por área (rendimiento, calibración, equidad, estabilidad y población) con la regla que decide su
// color al pasar el puntero y un enlace al submódulo con el detalle. Siempre con una forma (✓, ! o ✕) además del color.
import type { Semaforo } from '../../api/tipos'
import { IrA } from '../../paginas/analitica/comun'
import { descripcionDe } from '../../lib/descripciones'
import { dec2 } from '../../lib/formato'
import { SEMAFORO } from '../../lib/lenguaje'
import { Panel } from '../ui'

/** A qué submódulo lleva cada semáforo y cómo se llama su área. */
const DESTINO: Record<string, string> = { auc: 'rendimiento', calibracion: 'calibracion', equidad: 'equidad', estabilidad: 'estabilidad', poblacion: 'poblacion' }
const AREA: Record<string, string> = { auc: 'Rendimiento', calibracion: 'Calibración', equidad: 'Equidad', estabilidad: 'Estabilidad', poblacion: 'Población' }

function Luz({ estado }: { estado: Semaforo['estado'] }) {
  const fondo = { verde: 'var(--color-teal-medio)', ambar: 'var(--color-ocre)', rojo: 'var(--color-coral-hondo)', gris: 'var(--color-referencia)' }[estado]
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
      <circle cx="9" cy="9" r="8" fill={fondo} />
      {estado === 'verde' && <path d="M5 9.5l2.5 2.5L13 6.5" stroke="#fff" strokeWidth="2" fill="none" />}
      {estado === 'ambar' && <path d="M9 4.5v6M9 13v.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
      {estado === 'rojo' && <path d="M6 6l6 6M12 6l-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
      {estado === 'gris' && <path d="M5.5 9h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}

export function RevisionRapida({ semaforos }: { semaforos: Semaforo[] }) {
  const d = descripcionDe('revision_rapida')
  return (
    <Panel titulo={d.titulo} descripcion={d.descripcion}>
      {semaforos.length === 0 ? <p className="text-sm">Sin revisión rápida para este desenlace.</p> : (
        <ul className="grid gap-x-8 divide-y divide-linea/70 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3 sm:[&>li]:border-t sm:[&>li]:border-linea/70">
          {semaforos.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm" title={`${s.detalle} Regla: ${s.umbral}`}>
              <Luz estado={s.estado} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{AREA[s.id] ?? s.nombre}</span>
                <span className="block text-xs">{SEMAFORO[s.estado]}{s.valor != null ? ` · ${dec2(s.valor)}` : ''}</span>
              </span>
              {DESTINO[s.id] && <IrA submodulo={DESTINO[s.id]}>Ver</IrA>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
