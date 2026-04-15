import { prisma } from '@jewelry/db'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { cleanupUser, makeTestApp, registerAndLogin, uniqueSku } from './helpers/app.js'

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

function itemBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sku: uniqueSku(),
    name: 'Gold ring 585',
    specs: { tags: ['ring', 'gold'] },
    material: 'GOLD',
    carat: 585,
    weight: '3.45',
    pricing: { unitPrice: '5000.00', perGram: '1800.00' },
    identification: { qrCode: 'qr-inv', barcode: 'br-inv' },
    initialQuantities: { warehouse: 5, point1: 2, point2: 1, point3: 0 },
    ...overrides,
  }
}

async function auth() {
  const app = makeTestApp()
  const user = await registerAndLogin(app)
  createdUserIds.push(user.id)
  return {
    app,
    token: user.token,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
  }
}

async function createItem(
  app: ReturnType<typeof makeTestApp>,
  headers: Record<string, string>,
  overrides: Partial<Record<string, unknown>> = {},
) {
  const res = await app.request('/api/items', {
    method: 'POST',
    headers,
    body: JSON.stringify(itemBody(overrides)),
  })
  if (res.status !== 201) {
    throw new Error(`createItem failed (${res.status}): ${await res.text()}`)
  }
  return (await res.json()) as { id: string }
}

describe('PATCH /api/inventory/:itemId', () => {
  it('applies an absolute set and writes an audit entry', async () => {
    const { app, headers } = await auth()
    const { id } = await createItem(app, headers)

    const res = await app.request(`/api/inventory/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ warehouse: 10, point2: 7 }),
    })
    expect(res.status).toBe(200)

    const inventory = await prisma.inventory.findUnique({ where: { itemId: id } })
    const quantities = inventory?.quantities as Record<string, number>
    expect(quantities.warehouse).toBe(10)
    expect(quantities.point1).toBe(2)
    expect(quantities.point2).toBe(7)
    expect(quantities.point3).toBe(0)

    const audit = await prisma.auditLog.findMany({
      where: { entityId: id, action: 'inventory.adjust' },
    })
    expect(audit.length).toBeGreaterThanOrEqual(1)
  })

  it('returns 404 for unknown item', async () => {
    const { app, headers } = await auth()
    const res = await app.request('/api/inventory/c0000000000000000000000000', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ warehouse: 5 }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 when no locations are provided', async () => {
    const { app, headers } = await auth()
    const { id } = await createItem(app, headers)
    const res = await app.request(`/api/inventory/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 without token', async () => {
    const app = makeTestApp()
    const res = await app.request('/api/inventory/c0000000000000000000000000', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouse: 5 }),
    })
    expect(res.status).toBe(401)
  })
})
