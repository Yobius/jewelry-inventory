import { prisma } from '@jewelry/db'

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

function startOfDay(d = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfDayNDaysAgo(n: number): Date {
  const d = startOfDay()
  d.setDate(d.getDate() - n)
  return d
}

// -----------------------------------------------------------------------------
// Dashboard KPI
// -----------------------------------------------------------------------------

export type DashboardStats = {
  today: {
    sales: number
    units: number
    revenue: string
  }
  week: {
    sales: number
    units: number
    revenue: string
  }
  inventory: {
    totalItems: number
    totalUnits: number
    byLocation: Record<string, number>
    lowStockCount: number
  }
  byMaterial: { material: string; items: number; units: number }[]
  topItemsWeek: { id: string; sku: string; name: string; sold: number }[]
  dailyRevenue: { date: string; revenue: string; sales: number }[]
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = startOfDay()
  const weekAgo = startOfDayNDaysAgo(6) // last 7 days inclusive

  // --- today's OUT transactions ---
  const todayOut = await prisma.transaction.findMany({
    where: { type: 'OUT', createdAt: { gte: today } },
    include: { item: { select: { pricing: true } } },
  })
  const todayStats = sumTransactions(todayOut)

  // --- last 7 days OUT ---
  const weekOut = await prisma.transaction.findMany({
    where: { type: 'OUT', createdAt: { gte: weekAgo } },
    include: { item: { select: { pricing: true } } },
  })
  const weekStats = sumTransactions(weekOut)

  // --- daily breakdown for 7 days ---
  const dayBuckets = new Map<string, { revenue: number; sales: number }>()
  for (let i = 6; i >= 0; i--) {
    const d = startOfDayNDaysAgo(i)
    dayBuckets.set(d.toISOString().slice(0, 10), { revenue: 0, sales: 0 })
  }
  for (const t of weekOut) {
    const key = t.createdAt.toISOString().slice(0, 10)
    const b = dayBuckets.get(key)
    if (!b) continue
    const price = Number((t.item?.pricing as { unitPrice?: string } | null)?.unitPrice ?? 0)
    b.revenue += price * t.quantity
    b.sales += 1
  }
  const dailyRevenue = [...dayBuckets.entries()].map(([date, v]) => ({
    date,
    revenue: v.revenue.toFixed(2),
    sales: v.sales,
  }))

  // --- inventory ---
  const totalItems = await prisma.item.count()
  const inventories = await prisma.inventory.findMany({
    select: { quantities: true },
  })
  const byLocation: Record<string, number> = { warehouse: 0, point1: 0, point2: 0, point3: 0 }
  let totalUnits = 0
  let lowStockCount = 0
  for (const inv of inventories) {
    const q = (inv.quantities ?? {}) as Record<string, number>
    const sum =
      Number(q.warehouse ?? 0) +
      Number(q.point1 ?? 0) +
      Number(q.point2 ?? 0) +
      Number(q.point3 ?? 0)
    totalUnits += sum
    if (sum === 0) lowStockCount++
    for (const k of Object.keys(byLocation)) {
      byLocation[k] = (byLocation[k] ?? 0) + Number(q[k] ?? 0)
    }
  }

  // --- by material ---
  const mats = await prisma.item.groupBy({
    by: ['material'],
    _count: { _all: true },
  })
  const byMaterial = await Promise.all(
    mats.map(async (m) => {
      // sum units for this material
      const invsForMat = await prisma.inventory.findMany({
        where: { item: { material: m.material } },
        select: { quantities: true },
      })
      let units = 0
      for (const inv of invsForMat) {
        const q = (inv.quantities ?? {}) as Record<string, number>
        units +=
          Number(q.warehouse ?? 0) +
          Number(q.point1 ?? 0) +
          Number(q.point2 ?? 0) +
          Number(q.point3 ?? 0)
      }
      return { material: m.material, items: m._count._all, units }
    }),
  )

  // --- top selling items (last 7 days) ---
  const topAgg = await prisma.transaction.groupBy({
    by: ['itemId'],
    where: { type: 'OUT', createdAt: { gte: weekAgo } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 5,
  })
  const topIds = topAgg.map((t) => t.itemId)
  const topItems = topIds.length
    ? await prisma.item.findMany({
        where: { id: { in: topIds } },
        select: { id: true, sku: true, name: true },
      })
    : []
  const byId = new Map(topItems.map((i) => [i.id, i]))
  const topItemsWeek = topAgg
    .map((t) => {
      const i = byId.get(t.itemId)
      if (!i) return null
      return { id: i.id, sku: i.sku, name: i.name, sold: t._sum.quantity ?? 0 }
    })
    .filter((x): x is { id: string; sku: string; name: string; sold: number } => x !== null)

  return {
    today: {
      sales: todayStats.sales,
      units: todayStats.units,
      revenue: todayStats.revenue.toFixed(2),
    },
    week: { sales: weekStats.sales, units: weekStats.units, revenue: weekStats.revenue.toFixed(2) },
    inventory: { totalItems, totalUnits, byLocation, lowStockCount },
    byMaterial,
    topItemsWeek,
    dailyRevenue,
  }
}

function sumTransactions(
  txs: {
    quantity: number
    item: { pricing: unknown } | null
  }[],
): { sales: number; units: number; revenue: number } {
  let units = 0
  let revenue = 0
  for (const t of txs) {
    units += t.quantity
    const p = (t.item?.pricing as { unitPrice?: string } | null)?.unitPrice
    revenue += Number(p ?? 0) * t.quantity
  }
  return { sales: txs.length, units, revenue }
}

// -----------------------------------------------------------------------------
// Sales history (with filters)
// -----------------------------------------------------------------------------

export type SalesHistoryParams = {
  from?: Date
  to?: Date
  location?: string
  supplierId?: string
  material?: 'GOLD' | 'SILVER' | 'PLATINUM' | 'OTHER'
  take?: number
  skip?: number
}

export async function getSalesHistory(params: SalesHistoryParams) {
  const { from, to, location, supplierId, material, take = 100, skip = 0 } = params
  const whereClause = {
    type: 'OUT' as const,
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: to } : {}),
          },
        }
      : {}),
    ...(supplierId || material
      ? {
          item: {
            ...(supplierId ? { supplierId } : {}),
            ...(material ? { material } : {}),
          },
        }
      : {}),
  }
  const [txs, total] = await Promise.all([
    prisma.transaction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            material: true,
            weight: true,
            pricing: true,
          },
        },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.transaction.count({ where: whereClause }),
  ])
  // Filter by location post-query since location is in movement JSON
  const filtered = location
    ? txs.filter((t) => {
        const m = (t.movement ?? {}) as { from?: string; to?: string }
        return m.from === location
      })
    : txs

  // Compute revenue per transaction
  const withRevenue = filtered.map((t) => {
    const price = Number((t.item?.pricing as { unitPrice?: string } | null)?.unitPrice ?? 0)
    return {
      id: t.id,
      createdAt: t.createdAt,
      quantity: t.quantity,
      reason: t.reason,
      movement: t.movement,
      item: t.item,
      user: t.user,
      unitPrice: price.toFixed(2),
      total: (price * t.quantity).toFixed(2),
    }
  })

  const totalRevenue = withRevenue.reduce((sum, t) => sum + Number(t.total), 0)
  const totalUnits = withRevenue.reduce((sum, t) => sum + t.quantity, 0)

  return {
    transactions: withRevenue,
    total,
    totalRevenue: totalRevenue.toFixed(2),
    totalUnits,
  }
}

// -----------------------------------------------------------------------------
// Low stock — items with total quantity == 0 or 1
// -----------------------------------------------------------------------------

export async function getLowStockItems(threshold = 1, take = 50) {
  const invs = await prisma.inventory.findMany({
    include: {
      item: {
        select: {
          id: true,
          sku: true,
          name: true,
          material: true,
          weight: true,
          pricing: true,
        },
      },
    },
    take: 2000,
  })
  const low = invs
    .map((inv) => {
      const q = (inv.quantities ?? {}) as Record<string, number>
      const sum =
        Number(q.warehouse ?? 0) +
        Number(q.point1 ?? 0) +
        Number(q.point2 ?? 0) +
        Number(q.point3 ?? 0)
      return { inv, sum }
    })
    .filter((x) => x.sum <= threshold)
    .slice(0, take)
  return {
    items: low.map((x) => ({
      id: x.inv.item.id,
      sku: x.inv.item.sku,
      name: x.inv.item.name,
      material: x.inv.item.material,
      weight: x.inv.item.weight,
      pricing: x.inv.item.pricing,
      quantities: x.inv.quantities,
      totalQty: x.sum,
    })),
    threshold,
  }
}
