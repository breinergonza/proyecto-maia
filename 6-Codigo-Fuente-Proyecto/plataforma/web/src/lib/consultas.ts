// Consultas compartidas (TanStack Query).
import { useQuery } from '@tanstack/react-query'
import { pedir } from '../api/cliente'
import type { Paquete, Salud } from '../api/tipos'

export const useSalud = () => useQuery({ queryKey: ['salud'], queryFn: () => pedir<Salud>('/salud') })
export const usePaqueteActivo = () =>
  useQuery({ queryKey: ['modelos', 'activo'], queryFn: () => pedir<Paquete | null>('/modelos/activo') })

export const SERIES = ['var(--color-serie-1)', 'var(--color-serie-2)', 'var(--color-serie-3)'] as const
export const HEX_SERIES = ['#008f99', '#a97a10', '#7f5cb5'] as const
