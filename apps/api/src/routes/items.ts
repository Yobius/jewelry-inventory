import { Hono } from 'hono'
import { type AuthVariables, createAuthMiddleware } from '../lib/auth-middleware.js'
import { createItemSchema, listItemsQuerySchema, updateItemSchema } from '../schemas/item.js'
import { createItem, getItemById, listItems, updateItem } from '../services/items.js'

export function createItemsRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  const auth = createAuthMiddleware(jwtSecret)

  route.use('*', auth)

  route.post('/', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createItemSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const userId = c.get('userId')
    try {
      const item = await createItem(parsed.data, userId)
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

  route.patch('/:id', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = updateItemSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const userId = c.get('userId')
    const item = await updateItem(c.req.param('id'), parsed.data, userId)
    if (!item) return c.json({ error: 'Not found' }, 404)
    return c.json(item)
  })

  return route
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const maybe = err as { code?: unknown }
  return maybe.code === 'P2002'
}
