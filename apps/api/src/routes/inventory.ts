import { Hono } from 'hono'
import { type AuthVariables, createAuthMiddleware } from '../lib/auth-middleware.js'
import { adjustInventorySchema } from '../schemas/inventory.js'
import { InventoryError, adjustInventoryAbsolute } from '../services/inventory.js'

export function createInventoryRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  route.patch('/:itemId', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = adjustInventorySchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    try {
      const inv = await adjustInventoryAbsolute(c.req.param('itemId'), parsed.data, c.get('userId'))
      return c.json(inv)
    } catch (err) {
      if (err instanceof InventoryError && err.code === 'NOT_FOUND') {
        return c.json({ error: 'Inventory not found' }, 404)
      }
      throw err
    }
  })

  return route
}
