import type { MiddlewareHandler } from 'hono'
import { verifyJwt } from './jwt.js'

export type Role = 'ADMIN' | 'MANAGER' | 'SELLER' | 'CASHIER' | 'AUDITOR'

export type AuthVariables = {
  userId: string
  userRole: Role
}

export function createAuthMiddleware(secret: string): MiddlewareHandler<{
  Variables: AuthVariables
}> {
  return async (c, next) => {
    const header = c.req.header('Authorization')
    // Native EventSource cannot set headers, so SSE callers may pass ?token=.
    // For other routes, header is still required.
    const token = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : c.req.query('token')
    if (!token) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401)
    }
    try {
      const payload = await verifyJwt(token, secret)
      c.set('userId', payload.sub)
      c.set('userRole', payload.role as Role)
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }
    await next()
  }
}

/**
 * Require the user to have one of the allowed roles. Use after the auth middleware.
 *   route.use('/bulk-price', requireRole('ADMIN', 'MANAGER'))
 */
export function requireRole(...allowed: Role[]): MiddlewareHandler<{ Variables: AuthVariables }> {
  const set = new Set(allowed)
  return async (c, next) => {
    const role = c.get('userRole')
    if (!role || !set.has(role)) {
      return c.json(
        {
          error: 'Недостатньо прав',
          required: [...set],
          current: role,
        },
        403,
      )
    }
    await next()
  }
}
