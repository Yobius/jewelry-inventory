import { prisma } from '@jewelry/db'
import { Hono } from 'hono'
import { createJwt } from '../lib/jwt.js'
import { hashPassword, verifyPassword } from '../lib/password.js'
import { loginSchema, registerSchema } from '../schemas/auth.js'

export function createAuthRoute(jwtSecret: string) {
  const route = new Hono()

  route.post('/register', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const { email, password, name, role } = parsed.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return c.json({ error: 'Email already registered' }, 409)
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        name,
        role: role ?? 'SELLER',
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })

    const token = await createJwt({ sub: user.id, role: user.role }, jwtSecret)
    return c.json({ user, token }, 201)
  })

  route.post('/login', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const { email, password } = parsed.data

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }
    const ok = await verifyPassword(user.password, password)
    if (!ok) {
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const token = await createJwt({ sub: user.id, role: user.role }, jwtSecret)
    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
    })
  })

  return route
}
