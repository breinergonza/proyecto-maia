// Predicción: las tres pestañas, el CSV solo para administración y la reserva de cifras con pocos niños.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../api/tipos'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const modelo = { version: 'p1', version_modelo: 'x', corte: '2026-06-30', corte_anterior: false, corte_vigente: '2026-06-30' }
const base = {
  modelo, visita: null, visita_nombre: null, n_filtro: 600, fuga_no_verificable: true, en_entrenamiento: null, excluidos: 0, aviso_corte: null,
}
const agregados = {
  n_puntuados: 590, deciles: [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.2],
  histograma: Array.from({ length: 10 }, (_, i) => ({ desde: 10 * i, hasta: 10 * i + 10, n: 59 })),
  niveles: { muy_alto: 30, alto: 29, resto: 531, percentil_alto: 90, percentil_muy_alto: 95 },
  por_desenlace: [{ clave: 'des6', desenlace: 'desarrollo psicomotor bajo', momento: '3 m EC', momento_nombre: '3 meses', n: 590,
    riesgo_mediano: 0.05, altos: 59, muy_altos: 30 }],
}
const porVisita = [
  { clave: 'des6', desenlace: 'desarrollo psicomotor bajo', momento: 'nac', momento_nombre: 'Nacimiento', orden: 1, n: 590, oculta: false,
    riesgo_mediano: 0.04, altos: 40, pct_altos: 6.8 },
  { clave: 'des6', desenlace: 'desarrollo psicomotor bajo', momento: '3 m EC', momento_nombre: '3 meses', orden: 2, n: 3, oculta: true,
    riesgo_mediano: null, altos: null, pct_altos: null },
]
const fila = (i: number) => ({ sujeto: `N-${String(i).padStart(3, '0')}`, clave: 'des6', desenlace: 'desarrollo psicomotor bajo', momento: '3 m EC',
  momento_nombre: '3 meses', riesgo: 0.4, percentil: 97, nivel: 'muy_alto', perfil: 'Muy prematuro · Peso adecuado',
  primera_alerta: 'Nacimiento', motivos: ['Peso al nacer = 900 g'] })
const trabajoOk = {
  id: 7, tipo: 'universo', estado: 'ok', progreso: 100, paso: 'Listo', modelo: 'p1', n_filtro: 600, n_puntuados: 590, mensaje: null,
  creada: null, terminada: null, vence: null, tabla_disponible: true,
  parametros: { modelo: null, excluir_entrenamiento: false, visita: null },
  resultado: { ...base, insuficiente: false, guardado: false, agregados, por_visita: porVisita, tabla_total: 590 },
}
const facetas = {
  n: 600, minimo: 20, facetas: { sexo: { etiqueta: 'Sexo', tipo: 'lista', cuando: 'primera', opciones: [
    { valor: 'M', etiqueta: 'Masculino', n: 300, texto: '300' }, { valor: 'F', etiqueta: 'Femenino', n: 300, texto: '300' }] } },
}

function api(rol: Usuario['rol'], trabajo: unknown = trabajoOk) {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    if (url === '/api/prediccion/modelos') {
      return { cuerpo: { corte_vigente: '2026-06-30', activo: 'p1', modelos: [{ version: 'p1', origen: 'oficial', dueno: null, activo: true,
        fuente: 'simulado', corte: '2026-06-30', creado: null, corte_anterior: false, aviso: null }] } }
    }
    if (url.startsWith('/api/prediccion/ejemplos?') && url.includes('visita=')) {
      return { cuerpo: { modelo, visita: 'nacimiento', visita_nombre: 'Nacimiento', perfil: 'extremo', perfil_etiqueta: 'Prematuro extremo', n: 40,
        insuficiente: false, eg_semanas: 26, visitas: [{ etapa: 'nacimiento', nombre: 'Nacimiento', orden: 1 }],
        campos: [{ variable: 'peso_nacer', etiqueta: 'Peso al nacer', tipo: 'numero', unidad: 'g', opciones: [], minimo: 400, maximo: 6000,
          principal: true, peso: 1, etapa: 'nacimiento', valor: 900, n: 40, tipico: true }] } }
    }
    if (url.startsWith('/api/prediccion/ejemplos')) {
      return { cuerpo: { modelo, visitas: [{ etapa: 'nacimiento', nombre: 'Nacimiento', orden: 1 }],
        perfiles: [{ perfil: 'extremo', etiqueta: 'Prematuro extremo', grupo: 'eg', n: 40, insuficiente: false }] } }
    }
    if (url === '/api/exploracion/facetas') return { cuerpo: facetas }
    if (url === '/api/muestras') return { cuerpo: [] }
    if (url === '/api/prediccion/trabajos') return { estado: 202, cuerpo: { ...trabajoOk, estado: 'pendiente', resultado: undefined } }
    if (url === '/api/prediccion/trabajos/7') return { cuerpo: trabajo }
    if (url.startsWith('/api/prediccion/trabajos/7/tabla')) {
      const pagina = Number(new URL(url, 'http://x').searchParams.get('pagina') ?? 1)
      return { cuerpo: { total: 590, pagina, limite: 200, paginas: 3, filas: [fila(pagina)] } }
    }
    if (url === '/api/prediccion/ninos-nuevos' && init?.method === 'POST') {
      return { estado: 201, cuerpo: { id: 3, tipo: 'nino', titulo: JSON.parse(String(init.body)).titulo, visita: 'nacimiento', perfil: 'extremo',
        cambios: {}, dueno: 'Persona experto', propio: true, descripcion: null, modelo: 'p1', eg_semanas: 26, creada: null } }
    }
    if (url === '/api/prediccion/ninos-nuevos') return { cuerpo: [] }
  })
}

describe('predicción', () => {
  it('ofrece los tres modos como pestañas y el enlace en Revisión clínica', async () => {
    api('experto')
    montar('/prediccion?vista=grupo')
    expect(await screen.findByRole('heading', { name: 'Predicción' })).toBeInTheDocument()
    const pestanas = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(pestanas).toEqual(['Un niño', 'Un grupo de niños', 'Muestra', 'Todo el universo', 'Niño nuevo desde un perfil'])
    expect(screen.getAllByRole('link', { name: 'Predicción' }).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('tab', { name: 'Niño nuevo desde un perfil' }))
    expect(await screen.findByText('Biblioteca de niños de ejemplo')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Prematuro extremo/ })).toBeInTheDocument()
  })

  it('el CSV por niño lo ve solo administración', async () => {
    api('admin')
    const { unmount } = montar('/prediccion?vista=grupo')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByRole('button', { name: /Exportar CSV/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'N-001' })).toHaveAttribute('href', '/ninos/N-001')
    unmount()
    api('experto')
    montar('/prediccion?vista=grupo')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByRole('link', { name: 'N-001' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Exportar CSV/ })).not.toBeInTheDocument()
  })

  it('la muestra se arma con las facetas y no calcula sin elegir nada', async () => {
    const llamadas = api('experto')
    montar('/prediccion?vista=grupo')
    expect(await screen.findByRole('checkbox', { name: /Masculino/ })).toBeInTheDocument()
    const calcular = screen.getByRole('button', { name: 'Calcular el riesgo' })
    expect(calcular).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /Masculino/ }))
    await userEvent.click(calcular)
    expect(await screen.findByText('niños con el riesgo calculado')).toBeInTheDocument()
    const lanzado = llamadas.find((l) => l.url === '/api/prediccion/trabajos')!
    expect(JSON.parse(String(lanzado.init!.body)).muestra.y[0]).toMatchObject({ variable: 'sexo', valores: ['M'] })
  })

  it('muestra el avance mientras el cálculo corre', async () => {
    api('experto', { ...trabajoOk, estado: 'en_curso', progreso: 40, paso: 'Calculando el riesgo: 1500 de 3000 niños', resultado: null })
    montar('/prediccion?vista=grupo')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByText('Calculando el riesgo: 1500 de 3000 niños')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Avance del cálculo' })).toHaveAttribute('value', '40')
  })

  it('pagina la tabla de 200 en 200 y el riesgo por visita oculta las celdas chicas', async () => {
    const llamadas = api('experto')
    montar('/prediccion?vista=grupo')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByRole('link', { name: 'N-001' })).toBeInTheDocument()
    expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Riesgo alto en cada visita' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByRole('link', { name: 'N-002' })).toBeInTheDocument()
    expect(llamadas.some((l) => l.url === '/api/prediccion/trabajos/7/tabla?pagina=2')).toBe(true)
    expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument()
  })

  it('dice cuántos niños ya estaban en el entrenamiento cuando se puede verificar', async () => {
    api('experto', { ...trabajoOk, resultado: { ...trabajoOk.resultado, fuga_no_verificable: false, en_entrenamiento: 0, n_entrenamiento: 2500 } })
    montar('/prediccion?vista=grupo')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByText(/Ninguno de estos niños estaba en el entrenamiento/)).toBeInTheDocument()
  })

  it('con menos de 20 niños no muestra cifras', async () => {
    api('experto', { ...trabajoOk, resultado: { ...base, n_filtro: 8, insuficiente: true, minimo: 20, mensaje: 'Con menos de 20 niños no se muestran cifras.' } })
    montar('/prediccion?vista=grupo')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByText(/Con menos de 20 niños no se muestran cifras/)).toBeInTheDocument()
    expect(screen.queryByText('niños con el riesgo calculado')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('un cálculo con error lo dice', async () => {
    api('experto', { ...trabajoOk, estado: 'error', resultado: null, mensaje: 'Interrumpido: la API se reinició durante el cálculo.' })
    montar('/prediccion?vista=grupo')
    await userEvent.click(await screen.findByRole('tab', { name: 'Todo el universo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Calcular el riesgo' }))
    expect(await screen.findByText(/la API se reinició durante el cálculo/)).toBeInTheDocument()
  })

  it('guarda el niño nuevo con lo que se cambió, aparte del corte oficial', async () => {
    const llamadas = api('experto')
    montar('/prediccion?vista=grupo')
    await userEvent.click(await screen.findByRole('tab', { name: 'Niño nuevo desde un perfil' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nacimiento' }))
    await userEvent.click(await screen.findByRole('button', { name: /Prematuro extremo/ }))
    const peso = await screen.findByLabelText(/Peso al nacer/)
    await userEvent.clear(peso)
    await userEvent.type(peso, '1100')
    await userEvent.type(await screen.findByLabelText('Nombre'), 'Mi niño')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar como niño nuevo' }))
    expect(await screen.findByText(/Guardado: «Mi niño»/)).toBeInTheDocument()
    const enviado = JSON.parse(String(llamadas.find((l) => l.url === '/api/prediccion/ninos-nuevos' && l.init?.method === 'POST')!.init!.body))
    expect(enviado).toMatchObject({ visita: 'nacimiento', perfil: 'extremo', tipo: 'nino', titulo: 'Mi niño', cambios: { peso_nacer: 1100 } })
  })

  it('el visualizador no entra a Predicción', async () => {
    api('visualizador')
    montar('/prediccion?vista=grupo')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
  })
})
