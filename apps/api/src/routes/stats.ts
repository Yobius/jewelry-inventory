import { Hono } from 'hono'
import { z } from 'zod'
import { type AuthVariables, createAuthMiddleware } from '../lib/auth-middleware.js'
import { getDashboardStats, getLowStockItems, getSalesHistory } from '../services/stats.js'

const salesQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  location: z.enum(['warehouse', 'point1', 'point2', 'point3']).optional(),
  supplierId: z.string().optional(),
  material: z.enum(['GOLD', 'SILVER', 'PLATINUM', 'OTHER']).optional(),
  take: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).default(0),
})

const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).max(100).default(1),
  take: z.coerce.number().int().min(1).max(500).default(50),
})

export function createStatsRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  route.get('/dashboard', async (c) => {
    const stats = await getDashboardStats()
    return c.json(stats)
  })

  route.get('/sales', async (c) => {
    const q = Object.fromEntries(new URL(c.req.url).searchParams)
    const parsed = salesQuerySchema.safeParse(q)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const result = await getSalesHistory({
      from: parsed.data.from ? new Date(parsed.data.from) : undefined,
      to: parsed.data.to ? new Date(parsed.data.to) : undefined,
      location: parsed.data.location,
      supplierId: parsed.data.supplierId,
      material: parsed.data.material,
      take: parsed.data.take,
      skip: parsed.data.skip,
    })
    return c.json(result)
  })

  route.get('/low-stock', async (c) => {
    const q = Object.fromEntries(new URL(c.req.url).searchParams)
    const parsed = lowStockQuerySchema.safeParse(q)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const result = await getLowStockItems(parsed.data.threshold, parsed.data.take)
    return c.json(result)
  })

  return route
}
