// Mis modelos: entrenar un modelo propio, ver la cola con la posición y el tiempo estimado, y el banco compartido.
// Los modelos personales no cambian el tablero ni envían correos; solo administración aprueba los oficiales.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { pedir } from '../api/cliente'
import type { ColaEntrenamientos, ItemBanco, MuestraGuardada } from '../api/tipos'
import { useSesion, puede } from '../auth/sesion'
import { ConstructorMuestra } from '../components/ConstructorMuestra'
import { TablaDatos } from '../components/grafica'
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Insignia, Panel, Selector, Tabla, Texto, Vacio } from '../components/ui'
import { descripcionDe } from '../lib/descripciones'
import { fecha, num } from '../lib/formato'

type Fuente = 'kmc' | 'simulado'
const minutos = (m: number | null) => (m == null ? 'sin datos todavía' : `${Math.round(m)} min`)

export default function MisModelos() {
  const { usuario } = useSesion()
  const admin = puede(usuario, ['admin'])
  const cliente = useQueryClient()
  const cola = useQuery({ queryKey: ['mis-modelos', 'cola'], queryFn: () => pedir<ColaEntrenamientos>('/entrenamientos/cola'), refetchInterval: 15000 })
  const banco = useQuery({ queryKey: ['mis-modelos', 'banco'], queryFn: () => pedir<ItemBanco[]>('/entrenamientos/banco') })
  const muestras = useQuery({ queryKey: ['muestras'], queryFn: () => pedir<(MuestraGuardada & { propietario_id?: string | null })[]>('/muestras') })
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
  const dCola = descripcionDe('cola')
  const dBanco = descripcionDe('banco_modelos')

  return (
    <div className="flex flex-col gap-4">
      <Encabezado titulo="Mis modelos">
        Entrene un modelo propio con los hiperparámetros vigentes. Queda como «Personal»: no cambia el tablero ni envía
        correos. Solo administración aprueba un modelo como oficial.
      </Encabezado>

      <Panel titulo="Sus límites" descripcion="Cuántos entrenamientos y modelos personales puede tener a la vez.">
        {cola.isPending ? <Cargando /> : cola.error ? <Aviso>{cola.error.message}</Aviso> : l && (
          l.sin_limite ? <p className="text-sm text-salvia">Administración no tiene límite.</p> : (
            <ul className="flex flex-wrap gap-6 text-sm">
              <li><strong>{l.cola_usada} de {l.cola_max}</strong> entrenamiento(s) en cola o en curso</li>
              <li><strong>{l.modelos_usados} de {l.modelos_max}</strong> modelos personales guardados</li>
            </ul>
          )
        )}
      </Panel>

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
          <div className="flex items-end"><Boton variante="secundario" onClick={() => setArmando(true)} disabled={armando}>Armar una muestra</Boton></div>
          <div className="flex flex-col justify-end gap-2 sm:col-span-2">
            {entrenar.error && <Aviso>{entrenar.error.message}</Aviso>}
            {entrenar.isSuccess && <Aviso tono="teal">Entrenamiento en cola.</Aviso>}
            <div><Boton type="submit" disabled={entrenar.isPending || lleno}>Entrenar modelo nuevo</Boton></div>
            {lleno && <p className="text-sm text-salvia">Llegó a su límite: cancele o descarte alguno para entrenar otro.</p>}
          </div>
        </form>
      </Panel>

      {armando && (
        <ConstructorMuestra fuente={fuente} nombre={nombre} bloqueado={lleno} alCerrar={() => setArmando(false)}
          alTerminar={() => { setArmando(false); setNombre(''); setDescripcion(''); refrescar() }} />
      )}

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

      <TablaDatos titulo={dBanco.titulo} descripcion={dBanco.descripcion}
        exportar={banco.data ? {
          nombre: 'banco-modelos',
          filas: banco.data.map((b) => ({ id: b.id, dueno: b.propietario, etiqueta: b.visibilidad, muestra: b.muestra, corte: b.corte, auc: b.auc })),
        } : undefined}>
        {banco.isPending ? <Cargando /> : banco.error ? <Aviso>{banco.error.message}</Aviso> : banco.data.length === 0 ? (
          <Vacio titulo="Todavía no hay modelos en el banco" />
        ) : (
          <Tabla apilar>
            <thead><tr><th>Nombre</th><th>Dueño</th><th>Etiqueta</th><th>Muestra</th><th>Corte</th><th>AUC</th><th /></tr></thead>
            <tbody>
              {banco.data.map((b) => (
                <tr key={b.id}>
                  <td>{b.nombre ?? `Entrenamiento ${b.id}`}</td>
                  <td>{b.propietario ?? '—'}</td>
                  <td><Insignia tono={b.visibilidad === 'personal' ? 'neutro' : 'teal'}>{b.visibilidad === 'personal' ? 'Personal' : 'Oficial'}</Insignia></td>
                  <td>{b.muestra ?? (b.muestra_id ? `Muestra ${b.muestra_id}` : 'Todos los niños')}</td>
                  <td>{b.corte ? fecha(b.corte) : '—'} {b.corte_anterior && <Insignia tono="ocre">Corte anterior</Insignia>}</td>
                  <td>{b.auc == null ? '—' : b.auc.toFixed(2)}</td>
                  <td>{b.visibilidad === 'personal' && !b.descartado && (b.propia || admin) && (
                    <Boton variante="secundario" chico disabled={descartar.isPending} onClick={() => descartar.mutate(b.id)}>Descartar</Boton>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
        {descartar.error && <Aviso>{descartar.error.message}</Aviso>}
      </TablaDatos>
    </div>
  )
}
