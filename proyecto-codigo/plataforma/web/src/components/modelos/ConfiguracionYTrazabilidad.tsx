// «Configuración» (con qué datos y cómo se entrenó) y «Trazabilidad» (qué entrenamiento es, de cuándo y en qué paquete está):
// lo que hace falta para reproducir o auditar el modelo. Solo se muestra lo que el entrenamiento guardó o el sistema sabe;
// lo que no se registró (p. ej. la versión del diccionario con que se entrenó) no se inventa.
import { Link } from 'react-router'
import type { AnaliticaMeta } from '../../api/tipos'
import { paqueteQueContiene } from '../../api/modelos'
import { puede, useSesion } from '../../auth/sesion'
import { cn } from '../../lib/cn'
import { usePaqueteActivo } from '../../lib/consultas'
import { fecha, numero } from '../../lib/formato'
import { datosAl } from '../../lib/lenguaje'
import { Panel } from '../ui'

/** `columnas`: una lista larga de datos cortos (los hiperparámetros) se reparte en dos columnas en pantallas anchas, para no alargar el panel. */
function Datos({ filas, columnas }: { filas: [string, string | null | undefined][]; columnas?: boolean }) {
  return (
    <dl className={columnas ? 'grid gap-x-8 text-sm 2xl:grid-cols-2' : 'divide-y divide-linea/70 text-sm'}>
      {filas.flatMap(([rotulo, valor]) => (valor ? [(
        <div key={rotulo} className={cn('grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 py-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]',
          columnas ? 'border-b border-linea/70' : 'first:pt-0')}>
          <dt className="font-semibold">{rotulo}</dt>
          <dd className="min-w-0 break-words">{valor}</dd>
        </div>
      )] : []))}
    </dl>
  )
}

const FUENTES: Record<string, string> = { simulado: 'Datos simulados', kmc: 'Base de la Fundación' }

export function ConfiguracionModelo({ meta }: { meta: AnaliticaMeta | undefined }) {
  const { usuario } = useSesion()
  return (
    <Panel titulo="Configuración">
      <Datos filas={[
        ['Datos de entrenamiento', meta?.corte ? `${datosAl(meta.corte)}${meta.fuente ? `, ${(FUENTES[meta.fuente] ?? meta.fuente).toLowerCase()}` : ''}` : null],
        ['División de datos', 'Temporal por fecha de nacimiento: se entrena con los nacidos antes y se prueba con los más recientes.'],
        ['Algoritmo', 'Gradient boosting (LightGBM)'],
      ]} />
      {meta?.hiperparametros?.length ? (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">Hiperparámetros</h3>
          <Datos columnas filas={meta.hiperparametros.map((h) => [h.etiqueta, numero(h.valor)])} />
        </div>
      ) : null}
      {puede(usuario, ['admin']) && (
        <p className="mt-3"><Link to="/admin/entrenamientos" className="text-sm font-semibold text-teal hover:underline">Ver hiperparámetros ›</Link></p>
      )}
    </Panel>
  )
}

export function TrazabilidadModelo({ meta }: { meta: AnaliticaMeta | undefined }) {
  const paquete = usePaqueteActivo()
  const delPaquete = paqueteQueContiene(paquete.data, meta?.version_modelo)
  return (
    <Panel titulo="Trazabilidad">
      <Datos filas={[
        ['Entrenamiento', meta ? `N.º ${meta.entrenamiento}` : null],
        ['Fecha', meta?.creada ? fecha(meta.creada) : null],
        ['Versión registrada', meta?.version_registro != null ? `${meta.registro ? `${meta.registro} ` : ''}versión ${meta.version_registro}` : null],
        ['Versión del modelo', meta?.version_modelo != null ? String(meta.version_modelo) : null],
        ['Paquete', delPaquete ?? (paquete.isSuccess && meta ? 'No está en el paquete activo' : null)],
      ]} />
    </Panel>
  )
}
