import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { montar, simularApi, usuario } from './util'

afterEach(() => vi.unstubAllGlobals())

const sinSesion = (url: string) => (url === '/api/auth/refrescar' ? { estado: 401, cuerpo: { detail: 'no' } } : undefined)

describe('ingreso y permisos', () => {
  it('sin sesión lleva al ingreso', async () => {
    simularApi(sinSesion)
    montar('/ninos')
    expect(await screen.findByRole('heading', { name: 'Ingresar' })).toBeInTheDocument()
  })

  it('valida el formulario antes de llamar a la API', async () => {
    const llamadas = simularApi(sinSesion)
    montar('/ingresar')
    await userEvent.click(await screen.findByRole('button', { name: 'Ingresar al sistema' }))
    expect(await screen.findByText('Escriba su correo.')).toBeInTheDocument()
    expect(llamadas.some((l) => l.url === '/api/auth/login')).toBe(false)
  })

  it('muestra el error de la API y, con la clave correcta, entra al tablero', async () => {
    simularApi((url, init) => {
      if (url === '/api/auth/refrescar') return { estado: 401, cuerpo: {} }
      if (url === '/api/auth/login') {
        const { clave } = JSON.parse(String(init?.body))
        return clave === 'buena-clave'
          ? { cuerpo: { acceso: 't', usuario: usuario('visualizador') } }
          : { estado: 401, cuerpo: { detail: 'Correo o contraseña incorrectos.' } }
      }
      if (url === '/api/tablero/resumen') return { estado: 404, cuerpo: { detail: 'Todavía no hay resultados' } }
    })
    montar('/ingresar')
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'consulta@maia.prueba')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar al sistema' }))
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Contraseña'))
    await userEvent.type(screen.getByLabelText('Contraseña'), 'buena-clave')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar al sistema' }))
    expect(await screen.findByText('Todavía no hay resultados')).toBeInTheDocument()
  })

  it('el perfil de consulta no ve la administración ni la revisión', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('visualizador') } }
      if (url === '/api/tablero/resumen') return { estado: 404, cuerpo: { detail: 'x' } }
    })
    montar('/admin/usuarios')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(screen.queryAllByRole('link', { name: 'Usuarios' })).toHaveLength(0)
    expect(screen.queryAllByRole('link', { name: 'Datos por revisar' })).toHaveLength(0)
    expect(screen.getAllByRole('link', { name: 'Niños' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/Su perfil \(Consulta\)/)).toBeInTheDocument()
  })

  it('después de ingresar vuelve a la página que se pidió, con sus filtros', async () => {
    const llamadas = simularApi((url) => {
      if (url === '/api/auth/refrescar') return { estado: 401, cuerpo: {} }
      if (url === '/api/auth/login') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url.startsWith('/api/ninos')) return { cuerpo: { total: 0, pagina: 1, tamano: 25, items: [] } }
    })
    montar('/ninos?desenlace=readm_3m')
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'experto@maia.prueba')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'buena-clave')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar al sistema' }))
    await waitFor(() => expect(llamadas.some((l) => l.url.startsWith('/api/ninos?') && l.url.includes('desenlace=readm_3m'))).toBe(true))
  })
})

describe('calidad de datos', () => {
  const aciertos = { corrida_id: 1, serie: [{ k: 50, respondidas: 4, precision: 50 }, { k: 100, respondidas: 6, precision: 66.7 }], respondidas: 6, confirmadas_error_pct: 66.7 }
  const concentracion = {
    corrida_id: 1, hay_sede: true, minimo_celda: 5, por_variable: [{ variable: 'peso', etiqueta: 'Peso', alertas: 30 }],
    otras_variables: 2, celdas: [{ grupo: 'Sede A', variable: 'peso', etiqueta: 'Peso', alertas: 20 }], otras_celdas: 3,
  }
  const resumen = { datos_revisar: 120, alertas_por_1000: 12.5, alarmas_grupo: 3, alertas_por_capa: { '1': 50, '2': 90 } }
  const calidad = { corrida_id: 1, por_revisar: 120, revisadas: 6, revisadas_mes: 4, etapas: [], variables: [], completitud: { indicador: 'talla', nombre: 'Talla para la edad', etapas: [] } }

  it('el experto no ve el enlace ni entra a la página; el administrador sí', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
      if (url === '/api/tablero/resumen') return { estado: 404, cuerpo: { detail: 'x' } }
    })
    const { unmount } = montar('/admin/calidad-datos')
    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument()
    expect(screen.queryAllByRole('link', { name: 'Calidad de datos' })).toHaveLength(0)
    expect(screen.queryAllByRole('link', { name: 'Datos por revisar' })).toHaveLength(0)
    unmount()
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('admin') } }
      if (url === '/api/tablero/resumen') return { estado: 404, cuerpo: { detail: 'x' } }
    })
    montar('/tablero')
    expect((await screen.findAllByRole('link', { name: 'Calidad de datos' })).length).toBeGreaterThan(0)
  })

  it('muestra las cifras y los tres paneles con su frase', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('admin') } }
      if (url === '/api/tablero/resumen') return { cuerpo: resumen }
      if (url === '/api/revision/datos/resumen') return { cuerpo: calidad }
      if (url === '/api/revision/datos/aciertos') return { cuerpo: aciertos }
      if (url === '/api/revision/datos/concentracion') return { cuerpo: concentracion }
      if (url.startsWith('/api/revision/datos?')) return { cuerpo: { total: 0, pagina: 1, tamano: 12, items: [] } }
    })
    montar('/admin/calidad-datos')
    expect(await screen.findByRole('heading', { name: 'Calidad de datos' })).toBeInTheDocument()
    expect(await screen.findByText('mediciones por revisar')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Cómo se comportan las alertas'))   // las tres medidas de la revisión van en el detalle
    for (const t of ['Alertas por tipo', 'Aciertos frente a la revisión', 'Dónde se concentran']) {
      expect(await screen.findByRole('heading', { name: t })).toBeInTheDocument()
    }
    expect(screen.getByText('Cuántos datos raros encontró cada revisión.')).toBeInTheDocument()
    expect(screen.getByText('Cuántas alertas confirmó el equipo al revisar las primeras.')).toBeInTheDocument()
    expect(screen.getByText('Sede y dato con más alertas.')).toBeInTheDocument()
    expect(await screen.findByText('datos por revisar')).toBeInTheDocument()
    expect(await screen.findByText('66,7 %')).toBeInTheDocument()
    expect(await screen.findByText('Sede A · 20 alertas')).toBeInTheDocument()
    expect(screen.getByText(/Otras: 3 alertas/)).toBeInTheDocument()
  })

  it('la dirección vieja lleva a la nueva', async () => {
    simularApi((url) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('admin') } }
      if (url.startsWith('/api/revision/datos?')) return { cuerpo: { total: 0, pagina: 1, tamano: 12, items: [] } }
      if (url === '/api/revision/datos/resumen') return { cuerpo: calidad }
      if (url === '/api/revision/datos/aciertos') return { cuerpo: aciertos }
      if (url === '/api/revision/datos/concentracion') return { cuerpo: concentracion }
      return { cuerpo: {} }
    })
    montar('/revision/datos')
    expect(await screen.findByRole('heading', { name: 'Calidad de datos' })).toBeInTheDocument()
  })

  it('guarda la respuesta del administrador', async () => {
    const dato = {
      id: 7, prioridad: 1, sujeto: 's1', variable: 'peso_40', etiqueta: 'Peso a 40 sem', unidad: 'g', etapa: 's40',
      etapa_nombre: '40 semanas', fecha: '2026-01-01', valor: '9999', esperado: 2800, rango_bajo: 2000, rango_alto: 3500,
      capas: ['1', '2'], motivo: 'valor atípico', fuerza: 9, es_error: null, comentario: null, revisiones: [],
      serie: [
        { variable: 'peso_nacer', etapa_nombre: 'Nacimiento', orden: 0, valor: 1500, es_este: false },
        { variable: 'peso_40', etapa_nombre: '40 semanas', orden: 2, valor: 9999, es_este: true },
      ],
    }
    const enviados: unknown[] = []
    simularApi((url, init) => {
      if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('admin') } }
      if (url.startsWith('/api/revision/datos?')) return { cuerpo: { total: 1, pagina: 1, tamano: 10, items: [dato] } }
      if (url === '/api/revision/datos/resumen') return { cuerpo: calidad }
      if (url === '/api/revision/datos/aciertos') return { cuerpo: aciertos }
      if (url === '/api/revision/datos/concentracion') return { cuerpo: concentracion }
      if (url === '/api/revision/datos/7') {
        enviados.push(JSON.parse(String(init?.body)))
        return { estado: 204 }
      }
      return { cuerpo: {} }
    })
    montar('/admin/calidad-datos')
    expect(await screen.findByText(/Esperado entre/)).toBeInTheDocument()
    // la serie del niño para ese concepto se abre aparte, y sin el motivo que solo repite la etiqueta «Valor fuera de lo esperado»
    await userEvent.click(screen.getByRole('button', { name: /Ver detalle/ }))
    expect(screen.getByRole('figure', { name: 'Peso a 40 sem de este niño en cada visita: Nacimiento, 1.500 g; 40 semanas, 9.999 g' }))
      .toBeInTheDocument()
    expect(screen.queryByText(/Valor muy distinto/)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Comentario'), 'La báscula estaba dañada')
    await userEvent.click(screen.getByRole('button', { name: 'Es un error' }))
    await waitFor(() => expect(enviados).toEqual([{ es_error: 'si', comentario: 'La báscula estaba dañada' }]))
    expect(await screen.findByText('Respuesta guardada.')).toBeInTheDocument()
  })
})

describe('niños: lista', () => {
  const fila = {
    sujeto: 's1', eg_semanas: 27, grupo: null, percentil_max: 97, riesgo_max: 0.9, clave_max: 'des6_desde_40', n_riesgos: 6, n_alertas: 0,
    desenlace_max: 'desarrollo psicomotor bajo a los 6 meses (riesgo calculado a 40 sem)', n_bajo_2de: 0, n_caida_1de: 0, n_crecimiento: 4,
    ultima_visita: '3 meses', ultima_fecha: '2026-03-01', ultima_edad_corregida: 90,
  }
  const sinDato = { ...fila, sujeto: 's2', percentil_max: 40, n_riesgos: 0, desenlace_max: null, n_crecimiento: 0 }
  const api = () => simularApi((url) => {
    if (url === '/api/auth/refrescar') return { cuerpo: { acceso: 't', usuario: usuario('experto') } }
    if (url.startsWith('/api/ninos?')) return { cuerpo: { total: 2, pagina: 1, tamano: 25, items: [fila, sinDato] } }
    if (url === '/api/tablero/resumen') return { cuerpo: { riesgos_por_desenlace: [] } }
    return { cuerpo: {} }
  })

  it('«Riesgo más alto» queda corto: el desenlace con «+5» y el detalle (visita y cuántos más) en el title', async () => {
    api()
    montar('/ninos')
    const celda = (await screen.findByText('desarrollo psicomotor bajo a los 6 meses')).closest('td')!
    expect(celda).toHaveTextContent('+5')
    expect(celda.querySelector('[title]')).toHaveAttribute('title', expect.stringMatching(/riesgo calculado a 40 sem.*5 más/s))
    expect(screen.queryByText(/riesgo calculado a 40 sem/)).not.toBeInTheDocument()
  })

  it('el subtítulo es una línea y dice qué es «alto» y «muy alto» con los porcentajes del filtro', async () => {
    api()
    montar('/ninos')
    const subtitulo = (await screen.findByRole('heading', { name: 'Niños' })).nextElementSibling!
    expect(subtitulo.textContent).toMatch(/Alto: entre el 10 % más alto de los niños con que se calibró cada modelo; muy alto: el 5 %/)
    expect(subtitulo.textContent).toMatch(/seudonimizados/)
    expect(subtitulo.textContent!.length).toBeLessThan(170)
  })

  it('lo que no hay que mirar («Sin dato», «Sin controles») va apagado y sin insignia', async () => {
    api()
    montar('/ninos')
    const sin = await screen.findByText('Sin dato')
    expect(sin).toHaveClass('text-salvia')
    expect(sin.closest('.rounded-full')).toBeNull()
  })
})
