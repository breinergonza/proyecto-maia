// Perfiles: grupos de niños parecidos y su proporción con riesgo alto. Por ahora son provisionales (edad gestacional y
// Lubchenco): ningún experto los ha aprobado. Una categoría con menos de 5 niños no enseña ninguna cifra.
import { useState } from 'react'
import { usePerfiles } from '../../api/analitica'
import type { FilaPerfil } from '../../api/tipos'
import { Grafica } from '../../components/grafica'
import { Aviso, Cifra, Panel } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec, num, pct } from '../../lib/formato'
import { N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { Guia } from './comun'
import { useContextoAnalitica } from './contexto'
import { ResultadoVivo } from './vivo'

type Clave = 'eg' | 'lubchenco'
const TIPOS: [Clave, string][] = [['eg', 'Por edad gestacional'], ['lubchenco', 'Por Lubchenco']]

function Tarjeta({ f, unidadPeso }: { f: FilaPerfil; unidadPeso?: string | null }) {
  const oculto = f.oculto || f.n == null
  return (
    <li className="rounded-panel border border-linea bg-papel p-4">
      <h3 className="font-semibold">{f.etiqueta}</h3>
      {oculto ? <p className="mt-2 text-sm text-salvia">{N_MENOR_QUE_5}</p> : (
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-salvia">Niños</dt><dd className="font-semibold">{num(f.n)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-salvia">Con riesgo alto</dt><dd className="font-semibold">{f.tasa == null ? N_MENOR_QUE_5 : pct(100 * f.tasa)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-salvia">Edad gestacional media</dt><dd>{f.eg_media == null ? N_MENOR_QUE_5 : `${dec(f.eg_media)} semanas`}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-salvia">Peso medio al nacer</dt><dd>{f.peso_medio == null ? N_MENOR_QUE_5 : `${dec(f.peso_medio)}${unidadPeso ? ` ${unidadPeso}` : ''}`}</dd></div>
        </dl>
      )}
    </li>
  )
}

export default function Perfiles() {
  const { entrenamiento, desenlace } = useContextoAnalitica()
  const consulta = usePerfiles(entrenamiento, desenlace)
  const [clave, setClave] = useState<Clave>('eg')
  const d = descripcionDe('perfiles'), dDist = descripcionDe('perfiles_distinguen'), dConf = descripcionDe('perfiles_confiables')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Agrupa a los niños parecidos entre sí y muestra qué proporción de cada grupo tiene riesgo alto del desenlace elegido.</p>
        <p>Un perfil se considera confiable cuando se repite y lo aprobaron los expertos.</p>
      </Guia>
      <ResultadoVivo consulta={consulta}>
        {(r) => {
          const filas = r[clave] ?? []
          const unidad = r.unidad_peso ?? undefined
          return (
            <>
              <div role="group" aria-label="Tipo de perfil" className="flex flex-wrap gap-2">
                {TIPOS.map(([k, t]) => (
                  <button key={k} type="button" aria-pressed={clave === k} onClick={() => setClave(k)}
                    className={`h-10 rounded-control border px-4 text-sm font-semibold ${clave === k ? 'border-teal bg-teal text-papel' : 'border-linea bg-papel'}`}>{t}</button>
                ))}
              </div>
              <Grafica titulo={d.titulo} descripcion={d.descripcion} exportar={{
                nombre: `perfiles-${clave}`, muestra: r.ninos != null ? `${r.ninos} niños` : undefined,
                filas: filas.map((f) => ({ perfil: f.etiqueta, ninos: f.oculto ? N_MENOR_QUE_5 : f.n, con_riesgo_alto_pct: f.oculto || f.tasa == null ? null : Math.round(1000 * f.tasa) / 10,
                  eg_media_semanas: f.eg_media ?? null, peso_medio: f.peso_medio ?? null })),
              }}>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{filas.map((f) => <Tarjeta key={f.categoria} f={f} unidadPeso={unidad} />)}</ul>
                <p className="mt-3 text-xs text-salvia">Con riesgo alto: {r.tasa_significa ?? 'proporción de niños con riesgo alto del desenlace elegido'}. {dDist.descripcion}</p>
                {(r.categorias_ocultas ?? 0) > 0 && <p className="mt-1 text-xs text-salvia">{r.categorias_ocultas} categoría(s): {N_MENOR_QUE_5}.</p>}
              </Grafica>
              <Panel titulo={dConf.titulo} descripcion={dConf.descripcion}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Cifra valor={r.confianza?.minimo_ninos ?? 5} texto="Niños mínimos para mostrar un perfil" />
                  <Cifra valor={r.confianza?.aprobacion === 'pendiente' || !r.confianza ? 'Pendiente' : r.confianza.aprobacion} texto="Aprobación de los expertos" />
                </div>
                <Aviso tono="teal">Aún no hay perfiles reales aprobados por los expertos. Estos perfiles son provisionales.</Aviso>
              </Panel>
            </>
          )
        }}
      </ResultadoVivo>
    </div>
  )
}
