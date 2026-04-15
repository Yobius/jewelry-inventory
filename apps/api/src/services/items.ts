import { type Prisma, prisma } from '@jewelry/db'
import { writeAudit } from '../lib/audit.js'
import type { CreateItemInput, UpdateItemInput } from '../schemas/item.js'

const DEFAULT_QUANTITIES = { warehouse: 0, point1: 0, point2: 0, point3: 0 }

export async function createItem(input: CreateItemInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.item.create({
      data: {
        sku: input.sku,
        name: input.name,
        specs: input.specs,
        material: input.material,
        carat: input.carat,
        weight: input.weight,
        pricing: input.pricing,
        identification: input.identification,
        createdBy: userId,
      },
    })
    await tx.inventory.create({
      data: {
        itemId: item.id,
        quantities: input.initialQuantities ?? DEFAULT_QUANTITIES,
      },
    })
    await writeAudit({
      userId,
      action: 'item.create',
      entityId: item.id,
      after: serializeItem(item) as Prisma.InputJsonValue,
      tx,
    })
    return tx.item.findUniqueOrThrow({
      where: { id: item.id },
      include: { inventory: true },
    })
  })
}

export type ListItemsParams = {
  skip?: number
  take?: number
  search?: string
}

export function listItems(params: ListItemsParams = {}) {
  const { skip = 0, take = 20, search } = params
  const where: Prisma.ItemWhereInput = search
    ? {
        OR: [
          { sku: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}
  return prisma.$transaction([
    prisma.item.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { inventory: true },
    }),
    prisma.item.count({ where }),
  ])
}

export function getItemById(id: string) {
  return prisma.item.findUnique({
    where: { id },
    include: { inventory: true, history: { orderBy: { createdAt: 'desc' }, take: 10 } },
  })
}

export async function updateItem(id: string, input: UpdateItemInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.item.findUnique({ where: { id } })
    if (!before) return null

    const updated = await tx.item.update({
      where: { id },
      data: {
        sku: input.sku ?? undefined,
        name: input.name ?? undefined,
        specs: input.specs ?? undefined,
        material: input.material ?? undefined,
        carat: input.carat ?? undefined,
        weight: input.weight ?? undefined,
        pricing: input.pricing ?? undefined,
        identification: input.identification ?? undefined,
      },
      include: { inventory: true },
    })

    const beforeSnap = serializeItem(before)
    const afterSnap = serializeItem(updated)
    const diff = computeDiff(beforeSnap, afterSnap)
    if (Object.keys(diff).length > 0) {
      await tx.itemHistory.create({
        data: {
          itemId: id,
          changes: diff as Prisma.InputJsonValue,
        },
      })
      await writeAudit({
        userId,
        action: 'item.update',
        entityId: id,
        before: beforeSnap as Prisma.InputJsonValue,
        after: afterSnap as Prisma.InputJsonValue,
        tx,
      })
    }

    return updated
  })
}

type ItemSnapshot = {
  id: string
  sku: string
  name: string
  specs: Prisma.JsonValue
  material: string
  carat: number | null
  weight: string
  pricing: Prisma.JsonValue
  identification: Prisma.JsonValue
}

function serializeItem(item: {
  id: string
  sku: string
  name: string
  specs: Prisma.JsonValue
  material: string
  carat: number | null
  weight: Prisma.Decimal
  pricing: Prisma.JsonValue
  identification: Prisma.JsonValue
}): ItemSnapshot {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    specs: item.specs,
    material: item.material,
    carat: item.carat,
    weight: item.weight.toString(),
    pricing: item.pricing,
    identification: item.identification,
  }
}

function computeDiff(
  before: ItemSnapshot,
  after: ItemSnapshot,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  const keys = new Set([
    ...Object.keys(before as Record<string, unknown>),
    ...Object.keys(after as Record<string, unknown>),
  ])
  const b = before as unknown as Record<string, unknown>
  const a = after as unknown as Record<string, unknown>
  for (const key of keys) {
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) {
      diff[key] = { before: b[key], after: a[key] }
    }
  }
  return diff
}
