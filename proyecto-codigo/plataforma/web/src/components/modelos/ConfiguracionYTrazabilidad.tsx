// «Configuración» (con qué datos y cómo se entrenó) y «Trazabilidad» (qué entrenamiento es, de cuándo y en qué paquete está):
// lo que hace falta para reproducir o auditar el modelo. Solo se muestra lo que el entrenamiento guardó o el sistema sabe;
// lo que no se registró (p. ej. la versión del diccionario con que se entrenó) no se inventa.
import { Link } from 'react-router'
import type { AnaliticaMeta } from '../../api/tipos'
import { paqueteQueContiene } from '../../api/modelos'
import { puede, useSesion } from '../../auth/sesion'
import { usePaqueteActivo } from '../../lib/consultas'
import { fecha, numero } from '../../lib/formato'
import { datosAl } from '../../lib/lenguaje'
import { Panel } from '../ui'

function Datos({ filas }: { filas: [string, string | null | undefined][] }) {
  return (
    <dl className="divide-y divide-linea/70 text-sm">
      {filas.flatMap(([rotulo, valor]) => (valor ? [(
        <div key={rotulo} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 py-2 first:pt-0 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
          <dt className="font-semibold">{rotulo}</dt>
          <dd className="min-w-0 break-words">{valor}</dd>
        </div>
      )] : []))}
    </dl>
  )
}

const FUENTES: Record<string, string> = { simulado: 'Datos simulados', kmc: 'Base de la Fundación' }

/** Con qué datos y cómo se entrenó; los hiperparámetros van en su propia tarjeta (`HiperparametrosModelo`). Administración ve el
 *  enlace a los hiperparámetros del entrenamiento. */
export function ConfiguracionModelo({ meta }: { meta: AnaliticaMeta | undefined }) {
  const { usuario } = useSesion()
  return (
    <Panel titulo="Configuración"
      accion={puede(usuario, ['admin']) ? <Link to="/admin/entrenamientos" className="text-sm font-semibold text-teal hover:underline">Ver hiperparámetros ›</Link> : undefined}>
      <Datos filas={[
        ['Datos de entrenamiento', meta?.corte ? `${datosAl(meta.corte)}${meta.fuente ? `, ${(FUENTES[meta.fuente] ?? meta.fuente).toLowerCase()}` : ''}` : null],
        ['División de datos', 'Temporal por fecha de nacimiento: se entrena con los nacidos antes y se prueba con los más recientes.'],
        ['Algoritmo', 'Gradient boosting (LightGBM)'],
      ]} />
    </Panel>
  )
}

/** Los hiperparámetros con que se entrenó, en columnas a todo lo ancho: son datos cortos y no deben alargar la página.
 *  Solo si el entrenamiento los guardó; todos los perfiles los ven. */
export function HiperparametrosModelo({ meta }: { meta: AnaliticaMeta | undefined }) {
  if (!meta?.hiperparametros?.length) return null
  return (
    <Panel titulo="Hiperparámetros">
      <dl className="grid gap-x-8 text-sm md:grid-cols-2 xl:grid-cols-3">
        {meta.hiperparametros.map((h) => (
          <div key={h.nombre} className="flex items-baseline justify-between gap-4 border-b border-linea/70 py-2">
            <dt className="font-semibold">{h.etiqueta}</dt>
            <dd className="shrink-0 tabular-nums">{numero(h.valor)}</dd>
          </div>
        ))}
      </dl>
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
