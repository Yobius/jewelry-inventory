import { type Prisma, prisma } from '@jewelry/db'
import type { LocationQuantities } from '@jewelry/types'
import { writeAudit } from '../lib/audit.js'
import type { AdjustInventoryInput } from '../schemas/inventory.js'

const ZERO: LocationQuantities = { warehouse: 0, point1: 0, point2: 0, point3: 0 }

export function getQuantities(raw: Prisma.JsonValue | null | undefined): LocationQuantities {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...ZERO }
  const obj = raw as Record<string, unknown>
  return {
    warehouse: Number(obj.warehouse ?? 0),
    point1: Number(obj.point1 ?? 0),
    point2: Number(obj.point2 ?? 0),
    point3: Number(obj.point3 ?? 0),
  }
}

export class InventoryError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'INSUFFICIENT',
  ) {
    super(message)
  }
}

/**
 * Absolute set: replaces quantities at the given locations with the provided values.
 */
export async function adjustInventoryAbsolute(
  itemId: string,
  patch: AdjustInventoryInput,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.inventory.findUnique({ where: { itemId } })
    if (!inv) throw new InventoryError(`Inventory for ${itemId} not found`, 'NOT_FOUND')
    const before = getQuantities(inv.quantities)
    const after: LocationQuantities = { ...before }
    for (const key of Object.keys(patch) as (keyof AdjustInventoryInput)[]) {
      const value = patch[key]
      if (typeof value === 'number') after[key] = value
    }
    const updated = await tx.inventory.update({
      where: { itemId },
      data: { quantities: after as unknown as Prisma.InputJsonValue },
    })
    await writeAudit({
      userId,
      action: 'inventory.adjust',
      entityId: itemId,
      before: before as unknown as Prisma.InputJsonValue,
      after: after as unknown as Prisma.InputJsonValue,
      tx,
    })
    return updated
  })
}

/**
 * Delta update: +qty at `to`, -qty at `from`. Used by transactions.
 */
export async function applyInventoryDelta(
  tx: Prisma.TransactionClient,
  itemId: string,
  quantity: number,
  from?: keyof LocationQuantities,
  to?: keyof LocationQuantities,
): Promise<{ before: LocationQuantities; after: LocationQuantities }> {
  const inv = await tx.inventory.findUnique({ where: { itemId } })
  if (!inv) throw new InventoryError(`Inventory for ${itemId} not found`, 'NOT_FOUND')
  const before = getQuantities(inv.quantities)
  const after: LocationQuantities = { ...before }
  if (from) {
    const next = after[from] - quantity
    if (next < 0) {
      throw new InventoryError(
        `Insufficient quantity at ${from} (have ${after[from]})`,
        'INSUFFICIENT',
      )
    }
    after[from] = next
  }
  if (to) {
    after[to] = after[to] + quantity
  }
  await tx.inventory.update({
    where: { itemId },
    data: { quantities: after as unknown as Prisma.InputJsonValue },
  })
  return { before, after }
}
