import type { MiddlewareHandler } from 'hono'
import { verifyJwt } from './jwt.js'

export type AuthVariables = {
  userId: string
  userRole: string
}

export function createAuthMiddleware(secret: string): MiddlewareHandler<{
  Variables: AuthVariables
}> {
  return async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401)
    }
    const token = header.slice('Bearer '.length)
    try {
      const payload = await verifyJwt(token, secret)
      c.set('userId', payload.sub)
      c.set('userRole', payload.role)
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }
    await next()
  }
}
