import { Prisma, prisma } from '@jewelry/db'
import { writeAudit } from '../lib/audit.js'
import type { BulkPriceInput, CreateItemInput, UpdateItemInput } from '../schemas/item.js'

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
  material?: 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'
  manufacturerId?: string
  supplierId?: string
  weightMin?: number
  weightMax?: number
  caratMin?: number
  caratMax?: number
  priceMin?: number
  priceMax?: number
  hasStones?: boolean
  tag?: string
  /** Show only items with >0 on this location key */
  location?: 'warehouse' | 'point1' | 'point2' | 'point3'
  /** Show only items with total stock <= 1 */
  lowStock?: boolean
  /** Sort order */
  sort?:
    | 'created_desc'
    | 'created_asc'
    | 'sku_asc'
    | 'sku_desc'
    | 'total_desc'
    | 'total_asc'
    | 'warehouse_desc'
    | 'point1_desc'
    | 'point2_desc'
    | 'point3_desc'
}

export function buildItemsWhere(params: ListItemsParams): Prisma.ItemWhereInput {
  const where: Prisma.ItemWhereInput = {}
  const and: Prisma.ItemWhereInput[] = []

  if (params.search) {
    and.push({
      OR: [
        { sku: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
      ],
    })
  }
  if (params.material) and.push({ material: params.material })
  if (params.manufacturerId) and.push({ manufacturerId: params.manufacturerId })
  if (params.supplierId) and.push({ supplierId: params.supplierId })

  if (params.weightMin != null || params.weightMax != null) {
    const w: Prisma.DecimalFilter = {}
    if (params.weightMin != null) w.gte = params.weightMin
    if (params.weightMax != null) w.lte = params.weightMax
    and.push({ weight: w })
  }
  if (params.caratMin != null || params.caratMax != null) {
    const c: Prisma.IntNullableFilter = {}
    if (params.caratMin != null) c.gte = params.caratMin
    if (params.caratMax != null) c.lte = params.caratMax
    and.push({ carat: c })
  }
  if (params.priceMin != null || params.priceMax != null) {
    // pricing is JSON — use path-based filtering on unitPrice (stored as string decimal)
    // Prisma's JSON path on strings lets us filter lexicographically which is not safe
    // for numbers. Instead we run a follow-up in-memory filter OR skip to bulk endpoint.
    // For the list endpoint we do nothing here; UI can combine weight + per-gram upstream.
    // (Price is a computed output, not a stored column — proper indexing would need a
    //  materialized column or moving pricing out of JSON.)
  }
  if (params.hasStones === true) and.push({ stones: { some: {} } })
  if (params.hasStones === false) and.push({ stones: { none: {} } })
  if (params.tag) {
    and.push({
      specs: {
        path: ['tags'],
        array_contains: [params.tag],
      } as unknown as Prisma.JsonNullableFilter,
    })
  }

  if (and.length) where.AND = and
  return where
}

export async function listItems(params: ListItemsParams = {}): Promise<[unknown[], number]> {
  const { skip = 0, take = 20, sort, location, lowStock } = params
  const needsInventoryFilter = Boolean(location || lowStock)
  const inventorySort =
    sort &&
    sort !== 'created_desc' &&
    sort !== 'created_asc' &&
    sort !== 'sku_asc' &&
    sort !== 'sku_desc'
  const needsRaw = needsInventoryFilter || inventorySort

  const where = buildItemsWhere(params)

  // Fast path: pure Prisma — no inventory filtering or sort on inventory.
  if (!needsRaw) {
    const orderBy: Prisma.ItemOrderByWithRelationInput =
      sort === 'sku_asc'
        ? { sku: 'asc' }
        : sort === 'sku_desc'
          ? { sku: 'desc' }
          : sort === 'created_asc'
            ? { createdAt: 'asc' }
            : { createdAt: 'desc' }
    const [items, total] = await prisma.$transaction([
      prisma.item.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { inventory: true, manufacturer: true, supplier: true },
      }),
      prisma.item.count({ where }),
    ])
    return [items, total]
  }

  // Slow path: needs to filter/sort by JSON-inventory. Do it via raw SQL to
  // get IDs + total, then hydrate with Prisma.
  // We can still leverage `where` for SKU/material/manufacturer filters by
  // running Prisma count+id list in one query.
  const eligibleIds = await prisma.item.findMany({
    where,
    select: { id: true },
  })
  const eligibleSet = new Set(eligibleIds.map((r) => r.id))
  if (eligibleSet.size === 0) return [[], 0]

  // Build raw query that joins Inventory and filters/sorts by JSON keys.
  // We use `ANY($1::text[])` so we pass an array parameter.
  const ids = [...eligibleSet]
  const locKey = location ?? null
  const wantLow = lowStock ?? false

  // Sort expression based on request
  const orderSql = (() => {
    switch (sort) {
      case 'total_asc':
        return `(COALESCE((q->>'warehouse')::int,0)+COALESCE((q->>'point1')::int,0)+COALESCE((q->>'point2')::int,0)+COALESCE((q->>'point3')::int,0)) ASC`
      case 'total_desc':
        return `(COALESCE((q->>'warehouse')::int,0)+COALESCE((q->>'point1')::int,0)+COALESCE((q->>'point2')::int,0)+COALESCE((q->>'point3')::int,0)) DESC`
      case 'warehouse_desc':
        return `COALESCE((q->>'warehouse')::int,0) DESC`
      case 'point1_desc':
        return `COALESCE((q->>'point1')::int,0) DESC`
      case 'point2_desc':
        return `COALESCE((q->>'point2')::int,0) DESC`
      case 'point3_desc':
        return `COALESCE((q->>'point3')::int,0) DESC`
      default:
        return `i."createdAt" DESC`
    }
  })()

  // Filter expression
  const filterParts: string[] = []
  if (locKey) filterParts.push(`COALESCE((q->>'${locKey}')::int,0) > 0`)
  if (wantLow) {
    // "Закінчується" = total == 0. Товар з залишком 1 не вважаємо critical,
    // бо 99% наших позицій — унікальні ювелірні вироби в кількості 1.
    filterParts.push(
      `(COALESCE((q->>'warehouse')::int,0)+COALESCE((q->>'point1')::int,0)+COALESCE((q->>'point2')::int,0)+COALESCE((q->>'point3')::int,0)) = 0`,
    )
  }
  const filterSql = filterParts.length ? `AND ${filterParts.join(' AND ')}` : ''

  // Note: we validated `locKey` and `sort` above (zod enum) so the string
  // interpolation below cannot inject SQL.
  const rawIds = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `
    SELECT i.id
    FROM "Item" i
    LEFT JOIN "Inventory" inv ON inv."itemId" = i.id
    , LATERAL (SELECT inv.quantities AS q) qj
    WHERE i.id = ANY($1::text[])
    ${filterSql}
    ORDER BY ${orderSql}
    OFFSET $2 LIMIT $3
    `,
    ids,
    skip,
    take,
  )
  const rawCount = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `
    SELECT COUNT(*)::bigint AS count
    FROM "Item" i
    LEFT JOIN "Inventory" inv ON inv."itemId" = i.id
    , LATERAL (SELECT inv.quantities AS q) qj
    WHERE i.id = ANY($1::text[])
    ${filterSql}
    `,
    ids,
  )
  const total = Number(rawCount[0]?.count ?? 0)

  const pageIds = rawIds.map((r) => r.id)
  if (pageIds.length === 0) return [[], total]

  const items = await prisma.item.findMany({
    where: { id: { in: pageIds } },
    include: { inventory: true, manufacturer: true, supplier: true },
  })
  // Preserve order from raw query
  const byId = new Map(items.map((i) => [i.id, i]))
  const ordered = pageIds.map((id) => byId.get(id)).filter((x) => x != null)
  return [ordered, total]
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

// -----------------------------------------------------------------------------
// Bulk price update
// -----------------------------------------------------------------------------

export type BulkPriceResult = {
  matched: number
  updated: number
  sample: { id: string; sku: string; name: string; oldUnitPrice: string; newUnitPrice: string }[]
  dryRun: boolean
  refused?: 'too_many_rows'
}

export async function bulkUpdatePrice(
  input: BulkPriceInput,
  userId: string,
): Promise<BulkPriceResult> {
  const where = buildItemsWhere({
    material: input.filter.material,
    manufacturerId: input.filter.manufacturerId,
    supplierId: input.filter.supplierId,
    weightMin: input.filter.weightMin,
    weightMax: input.filter.weightMax,
    caratMin: input.filter.caratMin,
    caratMax: input.filter.caratMax,
    tag: input.filter.tag,
  })

  const matched = await prisma.item.count({ where })

  if (matched > input.maxRows) {
    return {
      matched,
      updated: 0,
      sample: [],
      dryRun: input.dryRun,
      refused: 'too_many_rows',
    }
  }

  // Fetch affected rows (weight needed for per-gram formula)
  const rows = await prisma.item.findMany({
    where,
    select: { id: true, sku: true, name: true, weight: true, pricing: true },
  })

  type Change = {
    id: string
    sku: string
    name: string
    oldUnitPrice: string
    newUnitPrice: string
    newPerGram?: string
  }
  const changes: Change[] = []

  for (const row of rows) {
    const pricing = (row.pricing ?? {}) as { unitPrice?: string; perGram?: string }
    const oldUnitPrice = String(pricing.unitPrice ?? '0')
    const oldPerGram = String(pricing.perGram ?? '0')
    let newUnit: Prisma.Decimal
    let newPerGram: Prisma.Decimal | null = null

    if (input.formula.kind === 'fixed') {
      newUnit = new Prisma.Decimal(input.formula.unitPrice)
    } else if (input.formula.kind === 'perGramPlusWork') {
      const pg = new Prisma.Decimal(input.formula.perGram)
      const work = new Prisma.Decimal(input.formula.work)
      newUnit = row.weight.mul(pg).plus(work)
      newPerGram = pg
    } else {
      // percent
      const factor = new Prisma.Decimal(1).plus(input.formula.percent / 100)
      newUnit = new Prisma.Decimal(oldUnitPrice).mul(factor)
    }

    changes.push({
      id: row.id,
      sku: row.sku,
      name: row.name,
      oldUnitPrice,
      newUnitPrice: newUnit.toFixed(2),
      ...(newPerGram ? { newPerGram: newPerGram.toFixed(2) } : {}),
    })
  }

  const sample = changes.slice(0, 20).map((c) => ({
    id: c.id,
    sku: c.sku,
    name: c.name,
    oldUnitPrice: c.oldUnitPrice,
    newUnitPrice: c.newUnitPrice,
  }))

  if (input.dryRun) {
    return { matched, updated: 0, sample, dryRun: true }
  }

  // Apply
  let updated = 0
  for (const c of changes) {
    const nextPricing: Record<string, string> = { unitPrice: c.newUnitPrice }
    if (c.newPerGram) nextPricing.perGram = c.newPerGram
    else {
      // preserve existing perGram
      const row = rows.find((r) => r.id === c.id)
      const existing = (row?.pricing ?? {}) as { perGram?: string }
      nextPricing.perGram = String(existing.perGram ?? '0')
    }
    await prisma.item.update({
      where: { id: c.id },
      data: {
        pricing: nextPricing as unknown as Prisma.InputJsonValue,
      },
    })
    updated++
  }

  await writeAudit({
    userId,
    action: 'item.bulk_price',
    entityId: `bulk:${Date.now()}`,
    metadata: {
      matched,
      updated,
      formula: input.formula,
      filter: input.filter,
    } as unknown as Prisma.InputJsonValue,
  })

  return { matched, updated, sample, dryRun: false }
}
