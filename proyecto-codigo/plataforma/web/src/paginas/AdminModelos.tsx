import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { pedir } from '../api/cliente'
import type { Paquete } from '../api/tipos'
import { Aviso, Boton, Cargando, Encabezado, Insignia, Panel, Tabla, Vacio } from '../components/ui'
import { useSalud } from '../lib/consultas'
import { dec2, fecha, fechaHora } from '../lib/formato'

export default function AdminModelos() {
  const cliente = useQueryClient()
  const salud = useSalud()
  const lista = useQuery({ queryKey: ['modelos', 'paquetes'], queryFn: () => pedir<Paquete[]>('/modelos/paquetes') })
  const archivo = useRef<HTMLInputElement>(null)
  const [nombre, setNombre] = useState<string | null>(null)

  const refrescar = () => {
    void cliente.invalidateQueries({ queryKey: ['modelos'] })
    void cliente.invalidateQueries({ queryKey: ['salud'] })
  }
  const subir = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData()
      fd.append('archivo', f)
      return pedir<Paquete>('/modelos/paquetes', { formulario: fd })
    },
    onSuccess: () => {
      setNombre(null)
      if (archivo.current) archivo.current.value = ''
      refrescar()
    },
  })
  const activar = useMutation({
    mutationFn: (v: string) => pedir<Paquete>(`/modelos/paquetes/${encodeURIComponent(v)}/activar`, { metodo: 'POST' }),
    onSuccess: refrescar,
  })

  return (
    <>
      <Encabezado titulo="Modelos">
        Los modelos llegan como un paquete firmado que se arma en el equipo de entrenamiento (maia exportar). Al subirlo se
        verifican la firma, cada archivo y la versión de LightGBM.
        {salud.data?.entorno === 'demo' && ' En esta demostración solo se aceptan paquetes entrenados con datos simulados.'}
      </Encabezado>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_22rem]">
      <Panel titulo="Subir un paquete" className="xl:order-2">
        <form className="flex flex-col gap-3" onSubmit={(e) => {
          e.preventDefault()
          const f = archivo.current?.files?.[0]
          if (f) subir.mutate(f)
        }}>
          <label htmlFor="paquete" className="sr-only">Archivo del paquete</label>
          <input ref={archivo} id="paquete" type="file" accept=".tar.gz,.tgz,application/gzip"
            onChange={(e) => setNombre(e.target.files?.[0]?.name ?? null)}
            className="text-sm file:mr-3 file:h-10 file:rounded-control file:border file:border-linea file:bg-papel file:px-4 file:font-semibold file:text-tinta" />
          <Boton type="submit" disabled={!nombre || subir.isPending}>{subir.isPending ? 'Verificando…' : 'Subir paquete'}</Boton>
        </form>
        {subir.error && <div className="mt-3"><Aviso>{subir.error.message}</Aviso></div>}
        {subir.data && <div className="mt-3"><Aviso tono="teal">Paquete {subir.data.version} verificado y guardado. Actívelo para usarlo.</Aviso></div>}
      </Panel>

      <div className="min-w-0 space-y-4 xl:order-1">
      {activar.error && <Aviso>{activar.error.message}</Aviso>}
      {lista.isPending ? <Cargando /> : lista.error ? <Aviso>{lista.error.message}</Aviso> : lista.data.length === 0 ? (
        <Vacio titulo="Todavía no hay paquetes">Suba el primero con el formulario de arriba.</Vacio>
      ) : (
        <div className="grid gap-4 2xl:grid-cols-2">
          {lista.data.map((p) => (
            <Panel key={p.version}
              titulo={<div className="flex items-center gap-2"><h2 className="text-base">{p.version}</h2>{p.activo && <Insignia tono="teal">Activo</Insignia>}<Insignia>{p.fuente}</Insignia></div>}
              accion={!p.activo && (
                <Boton chico onClick={() => activar.mutate(p.version)} disabled={activar.isPending}>
                  {activar.isPending && activar.variables === p.version ? 'Activando…' : 'Activar'}
                </Boton>
              )}>
              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                <div><dt className="text-salvia">Corte de entrenamiento</dt><dd>{fecha(p.corte)}</dd></div>
                <div><dt className="text-salvia">Creado</dt><dd>{fechaHora(p.creado)}</dd></div>
                <div><dt className="text-salvia">Subido</dt><dd>{fechaHora(p.subido_en)}</dd></div>
                {Object.entries(p.modelos ?? {}).map(([k, m]) => {
                  const d = m as Record<string, string>
                  return <div key={k}><dt className="text-salvia">Modelo {k === 'clinico' ? 'clínico' : 'de anomalías'}</dt><dd>{d.registro ?? '—'} v{d.version ?? '?'} · {d.version_modelo}</dd></div>
                })}
              </dl>
              <Metricas metricas={p.metricas ?? {}} />
            </Panel>
          ))}
        </div>
      )}
      </div>
      </div>
    </>
  )
}

function Metricas({ metricas }: { metricas: Record<string, number> }) {
  const auc = Object.entries(metricas).filter(([k]) => k.startsWith('auc__'))
  if (!auc.length) return null
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-semibold text-teal">AUC de validación por desenlace</summary>
      <Tabla className="mt-2">
        <thead><tr><th>Desenlace</th><th className="text-right">Modelo</th><th className="text-right">Regla simple</th></tr></thead>
        <tbody>{auc.map(([k, v]) => {
          const clave = k.slice(5)
          return <tr key={k}><td>{clave}</td><td className="text-right">{dec2(v)}</td><td className="text-right">{dec2(metricas[`auc_regla__${clave}`])}</td></tr>
        })}</tbody>
      </Tabla>
    </details>
  )
}
