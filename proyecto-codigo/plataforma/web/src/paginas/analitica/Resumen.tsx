// Resumen: por desenlace, qué tan bien ordena el modelo (con su incertidumbre) y los semáforos con la regla a la vista.
import { useSubmodulo } from '../../api/analitica'
import type { DatosResumen } from '../../api/tipos'
import { Bosque } from '../../components/graficos/equidad'
import { Grafica } from '../../components/grafica'
import { Insignia, Panel } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2 } from '../../lib/formato'
import { jerga, SEMAFORO } from '../../lib/lenguaje'
import { EnPrueba, Guia, ic, muestraDe, Resultado, useNombreDesenlace, useTecnico } from './comun'
import { useContextoAnalitica } from './contexto'

const TONO = { verde: 'teal', ambar: 'ocre', rojo: 'coral', gris: 'neutro' } as const

export default function Resumen() {
  const { entrenamiento } = useContextoAnalitica()
  const consulta = useSubmodulo<DatosResumen>(entrenamiento, 'resumen')
  const nombre = useNombreDesenlace()
  const { tecnico } = useTecnico()
  const ordena = descripcionDe('ordena_por_desenlace')
  const semaforos = descripcionDe('resumen_semaforos')
  return (
    <div className="space-y-4">
      <Guia>
        <p>Cada tarjeta es un desenlace. La cifra grande dice qué tan bien el modelo pone primero a los niños que sí tendrán el desenlace; 1 sería perfecto y 0,5 sería lo mismo que tirar una moneda.</p>
        <p>Los semáforos resumen si se puede confiar en el modelo; la regla de cada color está escrita debajo.</p>
      </Guia>
      <Resultado consulta={consulta}>
        {(r) => {
          const claves = Object.keys(r.desenlaces ?? {})
          const filas = claves.map((c) => ({ clave: c, ...(r.desenlaces?.[c] ?? {}) }))
          return (
            <>
              <Grafica titulo={ordena.titulo} descripcion={ordena.descripcion}
                exportar={{ nombre: 'resumen-ordena', filas: filas.map((f) => ({ desenlace: nombre(f.clave).nombre, auc: f.auc ?? null, ic_bajo: f.ic_bajo ?? null, ic_alto: f.ic_alto ?? null, n: f.n ?? null, casos: f.casos ?? null })) }}>
                <Bosque etiqueta="Qué tan bien ordena el modelo, por desenlace" nombreValor={jerga(tecnico, 'Ordena', 'AUC')}
                  puntos={filas.map((f) => ({ etiqueta: nombre(f.clave).nombre + (nombre(f.clave).enPrueba ? ' (En prueba)' : ''), valor: f.auc ?? null, bajo: f.ic_bajo ?? null, alto: f.ic_alto ?? null }))} />
              </Grafica>
              <Panel titulo={semaforos.titulo} descripcion={semaforos.descripcion}>
                <div className="grid gap-4 lg:grid-cols-2">
                  {filas.map((f) => {
                    const d = nombre(f.clave)
                    return (
                      <article key={f.clave} aria-label={d.nombre} className="rounded-panel border border-linea p-4">
                        <header className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base">{d.nombre}</h3>{d.enPrueba && <EnPrueba />}
                        </header>
                        <p className="mt-2 text-2xl font-bold text-teal">{f.auc != null ? dec2(f.auc) : '—'}</p>
                        <p className="text-sm text-salvia">
                          {jerga(tecnico, 'Qué tan bien ordena a los niños', 'AUC con intervalo de confianza')}: {ic({ auc: f.auc ?? null, ic_bajo: f.ic_bajo ?? null, ic_alto: f.ic_alto ?? null })}
                        </p>
                        <p className="text-sm text-salvia">{muestraDe(f.n, f.casos)}</p>
                        <ul className="mt-3 space-y-2">
                          {(f.semaforos ?? []).map((s) => (
                            <li key={s.id} className="rounded-control bg-fondo p-2 text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <Insignia tono={TONO[s.estado]}>{SEMAFORO[s.estado]}</Insignia>
                                <span className="font-semibold">{s.nombre}</span>
                                {s.valor != null && <span className="text-salvia">{tecnico ? s.valor : dec2(s.valor)}</span>}
                              </div>
                              <p className="mt-1 text-salvia">{s.detalle}</p>
                              <p className="text-xs text-salvia">Regla: {s.umbral}</p>
                            </li>
                          ))}
                        </ul>
                      </article>
                    )
                  })}
                </div>
              </Panel>
            </>
          )
        }}
      </Resultado>
    </div>
  )
}
