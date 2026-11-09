// Equidad: si el modelo funciona igual en cada grupo de niños. Mapa de calor, bosque de intervalos y tabla.
import { useSubmodulo } from '../../api/analitica'
import type { DatosEquidad, DatosRendimiento, FilaSubgrupo } from '../../api/tipos'
import { Bosque, MapaCalor } from '../../components/graficos/equidad'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, frase, num } from '../../lib/formato'
import { jerga, N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { fracPct, Guia, ic, PorDesenlace, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

const pequeno = (f: FilaSubgrupo) => f.n < 5

export default function Equidad() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosEquidad>(entrenamiento, 'equidad', desenlace)
  const total = useSubmodulo<DatosRendimiento>(entrenamiento, 'rendimiento', desenlace).data?.desenlaces?.[desenlace ?? '']?.auc_desenlace?.auc ?? null
  const { tecnico } = useTecnico()
  const dMapa = descripcionDe('equidad_mapa'), dGrupo = descripcionDe('equidad_grupo'), dDif = descripcionDe('equidad_diferencia')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Compara cómo funciona el modelo en cada grupo (por ejemplo, por sexo o por sede). Si un grupo queda mucho peor que el total, el modelo puede estar fallando con esos niños.</p>
        <p>Los grupos con menos de 5 niños no se muestran, para proteger su privacidad.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(d) => {
          const grupos = Object.entries(d.subgrupos)
          if (!grupos.length) return <p className="text-salvia">No hay grupos con suficientes niños para este desenlace.</p>
          const todas = grupos.flatMap(([g, filas]) => filas.map((f) => ({ g, ...f })))
          const nombre = (g: string, f: FilaSubgrupo) => `${frase(g.replaceAll('_', ' '))}: ${f.grupo}`
          const columnas = [jerga(tecnico, 'Qué tan bien ordena', 'AUC'), 'Riesgo medio', 'Real', jerga(tecnico, 'Alertados (10 % de más riesgo)', 'Tasa de alerta (top 10)'), jerga(tecnico, 'Casos detectados (10 %)', 'Sensibilidad (top 10)')]
          return (
            <>
              <Grafica titulo={dMapa.titulo} descripcion={dMapa.descripcion}
                exportar={{ nombre: 'equidad-mapa', filas: todas.map((f) => ({ grupo: nombre(f.g, f), ninos: f.n, auc: f.auc, riesgo_medio: f.riesgo_medio, observado: f.observado, tasa_alerta_top10: f.tasa_alerta_top10, sensibilidad_top10: f.sensibilidad_top10 })) }}>
                <MapaCalor etiqueta="Mapa de equidad por grupo" columnas={columnas} escala={[0.5, 1]}
                  filas={todas.map((f) => ({
                    etiqueta: nombre(f.g, f),
                    celdas: [f.auc, f.riesgo_medio, f.observado, f.tasa_alerta_top10, f.sensibilidad_top10].map((v, i) => ({
                      // solo el AUC se sombrea: las demás cifras tienen otra escala
                      valor: i === 0 ? v : null, pequena: pequeno(f), texto: v == null ? '—' : i === 0 ? dec2(v) : fracPct(v),
                    })),
                  }))} />
              </Grafica>
              <Grafica titulo={dGrupo.titulo} descripcion={dGrupo.descripcion}>
                <Bosque etiqueta="Qué tan bien ordena el modelo en cada grupo" referencia={total} nombreValor={jerga(tecnico, 'Ordena', 'AUC')}
                  puntos={todas.map((f) => ({ etiqueta: nombre(f.g, f), valor: f.auc, bajo: f.ic_bajo, alto: f.ic_alto, pequena: pequeno(f), nota: 'Pocos niños para calcularlo' }))} />
                {total != null && <p className="mt-1 text-xs text-salvia">La línea punteada es el total del modelo ({dec2(total)}).</p>}
              </Grafica>
              <TablaDatos titulo={dDif.titulo} descripcion={dDif.descripcion}
                exportar={{ nombre: 'equidad-diferencia', filas: todas.map((f) => ({ grupo: nombre(f.g, f), ninos: f.n, casos: f.casos, auc: f.auc, diferencia_con_el_total: f.auc != null && total != null ? Math.round((f.auc - total) * 10000) / 10000 : null })) }}>
                <Tabla densa>
                  <thead><tr><th>Grupo</th><th>Niños</th><th>Casos</th><th>{jerga(tecnico, 'Qué tan bien ordena', 'AUC (IC)')}</th><th>Diferencia con el total</th></tr></thead>
                  <tbody>
                    {todas.map((f) => (
                      <tr key={`${f.g}-${f.grupo}`}>
                        <td>{nombre(f.g, f)}</td>
                        <td>{pequeno(f) ? N_MENOR_QUE_5 : num(f.n)}</td>
                        <td>{pequeno(f) || f.casos == null || f.casos < 5 ? N_MENOR_QUE_5 : num(f.casos)}</td>
                        <td>{pequeno(f) ? N_MENOR_QUE_5 : ic(f)}</td>
                        <td>{pequeno(f) ? N_MENOR_QUE_5 : f.auc != null && total != null ? `${f.auc - total >= 0 ? '+' : '−'}${dec2(Math.abs(f.auc - total))}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              </TablaDatos>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
