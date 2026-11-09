// El filtro de Explorar vive en la dirección, para poder copiarla, volver atrás y compartir el grupo exacto:
//   /explorar?f=ern_sexo|lista|F&f=eg_semanas|numero|28;31.999&guardada=12
// Cada «f» es un filtro: variable|tipo|valores (separados por «;», cada uno con su codificación). «guardada» es una
// muestra guardada sin cambios; en cuanto se toca un filtro deja de serlo.
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { EntradaFiltro, MuestraJson, ValorFiltro } from '../api/tipos'

const OPERADOR = { lista: 'en', si_no: 'es', numero: 'entre' } as const
/** Variables que no son del diccionario y por eso no llevan «cuando». */
export const VIRTUALES = ['sede', 'eg_semanas']

export function codificar(e: EntradaFiltro): string {
  const valores = e.valores.map((v) => (v === null ? '' : encodeURIComponent(String(v)))).join(';')
  return `${e.variable}|${e.tipo}|${valores}`
}

export function decodificar(texto: string): EntradaFiltro | null {
  const [variable, tipo, resto = ''] = texto.split('|')
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
  return { variable, tipo, op: OPERADOR[tipo], valores, ...(VIRTUALES.includes(variable) ? {} : { cuando: 'primera' }) }
}

export function nuevaEntrada(variable: string, tipo: EntradaFiltro['tipo'], valores: ValorFiltro[], cuando?: string | null): EntradaFiltro {
  return { variable, tipo, op: OPERADOR[tipo], valores, ...(cuando && !VIRTUALES.includes(variable) ? { cuando } : {}) }
}

export function useFiltros() {
  const [params, setParams] = useSearchParams()
  const crudo = params.getAll('f').join('\n')
  const entradas = useMemo(
    () => (crudo ? crudo.split('\n').map(decodificar).filter((e): e is EntradaFiltro => e !== null) : []),
    [crudo],
  )
  const guardada = Number(params.get('guardada')) || null
  const muestra: MuestraJson = useMemo(() => ({ version: 2, y: entradas }), [entradas])

  const escribir = useCallback((lista: EntradaFiltro[], idGuardada: number | null) => {
    setParams((previo) => {
      const p = new URLSearchParams(previo)
      p.delete('f')
      p.delete('guardada')
      lista.forEach((e) => p.append('f', codificar(e)))
      if (idGuardada) p.set('guardada', String(idGuardada))
      return p
    }, { replace: true })
  }, [setParams])

  /** Pone, cambia o (con ``null``) quita el filtro de una variable. */
  const poner = useCallback((variable: string, entrada: EntradaFiltro | null) => {
    const resto = entradas.filter((e) => e.variable !== variable)
    escribir(entrada ? [...resto, entrada] : resto, null)
  }, [entradas, escribir])

  const ponerTodas = useCallback((lista: EntradaFiltro[], idGuardada: number | null = null) => escribir(lista, idGuardada), [escribir])
  const limpiar = useCallback(() => escribir([], null), [escribir])

  return { entradas, muestra, guardada, poner, ponerTodas, limpiar }
}

export type Filtros = ReturnType<typeof useFiltros>
