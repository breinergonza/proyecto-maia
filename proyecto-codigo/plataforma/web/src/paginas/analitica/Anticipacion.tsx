// Anticipación: con cuánta anticipación avisa el modelo. Casos detectados y alertas acertadas según la visita en que se
// calcula el riesgo; y el porcentaje de casos avisados al menos una visita antes.
import { useSubmodulo } from '../../api/analitica'
import type { DatosAnticipacion } from '../../api/tipos'
import { LineasSeries } from '../../components/graficos'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Aviso, Cifra, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { num, pct } from '../../lib/formato'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { EnPrueba, Guia, PorDesenlace, pctN, useNombreDesenlace } from './comun'
import { useContextoAnalitica } from './contexto'

export default function Anticipacion() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosAnticipacion>(entrenamiento, 'anticipacion', desenlace)
  const nombreDe = useNombreDesenlace()
  const d = descripcionDe('anticipacion'), dAv = descripcionDe('anticipacion_avisados')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Muestra qué tan temprano avisa el modelo: casos detectados y alertas acertadas según la visita en que se calcula el riesgo.</p>
        <p>Avisar antes da más ventaja al equipo, pero suele detectar menos casos.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(a) => {
          const visitas = a.visitas ?? []
          const av = a.avisados_antes
          const nombre = a.nombre ?? nombreDe(desenlace ?? '').nombre
          const enPrueba = a.etiqueta === 'En prueba'
          return (
            <>
              {enPrueba && <p className="flex items-center gap-2 text-sm"><EnPrueba /> {nombre}: los desenlaces de crecimiento aún se están validando.</p>}
              {av && (
                <Grafica titulo={dAv.titulo} descripcion={dAv.descripcion}
                  exportar={{ nombre: 'anticipacion-avisados', filas: [{ desenlace: nombre, casos: av.casos, avisados: av.avisados, avisados_antes_pct: av.pct, meta: av.meta }] }}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Cifra valor={av.pct == null ? N_MENOR_QUE_5 : pct(av.pct)} texto="Casos avisados al menos una visita antes" />
                    <Cifra valor={av.casos == null ? N_MENOR_QUE_5 : num(av.casos)} texto="Casos del desenlace" />
                    <Cifra valor={av.avisados == null ? N_MENOR_QUE_5 : num(av.avisados)} texto="Casos que recibieron aviso antes" />
                  </div>
                  <p className="mt-2 text-sm text-salvia">Meta: {av.meta}.</p>
                </Grafica>
              )}
              {visitas.length === 0 ? <Aviso tono="teal">Este desenlace no tiene visitas de cálculo para comparar.</Aviso> : (
                <>
                  <Grafica titulo={d.titulo} descripcion={d.descripcion}
                    exportar={{ nombre: 'anticipacion-visitas', muestra: a.top_pct ? `Se alerta al ${a.top_pct} % de mayor riesgo` : undefined,
                      filas: visitas.map((v) => ({ calculado_en: v.desde, desenlace_en: v.etapa, visitas_de_ventaja: v.ventaja_visitas, casos: v.casos, alertas: v.alertas,
                        casos_detectados_pct: v.casos_detectados_pct, alertas_acertadas_pct: v.alertas_acertadas_pct })) }}>
                    <LineasSeries etiqueta="Casos detectados y alertas acertadas según la visita en que se calcula el riesgo" alto={240}
                      dominioY={[0, 100]} formatoY={(v) => `${Math.round(v)} %`}
                      series={[{ clave: 'det', nombre: 'Casos detectados', color: 0 }, { clave: 'ac', nombre: 'Alertas acertadas', color: 1 }]}
                      filas={visitas.map((v) => ({ x: v.desde, det: v.casos_detectados_pct, ac: v.alertas_acertadas_pct }))} />
                    <p className="mt-2 text-sm">Avisar antes detecta menos casos y da más ventaja.</p>
                  </Grafica>
                  <TablaDatos titulo="Cada visita de cálculo" descripcion="Para cada visita: cuántas visitas de ventaja da, y los casos detectados y las alertas acertadas."
                    exportar={{ nombre: 'anticipacion-tabla', filas: visitas.map((v) => ({ visita: v.desde, ventaja_visitas: v.ventaja_visitas, casos: v.casos, alertas: v.alertas, casos_detectados_pct: v.casos_detectados_pct, alertas_acertadas_pct: v.alertas_acertadas_pct })) }}>
                    <Tabla densa>
                      <thead><tr><th>Se calcula en</th><th>Ventaja (visitas)</th><th>Casos</th><th>Alertas</th><th>Casos detectados</th><th>Alertas acertadas</th></tr></thead>
                      <tbody>{visitas.map((v) => (
                        <tr key={v.desde}><td>{v.desde}</td><td>{num(v.ventaja_visitas)}</td><td>{v.casos == null ? N_MENOR_QUE_5 : num(v.casos)}</td>
                          <td>{num(v.alertas)}</td><td>{pctN(v.casos_detectados_pct)}</td><td>{pctN(v.alertas_acertadas_pct)}</td></tr>
                      ))}</tbody>
                    </Tabla>
                  </TablaDatos>
                </>
              )}
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
