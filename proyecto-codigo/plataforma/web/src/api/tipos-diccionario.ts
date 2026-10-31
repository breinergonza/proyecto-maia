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

export type HojaVista = {
  nombre: string
  describe: string
  columnas: { clave: string; titulo: string }[]
  filas: (string | null)[][]
}

export type VistaDiccionario = { version: VersionDiccionario; hojas: HojaVista[] }

export type Clasificacion ={ variable: string; estado: 'Lista' | 'No usar' }
