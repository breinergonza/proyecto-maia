// «Riesgo a los 12 meses, visita por visita» (S7): por cada desenlace a 12 meses del paquete activo, el riesgo del niño con lo
// medido hasta cada visita a la que fue (40 semanas, 3 meses, ...), lo que más pesó en cada una y cuánto cambió al sumar la
// visita. La usan la ficha del niño y «Calcular un niño»; cada columna sale de la misma consulta del servidor, que no usa
// datos de visitas posteriores. «Cómo se calculó» (modelo, entrenamiento, calibración) sale una vez al pie de la sección: el
// modelo es el mismo para todos los desenlaces; cada uno dice su visita («Calculado a …») y si está «En prueba».
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { useId, useState } from 'react'
import type { RiesgoPorCorte } from '../../api/ninos'
import { cn } from '../../lib/cn'
import { aCsv, descargar, nombreArchivo, type FilaCsv } from '../../lib/exportar'
import { type ColumnaDeRiesgo, type FamiliaDelNino, familiasDelNino, fraseCalibrada, razonSinRiesgo, sinFamilia, textoPorcentaje } from '../../lib/familias'
import { fecha, RIESGO_ALTO } from '../../lib/formato'
import { AYUDA_MOTIVOS, ayudaPosicion, frenteDemas, motivosRiesgo, nivelAlto } from '../../lib/lenguaje'
import { MiniSerie, type PuntoSerie } from '../graficos'
import { Aviso, Boton, Cargando, Insignia, Panel, Tabla } from '../ui'

const TITULO = 'Riesgo a los 12 meses, visita por visita'
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

export function RiesgoA12Meses({ historia, cargando, error, reintentar }: {
  historia?: RiesgoPorCorte | null
  cargando?: boolean
  error?: Error | null
  reintentar?: () => void
}) {
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
  const { mostradas, ausentes } = familiasDelNino(historia)
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div>
        <h2 id={id}>{TITULO}</h2>
        <p className="mt-1 text-sm">
          Cada columna es el riesgo del niño con lo medido hasta esa visita: no usa datos de visitas posteriores. Así se ve cuánto cambia con cada visita.
        </p>
      </div>
      {mostradas.map((f) => <Familia key={f.familia.clave} f={f} />)}
      <ComoSeCalculo familias={mostradas} historia={historia} />
      {ausentes.length > 0 && (
        <ul className="space-y-1 text-sm">{ausentes.map((a) => <li key={a.clave}>{sinFamilia(a.nombre)}</li>)}</ul>
      )}
    </section>
  )
}

function Familia({ f }: { f: FamiliaDelNino }) {
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
    <Panel titulo={titulo} descripcion={familia.definicion}
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
          <Columnas columnas={columnas} enUso={familia.estado === 'en_uso'} />
          {/* con dos visitas la gráfica sería una raya entre dos puntos: las columnas ya dicen el cambio */}
          {columnas.length >= 3 && <Evolucion columnas={columnas} nombre={familia.nombre} />}
          <Razones cortes={sinRiesgo} />
        </>
      )}
      {ultima && (
        <p className="mt-4 border-t border-linea pt-3 font-semibold">{fraseCalibrada(ultima.punto.riesgo, familia.nombre)}</p>
      )}
    </Panel>
  )
}

const EnPrueba = () => (
  <Insignia tono="ocre" className="font-semibold">
    <span title="Aún no se usa para dar alertas: se muestra para seguirlo y evaluarlo.">En prueba</span>
  </Insignia>
)

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
              <div className="mt-3">
                <p className="text-sm font-semibold" title={AYUDA_MOTIVOS}>Lo que más pesó</p>
                {suben.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{suben.map((m) => <li key={m}>{m}</li>)}</ul>}
                {faltan.length > 0 && <p className="mt-1 text-sm"><strong>Datos que faltan:</strong> {faltan.join(', ')}</p>}
                {suben.length === 0 && faltan.length === 0 && <p className="mt-1 text-sm">Ningún dato subió el riesgo de forma notable.</p>}
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
function Evolucion({ columnas, nombre }: { columnas: ColumnaDeRiesgo[]; nombre: string }) {
  const ordenes = columnas.map((c) => c.corte.orden)
  const dominioX: [number, number] = ordenes.length > 1 ? [ordenes[0], ordenes[ordenes.length - 1]] : [ordenes[0] - 0.5, ordenes[0] + 0.5]
  const techo = Math.min(100, Math.max(10, Math.ceil((100 * Math.max(...columnas.map((c) => c.punto.riesgo))) / 10) * 10))
  const nombres = new Map(columnas.map((c) => [c.corte.orden, c.corte.momento_nombre]))
  return (
    <div className="mt-4">
      <MiniSerie
        alto={120}
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
function ComoSeCalculo({ familias, historia }: { familias: FamiliaDelNino[]; historia: RiesgoPorCorte }) {
  const conRiesgo = familias.filter((f) => f.columnas.length > 0)
  if (conRiesgo.length === 0) return null
  const calibraciones = conRiesgo.map((f) => ({ nombre: f.familia.nombre, con: f.columnas[f.columnas.length - 1].corte.calibrado_con }))
  const distintas = new Set(calibraciones.map((c) => c.con).filter((c): c is string => c != null))
  const calibrado = distintas.size === 0 ? null
    : distintas.size === 1 ? `Calibrado con los niños más recientes (${[...distintas][0]})`
      : `Calibrado con los niños más recientes: ${calibraciones.filter((c) => c.con).map((c) => `${c.nombre} (${c.con})`).join('; ')}`
  const partes = [
    'Cada columna se calculó solo con lo medido hasta su visita',
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
