import { prisma } from '@jewelry/db'
import type { Hono } from 'hono'
import { createApp } from '../../src/app.js'

export const TEST_JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-chars-long!!'

export function makeTestApp(): Hono {
  return createApp({ jwtSecret: TEST_JWT_SECRET })
}

let counter = 0
export function uniqueEmail(prefix = 'phase4'): string {
  counter += 1
  return `test_${prefix}_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 8)}@test.local`
}

export function uniqueSku(prefix = 'SKU'): string {
  counter += 1
  return `TEST_${prefix}_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

export type RegisteredUser = {
  id: string
  email: string
  token: string
}

export async function registerAndLogin(
  app: Hono,
  overrides: Partial<{ email: string; password: string; name: string; role: string }> = {},
): Promise<RegisteredUser> {
  const email = overrides.email ?? uniqueEmail()
  const password = overrides.password ?? 'super-secret-password-123'
  const name = overrides.name ?? 'Test User'
  const role = overrides.role ?? 'ADMIN'

  const res = await app.request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, role }),
  })
  if (res.status !== 201) {
    const text = await res.text()
    throw new Error(`register failed (${res.status}): ${text}`)
  }
  const body = (await res.json()) as { user: { id: string }; token: string }
  return { id: body.user.id, email, token: body.token }
}

/**
 * Hard-delete everything owned by a test user. Cascades take care of Item → Inventory/History.
 * Transactions and audit logs reference users directly and must be deleted first.
 */
export async function cleanupUser(userId: string): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { userId } })
  await prisma.transaction.deleteMany({ where: { userId } })
  await prisma.item.deleteMany({ where: { createdBy: userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
}
