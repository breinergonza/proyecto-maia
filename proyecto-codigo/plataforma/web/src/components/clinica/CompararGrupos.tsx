// Comparar grupos: por ahora la vista de grupos de la analítica, dentro de su propia página. La página de dos grupos A y B
// por pregunta la reemplaza más adelante.
import ComparaGruposVista from '../../paginas/analitica/ComparaGrupos'
import { Encabezado } from '../ui'

export default function CompararGrupos() {
  return (
    <div className="flex flex-col gap-2">
      <Encabezado titulo="Comparar grupos">Elija dos grupos de niños y vea en qué se parecen y en qué se diferencian.</Encabezado>
      <ComparaGruposVista />
    </div>
  )
}
