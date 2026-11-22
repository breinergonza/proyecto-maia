// Entrenamientos propios: entrenar un modelo propio, ver la cola con la posición y el tiempo estimado, y el banco compartido.
// Los modelos personales no cambian el tablero ni envían correos; solo administración aprueba los oficiales.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { pedir } from '../api/cliente'
import type { ColaEntrenamientos, CuotasConfig, ItemBanco, MuestraGuardada } from '../api/tipos'
import { useSesion, puede } from '../auth/sesion'
import { ConstructorMuestra } from '../components/ConstructorMuestra'
import { PanelesPestana, Pestanas, usePestanaEnUrl } from '../components/ui/Pestanas'
import { Termino } from '../components/Termino'
import { TablaDatos } from '../components/grafica'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Panel, Selector, Tabla, Texto, Vacio } from '../components/ui'
import { descripcionDe } from '../lib/descripciones'
import { fecha, num } from '../lib/formato'

type Fuente = 'kmc' | 'simulado'
type Seccion = 'entrenar' | 'banco' | 'limites'
/** Una tabla dentro de un panel que se desplaza: el encabezado queda fijo. */
const ENCABEZADO_FIJO = 'xl:overflow-visible [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-papel'
const minutos = (m: number | null) => (m == null ? 'sin datos todavía' : `${Math.round(m)} min`)

export default function MisModelos() {
  const { usuario } = useSesion()
  const admin = puede(usuario, ['admin'])
  const opera = puede(usuario, ['admin', 'datos'])      // fija los límites de uso (D77)
  const cliente = useQueryClient()
  const cola = useQuery({ queryKey: ['mis-modelos', 'cola'], queryFn: () => pedir<ColaEntrenamientos>('/entrenamientos/cola'), refetchInterval: 15000 })
  const banco = useQuery({ queryKey: ['mis-modelos', 'banco'], queryFn: () => pedir<ItemBanco[]>('/entrenamientos/banco') })
  const trabajosPropios = useRef<number[]>([])
  useEffect(() => {
    if (!cola.data) return
    const vigentes = cola.data.items.filter((item) => item.propia).map((item) => item.id)
    if (trabajosPropios.current.some((id) => !vigentes.includes(id))) {
      void cliente.invalidateQueries({ queryKey: ['mis-modelos', 'banco'] })
    }
    trabajosPropios.current = vigentes
  }, [cola.data, cliente])
  const muestras = useQuery({ queryKey: ['muestras'], queryFn: () => pedir<(MuestraGuardada & { propietario_id?: string | null })[]>('/muestras') })
  const cuotas = useQuery({ queryKey: ['mis-modelos', 'cuotas'], queryFn: () => pedir<CuotasConfig>('/entrenamientos/cuotas'), enabled: opera })
  const [ver, setVer] = useState('todos')               // todos | mios | oficial | personal
  const [dueno, setDueno] = useState('')                // id de la persona; vacío = todas
  const refrescar = () => void cliente.invalidateQueries({ queryKey: ['mis-modelos'] })

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [muestra, setMuestra] = useState('')            // id de la muestra guardada; vacío = todos los niños
  const [armando, setArmando] = useState(false)
  const [fuente, setFuente] = useState<Fuente>('simulado')
  const entrenar = useMutation({
    mutationFn: () => pedir('/entrenamientos/entrenar', {
      cuerpo: {
        fuente, nombre: nombre.trim() || null, descripcion: descripcion.trim() || null,
        muestra_id: muestra ? Number(muestra) : null,
      },
    }),
    onSuccess: () => { setNombre(''); setDescripcion(''); setMuestra(''); refrescar() },
  })
  const cancelar = useMutation({
    mutationFn: (id: number) => pedir(`/entrenamientos/${id}/cancelar`, { metodo: 'POST' }),
    onSuccess: refrescar,
  })
  const descartar = useMutation({
    mutationFn: (id: number) => pedir(`/entrenamientos/${id}/descartar`, { metodo: 'POST' }),
    onSuccess: refrescar,
  })

  const l = cola.data?.limites
  const lleno = !!l && !l.sin_limite && (l.cola_usada >= l.cola_max || l.modelos_usados >= l.modelos_max)
  const duenos = Array.from(new Map((banco.data ?? []).filter((b) => b.propietario_id).map((b) => [b.propietario_id as string, b.propietario ?? '—'])))
  const visibles = (banco.data ?? []).filter((b) =>
    (ver === 'todos' || (ver === 'mios' ? b.propia : b.visibilidad === ver)) && (!dueno || b.propietario_id === dueno))
  const dCola = descripcionDe('cola')
  const dBanco = descripcionDe('banco_modelos')

  const secciones: Seccion[] = opera ? ['entrenar', 'banco', 'limites'] : ['entrenar', 'banco']
  const [activa, elegir] = usePestanaEnUrl('ver', secciones)
  const pestanas: { clave: Seccion; texto: string }[] = [
    { clave: 'entrenar', texto: 'Nuevo entrenamiento' },
    { clave: 'banco', texto: dBanco.titulo },
    ...(opera ? [{ clave: 'limites' as const, texto: 'Límites de uso' }] : []),
  ]

  const limites = (
    <Panel titulo="Sus límites" descripcion="Cuántos entrenamientos y modelos personales puede tener a la vez.">
      {cola.isPending ? <Cargando /> : cola.error ? <Aviso>{cola.error.message}</Aviso> : l && (
        l.sin_limite ? <p className="text-sm text-salvia">Administración no tiene límite.</p> : (
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <li><strong>{l.cola_usada} de {l.cola_max}</strong> entrenamiento(s) en cola o en curso</li>
            <li><strong>{l.modelos_usados} de {l.modelos_max}</strong> modelos personales guardados</li>
            {l.dias_sin_uso != null && <li>Un modelo personal sin usar se borra a los <strong>{l.dias_sin_uso} días</strong></li>}
          </ul>
        )
      )}
    </Panel>
  )

  const formulario = (
    <Panel titulo="Entrenar modelo nuevo" descripcion="El entrenamiento entra a la cola y empieza cuando le toca.">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); entrenar.mutate() }}>
        <Campo id="mm-nombre" etiqueta="Nombre"><Entrada id="mm-nombre" maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
        <Campo id="mm-fuente" etiqueta="Datos">
          <Selector id="mm-fuente" value={fuente} onChange={(e) => setFuente(e.target.value as Fuente)}>
            <option value="simulado">Simulados</option>
            <option value="kmc">KMC</option>
          </Selector>
        </Campo>
        <div className="sm:col-span-2">
          <Campo id="mm-descripcion" etiqueta="Descripción"><Texto id="mm-descripcion" rows={2} maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Campo>
        </div>
        <Campo id="mm-muestra" etiqueta="Muestra de niños"
          ayuda="Una muestra guardada recorta el corte antes de entrenar; sin muestra se entrena con todos los niños.">
          <Selector id="mm-muestra" value={muestra} onChange={(e) => setMuestra(e.target.value)}>
            <option value="">Todos los niños</option>
            {muestras.data?.filter((m) => m.fuente === fuente && (admin || m.propietario_id === usuario?.id)).map((m) => (
              <option key={m.id} value={m.id}>{m.titulo} · {num(m.n_ninos)} niños{m.propietario ? ` · ${m.propietario}` : ''}</option>
            ))}
          </Selector>
        </Campo>
        <div className="flex items-start sm:pt-7"><Boton variante="secundario" onClick={() => setArmando(true)}>Seleccionar niños para el entrenamiento</Boton></div>
        <div className="flex flex-col justify-end gap-2 sm:col-span-2">
          {entrenar.error && <Aviso>{entrenar.error.message}</Aviso>}
          {entrenar.isSuccess && <Aviso tono="teal">Entrenamiento en cola.</Aviso>}
          <div><Boton type="submit" disabled={entrenar.isPending || lleno}>Entrenar modelo nuevo</Boton></div>
          {lleno && <p className="text-sm text-salvia">Llegó a su límite: cancele o descarte alguno para entrenar otro.</p>}
        </div>
      </form>
    </Panel>
  )

  const colaEntrenamientos = (
    <TablaDatos titulo={dCola.titulo} descripcion={dCola.descripcion}
      accion={cola.data && <Insignia>Promedio: {minutos(cola.data.promedio_min)}</Insignia>}>
      {cola.isPending ? <Cargando /> : cola.error ? <Aviso>{cola.error.message}</Aviso> : cola.data.items.length === 0 ? (
        <Vacio titulo="No hay entrenamientos en cola" />
      ) : (
        <>
          {cancelar.error && <Aviso>{cancelar.error.message}</Aviso>}
          <Tabla apilar>
            <thead><tr><th>Posición</th><th>Nombre</th><th>Dueño</th><th>Etiqueta</th><th>Estimado</th><th /></tr></thead>
            <tbody>
              {cola.data.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.posicion === 0 ? 'Entrenando' : i.posicion}</td>
                  <td>{i.nombre ?? `Entrenamiento ${i.id}`}</td>
                  <td>{i.propietario ?? '—'}{i.propia && ' (usted)'}</td>
                  <td><Insignia tono={i.visibilidad === 'personal' ? 'neutro' : 'teal'}>{i.visibilidad === 'personal' ? 'Personal' : 'Oficial'}</Insignia></td>
                  <td>{minutos(i.estimado_min)}</td>
                  <td>{i.cancelable && <Boton variante="secundario" chico disabled={cancelar.isPending} onClick={() => cancelar.mutate(i.id)}>Cancelar</Boton>}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </>
      )}
    </TablaDatos>
  )

  // los filtros del banco quedan en el encabezado del panel: no se van con la tabla al desplazarla
  const filtros = banco.data && banco.data.length > 0 && (
    <div className="flex flex-wrap items-end gap-3">
      <Campo id="mm-ver" etiqueta="Mostrar">
        <Selector id="mm-ver" className="sm:h-9" value={ver} onChange={(e) => setVer(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="mios">Solo los míos</option>
          <option value="oficial">Oficiales</option>
          <option value="personal">Personales</option>
        </Selector>
      </Campo>
      <Campo id="mm-dueno" etiqueta="Dueño">
        <Selector id="mm-dueno" className="sm:h-9" value={dueno} onChange={(e) => setDueno(e.target.value)}>
          <option value="">Todas las personas</option>
          {duenos.map(([id, nombreDueno]) => <option key={id} value={id}>{nombreDueno}</option>)}
        </Selector>
      </Campo>
    </div>
  )

  const bancoDeModelos = (
    <TablaDatos llenar titulo={dBanco.titulo} descripcion={dBanco.descripcion} accion={filtros || undefined}
      exportar={banco.data ? {
        nombre: 'banco-modelos',
        filas: visibles.map((b) => ({ id: b.id, dueno: b.propietario, etiqueta: b.visibilidad, muestra: b.muestra, corte: b.corte, auc: b.auc })),
      } : undefined}>
      {banco.isPending ? <Cargando /> : banco.error ? <Aviso>{banco.error.message}</Aviso> : banco.data.length === 0 ? (
        <Vacio titulo="Todavía no hay modelos en el banco" />
      ) : (
        <>
          {visibles.length === 0 ? <Vacio titulo="Ningún modelo coincide con el filtro" /> : (
            <Tabla apilar className={ENCABEZADO_FIJO}>
              <thead><tr><th>Nombre</th><th>Dueño</th><th>Etiqueta</th><th>Muestra</th><th>Corte</th><th><Termino id="auc">AUC</Termino></th><th>Otras medidas</th><th /></tr></thead>
              <tbody>
                {visibles.map((b) => (
                  <tr key={b.id}>
                    <td>{b.nombre ?? `Entrenamiento ${b.id}`}</td>
                    <td>{b.propietario ?? '—'}</td>
                    <td><Insignia tono={b.visibilidad === 'personal' ? 'neutro' : 'teal'}>{b.visibilidad === 'personal' ? 'Personal' : 'Oficial'}</Insignia></td>
                    <td>{b.muestra ?? (b.muestra_id ? `Muestra ${b.muestra_id}` : 'Todos los niños')}</td>
                    <td>{b.corte ? fecha(b.corte) : '—'} {b.corte_anterior && <Insignia tono="ocre">Corte anterior</Insignia>}</td>
                    <td>{b.auc == null ? '—' : b.auc.toFixed(2)}</td>
                    <td className="text-xs">{medidas(b)}{b.vence_en_dias != null && (
                      <Insignia tono="ocre">{b.vence_en_dias === 0 ? 'Se borra hoy si no se usa' : `Se borra en ${b.vence_en_dias} días si no se usa`}</Insignia>
                    )}</td>
                    <td>{b.visibilidad === 'personal' && !b.descartado && (b.propia || admin) && (
                      <Boton variante="secundario" chico disabled={descartar.isPending} onClick={() => descartar.mutate(b.id)}>Descartar</Boton>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          <p className="mt-2 text-xs text-salvia">
            En «Otras medidas»: <Termino id="pr_auc">precisión promedio</Termino> y <Termino id="falsas_por_1000">falsas por 1.000</Termino>.
          </p>
        </>
      )}
      {descartar.error && <Aviso>{descartar.error.message}</Aviso>}
    </TablaDatos>
  )

  // en escritorio la página ocupa la pantalla sin desplazarse: el banco se desplaza por dentro y armar una muestra
  // reemplaza el formulario (lo escrito en él se conserva al cerrarla)
  return (
    <div className="flex flex-col xl:h-full">
      <Encabezado titulo="Entrenamientos propios">
        Entrene con los parámetros vigentes. {admin ? 'El modelo se comparte en el catálogo como «Oficial» y queda pendiente de aprobación.'
          : 'El modelo queda como «Personal» para sus estimaciones.'} El modelo activo del tablero se cambia desde Administración.
      </Encabezado>
      <Pestanas prefijo="mis-modelos" etiqueta="Secciones de Entrenamientos propios" pestanas={pestanas} activa={activa} elegir={elegir} />
      <PanelesPestana prefijo="mis-modelos" activa={activa} className="mt-3 flex min-h-0 flex-col gap-3 xl:flex-1" paneles={[
        {
          clave: 'entrenar',
          contenido: armando ? (
            <ConstructorMuestra llenar fuente={fuente} nombre={nombre} bloqueado={lleno} alCerrar={() => setArmando(false)}
              alTerminar={() => { setArmando(false); setNombre(''); setDescripcion(''); refrescar() }} />
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:items-start">
              {formulario}
              <div className="flex flex-col gap-3">{limites}{colaEntrenamientos}</div>
            </div>
          ),
        },
        { clave: 'banco', contenido: bancoDeModelos },
        ...(opera && cuotas.data ? [{ clave: 'limites' as const, contenido: <LimitesAdmin valores={cuotas.data} alGuardar={refrescar} /> }] : []),
      ]} />
    </div>
  )
}

const NOMBRE_MEDIDA: Record<string, string> = { pr_auc: 'Precisión promedio', top10: 'Casos en el riesgo más alto (%)', detectados_pct: 'Datos raros detectados (%)', falsas_por_1000: 'Falsas por 1.000' }
const medidas = (b: ItemBanco) => Object.values(b.metricas ?? {}).flatMap((m) => Object.entries(m))
  .filter(([k]) => k !== 'auc').map(([k, v]) => `${NOMBRE_MEDIDA[k] ?? k}: ${v.toFixed(2)}`).join(' · ') || null

// Administración fija los límites que antes eran constantes; los expertos los ven en «Sus límites».
function LimitesAdmin({ valores, alGuardar }: { valores: CuotasConfig; alGuardar: () => void }) {
  const [v, setV] = useState({ ...valores })
  const guardar = useMutation({ mutationFn: () => pedir<CuotasConfig>('/entrenamientos/cuotas', { metodo: 'PUT', cuerpo: v }), onSuccess: alGuardar })
  const campos: { k: keyof CuotasConfig; etiqueta: string; ayuda: string }[] = [
    { k: 'cola_max', etiqueta: 'Entrenamientos en cola por persona', ayuda: 'Cuántos puede tener a la vez en cola o en curso.' },
    { k: 'modelos_max', etiqueta: 'Modelos personales guardados por persona', ayuda: 'Al llegar al máximo debe descartar alguno.' },
    { k: 'dias_sin_uso', etiqueta: 'Días sin uso antes de borrar', ayuda: 'Pasado este tiempo sin usarse, un modelo personal se borra.' },
    { k: 'dias_aviso', etiqueta: 'Días de aviso antes de borrar', ayuda: 'Cuántos días antes empieza a verse el aviso en el banco.' },
  ]
  return (
    <Panel titulo="Límites de Entrenamientos propios" descripcion="Solo administración los cambia. La administración no tiene límite.">
      <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
        {campos.map((c) => (
          <Campo key={c.k} id={`lim-${c.k}`} etiqueta={c.etiqueta} ayuda={c.ayuda}>
            <Entrada id={`lim-${c.k}`} type="number" min={c.k === 'dias_sin_uso' ? 1 : 0} value={v[c.k]}
              onChange={(e) => setV({ ...v, [c.k]: Number(e.target.value) })} />
          </Campo>
        ))}
        <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-4">
          {guardar.error && <Aviso>{guardar.error.message}</Aviso>}
          {guardar.isSuccess && <Aviso tono="teal">Límites guardados.</Aviso>}
          <div><Boton type="submit" disabled={guardar.isPending}>Guardar límites</Boton></div>
        </div>
      </form>
    </Panel>
  )
}
