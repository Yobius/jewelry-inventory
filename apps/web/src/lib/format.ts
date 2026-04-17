import type { LocationKey, Material, Quantities } from './types'

export const MATERIAL_LABELS: Record<Material, string> = {
  GOLD: 'Золото',
  SILVER: 'Серебро',
  PLATINUM: 'Платина',
  OTHER: 'Другое',
}

export const MATERIAL_KEYS: Material[] = ['GOLD', 'SILVER', 'PLATINUM', 'OTHER']

export const LOCATION_LABELS: Record<LocationKey, string> = {
  warehouse: 'Склад',
  point1: 'Золото-Слобожа',
  point2: 'Донец',
  point3: 'Серебро-Слобожа',
}

export const LOCATION_KEYS: LocationKey[] = ['warehouse', 'point1', 'point2', 'point3']

export function totalQuantity(q: Partial<Quantities> | undefined | null): number {
  if (!q) return 0
  return (q.warehouse ?? 0) + (q.point1 ?? 0) + (q.point2 ?? 0) + (q.point3 ?? 0)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('uk-UA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
