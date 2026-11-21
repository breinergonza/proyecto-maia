import type { Hiperparametros } from '../api/tipos'
import { numero } from '../lib/formato'
import { Campo, Entrada } from './ui'

type CampoHp = Hiperparametros['campos'][number]

/** Desde cuántas veces de diferencia con el valor por defecto se sospecha un cero de más o de menos. */
const VECES_SOSPECHOSAS = 10

/** Lo que dice el valor escrito (o el valor por defecto, si está vacío) en su unidad, su rango, y un aviso si un decimal
 * se aleja 10 veces o más del valor por defecto: 0,05 en lugar de 0,005 es otra meta, no un ajuste fino. */
export function textosHiperparametro(c: CampoHp, escrito: string): { ayuda: string; aviso?: string } {
  const n = escrito.trim() === '' ? null : Number(escrito)
  const valor = n ?? c.defecto
  const partes = [c.ayuda]
  if (c.escala === 'por_mil' && valor != null && Number.isFinite(valor)) {
    partes.push(`${numero(valor)} = ${numero(valor * 1000)} por cada 1.000 datos.`)
  }
  partes.push(`De ${numero(c.minimo)} a ${numero(c.maximo)} · por defecto: ${numero(c.defecto)}.`)
  const d = c.defecto
  let aviso: string | undefined
  if (c.tipo === 'float' && n != null && Number.isFinite(n) && n > 0 && d != null && d > 0) {
    const veces = Math.max(n / d, d / n)
    if (veces >= VECES_SOSPECHOSAS) {
      aviso = `Es ${numero(Math.round(veces))} veces ${n > d ? 'más' : 'menos'} que el valor por defecto (${numero(d)}): ` +
        'revise que no sobre ni falte un cero.'
    }
  }
  return { ayuda: partes.join(' '), aviso }
}

/** Un hiperparámetro ajustable, igual en Configuración y en «Entrenar ahora». */
export function CampoHiperparametro({ c, id, valor, cambiar, sugerirDefecto }: {
  c: CampoHp; id: string; valor: string; cambiar: (v: string) => void
  /** Vacío = el valor por defecto, que se ve en gris. */
  sugerirDefecto?: boolean
}) {
  const { ayuda, aviso } = textosHiperparametro(c, valor)
  return (
    <Campo id={id} etiqueta={c.etiqueta} ayuda={ayuda} aviso={aviso}>
      <Entrada id={id} type="number" inputMode="decimal" min={c.minimo} max={c.maximo}
        step={c.tipo === 'int' ? 1 : 'any'} placeholder={sugerirDefecto ? String(c.defecto ?? '') : undefined}
        value={valor} onChange={(e) => cambiar(e.target.value)} />
    </Campo>
  )
}
