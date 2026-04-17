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
  point1: 'Точка 1',
  point2: 'Точка 2',
  point3: 'Точка 3',
}

export const LOCATION_KEYS: LocationKey[] = ['warehouse', 'point1', 'point2', 'point3']

export function totalQuantity(q: Partial<Quantities> | undefined | null): number {
  if (!q) return 0
  return (q.warehouse ?? 0) + (q.point1 ?? 0) + (q.point2 ?? 0) + (q.point3 ?? 0)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
