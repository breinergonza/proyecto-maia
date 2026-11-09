// Los submódulos de la analítica, en el orden en que se muestran (menú, fichas y rutas).
export const SUBMODULOS = [
  { id: 'resumen', texto: 'Resumen' },
  { id: 'rendimiento', texto: 'Rendimiento' },
  { id: 'anticipacion', texto: 'Anticipación' },
  { id: 'calibracion', texto: 'Calibración' },
  { id: 'interpretabilidad', texto: 'Qué datos pesan' },
  { id: 'poblacion', texto: 'Población' },
  { id: 'equidad', texto: 'Equidad' },
  { id: 'estabilidad', texto: 'Estabilidad' },
  { id: 'trayectorias', texto: 'Trayectorias' },
  { id: 'perfiles', texto: 'Perfiles' },
  { id: 'comparar', texto: 'Comparar' },
] as const

export type IdSubmodulo = (typeof SUBMODULOS)[number]['id']
export const esSubmodulo = (id: string | undefined): id is IdSubmodulo => SUBMODULOS.some((s) => s.id === id)
