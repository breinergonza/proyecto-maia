// Estabilidad: si el modelo y los datos se mantienen de un trimestre a otro.
import { useSubmodulo } from '../../api/analitica'
import type { DatosEstabilidad } from '../../api/tipos'
import { LineasSeries } from '../../components/graficos'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num } from '../../lib/formato'
import { jerga, N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { Guia, ic, PorDesenlace, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

const colorPsi = (v: number | null) =>
  v == null ? undefined : v >= 0.25 ? 'var(--color-coral-tinte)' : v >= 0.1 ? 'var(--color-ocre-tinte)' : 'var(--color-teal-tinte)'

export default function Estabilidad() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosEstabilidad>(entrenamiento, 'estabilidad', desenlace)
  const { tecnico } = useTecnico()
  const dTri = descripcionDe('estab_trimestre'), dPsi = descripcionDe('psi'), dAl = descripcionDe('alertas_1000')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Revisa si el modelo se mantiene con el tiempo. Si en un trimestre ordena claramente peor, o si los datos de los niños cambiaron mucho frente al entrenamiento, conviene revisarlo.</p>
        <p>En el cuadro de cambios, más oscuro y más rojo es más cambio frente a los niños del entrenamiento.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(d) => {
          const tri = d.metricas_trimestre ?? []
          const al = d.alertas_trimestre ?? []
          const psi = d.psi?.variables ?? {}
          const trimestres = d.psi?.trimestres ?? []
          return (
            <>
              {tri.length > 0 && (
                <Grafica titulo={dTri.titulo} descripcion={dTri.descripcion}
                  exportar={{ nombre: 'estabilidad-trimestre', filas: tri.map((t) => ({ trimestre: t.trimestre, ninos: t.n, casos: t.casos, auc: t.auc, ic_bajo: t.ic_bajo, ic_alto: t.ic_alto })) }}>
                  <LineasSeries etiqueta="Qué tan bien ordena el modelo en cada trimestre" alto={240} dominioY={[0.4, 1]} formatoY={(v) => dec2(v)}
                    series={[{ clave: 'auc', nombre: jerga(tecnico, 'Qué tan bien ordena', 'AUC'), color: 0 }]}
                    filas={tri.map((t) => ({ x: t.trimestre, auc: t.auc }))} />
                  <Tabla densa className="mt-3">
                    <thead><tr><th>Trimestre</th><th>Niños</th><th>Casos</th><th>{jerga(tecnico, 'Qué tan bien ordena', 'AUC (IC)')}</th></tr></thead>
                    <tbody>{tri.map((t) => <tr key={t.trimestre}><td>{t.trimestre}</td><td>{num(t.n)}</td><td>{t.casos == null || t.casos < 5 ? N_MENOR_QUE_5 : num(t.casos)}</td><td>{t.auc == null ? 'Pocos niños' : ic(t)}</td></tr>)}</tbody>
                  </Tabla>
                </Grafica>
              )}
              {al.length > 0 && (
                <Grafica titulo={dAl.titulo} descripcion={dAl.descripcion}
                  exportar={{ nombre: 'estabilidad-alertas', filas: al.map((a) => ({ trimestre: a.trimestre, ninos: a.n, alertas: a.alertas, alertas_por_1000: a.alertas_por_1000, casos: a.casos })) }}>
                  <LineasSeries etiqueta="Alertas por cada mil niños en cada trimestre" alto={220} formatoY={(v) => num(v)}
                    series={[{ clave: 'alertas', nombre: 'Alertas por 1.000 niños', color: 1 }]}
                    filas={al.map((a) => ({ x: a.trimestre, alertas: a.alertas_por_1000 }))} />
                </Grafica>
              )}
              <TablaDatos titulo={dPsi.titulo} descripcion={dPsi.descripcion}
                exportar={{ nombre: 'estabilidad-psi', filas: Object.entries(psi).map(([v, fila]) => ({ dato: v, ...fila })) }}>
                {Object.keys(psi).length === 0 ? <p className="text-salvia">Se necesitan al menos dos trimestres con 20 niños o más para comparar.</p> : (
                  <Tabla densa>
                    <thead><tr><th>Dato</th>{trimestres.map((t) => <th key={t}>{t}</th>)}</tr></thead>
                    <tbody>
                      {Object.entries(psi).map(([v, fila]) => (
                        <tr key={v}><td>{v}</td>{trimestres.map((t) => (
                          <td key={t} style={{ background: colorPsi(fila[t] ?? null) }}>{fila[t] == null ? '—' : tecnico ? fila[t] : dec2(fila[t])}</td>
                        ))}</tr>
                      ))}
                    </tbody>
                  </Tabla>
                )}
                <p className="mt-2 text-xs text-salvia">Cambio frente al entrenamiento{tecnico ? ' (PSI)' : ''}: menos de 0,10 poco; hasta 0,25 a vigilar; más, mucho.</p>
              </TablaDatos>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
