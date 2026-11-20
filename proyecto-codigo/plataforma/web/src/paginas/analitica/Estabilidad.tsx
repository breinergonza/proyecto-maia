// Estabilidad temporal (plan v3.7, 6.3.8): qué tan bien ordena por trimestre con su banda y el mínimo aceptable (0,80),
// alertas por cada 1.000 niños y cuánto cambió la población (PSI con semáforo). Un aviso arriba resume si conviene reentrenar.
// Tres pestañas (?ver=): las dos gráficas por trimestre, sus cifras y el cambio de la población; el aviso queda sobre todas.
import { useSubmodulo } from '../../api/analitica'
import type { DatosEstabilidad } from '../../api/tipos'
import { SerieTrimestral } from '../../components/graficos'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Aviso, Tabla } from '../../components/ui'
import { PanelPestana, Pestanas, usePestanaEnUrl } from '../../components/ui/Pestanas'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num } from '../../lib/formato'
import { jerga, N_MENOR_QUE_5, nombreVariable, variable } from '../../lib/lenguaje'
import { Guia, ic, PorDesenlace, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

/** Mínimo aceptable de «qué tan bien ordena» por trimestre (plan: 0,80 por defecto). */
const MINIMO_AUC = 0.8

const colorPsi = (v: number | null) =>
  v == null ? undefined : v >= 0.25 ? 'var(--color-coral-tinte)' : v >= 0.1 ? 'var(--color-ocre-tinte)' : 'var(--color-teal-tinte)'

const PESTANAS = [
  { clave: 'trimestre', texto: 'Por trimestre' },
  { clave: 'datos', texto: 'Datos por trimestre' },
  { clave: 'poblacion', texto: 'Cambio de la población' },
] as const
const CLAVES = PESTANAS.map((p) => p.clave)
/** El contenido de una pestaña ocupa el alto que queda: las tarjetas con lista (`llenar`) se encogen y la desplazan por dentro. */
const PANEL = 'mt-3 flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:-mx-1 lg:overflow-y-auto lg:px-1 lg:pb-1'
/** Encabezado de columna fijo mientras la tabla se desplaza dentro de su tarjeta. */
const ENCABEZADO_FIJO = 'xl:overflow-visible [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-papel'

export default function Estabilidad() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosEstabilidad>(entrenamiento, 'estabilidad', desenlace)
  const { tecnico } = useTecnico()
  const [ver, elegir] = usePestanaEnUrl('ver', CLAVES)
  const dTri = descripcionDe('estab_trimestre'), dPsi = descripcionDe('psi'), dAl = descripcionDe('alertas_1000')
  return (
    <div className="flex flex-col lg:min-h-0 lg:flex-1">
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
          const maxPsi = (fila: Record<string, number | null>) => Math.max(0, ...Object.values(fila).map((v) => v ?? 0))
          const ordenadas = Object.entries(psi).sort(([, a], [, b]) => maxPsi(b) - maxPsi(a))
          const muchoCambio = ordenadas.filter(([, f]) => maxPsi(f) > 0.25).length
          const recientes = tri.filter((t) => t.auc != null).slice(-2)
          const bajoMinimo = recientes.some((t) => (t.auc as number) < MINIMO_AUC)
          return (
            <>
              {(muchoCambio > 0 || bajoMinimo) && (
                <Aviso tono={muchoCambio > ordenadas.length / 2 || bajoMinimo ? 'coral' : 'teal'}>
                  <b>{muchoCambio > ordenadas.length / 2 || bajoMinimo ? 'Reentrenar recomendado. ' : 'Vigilar. '}</b>
                  {muchoCambio > 0 && `La población cambió mucho frente a los niños del entrenamiento en ${muchoCambio} de ${ordenadas.length} datos. `}
                  {bajoMinimo ? `En los últimos trimestres el modelo ordena por debajo del mínimo (${dec2(MINIMO_AUC)}).` : recientes.length ? 'El modelo todavía ordena por encima del mínimo en los últimos trimestres.' : ''}
                </Aviso>
              )}
              <Pestanas className={muchoCambio > 0 || bajoMinimo ? 'mt-3' : undefined} prefijo="estabilidad" etiqueta="Qué ver" pestanas={PESTANAS} activa={ver} elegir={elegir} />
              <PanelPestana prefijo="estabilidad" activa={ver} className={PANEL}>
                {ver === 'trimestre' && (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {tri.length > 0 && (
                      <Grafica titulo={dTri.titulo} descripcion={dTri.descripcion}
                        exportar={{ nombre: 'estabilidad-trimestre', filas: tri.map((t) => ({ trimestre: t.trimestre, ninos: t.n, casos: t.casos, auc: t.auc, ic_bajo: t.ic_bajo, ic_alto: t.ic_alto })) }}>
                        <SerieTrimestral etiqueta="Qué tan bien ordena el modelo en cada trimestre" alto={280} dominioY={[0.4, 1]} formatoY={(v) => dec2(v)}
                          nombre={jerga(tecnico, 'Qué tan bien ordena', 'AUC')} minimo={MINIMO_AUC} textoMinimo={`Mínimo ${dec2(MINIMO_AUC)}`}
                          puntos={tri.map((t) => ({ trimestre: t.trimestre, valor: t.auc, bajo: t.ic_bajo, alto: t.ic_alto }))} />
                        <p className="mt-1 text-xs text-salvia">La banda es la incertidumbre; «…» marca trimestres sin niños. Las cifras de cada trimestre están en «Datos por trimestre».</p>
                      </Grafica>
                    )}
                    {al.length > 0 && (
                      <Grafica titulo={dAl.titulo} descripcion={dAl.descripcion}
                        exportar={{ nombre: 'estabilidad-alertas', filas: al.map((a) => ({ trimestre: a.trimestre, ninos: a.n, alertas: a.alertas, alertas_por_1000: a.alertas_por_1000, casos: a.casos })) }}>
                        <SerieTrimestral etiqueta="Alertas por cada mil niños en cada trimestre" alto={280} formatoY={(v) => num(v)} color={1}
                          nombre="Alertas por 1.000 niños" puntos={al.map((a) => ({ trimestre: a.trimestre, valor: a.alertas_por_1000 }))} />
                        <p className="mt-1 text-xs text-salvia">Con la regla del 10 % se esperan unas 100 alertas por cada 1.000 niños; por encima, el riesgo subió en la población.</p>
                      </Grafica>
                    )}
                    {tri.length === 0 && al.length === 0 && <p className="text-salvia">Todavía no hay trimestres con niños para mostrar.</p>}
                  </div>
                )}
                {ver === 'datos' && (tri.length === 0 ? <p className="text-salvia">Todavía no hay trimestres con niños para mostrar.</p> : (
                  <TablaDatos llenar className="xl:max-w-4xl" titulo="Datos de cada trimestre"
                    descripcion="Niños, casos y qué tan bien ordena el modelo en cada trimestre; con menos de 5 casos no se muestra la cifra.">
                    <Tabla densa className={ENCABEZADO_FIJO}>
                      <thead><tr><th>Trimestre</th><th>Niños</th><th>Casos</th><th>{jerga(tecnico, 'Qué tan bien ordena', 'AUC (IC)')}</th></tr></thead>
                      <tbody>{tri.map((t) => <tr key={t.trimestre}><td>{t.trimestre}</td><td>{num(t.n)}</td><td>{t.casos == null || t.casos < 5 ? N_MENOR_QUE_5 : num(t.casos)}</td><td>{t.auc == null ? 'Pocos niños' : ic(t)}</td></tr>)}</tbody>
                    </Tabla>
                  </TablaDatos>
                ))}
                {ver === 'poblacion' && (
                  <TablaDatos llenar titulo={dPsi.titulo} descripcion={dPsi.descripcion}
                    exportar={{ nombre: 'estabilidad-psi', filas: Object.entries(psi).map(([v, fila]) => ({ dato: nombreVariable(v), ...fila })) }}>
                    <p className="mb-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-md bg-teal-tinte px-2 py-0.5 text-teal">Estable: menos de 0,10</span>
                      <span className="rounded-md bg-ocre-tinte px-2 py-0.5 text-ocre-hondo">Vigilar: 0,10 a 0,25</span>
                      <span className="rounded-md bg-coral-tinte px-2 py-0.5 font-semibold text-coral-hondo">Reentrenar: más de 0,25</span>
                      {tecnico && <span className="text-salvia">(PSI)</span>}
                      <span className="text-salvia">Ordenado de más a menos cambio.</span>
                    </p>
                    {Object.keys(psi).length === 0 ? <p className="text-salvia">Se necesitan al menos dos trimestres con 20 niños o más para comparar.</p> : (
                      <Tabla densa className={ENCABEZADO_FIJO}>
                        <thead><tr><th>Dato</th>{trimestres.map((t) => <th key={t}>{t}</th>)}</tr></thead>
                        <tbody>
                          {ordenadas.map(([v, fila]) => (
                            <tr key={v}><td>{variable(tecnico, v)}</td>{trimestres.map((t) => (
                              <td key={t} style={{ background: colorPsi(fila[t] ?? null) }}>{fila[t] == null ? '—' : tecnico ? fila[t] : dec2(fila[t])}</td>
                            ))}</tr>
                          ))}
                        </tbody>
                      </Tabla>
                    )}
                  </TablaDatos>
                )}
              </PanelPestana>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
