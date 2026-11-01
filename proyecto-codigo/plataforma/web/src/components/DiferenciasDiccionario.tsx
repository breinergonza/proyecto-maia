// Lo que cambia un diccionario frente al vigente: variables nuevas o quitadas, estados y desenlaces. Lo usan la
// importación desde Excel y la revisión de los cambios hechos con los formularios.
import type { ReactNode } from 'react'
import type { CambioDesenlace, DiferenciasDiccionario as Diferencias, VariableDiccionario } from '../api/tipos-diccionario'
import { num } from '../lib/formato'
import { Aviso } from './ui'

function Grupo({ titulo, n, children }: { titulo: string; n: number; children: ReactNode }) {
  if (!n) return null
  return (
    <details className="text-sm" open={n <= 8}>
      <summary className="cursor-pointer font-semibold">{titulo} ({num(n)})</summary>
      <ul className="mt-1.5 space-y-1 pl-1">{children}</ul>
    </details>
  )
}

const nombre = (v: VariableDiccionario) => v.etiqueta ? `${v.etiqueta} (${v.variable})` : v.variable
const desenlace = (d: CambioDesenlace) => d.nombre ?? d.clave

/** `otrasColumnas`: el aviso cuando no cambia nada de esto (otras columnas, como nombres o rangos, sí pueden cambiar). */
export default function DiferenciasDiccionario({ d, otrasColumnas }: { d: Diferencias; otrasColumnas?: ReactNode }) {
  if (d.sin_cambios) {
    return otrasColumnas === undefined ? (
      <Aviso tono="teal">
        No cambian variables, estados ni desenlaces frente al vigente{d.vigente ? ` (versión ${d.vigente})` : ''}. Si editó otras
        columnas, como nombres o rangos, puede confirmarlo igual.
      </Aviso>
    ) : otrasColumnas
  }
  return (
    <div className="space-y-3 rounded-control border border-linea bg-fondo/50 p-3">
      <p className="text-sm font-semibold">Cambios frente al vigente{d.vigente ? ` (versión ${d.vigente})` : ''}</p>
      <Grupo titulo="Variables nuevas" n={d.nuevas.length}>
        {d.nuevas.map((v) => <li key={v.variable}>{nombre(v)} · {v.estado ?? '—'}</li>)}
      </Grupo>
      <Grupo titulo="Variables quitadas" n={d.quitadas.length}>
        {d.quitadas.map((v) => <li key={v.variable} className="text-coral-hondo">{nombre(v)}</li>)}
      </Grupo>
      <Grupo titulo="Cambios de estado" n={d.estados.length}>
        {d.estados.map((v) => <li key={v.variable}>{nombre(v)}: {v.antes ?? '—'} → <strong>{v.despues ?? '—'}</strong></li>)}
      </Grupo>
      <Grupo titulo="Desenlaces que empiezan a usarse" n={d.desenlaces_activados.length}>
        {d.desenlaces_activados.map((x) => <li key={x.clave}>{desenlace(x)}: {x.antes ?? 'nuevo'} → <strong>{x.despues}</strong></li>)}
      </Grupo>
      <Grupo titulo="Desenlaces que dejan de usarse" n={d.desenlaces_apagados.length}>
        {d.desenlaces_apagados.map((x) => <li key={x.clave} className="text-coral-hondo">{desenlace(x)}: {x.antes} → {x.despues ?? 'quitado'}</li>)}
      </Grupo>
    </div>
  )
}
