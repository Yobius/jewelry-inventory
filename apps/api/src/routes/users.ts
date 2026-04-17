import { prisma } from '@jewelry/db'
import { Hono } from 'hono'
import { z } from 'zod'
import { writeAudit } from '../lib/audit.js'
import { type AuthVariables, createAuthMiddleware, requireRole } from '../lib/auth-middleware.js'
import { hashPassword } from '../lib/password.js'

const roleEnum = z.enum(['ADMIN', 'MANAGER', 'SELLER', 'CASHIER', 'AUDITOR'])

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
  role: roleEnum.default('SELLER'),
})

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: roleEnum.optional(),
})

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
})

export function createUsersRoute(jwtSecret: string) {
  const route = new Hono<{ Variables: AuthVariables }>()
  route.use('*', createAuthMiddleware(jwtSecret))
  // All users endpoints are ADMIN-only
  route.use('*', requireRole('ADMIN'))

  route.get('/', async (c) => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { transactions: true, items: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return c.json({ users })
  })

  route.post('/', async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (existing) {
      return c.json({ error: 'Email already registered' }, 409)
    }
    const passwordHash = await hashPassword(parsed.data.password)
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        password: passwordHash,
        name: parsed.data.name,
        role: parsed.data.role,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    })
    await writeAudit({
      userId: c.get('userId'),
      action: 'user.create',
      entityId: user.id,
      after: user,
    })
    return c.json(user, 201)
  })

  route.patch('/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    const parsed = updateUserSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const before = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true },
    })
    if (!before) return c.json({ error: 'Not found' }, 404)

    // Safety: can't demote the last admin
    if (parsed.data.role && before.role === 'ADMIN' && parsed.data.role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) {
        return c.json({ error: 'Не можна зняти ADMIN з останнього адміністратора' }, 409)
      }
    }

    const after = await prisma.user.update({
      where: { id },
      data: {
        name: parsed.data.name ?? undefined,
        role: parsed.data.role ?? undefined,
      },
      select: { id: true, email: true, name: true, role: true, updatedAt: true },
    })
    await writeAudit({
      userId: c.get('userId'),
      action: 'user.update',
      entityId: id,
      before,
      after,
    })
    return c.json(after)
  })

  route.post('/:id/reset-password', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    const parsed = resetPasswordSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400)
    }
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } })
    if (!user) return c.json({ error: 'Not found' }, 404)
    const hash = await hashPassword(parsed.data.password)
    await prisma.user.update({ where: { id }, data: { password: hash } })
    await writeAudit({
      userId: c.get('userId'),
      action: 'user.reset_password',
      entityId: id,
      metadata: { email: user.email },
    })
    return c.json({ ok: true })
  })

  route.delete('/:id', async (c) => {
    const id = c.req.param('id')
    const selfId = c.get('userId')
    if (id === selfId) {
      return c.json({ error: 'Не можна видалити власний акаунт' }, 409)
    }
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        _count: { select: { transactions: true, items: true } },
      },
    })
    if (!user) return c.json({ error: 'Not found' }, 404)

    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
      if (adminCount <= 1) {
        return c.json({ error: 'Не можна видалити останнього адміністратора' }, 409)
      }
    }
    if (user._count.transactions > 0 || user._count.items > 0) {
      return c.json(
        {
          error:
            'Не можна видалити юзера з транзакціями/товарами. Задай іншу роль замість видалення.',
          transactions: user._count.transactions,
          items: user._count.items,
        },
        409,
      )
    }
    await prisma.user.delete({ where: { id } })
    await writeAudit({
      userId: selfId,
      action: 'user.delete',
      entityId: id,
      metadata: { email: user.email },
    })
    return c.body(null, 204)
  })

  return route
}
