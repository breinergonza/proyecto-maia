// Armar una muestra para entrenar: quién entra (filtros con casillas), de cuándo (fecha que manda y período), cuántos
// (todos o un tope por grupo) y la muestra que resulta, al instante. «Guardar y entrenar» guarda la muestra (queda
// fija, D3) y pone el entrenamiento en la cola con ella. Los filtros viven en la dirección, como en Explorar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorApi, pedir } from '../api/cliente'
import { useFacetasExplorar } from '../api/exploracion'
import type { MuestraGuardada } from '../api/tipos'
import { descripcionDe } from '../lib/descripciones'
import { num } from '../lib/formato'
import { useFiltros } from '../lib/useFiltros'
import { PanelFacetas } from './PanelFacetas'
import { Aviso, Boton, Campo, Cifra, Entrada, Panel, Selector, Texto } from './ui'

/** Con menos niños que esto el entrenamiento avisa: los modelos salen poco confiables. */
export const MINIMO_RECOMENDADO = 200

type CampoFecha = 'fecha_nacimiento' | 'anio_nacimiento'
type Conteo = { n: number; n_base: number; minimo: number; suficiente: boolean }
const FECHA_VALIDA = /^\d{4}(-\d{2}(-\d{2})?)?$/

export function avisosDeMuestra(n: number, minimo: number): string[] {
  const avisos: string[] = []
  if (n < minimo) avisos.push(`Con menos de ${minimo} niños no se guarda una muestra: esta da ${n}.`)
  else if (n < MINIMO_RECOMENDADO) {
    avisos.push(`Son pocos niños (${n}, menos de ${MINIMO_RECOMENDADO}): los modelos pueden salir poco confiables.`)
  }
  if (n < 1000) avisos.push('Con pocos niños, los desenlaces con muy pocos casos se quedan sin modelo.')
  return avisos
}

export function ConstructorMuestra({ fuente, nombre, bloqueado, alTerminar, alCerrar }: {
  fuente: 'kmc' | 'simulado'; nombre?: string; bloqueado?: boolean; alTerminar: () => void; alCerrar: () => void
}) {
  const filtros = useFiltros()
  const cliente = useQueryClient()
  const [campo, setCampo] = useState<CampoFecha>('anio_nacimiento')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [modo, setModo] = useState<'todos' | 'estratificado'>('todos')
  const [por, setPor] = useState('sede')
  const [tope, setTope] = useState('500')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const fechaMala = [desde, hasta].some((t) => t.trim() !== '' && !FECHA_VALIDA.test(t.trim()))
  const topeNum = Number(tope)
  const topeMalo = modo === 'estratificado' && !(Number.isInteger(topeNum) && topeNum >= 1)
  const muestra = {
    version: 2 as const,
    y: filtros.entradas,
    ...(desde.trim() || hasta.trim()
      ? { tiempo: { fecha: campo, modo: 'periodo', ...(desde.trim() ? { desde: desde.trim() } : {}), ...(hasta.trim() ? { hasta: hasta.trim() } : {}) } }
      : {}),
    muestreo: modo === 'estratificado' ? { modo, por, maximo_por_categoria: topeNum, semilla: 0 } : { modo: 'todos' },
  }

  const facetas = useFacetasExplorar({ muestra: filtros.muestra })
  const conteo = useQuery({
    queryKey: ['muestras', 'contar', muestra],
    queryFn: () => pedir<Conteo>('/muestras/contar', { metodo: 'POST', cuerpo: { muestra } }),
    enabled: !fechaMala && !topeMalo,
  })
  const categoricas = Object.entries(facetas.data?.facetas ?? {}).filter(([k, f]) => k !== 'sede' && f.tipo !== 'numero')

  const guardarYEntrenar = useMutation({
    mutationFn: async () => {
      const guardada = await pedir<MuestraGuardada>('/muestras', {
        metodo: 'POST', cuerpo: { titulo: titulo.trim(), descripcion: descripcion.trim() || null, muestra },
      })
      await pedir('/entrenamientos/entrenar', {
        cuerpo: { fuente, nombre: nombre?.trim() || titulo.trim(), descripcion: descripcion.trim() || null, muestra_id: guardada.id },
      })
    },
    onSuccess: () => { void cliente.invalidateQueries({ queryKey: ['muestras'] }); alTerminar() },
  })

  const n = conteo.data?.n
  const minimo = conteo.data?.minimo ?? 20
  const avisos = n === undefined ? [] : avisosDeMuestra(n, minimo)
  const puedeGuardar = !!titulo.trim() && n !== undefined && n >= minimo && !fechaMala && !topeMalo && !bloqueado
  const dMuestra = descripcionDe('armar_muestra')
  const dResultante = descripcionDe('muestra_resultante')

  return (
    <Panel titulo={dMuestra.titulo} descripcion={dMuestra.descripcion}
      accion={<Boton variante="fantasma" chico onClick={alCerrar}>Cerrar</Boton>}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <PanelFacetas facetas={facetas.data} cargando={facetas.isPending} filtros={filtros} esExperto={false} />

        <div className="flex flex-col gap-4">
          <fieldset className="grid gap-3 rounded-control border border-linea p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-semibold">Tiempo</legend>
            <Campo id="cm-campo" etiqueta="Fecha que manda">
              <Selector id="cm-campo" value={campo} onChange={(e) => setCampo(e.target.value as CampoFecha)}>
                <option value="anio_nacimiento">Año de nacimiento</option>
                <option value="fecha_nacimiento">Fecha de nacimiento</option>
              </Selector>
            </Campo>
            <Campo id="cm-desde" etiqueta="Desde" ayuda="AAAA, AAAA-MM o AAAA-MM-DD">
              <Entrada id="cm-desde" placeholder="2018" value={desde} onChange={(e) => setDesde(e.target.value)} aria-invalid={fechaMala || undefined} />
            </Campo>
            <Campo id="cm-hasta" etiqueta="Hasta" error={fechaMala ? 'Escriba la fecha como AAAA, AAAA-MM o AAAA-MM-DD.' : undefined}>
              <Entrada id="cm-hasta" placeholder="2022" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-invalid={fechaMala || undefined} />
            </Campo>
          </fieldset>

          <fieldset className="grid gap-3 rounded-control border border-linea p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-semibold">Muestreo</legend>
            <Campo id="cm-modo" etiqueta="Cuántos niños">
              <Selector id="cm-modo" value={modo} onChange={(e) => setModo(e.target.value as 'todos' | 'estratificado')}>
                <option value="todos">Todos los que cumplen</option>
                <option value="estratificado">Un tope por grupo</option>
              </Selector>
            </Campo>
            {modo === 'estratificado' && (
              <>
                <Campo id="cm-por" etiqueta="Grupos según">
                  <Selector id="cm-por" value={por} onChange={(e) => setPor(e.target.value)}>
                    <option value="sede">Sede</option>
                    {categoricas.map(([k, f]) => <option key={k} value={k}>{f.etiqueta}</option>)}
                  </Selector>
                </Campo>
                <Campo id="cm-tope" etiqueta="Máximo por grupo" error={topeMalo ? 'Escriba un número entero mayor que cero.' : undefined}>
                  <Entrada id="cm-tope" inputMode="numeric" value={tope} onChange={(e) => setTope(e.target.value)} aria-invalid={topeMalo || undefined} />
                </Campo>
              </>
            )}
          </fieldset>

          <section aria-label={dResultante.titulo} className="rounded-control bg-teal-tinte p-3" aria-live="polite">
            <h3 className="text-sm font-semibold">{dResultante.titulo}</h3>
            <p className="text-sm text-salvia">{dResultante.descripcion}</p>
            {conteo.isPending && !fechaMala && !topeMalo ? <p className="text-sm text-salvia">Contando…</p>
              : conteo.error ? <Aviso>{conteo.error instanceof ErrorApi ? conteo.error.message : 'No se pudo contar.'}</Aviso>
                : n !== undefined && (
                  <div className="mt-1 flex flex-wrap items-end gap-6">
                    <Cifra valor={num(n)} texto={`de ${num(conteo.data!.n_base)} niños`} />
                    <ul className="flex-1 space-y-1 text-sm text-ocre">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
                  </div>
                )}
          </section>

          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (puedeGuardar) guardarYEntrenar.mutate() }}>
            <Campo id="cm-titulo" etiqueta="Título de la muestra">
              <Entrada id="cm-titulo" maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </Campo>
            <Campo id="cm-descripcion" etiqueta="Descripción (opcional)">
              <Texto id="cm-descripcion" rows={2} maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </Campo>
            {guardarYEntrenar.error && <Aviso>{guardarYEntrenar.error.message}</Aviso>}
            <div><Boton type="submit" disabled={!puedeGuardar || guardarYEntrenar.isPending}>Guardar y entrenar</Boton></div>
            {bloqueado && <p className="text-sm text-salvia">Llegó a su límite: cancele o descarte alguno para entrenar otro.</p>}
          </form>
        </div>
      </div>
    </Panel>
  )
}
