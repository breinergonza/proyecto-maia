import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())

// Las páginas se cargan diferidas (lazy) y las que tienen gráficas tardan más de 1 s en jsdom con toda la suite corriendo
configure({ asyncUtilTimeout: 5000 })

// Recharts mide el contenedor; jsdom no tiene ResizeObserver
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver
