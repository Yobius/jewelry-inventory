import { prisma } from '@jewelry/db'
import { getQuantities } from './inventory.js'

export type InventoryReportRow = {
  sku: string
  name: string
  material: string
  weight: string
  warehouse: number
  point1: number
  point2: number
  point3: number
  total: number
}

export async function loadInventoryReport(): Promise<InventoryReportRow[]> {
  const items = await prisma.item.findMany({
    include: { inventory: true },
    orderBy: { createdAt: 'desc' },
  })
  return items.map((item) => {
    const q = getQuantities(item.inventory?.quantities)
    return {
      sku: item.sku,
      name: item.name,
      material: item.material,
      weight: item.weight.toString(),
      warehouse: q.warehouse,
      point1: q.point1,
      point2: q.point2,
      point3: q.point3,
      total: q.warehouse + q.point1 + q.point2 + q.point3,
    }
  })
}

export type TransactionReportRow = {
  createdAt: Date
  type: string
  sku: string
  itemName: string
  quantity: number
  from: string | null
  to: string | null
  reason: string | null
}

export async function loadTransactionsReport(limit = 500): Promise<TransactionReportRow[]> {
  const rows = await prisma.transaction.findMany({
    include: { item: true },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 2000),
  })
  return rows.map((tx) => {
    const movement =
      tx.movement && typeof tx.movement === 'object' && !Array.isArray(tx.movement)
        ? (tx.movement as Record<string, unknown>)
        : {}
    return {
      createdAt: tx.createdAt,
      type: tx.type,
      sku: tx.item.sku,
      itemName: tx.item.name,
      quantity: tx.quantity,
      from: typeof movement.from === 'string' ? movement.from : null,
      to: typeof movement.to === 'string' ? movement.to : null,
      reason: tx.reason,
    }
  })
}
