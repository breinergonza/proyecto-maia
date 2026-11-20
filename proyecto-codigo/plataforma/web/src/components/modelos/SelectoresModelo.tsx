// La fila de arriba de Modelos: qué desenlace, calculado desde qué visita y de qué entrenamiento, con el estado del desenlace
// elegido («En uso» o «En prueba»). La elección vive en la dirección (?entrenamiento=&desenlace=): un enlace abre la misma
// vista, sobrevive al cambiar de submódulo y no se pierde si una consulta falla y se reintenta.
import { useMemo } from 'react'
import { useEntrenamientosAnalitica } from '../../api/analitica'
import { useContextoAnalitica } from '../../paginas/analitica/contexto'
import { fechaHora } from '../../lib/formato'
import { Selector } from '../ui'
import { familiasDeModelo } from './desenlaces'

const AYUDA_ESTADO = {
  'En uso': 'Da las alertas de la aplicación.',
  'En prueba': 'Todavía no da alertas: se muestra para seguirlo y evaluarlo, y no está validado.',
} as const

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0 text-sm">
      <span className="mb-1 block font-semibold">{etiqueta}</span>
      {children}
    </label>
  )
}

export function SelectoresModelo() {
  const { entrenamiento, desenlace, desenlaces, contexto, fijar } = useContextoAnalitica()
  const lista = useEntrenamientosAnalitica().data?.entrenamientos ?? []
  const familias = useMemo(() => familiasDeModelo(desenlaces), [desenlaces])
  const familia = familias.find((f) => f.cortes.some((c) => c.clave === desenlace))
  const corte = familia?.cortes.find((c) => c.clave === desenlace)
  const estado = corte?.enPrueba ? 'En prueba' : 'En uso'
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)]">
      <Campo etiqueta="Desenlace">
        <Selector value={familia?.clave ?? ''} disabled={!familias.length}
          onChange={(e) => fijar({ desenlace: familias.find((f) => f.clave === e.target.value)?.cortes[0]?.clave ?? null })}>
          {familias.map((f) => <option key={f.clave} value={f.clave}>{f.nombre}</option>)}
        </Selector>
      </Campo>
      <Campo etiqueta="Calculado a">
        <Selector value={desenlace ?? ''} disabled={!familia} onChange={(e) => fijar({ desenlace: e.target.value })}>
          {familia?.cortes.map((c) => <option key={c.clave} value={c.clave}>{c.corte}</option>)}
        </Selector>
      </Campo>
      <Campo etiqueta="Entrenamiento">
        <Selector value={entrenamiento ?? ''} onChange={(e) => fijar({ entrenamiento: Number(e.target.value) })}>
          {entrenamiento != null && !lista.some((m) => m.entrenamiento === entrenamiento) && <option value={entrenamiento}>N.º {entrenamiento}</option>}
          {lista.map((m) => (
            <option key={m.entrenamiento} value={m.entrenamiento}>N.º {m.entrenamiento}{m.creada ? ` · ${fechaHora(m.creada)}` : ''}</option>
          ))}
        </Selector>
      </Campo>
      <div className="min-w-0 text-sm">
        <p className="mb-1 font-semibold">Estado</p>
        {corte ? (
          <p className={estado === 'En prueba' ? 'text-ocre-hondo' : 'text-teal'}>
            <b>{estado}</b>
            <span className="block text-xs text-tinta/80">{AYUDA_ESTADO[estado]}</span>
          </p>
        ) : <p>—</p>}
      </div>
      {contexto?.estado === 'sin_artefactos' && entrenamiento != null && (
        <p className="text-sm font-semibold text-ocre-hondo sm:col-span-2 lg:col-span-4">Este entrenamiento no tiene analítica.</p>
      )}
    </div>
  )
}
