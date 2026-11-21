// Calidad de datos (S9, mockup 06): mediciones dudosas o faltantes, no riesgos clínicos. Tres cifras, la cola con sus filtros y
// acciones, y la completitud por visita con sus denominadores (S6). Una falla de red se explica y se puede reintentar sin
// perder los filtros.
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { montar, simularApi, usuario } from './util'

vi.setConfig({ testTimeout: 20_000 })
configure({ asyncUtilTimeout: 15_000 })

afterEach(() => vi.unstubAllGlobals())

const resumen = {
  corrida_id: 1, por_revisar: 38, revisadas: 150, revisadas_mes: 112,
  etapas: [{ etapa: 'e40', etapa_nombre: '40 sem', alertas: 20 }, { etapa: 'e6', etapa_nombre: '6 m', alertas: 18 }],
  variables: [{ variable: 'talla_6', etiqueta: 'Talla', alertas: 12 }, { variable: 'peso_40', etiqueta: 'Peso', alertas: 26 }],
  completitud: {
    indicador: 'talla', nombre: 'Talla para la edad',
    etapas: [
      { etapa: 'e40', etapa_nombre: '40 sem', con_dato: 94, elegibles: 100, pct: 94, a_12_meses: false },
      { etapa: 'e12', etapa_nombre: '12 m', con_dato: 71, elegibles: 100, pct: 71, a_12_meses: true },
    ],
  },
}
const dato = (extra: object = {}) => ({
  id: 7, prioridad: 1, sujeto: 'S-02210', variable: 'talla_6', etiqueta: 'Talla', unidad: 'cm', etapa: 'e6', etapa_nombre: '6 m',
  fecha: '2026-01-01', valor: '58', esperado: 66, rango_bajo: 62, rango_alto: 70, capas: ['1'], motivo: 'valor atípico', fuerza: 9,
  es_error: null, comentario: null, serie: [], revisiones: [], ...extra,
})
const cola = (items: object[]) => ({ total: items.length, pagina: 1, tamano: 12, items })

// D63: un dato con una sola alerta también sale, con su cifra
const concentracion = { corrida_id: 1, hay_sede: false, celdas: [], por_variable: [
  { variable: 'peso', etiqueta: 'Peso', alertas: 12 }, { variable: 'pc', etiqueta: 'Perímetro cefálico', alertas: 1 }] }

function api(items: object[] = [dato()], extra?: (url: string, init?: RequestInit) => { estado?: number; cuerpo?: unknown } | undefined,
  rol: 'admin' | 'experto' | 'visualizador' = 'admin') {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario(rol) } }
    const e = extra?.(url, init)
    if (e) return e
    if (url === '/api/revision/datos/resumen') return { cuerpo: resumen }
    if (url.startsWith('/api/revision/datos?')) return { cuerpo: cola(items) }
    if (url === '/api/revision/datos/aciertos') return { cuerpo: { corrida_id: 1, serie: [], respondidas: 0, confirmadas_error_pct: null } }
    if (url === '/api/revision/datos/concentracion') {
      return { cuerpo: concentracion }
    }
    if (url === '/api/tablero/resumen') return { cuerpo: { datos_revisar: 38, alertas_por_1000: 3, alarmas_grupo: 0, alertas_por_capa: {} } }
    if (url === '/api/revision/datos/7') return { estado: 204 }
    return undefined
  })
}

describe('calidad de datos: cifras y encabezado', () => {
  it('dice que son datos a revisar y no riesgos clínicos, y muestra las tres cifras del servidor', async () => {
    api()
    montar('/admin/calidad-datos')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mediciones por revisar' })).toBeInTheDocument()
    expect(screen.getByText('Mediciones dudosas o faltantes. No son riesgos clínicos: son datos a revisar antes de usarlos.')).toBeInTheDocument()
    expect(await screen.findByText('mediciones por revisar')).toBeInTheDocument()
    expect(screen.getByText('38')).toBeInTheDocument()
    expect(screen.getByText('revisadas este mes')).toBeInTheDocument()
    expect(screen.getByText('112')).toBeInTheDocument()
    // la tercera cifra: de los niños elegibles, cuántos tienen talla a los 12 meses (la misma de su barra)
    const completitud = screen.getByText('completitud a los 12 meses').closest('p')!
    expect(completitud).toHaveTextContent('71,0 %')
  })

  it('sin una visita de 12 meses no inventa la tercera cifra', async () => {
    api([dato()], (url) => (url === '/api/revision/datos/resumen'
      ? { cuerpo: { ...resumen, completitud: { ...resumen.completitud, etapas: [resumen.completitud.etapas[0]] } } } : undefined))
    montar('/admin/calidad-datos')
    expect(await screen.findByText('mediciones por revisar')).toBeInTheDocument()
    expect(screen.queryByText('completitud a los 12 meses')).not.toBeInTheDocument()
  })

  it('el experto clínico también entra y ve la cola', async () => {
    api([dato()], undefined, 'experto')
    montar('/admin/calidad-datos')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mediciones por revisar' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'S-02210' })).toBeInTheDocument()
  })
})

describe('calidad de datos: la cola', () => {
  it('cada fila dice niño, visita, medición, valor, por qué es dudosa, quién la detectó, su estado y la acción', async () => {
    api()
    montar('/admin/calidad-datos')
    const tabla = (await screen.findByRole('table')).closest('table')!
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(
      ['Niño', 'Visita', 'Medición', 'Valor registrado', 'Por qué es dudosa', 'Regla o modelo que detectó la medición', 'Estado', 'Acción'])
    const fila = within(tabla).getByRole('link', { name: 'S-02210' }).closest('tr')!
    const celdas = within(fila).getAllByRole('cell').map((c) => c.textContent)
    expect(celdas.slice(0, 7)).toEqual(['S-02210', '6 m', 'Talla', '58 cm', 'Esperado entre 62 y 70 cm.', 'Valor fuera de lo esperado', 'Por revisar'])
    // confirmar deja el valor como está; corregir lo marca como error de registro (no cambia el valor)
    expect(within(fila).getByRole('button', { name: 'Confirmar valor correcto' })).toHaveAttribute('title', 'El valor registrado es correcto')
    expect(within(fila).getByRole('button', { name: 'Corregir' })).toHaveAttribute('title', 'Corregir: es un error de registro (se marca; el valor no cambia)')
    expect(within(fila).getByRole('button', { name: 'No puedo determinarlo' })).toBeInTheDocument()
    // lo que sobra para decidir se abre aparte: lo más probable, cuándo se midió y las otras visitas
    expect(screen.queryByText(/Medido el/)).not.toBeInTheDocument()
    await userEvent.click(within(fila).getByRole('button', { name: /Ver detalle/ }))
    expect(await screen.findByText(/Medido el/)).toBeInTheDocument()
    // en el teléfono cada fila se vuelve una tarjeta
    expect(tabla.parentElement).toHaveClass('tabla-apilada')
  })

  it('las unidades de la base se dicen como se escriben en clínica', async () => {
    api([dato({ unidad: 'GRAMOS', valor: '9800', rango_bajo: 2997, rango_alto: 3752 })])
    montar('/admin/calidad-datos')
    const fila = (await screen.findByRole('link', { name: 'S-02210' })).closest('tr')!
    expect(fila).toHaveTextContent('9.800 g')
    expect(fila).toHaveTextContent('Esperado entre 2.997 y 3.752 g.')
    expect(fila).not.toHaveTextContent('GRAMOS')
  })

  it('los filtros Visita, Medición, Detectado por y Estado piden a la API lo elegido y vuelven a la primera página', async () => {
    const llamadas = api()
    montar('/admin/calidad-datos')
    await screen.findByRole('link', { name: 'S-02210' })
    expect(llamadas.some((l) => l.url.startsWith('/api/revision/datos?') && l.url.includes('estado=pendiente'))).toBe(true)
    await waitFor(() => expect(within(screen.getByLabelText('Visita')).getByRole('option', { name: /6 m/ })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Visita'), { target: { value: 'e6' } })
    fireEvent.change(screen.getByLabelText('Medición'), { target: { value: 'talla_6' } })
    fireEvent.change(screen.getByLabelText('Regla o modelo que detectó la medición'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'todos' } })
    await waitFor(() => expect(llamadas.some((l) => l.url.startsWith('/api/revision/datos?') && l.url.includes('etapa=e6')
      && l.url.includes('variable=talla_6') && l.url.includes('capa=2') && l.url.includes('estado=todos') && l.url.includes('pagina=1'))).toBe(true))
  })

  it('«Corregir» guarda que es un error, con su comentario, y la fila lo dice', async () => {
    const enviados: unknown[] = []
    api([dato()], (url, init) => {
      if (url === '/api/revision/datos/7') { enviados.push(JSON.parse(String(init?.body))); return { estado: 204 } }
      return undefined
    })
    montar('/admin/calidad-datos')
    await userEvent.click(await screen.findByRole('button', { name: /Ver detalle/ }))
    await userEvent.type(screen.getByLabelText('Comentario'), 'La báscula estaba dañada')
    await userEvent.click(screen.getByRole('button', { name: 'Corregir' }))
    await waitFor(() => expect(enviados).toEqual([{ es_error: 'si', comentario: 'La báscula estaba dañada' }]))
    expect(await screen.findByText('Respuesta guardada.')).toBeInTheDocument()
    expect(await screen.findByText('Por corregir')).toBeInTheDocument()
  })

  it('«Confirmar» guarda que el valor es correcto y la fila queda «Confirmado»', async () => {
    const enviados: unknown[] = []
    api([dato()], (url, init) => {
      if (url === '/api/revision/datos/7') { enviados.push(JSON.parse(String(init?.body))); return { estado: 204 } }
      return undefined
    })
    montar('/admin/calidad-datos')
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar valor correcto' }))
    await waitFor(() => expect(enviados).toEqual([{ es_error: 'no', comentario: null }]))
    expect(await screen.findByText('Confirmado')).toBeInTheDocument()
  })

  it('una medición ya respondida dice cómo y deja cambiar la respuesta; el dato en su contexto se abre aparte', async () => {
    api([dato({
      es_error: 'no', capas: ['2'], motivo: 'fuera de la ventana de la etapa',
      serie: [
        { variable: 'talla_3', etapa_nombre: '3 m', orden: 4, valor: 60, es_este: false },
        { variable: 'talla_6', etapa_nombre: '6 m', orden: 5, valor: 58, es_este: true },
      ],
    })])
    montar('/admin/calidad-datos')
    const fila = (await screen.findByRole('link', { name: 'S-02210' })).closest('tr')!
    expect(within(fila).getByText('Confirmado')).toBeInTheDocument()
    expect(within(fila).getByRole('button', { name: 'Confirmar valor correcto', pressed: true })).toBeInTheDocument()
    expect(within(fila).getByText('La fecha no corresponde a esta visita.')).toBeInTheDocument()
    expect(screen.queryByRole('figure', { name: /Talla de este niño en cada visita/ })).not.toBeInTheDocument()
    await userEvent.click(within(fila).getByRole('button', { name: /Ver detalle/ }))
    expect(await screen.findByRole('figure', { name: 'Talla de este niño en cada visita: 3 m, 60 cm; 6 m, 58 cm' })).toBeInTheDocument()
  })

  it('cada medición dice quién la revisó por última vez y cuándo; el detalle trae las respuestas de todo el equipo', async () => {
    api([dato({
      es_error: 'si',
      revisiones: [
        { usuario: 'Segunda Revisora', propia: false, es_error: 'no', cuando: '2026-11-19T15:00:00Z' },
        { usuario: 'Administración', propia: true, es_error: 'si', cuando: '2026-11-18T10:00:00Z' },
      ],
    })])
    montar('/admin/calidad-datos')
    const fila = (await screen.findByRole('link', { name: 'S-02210' })).closest('tr')!
    expect(within(fila).getByText(/^Última revisión: Segunda Revisora, confirmado, 19 de nov/)).toBeInTheDocument()
    expect(within(fila).getByText(/y 1 respuesta más/)).toBeInTheDocument()
    await userEvent.click(within(fila).getByRole('button', { name: /Ver detalle/ }))
    const equipo = await screen.findByRole('list', { name: 'Respuestas del equipo' })
    expect(within(equipo).getAllByRole('listitem').map((li) => li.textContent?.split(' · ')[0])).toEqual([
      'Segunda Revisora: confirmado', 'Tú: por corregir'])
  })

  it('una medición que nadie revisó no dice quién la revisó', async () => {
    api([dato()])
    montar('/admin/calidad-datos')
    const fila = (await screen.findByRole('link', { name: 'S-02210' })).closest('tr')!
    expect(within(fila).queryByText(/Última revisión/)).not.toBeInTheDocument()
  })

  it('sin mediciones por revisar lo dice', async () => {
    api([])
    montar('/admin/calidad-datos')
    expect(await screen.findByText('No queda nada por revisar')).toBeInTheDocument()
  })
})

describe('calidad de datos: filas compactas y completitud', () => {
  it('la cola desplaza sus filas por dentro con el encabezado fijo en escritorio', async () => {
    api()
    montar('/admin/calidad-datos')
    const tabla = (await screen.findByRole('table')).closest('table')!
    expect(tabla.parentElement!.className).toContain('xl:overflow-y-auto')
    expect(within(tabla).getAllByRole('columnheader')[0].closest('thead')!.className).toContain('sticky')
  })

  it('la etiqueta de la completitud dice de qué niños es el denominador', async () => {
    api()
    montar('/admin/calidad-datos')
    const figura = await screen.findByRole('figure', { name: /Porcentaje de niños con talla medida por visita/ })
    // 71 de 100: de todos los niños elegibles, como en Comparar grupos
    expect(within(figura).getByText('(71 de 100)')).toBeInTheDocument()
    expect(screen.getByText(/% de niños con talla medida entre los niños elegibles\./)).toBeInTheDocument()
  })
})

describe('calidad de datos: completitud por visita', () => {
  it('cada barra dice su porcentaje y su denominador, con el eje y lo que dice la gráfica de sí misma', async () => {
    api()
    montar('/admin/calidad-datos')
    const figura = await screen.findByRole('figure', { name: /Porcentaje de niños con talla medida por visita/ })
    expect(figura).toHaveAccessibleName(/40 sem, 94,0 % \(94 de 100\); 12 m, 71,0 % \(71 de 100\)/)
    for (const rotulo of ['Variable', 'Unidad', 'Momento', 'Población', 'Datos válidos', 'Porcentaje y denominador']) {
      expect(screen.getByText(rotulo, { selector: 'dt' })).toBeInTheDocument()
    }
  })
})

describe('calidad de datos: falla de red', () => {
  it('explica qué pasó, ofrece reintentar y conserva los filtros elegidos', async () => {
    let caida = false
    api([dato()], (url) => {
      if (caida && url.startsWith('/api/revision/datos?')) return { estado: 503, cuerpo: { detail: 'El servidor no responde por ahora.' } }
      return undefined
    })
    montar('/admin/calidad-datos')
    await screen.findByRole('link', { name: 'S-02210' })
    await waitFor(() => expect(within(screen.getByLabelText('Visita')).getByRole('option', { name: /6 m/ })).toBeInTheDocument())
    caida = true
    fireEvent.change(screen.getByLabelText('Visita'), { target: { value: 'e6' } })
    const aviso = await screen.findByRole('alert', undefined, { timeout: 20_000 })
    expect(aviso).toHaveTextContent('No se pudo cargar la lista de mediciones')
    expect(aviso).toHaveTextContent('El servidor no responde por ahora.')
    expect(screen.getByLabelText('Visita')).toHaveValue('e6')
    caida = false
    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('link', { name: 'S-02210' })).toBeInTheDocument()
    expect(screen.getByLabelText('Visita')).toHaveValue('e6')
  })
})

describe('calidad de datos: las medidas de la revisión siguen ahí', () => {
  it('los paneles de alertas por tipo, aciertos y concentración están en el detalle', async () => {
    api()
    montar('/admin/calidad-datos')
    await userEvent.click(await screen.findByText('Resumen de alertas de calidad de datos'))
    for (const t of ['Alertas por tipo', 'Aciertos frente a la revisión', 'Dónde se concentran']) {
      expect(await screen.findByRole('heading', { name: t })).toBeInTheDocument()
    }
  })

  it('dónde se concentran muestra cada dato con su cifra, aunque tenga una sola alerta', async () => {
    api()
    montar('/admin/calidad-datos')
    await userEvent.click(await screen.findByText('Resumen de alertas de calidad de datos'))
    const lista = await screen.findByRole('list', { name: 'Alertas por sede y dato' })
    expect(within(lista).getByText('Perímetro cefálico').closest('li')).toHaveTextContent(/\D1 alerta$/)
    expect(within(lista).getByText('Peso').closest('li')).toHaveTextContent('12 alertas')
    expect(screen.queryByText(/Otras:/)).not.toBeInTheDocument()
  })
})
