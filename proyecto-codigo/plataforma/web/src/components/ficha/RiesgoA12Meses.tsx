// «Riesgo a los 12 meses, visita por visita» (S7): por cada desenlace a 12 meses del paquete activo, el riesgo del niño con lo
// medido hasta cada visita a la que fue (40 semanas, 3 meses, ...), lo que más pesó en cada una y cuánto cambió al sumar la
// visita. La usan la ficha del niño y «Calcular un niño»; cada columna sale de la misma consulta del servidor, que no usa
// datos de visitas posteriores. «Cómo se calculó» (modelo, entrenamiento, calibración) sale una vez al pie de la sección: el
// modelo es el mismo para todos los desenlaces; cada uno dice su visita («Calculado a …») y si está «En prueba». Ningún rótulo
// sale sin contenido propio: «Lo que más pesó» solo con algo debajo y los datos que faltan en su propia línea.
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import type { RiesgoPorCorte } from '../../api/ninos'
import { cn } from '../../lib/cn'
import { aCsv, descargar, nombreArchivo, type FilaCsv } from '../../lib/exportar'
import { type ColumnaDeRiesgo, type FamiliaDelNino, familiasDelNino, fraseCalibrada, razonSinRiesgo, sinFamilia, textoPorcentaje } from '../../lib/familias'
import { fecha, RIESGO_ALTO } from '../../lib/formato'
import { AYUDA_MOTIVOS, ayudaPosicion, frenteDemas, motivosRiesgo, nivelAlto } from '../../lib/lenguaje'
import { DatosQueFaltan, EnPrueba } from '../ficha'
import { MiniSerie, type PuntoSerie } from '../graficos'
import { Aviso, Boton, Cargando, Insignia, Panel, Tabla } from '../ui'

const TITULO = 'Riesgo a los 12 meses, visita por visita'
const INTRO = 'Cada columna es el riesgo del niño con lo medido hasta esa visita: no usa datos de visitas posteriores. Así se ve cuánto cambia con cada visita.'
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

interface Propiedades {
  historia?: RiesgoPorCorte | null
  cargando?: boolean
  error?: Error | null
  reintentar?: () => void
}

/** `solo`: la clave de una familia; sin ella salen todas, una bajo otra. */
export function RiesgoA12Meses({ historia, cargando, error, reintentar, solo }: Propiedades & { solo?: string }) {
  const id = useId()
  if (cargando) return <Panel titulo={TITULO}><Cargando texto="Calculando el riesgo visita por visita…" /></Panel>
  if (error) {
    return (
      <Panel titulo={TITULO}>
        <Aviso>{error.message}</Aviso>
        {reintentar && <Boton variante="secundario" chico className="mt-3" onClick={reintentar}>Reintentar</Boton>}
      </Panel>
    )
  }
  // una respuesta sin las familias es de una API anterior: no hay nada que comparar
  if (!historia?.familias) return null
  const { mostradas: todas, ausentes } = familiasDelNino(historia)
  const mostradas = solo ? todas.filter((f) => f.familia.clave === solo) : todas
  return (
    <section aria-labelledby={id} className="space-y-3 lg:space-y-4">
      {solo ? <h2 id={id} className="sr-only">{TITULO}</h2> : (
        <div>
          <h2 id={id}>{TITULO}</h2>
          <p className="mt-1 text-sm">{INTRO}</p>
        </div>
      )}
      {/* con una sola familia (una pestaña) la explicación va en su tarjeta y el pie no la repite */}
      {mostradas.map((f) => <Familia key={f.familia.clave} f={f} intro={solo ? INTRO : undefined} />)}
      <ComoSeCalculo familias={mostradas} historia={historia} sinIntro={solo != null} />
      {ausentes.length > 0 && (
        <ul className="space-y-1 text-sm">{ausentes.map((a) => <li key={a.clave}>{sinFamilia(a.nombre)}</li>)}</ul>
      )}
    </section>
  )
}

/** Las pestañas del riesgo a 12 meses: una por desenlace, para que cada una tenga el alto de un solo desenlace. Mientras carga,
 * si falla o si el paquete no trae ninguno, una sola con la sección entera. Sin las familias (API anterior), ninguna. */
export function seccionesDeRiesgo(p: Propiedades): { clave: string; texto: string; contenido: ReactNode }[] {
  const entera = [{ clave: 'riesgo', texto: 'Riesgo a 12 meses', contenido: <RiesgoA12Meses {...p} /> }]
  if (p.cargando || p.error) return entera
  if (!p.historia?.familias) return []
  const { mostradas, ausentes } = familiasDelNino(p.historia)
  if (mostradas.length === 0) return ausentes.length > 0 ? entera : []
  return mostradas.map(({ familia }) => ({
    clave: `riesgo-${familia.clave}`,
    texto: textoDePestana(familia.nombre),
    contenido: <RiesgoA12Meses {...p} solo={familia.clave} />,
  }))
}

/** «talla baja para la edad a los 12 meses» -> «Talla baja a 12 meses» */
const textoDePestana = (nombre: string) => {
  const corto = nombre.replace(' a los 12 meses', ' a 12 meses').replace(' para la edad', '')
  return corto.charAt(0).toUpperCase() + corto.slice(1)
}

/** Un desenlace a 12 meses de la pestaña «Desenlaces» de la ficha: su tarjeta con una columna por visita y, al pie, cómo se calculó.
 * Va en una columna más angosta que la página entera, así que la gráfica de evolución pasa al costado solo en pantallas muy anchas. */
export function DetalleDe12Meses({ f, historia }: { f: FamiliaDelNino; historia: RiesgoPorCorte }) {
  return (
    <div className="space-y-3">
      <Familia f={f} intro={INTRO} enColumna />
      <ComoSeCalculo familias={[f]} historia={historia} sinIntro />
    </div>
  )
}

function Familia({ f, intro, enColumna }: { f: FamiliaDelNino; intro?: string; enColumna?: boolean }) {
  const { familia, columnas, sinRiesgo } = f
  const [tabla, setTabla] = useState(false)
  const ultima = columnas[columnas.length - 1]
  const titulo = (
    <h3 className="flex flex-wrap items-center gap-2 text-base">
      Riesgo de {familia.nombre}
      {familia.estado === 'en_prueba' && <EnPrueba />}
    </h3>
  )
  const filas = columnas.map(filaDe)
  const nombreCsv = `riesgo-${familia.clave}`
  return (
    // «Cada columna es…» solo se explica si hay columnas
    <Panel titulo={titulo} descripcion={[familia.definicion, columnas.length > 0 ? intro : null].filter(Boolean).join(' ') || null}
      accion={columnas.length > 0 && (
        <span className="no-imprimir flex flex-wrap items-center gap-2">
          <Boton variante={tabla ? 'primario' : 'secundario'} chico aria-pressed={tabla} onClick={() => setTabla(!tabla)}>Ver como tabla</Boton>
          <Boton variante="secundario" chico aria-label={`Descargar CSV: riesgo de ${familia.nombre}`}
            onClick={() => descargar(new Blob([aCsv(filas, COLUMNAS_TABLA)], { type: 'text/csv;charset=utf-8' }), nombreArchivo(nombreCsv, 'csv'))}>
            CSV
          </Boton>
        </span>
      )}>
      {columnas.length === 0 ? (
        <>
          <p className="text-sm font-semibold">No hay riesgo calculado para este niño en este desenlace.</p>
          <Razones cortes={sinRiesgo} />
        </>
      ) : tabla ? <TablaDeColumnas filas={filas} nombre={familia.nombre} /> : (
        <>
          {/* con tres columnas la gráfica de evolución cabe a su derecha; con más, va debajo. Con dos sería una raya entre dos
              puntos: las columnas ya dicen el cambio */}
          <div className={cn(columnas.length === 3 && (enColumna
            ? '2xl:grid 2xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] 2xl:gap-4'
            : 'lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] lg:gap-4'))}>
            <Columnas columnas={columnas} enUso={familia.estado === 'en_uso'} />
            {columnas.length >= 3 && <Evolucion columnas={columnas} nombre={familia.nombre} aLaDerecha={columnas.length === 3} enColumna={enColumna} />}
          </div>
          <Razones cortes={sinRiesgo} />
        </>
      )}
      {ultima && (
        <p className="mt-4 border-t border-linea pt-3 font-semibold">{fraseCalibrada(ultima.punto.riesgo, familia.nombre, familia.estado === 'en_uso' && ultima.corte.estado !== 'en_prueba')}</p>
      )}
    </Panel>
  )
}

function Columnas({ columnas, enUso }: { columnas: ColumnaDeRiesgo[]; enUso: boolean }) {
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
      {columnas.map((c, i) => {
        const { punto, cambio, corte } = c
        const alto = punto.percentil >= RIESGO_ALTO
        const { suben, faltan } = motivosRiesgo(punto.motivos ?? [])
        const ultima = i === columnas.length - 1
        return (
          <li key={corte.clave} className={cn('rounded-control p-3', ultima ? 'bg-teal-tinte' : 'border-t border-linea sm:border-t-0')}>
            <h4 className="flex flex-wrap items-center gap-2 text-sm">
              Calculado a {corte.momento_nombre}
              {enUso && corte.estado === 'en_prueba' && <EnPrueba />}
            </h4>
            <p className={cn('mt-1 text-3xl font-bold leading-tight tabular-nums', alto ? 'text-coral-hondo' : 'text-teal')}>{textoPorcentaje(punto.riesgo)}</p>
            <p className="text-sm" title={ayudaPosicion(punto.percentil)}>{frenteDemas(punto.percentil)}</p>
            {nivelAlto(punto.percentil) && <Insignia tono="coral" className="mt-1">{nivelAlto(punto.percentil)}</Insignia>}
            {cambio && <Cambio c={cambio} />}
            {punto.motivos && (
              <div className="mt-3 space-y-1 text-sm">
                {/* el rótulo solo sale con algo debajo; los datos que faltan son su propia línea, no lo que más pesó */}
                {suben.length > 0 && (
                  <div>
                    <p className="font-semibold" title={AYUDA_MOTIVOS}>Lo que más pesó</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{suben.map((m) => <li key={m}>{m}</li>)}</ul>
                  </div>
                )}
                <DatosQueFaltan faltan={faltan} />
                {suben.length === 0 && faltan.length === 0 && <p>Ningún dato subió el riesgo de forma notable.</p>}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Cambio({ c }: { c: NonNullable<ColumnaDeRiesgo['cambio']> }) {
  const Icono = c.sentido === 'subio' ? ArrowUp : c.sentido === 'bajo' ? ArrowDown : Minus
  return (
    <p className={cn('mt-2 flex items-start gap-1.5 text-sm font-semibold', c.sentido === 'subio' ? 'text-coral-hondo' : 'text-teal')}>
      <Icono size={16} aria-hidden className="mt-0.5 shrink-0" />
      {c.texto}
    </p>
  )
}

/** Cómo fue cambiando el riesgo de visita en visita. La tabla de «Ver como tabla» trae los mismos datos. */
function Evolucion({ columnas, nombre, aLaDerecha, enColumna }: { columnas: ColumnaDeRiesgo[]; nombre: string; aLaDerecha: boolean; enColumna?: boolean }) {
  const ordenes = columnas.map((c) => c.corte.orden)
  const dominioX: [number, number] = ordenes.length > 1 ? [ordenes[0], ordenes[ordenes.length - 1]] : [ordenes[0] - 0.5, ordenes[0] + 0.5]
  const techo = Math.min(100, Math.max(10, Math.ceil((100 * Math.max(...columnas.map((c) => c.punto.riesgo))) / 10) * 10))
  const nombres = new Map(columnas.map((c) => [c.corte.orden, c.corte.momento_nombre]))
  return (
    <div className={cn('mt-4', aLaDerecha && (enColumna ? '2xl:mt-0' : 'lg:mt-0'))}>
      {aLaDerecha && <p className={cn('mb-1 hidden text-sm font-semibold', enColumna ? '2xl:block' : 'lg:block')}>Cómo cambió el riesgo</p>}
      <MiniSerie
        alto={aLaDerecha ? 170 : 120}
        etiqueta={`Riesgo de ${nombre} por visita: ${columnas.map((c) => `${c.corte.momento_nombre}, ${textoPorcentaje(c.punto.riesgo)}`).join('; ')}`}
        puntos={columnas.map((c): PuntoSerie => ({
          x: c.corte.orden, y: 100 * c.punto.riesgo, marcado: c.punto.percentil >= RIESGO_ALTO,
          titulo: `Visita de ${c.corte.momento_nombre}`,
          detalle: [`Probabilidad estimada: ${textoPorcentaje(c.punto.riesgo)}`, frenteDemas(c.punto.percentil), ...(c.cambio ? [c.cambio.texto] : [])],
        }))}
        dominioY={[0, techo]} ticksY={[0, techo / 2, techo]} formatoY={(v) => `${v} %`}
        dominioX={dominioX} ticksX={ordenes} formatoX={(v) => nombres.get(v) ?? ''}
      />
    </div>
  )
}

function Razones({ cortes }: { cortes: FamiliaDelNino['sinRiesgo'] }) {
  if (!cortes.length) return null
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {cortes.map((c) => <li key={c.clave}>{razonSinRiesgo(c)}</li>)}
    </ul>
  )
}

/** El modelo con que se calculó todo lo de arriba, una sola vez; la calibración se dice por desenlace solo si difiere. */
function ComoSeCalculo({ familias, historia, sinIntro }: { familias: FamiliaDelNino[]; historia: RiesgoPorCorte; sinIntro?: boolean }) {
  const conRiesgo = familias.filter((f) => f.columnas.length > 0)
  if (conRiesgo.length === 0) return null
  const calibraciones = conRiesgo.map((f) => ({ nombre: f.familia.nombre, con: f.columnas[f.columnas.length - 1].corte.calibrado_con }))
  const distintas = new Set(calibraciones.map((c) => c.con).filter((c): c is string => c != null))
  const calibrado = distintas.size === 0 ? null
    : distintas.size === 1 ? `Calibrado con los niños más recientes (${[...distintas][0]})`
      : `Calibrado con los niños más recientes: ${calibraciones.filter((c) => c.con).map((c) => `${c.nombre} (${c.con})`).join('; ')}`
  const partes = [
    sinIntro ? null : 'Cada columna se calculó solo con lo medido hasta su visita',
    historia.modelo ? `Modelo clínico ${historia.modelo.version}` : `Paquete de modelos ${historia.paquete}`,
    historia.modelo?.entrenado ? `Entrenamiento del ${fecha(historia.modelo.entrenado)}` : null,
    calibrado,
  ].filter((p): p is string => p != null)
  return (
    <div className="border-t border-linea pt-3">
      <h4 className="text-sm">Cómo se calculó</h4>
      <p className="mt-0.5 text-sm">{partes.join(' · ')}</p>
    </div>
  )
}

// ------------------------------------------------------------------ la misma información como tabla

const COLUMNAS_TABLA = ['Visita', 'Riesgo', 'Frente a los demás niños', 'Cambio', 'Lo que más pesó']

function filaDe(c: ColumnaDeRiesgo): FilaCsv {
  const { suben, faltan } = motivosRiesgo(c.punto.motivos ?? [])
  return {
    Visita: c.corte.momento_nombre,
    Riesgo: textoPorcentaje(c.punto.riesgo),
    'Frente a los demás niños': frenteDemas(c.punto.percentil),
    Cambio: c.cambio?.texto ?? '—',
    'Lo que más pesó': [...suben, ...faltan.map((m) => `Falta: ${minuscula(m)}`)].join('; ') || '—',
  }
}

function TablaDeColumnas({ filas, nombre }: { filas: FilaCsv[]; nombre: string }) {
  return (
    <Tabla>
      <caption className="sr-only">Riesgo de {nombre}, visita por visita</caption>
      <thead><tr>{COLUMNAS_TABLA.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
      <tbody>
        {filas.map((f) => (
          <tr key={String(f.Visita)}>
            {COLUMNAS_TABLA.map((c) => <td key={c}>{f[c]}</td>)}
          </tr>
        ))}
      </tbody>
    </Tabla>
  )
}
