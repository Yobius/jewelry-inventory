import { type Prisma, prisma } from '@jewelry/db'
import { writeAudit } from '../lib/audit.js'
import type { CreateTransactionInput } from '../schemas/transaction.js'
import { applyInventoryDelta } from './inventory.js'

export async function recordTransaction(input: CreateTransactionInput, userId: string) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({ where: { id: input.itemId } })
    if (!item) return null

    const { before, after } = await applyInventoryDelta(
      tx,
      input.itemId,
      input.quantity,
      input.from,
      input.to,
    )

    const movement = { from: input.from, to: input.to }
    const transaction = await tx.transaction.create({
      data: {
        itemId: input.itemId,
        movement: movement as unknown as Prisma.InputJsonValue,
        quantity: input.quantity,
        type: input.type,
        reason: input.reason,
        userId,
      },
    })

    await writeAudit({
      userId,
      action: `transaction.${input.type.toLowerCase()}`,
      entityId: transaction.id,
      before: { itemId: input.itemId, quantities: before } as unknown as Prisma.InputJsonValue,
      after: { itemId: input.itemId, quantities: after } as unknown as Prisma.InputJsonValue,
      metadata: movement as unknown as Prisma.InputJsonValue,
      tx,
    })

    return transaction
  })
}

export function listTransactions(limit = 50) {
  return prisma.transaction.findMany({
    include: { item: { select: { id: true, sku: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  })
}
