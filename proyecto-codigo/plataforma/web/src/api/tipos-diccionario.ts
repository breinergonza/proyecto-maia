// Tipos del diccionario de variables con versiones (rutas /api/diccionario). Van aparte de tipos.ts: se escriben a mano
// a partir de maia_api/esquemas/diccionario.py hasta que se regenere esquema.d.ts.

export type EstadoVersion = 'vigente' | 'borrador' | 'archivado'
export type OrigenVersion = 'subido' | 'corrida' | 'semilla'

export type VersionDiccionario = {
  id: number
  version: number
  estado: EstadoVersion
  origen: OrigenVersion
  nota: string | null
  sha256: string
  tamano: number
  creado_por: string | null
  creado_en: string
}

export type VariableDiccionario = {
  variable: string
  etiqueta: string | null
  estado: string | null
  tema: string | null
  etapa: string | null
  visita: string | null
  nota: string | null
}

export type CambioEstado = VariableDiccionario & { antes: string | null; despues: string | null }

export type CambioDesenlace = { clave: string; nombre: string | null; antes: string | null; despues: string | null }

export type DiferenciasDiccionario = {
  nuevas: VariableDiccionario[]
  quitadas: VariableDiccionario[]
  estados: CambioEstado[]
  desenlaces_activados: CambioDesenlace[]
  desenlaces_apagados: CambioDesenlace[]
  sin_cambios: boolean
  vigente: number | null
}

export type BorradorDiccionario = { version: VersionDiccionario; nuevas: VariableDiccionario[] }

export type PorClasificar = {
  vigente: VersionDiccionario | null
  variables: VariableDiccionario[]
  borrador: BorradorDiccionario | null
  total: number
}

/** Una columna de una hoja, con lo que necesita su campo del formulario (sale del libro del núcleo). */
export type ColumnaVista = {
  clave: string
  titulo: string
  explica: string
  opciones: string[]
  lista: string | null
  largo: boolean
  tipo: 'texto' | 'numero' | 'fecha'
  obligatoria: boolean
}

export type HojaVista = {
  nombre: string
  describe: string
  clave: string
  agregar: boolean
  columnas: ColumnaVista[]
  filas: (string | null)[][]
}

export type VistaDiccionario = { version: VersionDiccionario; hojas: HojaVista[] }

export type Clasificacion = { variable: string; estado: 'Lista' | 'No usar' }


/** Un cambio de los formularios: la fila (por su primera columna) y las respuestas como se ven en el Excel. */
export type CambioFila = {
  hoja: string
  accion: 'editar' | 'agregar' | 'borrar'
  clave: string | null
  valores: Record<string, string | null>
}

export type Edicion = { base: number; cambios: CambioFila[]; nota: string | null }
