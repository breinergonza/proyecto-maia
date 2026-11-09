// Panel de filtros de Explorar: casillas por variable con cuántos niños tendría cada opción (los demás filtros puestos),
// los filtros activos como fichas, «+ Agregar variable», los filtros guardados y «Guardar este filtro». Con menos de 5
// niños en una opción solo dice «<5» (D4); con menos de 20 en el grupo no hay cifras (D46).
import { useState } from 'react'
import { Link } from 'react-router'
import { ErrorApi } from '../api/cliente'
import { useGuardarMuestra, useMuestras } from '../api/exploracion'
import type { EntradaFiltro, Faceta, OpcionFaceta, RespuestaFacetas } from '../api/tipos'
import { nuevaEntrada, type Filtros } from '../lib/useFiltros'
import { num } from '../lib/formato'
import { Aviso, Boton, Entrada, Panel, Selector } from './ui'

/** Las variables que se muestran de entrada; las demás se agregan con «+ Agregar variable». */
const BASICAS = ['sede', 'ern_sexo', 'sexo', 'eg_semanas', 'ern_lubchencofenton']

const nf = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

function textoRango(lo: unknown, hi: unknown): string {
  const a = typeof lo === 'number' ? nf(lo) : null
  const b = typeof hi === 'number' ? nf(hi) : null
  if (a && b) return `${a} a ${b}`
  return a ? `desde ${a}` : b ? `hasta ${b}` : ''
}

/** El rango de una categoría (p. ej. «Muy prematuro») queda dentro del rango filtrado. */
function dentro(rango: [number | null, number | null], e: EntradaFiltro): boolean {
  const [lo, hi] = [e.valores[0], e.valores[1]]
  const okLo = lo === null || lo === undefined || (rango[0] !== null && rango[0] >= Number(lo))
  const okHi = hi === null || hi === undefined || (rango[1] !== null && rango[1] <= Number(hi))
  return okLo && okHi
}

function resumenEntrada(e: EntradaFiltro, f?: Faceta): string {
  if (e.tipo === 'numero') {
    const cubiertas = f?.opciones?.filter((o) => o.rango && dentro(o.rango, e)) ?? []
    return cubiertas.length ? cubiertas.map((o) => o.etiqueta).join(', ') : textoRango(e.valores[0], e.valores[1])
  }
  if (e.tipo === 'si_no') return e.valores[0] ? 'Sí' : 'No'
  return e.valores.map((v) => f?.opciones?.find((o) => String(o.valor) === String(v))?.etiqueta ?? String(v)).join(', ')
}

function estaMarcada(o: OpcionFaceta, e: EntradaFiltro | undefined): boolean {
  if (!e) return false
  if (e.tipo === 'numero') return !!o.rango && dentro(o.rango, e)
  if (e.tipo === 'si_no') return e.valores[0] === o.valor
  return e.valores.map(String).includes(String(o.valor))
}

type Cambiar = (e: EntradaFiltro | null) => void

function Casillas({ clave, faceta, entrada, cambiar }: { clave: string; faceta: Faceta; entrada?: EntradaFiltro; cambiar: Cambiar }) {
  const opciones = faceta.opciones ?? []
  const alternar = (o: OpcionFaceta, marcada: boolean) => {
    if (faceta.tipo === 'si_no') {
      cambiar(marcada ? null : nuevaEntrada(clave, 'si_no', [o.valor], faceta.cuando))
    } else if (faceta.tipo === 'numero') {   // categorías con rango (edad gestacional): se filtra el tramo que las cubre
      const marcadas = opciones.filter((x) => (x === o ? !marcada : estaMarcada(x, entrada)))
      if (marcadas.length === 0) return cambiar(null)
      cambiar(nuevaEntrada(clave, 'numero', [marcadas[0].rango![0], marcadas[marcadas.length - 1].rango![1]], faceta.cuando))
    } else {
      const previos = (entrada?.valores ?? []).map(String)
      const valores = marcada ? previos.filter((v) => v !== String(o.valor)) : [...previos, String(o.valor)]
      cambiar(valores.length ? nuevaEntrada(clave, 'lista', valores, faceta.cuando) : null)
    }
  }
  return (
    <ul className="space-y-1">
      {opciones.map((o) => {
        const marcada = estaMarcada(o, entrada)
        const id = `faceta-${clave}-${String(o.valor)}`
        return (
          <li key={String(o.valor)} className="flex items-center gap-2 text-sm">
            <input id={id} type="checkbox" className="size-4 accent-teal" checked={marcada} onChange={() => alternar(o, marcada)} />
            <label htmlFor={id} className="flex flex-1 cursor-pointer items-baseline justify-between gap-2">
              <span>{o.etiqueta}</span>
              <span className="text-xs text-salvia">{o.texto}</span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

function Rango({ clave, faceta, entrada, cambiar }: { clave: string; faceta: Faceta; entrada?: EntradaFiltro; cambiar: Cambiar }) {
  // se aplica al salir del campo, no en cada tecla
  const [borrador, setBorrador] = useState<{ lo?: string; hi?: string }>({})
  const lo = borrador.lo ?? String(entrada?.valores[0] ?? '')
  const hi = borrador.hi ?? String(entrada?.valores[1] ?? '')
  const aplicar = () => {
    const [a, b] = [lo, hi].map((t) => (t.trim() === '' ? null : Number(t.replace(',', '.'))))
    setBorrador({})
    const valido = (v: number | null) => (v === null || Number.isNaN(v) ? null : v)
    if (valido(a) === null && valido(b) === null) return cambiar(null)
    cambiar(nuevaEntrada(clave, 'numero', [valido(a), valido(b)], faceta.cuando))
  }
  const alTeclear = (e: React.KeyboardEvent) => e.key === 'Enter' && aplicar()
  return (
    <div className="flex items-center gap-2">
      <Entrada aria-label={`${faceta.etiqueta}: desde`} inputMode="decimal" placeholder={faceta.min != null ? nf(faceta.min) : 'Desde'}
        value={lo} onChange={(e) => setBorrador({ lo: e.target.value, hi })} onBlur={aplicar} onKeyDown={alTeclear} />
      <span className="text-salvia">a</span>
      <Entrada aria-label={`${faceta.etiqueta}: hasta`} inputMode="decimal" placeholder={faceta.max != null ? nf(faceta.max) : 'Hasta'}
        value={hi} onChange={(e) => setBorrador({ lo, hi: e.target.value })} onBlur={aplicar} onKeyDown={alTeclear} />
    </div>
  )
}

function Guardar({ filtros }: { filtros: Filtros }) {
  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const guardar = useGuardarMuestra()
  if (!abierto) return <Boton variante="secundario" chico onClick={() => setAbierto(true)}>Guardar este filtro</Boton>
  return (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault()
      guardar.mutate({ titulo: titulo.trim(), muestra: filtros.muestra }, {
        onSuccess: (m) => { setAbierto(false); setTitulo(''); filtros.ponerTodas(m.definicion.y, m.id) },
      })
    }}>
      <Entrada aria-label="Nombre del filtro" placeholder="Nombre del filtro" maxLength={200} value={titulo}
        onChange={(e) => setTitulo(e.target.value)} />
      {guardar.error && <Aviso>{guardar.error instanceof ErrorApi ? guardar.error.message : 'No se pudo guardar.'}</Aviso>}
      <div className="flex gap-2">
        <Boton type="submit" chico disabled={!titulo.trim() || guardar.isPending}>Guardar</Boton>
        <Boton variante="fantasma" chico onClick={() => setAbierto(false)}>Cancelar</Boton>
      </div>
    </form>
  )
}

export function PanelFacetas({ facetas, cargando, filtros, esExperto }: {
  facetas?: RespuestaFacetas; cargando?: boolean; filtros: Filtros; esExperto: boolean
}) {
  const [extra, setExtra] = useState<string[]>([])
  const guardadas = useMuestras(esExperto)
  const todas = facetas?.facetas ?? {}
  const porVariable = new Map(filtros.entradas.map((e) => [e.variable, e]))
  const visibles = Object.keys(todas).filter((k) => BASICAS.includes(k) || porVariable.has(k) || extra.includes(k))
  const faltantes = Object.keys(todas).filter((k) => !visibles.includes(k))
  const otras = (guardadas.data ?? []).filter((m) => m.id !== filtros.guardada)

  return (
    <Panel titulo="Elija el grupo" descripcion="Marque las opciones; los números son los niños que tendría cada una."
      accion={filtros.entradas.length > 0 && <Boton variante="fantasma" chico onClick={filtros.limpiar}>Quitar todos</Boton>}>
      <div className="space-y-4">
        {esExperto && (guardadas.data?.length ?? 0) > 0 && (
          <label className="block text-sm font-semibold">
            Filtro guardado
            <Selector className="mt-1 font-normal" value={filtros.guardada ?? ''} onChange={(e) => {
              const m = guardadas.data?.find((x) => x.id === Number(e.target.value))
              if (m) filtros.ponerTodas(m.definicion.y, m.id)
              else filtros.limpiar()
            }}>
              <option value="">Ninguno</option>
              {guardadas.data?.map((m) => <option key={m.id} value={m.id}>{m.titulo} · {num(m.n_ninos)} niños</option>)}
            </Selector>
          </label>
        )}

        {filtros.entradas.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Filtros activos">
            {filtros.entradas.map((e) => {
              const f = todas[e.variable]
              const nombre = f?.etiqueta ?? e.variable
              return (
                <li key={e.variable} className="inline-flex items-center gap-1 rounded-full border border-teal/20 bg-teal-tinte py-0.5 pl-3 pr-1 text-sm text-teal">
                  <span>{nombre}: {resumenEntrada(e, f)}</span>
                  <button type="button" aria-label={`Quitar filtro ${nombre}`} onClick={() => filtros.poner(e.variable, null)}
                    className="grid size-6 place-items-center rounded-full hover:bg-teal/10">×</button>
                </li>
              )
            })}
          </ul>
        )}

        {cargando && !facetas && <p className="text-sm text-salvia" role="status">Cargando opciones…</p>}
        {visibles.map((k) => (
          <fieldset key={k} className="min-w-0">
            <legend className="mb-1.5 text-sm font-semibold">{todas[k].etiqueta}</legend>
            {todas[k].opciones
              ? <Casillas clave={k} faceta={todas[k]} entrada={porVariable.get(k)} cambiar={(e) => filtros.poner(k, e)} />
              : <Rango clave={k} faceta={todas[k]} entrada={porVariable.get(k)} cambiar={(e) => filtros.poner(k, e)} />}
          </fieldset>
        ))}

        {faltantes.length > 0 && (
          <Selector aria-label="Agregar variable" value="" onChange={(e) => e.target.value && setExtra((x) => [...x, e.target.value])}>
            <option value="">+ Agregar variable</option>
            {faltantes.map((k) => <option key={k} value={k}>{todas[k].etiqueta}</option>)}
          </Selector>
        )}

        {esExperto && (
          <div className="space-y-3 border-t border-linea pt-3">
            <Guardar filtros={filtros} />
            {otras.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-teal">Comparar con otro filtro</summary>
                {filtros.guardada
                  ? (
                    <ul className="mt-2 space-y-1">
                      {otras.map((m) => (
                        <li key={m.id}>
                          <Link className="text-teal underline" to={`/analitica/comparar?a=${filtros.guardada}&b=${m.id}`}>{m.titulo}</Link>
                        </li>
                      ))}
                    </ul>
                  )
                  : <p className="mt-2 text-salvia">Guarde este filtro para compararlo con otro.</p>}
              </details>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
