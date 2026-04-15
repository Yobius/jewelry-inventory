import { Hono } from 'hono'
import { type AuthVariables, createAuthMiddleware } from '../lib/auth-middleware.js'
import { emit } from '../lib/events.js'
import { createTransactionSchema } from '../schemas/transaction.js'
import { InventoryError } from '../services/inventory.js'
import { listTransactions, recordTransaction } from '../services/transactions.js'

export function createTransactionsRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))

  route.post('/', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createTransactionSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    try {
      const result = await recordTransaction(parsed.data, c.get('userId'))
      if (!result) return c.json({ error: 'Item not found' }, 404)
      emit({
        type: 'transaction.created',
        transactionId: result.id,
        itemId: parsed.data.itemId,
        kind: parsed.data.type,
      })
      return c.json(result, 201)
    } catch (err) {
      if (err instanceof InventoryError) {
        if (err.code === 'NOT_FOUND') return c.json({ error: err.message }, 404)
        if (err.code === 'INSUFFICIENT') return c.json({ error: err.message }, 409)
      }
      throw err
    }
  })

  route.get('/', async (c) => {
    const limitRaw = c.req.query('limit')
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50
    const transactions = await listTransactions(Number.isFinite(limit) ? limit : 50)
    return c.json({ transactions })
  })

  return route
}
