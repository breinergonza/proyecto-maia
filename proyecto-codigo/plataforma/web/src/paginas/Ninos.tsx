import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { pedir } from '../api/cliente'
import type { NinoFila, Pagina, ResumenTablero } from '../api/tipos'
import { Aviso, Cargando, Encabezado, Entrada, Insignia, Paginador, Selector, Tabla, Vacio } from '../components/ui'
import { dec, num, posicion } from '../lib/formato'

const TAMANO = 25

export default function Ninos() {
  const [params, setParams] = useSearchParams()
  const buscar = params.get('buscar') ?? ''
  const desenlace = params.get('desenlace') ?? ''
  const percentil = params.get('percentil_min') ?? ''
  const pagina = Number(params.get('pagina') ?? 1)
  const [texto, setTexto] = useState(buscar)

  const cambiar = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    if (k !== 'pagina') p.delete('pagina')
    setParams(p, { replace: true })
  }

  useEffect(() => {
    const t = setTimeout(() => texto !== buscar && cambiar('buscar', texto.trim()), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  const desenlaces = useQuery({ queryKey: ['tablero', 'resumen'], queryFn: () => pedir<ResumenTablero>('/tablero/resumen') })
  const q = useQuery({
    queryKey: ['ninos', buscar, desenlace, percentil, pagina],
    queryFn: () => pedir<Pagina<NinoFila>>('/ninos', {
      params: { buscar, desenlace, percentil_min: percentil, pagina, tamano: TAMANO },
    }),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <Encabezado titulo="Niños">
        Ordenados por su riesgo más alto en este corte. Los códigos están seudonimizados: para saber quién es un niño hay
        que consultar la base de la Fundación.
      </Encabezado>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="sr-only" htmlFor="buscar">Buscar por código</label>
        <Entrada id="buscar" placeholder="Buscar por código" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <label className="sr-only" htmlFor="desenlace">Desenlace</label>
        <Selector id="desenlace" value={desenlace} onChange={(e) => cambiar('desenlace', e.target.value)} className="sm:w-64">
          <option value="">Todos los desenlaces</option>
          {desenlaces.data?.riesgos_por_desenlace.map((d) => <option key={d.clave} value={d.clave}>{d.desenlace}</option>)}
        </Selector>
        <label className="sr-only" htmlFor="percentil">Posición mínima</label>
        <Selector id="percentil" value={percentil} onChange={(e) => cambiar('percentil_min', e.target.value)} className="sm:w-56">
          <option value="">Cualquier riesgo</option>
          <option value="90">Riesgo alto (posición 90 o más)</option>
          <option value="95">Posición 95 o más</option>
          <option value="0">Con algún riesgo calculado</option>
        </Selector>
      </div>

      {q.isPending ? <Cargando /> : q.error ? <Aviso>{q.error.message}</Aviso> : q.data.items.length === 0 ? (
        <Vacio titulo="Ningún niño cumple estos filtros">Quite un filtro o busque otro código.</Vacio>
      ) : (
        <div className="rounded-panel border border-linea bg-papel p-2">
          <Tabla>
            <thead>
              <tr>
                <th>Niño</th>
                <th className="text-right">Edad gestacional</th>
                <th>Riesgo más alto</th>
                <th className="text-right">Posición</th>
                <th className="text-right">Datos por revisar</th>
                <th>Crecimiento</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((n) => (
                <tr key={n.sujeto}>
                  <td><Link className="font-semibold text-teal underline-offset-2 hover:underline" to={`/ninos/${encodeURIComponent(n.sujeto)}`}>{n.sujeto}</Link></td>
                  <td className="text-right">{n.eg_semanas == null ? '—' : `${dec(n.eg_semanas)} sem`}</td>
                  <td>{n.desenlace_max ?? <span className="text-salvia">Sin riesgo calculado</span>}{n.n_riesgos > 1 && <span className="text-salvia"> y {n.n_riesgos - 1} más</span>}</td>
                  <td className="text-right">
                    {n.percentil_max == null ? '—' : n.percentil_max >= 90
                      ? <Insignia tono="coral">{posicion(n.percentil_max)}</Insignia> : posicion(n.percentil_max)}
                  </td>
                  <td className="text-right">{n.n_alertas ? <span className="font-semibold">{num(n.n_alertas)}</span> : '—'}</td>
                  <td className="space-x-1">
                    {n.n_bajo_2de > 0 && <Insignia tono="ocre">Bajo −2 DE ×{n.n_bajo_2de}</Insignia>}
                    {n.n_caida_1de > 0 && <Insignia>Caída ×{n.n_caida_1de}</Insignia>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <div className="px-3 pb-2">
            <Paginador pagina={pagina} tamano={TAMANO} total={q.data.total} cambiar={(p) => cambiar('pagina', String(p))} />
          </div>
        </div>
      )}
    </>
  )
}
