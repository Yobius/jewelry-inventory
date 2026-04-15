import { Prisma, prisma } from '@jewelry/db'

export type AuditInput = {
  userId: string
  action: string
  entityId: string
  before?: Prisma.InputJsonValue | null
  after?: Prisma.InputJsonValue | null
  metadata?: Prisma.InputJsonValue | null
  tx?: Prisma.TransactionClient
}

export async function writeAudit(input: AuditInput): Promise<void> {
  const client = input.tx ?? prisma
  await client.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityId: input.entityId,
      before: input.before ?? Prisma.DbNull,
      after: input.after ?? Prisma.DbNull,
      metadata: input.metadata ?? Prisma.DbNull,
    },
  })
}
