import { Hono } from 'hono'
import { type AuthVariables, createAuthMiddleware, requireRole } from '../lib/auth-middleware.js'
import { createStoneSchema, listQuerySchema, updateStoneSchema } from '../schemas/reference.js'
import {
  createStone,
  deleteStone,
  getStoneById,
  listStones,
  updateStone,
} from '../services/reference.js'

export function createStonesRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  route.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createStoneSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    try {
      const row = await createStone(parsed.data, c.get('userId'))
      return c.json(row, 201)
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json({ error: 'Камінь з такою назвою вже існує' }, 409)
      }
      throw err
    }
  })

  route.get('/', async (c) => {
    const query = Object.fromEntries(new URL(c.req.url).searchParams)
    const parsed = listQuerySchema.safeParse(query)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const [items, total] = await listStones(parsed.data)
    return c.json({ items, total })
  })

  route.get('/:id', async (c) => {
    const row = await getStoneById(c.req.param('id'))
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })

  route.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = updateStoneSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    try {
      const row = await updateStone(c.req.param('id'), parsed.data, c.get('userId'))
      if (!row) return c.json({ error: 'Not found' }, 404)
      return c.json(row)
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json({ error: 'Камінь з такою назвою вже існує' }, 409)
      }
      throw err
    }
  })

  route.delete('/:id', requireRole('ADMIN'), async (c) => {
    const result = await deleteStone(c.req.param('id'), c.get('userId'))
    if (result.status === 'not-found') return c.json({ error: 'Not found' }, 404)
    if (result.status === 'in-use') {
      return c.json({ error: 'Камінь не можна видалити', itemsCount: result.itemsCount }, 409)
    }
    return c.body(null, 204)
  })

  return route
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}
