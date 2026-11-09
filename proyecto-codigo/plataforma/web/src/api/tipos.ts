// Tipos de la API. Los de entrada y salida con modelo Pydantic se generan de OpenAPI (npm run tipos);
// las respuestas que la API arma como diccionario se describen aquí a mano.
import type { components } from './esquema'

type S = components['schemas']
export type Usuario = S['UsuarioSalida']
export type Rol = Usuario['rol']
export type RespuestaLogin = S['RespuestaLogin']
export type UsuarioNuevo = S['UsuarioNuevo']
export type UsuarioCambio = S['UsuarioCambio']
export type Paquete = S['PaqueteSalida']
export type Corrida = S['CorridaSalida']
export type PeticionInferencia = S['PeticionInferencia']
export type ConfigNotificacion = S['ConfigNotificacionEntrada']
export type Respuesta = S['RevisionDatoEntrada']['es_error']
export type ResumenAdministracion = S['ResumenAdministracion']
export type Conexion = S['ConexionSalida']
export type ConexionEntrada = S['ConexionEntrada']
export type PruebaConexion = S['PruebaConexionSalida']
export type Hiperparametros = S['HiperparametrosSalida']
export type CampoHiperparametro = S['CampoHiperparametro']
export type Calendario = S['Calendario']
export type Programacion = S['ProgramacionSalida']
export type ProgramacionEntrada = S['ProgramacionEntrada']
export type Ejecucion = S['EjecucionSalida']
export type Entrenamiento = S['Entrenamiento']
export type Entrenamientos = S['Entrenamientos']

export interface Pagina<T> {
  total: number
  pagina: number
  tamano: number
  items: T[]
}

export interface Salud {
  db: boolean
  paquete: string | null
  entorno: 'local' | 'demo' | 'prueba' | 'produccion'
}

export interface RiesgoDesenlace {
  clave: string
  desenlace: string
  momento: string
  momento_nombre: string | null
  ninos: number
  altos: number
  riesgo_medio: number
}

export interface CrecimientoEtapa {
  etapa: string
  etapa_nombre: string | null
  indicador: string
  datos: number
  pct_bajo: number
  pct_caida: number
  z_mediano: number | null
  orden: number
}

/** Alarmas de grupo de un trimestre con una señal (solo trimestres con alguna). */
export interface AlarmasTrimestre {
  periodo: string
  senal: string
  alarmas: number
}

export interface ResumenTablero {
  corrida: Corrida
  corte: string | null
  fuente: string | null
  paquete: string | null
  ninos: number | null
  datos: number | null
  datos_revisar: number | null
  ninos_revisar: number | null
  datos_revisados: number
  alertas_por_1000: number | null
  alertas_por_capa: Record<string, number>
  alarmas_grupo: number | null
  ninos_con_riesgo: number | null
  /** niños distintos con al menos un riesgo alto (no la suma por desenlace) */
  ninos_riesgo_alto: number
  riesgos_altos: number
  percentil_alto: number
  riesgos_por_desenlace: RiesgoDesenlace[]
  crecimiento_por_etapa: CrecimientoEtapa[]
}

export interface AlarmaGrupo {
  grupo: string | null
  periodo: string
  variable: string
  etiqueta: string | null
  senal: string
  valor: number | null
  referencia: number | null
  estadistico: number | null
  que_paso: string
}

export interface NinoFila {
  sujeto: string
  eg_semanas: number | null
  grupo: string | null
  percentil_max: number | null
  riesgo_max: number | null
  desenlace_max: string | null
  clave_max: string | null
  n_riesgos: number
  n_alertas: number
  n_bajo_2de: number
  n_caida_1de: number
  /** Medidas de crecimiento con puntaje (0: no hay con qué decir si crece bien). */
  n_crecimiento: number
  /** El último control con medidas de crecimiento. */
  ultima_visita: string | null
  ultima_fecha: string | null
  ultima_edad_corregida: number | null
}

export interface MedicionVisita {
  variable: string
  etiqueta: string
  valor: string | null
  unidad: string | null
  fecha: string | null
  tema: string | null
}

export interface AlertaDato {
  id: number
  variable: string
  etiqueta: string | null
  etapa: string | null
  valor: string | null
  esperado: number | null
  rango_bajo: number | null
  rango_alto: number | null
  capas: string[]
  motivo: string | null
  prioridad: number
}

export interface RiesgoNino {
  id: number
  clave: string
  desenlace: string
  momento: string
  riesgo: number
  percentil: number
  motivos: string[]
  fecha_visita: string | null
  /** Riesgo promedio de ese desenlace entre los niños de la corrida. */
  riesgo_medio: number
}

/** Riesgo de cada desenlace en cada visita, calculado a demanda con el paquete activo. */
export interface PuntoHistoria {
  clave: string
  desenlace: string
  momento: string
  momento_nombre: string
  orden: number
  riesgo: number
  percentil: number
  fecha_visita: string | null
}

export interface HistoriaRiesgo {
  paquete: string
  /** Paquete con que se calculó la corrida; si difiere de ``paquete``, la historia no es comparable 1:1. */
  paquete_corrida: string | null
  puntos: PuntoHistoria[]
}

export interface VariablePerfil {
  variable: string
  etiqueta: string
  unidad: string | null
  ninos: number
  cuantiles: { p5: number; p25: number; p50: number; p75: number; p95: number }
  valor: number | null
  /** 0 a 100: cuántos niños de la cohorte tienen un valor menor. */
  posicion: number | null
}

export interface PerfilNino {
  variables: VariablePerfil[]
}

export interface PuntoCrecimiento {
  etapa: string | null
  indicador: string
  fecha: string | null
  edad_corregida: number | null
  valor: number | null
  /** La unidad en que se registró ``valor`` (no se convierte). */
  unidad: string | null
  z: number | null
  bajo_2de: boolean
  caida_1de: boolean
  improbable: boolean
}

export interface Visita {
  etapa: string
  nombre: string
  orden: number
  fecha: string | null
  edad_corregida: number | null
  mediciones: MedicionVisita[]
  z: Record<string, number | null>
  alertas_dato: AlertaDato[]
  riesgos: RiesgoNino[]
}

export interface LineaTemporal {
  sujeto: string
  grupo: string | null
  eg_semanas: number | null
  anio_nacimiento: number | null
  corte: string | null
  corrida_id: number
  visitas: Visita[]
  contexto: (MedicionVisita | { variable: string; etiqueta: string | null; valor: string | null; alerta: AlertaDato })[]
  crecimiento: Record<string, PuntoCrecimiento[]>
  nombre_etapa: Record<string, string>
}

export interface DatoRevision {
  id: number
  prioridad: number
  sujeto: string
  variable: string
  etiqueta: string | null
  unidad: string | null
  etapa: string | null
  etapa_nombre: string | null
  fecha: string | null
  valor: string | null
  esperado: number | null
  rango_bajo: number | null
  rango_alto: number | null
  capas: string[]
  motivo: string | null
  fuerza: number | null
  es_error: Respuesta | null
  comentario: string | null
  /** Las medidas del mismo niño y el mismo concepto en cada visita (vacía si la variable no tiene concepto). */
  serie: PuntoSerieDato[]
}

export interface PuntoSerieDato {
  variable: string
  etapa_nombre: string | null
  orden: number
  valor: number
  /** El dato que se está revisando. */
  es_este: boolean
}

export interface RiesgoRevision {
  id: number
  sujeto: string
  clave: string
  desenlace: string
  momento: string
  momento_nombre: string | null
  fecha_visita: string | null
  preocupa: Respuesta | null
  comentario: string | null
  resumen: string[]
}

export interface ResumenRevision {
  corrida_id: number
  datos_por_capa: { capa: string; respuestas: number; si: number; no: number; no_se: number; precision_pct: number }[]
  riesgos_por_grupo: { grupo: string; respuestas: number; si: number; no: number; preocupa_pct: number }[]
}

/** GET /inferencia/formulario: los campos del formulario de cálculo, armados con el esquema del paquete activo. */
export interface CampoFormulario {
  variable: string
  etiqueta: string
  tipo: 'numero' | 'lista' | 'si_no' | 'fecha' | 'texto'
  unidad: string | null
  tema: string | null
  opciones: { valor: string; etiqueta: string }[]
  minimo: number | null
  maximo: number | null
  crecimiento: boolean
  /** 0 a 1: cuánto pesa en los modelos de riesgo frente a la variable que más pesa */
  peso: number
  principal: boolean
}

export interface VisitaFormulario {
  etapa: string
  nombre: string
  orden: number
  base: string | null
  edad_min: number | null
  edad_max: number | null
  /** los desenlaces que se calculan con lo medido hasta esta visita */
  desenlaces: string[]
  campos: CampoFormulario[]
}

export interface FormularioCalculo {
  paquete: string
  fuente: string
  generales: CampoFormulario[]
  visitas: VisitaFormulario[]
}

export interface ResultadoInferencia {
  paquete: string
  fuente: string
  variables_ignoradas: string[]
  alertas_dato: (Omit<AlertaDato, 'id'> & { sujeto: string })[]
  riesgos: (Omit<RiesgoNino, 'id'> & { sujeto: string })[]
  crecimiento: (PuntoCrecimiento & { sujeto: string })[]
}

export interface Notificacion {
  id: number
  destinatario: string
  estado: 'enviado' | 'error'
  error: string | null
  enviado_en: string
  sujeto: string
  desenlace: string
  percentil: number
  corrida_id: number
}

export type ConfigNotificacionSalida = Required<Pick<ConfigNotificacion, 'desenlace' | 'percentil_minimo' | 'destinatarios' | 'activo'>> & {
  nombre: string | null
}
