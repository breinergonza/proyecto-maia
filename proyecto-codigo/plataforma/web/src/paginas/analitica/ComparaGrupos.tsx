// Comparar › Grupos de niños: cada lado es un filtro guardado o una combinación de facetas (sexo, edad gestacional, sede...).
// Muestra tamaño, riesgo alto por desenlace, crecimiento y composición, con la diferencia de B frente a A, su intervalo
// por réplicas y una marca (*) cuando es clara. Con menos de 20 niños en un lado no hay cifras (D52); n menor que 5 se oculta.
import { useState } from 'react'
import { useComparaGrupos, type LadoGrupoEntrada, type ValorComparado } from '../../api/comparar'
import { useFacetasExplorar, useMuestras } from '../../api/exploracion'
import type { Faceta, OpcionFaceta } from '../../api/tipos'
import { puede, useSesion } from '../../auth/sesion'
import { Grafica, TablaDatos } from '../../components/grafica'
import { BarrasAgrupadas } from '../../components/graficos/distribuciones'
import { Aviso, Boton, Cargando, Selector, Tabla } from '../../components/ui'
import { descripcionDe } from '../../lib/descripciones'
import { dec2, num } from '../../lib/formato'
import { motivo, N_MENOR_QUE_5 } from '../../lib/lenguaje'
import { nuevaEntrada } from '../../lib/useFiltros'
import { Guia, omitida, useNombreDesenlace } from './comun'
import { useContextoAnalitica } from './contexto'

const BASICAS = ['sede', 'ern_sexo', 'sexo', 'eg_semanas', 'ern_lubchencofenton']

interface Lado { guardada: number | null; valores: Record<string, string> }
const vacio: Lado = { guardada: null, valores: {} }

const nf = (v: number, unidad: string) => (unidad === 'pp' ? `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %` : dec2(v))
const signo = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '')
export const difTexto = (v: number, unidad: string) =>
  `${signo(v)}${Math.abs(v).toLocaleString('es-CO', { maximumFractionDigits: unidad === 'pp' ? 1 : 2 })}${unidad === 'pp' ? ' puntos' : ''}`

function entradaDe(clave: string, f: Faceta, valor: string) {
  if (f.tipo === 'numero') {
    const o = f.opciones?.find((x) => String(x.valor) === valor)
    return o?.rango ? nuevaEntrada(clave, 'numero', [o.rango[0], o.rango[1]], f.cuando) : null
  }
  return nuevaEntrada(clave, 'lista', [valor], f.cuando)
}

function textoOpcion(o: OpcionFaceta) {
  return `${o.etiqueta}${o.n == null ? '' : ` (${o.texto})`}`
}

function EditorLado({ titulo, lado, cambiar, facetas, guardadas }: {
  titulo: string; lado: Lado; cambiar: (l: Lado) => void; facetas: Record<string, Faceta>
  guardadas: { id: number; titulo: string }[] | undefined
}) {
  const claves = BASICAS.filter((k) => facetas[k] && facetas[k].tipo !== 'si_no' && (facetas[k].opciones?.length ?? 0) > 0)
  return (
    <fieldset className="rounded-panel border border-linea p-3">
      <legend className="px-1 text-sm font-semibold">{titulo}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {guardadas && guardadas.length > 0 && (
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block">Filtro guardado</span>
            <Selector aria-label={`${titulo}: filtro guardado`} value={lado.guardada ?? ''}
              onChange={(e) => cambiar({ guardada: e.target.value ? Number(e.target.value) : null, valores: {} })}>
              <option value="">Ninguno (usar facetas)</option>
              {guardadas.map((g) => <option key={g.id} value={g.id}>{g.titulo}</option>)}
            </Selector>
          </label>
        )}
        {claves.map((k) => (
          <label key={k} className="block text-sm">
            <span className="mb-1 block">{facetas[k].etiqueta}</span>
            <Selector aria-label={`${titulo}: ${facetas[k].etiqueta}`} disabled={lado.guardada != null} value={lado.valores[k] ?? ''}
              onChange={(e) => cambiar({ guardada: null, valores: { ...lado.valores, [k]: e.target.value } })}>
              <option value="">Todos</option>
              {(facetas[k].opciones ?? []).map((o) => <option key={String(o.valor)} value={String(o.valor)}>{textoOpcion(o)}</option>)}
            </Selector>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function entradaLado(lado: Lado, facetas: Record<string, Faceta>, guardadas: { id: number; titulo: string }[] | undefined, defecto: string): LadoGrupoEntrada {
  if (lado.guardada != null) return { muestra_id: lado.guardada, nombre: guardadas?.find((g) => g.id === lado.guardada)?.titulo ?? defecto }
  const elegidos = Object.entries(lado.valores).filter(([k, v]) => v !== '' && facetas[k])
  const y = elegidos.map(([k, v]) => entradaDe(k, facetas[k], v)).filter((e) => e !== null)
  const nombre = elegidos.map(([k, v]) => facetas[k].opciones?.find((o) => String(o.valor) === v)?.etiqueta ?? v).join(' · ')
  return { muestra: { version: 2, y }, nombre: nombre || 'Todos los niños' }
}

function Diferencia({ v }: { v: ValorComparado }) {
  if (v.diferencia == null) return <>{N_MENOR_QUE_5}</>
  return (
    <>
      {difTexto(v.diferencia, v.unidad)}{v.clara ? ' *' : ''}
      {v.ic_bajo != null && v.ic_alto != null && <span className="block text-xs text-salvia">IC 95 %: {difTexto(v.ic_bajo, v.unidad)} a {difTexto(v.ic_alto, v.unidad)}</span>}
    </>
  )
}

const celda = (v: number | null, unidad: string, ic: [number, number] | null) =>
  v == null ? N_MENOR_QUE_5 : <>{nf(v, unidad)}{ic && <span className="block text-xs text-salvia">({nf(ic[0], unidad)} a {nf(ic[1], unidad)})</span>}</>

export default function ComparaGruposVista() {
  const { desenlace } = useContextoAnalitica()
  const { usuario } = useSesion()
  const nombreDe = useNombreDesenlace()
  const facetas = useFacetasExplorar({ muestra: { version: 2, y: [] } })
  const guardadas = useMuestras(puede(usuario, ['admin', 'experto']))
  const comparar = useComparaGrupos()
  const [a, setA] = useState<Lado>(vacio)
  const [b, setB] = useState<Lado>(vacio)
  const dRiesgo = descripcionDe('grupos_riesgo'), dCrece = descripcionDe('grupos_crecen'), dDif = descripcionDe('grupos_diferencias'), dComp = descripcionDe('grupos_composicion'), dPesan = descripcionDe('grupos_pesan'), dFalt = descripcionDe('grupos_faltantes')
  const listaGuardadas = guardadas.data?.map((g) => ({ id: g.id, titulo: g.titulo }))
  const fa = facetas.data?.facetas ?? {}
  const r = comparar.data
  const lanzar = () => comparar.mutate({
    a: entradaLado(a, fa, listaGuardadas, 'Grupo A'), b: entradaLado(b, fa, listaGuardadas, 'Grupo B'), ...(desenlace ? { desenlace } : {}),
  })
  return (
    <div className="space-y-4">
      <Guia>
        <p>Cada lado es un grupo de niños: un filtro guardado o una combinación de sexo, edad gestacional y sede. Se compara la parte de niños con riesgo alto, el crecimiento y quiénes son.</p>
        <p>Un asterisco (*) marca una diferencia clara: su intervalo del 95 % no incluye cero. Cada grupo necesita al menos 20 niños.</p>
      </Guia>
      {facetas.isPending ? <Cargando /> : (
        <div className="grid gap-3 md:grid-cols-2">
          <EditorLado titulo="Grupo A" lado={a} cambiar={setA} facetas={fa} guardadas={listaGuardadas} />
          <EditorLado titulo="Grupo B" lado={b} cambiar={setB} facetas={fa} guardadas={listaGuardadas} />
        </div>
      )}
      <div><Boton onClick={lanzar} disabled={comparar.isPending || facetas.isPending}>{comparar.isPending ? 'Comparando…' : 'Comparar grupos'}</Boton></div>
      {comparar.isError && <Aviso>No se pudo comparar los grupos. Revise los filtros e intente de nuevo.</Aviso>}
      {r?.estado === 'insuficiente' && (
        <Aviso tono="teal">{r.mensaje} Grupo A: {omitida(r.a.n, num)} niños. Grupo B: {omitida(r.b.n, num)} niños.</Aviso>
      )}
      {r?.estado === 'ok' && (
        <>
          <p className="text-sm text-salvia">{r.a.nombre}: {num(r.a.n)} niños · {r.b.nombre}: {num(r.b.n)} niños · {r.replicas} réplicas por cifra</p>
          {(r.riesgo ?? []).length > 0 && (
            <Grafica titulo={dRiesgo.titulo} descripcion={dRiesgo.descripcion}
              exportar={{ nombre: 'comparar-grupos-riesgo', muestra: `${num(r.a.n)} y ${num(r.b.n)} niños`,
                filas: (r.riesgo ?? []).map((f) => ({ desenlace: nombreDe(f.clave).nombre, grupo_a_pct: f.a, grupo_b_pct: f.b, diferencia_puntos: f.diferencia, ic_bajo: f.ic_bajo, ic_alto: f.ic_alto, n_a: f.n_a, n_b: f.n_b })) }}>
              <BarrasAgrupadas etiqueta="Niños con riesgo alto en cada grupo"
                filas={(r.riesgo ?? []).map((f) => ({ x: nombreDe(f.clave).nombre, a: f.a, b: f.b }))}
                series={[{ clave: 'a', nombre: r.a.nombre, color: 0 }, { clave: 'b', nombre: r.b.nombre, color: 1 }]} />
            </Grafica>
          )}
          <TablaDatos titulo={dDif.titulo} descripcion={dDif.descripcion}
            exportar={{ nombre: 'comparar-grupos-diferencias',
              filas: [...(r.riesgo ?? []).map((f) => ({ medida: `Riesgo alto: ${nombreDe(f.clave).nombre}`, A: f.a, B: f.b, diferencia: f.diferencia, ic_bajo: f.ic_bajo, ic_alto: f.ic_alto, clara: f.clara ? 'sí' : 'no' })),
                ...(r.crecimiento ? [{ medida: r.crecimiento.etiqueta, A: r.crecimiento.a, B: r.crecimiento.b, diferencia: r.crecimiento.diferencia, ic_bajo: r.crecimiento.ic_bajo, ic_alto: r.crecimiento.ic_alto, clara: r.crecimiento.clara ? 'sí' : 'no' }] : [])] }}>
            <Tabla densa>
              <thead><tr><th>Medida</th><th>{r.a.nombre}</th><th>{r.b.nombre}</th><th>Diferencia de B frente a A</th></tr></thead>
              <tbody>
                {(r.riesgo ?? []).map((f) => (
                  <tr key={f.clave}><td>Riesgo alto: {nombreDe(f.clave).nombre}</td><td>{celda(f.a, f.unidad, f.ic_a)}</td><td>{celda(f.b, f.unidad, f.ic_b)}</td><td><Diferencia v={f} /></td></tr>
                ))}
              </tbody>
            </Tabla>
          </TablaDatos>
          {r.crecimiento && (
            <TablaDatos titulo={dCrece.titulo} descripcion={dCrece.descripcion}
              exportar={{ nombre: 'comparar-grupos-crecimiento', filas: [{ grupo: r.a.nombre, z_medio: r.crecimiento.a, ninos: r.crecimiento.n_a }, { grupo: r.b.nombre, z_medio: r.crecimiento.b, ninos: r.crecimiento.n_b }] }}>
              <Tabla densa>
                <thead><tr><th>Grupo</th><th>{r.crecimiento.etiqueta}</th><th>Niños con medida</th></tr></thead>
                <tbody>
                  <tr><td>{r.a.nombre}</td><td>{celda(r.crecimiento.a, 'z', r.crecimiento.ic_a)}</td><td>{omitida(r.crecimiento.n_a, num)}</td></tr>
                  <tr><td>{r.b.nombre}</td><td>{celda(r.crecimiento.b, 'z', r.crecimiento.ic_b)}</td><td>{omitida(r.crecimiento.n_b, num)}</td></tr>
                  <tr><td colSpan={3}>Diferencia de B frente a A: <Diferencia v={r.crecimiento} /></td></tr>
                </tbody>
              </Tabla>
            </TablaDatos>
          )}
          {(r.motivos ?? []).length > 0 && (
            <TablaDatos titulo={dPesan.titulo} descripcion={dPesan.descripcion}
              exportar={{ nombre: 'comparar-grupos-motivos', filas: (r.motivos ?? []).map((m) => ({ motivo: m.motivo, pct_a: m.a.pct, pct_b: m.b.pct })) }}>
              <Tabla densa>
                <thead><tr><th>Razón</th><th>{r.a.nombre} (% de los de riesgo alto)</th><th>{r.b.nombre} (% de los de riesgo alto)</th></tr></thead>
                <tbody>
                  {(r.motivos ?? []).map((m) => (
                    <tr key={m.motivo}><td>{motivo(m.motivo)}</td><td>{m.a.pct == null ? N_MENOR_QUE_5 : `${nf(m.a.pct, 'pp')}`}</td><td>{m.b.pct == null ? N_MENOR_QUE_5 : `${nf(m.b.pct, 'pp')}`}</td></tr>
                  ))}
                </tbody>
              </Tabla>
            </TablaDatos>
          )}
          {(r.faltantes ?? []).length > 0 && (
            <TablaDatos titulo={dFalt.titulo} descripcion={dFalt.descripcion}
              exportar={{ nombre: 'comparar-grupos-faltantes', filas: (r.faltantes ?? []).map((f) => ({ dato: f.etiqueta, faltan_a_pct: f.a.pct, faltan_b_pct: f.b.pct })) }}>
              <Tabla densa>
                <thead><tr><th>Dato</th><th>{r.a.nombre} (% sin el dato)</th><th>{r.b.nombre} (% sin el dato)</th></tr></thead>
                <tbody>
                  {(r.faltantes ?? []).map((f) => (
                    <tr key={f.variable}><td>{f.etiqueta}</td><td>{f.a.pct == null ? N_MENOR_QUE_5 : nf(f.a.pct, 'pp')}</td><td>{f.b.pct == null ? N_MENOR_QUE_5 : nf(f.b.pct, 'pp')}</td></tr>
                  ))}
                </tbody>
              </Tabla>
            </TablaDatos>
          )}
          {Object.entries(r.composicion ?? {}).length > 0 && (
            <div className="grid gap-4 xl:grid-cols-2">
              {Object.entries(r.composicion ?? {}).map(([k, v]) => (
                <Grafica key={k} titulo={`${dComp.titulo}: ${v.etiqueta}`} descripcion={dComp.descripcion}
                  exportar={{ nombre: `comparar-grupos-${k}`, filas: v.categorias.map((c) => ({ categoria: c.etiqueta, pct_a: c.pct_a, pct_b: c.pct_b })) }}>
                  <BarrasAgrupadas etiqueta={`${v.etiqueta} en cada grupo`} filas={v.categorias.map((c) => ({ x: c.etiqueta, a: c.pct_a, b: c.pct_b }))}
                    series={[{ clave: 'a', nombre: r.a.nombre, color: 0 }, { clave: 'b', nombre: r.b.nombre, color: 1 }]} />
                  {v.categorias.some((c) => c.pct_a == null || c.pct_b == null) && <p className="mt-2 text-xs text-salvia">Una categoría con menos de 5 niños queda sin barra ({N_MENOR_QUE_5}).</p>}
                </Grafica>
              ))}
            </div>
          )}
          {r.aviso && <p className="text-sm text-salvia">{r.aviso}</p>}
        </>
      )}
    </div>
  )
}
