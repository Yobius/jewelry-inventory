import { prisma } from '@jewelry/db'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { cleanupUser, makeTestApp, registerAndLogin, uniqueEmail } from './helpers/app.js'

const createdUserIds: string[] = []

afterEach(async () => {
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop()
    if (id) await cleanupUser(id)
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('POST /auth/register', () => {
  it('creates a user and returns a JWT', async () => {
    const app = makeTestApp()
    const email = uniqueEmail()
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'super-secret-password-123',
        name: 'Alice',
        role: 'MANAGER',
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      user: { id: string; email: string; role: string }
      token: string
    }
    expect(body.user.email).toBe(email)
    expect(body.user.role).toBe('MANAGER')
    expect(body.token).toMatch(/^ey/)
    createdUserIds.push(body.user.id)
  })

  it('rejects duplicate emails with 409', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app)
    createdUserIds.push(user.id)

    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: 'another-password-123',
        name: 'Alice Two',
      }),
    })
    expect(res.status).toBe(409)
  })

  it('rejects short passwords with 400', async () => {
    const app = makeTestApp()
    const res = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: uniqueEmail(),
        password: 'short',
        name: 'Bob',
      }),
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/login', () => {
  it('returns a JWT for correct credentials', async () => {
    const app = makeTestApp()
    const password = 'super-secret-password-123'
    const email = uniqueEmail()
    const register = await app.request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Carol' }),
    })
    expect(register.status).toBe(201)
    const registerBody = (await register.json()) as { user: { id: string } }
    createdUserIds.push(registerBody.user.id)

    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string }
    expect(body.token).toMatch(/^ey/)
  })

  it('rejects wrong password with 401', async () => {
    const app = makeTestApp()
    const user = await registerAndLogin(app, { password: 'real-password-123' })
    createdUserIds.push(user.id)

    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: 'wrong-password-000' }),
    })
    expect(res.status).toBe(401)
  })
})
