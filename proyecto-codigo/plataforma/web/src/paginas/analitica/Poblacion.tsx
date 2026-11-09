// Población: embudo de la muestra, casos por desenlace y datos faltantes.
import { useSubmodulo } from '../../api/analitica'
import type { DatosPoblacion } from '../../api/tipos'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Cifra, Panel, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { frase, num, pct } from '../../lib/formato'
import { Guia, omitida, PorDesenlace, pctN } from './comun'
import { useContextoAnalitica } from './contexto'

const textoEtapa = (e: Record<string, string | number | null>) => String(e.etapa ?? e.nombre ?? e.paso ?? e.filtro ?? e.descripcion ?? '—')

export default function Poblacion() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosPoblacion>(entrenamiento, 'poblacion', desenlace)
  const dEmb = descripcionDe('embudo'), dEv = descripcionDe('eventos'), dNul = descripcionDe('datos_faltantes')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Dice con qué niños se evaluó el modelo: cuántos quedan después de cada filtro, cuántos casos hay y qué datos faltan. Con pocos casos, cualquier cifra del modelo es poco confiable.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(d) => {
          const max = Math.max(1, ...d.embudo.map((e) => Number(e.n ?? 0)))
          return (
            <>
              <Panel titulo={dEv.titulo} descripcion={dEv.descripcion}>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Cifra valor={num(d.eventos.niños)} texto="niños evaluados" />
                  <Cifra valor={omitida(d.eventos.casos, num)} texto="casos del desenlace" />
                  <Cifra valor={d.eventos.tasa != null ? pct(100 * d.eventos.tasa) : '—'} texto="de los niños tuvo el desenlace" />
                </div>
              </Panel>
              {d.embudo.length > 0 && (
                <Grafica titulo={dEmb.titulo} descripcion={dEmb.descripcion}
                  exportar={{ nombre: 'poblacion-embudo', filas: d.embudo.map((e) => ({ etapa: textoEtapa(e), ninos: e.n })) }}>
                  <ul role="figure" aria-label="Niños que quedan después de cada filtro" className="space-y-2">
                    {d.embudo.map((e, i) => (
                      <li key={i} className="grid grid-cols-[minmax(8rem,16rem)_1fr_5rem] items-center gap-2 text-sm">
                        <span>{frase(textoEtapa(e))}</span>
                        <span className="h-3 rounded-full bg-fondo"><span className="block h-3 rounded-full" style={{ width: `${(100 * Number(e.n ?? 0)) / max}%`, background: 'var(--color-serie-1)' }} /></span>
                        <span className="text-right tabular-nums">{omitida(typeof e.n === 'number' ? e.n : null, num)}</span>
                      </li>
                    ))}
                  </ul>
                </Grafica>
              )}
              <TablaDatos titulo={dNul.titulo} descripcion={dNul.descripcion}
                exportar={{ nombre: 'poblacion-faltantes', filas: d.nulos.map((n) => ({ dato: n.variable, sin_dato_pct: n.nulos_pct })) }}>
                <Tabla densa>
                  <thead><tr><th>Dato</th><th>Niños sin el dato</th></tr></thead>
                  <tbody>{d.nulos.map((n) => <tr key={n.variable}><td>{n.variable}</td><td>{pctN(n.nulos_pct)}</td></tr>)}</tbody>
                </Tabla>
              </TablaDatos>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
