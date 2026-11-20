// La fila de arriba de Modelos: qué desenlace, calculado desde qué visita y de qué entrenamiento, con el estado del desenlace
// elegido («En uso» o «En prueba»). La elección vive en la dirección (?entrenamiento=&desenlace=): un enlace abre la misma
// vista, sobrevive al cambiar de submódulo y no se pierde si una consulta falla y se reintenta.
import { useMemo } from 'react'
import { useEntrenamientosAnalitica } from '../../api/analitica'
import { useContextoAnalitica } from '../../paginas/analitica/contexto'
import { cn } from '../../lib/cn'
import { fecha } from '../../lib/formato'
import { Selector } from '../ui'
import { familiasDeModelo } from './desenlaces'

const AYUDA_ESTADO = {
  'En uso': 'Da las alertas de la aplicación.',
  'En prueba': 'No da alertas todavía y no está validado.',
} as const

/** La etiqueta va a la izquierda de su selector: una sola fila de selectores en vez de una pila de etiquetas y cajas. */
function Campo({ etiqueta, className, children }: { etiqueta: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex min-w-0 items-center gap-2 text-sm', className)}>
      <span className="shrink-0 font-semibold">{etiqueta}</span>
      {children}
    </label>
  )
}

/** Los selectores en una fila y, debajo, una línea con el estado del desenlace elegido y `origen` (de dónde salen los datos). */
export function SelectoresModelo({ origen }: { origen?: string | null }) {
  const { entrenamiento, desenlace, desenlaces, contexto, fijar } = useContextoAnalitica()
  const lista = useEntrenamientosAnalitica().data?.entrenamientos ?? []
  const familias = useMemo(() => familiasDeModelo(desenlaces), [desenlaces])
  const familia = familias.find((f) => f.cortes.some((c) => c.clave === desenlace))
  const corte = familia?.cortes.find((c) => c.clave === desenlace)
  const estado = corte?.enPrueba ? 'En prueba' : 'En uso'
  return (
    <div className="space-y-2">
      {/* dos filas: el desenlace y la visita, y el entrenamiento con el estado y el origen de los datos a su lado; así ningún
          selector corta su texto */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Campo etiqueta="Desenlace" className="flex-[1_1_28rem]">
          <Selector value={familia?.clave ?? ''} disabled={!familias.length}
            onChange={(e) => fijar({ desenlace: familias.find((f) => f.clave === e.target.value)?.cortes[0]?.clave ?? null })}>
            {familias.map((f) => <option key={f.clave} value={f.clave}>{f.nombre}</option>)}
          </Selector>
        </Campo>
        <Campo etiqueta="Calculado a" className="flex-[0_0_14rem]">
          <Selector value={desenlace ?? ''} disabled={!familia} onChange={(e) => fijar({ desenlace: e.target.value })}>
            {familia?.cortes.map((c) => <option key={c.clave} value={c.clave}>{c.corte}</option>)}
          </Selector>
        </Campo>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Campo etiqueta="Entrenamiento" className="flex-[0_1_27rem]">
          <Selector value={entrenamiento ?? ''} onChange={(e) => fijar({ entrenamiento: Number(e.target.value) })}>
            {entrenamiento != null && !lista.some((m) => m.entrenamiento === entrenamiento) && <option value={entrenamiento}>N.º {entrenamiento}</option>}
            {lista.map((m) => (
              <option key={m.entrenamiento} value={m.entrenamiento}>N.º {m.entrenamiento}{m.creada ? ` · ${fecha(m.creada)}` : ''}</option>
            ))}
          </Selector>
        </Campo>
        {(corte || origen) && (
          <p data-linea-contexto className="flex min-w-0 flex-1 basis-72 flex-wrap gap-x-5 gap-y-0.5 text-sm">
            {corte && (
              <span>
                <span className="font-semibold">Estado: </span>
                <b className={estado === 'En prueba' ? 'text-ocre-hondo' : 'text-teal'}>{estado}</b>
                <span className="text-tinta/80"> · {AYUDA_ESTADO[estado]}</span>
              </span>
            )}
            {origen && <span className="text-tinta/80">{origen}</span>}
          </p>
        )}
      </div>
      {contexto?.estado === 'sin_artefactos' && entrenamiento != null && (
        <p className="text-sm font-semibold text-ocre-hondo">Este entrenamiento no tiene analítica.</p>
      )}
    </div>
  )
}
