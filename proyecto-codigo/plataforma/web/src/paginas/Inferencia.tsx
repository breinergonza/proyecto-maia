// Calcular un niño con el paquete activo, sin guardar nada: útil para probar el modelo o un caso puntual.
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorApi, pedir } from '../api/cliente'
import type { PeticionInferencia, ResultadoInferencia } from '../api/tipos'
import { Aviso, Boton, Encabezado, Insignia, Panel, Tabla, Texto, Vacio } from '../components/ui'
import { usePaqueteActivo } from '../lib/consultas'
import { CAPAS, dec2, edad, indicador, posicion, riesgo } from '../lib/formato'

export default function Inferencia() {
  const activo = usePaqueteActivo()
  const [texto, setTexto] = useState('')
  const [errorJson, setErrorJson] = useState<string | null>(null)

  const ejemplo = useMutation({
    mutationFn: () => pedir<PeticionInferencia & { nota: string }>('/inferencia/ejemplo'),
    onSuccess: ({ nota: _nota, ...p }) => setTexto(JSON.stringify(p, null, 2)),
  })
  const calcular = useMutation({
    mutationFn: (p: unknown) => pedir<ResultadoInferencia>('/inferencia', { cuerpo: p }),
  })

  const enviar = () => {
    setErrorJson(null)
    try {
      calcular.mutate(JSON.parse(texto))
    } catch (e) {
      setErrorJson(`El texto no es JSON válido: ${(e as Error).message}`)
    }
  }

  if (activo.data === null) {
    return (
      <>
        <Encabezado titulo="Calcular un niño" />
        <Vacio titulo="No hay un paquete de modelos activo">La administración debe subir y activar uno en Modelos.</Vacio>
      </>
    )
  }

  const r = calcular.data
  return (
    <>
      <Encabezado titulo="Calcular un niño">
        Escriba los datos de uno o varios niños (hasta 50) y vea los datos raros, el crecimiento y el riesgo que calcula el
        paquete {activo.data?.version ?? ''}. No se guarda nada.
      </Encabezado>
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Panel titulo="Datos de entrada"
          accion={<Boton chico variante="secundario" onClick={() => ejemplo.mutate()} disabled={ejemplo.isPending}>Cargar un niño de ejemplo</Boton>}>
          <p className="mb-2 text-sm text-salvia">
            Formato JSON con <code>sujetos</code>, <code>mediciones</code> y, si hay, <code>episodios</code>, con los nombres de
            variable del diccionario. El ejemplo es un niño simulado.
          </p>
          <label className="sr-only" htmlFor="peticion">Petición en JSON</label>
          <Texto id="peticion" rows={22} spellCheck={false} className="font-[ui-monospace,monospace] text-xs" value={texto}
            onChange={(e) => setTexto(e.target.value)} placeholder='{"sujetos": [...], "mediciones": [...]}' />
          <div className="mt-3 flex items-center gap-3">
            <Boton onClick={enviar} disabled={!texto.trim() || calcular.isPending}>{calcular.isPending ? 'Calculando…' : 'Calcular'}</Boton>
          </div>
          {(errorJson || ejemplo.error || calcular.error) && (
            <div className="mt-3"><Aviso>{errorJson ?? (ejemplo.error ?? calcular.error)?.message}</Aviso></div>
          )}
          {calcular.error instanceof ErrorApi && calcular.error.estado === 409 && (
            <p className="mt-2 text-sm text-salvia">Active un paquete en Modelos y vuelva a intentar.</p>
          )}
        </Panel>

        <div className="space-y-4">
          {!r ? <Vacio titulo="Aquí aparecerá el resultado">Cargue el ejemplo y pulse Calcular para ver cómo se ve.</Vacio> : (
            <>
              {r.variables_ignoradas.length > 0 && (
                <Aviso tono="teal">No se usaron estas variables porque el modelo no las conoce: {r.variables_ignoradas.join(', ')}.</Aviso>
              )}
              <Panel titulo="Riesgo en la última visita">
                {r.riesgos.length === 0 ? <p className="text-salvia">Con estos datos no se alcanza a calcular ningún desenlace.</p> : (
                  <ul className="divide-y divide-linea">
                    {r.riesgos.map((x) => (
                      <li key={`${x.sujeto}-${x.clave}`} className="py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-semibold">{x.desenlace} <span className="font-normal text-salvia">· {x.sujeto}</span></span>
                          <span>{riesgo(x.riesgo)} {x.percentil >= 90 ? <Insignia tono="coral">posición {posicion(x.percentil)}</Insignia> : <Insignia>posición {posicion(x.percentil)}</Insignia>}</span>
                        </div>
                        {x.motivos.length > 0 && <p className="mt-1 text-sm text-salvia">{x.motivos.join('; ')}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel titulo="Datos raros">
                {r.alertas_dato.length === 0 ? <p className="text-salvia">Ningún dato quedó marcado.</p> : (
                  <Tabla>
                    <thead><tr><th>Dato</th><th className="text-right">Valor</th><th className="text-right">Esperado</th><th>Capas</th></tr></thead>
                    <tbody>{r.alertas_dato.map((a, i) => (
                      <tr key={i}>
                        <td>{a.etiqueta ?? a.variable}</td>
                        <td className="text-right font-semibold text-coral-hondo">{a.valor}</td>
                        <td className="text-right">{a.rango_bajo != null ? `${dec2(a.rango_bajo)} a ${dec2(a.rango_alto)}` : '—'}</td>
                        <td>{a.capas.map((c) => CAPAS[c] ?? c).join(', ')}</td>
                      </tr>
                    ))}</tbody>
                  </Tabla>
                )}
              </Panel>
              <Panel titulo="Crecimiento (puntaje z OMS)">
                {r.crecimiento.length === 0 ? <p className="text-salvia">Sin medidas de crecimiento.</p> : (
                  <Tabla>
                    <thead><tr><th>Medida</th><th className="text-right">Edad corregida</th><th className="text-right">z</th><th></th></tr></thead>
                    <tbody>{r.crecimiento.map((c, i) => (
                      <tr key={i}>
                        <td>{indicador(c.indicador)}</td>
                        <td className="text-right">{edad(c.edad_corregida)}</td>
                        <td className="text-right">{dec2(c.z)}</td>
                        <td>{c.bajo_2de && <Insignia tono="ocre">Bajo −2 DE</Insignia>} {c.caida_1de && <Insignia>Caída</Insignia>} {c.improbable && <Insignia tono="coral">Improbable</Insignia>}</td>
                      </tr>
                    ))}</tbody>
                  </Tabla>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>
    </>
  )
}
