import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { pedir } from '../api/cliente'
import type { Corrida } from '../api/tipos'
import { Aviso, Boton, Cargando, Encabezado, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { usePaqueteActivo } from '../lib/consultas'
import { ESTADOS_CORRIDA, fecha, fechaHora, num, TIPOS_CORRIDA } from '../lib/formato'

/** Lo que una corrida dice de sí misma además de su fila: el paso en curso o el error. El tipo solo cuando las corridas no son todas del mismo. */
function detalleDe(c: Corrida, tipoUniforme: boolean): ReactNode {
  if (c.estado === 'en_curso') return `Paso: ${c.paso ?? '…'}`
  if (c.estado === 'error') return <span className="text-coral-hondo">{c.mensaje}</span>
  return tipoUniforme ? null : TIPOS_CORRIDA[c.tipo] ?? c.tipo
}

export default function AdminCorridas() {
  const cliente = useQueryClient()
  const activo = usePaqueteActivo()
  const [silencio, setSilencio] = useState(false)
  const lista = useQuery({
    queryKey: ['corridas'],
    queryFn: () => pedir<Corrida[]>('/corridas'),
    // mientras haya una en curso, se consulta cada 3 s
    refetchInterval: (q) => (q.state.data?.some((c) => c.estado === 'en_curso') ? 3000 : false),
  })
  const enCurso = lista.data?.some((c) => c.estado === 'en_curso')

  const ejecutar = useMutation({
    mutationFn: () => pedir<Corrida>('/corridas', { cuerpo: { tipo: 'demo', silencio } }),
    onSuccess: () => void cliente.invalidateQueries({ queryKey: ['corridas'] }),
  })
  // al terminar una corrida cambian el tablero, la lista de niños y las colas de revisión
  const antes = useRef(false)
  useEffect(() => {
    if (antes.current && !enCurso) {
      for (const k of ['tablero', 'ninos', 'nino', 'revision']) void cliente.invalidateQueries({ queryKey: [k] })
    }
    antes.current = !!enCurso
  }, [enCurso, cliente])

  return (
    <>
      <Encabezado titulo="Recalcular riesgos">
        Una corrida pasa los datos por los dos modelos del paquete activo y deja los resultados en Resumen. Aquí se
        recalcula con el corte que ya está cargado; para traer antes los datos nuevos de la base de la entidad, use{' '}
        <strong>Corrida ahora</strong> en <Link className="text-teal underline" to="/admin/programacion">Programar ejecuciones automáticas</Link>.
      </Encabezado>
      <Panel titulo="Recalcular con el corte de datos vigente" className="mb-4">
        {activo.data === null ? <Aviso>No hay un paquete activo. Actívelo en Modelos antes de ejecutar.</Aviso> : (
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-teal" checked={silencio} onChange={(e) => setSilencio(e.target.checked)} />
              <span>En silencio <span className="text-salvia">(guarda los riesgos sin mostrarlos ni enviar correos)</span></span>
            </label>
            <Boton onClick={() => ejecutar.mutate()} disabled={ejecutar.isPending || enCurso}>
              {enCurso ? 'Hay una corrida en curso' : 'Iniciar recálculo de riesgos'}
            </Boton>
          </div>
        )}
        {ejecutar.error && <div className="mt-3"><Aviso>{ejecutar.error.message}</Aviso></div>}
      </Panel>

      {lista.isPending ? <Cargando /> : lista.error ? <Aviso>{lista.error.message}</Aviso> : lista.data.length === 0 ? (
        <Vacio titulo="Todavía no se han recalculado los riesgos" />
      ) : (
        <CorridasTabla corridas={lista.data} />
      )}
    </>
  )
}

/** La lista de corridas. Una columna que dice lo mismo en todas las filas sobra: ese tipo se dice una vez, arriba. */
function CorridasTabla({ corridas }: { corridas: Corrida[] }) {
  const tipoUniforme = corridas.length > 1 && corridas.every((c) => c.tipo === corridas[0].tipo)
  const conDetalle = corridas.some((c) => detalleDe(c, tipoUniforme) != null)
  return (
    <>
      {tipoUniforme && <p className="mb-2 text-sm">Todas son: {(TIPOS_CORRIDA[corridas[0].tipo] ?? corridas[0].tipo).toLowerCase()}.</p>}
      <div className="rounded-panel border border-linea bg-papel p-2">
        <Tabla apilar>
          <thead><tr><th>N.º</th><th>Estado</th><th>Corte</th><th>Paquete</th><th>Inició</th><th className="text-right">Niños</th><th className="text-right">Por revisar</th>{conDetalle && <th>Detalle</th>}</tr></thead>
          <tbody>
            {corridas.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>
                  <Insignia tono={c.estado === 'ok' ? 'teal' : c.estado === 'error' ? 'coral' : 'ocre'}>{ESTADOS_CORRIDA[c.estado] ?? c.estado}</Insignia>
                  {c.silencio && <Insignia className="ml-1">En silencio</Insignia>}
                </td>
                <td>{fecha(c.fecha_corte)} <span className="text-salvia">{c.fuente}</span></td>
                <td className="text-sm">{c.paquete ?? c.modelo_clinico ?? '—'}</td>
                <td className="whitespace-nowrap">{fechaHora(c.iniciada)}</td>
                <td className="text-right">{num(c.resumen?.ninos as number | undefined)}</td>
                <td className="text-right">{num(c.resumen?.datos_revisar as number | undefined)}</td>
                {conDetalle && <td className="text-sm">{detalleDe(c, tipoUniforme)}</td>}
              </tr>
            ))}
          </tbody>
        </Tabla>
      </div>
    </>
  )
}
