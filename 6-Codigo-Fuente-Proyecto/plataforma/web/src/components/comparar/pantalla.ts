// Si la pantalla es de escritorio y alta (p. ej. 1920×1080): ahí Comparar grupos tiene sitio para mostrar a la vez lo que
// en un portátil va en vistas alternas, en lugar de dejar media pantalla vacía. Sin ``matchMedia`` (pruebas), no es alta.
import { useSyncExternalStore } from 'react'

const CONSULTA = '(min-width: 1280px) and (min-height: 1000px)'
const medir = () => (typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA) : null)

function suscribir(avisar: () => void) {
  const lista = medir()
  lista?.addEventListener('change', avisar)
  return () => lista?.removeEventListener('change', avisar)
}

export const usePantallaAlta = () => useSyncExternalStore(suscribir, () => medir()?.matches ?? false, () => false)
