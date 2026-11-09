// Qué datos pesan más en el riesgo (importancia agregada del modelo). No prueba causa.
import { useSubmodulo } from '../../api/analitica'
import type { DatosInterpretabilidad } from '../../api/tipos'
import { Grafica } from '../../components/grafica'
import { Aviso } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { pct } from '../../lib/formato'
import { Guia, PorDesenlace } from './comun'
import { useContextoAnalitica } from './contexto'

export default function Interpretabilidad() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosInterpretabilidad>(entrenamiento, 'interpretabilidad', desenlace)
  const d = descripcionDe('variables_pesan')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Muestra los datos que más pesan en el riesgo que calcula el modelo. Que un dato pese mucho no prueba que cause el desenlace: solo dice que el modelo lo usa para ordenar a los niños.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(datos) => {
          const max = Math.max(1, ...datos.importancia.map((i) => i.importancia_pct))
          return (
            <>
              {datos.avisos.map((a) => <Aviso key={a} tono="teal">{a}</Aviso>)}
              <Grafica titulo={d.titulo} descripcion={d.descripcion}
                exportar={{ nombre: 'interpretabilidad', filas: datos.importancia.map((i) => ({ dato: i.variable, peso_pct: i.importancia_pct })) }}>
                <ul role="figure" aria-label="Qué datos pesan más en el riesgo" className="space-y-2">
                  {datos.importancia.map((i) => (
                    <li key={i.variable} className="grid grid-cols-[minmax(8rem,14rem)_1fr_4rem] items-center gap-2 text-sm">
                      <span className="truncate" title={i.variable}>{i.variable}</span>
                      <span className="h-3 rounded-full bg-fondo"><span className="block h-3 rounded-full" style={{ width: `${(100 * i.importancia_pct) / max}%`, background: 'var(--color-serie-1)' }} /></span>
                      <span className="text-right tabular-nums">{pct(i.importancia_pct)}</span>
                    </li>
                  ))}
                </ul>
              </Grafica>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
