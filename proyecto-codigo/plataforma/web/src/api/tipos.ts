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
  /** Por clave de desenlace: primera visita en riesgo alto, o null. */
  primera_alerta?: Record<string, PrimeraAlerta | null>
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
  perfil?: PerfilProvisional
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
  /** Crecimiento frente a la OMS hasta la visita del riesgo. */
  crecimiento: Record<string, PuntoCrecimiento[]>
}

export interface ResumenRevision {
  corrida_id: number
  datos_por_capa: { capa: string; respuestas: number; si: number; no: number; no_se: number; precision_pct: number }[]
  riesgos_por_grupo: { grupo: string; respuestas: number; si: number; no: number; preocupa_pct: number }[]
}

/** GET /revision/datos/aciertos: de las k primeras alertas de la cola, qué porcentaje de las ya respondidas se marcó «error». */
export interface AciertosRevision {
  corrida_id: number
  serie: { k: number; respondidas: number; precision: number | null }[]
  respondidas: number
  /** % de todas las alertas respondidas que se confirmaron como error (null si nadie ha respondido) */
  confirmadas_error_pct: number | null
}

/** GET /revision/datos/concentracion: alertas por variable y, con más de un grupo o sede, por grupo y variable.
 * Lo que tiene menos de `minimo_celda` alertas viene sumado en `otras_*`. */
export interface ConcentracionAlertas {
  corrida_id: number
  hay_sede: boolean
  minimo_celda: number
  por_variable: { variable: string; etiqueta: string | null; alertas: number }[]
  otras_variables: number
  celdas: { grupo: string; variable: string; etiqueta: string | null; alertas: number }[]
  otras_celdas: number
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

/** Perfil provisional al nacer (D12): categorías, nunca valores numéricos. */
export interface PerfilProvisional {
  eg: string | null
  eg_etiqueta: string | null
  lubchenco: string | null
  lubchenco_etiqueta: string | null
  visita: string | null
  etiqueta_corta: string
}

/** Primera visita en que el riesgo de un desenlace llegó a alto (D29). */
export interface PrimeraAlerta { momento: string; momento_nombre: string; orden: number }

// ---- Mis modelos (cola de entrenamiento y banco compartido)

export interface ItemCola {
  id: number
  estado: 'pendiente' | 'en_curso'
  posicion: number
  estimado_min: number | null
  propietario: string | null
  visibilidad: 'personal' | 'oficial'
  nombre: string | null
  muestra_id: number | null
  creada_en: string | null
  propia: boolean
  cancelable: boolean
}

export interface LimitesPersona {
  sin_limite: boolean
  cola_max: number
  cola_usada: number
  modelos_max: number
  modelos_usados: number
  dias_sin_uso?: number
}

export interface CuotasConfig { cola_max: number; modelos_max: number; dias_sin_uso: number; dias_aviso: number }

export interface ColaEntrenamientos {
  items: ItemCola[]
  limites: LimitesPersona
  promedio_min: number | null
}

export interface ItemBanco {
  id: number
  propietario: string | null
  visibilidad: 'personal' | 'oficial'
  nombre: string | null
  descripcion: string | null
  fuente: string
  modelos: string[]
  muestra_id: number | null
  muestra: string | null
  corte: string | null
  corte_anterior: boolean
  auc: number | null
  terminada: string | null
  propia: boolean
  descartado: boolean
  propietario_id?: string | null
  metricas?: Record<string, Record<string, number>>
  vence_en_dias?: number | null
}

// ------------------------------------------------------------------ Analítica de los modelos (a mano; contrato de rutas/analitica.py)
export interface AnaliticaSubmodulo { id: string; estado: 'ok' | 'pendiente' }
export interface AnaliticaDesenlace { clave: string; nombre?: string; momento?: string; etiqueta?: string }
export interface AnaliticaMeta {
  entrenamiento: number; ejecucion?: number | null; modelo: string | null; fuente?: string | null; registro?: string | null
  version_registro?: string | number | null; version_modelo?: string | number | null; corte?: string | null; creada?: string | null
  desenlaces: AnaliticaDesenlace[]; submodulos: AnaliticaSubmodulo[]
}
export interface AnaliticaEntrenamientos { entrenamientos: AnaliticaMeta[] }
export interface AnaliticaContexto {
  estado: 'ok' | 'sin_artefactos'; entrenamiento: number | null
  modelos: { modelo: string | null; registro?: string | null; version_registro?: string | number | null; version_modelo?: string | number | null; fuente?: string | null; corte?: string | null }[]
  desenlaces: AnaliticaDesenlace[]; submodulos: AnaliticaSubmodulo[]
  entrenamientos: { entrenamiento: number; creada?: string | null; version_registro?: string | number | null }[]
}
export interface RespuestaAnalitica<T = Record<string, unknown>> {
  estado: 'ok' | 'pendiente' | 'sin_artefactos'; entrenamiento: number; submodulo: string
  meta?: AnaliticaMeta; desenlaces?: Record<string, T>
}
export interface AucIc { auc: number | null; ic_bajo: number | null; ic_alto: number | null; n: number; casos: number | null }
export interface FilaTop {
  k: number; alertas: number; casos_detectados_pct: number | null; alertas_acertadas_pct: number | null
  sin_falsa_alarma_pct: number | null; alertas_por_1000: number | null
}
export interface DatosRendimiento {
  estado?: 'insuficiente'; n?: number
  auc_desenlace: AucIc; roc: { puntos: [number, number][] }; pr: { puntos: [number, number][]; prevalencia: number | null }; pr_auc?: number | null
  metricas_por_top: (FilaTop & { top_pct: number })[]; metricas_por_percentil: (FilaTop & { percentil: number })[]
  confusion_por_top: { top_pct: number; tp: number | null; fp: number | null; fn: number | null; tn: number | null }[]
  lift: { tasa_general: number | null; deciles: { decil: number; niños: number; tasa: number | null; lift: number | null }[]; acumulado: { top_pct: number; lift: number | null }[] }
  top_k: { k: number; casos: number | null; acertadas_pct: number | null; detectados_pct: number | null }[]
}
export interface DatosCalibracion {
  estado?: 'insuficiente'; n: number; brier: number | null; ece?: number | null; riesgo_medio: number | null; observado: number | null
  razon_riesgo_observado: number | null
  bins: { bin: number; n: number; riesgo_medio: number | null; observado: number | null }[]
  histograma: { desde: number | null; hasta: number | null; n: number | null }[]
  decision?: { prevalencia: number | null; lectura?: string; puntos: { umbral: number; modelo: number | null; todos: number | null; ninguno: number; alertas_pct: number | null }[] }
  /** Falta en entrenamientos anteriores a esta función (D32). */
  hist_riesgo?: HistRiesgo
}
export interface HistRiesgo {
  estado: 'ok' | 'insuficiente'; n: number; casos: number | null
  tramos: { desde: number | null; hasta: number | null; con: number | null; sin: number | null }[]
  riesgo_medio_con: number | null; riesgo_medio_sin: number | null; mediana_con: number | null; mediana_sin: number | null
}
export interface FilaSubgrupo extends AucIc {
  grupo: string; riesgo_medio: number | null; observado: number | null; tasa_alerta_top10: number | null; sensibilidad_top10: number | null
}
export interface DatosEquidad { subgrupos: Record<string, FilaSubgrupo[]> }
export interface DatosEstabilidad {
  umbral_riesgo?: number | null
  metricas_trimestre?: (AucIc & { trimestre: string })[]
  alertas_trimestre?: { trimestre: string; n: number; alertas: number | null; alertas_por_1000: number | null; casos: number | null }[]
  psi?: { referencia?: string; trimestres?: string[]; variables?: Record<string, Record<string, number | null>> }
}
export interface DatosPoblacion {
  embudo: Record<string, string | number | null>[]
  eventos: { niños: number; casos: number | null; tasa: number | null }
  nulos: { variable: string; nulos_pct: number | null }[]
  /** Falta en entrenamientos anteriores a esta función (D32). */
  distribuciones_muestra_universo?: DistribucionesMuestraUniverso
}
export interface DistribucionesMuestraUniverso {
  estado: 'ok' | 'insuficiente'; universo: string; muestra: string; minimo_ninos: number
  categoricas: Record<string, {
    n_universo: number; n_muestra: number; diferencia_maxima_pp: number | null
    categorias: { categoria: string; n_universo: number | null; n_muestra: number | null; pct_universo: number | null; pct_muestra: number | null; diferencia_pp: number | null }[]
  }>
  numericas: Record<string, { n_universo: number; n_muestra: number
    universo: Record<'p5' | 'p25' | 'p50' | 'p75' | 'p95', number | null>; muestra: Record<'p5' | 'p25' | 'p50' | 'p75' | 'p95', number | null> }>
}
export interface TramoShap { tramo: number; n: number | null; valor_medio: number | null; shap_medio: number | null }
export interface DatosInterpretabilidad {
  importancia: { variable: string; importancia_pct: number }[]
  shap?: unknown
  avisos: string[]
  /** Los cuatro siguientes faltan en entrenamientos anteriores a esta función (D32). */
  shap_global?: { n: number; metodo: string; advertencia: string
    variables: { variable: string; etiqueta: string; importancia: number; importancia_pct: number; n: number }[]
    deciles: Record<string, TramoShap[]> } | null
  pdp?: { n: number; riesgo_medio: number; advertencia: string
    variables: { variable: string; etiqueta: string; n: number; categorica: boolean; puntos: [number, number][] }[] } | null
  motivos_frecuentes?: { n_alertas: number; por_nino: number; advertencia: string
    motivos: { variable: string; etiqueta: string; n: number | null; pct: number | null }[] } | null
  interaccion?: { n: number; advertencia: string
    pares: { a: string; b: string; etiqueta_a: string; etiqueta_b: string; cortes_a: number[]; cortes_b: number[]
      celdas: { i: number; j: number; n: number | null; riesgo_medio: number | null }[] }[] } | null
}
export interface Semaforo { id: string; nombre: string; estado: 'verde' | 'ambar' | 'rojo' | 'gris'; valor: number | null; detalle: string; umbral: string }
export interface DatosResumen extends Partial<AucIc> { umbrales?: Record<string, string>; semaforos?: Semaforo[]; estado?: string }

// ---- Explorar y muestras (filtros de niños), a mano hasta regenerar esquema.d.ts
export type ValorFiltro = string | number | boolean | null
export interface EntradaFiltro {
  variable: string
  tipo: 'lista' | 'si_no' | 'numero'
  op: 'en' | 'es' | 'entre'
  valores: ValorFiltro[]
  cuando?: string
}
/** El tiempo de la muestra: qué fecha manda y el período (rango fijo o los últimos N meses desde el corte). */
export interface TiempoJson { fecha: string; modo: 'periodo' | 'ultimos_meses'; desde?: string | number; hasta?: string }
/** Todos los niños que cumplen, o a lo más ``maximo_por_categoria`` de cada categoría de ``por``. */
export interface MuestreoJson { modo: 'todos' | 'estratificado'; por?: string; maximo_por_categoria?: number; semilla?: number }
export interface MuestraJson { version: 2; y: EntradaFiltro[]; tiempo?: TiempoJson; muestreo?: MuestreoJson }
/** Una variable agregada al panel con la regla con que se lee (primera, ultima, alguna o etapa:<visita>). */
export interface VariableExtra { variable: string; cuando: string }
export interface OpcionFaceta { valor: string | number | boolean; etiqueta: string; n: number | null; texto: string; rango?: [number | null, number | null] }
export interface BinFaceta { desde: number; hasta: number; n: number | null; texto: string }
export interface Faceta {
  etiqueta: string
  tipo: 'lista' | 'si_no' | 'numero'
  cuando: string | null
  /** Las reglas de lectura que se pueden elegir (solo las variables que se miden en cada visita). */
  reglas?: string[]
  /** Sale de entrada (las de siempre y las marcadas «usar como filtro» en el Diccionario); las demás se agregan. */
  destacada?: boolean
  opciones?: OpcionFaceta[]
  min?: number | null
  max?: number | null
  bins?: BinFaceta[]
}
export interface DisponibleFaceta { variable: string; etiqueta: string; tipo: Faceta['tipo']; cuando: string | null; reglas: string[] }
export interface RespuestaFacetas {
  n: number | null; facetas: Record<string, Faceta>; insuficiente?: boolean; minimo: number; n_base?: number
  /** Ningún niño cumple los filtros (``n`` es 0): un cero verdadero, no una cifra oculta. */
  vacio?: boolean
  tiempo?: { campos: { valor: string; etiqueta: string }[]; defecto: string; hay_fecha_nacimiento: boolean; desde: number | null; hasta: number | null; corte: string | null }
  muestreo?: { por: { valor: string; etiqueta: string }[] }
  etapas?: { etapa: string; nombre: string }[]
  disponibles?: DisponibleFaceta[]
}
export interface MuestraGuardada {
  id: number; titulo: string; descripcion: string | null; fuente: string; corte: string | null; definicion: MuestraJson
  n_ninos: number; n_base: number; huella: string; resumen: Record<string, Record<string, number | null>> | null
  propietario: string | null; creada: string; inmutable: boolean
}
export interface DistribucionGrupo {
  etiqueta: string
  categorias: { categoria: string; etiqueta: string; grupo: number | null; todos: number }[]
}
/** Menos de 20 niños (``ninos`` nulo: cifra oculta) o ninguno (``vacio``, ``ninos`` 0). */
export interface ExplorarInsuficiente { insuficiente: true; vacio?: boolean; ninos: number | null; minimo: number }
export interface ExplorarResumen {
  insuficiente: false
  minimo: number
  corrida: Corrida
  corte: string | null
  filtrado: boolean
  ninos: number
  ninos_total: number
  datos: number
  ninos_riesgo_alto: number
  riesgos_altos: number
  percentil_alto: number
  riesgos_por_desenlace: RiesgoDesenlace[]
  crecimiento_por_etapa: CrecimientoEtapa[]
  pct_crecimiento_bajo: number | null
  distribuciones: Record<string, DistribucionGrupo>
  /** Si la muestra trae tope por categoría: con cuántos niños se entrenaría (las cifras de arriba son del grupo completo). */
  muestreo?: { modo: 'estratificado'; por: string | null; maximo_por_categoria: number | null; ninos: number | null } | null
}
export type RespuestaExplorar = ExplorarInsuficiente | ExplorarResumen
export type CuerpoExplorar = ({ muestra: MuestraJson; muestra_id?: undefined } | { muestra_id: number; muestra?: undefined })
  & { variables?: VariableExtra[] }

// ---- Predicción (muestra, universo y niño nuevo), a mano hasta regenerar esquema.d.ts
export interface ModeloPrediccion {
  version: string; origen: 'oficial' | 'personal'; dueno: string | null; activo: boolean; fuente: string; corte: string | null
  creado: string | null; corte_anterior: boolean; aviso: string | null
}
export interface ModelosPrediccion { corte_vigente: string | null; activo: string | null; modelos: ModeloPrediccion[] }
export interface ResumenModeloPrediccion { version: string; corte: string | null; corte_anterior: boolean; corte_vigente: string | null }
export interface FilaPrediccion {
  sujeto: string; clave: string; desenlace: string; momento: string; momento_nombre: string; riesgo: number; percentil: number
  nivel: 'muy_alto' | 'alto' | 'resto'; perfil: string | null; primera_alerta: string | null; motivos: string[]
}
export interface DesenlacePrediccion {
  clave: string; desenlace: string; momento: string; momento_nombre: string; n: number; riesgo_mediano: number; altos: number; muy_altos: number
}
export interface AgregadosPrediccion {
  n_puntuados: number
  deciles: number[]
  histograma: { desde: number; hasta: number; n: number }[]
  niveles: { muy_alto: number; alto: number; resto: number; percentil_alto: number; percentil_muy_alto: number }
  por_desenlace: DesenlacePrediccion[]
}
export interface PrediccionBase {
  modelo: ResumenModeloPrediccion; visita: string | null; visita_nombre: string | null; n_filtro: number
  fuga_no_verificable: boolean; en_entrenamiento: number | null; excluidos: number; aviso_corte: string | null
  n_entrenamiento?: number | null
}
export interface PrediccionInsuficiente extends PrediccionBase { insuficiente: true; minimo: number; mensaje: string }
export interface PrediccionMuestra extends PrediccionBase {
  insuficiente: false; guardado: false; agregados: AgregadosPrediccion
  tabla: { total: number; pagina: number; limite: number; filas: FilaPrediccion[] }
}
export type RespuestaPrediccionMuestra = PrediccionInsuficiente | PrediccionMuestra
export interface CuerpoPrediccionMuestra {
  modelo?: string | null; muestra?: MuestraJson | null; muestra_id?: number | null; excluir_entrenamiento: boolean
  visita?: string | null; pagina?: number
}
export interface PerfilEjemplo { perfil: string; etiqueta: string; grupo: 'eg' | 'lubchenco'; n: number; insuficiente: boolean }
export interface VisitaEjemplo { etapa: string; nombre: string; orden: number }
export interface BibliotecaEjemplos { modelo: ResumenModeloPrediccion; visitas: VisitaEjemplo[]; perfiles: PerfilEjemplo[] }
export interface CampoEjemplo {
  variable: string; etiqueta: string; tipo: 'numero' | 'lista' | 'si_no' | 'fecha' | 'texto'; unidad: string | null
  opciones: { valor: string | number; etiqueta: string }[]; minimo: number | null; maximo: number | null
  principal: boolean; peso: number; etapa: string | null; valor: string | number; n: number; tipico: true
}
export type EjemploPrediccion = { modelo: ResumenModeloPrediccion; visita: string; visita_nombre: string; perfil: string | null; perfil_etiqueta: string; n: number } & (
  | { insuficiente: true; minimo: number }
  | { insuficiente: false; eg_semanas: number; campos: CampoEjemplo[]; visitas: VisitaEjemplo[] })
export interface RiesgoNinoNuevo {
  clave: string; desenlace: string; momento: string; momento_nombre: string; riesgo: number; percentil: number
  nivel: 'muy_alto' | 'alto' | 'resto'; motivos: string[]
}
export interface PuntoTrayectoria { clave: string; desenlace: string; momento: string; momento_nombre: string; orden: number; riesgo: number; percentil: number }
export type PrediccionNino = { modelo: ResumenModeloPrediccion; visita: string; guardado: false; nota: string } & (
  | { insuficiente: true; minimo: number; n: number; mensaje: string }
  | { insuficiente: false; n: number; perfil_ejemplo: string; eg_semanas: number; perfil: PerfilProvisional; riesgos: RiesgoNinoNuevo[]
      trayectoria: PuntoTrayectoria[]; linea_alerta: number; cambiados: string[] })

// ---- Predicción asíncrona (muestra y universo) y niños nuevos guardados (a mano hasta regenerar esquema.d.ts)
export interface CeldaVisitaPrediccion {
  clave: string; desenlace: string; momento: string; momento_nombre: string; orden: number; n: number; oculta: boolean
  riesgo_mediano: number | null; altos: number | null; pct_altos: number | null
}
export type EstadoTrabajo = 'pendiente' | 'en_curso' | 'ok' | 'error'
export interface TrabajoPrediccionResumen {
  id: number; tipo: 'muestra' | 'universo'; estado: EstadoTrabajo; progreso: number; paso: string | null; modelo: string | null
  n_filtro: number | null; n_puntuados: number | null; mensaje: string | null; creada: string | null; terminada: string | null; vence: string | null
}
export type ResultadoTrabajoPrediccion =
  | (PrediccionBase & { insuficiente: true; minimo: number; mensaje: string })
  | (PrediccionBase & { insuficiente: false; agregados: AgregadosPrediccion; por_visita: CeldaVisitaPrediccion[]; tabla_total: number })
export interface TrabajoPrediccion extends TrabajoPrediccionResumen {
  parametros: CuerpoPrediccionMuestra; resultado: ResultadoTrabajoPrediccion | null; tabla_disponible: boolean
}
export interface TablaPrediccion { total: number; pagina: number; limite: number; paginas: number; filas: FilaPrediccion[] }
export interface NinoGuardado {
  id: number; tipo: 'nino' | 'plantilla'; titulo: string; descripcion: string | null; modelo: string | null; visita: string
  perfil: string | null; eg_semanas: number | null; cambios: Record<string, string | number | null>; dueno: string | null
  propio: boolean; creada: string | null
}
export interface CuerpoGuardarNino {
  modelo?: string | null; visita: string; perfil: string; cambios: Record<string, string | number | null>
  titulo: string; descripcion?: string | null; tipo: 'nino' | 'plantilla'
}

// ---- analítica: trayectorias, perfiles y anticipación
export type IndicadorTrayectoria = 'peso' | 'talla' | 'perimetro_cefalico' | 'peso_para_talla'
export type AgruparTrayectoria = 'riesgo' | 'sexo' | 'perfil' | 'sede'
export type EjeTrayectoria = 'edad_corregida' | 'cronologica'
export interface EtapaTrayectoria {
  etapa: string; nombre: string; orden: number; n: number; edad_media_meses: number | null
  z_media: number | null; z_desvio: number | null; diferencia_oms: number | null
  valor_medio: number | null; valor_desvio: number | null; unidad: string | null
}
export interface GrupoTrayectoria { grupo: string; ninos: number; etapas: EtapaTrayectoria[] }
export interface NinoTrayectoria {
  codigo: string; grupo: string
  serie: { etapa: string; nombre: string; orden: number; edad_meses: number | null; z: number | null }[]
}
export interface RespuestaTrayectorias {
  estado: 'ok' | 'pendiente' | 'sin_artefactos'; entrenamiento: number; mensaje?: string
  indicador?: IndicadorTrayectoria; etiqueta_indicador?: string; etiqueta?: string; agrupar?: AgruparTrayectoria; eje?: EjeTrayectoria
  minimo_ninos?: number; grupos?: GrupoTrayectoria[]; celdas_omitidas?: number; grupos_omitidos?: number
  /** «sin_riesgo»: la corrida no calculó el riesgo de este desenlace (solo se calcula a los niños en seguimiento). */
  motivo?: 'sin_riesgo'
  fuente?: 'validacion'; nota?: string
  individuales_visibles?: boolean; individuales?: NinoTrayectoria[]
}
export interface FilaPerfil {
  categoria: string; etiqueta: string; n: number | null; tasa: number | null; oculto: boolean
  eg_media?: number | null; peso_medio?: number | null
  /** Guardadas al entrenar con los niños de validación: tasa observada del desenlace y proporción en riesgo alto. */
  tasa_observada?: number | null; tasa_riesgo_alto?: number | null
}
export interface RespuestaPerfiles {
  estado: 'ok' | 'pendiente' | 'sin_artefactos'; entrenamiento: number; mensaje?: string
  confianza?: { minimo_ninos: number; aprobacion: 'pendiente' | string; texto?: string }
  tasa_significa?: string; ninos?: number; categorias_ocultas?: number; unidad_peso?: string | null
  /** Si la corrida calculó el riesgo del desenlace; sin él, la tasa no existe (no es «n < 5»). */
  riesgo_disponible?: boolean; n_con_riesgo?: number; mensaje_riesgo?: string
  /** «validacion»: agregados guardados por el entrenamiento; sin él, calculados en vivo de la última corrida. */
  fuente?: 'validacion'; casos?: number
  eg?: FilaPerfil[]; lubchenco?: FilaPerfil[]
}
export interface VisitaAnticipacion {
  clave?: string; desde: string; etapa: string; ventaja_visitas: number; n?: number | null; casos: number | null; alertas: number
  casos_detectados_pct: number | null; alertas_acertadas_pct: number | null
}
export interface PorTopAnticipacion {
  top_pct: number; alertas: number; casos_detectados_pct: number | null; alertas_acertadas_pct: number | null
}
export interface VisitaMetricas {
  clave?: string; desde: string; etapa: string; ventaja_visitas: number; n: number | null; casos: number | null
  auc: number | null; por_top: PorTopAnticipacion[]
}
/** Métricas por visita de partida para los cinco porcentajes de alerta (5, 10, 20, 30 y 40 %). */
export interface MetricasPorVisita { familia: string; nombre: string; etiqueta?: string; tops: number[]; visitas: VisitaMetricas[] }
export interface FilaPrimeraAlerta { desde: string; ventaja_visitas: number; casos: number | null; pct: number | null }
/** Cuántos casos entraron al grupo de más riesgo por primera vez en cada visita de partida. */
export interface PrimeraAlertaAgregada {
  familia: string; nombre: string; etiqueta?: string; top_pct: number; casos: number | null; meta: string
  distribucion: FilaPrimeraAlerta[]; sin_alerta: { casos: number | null; pct: number | null }
  ventaja_visitas: { media: number | null; mediana: number | null }
}
export interface DatosAnticipacion {
  familia?: string; nombre?: string; top_pct?: number; etiqueta?: string; visitas: VisitaAnticipacion[]
  avisados_antes?: { casos: number | null; avisados: number | null; pct: number | null; meta: string }
  metricas_por_visita?: MetricasPorVisita; primera_alerta?: PrimeraAlertaAgregada
}
/** Un niño de ejemplo con su riesgo visita por visita (`GET /analitica/riesgo-por-visita`, solo experto y administrador). */
export interface NinoRiesgoVisita {
  sujeto: string; error?: string; puntos?: PuntoHistoria[]
  primera_alerta?: { clave: string; momento: string; momento_nombre: string; orden: number; percentil: number } | null
}
export interface RespuestaRiesgoPorVisita {
  corrida_id: number; desenlace: string; umbral_percentil: number; elegidos_por: 'pedido' | 'mayor_riesgo'; ninos: NinoRiesgoVisita[]
}
