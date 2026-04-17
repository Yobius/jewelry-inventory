import { prisma } from '@jewelry/db'
import { Hono } from 'hono'
import { z } from 'zod'
import { type AuthVariables, createAuthMiddleware, requireRole } from '../lib/auth-middleware.js'
import { emit } from '../lib/events.js'
import {
  bulkPriceSchema,
  createItemSchema,
  listItemsQuerySchema,
  updateItemSchema,
} from '../schemas/item.js'
import {
  bulkUpdatePrice,
  createItem,
  getItemById,
  listItems,
  updateItem,
} from '../services/items.js'

export function createItemsRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  const auth = createAuthMiddleware(jwtSecret)

  route.use('*', auth)

  route.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createItemSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const userId = c.get('userId')
    try {
      const item = await createItem(parsed.data, userId)
      emit({ type: 'item.created', itemId: item.id })
      return c.json(item, 201)
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json({ error: 'SKU already exists' }, 409)
      }
      throw err
    }
  })

  route.get('/', async (c) => {
    const query = Object.fromEntries(new URL(c.req.url).searchParams)
    const parsed = listItemsQuerySchema.safeParse(query)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const [items, total] = await listItems(parsed.data)
    return c.json({ items, total })
  })

  route.get('/:id', async (c) => {
    const item = await getItemById(c.req.param('id'))
    if (!item) return c.json({ error: 'Not found' }, 404)
    return c.json(item)
  })

  route.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = updateItemSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const userId = c.get('userId')
    const item = await updateItem(c.req.param('id'), parsed.data, userId)
    if (!item) return c.json({ error: 'Not found' }, 404)
    emit({ type: 'item.updated', itemId: item.id })
    return c.json(item)
  })

  /**
   * POST /api/items/exists — quick SKU existence check for the Excel import UI.
   * Body: { skus: string[] }  → { existing: string[], missing: string[] }
   */
  route.post('/exists', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = z
      .object({ skus: z.array(z.string().min(1).max(64)).min(1).max(500) })
      .safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const rows = await prisma.item.findMany({
      where: { sku: { in: parsed.data.skus } },
      select: { sku: true },
    })
    const existing = rows.map((r) => r.sku)
    const existingSet = new Set(existing)
    const missing = parsed.data.skus.filter((s) => !existingSet.has(s))
    return c.json({ existing, missing })
  })

  route.post('/bulk-price', requireRole('ADMIN', 'MANAGER'), async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = bulkPriceSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const result = await bulkUpdatePrice(parsed.data, c.get('userId'))
    if (result.refused === 'too_many_rows') {
      return c.json(
        {
          error: `Відмовлено: фільтр зачепить ${result.matched} рядків, що більше за ліміт ${parsed.data.maxRows}. Уточни фільтр або збільш maxRows.`,
          matched: result.matched,
          maxRows: parsed.data.maxRows,
        },
        409,
      )
    }
    return c.json(result)
  })

  return route
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const maybe = err as { code?: unknown }
  return maybe.code === 'P2002'
}
