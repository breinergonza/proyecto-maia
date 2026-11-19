// El filtro de Explorar vive en la dirección, para poder copiarla, volver atrás y compartir el grupo exacto:
//   /explorar?f=ern_sexo|lista|F&f=eg_categoria|lista|muy_prematuro;a_termino&t=fecha_nacimiento|periodo|2018|2019
//            &m=sede|300|11&v=oxigeno_3m|alguna&guardada=12
// Cada «f» es un filtro: variable|tipo|valores (separados por «;», cada uno con su codificación)|cuando; el «cuando»
// (primera, ultima, alguna, etapa:<visita>) solo va si no es «primera» y no lo llevan las variables que no se miden.
// «t» es el tiempo (qué fecha manda y el período): fecha|periodo|desde|hasta o fecha|ultimos_meses|N.
// «m» es el muestreo estratificado: por|máximo por categoría|semilla. «v» es una variable agregada al panel que
// todavía no filtra: variable|cuando. «guardada» es una muestra guardada sin cambios; en cuanto se toca algo deja de serlo.
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { EntradaFiltro, MuestraJson, MuestreoJson, TiempoJson, ValorFiltro, VariableExtra } from '../api/tipos'

const OPERADOR = { lista: 'en', si_no: 'es', numero: 'entre' } as const
/** Variables que no son del diccionario y por eso no llevan «cuando». */
export const VIRTUALES = ['sede', 'eg_semanas', 'eg_categoria']
/** Cuántos niños por categoría y qué semilla se usan al elegir el muestreo estratificado. */
export const TOPE_POR_DEFECTO = 300
export const SEMILLA_POR_DEFECTO = 11

const dec = (t: string | undefined) => decodeURIComponent(t ?? '')

export function codificar(e: EntradaFiltro): string {
  const valores = e.valores.map((v) => (v === null ? '' : encodeURIComponent(String(v)))).join(';')
  const base = `${e.variable}|${e.tipo}|${valores}`
  return e.cuando && e.cuando !== 'primera' && !VIRTUALES.includes(e.variable) ? `${base}|${encodeURIComponent(e.cuando)}` : base
}

export function decodificar(texto: string): EntradaFiltro | null {
  const [variable, tipo, resto = '', cuando] = texto.split('|')
  if (!variable || (tipo !== 'lista' && tipo !== 'si_no' && tipo !== 'numero')) return null
  const crudos = resto.split(';').map((t) => decodeURIComponent(t))
  let valores: ValorFiltro[]
  if (tipo === 'numero') {
    valores = [0, 1].map((i) => {
      const n = Number(crudos[i])
      return crudos[i] === undefined || crudos[i] === '' || Number.isNaN(n) ? null : n
    })
  } else if (tipo === 'si_no') {
    valores = [crudos[0] === 'true']
  } else {
    valores = crudos.filter((v) => v !== '')
    if (valores.length === 0) return null
  }
  return { variable, tipo, op: OPERADOR[tipo], valores, ...(VIRTUALES.includes(variable) ? {} : { cuando: cuando ? dec(cuando) : 'primera' }) }
}

export function nuevaEntrada(variable: string, tipo: EntradaFiltro['tipo'], valores: ValorFiltro[], cuando?: string | null): EntradaFiltro {
  return { variable, tipo, op: OPERADOR[tipo], valores, ...(cuando && !VIRTUALES.includes(variable) ? { cuando } : {}) }
}

export function codificarTiempo(t: TiempoJson): string {
  const resto = t.modo === 'ultimos_meses' ? [String(t.desde ?? '')] : [String(t.desde ?? ''), t.hasta ?? '']
  return [t.fecha, t.modo, ...resto].map(encodeURIComponent).join('|')
}

export function decodificarTiempo(texto: string): TiempoJson | null {
  const [fecha, modo, desde = '', hasta = ''] = texto.split('|').map(dec)
  if (!fecha || (modo !== 'periodo' && modo !== 'ultimos_meses')) return null
  if (modo === 'ultimos_meses') {
    const n = Number(desde)
    return Number.isInteger(n) && n > 0 ? { fecha, modo, desde: n } : null
  }
  if (!desde && !hasta) return null
  return { fecha, modo, ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) }
}

export function codificarMuestreo(m: MuestreoJson): string {
  return [m.por ?? '', String(m.maximo_por_categoria ?? ''), String(m.semilla ?? SEMILLA_POR_DEFECTO)].map(encodeURIComponent).join('|')
}

export function decodificarMuestreo(texto: string): MuestreoJson | null {
  const [por, maximo, semilla] = texto.split('|').map(dec)
  const tope = Number(maximo)
  if (!por || !Number.isInteger(tope) || tope < 1) return null
  const s = Number(semilla)
  return { modo: 'estratificado', por, maximo_por_categoria: tope, semilla: semilla !== '' && Number.isInteger(s) ? s : SEMILLA_POR_DEFECTO }
}

type Estado = { entradas: EntradaFiltro[]; tiempo: TiempoJson | null; muestreo: MuestreoJson | null; extras: VariableExtra[] }

export function useFiltros() {
  const [params, setParams] = useSearchParams()
  const crudo = params.getAll('f').join('\n')
  const entradas = useMemo(
    () => (crudo ? crudo.split('\n').map(decodificar).filter((e): e is EntradaFiltro => e !== null) : []),
    [crudo],
  )
  const crudoT = params.get('t')
  const tiempo = useMemo(() => (crudoT ? decodificarTiempo(crudoT) : null), [crudoT])
  const crudoM = params.get('m')
  const muestreo = useMemo(() => (crudoM ? decodificarMuestreo(crudoM) : null), [crudoM])
  const crudoV = params.getAll('v').join('\n')
  const extras = useMemo<VariableExtra[]>(
    () => (crudoV
      ? crudoV.split('\n').map((t) => t.split('|').map(dec)).filter(([v, c]) => v && c).map(([variable, cuando]) => ({ variable, cuando }))
      : []),
    [crudoV],
  )
  const guardada = Number(params.get('guardada')) || null
  const muestra: MuestraJson = useMemo(
    () => ({ version: 2, y: entradas, ...(tiempo ? { tiempo } : {}), ...(muestreo ? { muestreo } : {}) }),
    [entradas, tiempo, muestreo],
  )
  const actual: Estado = useMemo(() => ({ entradas, tiempo, muestreo, extras }), [entradas, tiempo, muestreo, extras])

  const escribir = useCallback((nuevo: Estado, idGuardada: number | null) => {
    setParams((previo) => {
      const p = new URLSearchParams(previo)
      for (const k of ['f', 't', 'm', 'v', 'guardada']) p.delete(k)
      nuevo.entradas.forEach((e) => p.append('f', codificar(e)))
      if (nuevo.tiempo) p.set('t', codificarTiempo(nuevo.tiempo))
      if (nuevo.muestreo) p.set('m', codificarMuestreo(nuevo.muestreo))
      nuevo.extras.forEach((x) => p.append('v', `${encodeURIComponent(x.variable)}|${encodeURIComponent(x.cuando)}`))
      if (idGuardada) p.set('guardada', String(idGuardada))
      return p
    }, { replace: true })
  }, [setParams])

  /** Pone, cambia o (con ``null``) quita el filtro de una variable. */
  const poner = useCallback((variable: string, entrada: EntradaFiltro | null) => {
    const resto = actual.entradas.filter((e) => e.variable !== variable)
    escribir({ ...actual, entradas: entrada ? [...resto, entrada] : resto }, null)
  }, [actual, escribir])

  /** Pone un filtro guardado (con su tiempo y su muestreo, si los trae) o varios filtros a la vez. */
  const ponerTodas = useCallback((lista: EntradaFiltro[], idGuardada: number | null = null, resto?: Pick<MuestraJson, 'tiempo' | 'muestreo'>) => {
    escribir({
      entradas: lista, tiempo: resto?.tiempo ?? null,
      muestreo: resto?.muestreo?.modo === 'estratificado' ? resto.muestreo : null, extras: [],
    }, idGuardada)
  }, [escribir])

  const ponerTiempo = useCallback((t: TiempoJson | null) => escribir({ ...actual, tiempo: t }, null), [actual, escribir])
  const ponerMuestreo = useCallback(
    (m: MuestreoJson | null) => escribir({ ...actual, muestreo: m && m.modo === 'estratificado' ? m : null }, null),
    [actual, escribir])

  /** Agrega una variable al panel (o le cambia la regla de lectura); con ``null`` la quita. */
  const ponerExtra = useCallback((variable: string, cuando: string | null) => {
    const resto = actual.extras.filter((x) => x.variable !== variable)
    escribir({ ...actual, extras: cuando ? [...resto, { variable, cuando }] : resto }, null)
  }, [actual, escribir])

  /** Cambia la regla de lectura de una variable: la del filtro si ya filtra, si no la de la variable agregada. */
  const ponerRegla = useCallback((variable: string, cuando: string) => {
    const e = actual.entradas.find((x) => x.variable === variable)
    if (e) {
      escribir({ ...actual, entradas: actual.entradas.map((x) => (x === e ? { ...e, cuando } : x)), extras: actual.extras.filter((x) => x.variable !== variable) }, null)
    } else {
      ponerExtra(variable, cuando)
    }
  }, [actual, escribir, ponerExtra])

  /** Quita una variable agregada del panel junto con su filtro, en un solo cambio. */
  const quitarVariable = useCallback((variable: string) => escribir({
    ...actual, entradas: actual.entradas.filter((e) => e.variable !== variable), extras: actual.extras.filter((x) => x.variable !== variable),
  }, null), [actual, escribir])

  const limpiar = useCallback(() => escribir({ entradas: [], tiempo: null, muestreo: null, extras: [] }, null), [escribir])

  return { entradas, tiempo, muestreo, extras, muestra, guardada, poner, ponerTodas, ponerTiempo, ponerMuestreo, ponerExtra, ponerRegla, quitarVariable, limpiar }
}

export type Filtros = ReturnType<typeof useFiltros>
