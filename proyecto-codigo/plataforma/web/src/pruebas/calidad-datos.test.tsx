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
      { etapa: 'e40', etapa_nombre: '40 sem', con_dato: 94, con_visita: 100, pct: 94, a_12_meses: false },
      { etapa: 'e12', etapa_nombre: '12 m', con_dato: 71, con_visita: 100, pct: 71, a_12_meses: true },
    ],
  },
}
const dato = (extra: object = {}) => ({
  id: 7, prioridad: 1, sujeto: 'S-02210', variable: 'talla_6', etiqueta: 'Talla', unidad: 'cm', etapa: 'e6', etapa_nombre: '6 m',
  fecha: '2026-01-01', valor: '58', esperado: 66, rango_bajo: 62, rango_alto: 70, capas: ['1'], motivo: 'valor atípico', fuerza: 9,
  es_error: null, comentario: null, serie: [], revisiones: [], ...extra,
})
const cola = (items: object[]) => ({ total: items.length, pagina: 1, tamano: 12, items })

function api(items: object[] = [dato()], extra?: (url: string, init?: RequestInit) => { estado?: number; cuerpo?: unknown } | undefined) {
  return simularApi((url, init) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('admin') } }
    const e = extra?.(url, init)
    if (e) return e
    if (url === '/api/revision/datos/resumen') return { cuerpo: resumen }
    if (url.startsWith('/api/revision/datos?')) return { cuerpo: cola(items) }
    if (url === '/api/revision/datos/aciertos') return { cuerpo: { corrida_id: 1, serie: [], respondidas: 0, confirmadas_error_pct: null } }
    if (url === '/api/revision/datos/concentracion') {
      return { cuerpo: { corrida_id: 1, hay_sede: false, minimo_celda: 5, por_variable: [], otras_variables: 0, celdas: [], otras_celdas: 0 } }
    }
    if (url === '/api/tablero/resumen') return { cuerpo: { datos_revisar: 38, alertas_por_1000: 3, alarmas_grupo: 0, alertas_por_capa: {} } }
    if (url === '/api/revision/datos/7') return { estado: 204 }
    return undefined
  })
}

describe('calidad de datos: cifras y encabezado', () => {
  it('dice que son datos a revisar y no riesgos clínicos, y muestra las dos cifras del servidor', async () => {
    api()
    montar('/admin/calidad-datos')
    expect(await screen.findByRole('heading', { level: 1, name: 'Calidad de datos' })).toBeInTheDocument()
    expect(screen.getByText('Mediciones dudosas o faltantes. No son riesgos clínicos: son datos a revisar antes de usarlos.')).toBeInTheDocument()
    expect(await screen.findByText('mediciones por revisar')).toBeInTheDocument()
    expect(screen.getByText('38')).toBeInTheDocument()
    expect(screen.getByText('revisadas este mes')).toBeInTheDocument()
    expect(screen.getByText('112')).toBeInTheDocument()
    // la completitud a los 12 meses ya está en su barra: no se repite en una cifra aparte
    expect(screen.queryByText(/Completitud a los 12 meses/)).not.toBeInTheDocument()
    expect(screen.getAllByText('71,0 %').length).toBe(1)
  })
})

describe('calidad de datos: la cola', () => {
  it('muestra niño, medición con su visita, valor, por qué es dudosa con quién lo detectó, y la revisión con su estado y acción', async () => {
    api()
    montar('/admin/calidad-datos')
    const tabla = (await screen.findByRole('table')).closest('table')!
    // cinco columnas: la cola cabe junto al menú sin desplazarse de lado (la acción no queda fuera de la vista)
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(
      ['Niño', 'Medición', 'Valor registrado', 'Por qué es dudosa', '¿Es un error de registro?'])
    const fila = within(tabla).getByRole('link', { name: 'S-02210' }).closest('tr')!
    expect(fila).toHaveTextContent('6 m')
    expect(fila).toHaveTextContent('Talla')
    expect(fila).toHaveTextContent('58 cm')
    expect(within(fila).getByText(/Esperado entre 62 y 70 cm/)).toBeInTheDocument()
    expect(within(fila).getByText('Por revisar')).toBeInTheDocument()
    expect(within(fila).getByRole('button', { name: 'Es un error' })).toHaveTextContent('Sí')
    expect(within(fila).getByRole('button', { name: 'No es un error' })).toHaveTextContent('No')
    expect(within(fila).getByRole('button', { name: 'No sé' })).toBeInTheDocument()
    // lo que sobra para decidir se abre aparte: quién lo detectó, lo más probable y cuándo se midió
    expect(screen.queryByText(/Detectado por:/)).not.toBeInTheDocument()
    await userEvent.click(within(fila).getByRole('button', { name: /Ver detalle/ }))
    expect(await screen.findByText(/Detectado por:/)).toHaveTextContent('Detectado por: Valor fuera de lo esperado')
    expect(screen.getByText(/Medido el/)).toBeInTheDocument()
    // en el teléfono cada fila se vuelve una tarjeta
    expect(tabla.parentElement).toHaveClass('tabla-apilada')
  })

  it('los filtros Visita, Medición, Detectado por y Estado piden a la API lo elegido y vuelven a la primera página', async () => {
    const llamadas = api()
    montar('/admin/calidad-datos')
    await screen.findByRole('link', { name: 'S-02210' })
    expect(llamadas.some((l) => l.url.startsWith('/api/revision/datos?') && l.url.includes('estado=pendiente'))).toBe(true)
    await waitFor(() => expect(within(screen.getByLabelText('Visita')).getByRole('option', { name: /6 m/ })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Visita'), { target: { value: 'e6' } })
    fireEvent.change(screen.getByLabelText('Medición'), { target: { value: 'talla_6' } })
    fireEvent.change(screen.getByLabelText('Detectado por'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'todos' } })
    await waitFor(() => expect(llamadas.some((l) => l.url.startsWith('/api/revision/datos?') && l.url.includes('etapa=e6')
      && l.url.includes('variable=talla_6') && l.url.includes('capa=2') && l.url.includes('estado=todos') && l.url.includes('pagina=1'))).toBe(true))
  })

  it('guarda la respuesta con su comentario y la fila lo dice', async () => {
    const enviados: unknown[] = []
    api([dato()], (url, init) => {
      if (url === '/api/revision/datos/7') { enviados.push(JSON.parse(String(init?.body))); return { estado: 204 } }
      return undefined
    })
    montar('/admin/calidad-datos')
    await userEvent.click(await screen.findByRole('button', { name: /Ver detalle/ }))
    await userEvent.type(screen.getByLabelText('Comentario'), 'La báscula estaba dañada')
    await userEvent.click(screen.getByRole('button', { name: 'Es un error' }))
    await waitFor(() => expect(enviados).toEqual([{ es_error: 'si', comentario: 'La báscula estaba dañada' }]))
    expect(await screen.findByText('Respuesta guardada.')).toBeInTheDocument()
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
    expect(within(fila).getByText('Revisada: no es un error')).toBeInTheDocument()
    expect(within(fila).getByRole('button', { name: 'No es un error', pressed: true })).toBeInTheDocument()
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
    expect(within(fila).getByText(/^Última revisión: Segunda Revisora, no es un error, 19 de nov/)).toBeInTheDocument()
    expect(within(fila).getByText(/y 1 respuesta más/)).toBeInTheDocument()
    await userEvent.click(within(fila).getByRole('button', { name: /Ver detalle/ }))
    const equipo = await screen.findByRole('list', { name: 'Respuestas del equipo' })
    expect(within(equipo).getAllByRole('listitem').map((li) => li.textContent?.split(' · ')[0])).toEqual([
      'Segunda Revisora: no es un error', 'Tú: es un error'])
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
    // 71 de 100: niños con alguna medida en esa visita, no todos los niños del programa
    expect(within(figura).getByText('(71 de 100)')).toBeInTheDocument()
    expect(screen.getByText(/entre los niños con alguna medida de crecimiento en esa visita/)).toBeInTheDocument()
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
    await userEvent.click(await screen.findByText('Cómo se comportan las alertas'))
    for (const t of ['Alertas por tipo', 'Aciertos frente a la revisión', 'Dónde se concentran']) {
      expect(await screen.findByRole('heading', { name: t })).toBeInTheDocument()
    }
  })
})
