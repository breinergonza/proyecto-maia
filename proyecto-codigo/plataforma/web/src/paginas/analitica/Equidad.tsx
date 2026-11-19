// Equidad (plan v3.7, 6.3.7): «Subgrupo por» elige el corte (sexo, edad gestacional, sede si el corte la trae…); para él,
// el bosque frente al total, la diferencia con marca bajo −0,05 y el mapa grupo × desenlace.
import { useState } from 'react'
import { useSubmodulo } from '../../api/analitica'
import type { DatosEquidad, DatosRendimiento, FilaSubgrupo } from '../../api/tipos'
import { Bosque, MapaCalor } from '../../components/graficos/equidad'
import { Grafica, TablaDatos } from '../../components/grafica'
import { Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { cn } from '../../lib/cn'
import { dec2, frase, num } from '../../lib/formato'
import { jerga, N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { Guia, ic, PorDesenlace, useNombreDesenlace, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

const pequeno = (f: FilaSubgrupo) => f.n < 5

/** Diferencia frente al total desde la que se marca un grupo (plan v3.7, 6.3.7). */
const MARCA = -0.05

export default function Equidad() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosEquidad>(entrenamiento, 'equidad', desenlace)
  const todos = useSubmodulo<DatosEquidad>(entrenamiento, 'equidad')   // todos los desenlaces, para el mapa
  const total = useSubmodulo<DatosRendimiento>(entrenamiento, 'rendimiento', desenlace).data?.desenlaces?.[desenlace ?? '']?.auc_desenlace?.auc ?? null
  const nombreDes = useNombreDesenlace()
  const { tecnico } = useTecnico()
  const [elegido, setElegido] = useState<string | null>(null)
  const dMapa = descripcionDe('equidad_mapa'), dGrupo = descripcionDe('equidad_grupo'), dDif = descripcionDe('equidad_diferencia')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Compara cómo funciona el modelo en cada grupo (por sexo, edad gestacional o sede). Si un grupo queda mucho peor que el total, el modelo puede estar fallando con esos niños.</p>
        <p>Una diferencia menor que −0,05 frente al total se marca para revisarla. Los grupos con menos de 5 niños no se muestran, para proteger su privacidad.</p>
      </Guia>
      <PorDesenlace consulta={consulta}>
        {(d) => {
          const grupos = Object.keys(d.subgrupos)
          if (!grupos.length) return <p className="text-salvia">No hay grupos con suficientes niños para este desenlace.</p>
          const por = elegido && grupos.includes(elegido) ? elegido : grupos[0]
          const filas = d.subgrupos[por] ?? []
          const nombreGrupo = (g: string) => frase(g.replaceAll('_', ' '))
          // un grupo que es solo un número (la sede 1, 2, 3) se nombra con su corte: «Sede 1»
          const g = (f: { grupo: string }) => (/^\d+$/.test(f.grupo) ? `${nombreGrupo(por)} ${f.grupo}` : f.grupo)
          const dif = (f: FilaSubgrupo) => (f.auc != null && total != null ? f.auc - total : null)
          // mapa grupo × desenlace con el grupo elegido; si el servidor no trae los demás desenlaces, solo el actual
          const otros = todos.data?.estado === 'ok' ? Object.entries(todos.data.desenlaces ?? {}) : []
          const columnas = otros.length > 1 ? otros : [[desenlace ?? '', d] as [string, DatosEquidad]]
          const nombresFila = filas.map((f) => f.grupo)
          return (
            <>
              <div role="group" aria-label="Subgrupo por" className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Subgrupo por</span>
                {grupos.map((g) => (
                  <button key={g} type="button" aria-pressed={g === por} onClick={() => setElegido(g)}
                    className={cn('rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
                      g === por ? 'border-teal bg-teal text-white' : 'border-linea bg-papel text-teal hover:bg-teal-tinte')}>
                    {nombreGrupo(g)}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <Grafica titulo={`${dGrupo.titulo}: ${nombreGrupo(por).toLowerCase()}`} descripcion={dGrupo.descripcion}>
                  <Bosque etiqueta="Qué tan bien ordena el modelo en cada grupo" referencia={total} nombreValor={jerga(tecnico, 'Ordena', 'AUC')}
                    puntos={filas.map((f) => ({ etiqueta: `${g(f)} · ${pequeno(f) ? N_MENOR_QUE_5 : `${num(f.n)} niños`}`, valor: f.auc, bajo: f.ic_bajo, alto: f.ic_alto, pequena: pequeno(f), nota: 'Pocos niños para calcularlo' }))} />
                  {total != null && <p className="mt-1 text-xs text-salvia">La línea punteada es el total del modelo ({dec2(total)}).</p>}
                </Grafica>
                <TablaDatos titulo={dDif.titulo} descripcion={`${dDif.descripcion} Menos de −0,05 se marca.`}
                  exportar={{ nombre: 'equidad-diferencia', filas: filas.map((f) => ({ subgrupo_por: nombreGrupo(por), grupo: f.grupo, ninos: f.n, casos: f.casos, auc: f.auc, diferencia_con_el_total: dif(f) != null ? Math.round((dif(f) as number) * 10000) / 10000 : null })) }}>
                  <Tabla densa>
                    <thead><tr><th>Grupo</th><th>Niños</th><th>Casos</th><th>{jerga(tecnico, 'Ordena', 'AUC (IC)')}</th><th>Diferencia</th></tr></thead>
                    <tbody>
                      {filas.map((f) => {
                        const x = dif(f), malo = x != null && x < MARCA && !pequeno(f)
                        return (
                          <tr key={f.grupo}>
                            <td>{g(f)}</td>
                            <td>{pequeno(f) ? N_MENOR_QUE_5 : num(f.n)}</td>
                            <td>{pequeno(f) || f.casos == null || f.casos < 5 ? N_MENOR_QUE_5 : num(f.casos)}</td>
                            <td>{pequeno(f) ? N_MENOR_QUE_5 : ic(f)}</td>
                            <td className={cn(malo && 'font-bold text-coral-hondo')}>
                              {pequeno(f) ? N_MENOR_QUE_5 : x != null ? `${x >= 0 ? '+' : '−'}${dec2(Math.abs(x))}` : '—'}
                              {malo && <span className="ml-1 text-xs">▼ revisar</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </Tabla>
                </TablaDatos>
              </div>
              <Grafica titulo={`${dMapa.titulo}: ${nombreGrupo(por).toLowerCase()} y desenlace`} descripcion={dMapa.descripcion}
                exportar={{ nombre: 'equidad-mapa', filas: nombresFila.flatMap((g) => columnas.map(([clave, datos]) => {
                  const f = datos.subgrupos?.[por]?.find((x) => x.grupo === g)
                  return { grupo: g, desenlace: nombreDes(clave).nombre, ninos: f?.n ?? null, auc: f && !pequeno(f) ? f.auc : null }
                })) }}>
                <MapaCalor etiqueta="Qué tan bien ordena por grupo y desenlace" escala={[0.5, 1]}
                  columnas={columnas.map(([clave]) => nombreDes(clave).nombre + (nombreDes(clave).enPrueba ? ' (En prueba)' : ''))}
                  filas={nombresFila.map((g) => ({
                    etiqueta: /^\d+$/.test(g) ? `${nombreGrupo(por)} ${g}` : g,
                    celdas: columnas.map(([, datos]) => {
                      const f = datos.subgrupos?.[por]?.find((x) => x.grupo === g)
                      return { valor: f?.auc ?? null, pequena: !f || pequeno(f), texto: f?.auc != null ? dec2(f.auc) : '—' }
                    }),
                  }))} />
              </Grafica>
            </>
          )
        }}
      </PorDesenlace>
    </div>
  )
}
