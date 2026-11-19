// Campo de correos con etiquetas: se escribe y se agrega con Enter, coma, espacio o al salir; también se pega una lista.
// Valida al instante (máscara de correo, sin repetidos) y cada correo se quita con su ×.
import { X } from 'lucide-react'
import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import { analizarCorreos } from '../lib/correos'

interface Props {
  id: string
  etiqueta: string
  value: string[]
  onChange: (correos: string[]) => void
  ayuda?: string
  maximo?: number
}

export function CampoCorreos({ id, etiqueta, value, onChange, ayuda, maximo = 50 }: Props) {
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string>()
  const entrada = useRef<HTMLInputElement>(null)
  const idAyuda = useId()

  function agregar(crudo: string) {
    const a = analizarCorreos(crudo, value)
    if (value.length + a.validos.length > maximo) { setError(`Máximo ${maximo} correos.`); return }
    if (a.validos.length) onChange([...value, ...a.validos])
    const problemas = [
      a.invalidos.length && `${a.invalidos.join(', ')} ${a.invalidos.length > 1 ? 'no son correos válidos' : 'no es un correo válido'}.`,
      a.repetidos.length && `${a.repetidos.join(', ')} ya ${a.repetidos.length > 1 ? 'están' : 'está'} en la lista.`,
    ].filter(Boolean) as string[]
    setError(problemas.join(' ') || undefined)
    setTexto(a.invalidos.join(' '))   // lo inválido queda escrito para corregirlo
  }

  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (['Enter', ',', ' ', ';'].includes(e.key) && texto.trim()) { e.preventDefault(); agregar(texto) }
    else if (e.key === 'Enter') e.preventDefault()   // no enviar el formulario con Enter
    else if (e.key === 'Backspace' && !texto && value.length) onChange(value.slice(0, -1))
  }

  function pegar(e: ClipboardEvent<HTMLInputElement>) {
    const pegado = e.clipboardData.getData('text')
    if (/[\s,;]/.test(pegado.trim())) { e.preventDefault(); agregar(pegado) }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-tinta/90">{etiqueta}</label>
      <div
        className={cn('flex min-h-11 flex-wrap items-center gap-1.5 rounded-control border bg-papel px-2 py-1.5 focus-within:ring-2 focus-within:ring-teal/40',
          error ? 'border-coral' : 'border-linea')}
        onClick={() => entrada.current?.focus()}
      >
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-full bg-teal-tinte py-0.5 pl-2.5 pr-1 text-sm text-teal">
            {c}
            <button type="button" aria-label={`Quitar ${c}`} className="rounded-full p-0.5 hover:bg-teal/15"
              onClick={(e) => { e.stopPropagation(); onChange(value.filter((x) => x !== c)); entrada.current?.focus() }}>
              <X size={14} aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={entrada} id={id} type="text" inputMode="email" autoComplete="off" spellCheck={false}
          className="min-w-[12rem] flex-1 bg-transparent py-1 text-[0.95rem] outline-none"
          placeholder={value.length ? 'Agregar otro correo…' : 'nombre@dominio.org'}
          value={texto} aria-invalid={!!error} aria-describedby={idAyuda}
          onChange={(e) => {
            const v = e.target.value
            // Teclados móviles, autocompletado o arrastrar texto no mandan «keydown» útil: si el texto llega con
            // un separador al final, se agrega aquí (agregar fija su propio error; si no, se limpia el anterior).
            if (/[\s,;]$/.test(v) && v.trim()) { agregar(v); return }
            setTexto(v)
            if (error) setError(undefined)
          }}
          onKeyDown={tecla} onPaste={pegar} onBlur={() => { if (texto.trim()) agregar(texto) }}
        />
      </div>
      <p id={idAyuda} className={cn('mt-1 text-sm', error ? 'text-coral-hondo' : 'text-salvia')} role={error ? 'alert' : undefined}>
        {error ?? ayuda ?? 'Escriba un correo y pulse Enter, coma o espacio. También puede pegar una lista.'}
      </p>
    </div>
  )
}
