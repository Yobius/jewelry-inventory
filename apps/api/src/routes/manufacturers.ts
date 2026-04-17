import { Hono } from 'hono'
import { type AuthVariables, createAuthMiddleware, requireRole } from '../lib/auth-middleware.js'
import {
  createManufacturerSchema,
  listQuerySchema,
  updateManufacturerSchema,
} from '../schemas/reference.js'
import {
  createManufacturer,
  deleteManufacturer,
  getManufacturerById,
  listManufacturers,
  updateManufacturer,
} from '../services/reference.js'

export function createManufacturersRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  route.post('/', requireRole('ADMIN', 'MANAGER'), async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createManufacturerSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    try {
      const row = await createManufacturer(parsed.data, c.get('userId'))
      return c.json(row, 201)
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json({ error: 'Виробник з такою назвою вже існує' }, 409)
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
    const [items, total] = await listManufacturers(parsed.data)
    return c.json({ items, total })
  })

  route.get('/:id', async (c) => {
    const row = await getManufacturerById(c.req.param('id'))
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  })

  route.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = updateManufacturerSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    try {
      const row = await updateManufacturer(c.req.param('id'), parsed.data, c.get('userId'))
      if (!row) return c.json({ error: 'Not found' }, 404)
      return c.json(row)
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json({ error: 'Виробник з такою назвою вже існує' }, 409)
      }
      throw err
    }
  })

  route.delete('/:id', requireRole('ADMIN'), async (c) => {
    const result = await deleteManufacturer(c.req.param('id'), c.get('userId'))
    if (result.status === 'not-found') return c.json({ error: 'Not found' }, 404)
    if (result.status === 'in-use') {
      return c.json({ error: 'Виробника не можна видалити', itemsCount: result.itemsCount }, 409)
    }
    return c.body(null, 204)
  })

  return route
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
}
