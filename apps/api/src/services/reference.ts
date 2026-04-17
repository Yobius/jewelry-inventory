import { type Prisma, prisma } from '@jewelry/db'
import { writeAudit } from '../lib/audit.js'
import type {
  CreateManufacturerInput,
  CreateStoneInput,
  CreateSupplierInput,
  ListQuery,
  UpdateManufacturerInput,
  UpdateStoneInput,
  UpdateSupplierInput,
} from '../schemas/reference.js'

// -----------------------------------------------------------------------------
// Manufacturer
// -----------------------------------------------------------------------------

export async function createManufacturer(input: CreateManufacturerInput, userId: string) {
  const row = await prisma.manufacturer.create({ data: input })
  await writeAudit({
    userId,
    action: 'manufacturer.create',
    entityId: row.id,
    after: row as unknown as Prisma.InputJsonValue,
  })
  return row
}

export function listManufacturers({ skip = 0, take = 50, search }: ListQuery) {
  const where: Prisma.ManufacturerWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}
  return prisma.$transaction([
    prisma.manufacturer.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    }),
    prisma.manufacturer.count({ where }),
  ])
}

export function getManufacturerById(id: string) {
  return prisma.manufacturer.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  })
}

export async function updateManufacturer(
  id: string,
  input: UpdateManufacturerInput,
  userId: string,
) {
  const before = await prisma.manufacturer.findUnique({ where: { id } })
  if (!before) return null
  const after = await prisma.manufacturer.update({ where: { id }, data: input })
  await writeAudit({
    userId,
    action: 'manufacturer.update',
    entityId: id,
    before: before as unknown as Prisma.InputJsonValue,
    after: after as unknown as Prisma.InputJsonValue,
  })
  return after
}

export async function deleteManufacturer(id: string, userId: string) {
  const before = await prisma.manufacturer.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  })
  if (!before) return { status: 'not-found' as const }
  if (before._count.items > 0) {
    return { status: 'in-use' as const, itemsCount: before._count.items }
  }
  await prisma.manufacturer.delete({ where: { id } })
  await writeAudit({
    userId,
    action: 'manufacturer.delete',
    entityId: id,
    before: before as unknown as Prisma.InputJsonValue,
  })
  return { status: 'ok' as const }
}

// -----------------------------------------------------------------------------
// Supplier
// -----------------------------------------------------------------------------

export async function createSupplier(input: CreateSupplierInput, userId: string) {
  const row = await prisma.supplier.create({ data: input })
  await writeAudit({
    userId,
    action: 'supplier.create',
    entityId: row.id,
    after: row as unknown as Prisma.InputJsonValue,
  })
  return row
}

export function listSuppliers({ skip = 0, take = 50, search }: ListQuery) {
  const where: Prisma.SupplierWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}
  return prisma.$transaction([
    prisma.supplier.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true, imports: true } } },
    }),
    prisma.supplier.count({ where }),
  ])
}

export function getSupplierById(id: string) {
  return prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { items: true, imports: true } } },
  })
}

export async function updateSupplier(id: string, input: UpdateSupplierInput, userId: string) {
  const before = await prisma.supplier.findUnique({ where: { id } })
  if (!before) return null
  const after = await prisma.supplier.update({ where: { id }, data: input })
  await writeAudit({
    userId,
    action: 'supplier.update',
    entityId: id,
    before: before as unknown as Prisma.InputJsonValue,
    after: after as unknown as Prisma.InputJsonValue,
  })
  return after
}

export async function deleteSupplier(id: string, userId: string) {
  const before = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { items: true, imports: true } } },
  })
  if (!before) return { status: 'not-found' as const }
  if (before._count.items > 0 || before._count.imports > 0) {
    return {
      status: 'in-use' as const,
      itemsCount: before._count.items,
      importsCount: before._count.imports,
    }
  }
  await prisma.supplier.delete({ where: { id } })
  await writeAudit({
    userId,
    action: 'supplier.delete',
    entityId: id,
    before: before as unknown as Prisma.InputJsonValue,
  })
  return { status: 'ok' as const }
}

// -----------------------------------------------------------------------------
// Stone
// -----------------------------------------------------------------------------

export async function createStone(input: CreateStoneInput, userId: string) {
  const row = await prisma.stone.create({ data: input })
  await writeAudit({
    userId,
    action: 'stone.create',
    entityId: row.id,
    after: row as unknown as Prisma.InputJsonValue,
  })
  return row
}

export function listStones({ skip = 0, take = 50, search }: ListQuery) {
  const where: Prisma.StoneWhereInput = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}
  return prisma.$transaction([
    prisma.stone.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    }),
    prisma.stone.count({ where }),
  ])
}

export function getStoneById(id: string) {
  return prisma.stone.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  })
}

export async function updateStone(id: string, input: UpdateStoneInput, userId: string) {
  const before = await prisma.stone.findUnique({ where: { id } })
  if (!before) return null
  const after = await prisma.stone.update({ where: { id }, data: input })
  await writeAudit({
    userId,
    action: 'stone.update',
    entityId: id,
    before: before as unknown as Prisma.InputJsonValue,
    after: after as unknown as Prisma.InputJsonValue,
  })
  return after
}

export async function deleteStone(id: string, userId: string) {
  const before = await prisma.stone.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  })
  if (!before) return { status: 'not-found' as const }
  if (before._count.items > 0) {
    return { status: 'in-use' as const, itemsCount: before._count.items }
  }
  await prisma.stone.delete({ where: { id } })
  await writeAudit({
    userId,
    action: 'stone.delete',
    entityId: id,
    before: before as unknown as Prisma.InputJsonValue,
  })
  return { status: 'ok' as const }
}
